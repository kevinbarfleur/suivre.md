import { computed, ref } from 'vue'
import type { Priority, Task } from '../../../domain'
import { useBoard } from '../board/board.store'

// Filtre client-side, singleton. Le board et la liste lisent `matches` pour
// restreindre les cartes/lignes affichées ; la toolbar pilote les critères.
// Aucune écriture disque — filtrer est une vue, pas une mutation.
const text = ref('')
const status = ref<string | null>(null)
const priority = ref<Priority | null>(null)
const label = ref<string | null>(null)
const assignee = ref<string | null>(null)

function matches(task: Task): boolean {
  const fm = task.frontmatter
  if (status.value && fm.status !== status.value) return false
  if (priority.value && fm.priority !== priority.value) return false
  if (label.value && !fm.labels.includes(label.value)) return false
  if (assignee.value && fm.assignee !== assignee.value) return false
  const query = text.value.trim().toLowerCase()
  if (query) {
    const hay = `${fm.id} ${fm.title} ${task.body}`.toLowerCase()
    if (!hay.includes(query)) return false
  }
  return true
}

export function useFilter() {
  const { allTasks } = useBoard()

  const labels = computed(() => {
    const set = new Set<string>()
    for (const task of allTasks.value) for (const l of task.frontmatter.labels) set.add(l)
    return [...set].sort()
  })
  const assignees = computed(() => {
    const set = new Set<string>()
    for (const task of allTasks.value)
      if (task.frontmatter.assignee) set.add(task.frontmatter.assignee)
    return [...set].sort()
  })
  const activeCount = computed(
    () =>
      (text.value.trim() ? 1 : 0) +
      (status.value ? 1 : 0) +
      (priority.value ? 1 : 0) +
      (label.value ? 1 : 0) +
      (assignee.value ? 1 : 0),
  )
  const resultCount = computed(() => allTasks.value.filter(matches).length)

  return {
    text,
    status,
    priority,
    label,
    assignee,
    labels,
    assignees,
    activeCount,
    resultCount,
    matches,
    clear: () => {
      text.value = ''
      status.value = null
      priority.value = null
      label.value = null
      assignee.value = null
    },
  }
}
