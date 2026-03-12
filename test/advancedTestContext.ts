import { Connection } from '@salesforce/core';
import { MockTestOrgData, TestContext } from '@salesforce/core/testSetup';
import { stubSfCommandUx } from '@salesforce/sf-plugins-core';
import { AnyJson } from '@salesforce/ts-types';

/**
 * Type for SOQL query results returned by Connection.query()
 */
export type QueryResult<T> = {
  records: T[];
  totalSize: number;
  done?: boolean;
};

/**
 * Type for HTTP request objects passed to fakeConnectionRequest
 */
type HttpRequest =
  | {
      url?: string;
      method?: string;
      body?: string;
    }
  | string;

/**
 * Result type for HTTP requests - can be a string response or an error
 */
type HttpRequestResult = string | Error;

/**
 * Extracts the URL from an HTTP request object or string.
 */
function extractUrl(request: HttpRequest): string {
  if (typeof request === 'string') {
    return request;
  }
  return request.url ?? '';
}

/**
 * The advanced test context encapsulates all testing related stubs and mocks
 * for unit tests (not NUTs!). It is primarily used to stub Salesforce API calls.
 *
 * Usage:
 * 1. Create instance: const $$ = new AdvancedTestContext()
 * 2. In beforeEach: await $$.init()
 * 3. Set stub data: $$.queryResult = { records: [...], totalSize: 1 }
 * 4. Run test
 * 5. In afterEach: $$.reset()
 *
 * IMPORTANT: Query results MUST be explicitly stubbed. If a query is executed
 * without setting $$.queryResult, an error will be thrown to prevent
 * accidentally receiving empty results.
 */
export default class AdvancedTestContext {
  public context: TestContext;
  public targetOrg: MockTestOrgData;
  public targetOrgConnection!: Connection;

  /**
   * Stubs for SfCommand output methods (log, table, warn, etc.)
   * Use these to assert on command output in tests.
   *
   * @example
   * expect($$.sfCommandStubs.table.calledOnce).to.equal(true);
   * expect($$.sfCommandStubs.log.args.flat()).to.include('some message');
   */
  public sfCommandStubs!: ReturnType<typeof stubSfCommandUx>;

  /**
   * Stores the last query string that was executed.
   * Useful for asserting the SOQL query in tests.
   */
  public lastQuery: string | null = null;

  /**
   * Optional error to throw for query requests.
   * Set this to simulate query failures (e.g., missing permissions).
   */
  public queryError: Error | null = null;

  /**
   * Map of HTTP request URL patterns to their results.
   * Use this to stub HTTP requests like LogFile downloads.
   * The key is a substring to match against the URL.
   *
   * @example
   * $$.httpRequestResult.set('/LogFile', 'CSV content here');
   * $$.httpRequestResult.set('/LogFile', new Error('Download failed'));
   */
  public httpRequestResult: Map<string, HttpRequestResult> = new Map();

  private internalQueryResult: QueryResult<AnyJson> | null = null;
  private queryResultWasSet = false;

  public constructor() {
    this.context = new TestContext();
    this.targetOrg = new MockTestOrgData();
  }

  /**
   * The result returned for SOQL query requests.
   * Set this before running tests that call Connection.query().
   */
  public get queryResult(): QueryResult<AnyJson> | null {
    return this.internalQueryResult;
  }

  public set queryResult(value: QueryResult<AnyJson>) {
    this.internalQueryResult = value;
    this.queryResultWasSet = true;
  }

  public async init(): Promise<void> {
    await this.context.stubAuths(this.targetOrg);
    this.targetOrgConnection = await this.targetOrg.getConnection();
    this.sfCommandStubs = stubSfCommandUx(this.context.SANDBOX);
    this.setupFakeConnectionRequest();
  }

  public reset(): void {
    this.context.restore();
    this.resetStubDefaults();
    process.removeAllListeners();
  }

  /**
   * Resets all stub return values to their defaults.
   * Called automatically by reset().
   */
  private resetStubDefaults(): void {
    this.internalQueryResult = null;
    this.queryResultWasSet = false;
    this.queryError = null;
    this.lastQuery = null;
    this.httpRequestResult.clear();
  }

  /**
   * Sets up the fakeConnectionRequest to intercept all Salesforce API calls
   * and return stub data from class properties.
   */
  private setupFakeConnectionRequest(): void {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const testContext = this;

    this.context.fakeConnectionRequest = (request: AnyJson): Promise<AnyJson> => {
      const url = extractUrl(request as HttpRequest);

      // Handle SOQL query requests
      if (url.includes('/query')) {
        return Promise.resolve(testContext.handleQueryRequest(url));
      }

      // Handle stubbed HTTP requests (e.g., LogFile downloads)
      const httpResult = testContext.handleHttpRequest(url);
      if (httpResult !== undefined) {
        if (httpResult instanceof Error) {
          return Promise.reject(httpResult);
        }
        return Promise.resolve(httpResult as AnyJson);
      }

      // Throw error for any unhandled request types
      return Promise.reject(
        new Error(
          `AdvancedTestContext: Unhandled Salesforce API request. URL: ${url}\n` +
            'Please add a stub for this request type in AdvancedTestContext.'
        )
      );
    };
  }

  /**
   * Handles HTTP requests by checking for matching URL patterns in httpRequestResult.
   * Returns undefined if no matching pattern is found.
   */
  private handleHttpRequest(url: string): HttpRequestResult | undefined {
    for (const [pattern, result] of this.httpRequestResult.entries()) {
      if (url.includes(pattern)) {
        return result;
      }
    }
    return undefined;
  }

  /**
   * Handles SOQL query requests by returning queryResult or throwing queryError.
   */
  private handleQueryRequest(url: string): AnyJson {
    // Extract the query string from the URL for assertion purposes
    const queryMatch = url.match(/[?&]q=([^&]+)/);
    if (queryMatch) {
      this.lastQuery = decodeURIComponent(queryMatch[1]);
    }

    // Throw error if configured
    if (this.queryError) {
      throw this.queryError;
    }

    // Throw error if query result was not explicitly stubbed
    if (!this.queryResultWasSet) {
      throw new Error(
        'AdvancedTestContext: Query was executed but no result was stubbed.\n' +
          `Query: ${this.lastQuery ?? 'unknown'}\n` +
          'Please set $$.queryResult before running the test to avoid accidentally receiving empty results.'
      );
    }

    // Return the configured query result
    return this.internalQueryResult as AnyJson;
  }
}
