import { describe, expect, it } from 'vitest'
import { callTool, mcpPayload, mcpSession, startBoard, withBoard } from './harness'

// Proves the harness itself: a board exists, and all three surfaces reach it.
describe('the harness reaches every surface', () => {
  it('drives the CLI in a throwaway board', async () => {
    await withBoard(async (board) => {
      expect(board.cli('add', 'First').status).toBe(0)
      const tasks = board.cli('list', '--json').json<{ id: string }[]>()
      expect(tasks.map((t) => t.id)).toEqual(['task-001'])
    })
  })

  it('drives the stdio MCP entry', async () => {
    await withBoard(async (board) => {
      board.cli('add', 'First')
      const responses = await board.mcp(mcpSession(callTool(1, 'task_list')))
      expect(
        mcpPayload<{ tasks: { frontmatter: { id: string } }[] }>(responses.get(1)).tasks,
      ).toHaveLength(1)
    })
  })

  it('drives the HTTP server', async () => {
    await withBoard(async (board) => {
      board.cli('add', 'First')
      const server = await startBoard(board)
      try {
        const health = await (await fetch(`${server.url}/api/health`)).json()
        expect(health).toMatchObject({ ok: true, product: 'suivre', root: board.root })
        const api = await (await fetch(`${server.url}/api/board`)).json()
        const total = api.columns.reduce(
          (n: number, c: { tasks: unknown[] }) => n + c.tasks.length,
          0,
        )
        expect(total).toBe(1)
      } finally {
        await server.stop()
      }
    })
  })
})
