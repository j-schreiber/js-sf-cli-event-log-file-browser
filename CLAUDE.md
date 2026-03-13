# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Salesforce CLI plugin (`@j-schreiber/sf-cli-plugin-ci-template`) built with TypeScript and oclif framework. Provides tools for browsing Salesforce Event Log Files.

## Common Commands

```bash
# Install dependencies
yarn install

# Build (clean, compile, lint)
yarn build

# Run tests
yarn test              # Full suite: compile + unit tests + lint
yarn test:only         # Unit tests only (Mocha/NYC)
yarn test:nuts         # Integration tests (parallel execution)

# Lint and format
yarn lint              # ESLint
yarn format            # Prettier

# Run the plugin locally (compiled)
./bin/run.js eventlog list --target-org <alias>
```

## Architecture

**Command Pattern (oclif)**
- Commands in `src/commands/` extend `SfCommand<ResultType>` from `@salesforce/sf-plugins-core`
- Each command has a corresponding messages file in `messages/` (markdown format for i18n)
- Commands are auto-discovered from `lib/commands/` after compilation

**Flow:** User → SF CLI → oclif Router → Command.run() → Result

**Key Directories:**
- `src/commands/` - Command implementations
- `messages/` - i18n message files (markdown)
- `test/commands/` - Tests (`.test.ts` for unit, `.nut.ts` for integration)
- `test/data/test-sfdx-project/` - Mock Salesforce project for tests
- `test/advancedTestContext.ts` - Test utilities for mocking Salesforce auth

## Testing

- **Unit tests** (`.test.ts`): Use Mocha/Chai with mocked Salesforce context via `AdvancedTestContext`
- **NUT tests** (`.nut.ts`): Integration tests using `@salesforce/cli-plugins-testkit` - require actual Salesforce org auth
- **Coverage**: NYC with 75% minimum threshold

## Build System

Uses **Wireit** for incremental builds with task coordination. TypeScript compiles to `lib/` with ESM output.

## CI/CD

- **tests.yml**: Runs on non-main branches (unit + NUT tests)
- **publish.yml**: Auto-release on main via `release-it` with conventional changelog

## Available Commands

### `sf eventlog list`
Query and display EventLogFile records from a Salesforce org.

```bash
# List all event logs (default: last 30 days)
sf eventlog list --target-org myOrg

# Filter by event type
sf eventlog list --target-org myOrg --event-type Login

# Filter by number of days
sf eventlog list --target-org myOrg --last-n-days 7

# Filter by interval (Hourly or Daily)
sf eventlog list --target-org myOrg --interval Hourly
```

**Note:** Requires Event Monitoring license.

## Adding New Commands

1. Create command file in `src/commands/<name>.ts` extending `SfCommand`
2. Create messages file in `messages/<name>.md` with summary, description, examples, flags sections
3. Add unit test in `test/commands/<name>.test.ts`
4. Run `yarn build` to compile and register
