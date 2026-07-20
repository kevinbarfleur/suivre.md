<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { draggable } from '@atlaskit/pragmatic-drag-and-drop/element/adapter'
import type { Task } from '../../../domain'
import { useBoard } from './board.store'
import { acProgress, blockedBy, meter, subtaskCount } from '../../lib/task-meta'

const props = defineProps<{ task: Task; orphan?: boolean }>()
const { openTask, allTasks } = useBoard()

const el = ref<HTMLElement | null>(null)
const dragging = ref(false)
let cleanup: (() => void) | undefined

onMounted(() => {
  if (!el.value) return
  cleanup = draggable({
    element: el.value,
    getInitialData: () => ({ taskId: props.task.frontmatter.id }),
    onDragStart: () => {
      dragging.value = true
    },
    onDrop: () => {
      dragging.value = false
    },
  })
})
onBeforeUnmount(() => cleanup?.())

const fm = computed(() => props.task.frontmatter)
const prio = computed(() => fm.value.priority)
const ac = computed(() => acProgress(props.task.body))
const acMeter = computed(() => meter(ac.value.done, ac.value.total, 5))
const subs = computed(() => subtaskCount(fm.value.id, allTasks.value))
const blocked = computed(() => blockedBy(props.task))
const labels = computed(() => fm.value.labels.filter((l) => l !== 'debt'))
const hasDebt = computed(() => fm.value.labels.includes('debt'))
const hasLinks = computed(() => subs.value > 0 || blocked.value != null)
const hasFoot = computed(
  () => labels.value.length > 0 || hasDebt.value || fm.value.assignee != null,
)
</script>

<template>
  <article
    ref="el"
    class="card"
    :class="{ 'card--dragging': dragging, 'card--orphan': orphan }"
    @click="openTask(task)"
  >
    <div class="card-head">
      <span class="card-id">{{ fm.id }}</span>
      <span v-if="prio === 'urgent'" class="card-prio card-prio--urgent">URGENT</span>
      <span v-else-if="prio === 'high'" class="card-prio card-prio--high">HIGH</span>
      <span v-else-if="prio === 'low'" class="card-prio card-prio--low">[low]</span>
    </div>

    <div class="card-title">{{ fm.title }}</div>

    <div v-if="ac.total > 0" class="card-ac">
      <span class="card-meter"
        ><span class="card-meter-on">{{ acMeter.filled }}</span
        >{{ acMeter.empty }}</span
      >
      <span class="card-ac-n">{{ ac.done }}/{{ ac.total }} criteria</span>
    </div>

    <div v-if="hasLinks" class="card-links">
      <span v-if="subs > 0">⊞ {{ subs }} subtask{{ subs > 1 ? 's' : '' }}</span>
      <span v-if="blocked" class="card-blocked">⤳ blocked by {{ blocked }}</span>
    </div>

    <div v-if="hasFoot" class="card-foot">
      <span v-for="l in labels" :key="l" class="card-label">#{{ l }}</span>
      <span v-if="hasDebt" class="card-debt">#debt</span>
      <span v-if="fm.assignee" class="card-assignee">@{{ fm.assignee }}</span>
    </div>
  </article>
</template>

<style scoped>
.card {
  background: var(--sv-surface-2);
  border: 1px solid var(--sv-line);
  border-radius: var(--sv-r-card);
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 7px;
  cursor: pointer;
  animation: sv-fade 0.24s ease both;
  transition:
    border-color 0.15s ease,
    background-color 0.15s ease;
}
.card:hover {
  border-color: var(--sv-line-strong);
  background: var(--sv-surface-3);
}
.card--dragging {
  opacity: 0.4;
}
.card--orphan {
  border-color: var(--sv-warn-line);
  background: var(--sv-warn-bg);
}
.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.card-id {
  font-size: 11px;
  color: var(--sv-fg);
  letter-spacing: 0.03em;
}
.card-prio {
  font-size: 9.5px;
  padding: 1px 7px;
  border-radius: var(--sv-r-badge);
  white-space: nowrap;
}
.card-prio--urgent {
  letter-spacing: 0.08em;
  background: var(--sv-accent);
  color: var(--sv-on-accent);
}
.card-prio--high {
  letter-spacing: 0.08em;
  color: var(--sv-fg);
  border: 1px solid var(--sv-line-strong);
}
.card-prio--low {
  letter-spacing: 0.06em;
  color: var(--sv-fg-dim);
}
.card-title {
  font-size: 12.5px;
  line-height: 1.45;
  color: var(--sv-fg-card);
}
.card-ac {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 10px;
  color: var(--sv-fg-mid);
}
.card-meter {
  letter-spacing: -0.05em;
}
.card-meter-on {
  color: var(--sv-fg);
}
.card-ac-n {
  font-variant-numeric: tabular-nums;
}
.card-links {
  display: flex;
  gap: 12px;
  align-items: center;
  font-size: 10px;
  color: var(--sv-fg-mid);
  flex-wrap: wrap;
}
.card-blocked {
  color: var(--sv-blocked);
}
.card-foot {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  font-size: 10px;
}
.card-label {
  color: var(--sv-label);
}
.card-debt {
  color: var(--sv-warn);
  background: var(--sv-warn-bg-2);
  border: 1px solid var(--sv-warn-line);
  padding: 1px 5px;
  border-radius: var(--sv-r-badge);
}
.card-assignee {
  margin-left: auto;
  color: var(--sv-fg-dim);
}
</style>
