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

const transport = new StdioServerTransport()
await server.connect(transport)
