import { describe, expect, it } from 'vitest'
import { closestEdge, placementOf, type DropColumn } from './drop'

const columns: DropColumn[] = [
  { id: 'inbox', taskIds: ['task-1', 'task-2', 'task-3'] },
  { id: 'doing', taskIds: ['task-4'] },
  { id: 'shipped', taskIds: [] },
]

describe('closestEdge', () => {
  it('splits the card at its middle', () => {
    expect(closestEdge({ top: 100, height: 40 }, 110)).toBe('top')
    expect(closestEdge({ top: 100, height: 40 }, 130)).toBe('bottom')
  })
})

describe('placementOf', () => {
  it('reorders within a column, which the board could not do at all', () => {
    const targets = [
      { taskId: 'task-1', columnId: 'inbox', edge: 'top' as const },
      { columnId: 'inbox' },
    ]
    expect(placementOf('task-3', targets, columns)).toEqual({
      status: 'inbox',
      beforeId: 'task-1',
    })
  })

  it('places after the card when dropped on its bottom half', () => {
    const targets = [{ taskId: 'task-1', columnId: 'inbox', edge: 'bottom' as const }]
    expect(placementOf('task-3', targets, columns)).toEqual({
      status: 'inbox',
      afterId: 'task-1',
    })
  })

  it('lands at the requested rank across columns, not at the bottom', () => {
    const targets = [{ taskId: 'task-1', columnId: 'inbox', edge: 'top' as const }]
    expect(placementOf('task-4', targets, columns)).toEqual({
      status: 'inbox',
      beforeId: 'task-1',
    })
  })

  it('appends when dropped on the column background', () => {
    expect(placementOf('task-4', [{ columnId: 'inbox' }], columns)).toEqual({
      status: 'inbox',
      afterId: 'task-3',
    })
  })

  it('moves to an empty column with no neighbour', () => {
    expect(placementOf('task-4', [{ columnId: 'shipped' }], columns)).toEqual({
      status: 'shipped',
    })
  })

  it('ignores a drop that changes nothing', () => {
    // Bottom half of the card just above it, and the column background of the
    // column it already ends.
    expect(
      placementOf('task-2', [{ taskId: 'task-1', columnId: 'inbox', edge: 'bottom' }], columns),
    ).toBeNull()
    expect(
      placementOf('task-2', [{ taskId: 'task-3', columnId: 'inbox', edge: 'top' }], columns),
    ).toBeNull()
    expect(placementOf('task-3', [{ columnId: 'inbox' }], columns)).toBeNull()
    expect(placementOf('task-4', [{ columnId: 'doing' }], columns)).toBeNull()
  })

  it('ignores the dragged card as a drop target', () => {
    const targets = [{ taskId: 'task-4', columnId: 'doing', edge: 'top' as const }]
    expect(placementOf('task-4', targets, columns)).toBeNull()
  })

  it('ignores a drop outside any column', () => {
    expect(placementOf('task-1', [], columns)).toBeNull()
    expect(placementOf('task-1', [{ columnId: 'nope' }], columns)).toBeNull()
  })

  it('ranks an orphan against the destination column', () => {
    const targets = [{ taskId: 'task-2', columnId: 'inbox', edge: 'top' as const }]
    expect(placementOf('task-orphan', targets, columns)).toEqual({
      status: 'inbox',
      afterId: 'task-1',
    })
  })
})
