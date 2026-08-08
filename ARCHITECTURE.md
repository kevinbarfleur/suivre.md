# Architecture — suivre.md

## One core, many surfaces

All business logic lives in `domain` (pure, no I/O). The surfaces — `server`,
`mcp`, `cli` — are thin adapters that call the domain through `storage`. No logic
is duplicated per surface: one place to change.

```
                ┌─────────── server (HTTP + SSE) ──┐
domain (pure) ── storage (disk) ──── mcp (agent) ──┼── same operations
                └─────────── cli (terminal) ───────┘
```

## Layers

- **`domain/`** — types + zod schemas (the model's source of truth), markdown
  parse/serialize, lexicographic ranking (`fractional-indexing`), pure operations
  (`createTask`, `editTask`, `moveTask`, `buildBoard`, comments, ready/frontier).
  Fully tested, zero I/O.
- **`storage/`** — the only component that touches disk. **Atomic writes**
  (temp + `rename`): a board has concurrent writers (web + CLI + MCP), so a file
  is never half-written. Watch (chokidar) → SSE for live updates.
- **`service/`** — orchestration shared by all surfaces.
- **`server/`** — Hono. REST (`/api/board`, `/api/task/...`) + SSE (`/api/events`),
  serves the built SPA.
- **`mcp/`** — the same operations as MCP tools (`task_add`, `task_list`,
  `task_comment`, `task_close`, `task_next`, `sprint_*`, `doc_*`, `decision_*`,
  `reveal_overlay`, …). An agent never parses files by hand.
- **`cli/`** — the `suivre` bin: tasks, sprints, docs, decisions, `board`, `mcp`,
  `setup` — one command per tracker verb, `--json` everywhere.
- **`setup/`** — the converge command: connects a repo to Matt Pocock's skills
  (aihero.dev/skills) through his official channel and writes the
  `docs/agents/issue-tracker.md` adapter (versioned with a content hash — a
  user-edited file is never overwritten).
- **`web/`** — the Vue SPA. Modules are co-located
  (`web/src/modules/<feature>/` holds its UI, store, api, types) and registered
  in an ordered view registry: adding, moving or removing a view is one folder
  and one line, with no cross-coupling.

## Data model

Defined in `CONTRACT.md`. In short: `.suivre/config.yml` (columns/statuses) +
`.suivre/tasks/<id>-<slug>.md` (YAML frontmatter + body). A task's status is a
column id. Rank is a fractional index (insertion without reindexing).

## Distribution

A single npm package, `suivre.md`: prebuilt web app + node bundles, exposing the
CLI bin, the server and the MCP entry. Install with `npm i -g suivre.md`; the
repo is also a Claude Code plugin marketplace (`/suivre-setup`).

## Fixed decisions

- Stack: Vue 3 + Vite + UnoCSS + Ark UI; Hono; strict TS; Vitest; tsup for the
  node bundles.
- Atomic writes are mandatory.
- One publishable package, dedicated repo.
- Monochrome design, small semantic palette reserved for what must stand out
  (priority, done/blocked).
