# PRD: Event Log Fetch Command

## Overview

A new `sf eventlog fetch` command that automatically retrieves Salesforce Event Log Files that have not yet been downloaded to the local filesystem. The command tracks downloaded files to avoid redundant downloads and displays real-time progress using oclif's multi-stage output component.

## Problem Statement

Salesforce Event Log Files provide valuable insights into org activity but must be manually downloaded one at a time through the UI or API. Organizations that need historical event data for compliance, security auditing, or analytics require an automated way to continuously fetch new log files without re-downloading existing ones.

## User Stories

### Primary User Story

As a Salesforce administrator, I want to automatically download all event log files that I haven't downloaded yet, so that I can maintain a complete local archive of org events without manual intervention.

### Secondary User Stories

- As a DevOps engineer, I want to schedule periodic event log fetches, so that my analytics pipeline always has the latest data.
- As a security analyst, I want to filter which event types are downloaded, so that I only retrieve security-relevant logs.
- As a DevOps engineer, I want clear progress feedback during long downloads, so that I know the operation is working correctly.

## Command Specification

### Command Signature

```
sf eventlog fetch --target-org <alias> --output-dir <path> [OPTIONS]
```

### Flags

| Flag            | Short | Type    | Required | Default | Description                                            |
| --------------- | ----- | ------- | -------- | ------- | ------------------------------------------------------ |
| `--target-org`  | `-o`  | string  | Yes      | -       | Salesforce org alias or username                       |
| `--output-dir`  | `-d`  | string  | Yes      | -       | Directory to store downloaded event log files          |
| `--event-type`  | `-e`  | string  | No       | -       | Filter by event type (e.g., Login, API, ApexExecution) |
| `--last-n-days` | `-n`  | integer | No       | 30      | Number of days of log history to consider              |
| `--api-version` | -     | string  | No       | -       | Override the default API version                       |
| `--concurrency` | `-c`  | integer | No       | 3       | Number of parallel downloads (1-10)                    |
| `--force`       | `-f`  | boolean | No       | false   | Re-download files even if they exist locally           |

### Command Examples

```bash
# Fetch all new event logs to the ./logs directory
sf eventlog fetch --target-org myOrg --output-dir ./logs

# Fetch only Login and API event types
sf eventlog fetch --target-org myOrg --output-dir ./logs --event-type Login

# Fetch with higher concurrency for faster downloads
sf eventlog fetch --target-org myOrg --output-dir ./logs --concurrency 5

# Force re-download all files from the last 7 days
sf eventlog fetch --target-org myOrg --output-dir ./logs --last-n-days 7 --force
```

## Technical Design

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     sf eventlog fetch                           │
├─────────────────────────────────────────────────────────────────┤
│  1. Query EventLogFile records from Salesforce                  │
│  2. Load local manifest (tracking file)                         │
│  3. Compare remote vs local to determine delta                  │
│  4. Download missing files with concurrency control             │
│  5. Update manifest with newly downloaded files                 │
│  6. Display progress using multi-stage output                   │
└─────────────────────────────────────────────────────────────────┘
```

### File Tracking Mechanism

A manifest file (`.eventlog-manifest.json`) stored in the output directory tracks downloaded files:

```json
{
  "version": "1.0",
  "orgId": "00D000000000001",
  "lastFetch": "2024-01-15T10:30:00.000Z",
  "files": {
    "0AT000000000001": {
      "eventType": "Login",
      "logDate": "2024-01-15",
      "fileName": "Login_2024-01-15_0AT000000000001.csv",
      "downloadedAt": "2024-01-15T10:30:00.000Z",
      "size": 15234
    }
  }
}
```

**Why a manifest file?**

- Survives file renames/moves within the directory
- Stores metadata without parsing file contents
- Enables quick lookup by EventLogFile ID
- Supports multi-org scenarios (orgId scoped)

### Output Directory Structure

```
./logs/
├── .eventlog-manifest.json
├── Login/
│   ├── Login_2024-01-15_0AT000000000001.csv
│   └── Login_2024-01-14_0AT000000000002.csv
├── API/
│   └── API_2024-01-15_0AT000000000003.csv
└── ApexExecution/
    └── ApexExecution_2024-01-15_0AT000000000004.csv
```

**File naming convention:**

```
{EventType}_{LogDate}_{Id}.csv
```

### Multi-Stage Progress Display

Using `@oclif/multi-stage-output` for visual feedback:

```
Fetching Event Logs from myOrg
├─ Querying event log files  ✓ 2.3s
├─ Analyzing local cache     ✓ 0.1s
├─ Downloading files         ◐ 45s
│  └─ Progress: 23/47 files (48.9%)
│     ├─ Current: Login_2024-01-15.csv (234 KB)
│     └─ Downloaded: 12.4 MB
└─ Updating manifest         ○ pending
```

**Stages:**

1. **Querying event log files** - SOQL query to get available logs
2. **Analyzing local cache** - Compare manifest with query results
3. **Downloading files** - Parallel file downloads with progress
4. **Updating manifest** - Save updated tracking information

### Download Implementation

```typescript
// Pseudocode for parallel download with concurrency control
async function downloadFiles(
  connection: Connection,
  files: EventLogFileRecord[],
  outputDir: string,
  concurrency: number
): Promise<DownloadResult[]> {
  const semaphore = new Semaphore(concurrency);

  return Promise.all(
    files.map(async (file) => {
      await semaphore.acquire();
      try {
        const content = await connection.request(`/sobjects/EventLogFile/${file.Id}/LogFile`);
        await writeFile(getFilePath(outputDir, file), content);
        return { id: file.Id, success: true };
      } catch (error) {
        return { id: file.Id, success: false, error };
      } finally {
        semaphore.release();
      }
    })
  );
}
```

### API Interaction

**EventLogFile query:**

```sql
SELECT Id, EventType, LogDate, LogFileLength, CreatedDate, Interval
FROM EventLogFile
WHERE LogDate = LAST_N_DAYS:{n}
  AND EventType = '{eventType}'  -- if specified
  AND Interval = '{interval}'    -- if specified
