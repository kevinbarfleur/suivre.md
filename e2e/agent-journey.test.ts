import { readdir } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { callTool, mcpPayload, mcpSession, withBoard, type Board } from './harness'

/**
 * The journey `suivre setup` sells: an agent lands in a repo, reads
 * `docs/agents/issue-tracker.md`, and drives the tracker with nothing but what
 * that file prescribes — publish, triage, map, claim, close, record, then read
 * the same board back through MCP.
 *
 * So the contract is the fixture here: every command below is one the adapter
 * documents, in the form it documents. A command that does not work the way the
 * adapter promises is a defect of the product, not of this test.
 */

interface TaskJson {
  id: string
  title: string
  status: string
  priority?: string
  labels: string[]
  assignee?: string
  depends: string[]
  body: string
}

interface SprintJson {
  id: string
  title: string
  goal?: string
  status: string
  items: string[]
  body: string
}

interface DocJson {
  id: string
  title: string
  tags: string[]
  body: string
}

/** A repo an agent walks into: `suivre setup` has run, and nothing else has. */
async function wired(board: Board): Promise<string> {
  const run = board.cli('setup', '--yes', '--skip-skills')
  expect(run.status, run.stdout + run.stderr).toBe(0)
  return board.read('docs/agents/issue-tracker.md')
}

/** The adapter's own multi-line body form: quoted heredoc, terminator at column 0. */
const heredoc = (body: string): string => `"$(cat <<'EOF'\n${body}\nEOF\n)"`

/** The spec an agent is handed. Not a suivre artefact — the raw material. */
const TICKETS = [
  {
    title: 'Stream large exports instead of buffering them',
    priority: 'high',
    category: 'enhancement',
    role: 'ready-for-agent',
    body: [
      '## Description',
      '',
      'The exporter builds the whole CSV in memory before the first byte leaves',
      'the process, so a 2 GB export takes the worker down with it.',
      '',
      '## Acceptance criteria',
      '',
      '- [ ] The response streams row by row',
      '- [ ] Peak memory stays flat for a 2 GB export',
    ].join('\n'),
  },
  {
    title: 'Document the export format for integrators',
    priority: 'medium',
    category: 'enhancement',
    role: 'ready-for-human',
    body: [
      '## Description',
      '',
      'Integrators reverse-engineer the column order from sample files.',
      '',
      '## Acceptance criteria',
      '',
      '- [ ] Every column is described with its type',
      '- [ ] The streaming guarantees are stated',
    ].join('\n'),
  },
  {
    title: 'Rate-limit the export endpoint',
    priority: 'urgent',
    category: 'enhancement',
    role: 'ready-for-agent',
    body: [
      '## Description',
      '',
      'One client can saturate the export worker for everyone else.',
      '',
      '## Acceptance criteria',
      '',
      '- [ ] 10 requests per minute and per token',
      '- [ ] A 429 carries a Retry-After header',
    ].join('\n'),
  },
  {
    title: 'Reject a malformed row instead of truncating it',
    priority: 'high',
    category: 'bug',
    role: 'ready-for-agent',
    body: [
      '## Description',
      '',
      'A row with an unbalanced quote is cut in half, and the export lands',
      'half-written on the client.',
      '',
      '## Acceptance criteria',
      '',
      '- [ ] A malformed row is reported with its line number',
      '- [ ] The export fails loudly instead of truncating',
    ].join('\n'),
  },
] as const

const ID = (index: number): string => `task-00${index + 1}`

const SPEC_DOC = {
  title: 'Spec: hardened CSV export',
  tag: 'spec',
  body: ['## Goal', '', 'Exports survive a hostile client and a 2 GB dataset.'].join('\n'),
}

const ADR = {
  title: 'Stream exports rather than paginate them',
  status: 'accepted',
  body: [
    '## Context',
    '',
    'The export endpoint buffers whole datasets in memory.',
    '',
    '## Decision',
    '',
    'Stream the CSV row by row, behind a per-token rate limit.',
    '',
    '## Consequences',
    '',
    '- Clients must tolerate a slow first byte.',
    '- A retry restarts the export from the beginning.',
  ].join('\n'),
}

