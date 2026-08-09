/**
 * Templates `suivre setup` writes into the user's repo. The central one is the
 * ADAPTER: the `docs/agents/issue-tracker.md` file that Matt Pocock's skills
 * (aihero.dev/skills) read to know how to talk to the tracker. His skills are
 * never copied or modified — we only provide the contract they consume, in the
 * format of his own templates (GitHub / GitLab / local markdown). It is the
 * only piece of the integration, versioned here so `suivre setup` can converge
 * it when the contract changes.
 *
 * Everything the adapter claims is a promise an agent will act on without
 * checking: a flag that does not exist, a file that is never written or a tool
 * that is missing costs a whole workflow run.
 */

/** Adapter version: bump on every template change. */
export const ADAPTER_VERSION = 3

/** Conventional path (the one the skills read), relative to the repo root. */
export const ADAPTER_RELATIVE_PATH = 'docs/agents/issue-tracker.md'

export const ADAPTER_BODY = `# Issue tracker: suivre.md

Issues for this repo live as markdown tasks in \`.suivre/\`, managed by the \`suivre\`
CLI and rendered on a live local kanban board. Every ticket is a plain \`.md\` file
(YAML frontmatter + body) versioned with the repo — git is the history.

**A ticket is a task; a spec is a doc.** \`suivre add\` publishes a ticket to the
board; \`suivre doc create\` publishes a spec or any long-form document. Never
publish a spec with \`suivre add\` — it would land on the board and \`suivre next\`
would hand it to \`/implement\` as if it were a unit of work.

Every command that reads or writes takes \`--json\`: \`add\`, \`get\`, \`list\`,
\`edit\`, \`comment\`, \`move\`, \`done\`, \`next\`, \`rm\`, \`init\`, \`show\`, and every
\`sprint\` / \`doc\` / \`decision\` subcommand. Only the long-running \`board\`,
\`mcp\` and \`setup\` do not. An unknown flag aborts the command, so never add one
speculatively.

A fifth status, \`archived\`, exists alongside the board's columns. It takes a
ticket off the board entirely and is NOT a way to finish work — close with
\`suivre done\` instead, and add \`--archive\` when the file should also leave the
board. Never set \`archived\` yourself.

## Read the board before writing to it

Two things differ per repo and cannot be guessed:

- **The column ids** that \`--status\` and \`suivre move\` accept: the \`columns:\`
  list in \`.suivre/config.yml\` (default: backlog / todo / doing / done). The
  last column is the "done" one.
- **The current sprint id**: \`suivre sprint list --json\` — the entry whose
  \`status\` is \`active\` (the last one, if there are several).

## Conventions

- **Create a ticket**: \`suivre add "Title" --priority high --label bug\` —
  \`--priority\` is low|medium|high|urgent; \`--label\` and \`--depends\` repeat.
- **Read a ticket**: \`suivre get task-013 --json\` — includes the body and its \`## Comments\` history.
- **List tickets**: \`suivre list --json\`, with \`--status <column>\`, \`--label <label>\`,
  \`--assignee <name>\` filters. \`--ready\` keeps only tickets that are unblocked,
  unassigned and not done.
- **Comment on a ticket**: \`suivre comment task-013 "..." --author <you>\`
- **Apply / remove labels**: \`suivre edit task-013 --add-label "..." --remove-label "..."\`
- **Claim / release**: \`suivre edit task-013 --assignee <you>\` / \`--assignee ""\`
- **Move through the workflow**: \`suivre move task-013 doing\` — statuses are the board's
  columns (see above).
- **Close**: \`suivre done task-013 --comment "What resolved it"\`. Add \`--archive\` to also
  move the file out of the board into \`tasks/archive/\`.
- **Blocking**: \`--depends task-012\` at creation, or \`suivre edit task-013 --depends task-012\`
  (repeatable, and it REPLACES the list — pass every id you want to keep). A ticket is
  unblocked when every dependency is in the final column or gone.

The description, acceptance criteria (\`- [ ]\` checkboxes) and notes go in the
body. For a multi-line body, use a heredoc — its terminator MUST sit at column 0.
Indented, zsh (Claude Code's default shell on macOS) fails the whole command with
\`unmatched "\` and no ticket is created:

\`\`\`bash
suivre add "Rate-limit the export endpoint" --priority high --label bug --body "$(cat <<'EOF'
## Context

Why this matters.

## Acceptance criteria

- [ ] ...
EOF
)"
\`\`\`

Every other \`--body\` flag (\`edit\`, \`doc create\`, \`decision create\`,
\`sprint create\`, \`sprint edit\`) takes the same form.

## Triage roles

Triage state is recorded as labels. The five canonical state roles are
\`needs-triage\`, \`needs-info\`, \`ready-for-agent\`, \`ready-for-human\` and
\`wontfix\`; the category roles are \`bug\` and \`enhancement\`. The mapping from
those roles to the strings this repo actually uses lives in
\`docs/agents/triage-labels.md\` — read it before applying a label, and edit it
rather than inventing synonyms.

Transition a ticket with
\`suivre edit task-013 --add-label ready-for-agent --remove-label needs-triage\`,
and read a queue with \`suivre list --label ready-for-agent --json\`.

## When a skill says "publish to the issue tracker"

One ticket per unit of work, with \`suivre add\` (heredoc form above). A spec is
not a ticket — see "Specs, docs and ADRs".

## When a skill says "fetch the relevant ticket"

Run \`suivre get <id> --json\`. The user will normally pass the id directly (e.g. \`task-013\`).

## Specs, docs and ADRs

suivre stores knowledge next to the board — prefer it over loose files, so everything
shows up in the dashboard and the overlay:

- **Spec / long-form doc**: \`suivre doc create "Spec: <feature>" --tag spec --body "..."\`,
  read back with \`suivre doc get doc-003 --json\`, list with \`suivre doc list --json\`.
- **Decision (ADR)**: \`suivre decision create "<title>" --status accepted --body "..."\`
  with Context / Decision / Consequences in the body. Supersede an older one with
  \`--supersedes decision-001\`.

Turning a spec into tickets is two steps: \`suivre doc create\` for the spec, then
one \`suivre add\` per ticket, each naming the doc id in its body.

## Wayfinding operations

Used by \`/wayfinder\`. The **map** is a sprint; **child tickets** are ordinary tasks.

- **Map**: \`suivre sprint create "<effort>" --goal "<one-liner>" --body "<Notes /
  Decisions-so-far / Fog>"\` — the sprint body holds the map.
- **Child ticket**: a normal task. Add it to the map with \`suivre sprint add sprint-001
  task-014\` (this one APPENDS). Record the ticket type as a label:
  \`--label wayfinder:research\` (or \`wayfinder:prototype\` / \`wayfinder:grilling\` /
  \`wayfinder:task\`).
- **Blocking**: \`--depends\` ids on the child ticket.
- **Frontier**: \`suivre next --sprint sprint-001 --json\` — the first ticket in sprint
  order that is unblocked, unclaimed and not done.
- **Claim**: \`suivre edit <id> --assignee <you>\` — the session's first write.
- **Resolve**: append the answer with \`suivre comment <id> "<answer>"\`, close with
  \`suivre done <id>\`, then update the map's Decisions-so-far (\`suivre sprint get
  sprint-001 --json\` → edit the body → \`suivre sprint edit sprint-001 --body "..."\`).

## MCP tools

If the \`suivre\` MCP server is connected, the same operations exist as native
tools — prefer them over shelling out: \`backlog_init\`, \`backlog_list\`,
\`task_add\`, \`task_get\`, \`task_list\`, \`task_edit\`, \`task_move\`,
\`task_comment\`, \`task_close\`, \`task_next\`, \`task_remove\`, \`sprint_create\`,
\`sprint_get\`, \`sprint_list\`, \`sprint_add\`, \`sprint_edit\`, \`sprint_done\`,
\`doc_create\`, \`doc_get\`, \`doc_list\`, \`doc_edit\`, \`decision_create\`,
\`decision_get\`, \`decision_list\`, \`decision_edit\`, \`reveal_overlay\`.

Two places where the tools do NOT mirror the CLI:

- **List fields replace, they do not merge.** \`task_edit {labels}\`,
  \`task_edit {depends}\` and \`sprint_edit {items}\` overwrite the whole list.
  Read the current value with \`task_get\` / \`sprint_get\` first, then send the
  full new list. There is no tool equivalent of \`--add-label\` / \`--remove-label\`.
  \`sprint_add\` is the exception: it appends without replacing, so prefer it
  over a \`sprint_get\` + \`sprint_edit\` round trip, which two agents working at
  once can lose.

## Showing your work (macOS, optional)

If the suivre desktop app is installed, reveal what you just changed — the overlay
pops over whatever the user is doing. When it is not installed the command says
so and still exits 0, so it is always safe to call at the end of a step.

- After publishing tickets, or after a triage pass: \`suivre show board\`
- After creating or updating a map: \`suivre show sprints/<sprint-id>\`
- To point the user at one ticket: \`suivre show board/<task-id>\`
- After writing a spec or an ADR: \`suivre show docs/<doc-id>\` / \`suivre show decisions/<decision-id>\`
`

