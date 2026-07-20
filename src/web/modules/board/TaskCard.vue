<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { draggable } from '@atlaskit/pragmatic-drag-and-drop/element/adapter'
import type { Task } from '../../../domain'
import { useBoard } from './board.store'

const props = defineProps<{ task: Task }>()
const { openTask } = useBoard()

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

const PRIORITY_LABELS: Record<string, string> = {
  urgent: 'Urgent',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
}
const priority = computed(() => props.task.frontmatter.priority)
const showPriority = computed(() => priority.value != null && priority.value !== 'medium')
</script>

<template>
  <article
    ref="el"
    class="sv-card"
    :class="{ 'sv-card--dragging': dragging }"
    @click="openTask(task)"
  >
    <header class="sv-card-head">
      <span class="sv-card-id mono">{{ task.frontmatter.id }}</span>
      <span v-if="showPriority" class="sv-badge" :data-prio="priority">
        <span class="sv-badge-dot"></span>{{ PRIORITY_LABELS[priority as string] }}
      </span>
    </header>
    <p class="sv-card-title">{{ task.frontmatter.title }}</p>
    <div v-if="task.frontmatter.labels.length" class="sv-card-labels">
      <span v-for="label in task.frontmatter.labels" :key="label" class="sv-label">{{ label }}</span>
    </div>
  </article>
</template>

<style scoped>
.sv-card {
  background: var(--sv-surface);
  border: 1px solid var(--sv-border);
  border-radius: var(--sv-radius-card);
  box-shadow: var(--sv-shadow-card);
  padding: 13px 14px;
  display: flex;
  flex-direction: column;
  gap: 9px;
  cursor: grab;
  animation: sv-fade 0.28s ease both;
  transition:
    border-color 0.18s ease,
    transform 0.18s ease;
}
.sv-card:hover {
  border-color: var(--sv-border-strong);
}
.sv-card:active {
  cursor: grabbing;
}
.sv-card--dragging {
  opacity: 0.4;
}
.sv-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.sv-card-id {
  font-size: 10.5px;
  color: var(--sv-ink-3);
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--sv-border);
  padding: 2px 7px;
  border-radius: var(--sv-radius-sm);
}
.sv-card-title {
  margin: 0;
  font-size: 14px;
  line-height: 1.4;
  font-weight: 500;
  color: var(--sv-ink);
}
.sv-card-labels {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.sv-label {
  font-size: 10.5px;
  color: var(--sv-ink-2);
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--sv-border);
  padding: 2px 8px;
  border-radius: 999px;
}
.sv-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 600;
  padding: 3px 9px;
  border-radius: 999px;
  white-space: nowrap;
}
.sv-badge-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}
.sv-badge[data-prio='urgent'] {
  color: var(--sv-urgent);
  background: color-mix(in srgb, var(--sv-urgent) 14%, transparent);
  border: 1px solid color-mix(in srgb, var(--sv-urgent) 28%, transparent);
}
.sv-badge[data-prio='high'] {
  color: var(--sv-high);
  background: color-mix(in srgb, var(--sv-high) 14%, transparent);
  border: 1px solid color-mix(in srgb, var(--sv-high) 28%, transparent);
}
.sv-badge[data-prio='low'] {
  color: var(--sv-low);
  background: color-mix(in srgb, var(--sv-low) 14%, transparent);
  border: 1px solid color-mix(in srgb, var(--sv-low) 28%, transparent);
}
</style>
