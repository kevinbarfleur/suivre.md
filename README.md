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
npm install
npm run build            # builds the web SPA + node bundles

# Launch the live board for a given repo (any folder with — or ready for — a .suivre/)
SUIVRE_ROOT=/path/to/your/repo npx tsx src/cli/index.ts board
# → http://localhost:45188
```

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

## Concepts

| Concept | What it is |
| --- | --- |
| **Board / columns** | The workflow, defined in `config.yml`. Each column is a `{ id, label, wipLimit? }`. A task's `status` is a column `id`. |
| **Task** | `id`, `title`, `status`, optional `priority` (`low`/`medium`/`high`/`urgent`), `labels[]`, optional `assignee`, a fractional `order` (rank in the column), optional `parent` and `depends[]`, plus `created`/`updated`. |
| **Acceptance criteria** | `- [ ]` / `- [x]` checkboxes in the task body. Surfaced as a progress meter on the card and in the list. |
| **Labels** | Free-form tags. `debt` is special-cased (highlighted as tech debt). |
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

```
suivre init [name]                 initialize a backlog in the current repo
suivre add <title> [--status] [--priority]   create a task
suivre list                        list tasks (id, status, title)
suivre move <id> <status>          move a task to a column
suivre rm <id>                     delete a task
suivre board [--port]              launch the live web board
```

Point any command at another repo with `SUIVRE_ROOT=/path/to/repo suivre …`.

### MCP

A stdio MCP server (`src/mcp/index.ts`, built to `dist/mcp/index.js`) exposes the
backlog as native tools so an agent can drive it directly:

| Tool | Does |
| --- | --- |
| `backlog_init` | Initialize a backlog (idempotent). |
| `backlog_list` | Return the board: columns + tasks (by rank) + orphans. |
| `task_add` | Create a task. |
| `task_edit` | Edit a task (title / status / priority / labels / body). |
| `task_move` | Move a task to a column, with optional `beforeId`/`afterId` placement. |
| `task_remove` | Delete a task. |

Configure it in your MCP client with `SUIVRE_ROOT` set to the target repo. (Decisions
and docs are currently web + direct-file only, not yet in the CLI/MCP.)

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
