import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('@j-schreiber/sf-cli-event-log-browser', 'eventlog.list');

export type EventLogFileRecord = {
  Id: string;
  EventType: string;
  LogDate: string;
  LogFileLength: number;
  CreatedDate: string;
};

export type EventLogListResult = {
  records: EventLogFileRecord[];
  totalSize: number;
};

type TableRow = {
  Id: string;
  EventType: string;
  LogDate: string;
  Size: string;
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(isoDate: string): string {
  return isoDate.split('T')[0];
}

export default class EventLogList extends SfCommand<EventLogListResult> {
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
  };

  public async run(): Promise<EventLogListResult> {
    const { flags } = await this.parse(EventLogList);
    const connection = flags['target-org'].getConnection(flags['api-version']);

    const whereConditions: string[] = [];

    if (flags['event-type']) {
      whereConditions.push(`EventType = '${flags['event-type']}'`);
    }

    if (flags['last-n-days']) {
      whereConditions.push(`LogDate = LAST_N_DAYS:${flags['last-n-days']}`);
    }

    const whereClause = whereConditions.length > 0 ? ` WHERE ${whereConditions.join(' AND ')}` : '';

    const query = `SELECT Id, EventType, LogDate, LogFileLength, CreatedDate FROM EventLogFile${whereClause} ORDER BY LogDate DESC, EventType ASC`;

    const result = await connection.query<EventLogFileRecord>(query);

    if (result.records.length === 0) {
      this.log(messages.getMessage('info.noResults'));
    } else {
      const tableData: TableRow[] = result.records.map((record) => ({
        Id: record.Id,
        EventType: record.EventType,
        LogDate: formatDate(record.LogDate),
        Size: formatFileSize(record.LogFileLength),
      }));

      this.table({
        data: tableData,
        columns: ['Id', 'EventType', 'LogDate', 'Size'],
      });
    }

    return {
      records: result.records,
      totalSize: result.totalSize,
    };
  }
}
