import chokidar, { type FSWatcher } from 'chokidar'

/**
 * Watches the tasks directory and calls `onChange` (debounced) on every
 * add/change/unlink. This is the source of live updates: whether the write
 * comes from the web, the CLI or MCP, the board refreshes.
 */
export function watchTasks(tasksDir: string, onChange: () => void, debounceMs = 120): FSWatcher {
  let timer: ReturnType<typeof setTimeout> | null = null
  const fire = (): void => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(onChange, debounceMs)
  }
  const watcher = chokidar.watch(tasksDir, { ignoreInitial: true })
  watcher.on('add', fire).on('change', fire).on('unlink', fire)
  return watcher
}