ORDER BY LogDate DESC, EventType ASC
```

**Log file download:**

```
GET /services/data/v{version}/sobjects/EventLogFile/{id}/LogFile
```

Returns CSV content of the event log file.

## Result Type

```typescript
export type EventLogFetchResult = {
  totalAvailable: number; // Total files matching query
  alreadyDownloaded: number; // Files skipped (in manifest)
  newlyDownloaded: number; // Files downloaded this run
  failed: number; // Files that failed to download
  totalBytes: number; // Total bytes downloaded
  outputDirectory: string; // Absolute path to output dir
  files: FetchedFile[]; // Details of each file processed
};

export type FetchedFile = {
  id: string;
  eventType: string;
  logDate: string;
  fileName: string;
  status: 'downloaded' | 'skipped' | 'failed';
  size?: number;
  error?: string;
};
```

## Error Handling

| Scenario                        | Behavior                                       |
| ------------------------------- | ---------------------------------------------- |
| Output directory doesn't exist  | Create it (with parent directories)            |
| No write permission             | Throw error with clear message                 |
| Network timeout during download | Retry 3 times with exponential backoff         |
| Individual file download fails  | Continue with other files, report in summary   |
| Manifest file corrupted         | Backup and recreate, re-download all           |
| EventLogFile API returns 403    | Skip file, warn about Event Monitoring license |
| Org rate limit exceeded         | Pause and retry with backoff                   |

## Edge Cases

1. **Empty result set**: Display informational message, create empty manifest
2. **Partial download (interrupted)**: Resume-friendly - manifest only updated for successful downloads
3. **Concurrent command runs**: File-level locking on manifest to prevent corruption
4. **Very large files**: Stream to disk instead of buffering in memory
5. **Special characters in event type**: Sanitize directory/file names

## Dependencies

### New Dependencies

```json
{
  "@oclif/multi-stage-output": "^0.8.x"
}
```

### Existing Dependencies (already in project)

- `@oclif/core` - CLI framework
- `@salesforce/core` - Salesforce API connection
- `@salesforce/sf-plugins-core` - SfCommand base class

## Testing Strategy

### Unit Tests (`eventlog/fetch.test.ts`)

- Query building with various flag combinations
- Manifest loading and parsing
- Delta calculation (remote vs local comparison)
- File naming and path generation
- Error handling for various failure scenarios
- Concurrency control behavior

### Integration Tests (`eventlog/fetch.nut.ts`)

- End-to-end download to temp directory
- Idempotency (second run downloads nothing new)
- Force flag re-downloads files
- Large file handling
- Concurrent download verification

### Test Data Requirements

- Scratch org with Event Monitoring enabled
- Pre-seeded event log files (may require specific actions in scratch org)

## Security Considerations

1. **Credential handling**: Use existing Salesforce CLI auth, no additional credentials stored
2. **File permissions**: Downloaded files inherit parent directory permissions
3. **Manifest contents**: Contains only IDs and metadata, no sensitive data
4. **Path traversal**: Sanitize event type names to prevent directory escape

## Performance Targets

| Metric              | Target                                    |
| ------------------- | ----------------------------------------- |
| Query execution     | < 5 seconds                               |
| Manifest comparison | < 1 second for 10,000 entries             |
| Download throughput | Limited by network, not CPU               |
| Memory usage        | < 100MB regardless of total download size |

## Future Enhancements (Out of Scope)

1. **Compression**: Download and store as gzip
2. **Format conversion**: Convert CSV to Parquet/JSON
3. **Cloud storage**: Upload directly to S3/GCS
4. **Scheduling**: Built-in cron-like scheduling
5. **Incremental sync**: Real-time streaming of new logs

## Implementation Phases

### Phase 1: Core Functionality

- Basic command with output-dir flag
- Simple file tracking via manifest
- Sequential downloads
- Basic progress output

### Phase 2: Enhanced UX

- Multi-stage progress display
- Parallel downloads with concurrency control
- Detailed summary output

### Phase 3: Robustness

- Retry logic with backoff
- Large file streaming
- Manifest corruption recovery

## Files to Create/Modify

| File                                   | Action | Description                              |
| -------------------------------------- | ------ | ---------------------------------------- |
| `src/commands/eventlog/fetch.ts`       | Create | Main command implementation              |
| `messages/eventlog.fetch.md`           | Create | i18n messages                            |
| `test/commands/eventlog/fetch.test.ts` | Create | Unit tests                               |
| `test/commands/eventlog/fetch.nut.ts`  | Create | Integration tests                        |
| `package.json`                         | Modify | Add @oclif/multi-stage-output dependency |

## Success Metrics

1. **Functional**: Command successfully downloads all new event log files
2. **Idempotent**: Re-running command does not re-download existing files
3. **Resumable**: Interrupted downloads can be resumed without data loss
4. **Observable**: Progress is clearly visible throughout execution
5. **Performant**: Parallel downloads maximize throughput