/** Act 1, as an agent would batch it: one shell, one `suivre add` per ticket. */
function publish(board: Board): void {
  const script = TICKETS.map(
    (ticket) =>
      `suivre add "${ticket.title}" --priority ${ticket.priority} ` +
      `--label ${ticket.category} --label needs-triage --body ${heredoc(ticket.body)}`,
  ).join('\n')
  const run = board.sh(script, 'zsh')
  expect(run.status, run.stderr).toBe(0)
}

/** Act 2: one state role per ticket, replacing the one it was published with. */
function triage(board: Board): void {
  for (const [index, ticket] of TICKETS.entries()) {
    const run = board.cli(
      'edit',
      ID(index),
      '--add-label',
      ticket.role,
      '--remove-label',
      'needs-triage',
    )
    expect(run.status, run.stderr).toBe(0)
  }
}

/** Act 3: the map, in an order the board's own ranking would not produce. */
function map(board: Board): SprintJson {
  const sprint = board
    .cli(
      'sprint',
      'create',
      'Harden the CSV export',
      '--goal',
      'Exports survive a hostile client',
      '--item',
      'task-002',
      '--item',
      'task-001',
      '--json',
    )
    .json<SprintJson>()
  expect(board.cli('sprint', 'add', sprint.id, 'task-003', 'task-004').status).toBe(0)
  // The doc cannot be written before the format it documents exists.
  expect(board.cli('edit', 'task-002', '--depends', 'task-001').status).toBe(0)
  return sprint
}

/** A backlog item IS its file, so the assertions that matter read the file. */
async function itemFile(board: Board, collection: string, id: string): Promise<string> {
  const dir = join(board.root, '.suivre', collection)
  const names = await readdir(dir)
  const name = names.find((file) => file.startsWith(`${id}-`))
  if (!name) throw new Error(`no ${collection} file for ${id} among: ${names.join(', ')}`)
  return board.read(join('.suivre', collection, name))
}

const taskFile = (board: Board, id: string): Promise<string> => itemFile(board, 'tasks', id)

/** The column ids the adapter says to read from the config rather than guess. */
async function columnIds(board: Board): Promise<string[]> {
  const config = await board.read('.suivre/config.yml')
  return [...config.matchAll(/^ {2}- id: (\S+)$/gm)].map((match) => match[1]!)
}

/**
 * The MCP tools the adapter promises: an agent calls them without checking.
 * Anchored on the section heading rather than on a sentence — rewording the
 * prose must not silently empty this list and make the assertion vacuous.
 */
function promisedTools(adapter: string): string[] {
  const from = adapter.indexOf('## MCP tools')
  if (from < 0) throw new Error('the adapter no longer has an MCP tools section')
  const rest = adapter.slice(from + '## MCP tools'.length)
  const end = rest.indexOf('\n## ')
  const section = end < 0 ? rest : rest.slice(0, end)
  const tools = [...section.matchAll(/`([a-z]+_[a-z_]+)`/g)].map((match) => match[1]!)
  if (tools.length < 15) throw new Error(`only ${tools.length} tools found — the anchor moved`)
  return [...new Set(tools)]
}

