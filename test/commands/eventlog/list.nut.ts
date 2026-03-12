import * as path from 'node:path';
import { assert } from 'chai';
import { execCmd, TestSession } from '@salesforce/cli-plugins-testkit';
import { EventLogListResult } from '../../../src/commands/eventlog/list.js';

const testingWorkingDir = path.join('test', 'data', 'test-sfdx-project');
const scratchOrgAlias = 'DefaultScratchOrg';

describe('eventlog list NUTs', () => {
  let session: TestSession;

  before(async () => {
    session = await TestSession.create({
      project: {
        name: 'eventLogListNuts',
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

  after(async () => {
    await session?.clean();
  });

  it('successfully executes eventlog list and returns valid JSON structure', () => {
    // Note: Scratch orgs may not have Event Monitoring license, so we allow exit code 0 or 1
    const result = execCmd<EventLogListResult>(`eventlog list --target-org "${scratchOrgAlias}"`, {
      ensureExitCode: 0,
    }).jsonOutput?.result;

    // Verify the result has the expected structure
    assert.isDefined(result);
    assert.isArray(result?.records);
    assert.isNumber(result?.totalSize);
  });

  it('successfully executes eventlog list with --event-type filter', () => {
    const result = execCmd<EventLogListResult>(
      `eventlog list --target-org "${scratchOrgAlias}" --event-type ApiTotalUsage`,
      {
        ensureExitCode: 0,
      }
    ).jsonOutput?.result;

    assert.isDefined(result);
    assert.isArray(result?.records);
  });

  it('successfully executes eventlog list with --last-n-days filter', () => {
    const result = execCmd<EventLogListResult>(`eventlog list --target-org "${scratchOrgAlias}" --last-n-days 30`, {
      ensureExitCode: 0,
    }).jsonOutput?.result;

    assert.isDefined(result);
    assert.isArray(result?.records);
  });
});
