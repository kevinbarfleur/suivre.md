import chokidar, { type FSWatcher } from 'chokidar'

/**
 * Surveille le dossier des tâches et appelle `onChange` (debouncé) à chaque
 * add/change/unlink. C'est la source du live : que l'écriture vienne du web,
 * du CLI ou du MCP, le board se rafraîchit.
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
