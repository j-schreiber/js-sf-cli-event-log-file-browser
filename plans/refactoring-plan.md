# Refactoring Plan: EventLog Commands

## Overview

Refactor `list.ts` and `fetch.ts` commands to eliminate code duplication, improve SOLID compliance, and create a modular service architecture.

## Target Structure

```
src/
├── commands/eventlog/
│   ├── list.ts              # Thin orchestration (~60 lines)
│   └── fetch.ts             # Thin orchestration (~150 lines)
├── services/
│   ├── EventLogQueryService.ts    # SOQL query building + execution
│   ├── EventLogDownloadService.ts # HTTP download with retry
│   └── ManifestService.ts         # Manifest CRUD operations
├── utils/
│   ├── formatters.ts              # formatFileSize, formatDate, sanitizeForPath
│   ├── fileUtils.ts               # ensureDirectory, atomicWrite, sleep
│   └── Semaphore.ts               # Concurrency control class
└── types/
    └── eventLogTypes.ts           # Existing + new QueryFilters type
```

---

## Implementation Steps

### Step 1: Create `src/utils/formatters.ts`

Extract shared formatting functions from both commands.

**Functions to extract:**
- `formatFileSize(bytes: number): string` - from `list.ts:22-30` / `fetch.ts:55-63`
- `formatDate(isoDate: string): string` - from `list.ts:32-34` / `fetch.ts:65-67`
- `sanitizeForPath(name: string): string` - from `fetch.ts:73-75`

**Changes required:**
- Create new file with exported functions
- Update imports in `list.ts` and `fetch.ts`
- Remove duplicate function definitions

---

### Step 2: Create `src/utils/Semaphore.ts`

Extract the `Semaphore` class from `fetch.ts:27-53`.

**Contents:**
- Export `Semaphore` class with `acquire()` and `release()` methods
- Add JSDoc documentation

**Changes required:**
- Create new file
- Update import in `fetch.ts`
- Remove class definition from `fetch.ts`

---

### Step 3: Create `src/utils/fileUtils.ts`

Extract file system utilities from `fetch.ts`.

**Functions to extract:**
- `ensureDirectory(dirPath: string): void` - from `fetch.ts:87-95`
- `sleep(ms: number): Promise<void>` - from `fetch.ts:80-82`

**Changes required:**
- Create new file with exported functions
- Update imports in `fetch.ts`
- Remove function definitions from `fetch.ts`

---

### Step 4: Add `QueryFilters` type to `src/types/eventLogTypes.ts`

Add new type for query parameters.

**New type:**
```typescript
export type QueryFilters = {
  eventType?: string;
  lastNDays?: number;
};
```

---

### Step 5: Create `src/services/EventLogQueryService.ts`

Extract SOQL query logic used by both commands.

**Functions:**
- `buildWhereClause(filters: QueryFilters): string` - construct WHERE clause
- `queryEventLogFiles(connection: Connection, filters: QueryFilters): Promise<EventLogFileRecord[]>`

**Source code:**
- Query building from `list.ts:64-78` and `fetch.ts:100-121` (merge identical logic)

**Changes required:**
- Create new file
- Update `list.ts` to use `queryEventLogFiles()`
- Update `fetch.ts` to use `queryEventLogFiles()` (replace existing function)
- Remove duplicate query logic from both commands

---

### Step 6: Create `src/services/ManifestService.ts`

Extract manifest management from `fetch.ts`.

**Functions:**
- `createEmptyManifest(orgId: string): EventLogManifest` - from `fetch.ts:126-133`
- `loadManifest(manifestPath: string, currentOrgId: string, warnFn: (msg: string) => void): EventLogManifest` - from `fetch.ts:501-525`
- `saveManifest(manifestPath: string, manifest: EventLogManifest): void` - from `fetch.ts:152-155`
- `filterFilesToDownload(records, manifest, force): EventLogFileRecord[]` - from `fetch.ts:138-147`

**Constants:**
- `MANIFEST_FILENAME = '.eventlog-manifest.json'`
- `MANIFEST_VERSION = '1.0'`

**Changes required:**
- Create new file
- Update `fetch.ts` to use service functions
- Remove `loadManifest` method from command class
- Remove standalone functions from `fetch.ts`

---

### Step 7: Create `src/services/EventLogDownloadService.ts`

Extract download logic from `fetch.ts`.

