import { SfCommand, Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import { EventLogFileRecord } from '../../types/eventLogTypes.js';
import { queryEventLogFiles } from '../../services/EventLogQueryService.js';
import { formatFileSize, formatDate } from '../../utils/formatters.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('@j-schreiber/sf-cli-event-log-browser', 'eventlog.list');

export type { EventLogFileRecord };

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

    const records = await queryEventLogFiles(connection, {
      eventType: flags['event-type'],
      lastNDays: flags['last-n-days'],
    });

    if (records.length === 0) {
      this.log(messages.getMessage('info.noResults'));
    } else {
      const tableData: TableRow[] = records.map((record) => ({
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
      records,
      totalSize: records.length,
    };
  }
}
