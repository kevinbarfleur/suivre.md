---
name: suivre-setup
description: Wire the current repo for suivre.md — install the CLI if missing, create or adopt the .suivre/ board, connect Matt Pocock's skills, and write the issue-tracker adapter they read. Also the update/repair command — safe to re-run anytime.
disable-model-invocation: true
---

# Set up suivre in this repo

suivre.md is a markdown-native backlog: tasks, sprints, docs and ADRs are `.md`
files under `.suivre/`, with a live kanban board (`suivre board`). It has no
workflow of its own — it is the issue tracker that
[Matt Pocock's skills](https://www.aihero.dev/skills) act on.

Everything below is idempotent: run it to install, to update after a suivre
upgrade, or to repair a broken wiring. The user invoking this skill is the
consent for the installs it performs.

## Steps

1. Make sure the CLI is on PATH:

   ```bash
   command -v suivre || npm install -g suivre.md
   ```

   The package ships prebuilt — no compile step. If a global install fails
   (permissions), stop and say why: everything else needs the bin.

2. From the repo root, run `suivre setup --yes`.

3. Relay the report faithfully — `✓` done, `•` skipped, `!` needs attention.
   Two cases to handle:
   - `adapter … .new`: the user hand-edited their adapter, so it was kept and the
     fresh template was written next to it. Offer to merge the two. Never run
     `--force` without asking.
   - `!` on `skills`: the plugin install failed — give the user the manual
     command from the message.

4. Suggest one next step, based on where they are: new idea → `/grill-with-docs`;
   existing backlog → `/triage`; just looking → `suivre board`.

5. macOS only, and only if `suivre.app` is in neither `/Applications` nor
   `~/Applications`: offer the optional overlay, once —

   > Double-tap ⌘ and the board drops over whatever you're doing. Install it?
   > It builds locally and needs the Xcode Command Line Tools.

   Only on a yes, run `suivre overlay install` and pass along its note about the
   Input Monitoring permission. If declined, don't bring it up again.

## Notes

- Different target repo: every command honors `SUIVRE_ROOT=/path`.
- `.mcp.json` runs `suivre mcp`, so the bin must stay on PATH. Claude Code may
  ask the user to approve the project MCP server.
- Updating later: `npm update -g suivre.md`, then re-run this skill.
