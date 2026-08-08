```
░░░░░ ▒   ▒ ▒▒▒ ▒   ▓ ▓▓▓▓  ▓▓▓▓▓    █   █ ████
░     ░   ▒  ▒  ▒   ▒ ▓   ▓ ▓        ██ ██ █   █
░░░░░ ░   ▒  ▒  ▒   ▒ ▒▒▓▓  ▓▓▓▓     ▓ █ █ █   █
    ░ ░   ░  ▒   ▒ ▒  ▒  ▒  ▓        ▓   ▓ █   █
░░░░░ ░░░░░ ░░░   ▒   ▒   ▒ ▒▒▓▓▓ ▓▓ ▓   ▓ ▓███
```

# suivre.md

**A markdown-native backlog tool. One core, many surfaces — web board, CLI, and MCP.**

Every task is a plain `.md` file with YAML frontmatter, versioned in your repo.
There is no database and no service to host: **git is the history**. The tool is
built to be driven by an **agent** as much as by a human — an agent writes files,
and the live board updates on screen.

> The name is a French pun (_suivre_ = "to follow / track"). Everything else — the
> UI, statuses, labels, this document — is in English, like any dev tool.

---

## Quick start

```bash
# Install the `suivre` bin once (builds on install):
npm install -g github:kevinbarfleur/suivre.md

# In your project: board + agent workflow + tracker adapter, one command
cd /path/to/your/repo
suivre setup

# Launch the live board
suivre board
# → http://localhost:45188
```

