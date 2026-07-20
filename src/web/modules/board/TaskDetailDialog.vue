<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Priority, Task } from '../../../domain'
import { useBoard } from './board.store'
import { acItems, shortDate } from '../../lib/task-meta'

const props = defineProps<{ task: Task }>()
const { board, update, remove, closeTask } = useBoard()

const title = ref('')
const status = ref('')
const priority = ref('')
const labels = ref('')
const body = ref('')
const saving = ref(false)

function sync(task: Task): void {
  title.value = task.frontmatter.title
  status.value = task.frontmatter.status
  priority.value = task.frontmatter.priority ?? ''
  labels.value = task.frontmatter.labels.join(', ')
  body.value = task.body
}
watch(() => props.task, sync, { immediate: true })

const columns = computed(() => board.value?.columns.map((c) => c.column) ?? [])
const assignee = computed(() => props.task.frontmatter.assignee)
const acList = computed(() => acItems(body.value))
const acDone = computed(() => acList.value.filter((a) => a.done).length)
const created = computed(() => shortDate(props.task.frontmatter.created))
const updated = computed(() => shortDate(props.task.frontmatter.updated))

function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') closeTask()
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

async function save(): Promise<void> {
  const clean = title.value.trim()
  if (!clean) return
  saving.value = true
  await update(props.task.frontmatter.id, {
    title: clean,
    status: status.value,
    priority: priority.value ? (priority.value as Priority) : undefined,
    labels: labels.value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    body: body.value,
  })
  saving.value = false
  closeTask()
}

async function destroy(): Promise<void> {
  saving.value = true
  await remove(props.task.frontmatter.id)
  saving.value = false
  closeTask()
}
</script>

