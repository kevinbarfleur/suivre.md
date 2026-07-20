<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter'
import type { BoardColumn } from '../../../domain'
import { useBoard } from './board.store'
import TaskCard from './TaskCard.vue'

const props = defineProps<{ col: BoardColumn }>()
const { create } = useBoard()

const el = ref<HTMLElement | null>(null)
const over = ref(false)
let cleanup: (() => void) | undefined

onMounted(() => {
  if (!el.value) return
  cleanup = dropTargetForElements({
    element: el.value,
    getData: () => ({ columnId: props.col.column.id }),
    onDragEnter: () => {
      over.value = true
    },
    onDragLeave: () => {
      over.value = false
    },
    onDrop: () => {
      over.value = false
    },
  })
})
onBeforeUnmount(() => cleanup?.())

const draft = ref('')
async function add(): Promise<void> {
  const title = draft.value.trim()
  if (!title) return
  draft.value = ''
  await create({ title, status: props.col.column.id })
}
</script>

<template>
  <section ref="el" class="sv-col" :class="{ 'sv-col--over': over }">
    <header class="sv-col-head">
      <span class="sv-col-label mono">{{ col.column.label }}</span>
      <span class="sv-col-count mono">{{ col.tasks.length }}</span>
    </header>
    <div class="sv-col-list">
      <TaskCard v-for="task in col.tasks" :key="task.frontmatter.id" :task="task" />
      <p v-if="col.tasks.length === 0" class="sv-col-empty">Vide</p>
    </div>
    <div class="sv-col-add">
      <input
        v-model="draft"
        class="sv-add-input"
        type="text"
        placeholder="+ Ajouter une tâche"
        @keydown.enter="add"
      />
    </div>
  </section>
</template>

<style scoped>
.sv-col {
  width: 300px;
  flex: none;
  display: flex;
  flex-direction: column;
  max-height: 100%;
  background: var(--sv-surface-2);
  border: 1px solid var(--sv-border);
  border-radius: var(--sv-radius-col);
  backdrop-filter: var(--sv-glass-blur);
  -webkit-backdrop-filter: var(--sv-glass-blur);
  transition:
    border-color 0.18s ease,
    background-color 0.18s ease;
}
.sv-col--over {
  border-color: color-mix(in srgb, var(--sv-high) 45%, var(--sv-border));
  background: rgba(255, 255, 255, 0.05);
}
.sv-col-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px 10px;
}
.sv-col-label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--sv-ink-2);
}
.sv-col-count {
  font-size: 11px;
  color: var(--sv-ink-3);
  font-variant-numeric: tabular-nums;
}
.sv-col-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 4px 12px 8px;
  overflow-y: auto;
}
.sv-col-empty {
  margin: 0;
  padding: 12px 0;
  text-align: center;
  font-size: 12px;
  color: var(--sv-ink-3);
}
.sv-col-add {
  padding: 8px 12px 12px;
}
.sv-add-input {
  width: 100%;
  background: rgba(0, 0, 0, 0.22);
  border: 1px solid var(--sv-border);
  border-radius: var(--sv-radius);
  padding: 9px 12px;
  color: var(--sv-ink);
  font-family: inherit;
  font-size: 13px;
  outline: none;
  transition:
    border-color 0.18s ease,
    background-color 0.18s ease;
}
.sv-add-input::placeholder {
  color: var(--sv-ink-3);
}
.sv-add-input:focus {
  border-color: var(--sv-border-strong);
  background: rgba(0, 0, 0, 0.32);
}
</style>
