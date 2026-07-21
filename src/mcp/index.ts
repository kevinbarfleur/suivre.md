#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { BoardService } from '../service/board-service'
import { prioritySchema } from '../domain'

/**
 * Surface MCP : expose le backlog en tools natifs pour qu'un agent le pilote en
 * direct (écrit des fichiers → si le board tourne, le file-watcher rafraîchit
 * l'écran live). Adaptateur mince sur le service, comme le serveur et le CLI.
 */

const root = process.env.SUIVRE_ROOT ?? process.cwd()
const service = new BoardService(root)

const asText = (value: unknown) => ({
  content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }],
})

const server = new McpServer({ name: 'suivre', version: '0.1.0' })

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
  'task_add',
  {
    description: 'Crée une tâche et renvoie sa version persistée.',
    inputSchema: {
      title: z.string(),
      status: z.string().optional(),
      priority: prioritySchema.optional(),
      labels: z.array(z.string()).optional(),
      body: z.string().optional(),
    },
  },
  async (args) => asText(await service.create(args)),
)

server.registerTool(
  'task_edit',
  {
    description: 'Modifie une tâche (titre / statut / priorité / labels / corps).',
    inputSchema: {
      id: z.string(),
      title: z.string().optional(),
      status: z.string().optional(),
      priority: prioritySchema.optional(),
      labels: z.array(z.string()).optional(),
      body: z.string().optional(),
    },
  },
  async ({ id, ...patch }) => asText(await service.edit(id, patch)),
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
  'task_remove',
  {
    description: 'Supprime une tâche.',
    inputSchema: { id: z.string() },
  },
  async ({ id }) => asText({ removed: await service.remove(id) }),
)

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
    const params = new URLSearchParams()
    if (view) params.set('view', view)
    if (target) params.set('target', target)
    const query = params.toString()
    const url = `suivre://show${query ? `?${query}` : ''}`
    const { spawn } = await import('node:child_process')
    spawn('open', [url], { stdio: 'ignore', detached: true }).unref()
    return asText({ opened: url })
  },
)

const transport = new StdioServerTransport()
await server.connect(transport)
