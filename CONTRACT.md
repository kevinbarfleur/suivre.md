# Data contract — suivre.md

The web app, the CLI and the MCP server are a thin UI over the file system. No
database. This file is the single source of truth for the on-disk format, so the
three surfaces always agree.

## Layout

```
.suivre/
  config.yml              # board config (columns, id prefix)
  preferences.json        # project-level preferences (default view)
  tasks/
    task-001-<slug>.md    # one task = one file
    archive/              # tasks archived by location
  sprints/
    sprint-001-<slug>.md  # ordered checklist of task ids
  decisions/
    decision-001-<slug>.md
  docs/
    doc-001-<slug>.md
    archive/
```

`.suivre/` lives at the root of the target repo (`suivre init` creates it).

## `config.yml`

```yaml
name: Relay
taskPrefix: task
columns:
  - { id: backlog, label: Backlog }
  - { id: todo, label: To do }
  - { id: doing, label: In progress }
  - { id: done, label: Done }
```

- `columns[].id` = the possible statuses. Array order = screen order.
- `columns[].wipLimit?`: optional cap on in-progress cards.
- `taskPrefix`: id prefix (`task-001`, `task-002`, …).

## Task file

YAML frontmatter + markdown body.

```markdown
---
id: task-001
title: Fix the re-transcription loop
status: doing
priority: high
labels: [bug, capture]
assignee: kevin
order: a3
depends: [task-000]
created: 2026-07-20T10:00:00Z
updated: 2026-07-20T12:30:00Z
---

## Description

...

## Acceptance Criteria

- [ ] ...

## Notes

...
```

Frontmatter fields:

| Field | Required | Detail |
|---|---|---|
| `id` | yes | `<prefix>-<n>`, zero-padded |
| `title` | yes | — |
| `status` | yes | must match a `column.id` |
| `priority` | no | `low` \| `medium` \| `high` \| `urgent` |
| `labels` | no | list (omitted when empty) |
| `assignee` | no | e.g. `kevin`, `claude` |
| `order` | yes | lexicographic rank (fractional index) |
| `parent` | no | parent task id (subtask) |
| `depends` | no | blocking ids (omitted when empty) |
| `created` / `updated` | yes | ISO 8601 |

The body is free markdown; the `## Description`, `## Acceptance Criteria`
(checkboxes) and `## Notes` sections are conventions.

### Comments

A task's conversation history lives at the end of the body, under a
`## Comments` section (created on first comment by `suivre comment` /
`task_comment`):

```markdown
## Comments

### 2026-08-08T10:00:00Z — claude

First note.
```

One entry = `### <ISO 8601>[ — <author>]` + the text. Append-only by convention.

### Closing and archiving

`suivre done` moves the task to the board's last column. With `--archive`, the
file then moves to `tasks/archive/`: out of the active board, still versioned,
visible in the archive view.

## Guarantees

- **Atomic writes** (temp file + `rename`): never a half-written file, even with
  concurrent web + CLI + MCP writers.
- **Deterministic serialization**: fixed field order, empty optionals omitted →
  clean git diffs.
- **Orphan statuses** (unknown column): the task is surfaced, never hidden.
