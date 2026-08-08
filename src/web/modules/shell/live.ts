// Live channel shared by the collection stores. The server watches the whole
// backlog and emits one SSE event per collection, so a `doc create` from an
// agent reaches an open view without a reload. One EventSource for all of
// them: the board keeps its own (it starts before any view is mounted).

/** Collections the server emits an event for. Mirrors the server watcher. */
export type LiveChannel = 'tasks' | 'decisions' | 'docs' | 'sprints' | 'config' | 'preferences'

let source: EventSource | null = null

/**
 * Runs `handler` whenever the server reports a change on `channel`. A no-op
 * where EventSource does not exist, so a store can subscribe unconditionally.
 */
export function onLive(channel: LiveChannel, handler: () => void): void {
  if (typeof EventSource === 'undefined') return
  source ??= new EventSource('/api/events')
  source.addEventListener(channel, () => handler())
}