**Constants:**
- `MAX_RETRIES = 3`
- `INITIAL_BACKOFF_MS = 1000`

**Functions:**
- `downloadWithRetry(connection: Connection, recordId: string): Promise<string>` - from `fetch.ts:259-302`
- `downloadFile(connection, record, outputDir, manifest): Promise<FetchedFile>` - from `fetch.ts:307-364`

**Changes required:**
- Create new file
- Update imports in `fetch.ts`
- Remove functions from `fetch.ts`

#### Design Decision: Native `fetch` vs `connection.request()`

The `downloadWithRetry` function uses Node.js native `fetch` instead of `connection.request()` for downloading EventLogFile content. This is an intentional design decision:

**Why not `connection.request()`?**

The Salesforce jsforce `connection.request()` method automatically parses response content based on the Content-Type header. When requesting CSV files (like EventLogFile content), jsforce parses the CSV into a JavaScript array/object, which is not the desired behavior when we need the raw CSV content for file storage.

**Why native `fetch`?**

1. **Raw content retrieval**: Native `fetch` with `response.text()` returns the raw CSV string without any parsing
2. **Control over headers**: We can explicitly set `Accept: text/csv` to request CSV format
3. **No automatic transformation**: The file content is preserved exactly as returned by Salesforce

**Example of the problem with `connection.request()`:**
```typescript
// This returns a parsed array, NOT the raw CSV string
const content = await connection.request('/sobjects/EventLogFile/ID/LogFile');
// content = [{ EVENT_TYPE: 'Login', USER_ID: '005...' }, ...]

// We need the raw string for file storage
// content = "EVENT_TYPE,USER_ID\nLogin,005..."
```

**Testing implications:**

Since native `fetch` bypasses the jsforce connection stubbing, unit tests must mock `global.fetch` separately in the test context (`advancedTestContext.ts`). The test helper sets up a fake fetch that intercepts requests matching `/LogFile` URL patterns and returns stubbed responses.

---

### Step 8: Refactor `src/commands/eventlog/list.ts`

Simplify command to use services.

**Final structure:**
1. Import `queryEventLogFiles` from `EventLogQueryService`
2. Import `formatFileSize`, `formatDate` from `formatters`
3. Remove duplicate function definitions
4. Call service in `run()` method

**Estimated final size:** ~60 lines

---

### Step 9: Refactor `src/commands/eventlog/fetch.ts`

Simplify command to orchestration only.

**Final structure:**
1. Import all services and utilities
2. Remove all extracted functions and classes
3. Keep `run()` method as orchestrator
4. Keep `downloadFiles()` method (uses Semaphore + service)
5. Keep `logSummary()` method
6. Keep MSO initialization

**Keep in command (not extracted):**
- `createEmptyResult()` - result builder specific to command output
- `createResultFromManifest()` - result builder specific to command output
- `buildResult()` - result builder specific to command output
- MSO configuration - tightly coupled to command UX

**Estimated final size:** ~200 lines

---

### Step 10: Run Tests and Verify

1. Run `yarn build` - ensure TypeScript compiles
2. Run `yarn test:only` - verify unit tests pass
3. Run `yarn lint` - ensure no linting errors
4. Manual test: `./bin/run.js eventlog list --target-org <alias>`
5. Manual test: `./bin/run.js eventlog fetch --target-org <alias> --output-dir ./test-output`

---

## Files Modified

| File | Action |
|------|--------|
| `src/utils/formatters.ts` | CREATE |
| `src/utils/Semaphore.ts` | CREATE |
| `src/utils/fileUtils.ts` | CREATE |
| `src/services/EventLogQueryService.ts` | CREATE |
| `src/services/ManifestService.ts` | CREATE |
| `src/services/EventLogDownloadService.ts` | CREATE |
| `src/types/eventLogTypes.ts` | MODIFY (add QueryFilters) |
| `src/commands/eventlog/list.ts` | MODIFY (use services) |
| `src/commands/eventlog/fetch.ts` | MODIFY (use services) |

---

## Verification

1. **Build:** `yarn build` compiles without errors
2. **Unit tests:** `yarn test:only` passes all existing tests
3. **Lint:** `yarn lint` reports no errors
4. **Integration:** `yarn test:nuts` passes (if scratch org available)
5. **Manual:** Both commands execute successfully against a real org
