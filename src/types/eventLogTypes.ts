/**
 * Salesforce EventLogFile record type.
 * Represents a single event log file from the EventLogFile object.
 */
export type EventLogFileRecord = {
  Id: string;
  EventType: string;
  LogDate: string;
  LogFileLength: number;
  CreatedDate: string;
  Interval?: string;
};

/**
 * Individual file entry in the manifest.
 * Tracks metadata about a downloaded event log file.
 */
export type ManifestFileEntry = {
  eventType: string;
  logDate: string;
  fileName: string;
  downloadedAt: string;
  size: number;
};

/**
 * Manifest file structure for tracking downloaded event log files.
 * Stored as .eventlog-manifest.json in the output directory.
 */
export type EventLogManifest = {
  version: string;
  orgId: string;
  lastFetch: string;
  files: Record<string, ManifestFileEntry>;
};

/**
 * Status of an individual file in the fetch result.
 */
export type FetchedFile = {
  id: string;
  eventType: string;
  logDate: string;
  fileName: string;
  size: number;
  status: 'downloaded' | 'skipped' | 'failed';
  error?: string;
};

/**
 * Result type for the eventlog fetch command.
 */
export type EventLogFetchResult = {
  outputDir: string;
  orgId: string;
  totalFiles: number;
  downloadedFiles: number;
  skippedFiles: number;
  failedFiles: number;
  totalBytesDownloaded: number;
  files: FetchedFile[];
};

/**
 * Query filters for EventLogFile queries.
 */
export type QueryFilters = {
  eventType?: string;
  lastNDays?: number;
};
