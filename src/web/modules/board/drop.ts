// Turns a drag & drop gesture into a `move` payload. Pure: the geometry and
// the drop-target data come in, `beforeId`/`afterId` come out — the fractional
// rank itself is computed server-side, from the column as it is on disk.

export type Edge = 'top' | 'bottom'

/** Data a board drop target publishes through pragmatic-drag-and-drop. */
export interface DropData {
  columnId?: string
  /** Present on card targets only — the card the pointer is over. */
  taskId?: string
  edge?: Edge
}

/** A column as the server will see it: every task, filters ignored. */
export interface DropColumn {
  id: string
  taskIds: readonly string[]
}

export interface Placement {
  status: string
  beforeId?: string
  afterId?: string
}

/** Half of the card the pointer sits in: the side the card would be inserted on. */
export function closestEdge(rect: { top: number; height: number }, clientY: number): Edge {
  return clientY < rect.top + rect.height / 2 ? 'top' : 'bottom'
}

/** Where the dragged card lands in `rest` (the destination column without it). */
function insertIndex(rest: readonly string[], card: DropData | undefined): number {
  if (card?.taskId === undefined) return rest.length
  const i = rest.indexOf(card.taskId)
  if (i < 0) return rest.length
  return card.edge === 'top' ? i : i + 1
}

/**
 * The move a drop describes, or `null` when it changes nothing — dropping a
 * card back where it was would still rewrite the file and bump `updated`.
 * `targets` is the bubble-ordered drop-target stack under the pointer (card
 * first, then its column); a drop on the column background appends.
 */
export function placementOf(
  taskId: string,
  targets: readonly DropData[],
  columns: readonly DropColumn[],
): Placement | null {
  const card = targets.find((t) => t.taskId !== undefined && t.taskId !== taskId)
  const columnId = card?.columnId ?? targets.find((t) => t.columnId !== undefined)?.columnId
  const target = columns.find((c) => c.id === columnId)
  if (columnId === undefined || target === undefined) return null

  const rest = target.taskIds.filter((id) => id !== taskId)
  const index = insertIndex(rest, card)

  const from = columns.find((c) => c.taskIds.includes(taskId))
  if (from?.id === columnId && from.taskIds.indexOf(taskId) === index) return null

  if (index === 0) {
    const first = rest[0]
    return first === undefined ? { status: columnId } : { status: columnId, beforeId: first }
  }
  return { status: columnId, afterId: rest[index - 1] }
}
