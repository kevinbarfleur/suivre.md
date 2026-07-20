<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { monitorForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter'
import { useBoard } from './board.store'
import { useFilter } from '../filter/filter.store'
import Column from './Column.vue'
import TaskCard from './TaskCard.vue'

// Vue « board » (kanban). La modale et les états globaux (loading/error/vide)
// sont gérés par le MainPane ; ici on ne rend que les colonnes + orphelins.
const { board, move } = useBoard()
const { matches } = useFilter()

const statusById = computed(() => {
  const map = new Map<string, string>()
  if (board.value) {
    for (const c of board.value.columns)
      for (const t of c.tasks) map.set(t.frontmatter.id, c.column.id)
  }
  return map
})

const columns = computed(() =>
  board.value
    ? board.value.columns.map((c) => ({ column: c.column, tasks: c.tasks.filter(matches) }))
    : [],
)
const orphans = computed(() => (board.value ? board.value.orphans.filter(matches) : []))

let cleanup: (() => void) | undefined
onMounted(() => {
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
  <div class="bd">
    <div class="bd-cols">
      <Column v-for="col in columns" :key="col.column.id" :col="col" />
    </div>
    <div v-if="orphans.length" class="bd-orphans">
      <div class="bd-orphans-head">
        <span class="bd-orphans-hash">#</span> orphans
        <span class="bd-orphans-hint">— unknown status → re-sort</span>
        <span class="bd-orphans-n">[{{ orphans.length }}]</span>
      </div>
      <div class="bd-orphans-list">
        <TaskCard v-for="t in orphans" :key="t.frontmatter.id" :task="t" orphan />
      </div>
    </div>
  </div>
</template>

<style scoped>
.bd {
  min-width: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
}
.bd-cols {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 12px;
  align-items: stretch;
  overflow-x: auto;
  overflow-y: hidden;
  padding-bottom: 6px;
}
.bd-orphans {
  flex: 0 1 auto;
  max-height: 45%;
  overflow-y: auto;
  margin-top: 22px;
  padding: 16px;
  border: 1px solid var(--sv-warn-line);
  border-radius: 10px;
  background: var(--sv-warn-bg);
}
@media (max-width: 860px) {
  .bd {
    height: auto;
  }
  .bd-cols {
    overflow-y: visible;
  }
  .bd-orphans {
    max-height: none;
    overflow-y: visible;
  }
}
.bd-orphans-head {
  font-size: 12px;
  color: var(--sv-warn);
  margin-bottom: 12px;
}
.bd-orphans-hash {
  color: var(--sv-fg-dim);
}
.bd-orphans-hint {
  color: var(--sv-warn);
}
.bd-orphans-n {
  color: var(--sv-fg-dim);
  margin-left: 4px;
}
.bd-orphans-list {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.bd-orphans-list > * {
  width: 262px;
}
</style>
