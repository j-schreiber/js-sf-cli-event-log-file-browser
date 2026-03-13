# Implementation Plan: `sf eventlog fetch` Command

## Overview

Implement a new command that downloads Salesforce Event Log Files that haven't been downloaded yet, tracks them via a manifest file, and shows progress using multi-stage output.

## Files to Create

| File | Purpose |
|------|---------|
| `src/lib/eventLogService.ts` | Shared query building, types, and formatting utilities |
| `src/lib/eventLogManifest.ts` | Manifest file management (load/save/update) |
| `src/commands/eventlog/fetch.ts` | Main command implementation |
| `messages/eventlog.fetch.md` | i18n messages |
| `test/commands/eventlog/fetch.test.ts` | Unit tests |
| `test/commands/eventlog/fetch.nut.ts` | Integration tests |

## Files to Modify

| File | Change |
|------|--------|
| `package.json` | Add `@oclif/multi-stage-output` dependency |
| `src/commands/eventlog/list.ts` | Refactor to use shared library |
| `test/advancedTestContext.ts` | Add HTTP request stubbing for LogFile downloads |

## Implementation Steps

### Phase 0: Refactoring (Extract Shared Library)

**Step 0.1: Create shared event log service** (`src/lib/eventLogService.ts`)

Extract from `list.ts`:
- `EventLogFileRecord` type
- `formatFileSize()` helper function
- `formatDate()` helper function
- `buildEventLogQuery()` function - encapsulates SOQL query building with optional filters

```typescript
// src/lib/eventLogService.ts
import { Connection } from '@salesforce/core';

export type EventLogFileRecord = {
  Id: string;
  EventType: string;
  LogDate: string;
  LogFileLength: number;
  CreatedDate: string;
  Interval?: string;
};

export type EventLogQueryOptions = {
  eventType?: string;
  lastNDays?: number;
  interval?: string;
};

export function buildEventLogQuery(options: EventLogQueryOptions): string {
  const whereConditions: string[] = [];
  if (options.eventType) {
    whereConditions.push(`EventType = '${options.eventType}'`);
  }
  if (options.lastNDays) {
    whereConditions.push(`LogDate = LAST_N_DAYS:${options.lastNDays}`);
  }
  if (options.interval) {
    whereConditions.push(`Interval = '${options.interval}'`);
  }
  const whereClause = whereConditions.length > 0 ? ` WHERE ${whereConditions.join(' AND ')}` : '';
  return `SELECT Id, EventType, LogDate, LogFileLength, CreatedDate, Interval FROM EventLogFile${whereClause} ORDER BY LogDate DESC, EventType ASC`;
}

export async function queryEventLogFiles(
  connection: Connection,
  options: EventLogQueryOptions
): Promise<EventLogFileRecord[]> {
  const query = buildEventLogQuery(options);
  const result = await connection.query<EventLogFileRecord>(query);
  return result.records;
}

export function formatFileSize(bytes: number): string { /* ... */ }
export function formatDate(isoDate: string): string { /* ... */ }
```

**Step 0.2: Refactor list command** (`src/commands/eventlog/list.ts`)

Update to use shared library:
```typescript
import { EventLogFileRecord, queryEventLogFiles, formatFileSize, formatDate } from '../../lib/eventLogService.js';

// In run():
const records = await queryEventLogFiles(connection, {
  eventType: flags['event-type'],
  lastNDays: flags['last-n-days'],
});
```

**Step 0.3: Verify refactoring**
- Run `yarn build` to ensure compilation succeeds
- Run `yarn test:only` to ensure existing tests pass
- Manual test: `./bin/run.js eventlog list --target-org <alias>`

---

### Phase 1: Core Functionality

**Step 1: Create manifest service** (`src/lib/eventLogManifest.ts`)
- `EventLogManifest` type - manifest file structure
- `ManifestFileEntry` type - individual file entry
- `EventLogFetchResult` type - command result
- `FetchedFile` type - individual file status
- `EventLogManifestService` class:
  - `load()` - load manifest from disk (create if missing)
  - `save()` - save manifest atomically
  - `isDownloaded(fileId)` - check if file exists in manifest
  - `addFile(record, fileName, size)` - add entry to manifest
  - `getFilesToDownload(records, force)` - filter files not yet downloaded

