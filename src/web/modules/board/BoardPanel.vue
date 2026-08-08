<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { monitorForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter'
import { useBoard } from './board.store'
import { useFilter } from '../filter/filter.store'
import { placementOf, type DropColumn, type DropData } from './drop'
import Column from './Column.vue'
import TaskCard from './TaskCard.vue'

// "Board" view (kanban). The modal and global states (loading/error/empty)
// are handled by MainPane; here we only render the columns + orphans, and
// the banners for the states that must NOT replace the board.
const { board, move, actionError, live, dismissActionError } = useBoard()
const { matches } = useFilter()

const columns = computed(() =>
  board.value
    ? board.value.columns.map((c) => ({ column: c.column, tasks: c.tasks.filter(matches) }))
    : [],
)
const orphans = computed(() => (board.value ? board.value.orphans.filter(matches) : []))

// Ranks are computed against the whole column, never the filtered view: the
// server ranks between the real neighbours, which a filter can hide.
const dropColumns = computed<DropColumn[]>(() =>
  board.value
    ? board.value.columns.map((c) => ({
        id: c.column.id,
        taskIds: c.tasks.map((t) => t.frontmatter.id),
      }))
    : [],
)

let cleanup: (() => void) | undefined
onMounted(() => {
  cleanup = monitorForElements({
    canMonitor: ({ source }) => typeof source.data.taskId === 'string',
    onDrop: ({ source, location }) => {
      const taskId = source.data.taskId
      if (typeof taskId !== 'string') return
      const targets = location.current.dropTargets.map((t) => t.data as DropData)
      const placement = placementOf(taskId, targets, dropColumns.value)
      if (placement) void move(taskId, placement)
    },
  })
})
onBeforeUnmount(() => cleanup?.())
</script>

<template>
  <div class="bd">
    <div v-if="!live" class="bd-banner bd-banner--off">
      <span class="bd-banner-mark">!</span>
      <span>disconnected — the board server stopped answering; writes will fail</span>
    </div>
    <div v-if="actionError" class="bd-banner bd-banner--err">
      <span class="bd-banner-mark">✗</span>
      <span class="bd-banner-msg">{{ actionError }}</span>
      <button class="bd-banner-x" type="button" @click="dismissActionError">[dismiss]</button>
    </div>
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
.bd-banner {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
  padding: 9px 13px;
  border-radius: 8px;
  font-size: 12px;
}
.bd-banner--off {
  border: 1px solid var(--sv-warn-line);
  background: var(--sv-warn-bg);
  color: var(--sv-warn);
}
.bd-banner--err {
  border: 1px solid var(--sv-danger-line);
  background: var(--sv-danger-bg);
  color: var(--sv-danger);
}
.bd-banner-mark {
  flex: 0 0 auto;
}
.bd-banner-msg {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}
.bd-banner-x {
  flex: 0 0 auto;
  background: transparent;
  border: 0;
  color: inherit;
  font-family: inherit;
  font-size: 11px;
  cursor: pointer;
  opacity: 0.75;
}
.bd-banner-x:hover {
  opacity: 1;
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
