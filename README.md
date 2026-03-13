# @j-schreiber/sf-cli-event-log-file-browser

This is a small utility to download event log files from a target org to a target directory.

There are two ways to install it

```bash
# link locally after checking out git repo
sf plugins link .

# install from NPM
sf plugins install @j-schreiber/sf-cli-event-log-file-browser
```

# Documentation

<!-- commands -->

- [`sf eventlog fetch`](#sf-eventlog-fetch)
- [`sf eventlog list`](#sf-eventlog-list)

## `sf eventlog fetch`

Download event log files from a Salesforce org.

```
USAGE
  $ sf eventlog fetch -o <value> -d <value> [--json] [--flags-dir <value>] [--api-version <value>] [-e <value>] [-n
    <value>] [-c <value>] [-f]

FLAGS
  -c, --concurrency=<value>  [default: 3] Number of parallel downloads (1-10).
  -d, --output-dir=<value>   (required) Directory to save downloaded event log files.
  -e, --event-type=<value>   Filter by event type (e.g., Login, API, Report, ApexExecution).
  -f, --force                Re-download files even if they exist in the manifest.
  -n, --last-n-days=<value>  [default: 30] Filter logs from the last N days.
  -o, --target-org=<value>   (required) Salesforce org alias or username to download event log files from.
      --api-version=<value>  Override the api version used for api requests made by this command

GLOBAL FLAGS
  --flags-dir=<value>  Import flag values from a directory.
  --json               Format output as json.

DESCRIPTION
  Download event log files from a Salesforce org.

  Download EventLogFile records from the target org to a local directory. Files that have already been downloaded are
  tracked in a manifest file and skipped on subsequent runs (unless --force is used).

  Event log files are organized by event type in subdirectories and named with the pattern:
  `{EventType}_{LogDate}_{Id}.csv`.

  Requires Event Monitoring license in the target org.

EXAMPLES
  Download all event logs to a directory

    $ sf eventlog fetch --target-org myOrg --output-dir ./event-logs

  Download only Login event logs

    $ sf eventlog fetch --target-org myOrg --output-dir ./event-logs --event-type Login

  Download event logs from the last 7 days

    $ sf eventlog fetch --target-org myOrg --output-dir ./event-logs --last-n-days 7

  Re-download all files (ignore manifest)

    $ sf eventlog fetch --target-org myOrg --output-dir ./event-logs --force

  Download with higher concurrency

    $ sf eventlog fetch --target-org myOrg --output-dir ./event-logs --concurrency 5
```

_See code: [src/commands/eventlog/fetch.ts](https://github.com/j-schreiber/js-sf-cli-event-log-file-browser/blob/v0.2.0/src/commands/eventlog/fetch.ts)_

## `sf eventlog list`

List event log files from a Salesforce org.

```
USAGE
  $ sf eventlog list -o <value> [--json] [--flags-dir <value>] [--api-version <value>] [-e <value>] [-n <value>]

FLAGS
  -e, --event-type=<value>   Filter by event type (e.g., Login, API, Report, ApexExecution).
  -n, --last-n-days=<value>  [default: 30] Filter logs from the last N days.
  -o, --target-org=<value>   (required) Salesforce org alias or username to query for event log files.
      --api-version=<value>  Override the api version used for api requests made by this command

GLOBAL FLAGS
  --flags-dir=<value>  Import flag values from a directory.
  --json               Format output as json.

DESCRIPTION
  List event log files from a Salesforce org.

  Query EventLogFile records from the target org and display them in a table. Event log files contain detailed
  information about events in your Salesforce org, including login activity, API usage, and report execution.

EXAMPLES
  List all event log files from target org

    $ sf eventlog list --target-org myOrg

  List only Login event logs

    $ sf eventlog list --target-org myOrg --event-type Login

  List event logs from the last 7 days

    $ sf eventlog list --target-org myOrg --last-n-days 7

  List Login events from the last 30 days

    $ sf eventlog list --target-org myOrg --event-type Login --last-n-days 30
```

_See code: [src/commands/eventlog/list.ts](https://github.com/j-schreiber/js-sf-cli-event-log-file-browser/blob/v0.2.0/src/commands/eventlog/list.ts)_

<!-- commandsstop -->
