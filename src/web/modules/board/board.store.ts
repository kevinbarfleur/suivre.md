import { computed, ref } from 'vue'
import type { Board, Task } from '../../../domain'
import * as api from '../../lib/api'

// Singleton store (module-level refs). Board + selection + actions + live SSE.
// Every mutation writes server-side → the file-watcher pushes an SSE event →
// reload: the board stays correct whoever the author is (web, CLI or MCP).
const board = ref<Board | null>(null)
const loading = ref(false)
// Two error channels on purpose: `error` blanks the whole pane (MainPane
// renders it instead of the board), `actionError` is a banner over a board
// that is still there. A failed drag must never cost the user the board.
const error = ref<string | null>(null)
const actionError = ref<string | null>(null)
const live = ref(true)
const selected = ref<Task | null>(null)
let liveStarted = false

// All tasks flattened (columns + orphans) — shared source for the summary,
// the filters and the subtask computation.
const allTasks = computed<Task[]>(() =>
  board.value ? board.value.columns.flatMap((c) => c.tasks).concat(board.value.orphans) : [],
)

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}

/**
 * The open card is a snapshot; a reload re-resolves it by id so the dialog
 * edits the task as it is on disk. Without this, a comment an agent appends
 * while the card is open is erased by the next Save. A card that vanished
 * (deleted, archived) closes the dialog.
 */
function resyncSelected(): void {
  const id = selected.value?.frontmatter.id
  if (id === undefined) return
  selected.value = allTasks.value.find((t) => t.frontmatter.id === id) ?? null
}

async function reload(): Promise<void> {
  loading.value = true
  error.value = null
  try {
    board.value = await api.fetchBoard()
    resyncSelected()
  } catch (e) {
    if (board.value === null) error.value = messageOf(e)
    else actionError.value = messageOf(e)
  } finally {
    loading.value = false
  }
}

async function ensureLoaded(): Promise<void> {
  if (board.value === null && !loading.value) await reload()
}

/** Runs a write: `true` once reloaded, `false` with the reason in `actionError`. */
async function run(write: () => Promise<unknown>): Promise<boolean> {
  actionError.value = null
  try {
    await write()
  } catch (e) {
    actionError.value = messageOf(e)
    return false
  }
  await reload()
  return true
}

function startLive(): void {
  if (liveStarted || typeof EventSource === 'undefined') return
  liveStarted = true
  const source = new EventSource('/api/events')
  const refresh = (): void => {
    void reload()
  }
  // One listener per collection: `board` is the legacy alias for these two and
  // subscribing to it as well would reload twice per change.
  source.addEventListener('tasks', refresh)
  source.addEventListener('config', refresh)
  let opened = false
  source.addEventListener('ready', () => {
    live.value = true
    // The first `ready` is the initial connect, already covered by
    // `ensureLoaded`. A later one is EventSource reconnecting to a restarted
    // server: the board drifted while the stream was down.
    if (opened) refresh()
    opened = true
  })
  // A dead server leaves the tab looking perfectly alive while every write
  // fails — the disconnected state is the only honest signal the user gets.
  source.onerror = (): void => {
    live.value = false
  }
}

export function useBoard() {
  return {
    board,
    allTasks,
    loading,
    error,
    actionError,
    live,
    selected,
    reload,
    ensureLoaded,
    startLive,
    openTask: (task: Task) => {
      selected.value = task
    },
    closeTask: () => {
      selected.value = null
    },
    dismissActionError: () => {
      actionError.value = null
    },
    create: (input: api.CreateInput) => run(() => api.createTask(input)),
    update: (id: string, patch: api.UpdateInput) => run(() => api.updateTask(id, patch)),
    move: (id: string, body: api.MoveInput) => run(() => api.moveTask(id, body)),
    remove: (id: string) => run(() => api.deleteTask(id)),
  }
}
