# summary

List event log files from a Salesforce org.

# description

Query EventLogFile records from the target org and display them in a table. Event log files contain detailed information about events in your Salesforce org, including login activity, API usage, and report execution.

# examples

- List all event log files from target org

  <%= config.bin %> <%= command.id %> --target-org myOrg

- List only Login event logs

  <%= config.bin %> <%= command.id %> --target-org myOrg --event-type Login

- List event logs from the last 7 days

  <%= config.bin %> <%= command.id %> --target-org myOrg --last-n-days 7

- List Login events from the last 30 days

  <%= config.bin %> <%= command.id %> --target-org myOrg --event-type Login --last-n-days 30

# flags.target-org.summary

Salesforce org alias or username to query for event log files.

# flags.event-type.summary

Filter by event type (e.g., Login, API, Report, ApexExecution).

# flags.last-n-days.summary

Filter logs from the last N days.

# info.noResults

No event log files found matching the specified criteria.
