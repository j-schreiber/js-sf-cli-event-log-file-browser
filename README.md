# @j-schreiber/sf-cli-event-log-file-browser

This is a small utility to download event log files from a target org to a target directory.

There are two ways to install it

```bash
# link locally after checking out git repo
sf plugins link .

# install from NPM
sf plugins install @j-schreiber/sf-cli-event-log-file-browser
```

# Documentation

<!-- commands -->

- [`sf hello-world`](#sf-hello-world)

## `sf hello-world`

Summary of a command.

```
USAGE
  $ sf hello-world -o <value> [--json] [--flags-dir <value>]

FLAGS
  -o, --target-org=<value>  (required) The target org

GLOBAL FLAGS
  --flags-dir=<value>  Import flag values from a directory.
  --json               Format output as json.

DESCRIPTION
  Summary of a command.

  Description. Does not repeat summary.

EXAMPLES
  Do something

    $ sf hello-world -o MyTargetOrg
```

_See code: [src/commands/hello-world.ts](https://github.com/j-schreiber/sf-cli-plugin-ci-template/blob/v0.1.19/src/commands/hello-world.ts)_

<!-- commandsstop -->
