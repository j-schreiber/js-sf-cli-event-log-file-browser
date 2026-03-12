import { Connection } from '@salesforce/core';
import { EventLogFileRecord, QueryFilters } from '../types/eventLogTypes.js';

/**
 * Builds the WHERE clause for EventLogFile queries.
 */
export function buildWhereClause(filters: QueryFilters): string {
  const whereConditions: string[] = [];

  if (filters.eventType) {
    whereConditions.push(`EventType = '${filters.eventType}'`);
  }

  if (filters.lastNDays) {
    whereConditions.push(`LogDate = LAST_N_DAYS:${filters.lastNDays}`);
  }

  return whereConditions.length > 0 ? ` WHERE ${whereConditions.join(' AND ')}` : '';
}

/**
 * Queries EventLogFile records from Salesforce.
 */
export async function queryEventLogFiles(
  connection: Connection,
  filters: QueryFilters
): Promise<EventLogFileRecord[]> {
  const whereClause = buildWhereClause(filters);
  const query = `SELECT Id, EventType, LogDate, LogFileLength, CreatedDate FROM EventLogFile${whereClause} ORDER BY LogDate DESC, EventType ASC`;

  const result = await connection.query<EventLogFileRecord>(query);
  return result.records;
}
