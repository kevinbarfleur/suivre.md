<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Priority, Task } from '../../../domain'
import { useBoard } from './board.store'

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

const columns = () => board.value?.columns.map((c) => c.column) ?? []

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
    <div class="sv-modal" @click.self="closeTask">
      <div class="sv-sheet" role="dialog" aria-modal="true">
        <header class="sv-sheet-head">
          <span class="sv-sheet-id mono">{{ task.frontmatter.id }}</span>
          <button class="sv-x" type="button" aria-label="Fermer" @click="closeTask">×</button>
        </header>

        <label class="sv-field">
          <span class="sv-field-l mono">Titre</span>
          <input v-model="title" class="sv-input" type="text" />
        </label>

        <div class="sv-field-row">
          <label class="sv-field">
            <span class="sv-field-l mono">Statut</span>
            <select v-model="status" class="sv-input">
              <option v-for="c in columns()" :key="c.id" :value="c.id">{{ c.label }}</option>
            </select>
          </label>
          <label class="sv-field">
            <span class="sv-field-l mono">Priorité</span>
            <select v-model="priority" class="sv-input">
              <option value="">—</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </label>
        </div>

        <label class="sv-field">
          <span class="sv-field-l mono">Labels (séparés par des virgules)</span>
          <input v-model="labels" class="sv-input" type="text" />
        </label>

        <label class="sv-field">
          <span class="sv-field-l mono">Notes</span>
          <textarea v-model="body" class="sv-input sv-textarea" rows="5"></textarea>
        </label>

        <footer class="sv-sheet-foot">
          <button class="sv-btn sv-btn--danger" type="button" :disabled="saving" @click="destroy">
            Supprimer
          </button>
          <div class="sv-foot-right">
            <button class="sv-btn" type="button" :disabled="saving" @click="closeTask">Annuler</button>
            <button class="sv-btn sv-btn--primary" type="button" :disabled="saving" @click="save">
              Enregistrer
            </button>
          </div>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.sv-modal {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background: rgba(4, 4, 6, 0.55);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  animation: sv-fade 0.18s ease both;
}
.sv-sheet {
  width: 100%;
  max-width: 520px;
  max-height: 88vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 22px;
  background: rgba(22, 22, 24, 0.86);
  border: 1px solid var(--sv-border-strong);
  border-radius: var(--sv-radius-col);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.14),
    0 40px 90px -40px rgba(0, 0, 0, 0.95);
  backdrop-filter: var(--sv-glass-blur);
  -webkit-backdrop-filter: var(--sv-glass-blur);
}
.sv-sheet-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.sv-sheet-id {
  font-size: 11px;
  color: var(--sv-ink-3);
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--sv-border);
  padding: 3px 8px;
  border-radius: var(--sv-radius-sm);
}
.sv-x {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  border: 1px solid var(--sv-border);
  background: rgba(255, 255, 255, 0.05);
  color: var(--sv-ink-2);
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
}
.sv-x:hover {
  color: var(--sv-ink);
  border-color: var(--sv-border-strong);
}
.sv-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.sv-field-row {
  display: flex;
  gap: 12px;
}
.sv-field-row .sv-field {
  flex: 1;
}
.sv-field-l {
  font-size: 10px;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: var(--sv-ink-3);
}
.sv-input {
  width: 100%;
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid var(--sv-border);
  border-radius: var(--sv-radius);
  padding: 10px 12px;
  color: var(--sv-ink);
  font-family: inherit;
  font-size: 14px;
  outline: none;
  transition: border-color 0.18s ease;
}
.sv-input:focus {
  border-color: var(--sv-border-strong);
}
.sv-textarea {
  resize: vertical;
  line-height: 1.5;
}
.sv-sheet-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 4px;
}
.sv-foot-right {
  display: flex;
  gap: 8px;
}
.sv-btn {
  padding: 9px 15px;
  border-radius: var(--sv-radius);
  border: 1px solid var(--sv-border);
  background: rgba(255, 255, 255, 0.06);
  color: var(--sv-ink);
  font-family: inherit;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition:
    background-color 0.18s ease,
    border-color 0.18s ease,
    opacity 0.18s ease;
}
.sv-btn:hover {
  border-color: var(--sv-border-strong);
}
.sv-btn:disabled {
  opacity: 0.5;
  cursor: default;
}
.sv-btn--primary {
  background: linear-gradient(180deg, #ffffff, #eaeaed);
  color: #0b0b0d;
  border-color: rgba(255, 255, 255, 0.6);
  font-weight: 600;
}
.sv-btn--danger {
  color: var(--sv-urgent);
  border-color: color-mix(in srgb, var(--sv-urgent) 26%, transparent);
  background: color-mix(in srgb, var(--sv-urgent) 10%, transparent);
}
</style>
