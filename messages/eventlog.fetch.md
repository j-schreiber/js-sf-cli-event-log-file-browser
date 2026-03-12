# summary

Download event log files from a Salesforce org.

# description

Download EventLogFile records from the target org to a local directory. Files that have already been downloaded are tracked in a manifest file and skipped on subsequent runs (unless --force is used).

Event log files are organized by event type in subdirectories and named with the pattern: `{EventType}_{LogDate}_{Id}.csv`.

Requires Event Monitoring license in the target org.

# examples

- Download all event logs to a directory

  <%= config.bin %> <%= command.id %> --target-org myOrg --output-dir ./event-logs

- Download only Login event logs

  <%= config.bin %> <%= command.id %> --target-org myOrg --output-dir ./event-logs --event-type Login

- Download event logs from the last 7 days

  <%= config.bin %> <%= command.id %> --target-org myOrg --output-dir ./event-logs --last-n-days 7

- Re-download all files (ignore manifest)

  <%= config.bin %> <%= command.id %> --target-org myOrg --output-dir ./event-logs --force

- Download with higher concurrency

  <%= config.bin %> <%= command.id %> --target-org myOrg --output-dir ./event-logs --concurrency 5

# flags.target-org.summary

Salesforce org alias or username to download event log files from.

# flags.output-dir.summary

Directory to save downloaded event log files.

# flags.event-type.summary

Filter by event type (e.g., Login, API, Report, ApexExecution).

# flags.last-n-days.summary

Filter logs from the last N days.

# flags.concurrency.summary

Number of parallel downloads (1-10).

# flags.force.summary

Re-download files even if they exist in the manifest.

# info.noNewFiles

No new event log files to download. All files are already in the manifest.

# info.queryingFiles

Querying event log files from org...

# info.downloadingFiles

Downloading %d of %d files...

# info.downloadComplete

Download complete. Downloaded %d files (%s).

# info.skippedFiles

Skipped %d files (already downloaded).

# info.manifestOrgMismatch

Warning: Manifest was created for org %s but current org is %s. Use --force to re-download.

# error.downloadFailed

Failed to download file %s: %s

# error.manifestCorrupted

Manifest file is corrupted. Creating backup and starting fresh.

# error.createDirectory

Failed to create output directory: %s
