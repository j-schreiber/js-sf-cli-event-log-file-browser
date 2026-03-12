import * as fs from 'node:fs';
import * as path from 'node:path';
import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Connection, Messages } from '@salesforce/core';
import { MultiStageOutput } from '@oclif/multi-stage-output';
import {
  EventLogFileRecord,
  EventLogManifest,
  ManifestFileEntry,
  EventLogFetchResult,
  FetchedFile,
} from '../../types/eventLogTypes.js';

export type { EventLogFetchResult };

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('@j-schreiber/sf-cli-event-log-browser', 'eventlog.fetch');

const MANIFEST_FILENAME = '.eventlog-manifest.json';
const MANIFEST_VERSION = '1.0';
const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;

/**
 * Semaphore for controlling concurrent downloads.
 */
class Semaphore {
  private queue: Array<() => void> = [];
  private running = 0;

  public constructor(private maxConcurrent: number) {}

  public async acquire(): Promise<void> {
    if (this.running < this.maxConcurrent) {
      this.running++;
      return;
    }
    return new Promise<void>((resolve) => {
      this.queue.push(() => {
        this.running++;
        resolve();
      });
    });
  }

  public release(): void {
    this.running--;
    const next = this.queue.shift();
    if (next) {
      next();
    }
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(isoDate: string): string {
  return isoDate.split('T')[0];
}

/**
 * Sanitizes a string for use as a directory or file name.
 * Removes characters that are invalid in file paths.
 */
function sanitizeForPath(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, '_');
}

/**
 * Sleeps for the specified number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Ensures a directory exists, creating it recursively if needed.
 */
function ensureDirectory(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    try {
      fs.mkdirSync(dirPath, { recursive: true });
    } catch (error) {
      throw new Error(messages.getMessage('error.createDirectory', [(error as Error).message]));
    }
  }
}

/**
 * Queries EventLogFile records from Salesforce.
 */
async function queryEventLogFiles(
  connection: Connection,
  eventType: string | undefined,
  lastNDays: number
): Promise<EventLogFileRecord[]> {
  const whereConditions: string[] = [];

  if (eventType) {
    whereConditions.push(`EventType = '${eventType}'`);
  }

  if (lastNDays) {
    whereConditions.push(`LogDate = LAST_N_DAYS:${lastNDays}`);
  }

  const whereClause = whereConditions.length > 0 ? ` WHERE ${whereConditions.join(' AND ')}` : '';

  const query = `SELECT Id, EventType, LogDate, LogFileLength, CreatedDate FROM EventLogFile${whereClause} ORDER BY LogDate DESC, EventType ASC`;

  const result = await connection.query<EventLogFileRecord>(query);
  return result.records;
}

/**
 * Creates an empty manifest structure.
 */
function createEmptyManifest(orgId: string): EventLogManifest {
  return {
    version: MANIFEST_VERSION,
    orgId,
    lastFetch: new Date().toISOString(),
    files: {},
  };
}

/**
 * Filters records to only those that need to be downloaded.
 */
function filterFilesToDownload(
  records: EventLogFileRecord[],
  manifest: EventLogManifest,
  force: boolean
): EventLogFileRecord[] {
  if (force) {
    return records;
  }
  return records.filter((record) => !manifest.files[record.Id]);
}

/**
 * Saves manifest to disk.
 */
function saveManifest(manifestPath: string, manifest: EventLogManifest): void {
  const updatedManifest = { ...manifest, lastFetch: new Date().toISOString() };
  fs.writeFileSync(manifestPath, JSON.stringify(updatedManifest, null, 2));
}

/**
 * Creates an empty fetch result.
 */
function createEmptyResult(outputDir: string, orgId: string): EventLogFetchResult {
  return {
    outputDir,
    orgId,
    totalFiles: 0,
    downloadedFiles: 0,
    skippedFiles: 0,
    failedFiles: 0,
    totalBytesDownloaded: 0,
    files: [],
  };
}

/**
 * Creates a result when all files are skipped (already in manifest).
 */
