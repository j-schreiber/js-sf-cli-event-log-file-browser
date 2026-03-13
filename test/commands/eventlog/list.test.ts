import { expect } from 'chai';
import EventLogList from '../../../src/commands/eventlog/list.js';
import AdvancedTestContext from '../../advancedTestContext.js';

describe('eventlog list', () => {
  const $$ = new AdvancedTestContext();

  const mockEventLogRecords = [
    {
      Id: '0AT000000000001',
      EventType: 'Login',
      LogDate: '2024-01-15T00:00:00.000Z',
      LogFileLength: 1_258_291,
      CreatedDate: '2024-01-16T00:00:00.000Z',
    },
    {
      Id: '0AT000000000002',
      EventType: 'API',
      LogDate: '2024-01-15T00:00:00.000Z',
      LogFileLength: 456_789,
      CreatedDate: '2024-01-15T01:00:00.000Z',
    },
  ];

  beforeEach(async () => {
    await $$.init();
  });

  afterEach(() => {
    $$.reset();
  });

  it('queries EventLogFile and returns results', async () => {
    // Arrange
    $$.queryResult = { records: mockEventLogRecords, totalSize: 2, done: true };

    // Act
    const result = await EventLogList.run(['--target-org', $$.targetOrgConnection.getUsername()!]);

    // Assert
    expect(result.records).to.have.length(2);
    expect(result.totalSize).to.equal(2);
    expect($$.lastQuery).to.include('SELECT Id, EventType, LogDate, LogFileLength, CreatedDate FROM EventLogFile');
    expect($$.lastQuery).to.include('ORDER BY LogDate DESC, EventType ASC');

    // Verify table output was called with correct data
    expect($$.sfCommandStubs.table.calledOnce).to.equal(true);
    const tableArgs = $$.sfCommandStubs.table.firstCall.args[0];
    expect(tableArgs.data).to.have.length(2);
    expect(tableArgs.data[0]).to.deep.include({ Id: '0AT000000000001', EventType: 'Login' });
  });

  it('applies --event-type filter correctly', async () => {
    // Arrange
    $$.queryResult = { records: [mockEventLogRecords[0]], totalSize: 1, done: true };

    // Act
    const result = await EventLogList.run([
      '--target-org',
      $$.targetOrgConnection.getUsername()!,
      '--event-type',
      'Login',
    ]);

    // Assert
    expect(result.records).to.have.length(1);
    expect($$.lastQuery).to.include("EventType = 'Login'");
    expect($$.sfCommandStubs.table.calledOnce).to.equal(true);
  });

  it('applies --last-n-days filter correctly', async () => {
    // Arrange
    $$.queryResult = { records: mockEventLogRecords, totalSize: 2, done: true };

    // Act
    const result = await EventLogList.run([
      '--target-org',
      $$.targetOrgConnection.getUsername()!,
      '--last-n-days',
      '7',
    ]);

    // Assert
    expect(result.records).to.have.length(2);
    expect($$.lastQuery).to.include('LogDate = LAST_N_DAYS:7');
    expect($$.sfCommandStubs.table.calledOnce).to.equal(true);
  });

  it('combines multiple filters correctly', async () => {
    // Arrange
    $$.queryResult = { records: [mockEventLogRecords[0]], totalSize: 1, done: true };

    // Act
    const result = await EventLogList.run([
      '--target-org',
      $$.targetOrgConnection.getUsername()!,
      '--event-type',
      'Login',
      '--last-n-days',
      '7',
    ]);

    // Assert
    expect(result.records).to.have.length(1);
    expect($$.lastQuery).to.include("EventType = 'Login'");
    expect($$.lastQuery).to.include('LogDate = LAST_N_DAYS:7');
    expect($$.lastQuery).to.include(' AND ');
    expect($$.sfCommandStubs.table.calledOnce).to.equal(true);
  });

  it('handles empty results gracefully', async () => {
    // Arrange
    $$.queryResult = { records: [], totalSize: 0, done: true };

    // Act
    const result = await EventLogList.run(['--target-org', $$.targetOrgConnection.getUsername()!]);

    // Assert
    expect(result.records).to.have.length(0);
    expect(result.totalSize).to.equal(0);

    // Verify table was NOT called (no results to display)
    expect($$.sfCommandStubs.table.called).to.equal(false);
    // Verify log was called with "no results" message
    expect($$.sfCommandStubs.log.calledOnce).to.equal(true);
    expect($$.sfCommandStubs.log.firstCall.args[0]).to.include('No event log files found');
  });

  it('propagates query errors', async () => {
    // Arrange
    $$.queryError = new Error("sObject type 'EventLogFile' is not supported");

    // Act & Assert
    try {
      await EventLogList.run(['--target-org', $$.targetOrgConnection.getUsername()!]);
      expect.fail('Expected error to be thrown');
    } catch (error) {
      expect((error as Error).message).to.include('EventLogFile');
    }
  });

  it('formats file sizes correctly in table output', async () => {
    // Arrange
    $$.queryResult = { records: mockEventLogRecords, totalSize: 2, done: true };

    // Act
    await EventLogList.run(['--target-org', $$.targetOrgConnection.getUsername()!]);

    // Assert - verify size formatting in table data
    const tableArgs = $$.sfCommandStubs.table.firstCall.args[0];
    expect(tableArgs.data[0].Size).to.equal('1.2 MB'); // 1258291 bytes
    expect(tableArgs.data[1].Size).to.equal('446.1 KB'); // 456789 bytes
  });

  it('formats dates correctly in table output', async () => {
    // Arrange
    $$.queryResult = { records: mockEventLogRecords, totalSize: 2, done: true };

    // Act
    await EventLogList.run(['--target-org', $$.targetOrgConnection.getUsername()!]);

    // Assert - verify date formatting in table data
    const tableArgs = $$.sfCommandStubs.table.firstCall.args[0];
    expect(tableArgs.data[0].LogDate).to.equal('2024-01-15');
    expect(tableArgs.data[1].LogDate).to.equal('2024-01-15');
  });
});
