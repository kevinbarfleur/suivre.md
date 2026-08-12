import { describe, expect, it } from 'vitest'
import { callTool, mcpPayload, mcpSession, withBoard } from './harness'

/**
 * The CLI and the MCP server are the two surfaces an agent drives, and they must
 * offer the same operations: an agent that reaches for `doc edit` after reading
 * the contract should not discover the verb only exists on the other surface.
 *
 * That is exactly what happened — `editDoc`, `editDecision` and the three
 * removals lived in the service and on REST, which nothing drives, while the CLI
 * and MCP each had a different half. This table is the guard: a new entity has
 * to be added here, which is the right amount of friction.
 */
const MATRIX: { entity: string; cli: string; tool: string }[] = [
  { entity: 'task', cli: 'add', tool: 'task_add' },
  { entity: 'task', cli: 'get', tool: 'task_get' },
  { entity: 'task', cli: 'list', tool: 'task_list' },
  { entity: 'task', cli: 'edit', tool: 'task_edit' },
  { entity: 'task', cli: 'move', tool: 'task_move' },
  { entity: 'task', cli: 'comment', tool: 'task_comment' },
  { entity: 'task', cli: 'done', tool: 'task_close' },
  { entity: 'task', cli: 'next', tool: 'task_next' },
  { entity: 'task', cli: 'rm', tool: 'task_remove' },
  { entity: 'sprint', cli: 'sprint create', tool: 'sprint_create' },
  { entity: 'sprint', cli: 'sprint get', tool: 'sprint_get' },
  { entity: 'sprint', cli: 'sprint list', tool: 'sprint_list' },
  { entity: 'sprint', cli: 'sprint add', tool: 'sprint_add' },
  { entity: 'sprint', cli: 'sprint edit', tool: 'sprint_edit' },
  { entity: 'sprint', cli: 'sprint done', tool: 'sprint_done' },
  { entity: 'sprint', cli: 'sprint rm', tool: 'sprint_remove' },
  { entity: 'doc', cli: 'doc create', tool: 'doc_create' },
  { entity: 'doc', cli: 'doc get', tool: 'doc_get' },
  { entity: 'doc', cli: 'doc list', tool: 'doc_list' },
  { entity: 'doc', cli: 'doc edit', tool: 'doc_edit' },
  { entity: 'doc', cli: 'doc rm', tool: 'doc_remove' },
  { entity: 'decision', cli: 'decision create', tool: 'decision_create' },
  { entity: 'decision', cli: 'decision get', tool: 'decision_get' },
  { entity: 'decision', cli: 'decision list', tool: 'decision_list' },
  { entity: 'decision', cli: 'decision edit', tool: 'decision_edit' },
  { entity: 'decision', cli: 'decision rm', tool: 'decision_remove' },
]

/** Registered but with no CLI twin, on purpose. */
const MCP_ONLY = new Set(['backlog_init', 'backlog_list', 'reveal_overlay'])

describe('the CLI and MCP offer the same operations', () => {
  it('registers every command in the matrix', async () => {
    await withBoard(async (board) => {
      const help = board.cli('--help').stdout
      for (const { cli } of MATRIX) {
        expect(help, `\`suivre ${cli}\` is not registered`).toContain(cli)
      }
    })
  })

  it('registers every tool in the matrix, and nothing undeclared', async () => {
    await withBoard(async (board) => {
      const responses = await board.mcp(mcpSession({ id: 1, method: 'tools/list' }))
      const registered = new Set(
        ((responses.get(1)?.result?.['tools'] as { name: string }[]) ?? []).map((t) => t.name),
      )
      for (const { tool } of MATRIX) {
        expect(registered, `\`${tool}\` is not registered`).toContain(tool)
      }
      const declared = new Set([...MATRIX.map((row) => row.tool), ...MCP_ONLY])
      for (const tool of registered) {
        expect(declared, `\`${tool}\` is registered but absent from the parity matrix`).toContain(
          tool,
        )
      }
    })
  })

  it('edits a doc and a decision from both surfaces', async () => {
    await withBoard(async (board) => {
      board.cli('doc', 'create', 'Spec', '--body', 'v1')
      board.cli('decision', 'create', 'Use cookies', '--body', 'Context')

      expect(board.cli('doc', 'edit', 'doc-001', '--body', 'v2', '--json').status).toBe(0)
      expect(board.cli('doc', 'get', 'doc-001', '--json').json<{ body: string }>().body).toBe('v2')

      const responses = await board.mcp(
        mcpSession(
          callTool(1, 'doc_edit', { id: 'doc-001', body: 'v3' }),
          callTool(2, 'decision_edit', { id: 'decision-001', status: 'accepted' }),
        ),
      )
      expect(mcpPayload<{ doc: { body: string } }>(responses.get(1)).doc.body).toBe('v3')
      expect(
        board.cli('decision', 'get', 'decision-001', '--json').json<{ status: string }>().status,
      ).toBe('accepted')
    })
  })

  it('removes a doc, a decision and a sprint from both surfaces', async () => {
    await withBoard(async (board) => {
      for (const [group, title] of [
        ['doc', 'A'],
        ['decision', 'B'],
      ] as const) {
        board.cli(group, 'create', title)
      }
      board.cli('sprint', 'create', 'S')

      expect(board.cli('doc', 'rm', 'doc-001').status).toBe(0)
      expect(board.cli('doc', 'list', '--json').json<unknown[]>()).toHaveLength(0)
      expect(board.cli('doc', 'rm', 'doc-001').status).toBe(1)

      const responses = await board.mcp(
        mcpSession(
          callTool(1, 'decision_remove', { id: 'decision-001' }),
          callTool(2, 'sprint_remove', { id: 'sprint-001' }),
        ),
      )
      expect(mcpPayload<{ removed: string | null }>(responses.get(1)).removed).toBe('decision-001')
      expect(mcpPayload<{ removed: string | null }>(responses.get(2)).removed).toBe('sprint-001')
      expect(board.cli('decision', 'list', '--json').json<unknown[]>()).toHaveLength(0)
      expect(board.cli('sprint', 'list', '--json').json<unknown[]>()).toHaveLength(0)
    })
  })
})