describe('the journey docs/agents/issue-tracker.md prescribes', () => {
  it('publishes a spec as four tickets, bodies and checkboxes intact', async () => {
    await withBoard(
      async (board) => {
        const adapter = await wired(board)
        // The form used below is the one the adapter hands to the agent.
        expect(adapter).toContain(`--body "$(cat <<'EOF'`)
        expect(adapter).toContain('\nEOF\n)"')

        publish(board)

        const tasks = board.cli('list', '--json').json<TaskJson[]>()
        expect(tasks.map((task) => task.id)).toEqual(TICKETS.map((_, index) => ID(index)))

        for (const [index, ticket] of TICKETS.entries()) {
          const file = await taskFile(board, ID(index))
          expect(file).toContain(`id: ${ID(index)}`)
          expect(file).toContain(`title: ${ticket.title}`)
          // The whole body, verbatim: headings, blank lines and `- [ ]` lines
          // are exactly what a shell or an argv parser eats on the way in.
          expect(file).toContain(ticket.body)
          expect(tasks[index]).toMatchObject({
            title: ticket.title,
            priority: ticket.priority,
            labels: [ticket.category, 'needs-triage'],
            body: ticket.body,
          })
        }
      },
      { init: false },
    )
  })

  it('triages the tickets into queues an agent can read back by label', async () => {
    await withBoard(
      async (board) => {
        const adapter = await wired(board)
        expect(adapter).toContain('--add-label')
        expect(adapter).toContain('suivre list --label ready-for-agent --json')

        publish(board)
        triage(board)

        const queue = (label: string): string[] =>
          board
            .cli('list', '--label', label, '--json')
            .json<TaskJson[]>()
            .map((task) => task.id)

        expect(queue('ready-for-agent')).toEqual(['task-001', 'task-003', 'task-004'])
        expect(queue('ready-for-human')).toEqual(['task-002'])
        expect(queue('needs-triage')).toEqual([])
        expect(queue('bug')).toEqual(['task-004'])

        // Triage is state on disk, not a report: it survives the process.
        const file = await taskFile(board, 'task-004')
        expect(file).toContain('- bug')
        expect(file).toContain('- ready-for-agent')
        expect(file).not.toContain('- needs-triage')
      },
      { init: false },
    )
  })

  it('maps the tickets in a sprint and walks the frontier: claim, close, move on', async () => {
    await withBoard(
      async (board) => {
        const adapter = await wired(board)
        expect(adapter).toContain('suivre next --sprint sprint-001 --json')

        publish(board)
        triage(board)
        const sprint = map(board)
        expect(sprint.id).toBe('sprint-001')
        expect(sprint.status).toBe('active')
        expect(sprint.goal).toBe('Exports survive a hostile client')

        // The adapter's discovery path for "the current sprint".
        const sprints = board.cli('sprint', 'list', '--json').json<SprintJson[]>()
        expect(sprints.filter((item) => item.status === 'active').at(-1)).toMatchObject({
          id: 'sprint-001',
          items: ['task-002', 'task-001', 'task-003', 'task-004'],
        })
        expect(await taskFile(board, 'task-002')).toContain('- task-001')

        const frontier = (): TaskJson | null =>
          board.cli('next', '--sprint', sprint.id, '--json').json<TaskJson | null>()

        // task-002 leads the map but is blocked, so the frontier steps over it.
        expect(frontier()?.id).toBe('task-001')

        expect(board.cli('edit', 'task-001', '--assignee', 'claude').status).toBe(0)
        expect(frontier()?.id).toBe('task-003')

        const columns = await columnIds(board)
        expect(columns).toEqual(['backlog', 'todo', 'doing', 'done'])
        expect(board.cli('move', 'task-001', 'doing').status).toBe(0)

        expect(
          board.cli(
            'comment',
            'task-001',
            'Streaming writer lands rows as they are produced.',
            '--author',
            'claude',
          ).status,
        ).toBe(0)

        const closed = board
          .cli(
            'done',
            'task-001',
            '--comment',
            'Both criteria pass: memory stays flat at 2 GB.',
            '--author',
            'claude',
            '--json',
          )
          .json<TaskJson>()
        expect(closed.status).toBe(columns.at(-1))

        const file = await taskFile(board, 'task-001')
        expect(file).toContain('## Comments')
        expect(file).toContain('Streaming writer lands rows as they are produced.')
        expect(file).toContain('Both criteria pass: memory stays flat at 2 GB.')
        // Closing rewrote the frontmatter, not the ticket: the description, the
        // acceptance criteria and the earlier comment are all still there.
        expect(file).toContain(TICKETS[0].body)
        expect(file.indexOf('Streaming writer')).toBeLessThan(file.indexOf('Both criteria'))

        // Closing task-001 unblocks the ticket that leads the map.
        expect(frontier()?.id).toBe('task-002')
      },
      { init: false },
    )
  })

  it('records a spec and an ADR, and reads them back', async () => {
    await withBoard(
      async (board) => {
        const adapter = await wired(board)
        expect(adapter).toContain('suivre doc create')
        expect(adapter).toContain('suivre decision create')

        const script = [
          `suivre doc create "${SPEC_DOC.title}" --tag ${SPEC_DOC.tag} --body ${heredoc(SPEC_DOC.body)}`,
          `suivre decision create "${ADR.title}" --status ${ADR.status} --body ${heredoc(ADR.body)}`,
        ].join('\n')
        const run = board.sh(script, 'zsh')
        expect(run.status, run.stderr).toBe(0)

        const doc = board.cli('doc', 'get', 'doc-001', '--json').json<DocJson>()
        expect(doc).toMatchObject({
          id: 'doc-001',
          title: SPEC_DOC.title,
          tags: [SPEC_DOC.tag],
          body: SPEC_DOC.body,
        })
        expect(await itemFile(board, 'docs', 'doc-001')).toContain(SPEC_DOC.body)

        const decision = board.cli('decision', 'get', 'decision-001')
        expect(decision.status, decision.stderr).toBe(0)
        expect(decision.stdout).toContain('[accepted]')
        expect(decision.stdout).toContain(ADR.title)
        expect(decision.stdout).toContain('## Consequences')
        expect(await itemFile(board, 'decisions', 'decision-001')).toContain(ADR.body)
      },
      { init: false },
    )
  })

  it('shows an agent the same board through MCP as through the CLI', async () => {
    await withBoard(
      async (board) => {
        const adapter = await wired(board)
        publish(board)
        triage(board)
        const sprint = map(board)
        expect(board.cli('edit', 'task-001', '--assignee', 'claude').status).toBe(0)
        expect(
          board.cli('comment', 'task-001', 'Picked this up.', '--author', 'claude').status,
        ).toBe(0)

        const responses = await board.mcp(
          mcpSession(
            { id: 1, method: 'tools/list', params: {} },
            callTool(2, 'task_list'),
            callTool(3, 'task_get', { id: 'task-001' }),
            callTool(4, 'sprint_get', { id: sprint.id }),
            callTool(5, 'task_next', { sprintId: sprint.id }),
          ),
        )

        // A tool the adapter names but the server does not register costs a
        // whole workflow run — the agent calls it without checking.
        const registered = ((responses.get(1)?.result?.['tools'] ?? []) as { name: string }[]).map(
          (tool) => tool.name,
        )
        const promised = promisedTools(adapter)
        expect(promised.length).toBeGreaterThan(0)
        for (const tool of promised) expect(registered).toContain(tool)

        expect(mcpPayload<{ tasks: TaskJson[] }>(responses.get(2)).tasks).toEqual(
          board.cli('list', '--json').json<TaskJson[]>(),
        )
        expect(mcpPayload<{ task: TaskJson }>(responses.get(3)).task).toEqual(
          board.cli('get', 'task-001', '--json').json<TaskJson>(),
        )
        expect(mcpPayload<{ task: TaskJson | null }>(responses.get(5)).task).toEqual(
          board.cli('next', '--sprint', sprint.id, '--json').json<TaskJson | null>(),
        )

        const { progress, ...fields } = board
          .cli('sprint', 'get', sprint.id, '--json')
          .json<SprintJson & { progress: { done: number; total: number } }>()
        const seen = mcpPayload<{
          sprint: SprintJson
          progress: { done: number; total: number; currentIndex: number }
          steps: { id: string; status: string | null }[]
        }>(responses.get(4))
        expect(seen.sprint).toEqual(fields)
        expect(seen.progress).toMatchObject(progress)
        expect(seen.steps.map((step) => step.id)).toEqual(fields.items)
      },
      { init: false },
    )
  })
})
