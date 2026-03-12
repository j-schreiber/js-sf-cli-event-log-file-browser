import * as fs from 'node:fs';
import * as path from 'node:path';
import { Connection } from '@salesforce/core';
import { EventLogFileRecord, EventLogManifest, ManifestFileEntry, FetchedFile } from '../types/eventLogTypes.js';
import { formatDate, sanitizeForPath } from '../utils/formatters.js';
import { ensureDirectory, sleep } from '../utils/fileUtils.js';

const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;

/**
 * Downloads a file with retry logic using recursive approach.
 * Uses native fetch to get raw CSV content (connection.request auto-parses CSV to JSON).
 */
export async function downloadWithRetry(
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
export async function downloadFile(
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

    // Update manifest (intentional mutation for tracking downloads)
    const entry: ManifestFileEntry = {
      eventType: record.EventType,
      logDate: formatDate(record.LogDate),
      fileName,
      downloadedAt: new Date().toISOString(),
      size: fileSize,
    };
    // eslint-disable-next-line no-param-reassign
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
