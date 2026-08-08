import { computed, ref } from 'vue'
import type { Board, Task } from '../../../domain'
import * as api from '../../lib/api'

// Singleton store (module-level refs). Board + selection + actions + live SSE.
// Every mutation writes server-side → the file-watcher pushes an SSE event →
// reload: the board stays correct whoever the author is (web, CLI or MCP).
const board = ref<Board | null>(null)
const loading = ref(false)
const error = ref<string | null>(null)
const selected = ref<Task | null>(null)
let liveStarted = false

// All tasks flattened (columns + orphans) — shared source for the summary,
// the filters and the subtask computation.
const allTasks = computed<Task[]>(() =>
  board.value ? board.value.columns.flatMap((c) => c.tasks).concat(board.value.orphans) : [],
)

async function reload(): Promise<void> {
  loading.value = true
  error.value = null
  try {
    board.value = await api.fetchBoard()
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    loading.value = false
  }
}

async function ensureLoaded(): Promise<void> {
  if (board.value === null && !loading.value) await reload()
}

function startLive(): void {
  if (liveStarted || typeof EventSource === 'undefined') return
  liveStarted = true
  const source = new EventSource('/api/events')
  source.addEventListener('board', () => {
    void reload()
  })
}

export function useBoard() {
  return {
    board,
    allTasks,
    loading,
    error,
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
    create: (input: api.CreateInput) => api.createTask(input).then(reload),
    update: (id: string, patch: api.UpdateInput) => api.updateTask(id, patch).then(reload),
    move: (id: string, body: api.MoveInput) => api.moveTask(id, body).then(reload),
    remove: (id: string) => api.deleteTask(id).then(reload),
  }
}
