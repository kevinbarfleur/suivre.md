---
name: suivre-setup
description: Wire the current repo for suivre.md — install the CLI if missing, create or adopt the .suivre/ board, connect Matt Pocock's skills, and write the issue-tracker adapter they read. Also the update/repair command — safe to re-run anytime.
disable-model-invocation: true
---

# Set up suivre in this repo

suivre.md is a markdown-native backlog: tasks, sprints, docs and ADRs live as `.md`
files under `.suivre/`, with a live kanban board (`suivre board`) and, on macOS, a
summonable desktop overlay. It ships **no process of its own** — it is built to be
the issue tracker that [Matt Pocock's skills](https://www.aihero.dev/skills)
(`/grill-with-docs`, `/to-tickets`, `/triage`, `/wayfinder`, …) act on.

Everything below is idempotent: run this skill to install, to update after a suivre
upgrade, or to repair a broken wiring. The user invoking this skill **is** the
consent for the installs it performs.

## Steps

1. **Ensure the CLI is on PATH.**

   ```bash
   command -v suivre || npm install -g github:kevinbarfleur/suivre.md
   ```

   The install builds from source (a minute or so). If a global install is not
   possible (permissions), say so and stop — everything else depends on the bin.

2. **Run the converge command from the repo root:**

   ```bash
   suivre setup --yes
   ```

   This creates **or adopts** the `.suivre/` board (existing data is never touched),
   installs Matt Pocock's skills through his official channel (`claude plugins
   install mattpocock-skills`), writes the tracker adapter his skills read
   (`docs/agents/issue-tracker.md`), adds an `AGENTS.md` pointer, and wires the
   `suivre` MCP server into `.mcp.json`.

3. **Read the report and relay it faithfully.** Each line is marked `✓` (done),
   `•` (skipped) or `!` (needs attention). In particular:
   - `adapter … .new` means the user hand-edited their adapter: their version was
     left untouched and the fresh template landed beside it. Offer to merge the
     two — do not run `--force` without asking.
   - a `!` on `skills` means the plugin could not be installed — give the user the
     manual command from the message.

4. **Suggest the first loop**, sized to what the user is doing:
   - new idea → `/grill-with-docs`, then `/to-tickets`
   - existing backlog → `/triage`
   - see the state → `suivre board` (web) or double-⌘ if the desktop overlay is
     installed; agents can point at items with `suivre show board/task-013`.

5. **macOS only — propose the overlay, never install it by default.** The desktop
   overlay (double-⌘ summons the board over any app) is a nice-to-have, not part
   of the setup. If the platform is macOS and `/Applications/suivre.app` (or
   `~/Applications/suivre.app`) is absent, **ask** the user once:

   > On macOS you can add the optional desktop overlay — double-tap ⌘ and the
   > board drops over whatever you're doing. Install it? (builds locally,
   > needs the Xcode Command Line Tools)

   Only on an explicit yes, run `suivre overlay install` and relay its
   first-launch note (the Input Monitoring permission). If the user declines,
   drop the subject — don't bring it up on later runs.

## Notes

- Monorepo / different target: every suivre command honors `SUIVRE_ROOT=/path`.
- The MCP wiring expects `suivre` on PATH (step 1 guarantees it). The user may need
  to approve the project MCP server when Claude Code prompts.
- To update later: `npm update -g suivre.md` (or re-install from git), then re-run
  this skill — the adapter converges, hand-edits are never clobbered.
