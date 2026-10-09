# suivre.md project check

Verified on 9 October 2026, starting from commit `efb367ec11b7aec7ef2dd6e47e1824ef70da1a7d`.
The main CLI, MCP and board journeys pass, and both reproduced interface defects are fixed.
This report also records two verification repairs and the remaining verification limits.

## Verified project state

The package version is `1.0.0-alpha.3`.
The baseline commit, dated 12 August 2026 in America/Guadeloupe, completed the CLI and MCP mutation vocabulary for documents, decisions and sprints and added parity coverage.
It was pushed on 1 September 2026, and its [CI run passed](https://github.com/kevinbarfleur/suivre.md/actions/runs/33555846108).
Local HEAD and the GitHub CI revision matched when this check began.

The [repository description](https://github.com/kevinbarfleur/suivre.md) now reads:

> Markdown-native backlog with a live Kanban board, CLI and MCP.
> Track tasks, sprints, docs and architecture decisions as plain files in your Git repository.

There is no project backlog under `.suivre/` and no open GitHub issue was listed during this check.
The README identifies `milestones` and `drafts` as placeholders without a backend.
The repository has no `AGENTS.md` or `.agents/workflow.json`; the required checks were taken from its CI workflow.
Harness doctor parsed the existing policy and found Codex hook definitions, but hook trust and runtime execution were not established by that check.

## Verified checks

| Check | Observed result |
| --- | --- |
| TypeScript | `npm run typecheck` passed. |
| Formatting | The CI Prettier check passed for `src/**`, `e2e/**` and root TypeScript files. |
| Unit tests | All 280 tests in 23 files passed under Node 20.19.4 after the repairs. |
| End to end tests | All 57 tests in 8 files passed under Node 20.19.4 against freshly built CLI, MCP and HTTP bundles. |
| Production build | Web and Node bundles built successfully under Node 26.8.1. |
| Claude plugin | `claude plugin validate . --strict` passed. |
| npm package contents | A dry run included the CLI, MCP, web app and desktop sources. |
| macOS app | Swift compilation passed, and the built app's snapshot mode rendered the temporary board in WKWebView. |

Initial server and watcher failures under the restricted sandbox did not reproduce when the tests had the required local access.
The global preference test's initial HTTP 500 also exposed the missing configuration isolation described below.

## Verified user journeys

The manual check used a disposable project served through vigile with isolated global preferences.
Creating a task in the browser persisted its Markdown file and made it readable through the CLI.
Editing a title and status in the browser persisted both changes.
Dragging a card into an empty column persisted the new status.
CLI comments and status changes appeared in the open browser without a reload.
Completing a dependency updated the dependency count and sprint frontier.
The sprint reader, document reader and accepted decision reader displayed their fixture content.
Archiving a task removed it from the active board and displayed it in the archive.

## Fixed verification defects

The server API preference test wrote to the user's actual configuration directory.
The test suite now assigns `XDG_CONFIG_HOME` to each test's temporary directory and restores the environment afterwards.
The complete unit suite passed after this change, and the real configuration file's SHA-256 was identical before and after that run.

The desktop app's offscreen snapshot initially omitted the task cards while the column counts were correct.
The browser displayed those same cards normally.
Snapshot mode now disables CSS animations and transitions before taking its image.
Swift compilation passed after the change, and a new capture visibly included both fixture cards.

## Fixed interface defects

### Priority cannot be cleared

Status: fixed and verified.
Reproduction: create a task with high priority, open its detail dialog, select the empty priority option, save and reopen the task.
The original dialog omitted an empty priority from its patch, and the HTTP patch schema accepted only a priority value.
The dialog now sends `priority: null`, and HTTP and MCP patches pass that explicit clearing request to the domain.
The domain removes the optional field before validation and serialization; omitting priority from a patch still preserves it.
Manual acceptance passed: saving and reloading the UI left the task without a priority, and the Markdown file contained no priority field.
An end to end regression checks omitted, cleared and restored priorities across HTTP, MCP, CLI reads and disk persistence.

### Resolved dependencies still appear as blockers

Status: fixed and verified.
Reproduction: make task B depend on task A, then complete A through the CLI while the board remains open.
The original card derived its label from the first dependency ID without resolving its current status.
The board store now resolves blocker hints once per board update using the dependency view's existing rules.
Cards and list rows use that shared result, including the configured final column and archived or missing prerequisites.
Manual acceptance passed: completing A removed the hint, reopening A restored it, and archiving A removed the hint in both the card and list without a reload.
Regression coverage also verifies renamed final columns and selection of a later prerequisite when earlier ones are already resolved.

## Verification limits

The global double-Command shortcut, Input Monitoring grant, server supervision from the installed menu app and behavior above a fullscreen app were not exercised.
The setup tests cover local setup behavior; this check did not install or update external skills plugins.
Both interface defects passed their acceptance checks on the resulting build.