<template>
  <Teleport to="body">
    <div class="modal" @click.self="closeTask">
      <div class="sheet" role="dialog" aria-modal="true">
        <header class="sheet-head">
          <span class="sheet-id">{{ task.frontmatter.id }}</span>
          <button class="sheet-esc" type="button" @click="closeTask">[esc]</button>
        </header>

        <input v-model="title" class="sheet-title" type="text" placeholder="Task title…" />

        <div class="sheet-row">
          <label class="field">
            <span class="field-l">status</span>
            <div class="select">
              <select v-model="status">
                <option v-for="c in columns" :key="c.id" :value="c.id">{{ c.label }}</option>
              </select>
              <span class="select-caret">▾</span>
            </div>
          </label>
          <label class="field">
            <span class="field-l">priority</span>
            <div class="select" :class="{ 'select--set': priority }">
              <select v-model="priority">
                <option value="">—</option>
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high">high</option>
                <option value="urgent">urgent</option>
              </select>
              <span class="select-caret">▾</span>
            </div>
          </label>
          <div v-if="assignee" class="field">
            <span class="field-l">assignee</span>
            <div class="field-ro">@{{ assignee }}</div>
          </div>
        </div>

        <label class="field">
          <span class="field-l">labels <span class="field-hint">— comma-separated</span></span>
          <input v-model="labels" class="input" type="text" placeholder="bug, auth…" />
        </label>

        <div v-if="acList.length" class="ac">
          <div class="ac-l">## acceptance criteria · {{ acDone }}/{{ acList.length }}</div>
          <div class="ac-list">
            <div v-for="(a, i) in acList" :key="i" class="ac-item">
              <span v-if="a.done" class="ac-done">[x] {{ a.text }}</span>
              <span v-else class="ac-todo">[ ] {{ a.text }}</span>
            </div>
          </div>
        </div>

        <label class="field">
          <span class="field-l"
            >## body <span class="field-hint">— description, criteria, notes</span></span
          >
          <textarea v-model="body" class="input textarea" rows="7" spellcheck="false"></textarea>
        </label>

        <footer class="sheet-foot">
          <span class="sheet-meta">created {{ created }} · updated {{ updated }}</span>
          <div class="sheet-actions">
            <button class="btn btn--danger" type="button" :disabled="saving" @click="destroy">
              rm
            </button>
            <button class="btn" type="button" :disabled="saving" @click="closeTask">esc</button>
            <button class="btn btn--primary" type="button" :disabled="saving" @click="save">
              save
            </button>
          </div>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.modal {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(4, 4, 6, 0.62);
  backdrop-filter: blur(5px);
  -webkit-backdrop-filter: blur(5px);
  animation: sv-fade 0.16s ease both;
}
.sheet {
  width: 100%;
  max-width: 560px;
  max-height: 88vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 22px 24px;
  background: var(--sv-surface-2);
  border: 1px solid var(--sv-line);
  border-radius: var(--sv-r-panel);
  box-shadow: var(--sv-shadow-modal);
}
.sheet-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: var(--sv-fg-dim);
}
.sheet-id {
  color: var(--sv-fg);
}
.sheet-esc {
  background: transparent;
  border: 0;
  color: var(--sv-fg-dim);
  font-size: 12px;
  cursor: pointer;
}
.sheet-esc:hover {
  color: var(--sv-fg);
}
.sheet-title {
  width: 100%;
  background: transparent;
  border: 0;
  border-bottom: 1px solid var(--sv-line);
  padding: 2px 0 14px;
  font-size: 18px;
  color: var(--sv-fg);
}
.sheet-row {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.field {
  flex: 1;
  min-width: 130px;
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.field-l {
  font-size: 9.5px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--sv-fg-dim);
}
.field-hint {
  letter-spacing: 0;
  text-transform: none;
  color: var(--sv-fg-dim);
}
.field-ro {
  border: 1px solid var(--sv-line);
  border-radius: var(--sv-r);
  padding: 8px 11px;
  font-size: 13px;
  color: var(--sv-fg-mid);
}
.input {
  width: 100%;
  background: var(--sv-surface);
  border: 1px solid var(--sv-line);
  border-radius: var(--sv-r);
  padding: 9px 12px;
  color: var(--sv-fg);
  font-family: inherit;
  font-size: 13px;
  transition: border-color 0.15s ease;
}
.input:focus {
  border-color: var(--sv-accent);
}
.textarea {
  resize: vertical;
  line-height: 1.55;
}
.ac {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.ac-l {
  font-size: 11px;
  color: var(--sv-fg-dim);
}
.ac-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12.5px;
}
.ac-done {
  color: var(--sv-fg-dim);
  text-decoration: line-through;
}
.ac-todo {
  color: var(--sv-fg-card);
}
.select {
  position: relative;
  display: flex;
}
.select select {
  appearance: none;
  -webkit-appearance: none;
  width: 100%;
  background: var(--sv-surface);
  border: 1px solid var(--sv-line);
  border-radius: var(--sv-r);
  padding: 8px 28px 8px 11px;
  color: var(--sv-fg);
  font-family: inherit;
  font-size: 13px;
  cursor: pointer;
}
.select--set select {
  border-color: var(--sv-line-strong);
}
.select select:focus {
  border-color: var(--sv-accent);
}
.select-caret {
  position: absolute;
  right: 10px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--sv-fg-dim);
  pointer-events: none;
  font-size: 12px;
}
.sheet-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-top: 1px solid var(--sv-line);
  padding-top: 16px;
  flex-wrap: wrap;
}
.sheet-meta {
  font-size: 10.5px;
  color: var(--sv-fg-dim);
  font-variant-numeric: tabular-nums;
}
.sheet-actions {
  display: flex;
  gap: 9px;
  margin-left: auto;
}
.btn {
  padding: 8px 15px;
  border-radius: var(--sv-r);
  border: 1px solid var(--sv-line);
  background: transparent;
  color: var(--sv-fg-mid);
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    color 0.15s ease,
    opacity 0.15s ease;
}
.btn:hover {
  border-color: var(--sv-line-strong);
  color: var(--sv-fg);
}
.btn:disabled {
  opacity: 0.5;
  cursor: default;
}
.btn--primary {
  background: var(--sv-accent);
  color: var(--sv-on-accent);
  border-color: var(--sv-accent);
  font-weight: 600;
}
.btn--primary:hover {
  color: var(--sv-on-accent);
}
.btn--danger {
  color: var(--sv-danger);
  border-color: var(--sv-danger-line);
}
.btn--danger:hover {
  color: var(--sv-danger);
  border-color: var(--sv-danger);
}
</style>