function createResultFromManifest(
  outputDir: string,
  orgId: string,
  records: EventLogFileRecord[],
  manifest: EventLogManifest
): EventLogFetchResult {
  const files: FetchedFile[] = records.map((record) => {
    const entry = manifest.files[record.Id];
    return {
      id: record.Id,
      eventType: record.EventType,
      logDate: formatDate(record.LogDate),
      fileName: entry?.fileName ?? '',
      size: entry?.size ?? 0,
      status: 'skipped' as const,
    };
  });

  return {
    outputDir,
    orgId,
    totalFiles: records.length,
    downloadedFiles: 0,
    skippedFiles: records.length,
    failedFiles: 0,
    totalBytesDownloaded: 0,
    files,
  };
}

/**
 * Builds the final result from all records and download results.
 */
function buildResult(
  outputDir: string,
  orgId: string,
  allRecords: EventLogFileRecord[],
  downloadResults: FetchedFile[],
  manifest: EventLogManifest
): EventLogFetchResult {
  // Create a map of downloaded/failed files
  const downloadedMap = new Map(downloadResults.map((r) => [r.id, r]));

  // Build the complete files list
  const files: FetchedFile[] = allRecords.map((record) => {
    const downloaded = downloadedMap.get(record.Id);
    if (downloaded) {
      return downloaded;
    }

    // File was skipped (already in manifest)
    const entry = manifest.files[record.Id];
    return {
      id: record.Id,
      eventType: record.EventType,
      logDate: formatDate(record.LogDate),
      fileName: entry?.fileName ?? '',
      size: entry?.size ?? 0,
      status: 'skipped' as const,
    };
  });

  const downloadedFiles = files.filter((f) => f.status === 'downloaded');
  const skippedFiles = files.filter((f) => f.status === 'skipped');
  const failedFiles = files.filter((f) => f.status === 'failed');
  const totalBytesDownloaded = downloadedFiles.reduce((sum, f) => sum + f.size, 0);

  return {
    outputDir,
    orgId,
    totalFiles: allRecords.length,
    downloadedFiles: downloadedFiles.length,
    skippedFiles: skippedFiles.length,
    failedFiles: failedFiles.length,
    totalBytesDownloaded,
    files,
  };
}

/**
 * Downloads a file with retry logic using recursive approach.
 * Uses native fetch to get raw CSV content (connection.request auto-parses CSV to JSON).
 */
async function downloadWithRetry(
  connection: Connection,
  recordId: string,
  attempt = 0,
  lastError?: Error
): Promise<string> {
  if (attempt >= MAX_RETRIES) {
    throw lastError ?? new Error('Download failed after retries');
  }

  try {
    const accessToken = connection.accessToken;
    if (!accessToken) {
      throw new Error('No access token available for connection');
    }
    const url = `${connection.baseUrl()}/sobjects/EventLogFile/${recordId}/LogFile`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'text/csv',
      },
    });

    if (!response.ok) {
      const error = new Error(`HTTP ${response.status}: ${response.statusText}`) as Error & { statusCode: number };
      error.statusCode = response.status;
      throw error;
    }

    return await response.text();
  } catch (error) {
    const currentError = error as Error;
    const statusCode = (error as { statusCode?: number }).statusCode;

    // Check for rate limiting (429) or if we have retries left
    if (statusCode === 429 || attempt < MAX_RETRIES - 1) {
      const backoffMs = INITIAL_BACKOFF_MS * Math.pow(2, attempt);
      await sleep(backoffMs);
    }

    return downloadWithRetry(connection, recordId, attempt + 1, currentError);
  }
}

/**
 * Downloads a single event log file and updates the manifest.
 */
