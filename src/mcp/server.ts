import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { version } from '../../package.json'
import { BoardService } from '../service/board-service'
import { findRoot } from '../storage'
import { decisionStatusSchema, prioritySchema, sprintStatusSchema } from '../domain'
import type { Decision, Doc, Sprint, Task } from '../domain'

/**
 * MCP surface: exposes the backlog as native tools so an agent can drive it
 * directly (writes files → if the board is running, the file-watcher refreshes
 * the live screen). Thin adapter over the service, like the server and the CLI.
 * The vocabulary covers the "issue tracker" contract of agentic workflows
 * (create/read/list/comment/close + sprints/docs/decisions + reveal).
 *
 * Three conventions hold across every tool, so one "did it work?" check works
 * everywhere:
 * - the result is always a JSON object keyed by what it carries (`task`,
 *   `tasks`, `sprint`, …) — never a bare entity, never a key that is absent
 *   exactly on success;
 * - a missing id is an error (`isError: true`), never a successful result
 *   carrying `{ error: 'not-found' }`;
 * - entities use the same flattened shape as the CLI's `--json` (frontmatter
 *   fields + `body`, without the internal rank).
 */

const asText = (value: unknown) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }],
})

function taskJson(task: Task): Record<string, unknown> {
  const { order: _order, ...fm } = task.frontmatter
  return { ...fm, body: task.body }
}

function sprintJson(sprint: Sprint): Record<string, unknown> {
  return { ...sprint.frontmatter, body: sprint.body }
}

function docJson(doc: Doc): Record<string, unknown> {
  return { ...doc.frontmatter, body: doc.body }
}

function decisionJson(decision: Decision): Record<string, unknown> {
  return { ...decision.frontmatter, body: decision.body }
}

/** The service's marker for "closed, but the file could not be archived". */
const PARTIAL_ARCHIVE = 'Task closed but not archived:'

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error)

/** Statuses are board-configured: the description cannot enumerate them. */
const STATUS_HINT = 'a column id from `backlog_list`, or `archived`'

const REPLACES =
  'Every field REPLACES the current value: `body` overwrites the whole markdown and a list ' +
  'field overwrites the whole list, so read the current value first and send it back in ' +
  'full. An omitted field is left untouched.'

/**
 * An MCP client is launched by an editor from an arbitrary cwd: walk up to the
 * repo's board instead of scaffolding a second one in a subdirectory.
 */
export function resolveMcpRoot(start = process.env.SUIVRE_ROOT ?? process.cwd()): string {
  return findRoot(start) ?? start
}

