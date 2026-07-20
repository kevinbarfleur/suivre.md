<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
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

const wip = computed(() => props.col.column.wipLimit)
const overWip = computed(() => wip.value != null && props.col.tasks.length > wip.value)

const draft = ref('')
const adding = ref(false)
const input = ref<HTMLInputElement | null>(null)

async function openAdd(): Promise<void> {
  adding.value = true
  await nextTick()
  input.value?.focus()
}
function cancelAdd(): void {
  adding.value = false
  draft.value = ''
}
function onBlur(): void {
  if (!draft.value.trim()) cancelAdd()
}
async function submit(): Promise<void> {
  const title = draft.value.trim()
  if (!title) return
  draft.value = ''
  adding.value = false
  await create({ title, status: props.col.column.id })
}
</script>

<template>
  <section ref="el" class="col" :class="{ 'col--over': over }">
    <header class="col-head">
      <span class="col-label"><span class="col-hash">#</span> {{ col.column.label }}</span>
      <span class="col-count" :class="{ 'col-count--over': overWip }"
        >[{{ col.tasks.length }}<template v-if="wip != null">/{{ wip }}</template>]</span
      >
    </header>

    <div class="col-list">
      <TaskCard v-for="task in col.tasks" :key="task.frontmatter.id" :task="task" />
      <div v-if="col.tasks.length === 0" class="col-empty">
        column empty<br /><span class="col-empty-hint">drop task here</span>
      </div>
    </div>

    <div v-if="adding" class="col-add">
      <input
        ref="input"
        v-model="draft"
        class="col-add-input"
        type="text"
        placeholder="titre de la tâche…"
        @keydown.enter="submit"
        @keydown.esc="cancelAdd"
        @blur="onBlur"
      />
    </div>
    <button v-else class="col-add-btn" type="button" @click="openAdd">$ task add …</button>
  </section>
</template>

<style scoped>
.col {
  flex: 0 0 262px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 4px;
  border-radius: 8px;
  transition: background-color 0.15s ease;
}
.col--over {
  background: rgba(126, 160, 143, 0.06);
}
.col-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--sv-line);
  padding: 0 4px 9px;
  font-size: 13px;
}
.col-label {
  color: var(--sv-fg-mid);
}
.col-hash {
  color: var(--sv-fg-dim);
}
.col-count {
  color: var(--sv-fg-dim);
  font-variant-numeric: tabular-nums;
}
.col-count--over {
  color: var(--sv-warn);
}
.col-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.col-empty {
  border: 1px dashed var(--sv-line);
  border-radius: 8px;
  padding: 16px;
  text-align: center;
  font-size: 12px;
  color: var(--sv-fg-dim);
  line-height: 1.7;
}
.col-empty-hint {
  font-size: 10px;
}
.col-add-btn {
  text-align: left;
  background: transparent;
  border: 1px dashed var(--sv-line);
  border-radius: 6px;
  padding: 9px 12px;
  color: var(--sv-fg-dim);
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    color 0.15s ease;
}
.col-add-btn:hover {
  border-color: var(--sv-line-strong);
  color: var(--sv-fg-mid);
}
.col-add {
  border: 1px dashed var(--sv-line-strong);
  border-radius: 6px;
  padding: 9px 11px;
  background: var(--sv-raised);
}
.col-add-input {
  border: 0;
  background: transparent;
  width: 100%;
  font-size: 12px;
  color: var(--sv-fg);
}
</style>