async function downloadFile(
  connection: Connection,
  record: EventLogFileRecord,
  outputDir: string,
  manifest: EventLogManifest
): Promise<FetchedFile> {
  const eventTypeDir = path.join(outputDir, sanitizeForPath(record.EventType));
  const fileName = `${sanitizeForPath(record.EventType)}_${formatDate(record.LogDate)}_${record.Id}.csv`;
  const filePath = path.join(eventTypeDir, fileName);
  const tempFilePath = `${filePath}.tmp`;

  // Ensure event type directory exists
  ensureDirectory(eventTypeDir);

  try {
    const content = await downloadWithRetry(connection, record.Id);

    // Write to temp file first, then rename
    fs.writeFileSync(tempFilePath, content);
    fs.renameSync(tempFilePath, filePath);

    const fileSize = fs.statSync(filePath).size;

    // Update manifest
    const entry: ManifestFileEntry = {
      eventType: record.EventType,
      logDate: formatDate(record.LogDate),
      fileName,
      downloadedAt: new Date().toISOString(),
      size: fileSize,
    };
    manifest.files[record.Id] = entry;

    return {
      id: record.Id,
      eventType: record.EventType,
      logDate: formatDate(record.LogDate),
      fileName,
      size: fileSize,
      status: 'downloaded',
    };
  } catch (error) {
    // Clean up temp file if it exists
    if (fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }

    return {
      id: record.Id,
      eventType: record.EventType,
      logDate: formatDate(record.LogDate),
      fileName,
      size: 0,
      status: 'failed',
      error: (error as Error).message,
    };
  }
}

type MsoData = { downloadedCount: number; totalCount: number; downloadedBytes: number };

export default class EventLogFetch extends SfCommand<EventLogFetchResult> {
  public static readonly summary = messages.getMessage('summary');
  public static readonly description = messages.getMessage('description');
  public static readonly examples = messages.getMessages('examples');

  public static readonly flags = {
    'target-org': Flags.requiredOrg({
      summary: messages.getMessage('flags.target-org.summary'),
      char: 'o',
      required: true,
    }),
    'api-version': Flags.orgApiVersion(),
    'output-dir': Flags.directory({
      summary: messages.getMessage('flags.output-dir.summary'),
      char: 'd',
      required: true,
    }),
    'event-type': Flags.string({
      summary: messages.getMessage('flags.event-type.summary'),
      char: 'e',
    }),
    'last-n-days': Flags.integer({
      summary: messages.getMessage('flags.last-n-days.summary'),
      char: 'n',
      min: 1,
      default: 30,
    }),
    concurrency: Flags.integer({
      summary: messages.getMessage('flags.concurrency.summary'),
      char: 'c',
      min: 1,
      max: 10,
      default: 3,
    }),
    force: Flags.boolean({
      summary: messages.getMessage('flags.force.summary'),
      char: 'f',
      default: false,
    }),
  };

  private mso: MultiStageOutput<MsoData> | undefined;

  public async run(): Promise<EventLogFetchResult> {
    const { flags } = await this.parse(EventLogFetch);
    const connection = flags['target-org'].getConnection(flags['api-version']);
    const orgId = flags['target-org'].getOrgId();
    const outputDir = path.resolve(flags['output-dir']);

    // Initialize multi-stage output if not in JSON mode
    if (!this.jsonEnabled()) {
      this.mso = new MultiStageOutput<MsoData>({
        title: 'Fetching Event Log Files',
        stages: ['Querying event log files', 'Analyzing local cache', 'Downloading files', 'Updating manifest'],
        jsonEnabled: false,
        stageSpecificBlock: [
          {
            stage: 'Downloading files',
            type: 'static-key-value',
            label: 'Progress',
            get: (data): string | undefined => {
              if (!data) return undefined;
              return `${data.downloadedCount}/${data.totalCount} files (${formatFileSize(data.downloadedBytes)})`;
            },
          },
        ],
      });
    }

    try {
      // Ensure output directory exists
      ensureDirectory(outputDir);

      // Stage 1: Query event log files
      this.mso?.goto('Querying event log files');
      const records = await queryEventLogFiles(connection, flags['event-type'], flags['last-n-days']);

      if (records.length === 0) {
        // Save empty manifest even when no records found
        const manifestPath = path.join(outputDir, MANIFEST_FILENAME);
        const manifest = this.loadManifest(manifestPath, orgId, false);
        saveManifest(manifestPath, manifest);
        this.mso?.stop();
        this.log(messages.getMessage('info.noNewFiles'));
        return createEmptyResult(outputDir, orgId);
      }

      // Stage 2: Load and analyze manifest
      this.mso?.goto('Analyzing local cache');
      const manifestPath = path.join(outputDir, MANIFEST_FILENAME);
      const manifest = this.loadManifest(manifestPath, orgId, flags.force);

      // Filter files to download
      const filesToDownload = filterFilesToDownload(records, manifest, flags.force);

      if (filesToDownload.length === 0) {
        // Update lastFetch timestamp even when no new files to download
        saveManifest(manifestPath, manifest);
        this.mso?.stop();
        this.log(messages.getMessage('info.noNewFiles'));
        return createResultFromManifest(outputDir, orgId, records, manifest);
      }

      // Stage 3: Download files
      this.mso?.goto('Downloading files');
      const downloadResults = await this.downloadFiles(
        connection,
        filesToDownload,
        outputDir,
        flags.concurrency,
        manifest
      );

      // Stage 4: Update manifest
      this.mso?.goto('Updating manifest');
      saveManifest(manifestPath, manifest);
      this.mso?.stop();

      // Build final result
      const result = buildResult(outputDir, orgId, records, downloadResults, manifest);

      // Output summary
      if (!this.jsonEnabled()) {
        this.logSummary(result);
      }

      return result;
    } catch (error) {
      this.mso?.stop('failed');
      throw error;
    }
  }

