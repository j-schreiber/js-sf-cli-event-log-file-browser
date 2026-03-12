# PRD: Event Log File Browser Command

## Overview

A Salesforce CLI command to query and display EventLogFile records from a target org, enabling administrators and developers to browse available event logs directly from the terminal.

## Command

```
sf event-logs list
```

## Problem Statement

Salesforce Event Monitoring provides valuable audit and security data through EventLogFile records, but there's no convenient CLI tool to browse available log files. Users must either use Workbench, Developer Console, or write custom scripts to view what logs are available in their org.

## User Stories

1. As a Salesforce admin, I want to see all available event log files in my org so I can understand what monitoring data is available.
2. As a developer, I want to filter event logs by type and date so I can quickly find relevant logs for debugging.
3. As a security analyst, I want to list login event logs from the past week so I can review authentication patterns.

## Requirements

### Functional Requirements

#### Query EventLogFile Records

The command queries the target org's EventLogFile object via SOQL:

```sql
SELECT Id, EventType, LogDate, LogFileLength, Interval, Sequence, CreatedDate
FROM EventLogFile
```

#### Display Results in Table Format

Output event log files as a formatted terminal table with columns:

| Column | Source Field | Description |
|--------|--------------|-------------|
| ID | `Id` | EventLogFile record ID |
| Event Type | `EventType` | Type of event (Login, API, Report, etc.) |
| Log Date | `LogDate` | Date the events occurred |
| Size | `LogFileLength` | File size (formatted as KB/MB) |
| Interval | `Interval` | Hourly or Daily |
| Sequence | `Sequence` | Sequence number (for hourly logs) |

#### Command Flags

| Flag | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `--target-org, -o` | string | No | Default org | Salesforce org alias or username |
| `--event-type, -e` | string | No | All | Filter by event type (e.g., Login, API, Report) |
| `--log-date, -d` | date | No | None | Filter by specific log date (YYYY-MM-DD) |
| `--last-n-days, -n` | integer | No | None | Filter logs from last N days |
| `--interval, -i` | string | No | All | Filter by interval (Hourly, Daily) |
| `--json` | boolean | No | false | Output results as JSON |

#### Example Usage

```bash
# List all event log files from default org
sf eventlog list

# List login events from specific org
sf eventlog list --target-org myOrg --event-type Login

# List all logs from last 7 days
sf eventlog list --last-n-days 7

# List hourly logs only
sf eventlog list --interval Hourly

# Output as JSON for scripting
sf eventlog list --json
```

### Non-Functional Requirements

- Command completes within 30 seconds for typical result sets
- Handles orgs with no Event Monitoring license gracefully (clear error message)
- Supports standard SF CLI output formatting (table, JSON)

## EventLogFile Object Reference

### Key Fields

| Field | Type | Description |
|-------|------|-------------|
| `Id` | ID | Unique record identifier |
| `EventType` | String | Event category (Login, API, Report, etc.) |
| `LogDate` | DateTime | Date events occurred |
| `LogFile` | Blob | Gzip-compressed CSV content (for download) |
| `LogFileLength` | Integer | Size in bytes |
| `LogFileFieldNames` | String | CSV column names |
| `LogFileFieldTypes` | String | CSV column types |
| `Interval` | Picklist | "Hourly" or "Daily" |
| `Sequence` | Integer | Order within hour (hourly logs only) |
| `CreatedDate` | DateTime | Record creation timestamp |

### Common EventType Values

**Authentication**: Login, Logout, LoginAs, LoginEvent
**API**: API, RestApi, BulkApi, BulkApi2, MetadataApiOperation
**Reports**: Report, ReportExport, Dashboard, AsyncReportRun
**UI**: URI, LightningPageView, LightningInteraction, VisualforceRequest
**Apex**: ApexExecution, ApexCallout, ApexTrigger, ApexUnexpectedException
**Content**: ContentDistribution, ContentDocumentLink, ContentTransfer

### Data Retention

- Daily logs: 30 days
- Hourly logs: 24 hours

### License Requirement

Event Monitoring license required. Without it, querying EventLogFile returns no results or permission error.

## Technical Notes

### SOQL Query Construction

Build query dynamically based on flags:

```sql
SELECT Id, EventType, LogDate, LogFileLength, Interval, Sequence, CreatedDate
FROM EventLogFile
WHERE LogDate >= 2024-01-01T00:00:00Z  -- if --last-n-days or --log-date
  AND EventType = 'Login'               -- if --event-type
  AND Interval = 'Daily'                -- if --interval
ORDER BY LogDate DESC, EventType ASC
```

### Error Handling

| Scenario | Handling |
|----------|----------|
| No Event Monitoring license | Display message: "Event Monitoring license required to access EventLogFile" |
| No results | Display message: "No event log files found matching criteria" |
| Invalid event type | Display available event types |
| Connection failure | Standard SF CLI connection error |

## Success Metrics

- Users can list event log files without leaving the terminal
- Command provides filterable, readable output
- Integrates with standard SF CLI patterns (--json, --target-org)

## Out of Scope (Future)

- Downloading log file content (future `sf eventlog download` command)
- Viewing log file contents inline
- Real-time event streaming
- Log file field schema inspection

## Acceptance Criteria

1. [ ] Command `sf eventlog list` queries and displays EventLogFile records
2. [ ] Table output shows: ID, Event Type, Log Date, Size, Interval, Sequence
3. [ ] `--target-org` flag connects to specified org
4. [ ] `--event-type` flag filters by EventType field
5. [ ] `--log-date` flag filters by specific date
6. [ ] `--last-n-days` flag filters by date range
7. [ ] `--interval` flag filters by Hourly/Daily
8. [ ] `--json` flag outputs structured JSON
9. [ ] Graceful error when Event Monitoring license missing
10. [ ] Unit tests cover query building and output formatting
11. [ ] NUT test validates against real org with Event Monitoring
