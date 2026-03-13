import * as path from 'node:path';
import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Connection, Messages } from '@salesforce/core';
import { MultiStageOutput } from '@oclif/multi-stage-output';
import { EventLogFileRecord, EventLogManifest, EventLogFetchResult, FetchedFile } from '../../types/eventLogTypes.js';
import { queryEventLogFiles } from '../../services/EventLogQueryService.js';
import { downloadFile } from '../../services/EventLogDownloadService.js';
import {
  MANIFEST_FILENAME,
  loadManifest,
  saveManifest,
  filterFilesToDownload,
} from '../../services/ManifestService.js';
import { formatFileSize, formatDate } from '../../utils/formatters.js';
import { ensureDirectory } from '../../utils/fileUtils.js';
import { Semaphore } from '../../utils/Semaphore.js';

export type { EventLogFetchResult };

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('@j-schreiber/sf-cli-event-log-browser', 'eventlog.fetch');

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
      const records = await queryEventLogFiles(connection, {
        eventType: flags['event-type'],
        lastNDays: flags['last-n-days'],
      });

      if (records.length === 0) {
        // Save empty manifest even when no records found
        const manifestPath = path.join(outputDir, MANIFEST_FILENAME);
        const manifest = loadManifest(manifestPath, orgId, (msg) => this.warn(msg));
        saveManifest(manifestPath, manifest);
        this.mso?.stop();
        this.log(messages.getMessage('info.noNewFiles'));
        return createEmptyResult(outputDir, orgId);
      }

      // Stage 2: Load and analyze manifest
      this.mso?.goto('Analyzing local cache');
      const manifestPath = path.join(outputDir, MANIFEST_FILENAME);
      const manifest = loadManifest(manifestPath, orgId, (msg) => this.warn(msg));

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