  private loadManifest(manifestPath: string, currentOrgId: string, force: boolean): EventLogManifest {
    if (!fs.existsSync(manifestPath)) {
      return createEmptyManifest(currentOrgId);
    }

    try {
      const content = fs.readFileSync(manifestPath, 'utf-8');
      const manifest = JSON.parse(content) as EventLogManifest;

      // Check org ID mismatch
      if (manifest.orgId !== currentOrgId && !force) {
        this.warn(messages.getMessage('info.manifestOrgMismatch', [manifest.orgId, currentOrgId]));
      }

      return manifest;
    } catch {
      // Backup corrupted manifest and create new one
      this.warn(messages.getMessage('error.manifestCorrupted'));
      const backupPath = `${manifestPath}.backup.${Date.now()}`;
      if (fs.existsSync(manifestPath)) {
        fs.renameSync(manifestPath, backupPath);
      }
      return createEmptyManifest(currentOrgId);
    }
  }

  private async downloadFiles(
    connection: Connection,
    records: EventLogFileRecord[],
    outputDir: string,
    concurrency: number,
    manifest: EventLogManifest
  ): Promise<FetchedFile[]> {
    const semaphore = new Semaphore(concurrency);
    const results: FetchedFile[] = [];
    let downloadedCount = 0;
    let downloadedBytes = 0;

    this.mso?.updateData({ downloadedCount: 0, totalCount: records.length, downloadedBytes: 0 });

    const downloadPromises = records.map(async (record) => {
      await semaphore.acquire();
      try {
        const result = await downloadFile(connection, record, outputDir, manifest);
        results.push(result);
        if (result.status === 'downloaded') {
          downloadedCount++;
          downloadedBytes += result.size;
          this.mso?.updateData({ downloadedCount, totalCount: records.length, downloadedBytes });
        }
      } finally {
        semaphore.release();
      }
    });

    await Promise.all(downloadPromises);
    return results;
  }

  private logSummary(result: EventLogFetchResult): void {
    if (result.downloadedFiles > 0) {
      this.log(
        messages.getMessage('info.downloadComplete', [result.downloadedFiles, formatFileSize(result.totalBytesDownloaded)])
      );
    }

    if (result.skippedFiles > 0) {
      this.log(messages.getMessage('info.skippedFiles', [result.skippedFiles]));
    }

    if (result.failedFiles > 0) {
      const failedFilesList = result.files.filter((f) => f.status === 'failed');
      for (const file of failedFilesList) {
        this.warn(messages.getMessage('error.downloadFailed', [file.id, file.error ?? 'Unknown error']));
      }
    }
  }
}
