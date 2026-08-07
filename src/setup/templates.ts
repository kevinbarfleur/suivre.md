/**
 * Templates écrits par `suivre setup` dans le repo de l'utilisateur. La pièce
 * centrale est l'ADAPTATEUR : le fichier `docs/agents/issue-tracker.md` que les
 * skills de Matt Pocock (aihero.dev/skills) lisent pour savoir comment parler au
 * tracker. On ne copie ni ne modifie jamais ses skills — on fournit le contrat
 * qu'elles consomment, au format de ses propres templates (GitHub / GitLab /
 * local markdown). C'est la SEULE pièce de l'intégration, versionnée ici pour
 * que `suivre setup` puisse la faire converger quand le contrat évolue.
 */

/** Version de l'adaptateur : à incrémenter à chaque évolution du template. */
export const ADAPTER_VERSION = 1

/** Chemin conventionnel (celui que les skills lisent) relatif à la racine du repo. */
export const ADAPTER_RELATIVE_PATH = 'docs/agents/issue-tracker.md'

export const ADAPTER_BODY = `# Issue tracker: suivre.md

Issues for this repo live as markdown tasks in \`.suivre/\`, managed by the \`suivre\`
CLI and rendered on a live local kanban board. Every ticket is a plain \`.md\` file
(YAML frontmatter + body) versioned with the repo — git is the history.

Every command below supports \`--json\` for machine-readable output. Use a shell
heredoc for multi-line bodies. If the \`suivre\` MCP server is connected, the same
operations exist as native tools (\`task_add\`, \`task_list\`, \`task_comment\`,
\`task_close\`, \`task_next\`, \`sprint_*\`, \`doc_*\`, \`decision_*\`,
\`reveal_overlay\`) — prefer them over shelling out.

## Conventions

- **Create a ticket**: \`suivre add "Title" --priority high --label bug --body "$(cat <<'EOF'
  ...
  EOF
  )"\`. Put the description, acceptance criteria (\`- [ ]\` checkboxes) and notes in the body.
- **Read a ticket**: \`suivre get task-013 --json\` — includes the body and its \`## Comments\` history.
- **List tickets**: \`suivre list --json\`, with \`--status <column>\`, \`--label <label>\`,
  \`--assignee <name>\` filters. \`--ready\` keeps only tickets that are unblocked,
  unassigned and not done.
- **Comment on a ticket**: \`suivre comment task-013 "..." --author <you>\`
- **Apply / remove labels**: \`suivre edit task-013 --add-label "..." --remove-label "..."\`
- **Claim / release**: \`suivre edit task-013 --assignee <you>\` / \`--assignee ""\`
- **Move through the workflow**: \`suivre move task-013 doing\` — statuses are the board's
  columns, defined in \`.suivre/config.yml\` (default: backlog / todo / doing / done).
- **Close**: \`suivre done task-013 --comment "What resolved it"\`. Add \`--archive\` to also
  move the file out of the board into \`tasks/archive/\`.
- **Blocking**: \`--depends task-012\` at creation, or \`suivre edit task-013 --depends task-012\`
  (repeatable; replaces the list). A ticket is unblocked when every dependency is in the
  final column or gone.

Triage state is recorded as labels (see \`triage-labels.md\` for the role strings).

## When a skill says "publish to the issue tracker"

Create tickets with \`suivre add\`.

## When a skill says "fetch the relevant ticket"

Run \`suivre get <id> --json\`. The user will normally pass the id directly (e.g. \`task-013\`).

## Specs, docs and ADRs

suivre stores knowledge next to the board — prefer it over loose files, so everything
shows up in the dashboard and the overlay:

- **Spec / long-form doc**: \`suivre doc create "Spec: <feature>" --tag spec --body "..."\`,
  read back with \`suivre doc get doc-003 --json\`, list with \`suivre doc list\`.
- **Decision (ADR)**: \`suivre decision create "<title>" --status accepted --body "..."\`
  with Context / Decision / Consequences in the body. Supersede an older one with
  \`--supersedes decision-001\`.

## Wayfinding operations

Used by \`/wayfinder\`. The **map** is a sprint; **child tickets** are ordinary tasks.

- **Map**: \`suivre sprint create "<effort>" --goal "<one-liner>" --body "<Notes /
  Decisions-so-far / Fog>"\` — the sprint body holds the map.
- **Child ticket**: a normal task. Add it to the map with \`suivre sprint add sprint-001
  task-014\`. Record the ticket type as a label: \`--label wayfinder:research\` (or
  \`wayfinder:prototype\` / \`wayfinder:grilling\` / \`wayfinder:task\`).
- **Blocking**: \`--depends\` ids on the child ticket.
- **Frontier**: \`suivre next --sprint sprint-001 --json\` — the first ticket in sprint
  order that is unblocked, unclaimed and not done.
- **Claim**: \`suivre edit <id> --assignee <you>\` — the session's first write.
- **Resolve**: append the answer with \`suivre comment <id> "<answer>"\`, close with
  \`suivre done <id>\`, then update the map's Decisions-so-far (\`suivre sprint get
  sprint-001 --json\` → edit the body → \`suivre sprint edit sprint-001 --body "..."\`).

## Showing your work (macOS, optional)

If the suivre desktop app is installed, reveal what you just changed — the overlay
pops over whatever the user is doing. The command is a safe no-op otherwise.

- After publishing tickets, or after a triage pass: \`suivre show board\`
- After creating or updating a map: \`suivre show sprints/<sprint-id>\`
- To point the user at one ticket: \`suivre show board/<task-id>\`
- After writing a spec or an ADR: \`suivre show docs/<doc-id>\` / \`suivre show decisions/<decision-id>\`
`

/**
 * Bloc de pointage écrit dans AGENTS.md (délimité par des marqueurs pour rester
 * idempotent). Même rôle que la ligne que le setup de Matt Pocock ajoute.
 */
export const AGENTS_POINTER_START = '<!-- suivre:tracker:start -->'
export const AGENTS_POINTER_END = '<!-- suivre:tracker:end -->'

export const AGENTS_POINTER_BLOCK = `${AGENTS_POINTER_START}
Issues for this repo are tracked with suivre.md — see \`docs/agents/issue-tracker.md\`
for how to create, read, triage and close tickets (plus specs, ADRs and sprints).
The engineering workflow follows Matt Pocock's skills: https://www.aihero.dev/skills
${AGENTS_POINTER_END}`
