import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { BoardService } from '../service/board-service'
import { decisionStatusSchema, prioritySchema, resolveSprint } from '../domain'

/**
 * MCP surface: exposes the backlog as native tools so an agent can drive it
 * directly (writes files → if the board is running, the file-watcher refreshes
 * the live screen). Thin adapter over the service, like the server and the CLI.
 * The vocabulary covers the "issue tracker" contract of agentic workflows
 * (create/read/list/comment/close + sprints/docs/decisions + reveal).
 */

const asText = (value: unknown) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }],
})

export async function runMcpServer(root = process.env.SUIVRE_ROOT ?? process.cwd()): Promise<void> {
  const service = new BoardService(root)
  const server = new McpServer({ name: 'suivre', version: '1.0.0-alpha.2' })

  // --- Board & tasks ---

  server.registerTool(
    'backlog_init',
    {
      description: 'Initialize a markdown backlog in the current repo (idempotent).',
      inputSchema: { name: z.string().optional() },
    },
    async ({ name }) => asText(await service.init(name ?? 'Backlog')),
  )

  server.registerTool(
    'backlog_list',
    {
      description: 'Return the board: columns + tasks sorted by rank, and the orphans.',
      inputSchema: {},
    },
    async () => {
      const board = await service.getBoard()
      return asText(board ?? { error: 'not-initialized' })
    },
  )

  server.registerTool(
    'task_list',
    {
      description:
        'List tasks (board order), with filters: status (column), label, assignee, ' +
        'ready (not final, unassigned, dependencies resolved).',
      inputSchema: {
        status: z.string().optional(),
        label: z.string().optional(),
        assignee: z.string().optional(),
        ready: z.boolean().optional(),
      },
    },
    async (filter) => asText(await service.queryTasks(filter)),
  )

  server.registerTool(
    'task_get',
    {
      description: 'Return a full task (frontmatter + markdown body).',
      inputSchema: { id: z.string() },
    },
    async ({ id }) => {
      const task = await service.getTask(id)
      return asText(task ?? { error: 'not-found', id })
    },
  )

  server.registerTool(
    'task_add',
    {
      description: 'Create a task and return its persisted version.',
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
    async (args) => asText(await service.create(args)),
  )

  server.registerTool(
    'task_edit',
    {
      description:
        'Edit a task (title / status / priority / labels / assignee / depends / body). ' +
        'assignee: "" to unassign.',
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
    async ({ id, assignee, ...patch }) =>
      asText(
        await service.edit(id, {
          ...patch,
          ...(assignee !== undefined ? { assignee: assignee === '' ? undefined : assignee } : {}),
        }),
      ),
  )

  server.registerTool(
    'task_comment',
    {
      description: 'Append a timestamped comment to a task (## Comments section of the body).',
      inputSchema: {
        id: z.string(),
        text: z.string(),
        author: z.string().optional(),
      },
    },
    async ({ id, text, author }) => asText(await service.comment(id, text, author)),
  )

  server.registerTool(
    'task_move',
    {
      description: 'Move a task to a column, with optional placement (beforeId / afterId).',
      inputSchema: {
        id: z.string(),
        status: z.string(),
        beforeId: z.string().optional(),
        afterId: z.string().optional(),
      },
    },
    async ({ id, status, beforeId, afterId }) =>
      asText(await service.move(id, status, { beforeId, afterId })),
  )

  server.registerTool(
    'task_close',
    {
      description: 'Close a task: final column, optional resolution comment, optional archiving.',
      inputSchema: {
        id: z.string(),
        comment: z.string().optional(),
        author: z.string().optional(),
        archive: z.boolean().optional(),
      },
    },
    async ({ id, ...opts }) => asText(await service.close(id, opts)),
  )

  server.registerTool(
    'task_next',
    {
      description:
        'Next "ready" task (not final, unassigned, dependencies resolved). ' +
        'With sprintId: the frontier follows the sprint order.',
      inputSchema: { sprintId: z.string().optional() },
    },
    async ({ sprintId }) => asText((await service.next(sprintId)) ?? { next: null }),
  )

  server.registerTool(
    'task_remove',
    {
      description: 'Delete a task.',
      inputSchema: { id: z.string() },
    },
    async ({ id }) => asText({ removed: await service.remove(id) }),
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
    async (args) => asText(await service.createSprint(args)),
  )

  server.registerTool('sprint_list', { description: 'List sprints.', inputSchema: {} }, async () =>
    asText(await service.listSprints()),
  )

  server.registerTool(
    'sprint_get',
    {
      description: 'Return a sprint with the real progress of its tasks.',
      inputSchema: { id: z.string() },
    },
    async ({ id }) => {
      const sprint = await service.getSprint(id)
      if (!sprint) return asText({ error: 'not-found', id })
      const tasks = await service.listTasks()
      const resolved = resolveSprint(sprint.frontmatter.items, tasks)
      return asText({ ...sprint, progress: { done: resolved.done, total: resolved.total } })
    },
  )

  server.registerTool(
    'sprint_edit',
    {
      description: 'Edit a sprint (title / goal / status / items / body).',
      inputSchema: {
        id: z.string(),
        title: z.string().optional(),
        goal: z.string().optional(),
        status: z.enum(['active', 'done']).optional(),
        items: z.array(z.string()).optional(),
        body: z.string().optional(),
      },
    },
    async ({ id, ...patch }) => asText(await service.editSprint(id, patch)),
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
    async (args) => asText(await service.createDoc(args)),
  )

  server.registerTool('doc_list', { description: 'List docs.', inputSchema: {} }, async () =>
    asText(await service.listDocs()),
  )

  server.registerTool(
    'doc_get',
    { description: 'Return a full doc.', inputSchema: { id: z.string() } },
    async ({ id }) => asText((await service.getDoc(id)) ?? { error: 'not-found', id }),
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
    async (args) => asText(await service.createDecision(args)),
  )

  server.registerTool(
    'decision_list',
    { description: 'List decisions (ADR).', inputSchema: {} },
    async () => asText(await service.listDecisions()),
  )

  server.registerTool(
    'decision_get',
    { description: 'Return a full decision.', inputSchema: { id: z.string() } },
    async ({ id }) => asText((await service.getDecision(id)) ?? { error: 'not-found', id }),
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

  const transport = new StdioServerTransport()
  await server.connect(transport)
}
