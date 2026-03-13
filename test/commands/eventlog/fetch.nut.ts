import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { assert } from 'chai';
import { execCmd, TestSession } from '@salesforce/cli-plugins-testkit';
import { EventLogFetchResult } from '../../../src/commands/eventlog/fetch.js';
import { EventLogManifest } from '../../../src/types/eventLogTypes.js';

const testingWorkingDir = path.join('test', 'data', 'test-sfdx-project');
const scratchOrgAlias = 'DefaultScratchOrg';

describe('eventlog fetch NUTs', () => {
  let session: TestSession;
  let outputDir: string;

  before(async () => {
    session = await TestSession.create({
      project: {
        name: 'eventLogFetchNuts',
        sourceDir: testingWorkingDir,
      },
      devhubAuthStrategy: 'AUTO',
      scratchOrgs: [
        {
          alias: scratchOrgAlias,
          config: path.join('config', 'default-scratch-def.json'),
          setDefault: true,
          duration: 1,
        },
      ],
    });
  });

  beforeEach(() => {
    // Create unique temp directory for each test
    outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eventlog-fetch-nut-'));
  });

  afterEach(() => {
    // Clean up temp directory
    if (outputDir && fs.existsSync(outputDir)) {
      fs.rmSync(outputDir, { recursive: true, force: true });
    }
  });

  after(async () => {
    await session?.clean();
  });

  it('successfully executes eventlog fetch and returns valid JSON structure', () => {
    // Note: Scratch orgs may not have Event Monitoring license
    // The command should succeed but may have zero files
    const cmdResult = execCmd<EventLogFetchResult>(
      `eventlog fetch --target-org "${scratchOrgAlias}" --output-dir "${outputDir}" --json`,
      {
        ensureExitCode: 0,
      }
    );
    const result = cmdResult.jsonOutput?.result;

    // Verify the result has the expected structure
    assert.isDefined(result);
    assert.isString(result?.outputDir);
    assert.isString(result?.orgId);
    assert.isNumber(result?.totalFiles);
    assert.isNumber(result?.downloadedFiles);
    assert.isNumber(result?.skippedFiles);
    assert.isNumber(result?.failedFiles);
    assert.isArray(result?.files);

    // Verify manifest file was created
    assert.isTrue(fs.existsSync(path.join(outputDir, '.eventlog-manifest.json')));
  });

  it('successfully executes eventlog fetch with --event-type filter', () => {
    const cmdResult = execCmd<EventLogFetchResult>(
      `eventlog fetch --target-org "${scratchOrgAlias}" --output-dir "${outputDir}" --event-type ApiTotalUsage --json`,
      {
        ensureExitCode: 0,
      }
    );
    const result = cmdResult.jsonOutput?.result;

    assert.isDefined(result);
    assert.isNumber(result?.totalFiles);
    assert.isArray(result?.files);
  });

  it('successfully executes eventlog fetch with --last-n-days filter', () => {
    const cmdResult = execCmd<EventLogFetchResult>(
      `eventlog fetch --target-org "${scratchOrgAlias}" --output-dir "${outputDir}" --last-n-days 30 --json`,
      {
        ensureExitCode: 0,
      }
    );
    const result = cmdResult.jsonOutput?.result;

    assert.isDefined(result);
    assert.isNumber(result?.totalFiles);
    assert.isArray(result?.files);
  });

  it('is idempotent - second run downloads nothing', () => {
    // First run
    const firstCmdResult = execCmd<EventLogFetchResult>(
      `eventlog fetch --target-org "${scratchOrgAlias}" --output-dir "${outputDir}" --json`,
      {
        ensureExitCode: 0,
      }
    );
    const firstResult = firstCmdResult.jsonOutput?.result;

    assert.isDefined(firstResult);

    // Second run should skip all files
    const secondCmdResult = execCmd<EventLogFetchResult>(
      `eventlog fetch --target-org "${scratchOrgAlias}" --output-dir "${outputDir}" --json`,
      {
        ensureExitCode: 0,
      }
    );
    const secondResult = secondCmdResult.jsonOutput?.result;

    assert.isDefined(secondResult);
    assert.equal(secondResult?.downloadedFiles, 0);
    assert.equal(secondResult?.skippedFiles, firstResult?.totalFiles);
  });

  it('re-downloads files with --force flag', () => {
    // First run
    const firstCmdResult = execCmd<EventLogFetchResult>(
      `eventlog fetch --target-org "${scratchOrgAlias}" --output-dir "${outputDir}" --json`,
      {
        ensureExitCode: 0,
      }
    );
    const firstResult = firstCmdResult.jsonOutput?.result;

    assert.isDefined(firstResult);
    const firstDownloaded = firstResult?.downloadedFiles ?? 0;

    // Second run with --force should re-download all
    const secondCmdResult = execCmd<EventLogFetchResult>(
      `eventlog fetch --target-org "${scratchOrgAlias}" --output-dir "${outputDir}" --force --json`,
      {
        ensureExitCode: 0,
      }
    );
    const secondResult = secondCmdResult.jsonOutput?.result;

    assert.isDefined(secondResult);
    // If there were files to download, force should re-download them
    if (firstDownloaded > 0) {
      assert.equal(secondResult?.downloadedFiles, firstResult?.totalFiles);
    }
  });

  it('creates output directory if it does not exist', () => {
    const nestedDir = path.join(outputDir, 'nested', 'output', 'dir');

    const cmdResult = execCmd<EventLogFetchResult>(
      `eventlog fetch --target-org "${scratchOrgAlias}" --output-dir "${nestedDir}" --json`,
      {
        ensureExitCode: 0,
      }
    );
    const result = cmdResult.jsonOutput?.result;

    assert.isDefined(result);
    assert.isTrue(fs.existsSync(nestedDir));
    assert.isTrue(fs.existsSync(path.join(nestedDir, '.eventlog-manifest.json')));
  });

  it('creates valid manifest file', () => {
    execCmd<EventLogFetchResult>(
      `eventlog fetch --target-org "${scratchOrgAlias}" --output-dir "${outputDir}" --json`,
      {
        ensureExitCode: 0,
      }
    );

    const manifestPath = path.join(outputDir, '.eventlog-manifest.json');
    assert.isTrue(fs.existsSync(manifestPath));

    const manifestContent = fs.readFileSync(manifestPath, 'utf-8');
    const manifest = JSON.parse(manifestContent) as EventLogManifest;

    assert.equal(manifest.version, '1.0');
    assert.isString(manifest.orgId);
    assert.isString(manifest.lastFetch);
    assert.isObject(manifest.files);
  });
});