**Step 2: Create fetch command** (`src/commands/eventlog/fetch.ts`)

Flags:
- `--target-org` / `-o` (required) - Salesforce org
- `--output-dir` / `-d` (required) - Output directory
- `--event-type` / `-e` (optional) - Filter by event type
- `--last-n-days` / `-n` (default: 30) - Days of history
- `--api-version` (optional) - Override API version
- `--concurrency` / `-c` (default: 3, range 1-10) - Parallel downloads
- `--force` / `-f` (default: false) - Re-download existing files

Core logic:
1. Parse flags and create output directory if needed
2. Query EventLogFile records using same pattern as `list.ts`
3. Load manifest from `.eventlog-manifest.json` (create if missing)
4. Filter files to download (skip those in manifest unless `--force`)
5. Download files with concurrency control using semaphore pattern
6. Write files to `{output-dir}/{EventType}/{EventType}_{LogDate}_{Id}.csv`
7. Update manifest with newly downloaded files
8. Return result summary

**Step 3: Create messages file** (`messages/eventlog.fetch.md`)
- summary, description, examples
- Flag summaries
- Info messages (no new files, download progress)
- Error messages (manifest corrupted, download failed)

### Phase 2: Enhanced UX

**Step 4: Add multi-stage-output dependency**
```bash
yarn add @oclif/multi-stage-output
```

**Step 5: Integrate progress display**

Stages:
1. "Querying event log files"
2. "Analyzing local cache"
3. "Downloading files" (with progress: X/Y files, Z MB downloaded)
4. "Updating manifest"

Use `this.jsonEnabled()` to skip progress display when `--json` flag is used.

### Phase 3: Robustness

**Step 6: Add retry logic**
- Retry failed downloads 3 times with exponential backoff
- Handle 429 (rate limit) responses with appropriate backoff

**Step 7: Handle edge cases**
- Corrupted manifest: backup and recreate
- Org ID mismatch: warn user if manifest orgId differs from current org
- Partial downloads: write to temp file, rename on completion

## Key Implementation Details

### Manifest Structure
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

### Semaphore for Concurrency
```typescript
class Semaphore {
  private queue: (() => void)[] = [];
  private running = 0;
  constructor(private maxConcurrent: number) {}
  async acquire(): Promise<void> {
    if (this.running < this.maxConcurrent) {
      this.running++;
      return;
    }
    return new Promise(resolve => this.queue.push(resolve));
  }
  release(): void {
    this.running--;
    const next = this.queue.shift();
    if (next) {
      this.running++;
      next();
    }
  }
}
```

### Download API Endpoint
```
GET /services/data/v{version}/sobjects/EventLogFile/{id}/LogFile
```

## Testing Strategy

### Unit Tests
- Query building with flag combinations
- Manifest load/save/update operations
- File filtering (skip downloaded, force flag)
- Concurrency semaphore behavior
- Error handling (download failures, corrupted manifest)

### Integration Tests
- End-to-end download to temp directory
- Idempotency (second run downloads nothing)
- Force flag re-downloads files
- Manifest file creation

### Test Context Extension
Add HTTP request stubbing to `AdvancedTestContext`:
```typescript
public httpRequestResult: Map<string, string | Error> = new Map();
```

## Verification

1. **Build**: `yarn build` - compiles and lints
2. **Unit tests**: `yarn test:only` - runs unit tests with coverage
3. **Manual test**:
   ```bash
   ./bin/run.js eventlog fetch --target-org <alias> --output-dir ./test-logs
   ./bin/run.js eventlog fetch --target-org <alias> --output-dir ./test-logs  # Should skip all files
   ./bin/run.js eventlog fetch --target-org <alias> --output-dir ./test-logs --force  # Should re-download
   ```
4. **Integration tests**: `yarn test:nuts` - runs against real scratch org

## Notes

- Follow ESM import pattern (`.js` extension in imports)
- Use `Flags.directory()` for output-dir (auto-validation)
- Sanitize event type names for directory paths (remove `<>:"/\|?*`)
- Scratch orgs may not have Event Monitoring license - NUT tests should handle gracefully