export function createMcpServer(root: string): McpServer {
  const service = new BoardService(root)
  const server = new McpServer({ name: 'suivre', version })

  // --- Board & tasks ---

  server.registerTool(
    'backlog_init',
    {
      description: 'Initialize a markdown backlog in the current repo (idempotent).',
      inputSchema: { name: z.string().optional() },
    },
    async ({ name }) => asText({ config: await service.init(name ?? 'Backlog') }),
  )

  server.registerTool(
    'backlog_list',
    {
      description: 'Return the board: columns + tasks sorted by rank, and the orphans.',
      inputSchema: {},
    },
    async () => {
      const board = await service.getBoard()
      // Same wording as the service's own guard: one message for one cause.
      if (!board) throw new Error('Backlog not initialized — run `suivre init` first.')
      return asText({
        board: {
          config: board.config,
          columns: board.columns.map(({ column, tasks }) => ({
            column,
            tasks: tasks.map(taskJson),
          })),
          orphans: board.orphans.map(taskJson),
        },
      })
    },
  )

  server.registerTool(
    'task_list',
    {
      description:
        'List tasks (board order), with filters: status (column), label, assignee, ' +
        'ready (not final, unassigned, dependencies resolved). `invalid` lists the task ' +
        'files that could not be parsed — they are missing from `tasks`.',
      inputSchema: {
        status: z.string().optional(),
        label: z.string().optional(),
        assignee: z.string().optional(),
        ready: z.boolean().optional(),
      },
    },
    async (filter) => {
      const { tasks, invalid } = await service.readTasks(filter)
      return asText({ tasks: tasks.map(taskJson), invalid })
    },
  )

  server.registerTool(
    'task_get',
    {
      description: 'Return a full task (fields + markdown body). Errors if the id is unknown.',
      inputSchema: { id: z.string() },
    },
    async ({ id }) => {
      const task = await service.getTask(id)
      if (!task) throw new Error(`Task not found: ${id}`)
      return asText({ task: taskJson(task) })
    },
  )

  server.registerTool(
    'task_add',
    {
      description: `Create a task and return its persisted version. status: ${STATUS_HINT} (default: the first column).`,
      inputSchema: {
        title: z.string(),
        status: z.string().optional(),
        priority: prioritySchema.optional(),
        labels: z.array(z.string()).optional(),
        assignee: z.string().optional(),
        parent: z.string().optional(),
        depends: z.array(z.string()).optional(),
        body: z.string().optional(),
      },
    },
    async (args) => asText({ task: taskJson(await service.create(args)) }),
  )

  server.registerTool(
    'task_edit',
    {
      description:
        'Edit a task (title / status / priority / labels / assignee / parent / depends / body). ' +
        `${REPLACES} The \`## Comments\` section is the one exception: it survives a body ` +
        'rewrite. assignee: "" to unassign.',
      inputSchema: {
        id: z.string(),
        title: z.string().optional(),
        status: z.string().optional(),
        priority: prioritySchema.optional(),
        labels: z.array(z.string()).optional(),
        assignee: z.string().optional(),
        parent: z.string().optional(),
        depends: z.array(z.string()).optional(),
        body: z.string().optional(),
      },
    },
    async ({ id, assignee, ...patch }) => {
      const task = await service.edit(id, {
        ...patch,
        ...(assignee !== undefined ? { assignee: assignee === '' ? undefined : assignee } : {}),
      })
      return asText({ task: taskJson(task) })
    },
  )

  server.registerTool(
    'task_comment',
    {
      description:
        'Append a timestamped comment to a task (## Comments section of the body). ' +
        'Additive: it never rewrites the rest of the body.',
      inputSchema: {
        id: z.string(),
        text: z.string(),
        author: z.string().optional(),
      },
    },
    async ({ id, text, author }) =>
      asText({ task: taskJson(await service.comment(id, text, author)) }),
  )

  server.registerTool(
    'task_move',
    {
      description: `Move a task to a column (${STATUS_HINT}), with optional placement (beforeId / afterId).`,
      inputSchema: {
        id: z.string(),
        status: z.string(),
        beforeId: z.string().optional(),
        afterId: z.string().optional(),
      },
    },
    async ({ id, status, beforeId, afterId }) =>
      asText({ task: taskJson(await service.move(id, status, { beforeId, afterId })) }),
  )

  server.registerTool(
    'task_close',
    {
      description:
        'Close a task: final column, optional resolution comment, optional archiving. ' +
        '`archived` reports whether the file reached tasks/archive/ — when it is false ' +
        'with a `warning`, the task IS closed and only the archiving failed.',
      inputSchema: {
        id: z.string(),
        comment: z.string().optional(),
        author: z.string().optional(),
        archive: z.boolean().optional(),
      },
    },
    async ({ id, ...opts }) => {
      try {
        const task = await service.close(id, opts)
        return asText({ task: taskJson(task), archived: opts.archive === true })
      } catch (error) {
        const message = messageOf(error)
        // A failed archive leaves the task closed: reporting a plain failure
        // would send the agent back to re-close what is already done.
        const task = message.startsWith(PARTIAL_ARCHIVE) ? await service.getTask(id) : null
        if (!task) throw error
        return asText({ task: taskJson(task), archived: false, warning: message })
      }
    },
  )

  server.registerTool(
    'task_next',
    {
      description:
        'Next "ready" task (not final, unassigned, dependencies resolved), or `task: null` ' +
        'when nothing is ready. With sprintId: the frontier follows the sprint order.',
      inputSchema: { sprintId: z.string().optional() },
    },
    async ({ sprintId }) => {
      const task = await service.next(sprintId)
      return asText({ task: task ? taskJson(task) : null })
    },
  )

  server.registerTool(
    'task_remove',
    {
      description: 'Delete a task. Errors if the id is unknown.',
      inputSchema: { id: z.string() },
    },
    async ({ id }) => {
      if (!(await service.remove(id))) throw new Error(`Task not found: ${id}`)
      return asText({ removed: true, id })
    },
  )

  // --- Sprints (the "map" of an effort) ---

  server.registerTool(
    'sprint_create',
    {
      description:
        'Create a sprint: ORDERED checklist of existing tasks (items = ids). The body carries ' +
        "the effort's notes (notes / decisions / open questions).",
      inputSchema: {
        title: z.string(),
        goal: z.string().optional(),
        items: z.array(z.string()).optional(),
        body: z.string().optional(),
      },
    },
    async (args) => asText({ sprint: sprintJson(await service.createSprint(args)) }),
  )

  server.registerTool('sprint_list', { description: 'List sprints.', inputSchema: {} }, async () =>
    asText({ sprints: (await service.listSprints()).map(sprintJson) }),
  )

  server.registerTool(
    'sprint_get',
    {
      description:
        'Return a sprint with the real progress of its tasks: `steps` in sprint order and ' +
        '`progress.currentIndex`, the first step that is not done (-1 when all are).',
      inputSchema: { id: z.string() },
    },
    async ({ id }) => {
      const progress = await service.sprintProgress(id)
      if (!progress) throw new Error(`Sprint not found: ${id}`)
      const { sprint, resolved } = progress
      return asText({
        sprint: sprintJson(sprint),
        progress: {
          done: resolved.done,
          total: resolved.total,
          currentIndex: resolved.currentIndex,
        },
        steps: resolved.steps.map((step) => ({
          id: step.id,
          title: step.task?.frontmatter.title ?? null,
          status: step.status,
          done: step.done,
        })),
      })
    },
  )

  server.registerTool(
    'sprint_edit',
    {
      description: `Edit a sprint (title / goal / status / items / body). ${REPLACES} To append tasks instead, use sprint_add.`,
      inputSchema: {
        id: z.string(),
        title: z.string().optional(),
        goal: z.string().optional(),
        status: sprintStatusSchema.optional(),
        items: z.array(z.string()).optional(),
        body: z.string().optional(),
      },
    },
    async ({ id, ...patch }) => asText({ sprint: sprintJson(await service.editSprint(id, patch)) }),
  )

  server.registerTool(
    'sprint_add',
    {
      description:
        'Append task ids to a sprint, in order, skipping the ones already in it. ' +
        'This is the additive counterpart of sprint_edit {items}, which replaces the list.',
      inputSchema: { id: z.string(), taskIds: z.array(z.string()) },
    },
    async ({ id, taskIds }) => {
      const sprint = await service.getSprint(id)
      if (!sprint) throw new Error(`Sprint not found: ${id}`)
      const items = [...sprint.frontmatter.items]
      for (const taskId of taskIds) if (!items.includes(taskId)) items.push(taskId)
      return asText({ sprint: sprintJson(await service.editSprint(id, { items })) })
    },
  )

  server.registerTool(
    'sprint_done',
    {
      description: 'Mark a sprint done. Its tasks keep their own status.',
      inputSchema: { id: z.string() },
    },
    async ({ id }) =>
      asText({ sprint: sprintJson(await service.editSprint(id, { status: 'done' })) }),
  )

  server.registerTool(
    'sprint_remove',
    {
      description: 'Delete a sprint. The tasks it lists are untouched.',
      inputSchema: { id: z.string() },
    },
    async ({ id }) => asText({ removed: (await service.removeSprint(id)) ? id : null }),
  )

  // --- Knowledge: docs (specs) and decisions (ADR) ---

  server.registerTool(
    'doc_create',
    {
      description: 'Create a doc (spec, note, reference), rendered read-only in the dashboard.',
      inputSchema: {
        title: z.string(),
        tags: z.array(z.string()).optional(),
        body: z.string().optional(),
      },
    },
    async (args) => asText({ doc: docJson(await service.createDoc(args)) }),
  )

  server.registerTool('doc_list', { description: 'List docs.', inputSchema: {} }, async () =>
    asText({ docs: (await service.listDocs()).map(docJson) }),
  )

  server.registerTool(
    'doc_get',
    {
      description: 'Return a full doc. Errors if the id is unknown.',
      inputSchema: { id: z.string() },
    },
    async ({ id }) => {
      const doc = await service.getDoc(id)
      if (!doc) throw new Error(`Doc not found: ${id}`)
      return asText({ doc: docJson(doc) })
    },
  )

  server.registerTool(
    'doc_edit',
    {
      description: `Edit a doc (title / tags / body). ${REPLACES}`,
      inputSchema: {
        id: z.string(),
        title: z.string().optional(),
        tags: z.array(z.string()).optional(),
        body: z.string().optional(),
      },
    },
    async ({ id, ...patch }) => asText({ doc: docJson(await service.editDoc(id, patch)) }),
  )

  server.registerTool(
    'doc_remove',
    {
      description: 'Delete a doc. The file is removed from the repo.',
      inputSchema: { id: z.string() },
    },
    async ({ id }) => asText({ removed: (await service.removeDoc(id)) ? id : null }),
  )

  server.registerTool(
    'decision_create',
    {
      description: 'Record a decision (ADR): Context / Decision / Consequences in the body.',
      inputSchema: {
        title: z.string(),
        status: decisionStatusSchema.optional(),
        supersedes: z.string().optional(),
        labels: z.array(z.string()).optional(),
        body: z.string().optional(),
      },
    },
    async (args) => asText({ decision: decisionJson(await service.createDecision(args)) }),
  )

  server.registerTool(
    'decision_list',
    { description: 'List decisions (ADR).', inputSchema: {} },
    async () => asText({ decisions: (await service.listDecisions()).map(decisionJson) }),
  )

  server.registerTool(
    'decision_get',
    {
      description: 'Return a full decision. Errors if the id is unknown.',
      inputSchema: { id: z.string() },
    },
    async ({ id }) => {
      const decision = await service.getDecision(id)
      if (!decision) throw new Error(`Decision not found: ${id}`)
      return asText({ decision: decisionJson(decision) })
    },
  )

  server.registerTool(
    'decision_edit',
    {
      description: `Edit a decision (title / status / supersedes / labels / body). ${REPLACES}`,
      inputSchema: {
        id: z.string(),
        title: z.string().optional(),
        status: decisionStatusSchema.optional(),
        supersedes: z.string().optional(),
        labels: z.array(z.string()).optional(),
        body: z.string().optional(),
      },
    },
    async ({ id, ...patch }) =>
      asText({ decision: decisionJson(await service.editDecision(id, patch)) }),
  )

  server.registerTool(
    'decision_remove',
    {
      description: 'Delete a decision. The file is removed from the repo.',
      inputSchema: { id: z.string() },
    },
    async ({ id }) => asText({ removed: (await service.removeDecision(id)) ? id : null }),
  )

  // --- Showing your work ---

  server.registerTool(
    'reveal_overlay',
    {
      description:
        'Open the desktop overlay on a specific view/item to show it to the user (requires the ' +
        'suivre macOS app). Use it whenever you want to point the user at something — a task, a ' +
        'sprint, a decision, the roadmap. `view` is a dashboard deep-link without the hash, e.g. ' +
        '"board/task-013", "sprints/sprint-001", "docs/doc-003", "decisions/decision-001", or a bare ' +
        'view like "board" / "overview" / "archive". `target` is an optional project/link name ' +
        '(defaults to the active target).',
      inputSchema: {
        view: z.string().optional(),
        target: z.string().optional(),
      },
    },
    async ({ view, target }) => {
      if (process.platform !== 'darwin') {
        return asText({ opened: null, reason: 'desktop overlay is macOS-only' })
      }
      const params = new URLSearchParams()
      if (view) params.set('view', view)
      if (target) params.set('target', target)
      const query = params.toString()
      const url = `suivre://show${query ? `?${query}` : ''}`
      const { spawn } = await import('node:child_process')
      const child = spawn('open', [url], { stdio: 'ignore', detached: true })
      child.on('error', () => {})
      child.unref()
      return asText({ opened: url })
    },
  )

  return server
}

export async function runMcpServer(root = resolveMcpRoot()): Promise<void> {
  const transport = new StdioServerTransport()
  await createMcpServer(root).connect(transport)
}