/** Where the triage role → label mapping lives (the path the skills read). */
export const TRIAGE_LABELS_RELATIVE_PATH = 'docs/agents/triage-labels.md'

/**
 * The label vocabulary the adapter points at. Written ONCE and never converged:
 * it is the user's vocabulary, and overwriting it would silently re-point every
 * skill at labels they had renamed.
 */
export const TRIAGE_LABELS_BODY = `# Triage Labels

The skills speak in terms of five canonical triage roles. This file maps them to
the label strings used in this repo's tracker — with suivre.md, a label is an
entry in a task's \`labels:\` frontmatter.

| Canonical role    | Label in our tracker | Meaning                                  |
| ----------------- | -------------------- | ---------------------------------------- |
| \`needs-triage\`    | \`needs-triage\`       | Maintainer needs to evaluate this issue  |
| \`needs-info\`      | \`needs-info\`         | Waiting on reporter for more information |
| \`ready-for-agent\` | \`ready-for-agent\`    | Fully specified, ready for an AFK agent  |
| \`ready-for-human\` | \`ready-for-human\`    | Requires human implementation            |
| \`wontfix\`         | \`wontfix\`            | Will not be actioned                     |

Alongside exactly one state role, every triaged ticket carries one category
role: \`bug\` (something is broken) or \`enhancement\` (new feature or improvement).

Apply and clear roles with
\`suivre edit <id> --add-label ready-for-agent --remove-label needs-triage\`, and
read a queue with \`suivre list --label ready-for-agent --json\`. There is nothing
to create up front: labels exist as soon as a ticket carries them.

Edit the middle column to match whatever vocabulary you actually use. \`suivre
setup\` writes this file once and never overwrites it.
`

/**
 * Pointer block written into CLAUDE.md / AGENTS.md (marker-delimited to stay
 * idempotent). Same role as the line Matt Pocock's own setup adds.
 */
export const AGENTS_POINTER_START = '<!-- suivre:tracker:start -->'
export const AGENTS_POINTER_END = '<!-- suivre:tracker:end -->'

export const AGENTS_POINTER_BLOCK = `${AGENTS_POINTER_START}
Issues for this repo are tracked with suivre.md — see \`docs/agents/issue-tracker.md\`
for how to create, read, triage and close tickets (plus specs, ADRs and sprints),
and \`docs/agents/triage-labels.md\` for the triage role strings.
The engineering workflow follows Matt Pocock's skills: https://www.aihero.dev/skills
${AGENTS_POINTER_END}`
