import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { BoardService } from '../service/board-service'
import { decisionStatusSchema, prioritySchema, resolveSprint } from '../domain'

/**
 * Surface MCP : expose le backlog en tools natifs pour qu'un agent le pilote en
 * direct (écrit des fichiers → si le board tourne, le file-watcher rafraîchit
 * l'écran live). Adaptateur mince sur le service, comme le serveur et le CLI.
 * Le vocabulaire couvre le contrat "issue tracker" des workflows agentiques
 * (create/read/list/comment/close + sprints/docs/décisions + reveal).
 */

const asText = (value: unknown) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }],
})

export async function runMcpServer(root = process.env.SUIVRE_ROOT ?? process.cwd()): Promise<void> {
  const service = new BoardService(root)
  const server = new McpServer({ name: 'suivre', version: '1.0.0-alpha.1' })

  // --- Board & tâches ---

  server.registerTool(
    'backlog_init',
    {
      description: 'Initialise un backlog markdown dans le repo courant (idempotent).',
      inputSchema: { name: z.string().optional() },
    },
    async ({ name }) => asText(await service.init(name ?? 'Backlog')),
  )

  server.registerTool(
    'backlog_list',
    {
      description: 'Renvoie le board : colonnes + tâches triées par rang, et les orphelins.',
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
        'Liste les tâches (ordre du board), avec filtres : status (colonne), label, assignee, ' +
        'ready (non finale, non assignée, dépendances résolues).',
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
      description: 'Renvoie une tâche complète (frontmatter + corps markdown).',
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
      description: 'Crée une tâche et renvoie sa version persistée.',
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
        'Modifie une tâche (titre / statut / priorité / labels / assignee / depends / corps). ' +
        'assignee: "" pour désassigner.',
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
      description: 'Ajoute un commentaire horodaté à une tâche (section ## Comments du corps).',
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
      description: 'Déplace une tâche vers une colonne, placement optionnel (beforeId / afterId).',
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
      description:
        'Ferme une tâche : colonne finale, commentaire de résolution optionnel, archivage optionnel.',
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
        'Prochaine tâche "ready" (non finale, non assignée, dépendances résolues). ' +
        'Avec sprintId : la frontier suit l’ordre du sprint.',
      inputSchema: { sprintId: z.string().optional() },
    },
    async ({ sprintId }) => asText((await service.next(sprintId)) ?? { next: null }),
  )

  server.registerTool(
    'task_remove',
    {
      description: 'Supprime une tâche.',
      inputSchema: { id: z.string() },
    },
    async ({ id }) => asText({ removed: await service.remove(id) }),
  )

  // --- Sprints (la "map" d'un effort) ---

  server.registerTool(
    'sprint_create',
    {
      description:
        'Crée un sprint : checklist ORDONNÉE de tâches existantes (items = ids). Le corps porte ' +
        'les notes de l’effort (notes / décisions / questions ouvertes).',
      inputSchema: {
        title: z.string(),
        goal: z.string().optional(),
        items: z.array(z.string()).optional(),
        body: z.string().optional(),
      },
    },
    async (args) => asText(await service.createSprint(args)),
  )

  server.registerTool(
    'sprint_list',
    { description: 'Liste les sprints.', inputSchema: {} },
    async () => asText(await service.listSprints()),
  )

  server.registerTool(
    'sprint_get',
    {
      description: 'Renvoie un sprint avec la progression réelle de ses tâches.',
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
      description: 'Modifie un sprint (titre / goal / status / items / corps).',
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

  // --- Connaissance : docs (specs) et décisions (ADR) ---

  server.registerTool(
    'doc_create',
    {
      description: 'Crée un doc (spec, note, référence), rendu en lecture dans le dashboard.',
      inputSchema: {
        title: z.string(),
        tags: z.array(z.string()).optional(),
        body: z.string().optional(),
      },
    },
    async (args) => asText(await service.createDoc(args)),
  )

  server.registerTool('doc_list', { description: 'Liste les docs.', inputSchema: {} }, async () =>
    asText(await service.listDocs()),
  )

  server.registerTool(
    'doc_get',
    { description: 'Renvoie un doc complet.', inputSchema: { id: z.string() } },
    async ({ id }) => asText((await service.getDoc(id)) ?? { error: 'not-found', id }),
  )

  server.registerTool(
    'decision_create',
    {
      description:
        'Enregistre une décision (ADR) : Contexte / Décision / Conséquences dans le corps.',
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
    { description: 'Liste les décisions (ADR).', inputSchema: {} },
    async () => asText(await service.listDecisions()),
  )

  server.registerTool(
    'decision_get',
    { description: 'Renvoie une décision complète.', inputSchema: { id: z.string() } },
    async ({ id }) => asText((await service.getDecision(id)) ?? { error: 'not-found', id }),
  )

  // --- Restitution ---

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