In Claude Code? Skip the terminal: install the `suivre` plugin and run
`/suivre-setup` (see [the workflow section](#the-workflow-layer-matt-pococks-skills)).

From a clone instead: `npm install && npm run build`, then
`SUIVRE_ROOT=/path/to/your/repo npx tsx src/cli/index.ts board`.

The board is a single process that serves the web UI **and** the API, and watches
the task files: any change on disk (from the UI, the CLI, the MCP, or your editor)
refreshes the board live over SSE.

---

## Core idea

- **A task is a file.** `.suivre/tasks/<id>-<slug>.md` = YAML frontmatter + a markdown
  body. The frontmatter holds the structured fields; the body holds everything else
  (description, acceptance criteria, notes).
- **One pure core, thin surfaces.** A pure `domain` (no I/O) + a `storage` layer
  (atomic writes) + a shared `service`, with three thin adapters on top: **HTTP**
  (the web board), **CLI** (`suivre`), and **MCP** (agent-driven). One logic, never
  duplicated per surface.
- **Live.** Mutations write files; a file-watcher emits an SSE event; the board reloads.
  Whoever writes — human, CLI, or agent — everyone sees the same board.

---

## The workflow layer: Matt Pocock's skills

suivre deliberately ships **no process of its own**. No grilling prompts, no spec
templates, no triage ceremony — that layer already exists, is excellent, and is
maintained by someone else: [**Matt Pocock's skills**](https://www.aihero.dev/skills)
(`/grill-with-docs`, `/to-spec`, `/to-tickets`, `/triage`, `/wayfinder`, `/tdd`, …).

suivre is built to be the **state those skills act on**: their issue tracker, their
spec store, their ADR log, their effort map — plain markdown in your repo, with a
live board and a summonable overlay on top. His flow, your state.

One command wires a repo:

```bash
suivre setup
```

Or entirely from inside Claude Code, no terminal needed — the repo is its own
plugin marketplace:

```
/plugin marketplace add kevinbarfleur/suivre.md
/plugin install suivre@kevinbarfleur
/suivre-setup
```

`/suivre-setup` has the agent do everything below (installing the CLI first if
needed) and report back — invoking it is the consent.

It **converges** — idempotent, so re-run it anytime to update or repair:

1. `.suivre/` board initialized (or adopted if already there).
2. Matt's skills installed **via his official channel** (`claude plugins install
   mattpocock-skills`) — never copied, never forked; updates flow from him.
3. `docs/agents/issue-tracker.md` written: the adapter his skills read to speak
   suivre — create/read/triage/close tickets, specs, ADRs, wayfinding on sprints,
   and *reveal moments* (the overlay pops open on what the agent just changed).
   A hand-edited adapter is never clobbered: the fresh template lands beside it
   as `.new` (or use `--force`).
4. `AGENTS.md` pointer + `.mcp.json` so agents get the board as native MCP tools.

Day to day that reads: `/grill-with-docs` → spec in `.suivre/docs/` → `/to-tickets`
→ tickets land on the board and the overlay shows them → `/triage` → labels →
implementation claims `suivre next`, comments as it works, closes with `suivre done`.
After updating suivre itself, re-run `suivre setup` to converge the adapter to the
newest contract.

All credit for the workflow goes to **Matt Pocock** — his skills are the reference
for agent-driven engineering, and suivre *assumes* them rather than imitating them.
Not using them? Everything here still works standalone (`suivre setup --skip-skills`).

---

## Concepts

| Concept | What it is |
| --- | --- |
| **Board / columns** | The workflow, defined in `config.yml`. Each column is a `{ id, label, wipLimit? }`. A task's `status` is a column `id`. |
| **Task** | `id`, `title`, `status`, optional `priority` (`low`/`medium`/`high`/`urgent`), `labels[]`, optional `assignee`, a fractional `order` (rank in the column), optional `parent` and `depends[]`, plus `created`/`updated`. |
| **Acceptance criteria** | `- [ ]` / `- [x]` checkboxes in the task body. Surfaced as a progress meter on the card and in the list. |
| **Labels** | Free-form tags. `debt` is special-cased (highlighted as tech debt). |
| **Sprints** | `.suivre/sprints/*.md` — an **ordered checklist of task ids** to ship (an effort map). No task duplication: progress is read from the tasks' real status, so the sprint and the board never disagree. |
| **Decisions (ADR)** | `.suivre/decisions/*.md` — architecture/product decisions with `status` (`proposed`/`accepted`/`rejected`/`superseded`), `date`, and `supersedes`/`supersededBy` links. |
| **Docs** | `.suivre/docs/*.md` — project documentation, rendered read-only in the app. |
| **Archive** | A cross-type view of everything retired (see [Archive](#archive)). |

---

## Views

Reachable from the nav rail; each is deep-linkable by URL hash (`#<view>/<item>`).

| View | Purpose |
| --- | --- |
| **board** | The kanban. Drag tasks between columns; add a task at the bottom of any column. |
| **list** | Every task in a dense, sortable table (status, priority, labels, criteria, …). |
| **overview** | Project state in depth: progress, breakdowns by column/priority/label/owner, freshness. Every breakdown is clickable → filtered list. |
| **deps** | Execution order: blocked tasks, high-impact blockers, subtasks, and direct dependency cycles. |
| **sprints** | Effort maps: ordered task checklists with live progress ("you are here"). |
| **docs** | Read the project documentation (markdown reader). |
| **decisions** | The ADR log, filterable by status, with supersede links. |
| **archive** | Everything archived, all types in one list (see below). |
| **settings** | Theme and default-view preferences (machine + project level). |

`milestones` and `drafts` are placeholders — their backend is the next chantier.

### Archive

An item is **archived** when either:

1. **Its status says so** — a task with `status: archived`, or a decision that is
   `superseded`/`rejected`. Archived tasks leave the active board entirely.
2. **It lives in an `archive/` folder** — any `.md` under `<collection>/archive/`
   (e.g. `.suivre/docs/archive/`). This is the only mechanism for docs.

The archive view unifies tasks, decisions, and docs into one list with filters by
type / period / label, plus search and sort.

---

## Data layout

Everything lives under `<repo>/.suivre/` (a hidden, branded folder — the default
`dirName`, chosen to avoid colliding with other tools):

```
.suivre/
  config.yml            board name + columns
  preferences.json      project-level preferences (default view)
  tasks/
    task-001-*.md       one file per task
    archive/            (optional) folder-archived tasks
  sprints/
    sprint-001-*.md     ordered checklists of task ids (effort maps)
  decisions/
    decision-001-*.md   ADRs
  docs/
    doc-001-*.md        documentation
    archive/            (optional) archived docs
```

The repo root is picked from `SUIVRE_ROOT` (or the current working directory).
Machine-level preferences (theme, default view — shared across all projects) live
outside the repo at `~/.config/suivre/config.json` (XDG).

Writes are **atomic** (temp file + rename) so concurrent writers (web + CLI + MCP)
never see a half-written file.

---

## Surfaces

### Web board (CLI `board`)

Single process: Hono REST API + SSE live + serves the built SPA. Vue 3 + Vite +
UnoCSS, terminal design system (JetBrains Mono, monochrome + a few semantic accents).

### CLI (`suivre`)

Every read/write command takes `--json` for machine-readable output; multi-line
bodies ride a shell heredoc.

```
# tasks — the tracker contract
suivre add <title> [--status --priority --label --assignee --parent --depends --body]
suivre list [--status --label --assignee --ready]     board order; --ready = unblocked+unassigned+not done
suivre get <id>                                       full ticket, body and ## Comments included
suivre edit <id> [--title --status --priority --assignee --add-label --remove-label --depends --body]
suivre comment <id> <text> [--author]                 timestamped, appended under ## Comments
suivre move <id> <status>
suivre done <id> [--comment --author --archive]       close (final column), optionally archive the file
suivre next [--sprint <id>]                           next ready task (frontier)
suivre rm <id>

# sprints (effort maps), docs (specs), decisions (ADR)
suivre sprint create|list|get|add|edit|done
suivre doc create|list|get
suivre decision create|list|get

# surfaces & wiring
suivre init [name]        initialize a backlog in the current repo
suivre board [--port]     launch the live web board
suivre show [view]        reveal the desktop overlay on a view/item (macOS app)
suivre mcp                run the MCP server (stdio)
suivre setup [--yes --force --skip-skills --skip-mcp]   wire/update/repair a repo (see above)
suivre overlay install    opt-in: build + install the macOS double-⌘ overlay (never automatic)
```

Point any command at another repo with `SUIVRE_ROOT=/path/to/repo suivre …`.

### MCP

A stdio MCP server (`suivre mcp`, or `node dist/mcp/index.js`) exposes the backlog
as native tools so an agent can drive it directly — the same vocabulary as the CLI:

| Tool | Does |
| --- | --- |
| `backlog_init` / `backlog_list` | Initialize; return the full board (columns + tasks + orphans). |
| `task_list` | List tasks with filters (`status`, `label`, `assignee`, `ready`). |
| `task_get` / `task_add` / `task_edit` / `task_move` / `task_remove` | CRUD, board order preserved. |
| `task_comment` | Append a timestamped comment (`## Comments` section). |
| `task_close` | Final column + optional resolution comment + optional archive. |
| `task_next` | Next ready task; with `sprintId`, the sprint-order frontier. |
| `sprint_create` / `sprint_list` / `sprint_get` / `sprint_edit` | Effort maps with real task progress. |
| `doc_create` / `doc_list` / `doc_get` | Specs and notes, rendered in the dashboard. |
| `decision_create` / `decision_list` / `decision_get` | The ADR log. |
| `reveal_overlay` | Pop the desktop overlay on a view/item (macOS app). |

`suivre setup` wires it into the repo's `.mcp.json`; or configure your client
manually with `SUIVRE_ROOT` set to the target repo.

---

## Working with an agent

suivre.md is designed so an agent can read and maintain the board with zero ceremony.
The contract:

**Read the state**
- MCP `backlog_list`, or `GET /api/board` (also `/api/archive`, `/api/decisions`,
  `/api/docs`), or just read the `.md` files under `.suivre/`.

**Change a task** — any of these; the live board reflects it within a moment:
- MCP tools (`task_edit`, `task_move`, …) or CLI (`suivre move`, …).
- **Edit the file directly.** To change status, set the frontmatter `status` to a
  column `id` (`backlog`, `todo`, `doing`, `test`, `done`, …) or to `archived`.

**Task file anatomy**

```markdown
---
id: task-021
title: Real Notion export
status: test
priority: high
labels:
  - export
---
One-line description.

## Acceptance criteria
- [ ] OAuth connects
- [x] Base is created
```

- `status` = a column id (`archived` is reserved: it removes the task from the board
  and surfaces it in the archive instead).
- **Acceptance criteria = `- [ ]` checkboxes** in the body → they become the card's
  progress meter. Prefer them over prose for anything a human will verify.
- Labels are English; `debt` is special-cased.

**Point a human at an item** — give them a deep link. On an already-open tab the hash
is read on load, so open a fresh tab (or reload):

```
http://localhost:45188/#board/task-013       opens the task's card
http://localhost:45188/#decisions/decision-001
http://localhost:45188/#docs/doc-003
http://localhost:45188/#archive/doc-a01
```

**Decisions & docs** — edit files directly under `.suivre/decisions/` and
`.suivre/docs/` (same frontmatter + body shape as tasks).

**Language** — the *tool* (UI, statuses, labels, metadata) is always English. Task and
doc **content** (titles, bodies) may be in the project's working language.

---

## Themes & preferences

Three themes via `data-theme` on `<html>`: `terminal`, `dark` (neutral, default),
`light`. Every component reads CSS tokens only — no hardcoded colors.

Preferences are two-level:

- **Machine** (`~/.config/suivre/config.json`): theme + default view — the same across
  all projects.
- **Project** (`.suivre/preferences.json`, versioned): an optional default-view override.

The effective default view is `project.defaultView ?? machine.defaultView ?? board`.
An explicit URL hash always wins over the preference.

---

## Development

Node ≥ 20.

```bash
npm run dev        # web (Vite) + API, concurrently
npm test           # Vitest (domain + storage + service)
npm run typecheck  # tsc --noEmit (backend; the SPA is type-checked by the build)
npm run build      # SPA + node bundles
npm run format     # Prettier
```

Ports: board/API `45188`, Vite dev `45189`.

---

## Architecture

- `src/domain/` — pure core (types, schema, markdown, ranking, task/board/archive ops). Zero I/O.
- `src/storage/` — the only thing that touches disk (atomic writes, collections, paths).
- `src/service/` — orchestration shared by all surfaces.
- `src/server/` — Hono REST + SSE, serves the SPA.
- `src/cli/` — terminal commands (bin `suivre`).
- `src/mcp/` — stdio MCP server.
- `src/web/` — the Vue SPA (modular view registry).

See [`ARCHITECTURE.md`](ARCHITECTURE.md) (design) and [`CONTRACT.md`](CONTRACT.md)
(on-disk format).

## License

MIT — Kevin Barfleur.
