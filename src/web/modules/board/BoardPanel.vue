<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { monitorForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter'
import { useBoard } from './board.store'
import Column from './Column.vue'
import TaskDetailDialog from './TaskDetailDialog.vue'

const { board, loading, error, ensureLoaded, move, selected } = useBoard()

// Statut courant de chaque tâche → pour ignorer un drop dans la même colonne.
const statusById = computed(() => {
  const map = new Map<string, string>()
  if (board.value) {
    for (const c of board.value.columns) {
      for (const t of c.tasks) map.set(t.frontmatter.id, c.column.id)
    }
  }
  return map
})

let cleanup: (() => void) | undefined
onMounted(() => {
  void ensureLoaded()
  cleanup = monitorForElements({
    onDrop: ({ source, location }) => {
      const target = location.current.dropTargets[0]
      if (!target) return
      const columnId = target.data.columnId as string | undefined
      const taskId = source.data.taskId as string | undefined
      if (!columnId || !taskId) return
      if (statusById.value.get(taskId) === columnId) return
      void move(taskId, { status: columnId })
    },
  })
})
onBeforeUnmount(() => cleanup?.())
</script>

<template>
  <section class="sv-board">
    <div v-if="error" class="sv-state sv-state--err">{{ error }}</div>
    <div v-else-if="loading && !board" class="sv-state">Chargement…</div>
    <div v-else-if="board" class="sv-cols">
      <Column v-for="col in board.columns" :key="col.column.id" :col="col" />
    </div>
    <div v-else class="sv-state">Backlog non initialisé.</div>
    <TaskDetailDialog v-if="selected" :task="selected" />
  </section>
</template>

<style scoped>
.sv-board {
  height: 100%;
  padding: 4px 24px 24px;
}
.sv-cols {
  display: flex;
  gap: 14px;
  height: 100%;
  overflow-x: auto;
  align-items: flex-start;
  padding-bottom: 8px;
}
.sv-state {
  padding: 24px;
  font-size: 14px;
  color: var(--sv-ink-2);
}
.sv-state--err {
  color: #ffb4a8;
}
</style>
