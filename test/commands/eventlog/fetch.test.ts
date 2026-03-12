import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { expect } from 'chai';
import EventLogFetch from '../../../src/commands/eventlog/fetch.js';
import AdvancedTestContext from '../../advancedTestContext.js';
import { EventLogManifest } from '../../../src/types/eventLogTypes.js';

describe('eventlog fetch', () => {
  const $$ = new AdvancedTestContext();
  let tempDir: string;

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
    // Create a unique temp directory for each test
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eventlog-fetch-test-'));
  });

  afterEach(() => {
    $$.reset();
    // Clean up temp directory
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('queries EventLogFile and downloads files', async () => {
    // Arrange
    $$.queryResult = { records: mockEventLogRecords, totalSize: 2, done: true };
    $$.httpRequestResult.set('/LogFile', 'EVENT_TYPE,USER_ID\nLogin,005xx000001X1');

    // Act
    const result = await EventLogFetch.run([
      '--target-org',
      $$.targetOrgConnection.getUsername()!,
      '--output-dir',
      tempDir,
    ]);

    // Assert
    expect(result.totalFiles).to.equal(2);
    expect(result.downloadedFiles).to.equal(2);
    expect(result.skippedFiles).to.equal(0);
    expect(result.failedFiles).to.equal(0);
    expect($$.lastQuery).to.include('SELECT Id, EventType, LogDate, LogFileLength, CreatedDate FROM EventLogFile');

    // Verify files were created
    expect(fs.existsSync(path.join(tempDir, 'Login', 'Login_2024-01-15_0AT000000000001.csv'))).to.equal(true);
    expect(fs.existsSync(path.join(tempDir, 'API', 'API_2024-01-15_0AT000000000002.csv'))).to.equal(true);

    // Verify manifest was created
    expect(fs.existsSync(path.join(tempDir, '.eventlog-manifest.json'))).to.equal(true);
  });

  it('applies --event-type filter correctly', async () => {
    // Arrange
    $$.queryResult = { records: [mockEventLogRecords[0]], totalSize: 1, done: true };
    $$.httpRequestResult.set('/LogFile', 'CSV_CONTENT');

    // Act
    const result = await EventLogFetch.run([
      '--target-org',
      $$.targetOrgConnection.getUsername()!,
      '--output-dir',
      tempDir,
      '--event-type',
      'Login',
    ]);

    // Assert
    expect(result.totalFiles).to.equal(1);
    expect($$.lastQuery).to.include("EventType = 'Login'");
  });

  it('applies --last-n-days filter correctly', async () => {
    // Arrange
    $$.queryResult = { records: mockEventLogRecords, totalSize: 2, done: true };
    $$.httpRequestResult.set('/LogFile', 'CSV_CONTENT');

    // Act
    await EventLogFetch.run([
      '--target-org',
      $$.targetOrgConnection.getUsername()!,
      '--output-dir',
      tempDir,
      '--last-n-days',
      '7',
    ]);

    // Assert
    expect($$.lastQuery).to.include('LogDate = LAST_N_DAYS:7');
  });

  it('skips files already in manifest', async () => {
    // Arrange - create manifest with first file
    const manifest: EventLogManifest = {
      version: '1.0',
      orgId: $$.targetOrg.orgId,
      lastFetch: new Date().toISOString(),
      files: {
        '0AT000000000001': {
          eventType: 'Login',
          logDate: '2024-01-15',
          fileName: 'Login_2024-01-15_0AT000000000001.csv',
          downloadedAt: new Date().toISOString(),
          size: 1000,
        },
      },
    };
    fs.writeFileSync(path.join(tempDir, '.eventlog-manifest.json'), JSON.stringify(manifest));

    $$.queryResult = { records: mockEventLogRecords, totalSize: 2, done: true };
    $$.httpRequestResult.set('/LogFile', 'CSV_CONTENT');

    // Act
    const result = await EventLogFetch.run([
      '--target-org',
      $$.targetOrgConnection.getUsername()!,
      '--output-dir',
      tempDir,
    ]);

    // Assert
    expect(result.totalFiles).to.equal(2);
    expect(result.downloadedFiles).to.equal(1); // Only the second file
    expect(result.skippedFiles).to.equal(1); // First file skipped
  });

  it('re-downloads files with --force flag', async () => {
    // Arrange - create manifest with first file
    const manifest: EventLogManifest = {
      version: '1.0',
      orgId: $$.targetOrg.orgId,
      lastFetch: new Date().toISOString(),
      files: {
        '0AT000000000001': {
          eventType: 'Login',
          logDate: '2024-01-15',
          fileName: 'Login_2024-01-15_0AT000000000001.csv',
          downloadedAt: new Date().toISOString(),
          size: 1000,
        },
      },
    };
    fs.writeFileSync(path.join(tempDir, '.eventlog-manifest.json'), JSON.stringify(manifest));

    $$.queryResult = { records: mockEventLogRecords, totalSize: 2, done: true };
    $$.httpRequestResult.set('/LogFile', 'CSV_CONTENT');

    // Act
    const result = await EventLogFetch.run([
      '--target-org',
      $$.targetOrgConnection.getUsername()!,
      '--output-dir',
      tempDir,
      '--force',
    ]);

    // Assert
    expect(result.totalFiles).to.equal(2);
    expect(result.downloadedFiles).to.equal(2); // Both files downloaded
    expect(result.skippedFiles).to.equal(0);
  });

  it('skips all files when all are in manifest (no downloads needed)', async () => {
    // Arrange - create manifest with all files
    const manifest: EventLogManifest = {
      version: '1.0',
      orgId: $$.targetOrg.orgId,
      lastFetch: new Date().toISOString(),
      files: {
        '0AT000000000001': {
          eventType: 'Login',
          logDate: '2024-01-15',
          fileName: 'Login_2024-01-15_0AT000000000001.csv',
          downloadedAt: new Date().toISOString(),
          size: 1000,
        },
        '0AT000000000002': {
          eventType: 'API',
          logDate: '2024-01-15',
          fileName: 'API_2024-01-15_0AT000000000002.csv',
          downloadedAt: new Date().toISOString(),
          size: 2000,
        },
      },
    };
    fs.writeFileSync(path.join(tempDir, '.eventlog-manifest.json'), JSON.stringify(manifest));

    $$.queryResult = { records: mockEventLogRecords, totalSize: 2, done: true };
    // No HTTP stub needed since no downloads should occur

    // Act
    const result = await EventLogFetch.run([
      '--target-org',
      $$.targetOrgConnection.getUsername()!,
      '--output-dir',
      tempDir,
    ]);

    // Assert
    expect(result.totalFiles).to.equal(2);
    expect(result.downloadedFiles).to.equal(0); // No new downloads
    expect(result.skippedFiles).to.equal(2); // All files skipped
    expect(result.failedFiles).to.equal(0);

    // Verify the file info in result includes skipped status
    expect(result.files[0].status).to.equal('skipped');
    expect(result.files[1].status).to.equal('skipped');
  });

  it('handles empty results gracefully', async () => {
    // Arrange
    $$.queryResult = { records: [], totalSize: 0, done: true };

    // Act
    const result = await EventLogFetch.run([
      '--target-org',
      $$.targetOrgConnection.getUsername()!,
      '--output-dir',
      tempDir,
    ]);

    // Assert
    expect(result.totalFiles).to.equal(0);
    expect(result.downloadedFiles).to.equal(0);
    expect(result.skippedFiles).to.equal(0);
    expect(result.failedFiles).to.equal(0);

    // Verify log was called with "no new files" message
    expect($$.sfCommandStubs.log.calledOnce).to.equal(true);
    expect($$.sfCommandStubs.log.firstCall.args[0]).to.include('No new event log files');
  });

  it('handles download failures gracefully', async () => {
    // Arrange
    $$.queryResult = { records: [mockEventLogRecords[0]], totalSize: 1, done: true };
    $$.httpRequestResult.set('/LogFile', new Error('Download failed'));

    // Act
    const result = await EventLogFetch.run([
      '--target-org',
      $$.targetOrgConnection.getUsername()!,
      '--output-dir',
      tempDir,
    ]);

    // Assert
    expect(result.totalFiles).to.equal(1);
    expect(result.downloadedFiles).to.equal(0);
    expect(result.failedFiles).to.equal(1);
    expect(result.files[0].status).to.equal('failed');
    expect(result.files[0].error).to.include('Download failed');
  });

  it('propagates query errors', async () => {
    // Arrange
    $$.queryError = new Error("sObject type 'EventLogFile' is not supported");

    // Act & Assert
    try {
      await EventLogFetch.run([
        '--target-org',
        $$.targetOrgConnection.getUsername()!,
        '--output-dir',
        tempDir,
      ]);
      expect.fail('Expected error to be thrown');
    } catch (error) {
      expect((error as Error).message).to.include('EventLogFile');
    }
  });

  it('creates output directory if it does not exist', async () => {
    // Arrange
    const newDir = path.join(tempDir, 'nested', 'output', 'dir');
    $$.queryResult = { records: mockEventLogRecords, totalSize: 2, done: true };
    $$.httpRequestResult.set('/LogFile', 'CSV_CONTENT');

    // Act
    await EventLogFetch.run([
      '--target-org',
      $$.targetOrgConnection.getUsername()!,
      '--output-dir',
      newDir,
    ]);

    // Assert
    expect(fs.existsSync(newDir)).to.equal(true);
    expect(fs.existsSync(path.join(newDir, '.eventlog-manifest.json'))).to.equal(true);
  });

  it('handles corrupted manifest by creating backup', async () => {
    // Arrange - create corrupted manifest
    fs.writeFileSync(path.join(tempDir, '.eventlog-manifest.json'), 'not valid json{{{');

    $$.queryResult = { records: mockEventLogRecords, totalSize: 2, done: true };
    $$.httpRequestResult.set('/LogFile', 'CSV_CONTENT');

    // Act
    const result = await EventLogFetch.run([
      '--target-org',
      $$.targetOrgConnection.getUsername()!,
      '--output-dir',
      tempDir,
    ]);

    // Assert
    expect(result.downloadedFiles).to.equal(2);

    // Verify backup was created
    const files = fs.readdirSync(tempDir);
    const backupFiles = files.filter((f) => f.startsWith('.eventlog-manifest.json.backup'));
    expect(backupFiles.length).to.equal(1);

    // Verify warn was called about corrupted manifest
    expect($$.sfCommandStubs.warn.called).to.equal(true);
  });

  it('updates manifest with correct file metadata', async () => {
    // Arrange
    const csvContent = 'EVENT_TYPE,USER_ID\nLogin,005xx000001X1';
    $$.queryResult = { records: [mockEventLogRecords[0]], totalSize: 1, done: true };
    $$.httpRequestResult.set('/LogFile', csvContent);

    // Act
    await EventLogFetch.run([
      '--target-org',
      $$.targetOrgConnection.getUsername()!,
      '--output-dir',
      tempDir,
    ]);

    // Assert - verify manifest content
    const manifestContent = fs.readFileSync(path.join(tempDir, '.eventlog-manifest.json'), 'utf-8');
    const manifest = JSON.parse(manifestContent) as EventLogManifest;

    expect(manifest.version).to.equal('1.0');
    expect(manifest.files['0AT000000000001']).to.not.equal(undefined);
    expect(manifest.files['0AT000000000001'].eventType).to.equal('Login');
    expect(manifest.files['0AT000000000001'].logDate).to.equal('2024-01-15');
    expect(manifest.files['0AT000000000001'].fileName).to.equal('Login_2024-01-15_0AT000000000001.csv');
    expect(manifest.files['0AT000000000001'].size).to.equal(csvContent.length);
  });

  it('sanitizes event type names in file paths', async () => {
    // Arrange - event type with special characters
    const specialRecord = {
      Id: '0AT000000000003',
      EventType: 'Report<Export>',
      LogDate: '2024-01-15T00:00:00.000Z',
      LogFileLength: 100,
      CreatedDate: '2024-01-15T00:00:00.000Z',
    };
    $$.queryResult = { records: [specialRecord], totalSize: 1, done: true };
    $$.httpRequestResult.set('/LogFile', 'CSV_CONTENT');

    // Act
    const result = await EventLogFetch.run([
      '--target-org',
      $$.targetOrgConnection.getUsername()!,
      '--output-dir',
      tempDir,
    ]);

    // Assert - verify sanitized path
    expect(result.files[0].fileName).to.equal('Report_Export__2024-01-15_0AT000000000003.csv');
    expect(fs.existsSync(path.join(tempDir, 'Report_Export_', 'Report_Export__2024-01-15_0AT000000000003.csv'))).to.equal(
      true
    );
  });

  it('warns on org ID mismatch in manifest', async () => {
    // Arrange - create manifest with different org ID
    const manifest: EventLogManifest = {
      version: '1.0',
      orgId: '00DdifferentOrgId',
      lastFetch: new Date().toISOString(),
      files: {},
    };
    fs.writeFileSync(path.join(tempDir, '.eventlog-manifest.json'), JSON.stringify(manifest));

    $$.queryResult = { records: mockEventLogRecords, totalSize: 2, done: true };
    $$.httpRequestResult.set('/LogFile', 'CSV_CONTENT');

    // Act
    await EventLogFetch.run([
      '--target-org',
      $$.targetOrgConnection.getUsername()!,
      '--output-dir',
      tempDir,
    ]);

    // Assert - verify warn was called about org mismatch
    expect($$.sfCommandStubs.warn.called).to.equal(true);
    const warnMessage = $$.sfCommandStubs.warn.firstCall.args[0];
    expect(warnMessage).to.include('00DdifferentOrgId');
  });

  it('respects concurrency flag', async () => {
    // This test verifies concurrency is accepted and works without errors
    // Actual concurrency behavior is tested implicitly
    $$.queryResult = { records: mockEventLogRecords, totalSize: 2, done: true };
    $$.httpRequestResult.set('/LogFile', 'CSV_CONTENT');

    // Act
    const result = await EventLogFetch.run([
      '--target-org',
      $$.targetOrgConnection.getUsername()!,
      '--output-dir',
      tempDir,
      '--concurrency',
      '5',
    ]);

    // Assert
    expect(result.downloadedFiles).to.equal(2);
  });
});
