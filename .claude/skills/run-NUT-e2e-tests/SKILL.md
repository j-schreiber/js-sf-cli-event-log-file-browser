---
name: run-NUT-e2e-tests
description: Use this when running E2E tests
---

# Run NUT Tests

## Prerequisites

Before running NUT (integration) tests, ensure the Salesforce Dev Hub environment variable is set. Prompt the user for the username that should be used. Store the username during for this session.

```bash
export TESTKIT_HUB_USERNAME=<PROMPT USER FOR USERNAME TO USE>
```

This only needs to be set once per shell session.

## Running Tests

After setting the environment variable, run:

```bash
yarn test:nuts
```

## What This Does

- Creates a scratch org using the configured Dev Hub
- Runs integration tests against the scratch org
- Cleans up the scratch org after tests complete

## Troubleshooting

- **NoDefaultDevHubError**: The TESTKIT_HUB_USERNAME environment variable is not set
- **Authentication errors**: Ensure you're authenticated to the Dev Hub org via `sf org login`
