<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { Priority, Task } from '../../../domain'
import type { UpdateInput } from '../../lib/api'
import { useBoard } from './board.store'
import { acItems, shortDate } from '../../lib/task-meta'
import MarkdownBody from '../../components/MarkdownBody.vue'

const props = defineProps<{ task: Task }>()
const { board, update, remove, closeTask, actionError } = useBoard()

const title = ref('')
const status = ref('')
const priority = ref('')
const labels = ref('')
const body = ref('')
const saving = ref(false)
const error = ref<string | null>(null)

// The body is markdown a human AND an agent write into: `## Comments` appended
// by `suivre comment`, criteria checked off by the agent. Reading is the common
// case, so the card opens on the reader and editing is the deliberate step.
type BodyMode = 'read' | 'edit'
const bodyMode = ref<BodyMode>('read')
const bodyInput = ref<HTMLTextAreaElement | null>(null)

async function setBodyMode(next: BodyMode): Promise<void> {
  bodyMode.value = next
  if (next !== 'edit') return
  await nextTick()
  bodyInput.value?.focus()
}

function labelsOf(task: Task): string {
  return task.frontmatter.labels.join(', ')
}

// Last server state this form was reconciled against. The store re-resolves
// the open card on every reload, so `props.task` changes under an open dialog.
let base: Task = props.task

function reset(task: Task): void {
  title.value = task.frontmatter.title
  status.value = task.frontmatter.status
  priority.value = task.frontmatter.priority ?? ''
  labels.value = labelsOf(task)
  body.value = task.body
  bodyMode.value = 'read'
  base = task
}

/**
 * Reconciles an incoming version of the SAME task: every field the user has
 * not touched takes the new value, the ones being edited are left alone. An
 * agent commenting on the task mid-edit must not lose its comment on Save,
 * and must not cost the user their draft either.
 */
function adopt(next: Task): void {
  if (title.value === base.frontmatter.title) title.value = next.frontmatter.title
  if (status.value === base.frontmatter.status) status.value = next.frontmatter.status
  if (priority.value === (base.frontmatter.priority ?? ''))
    priority.value = next.frontmatter.priority ?? ''
  if (labels.value === labelsOf(base)) labels.value = labelsOf(next)
  if (body.value === base.body) body.value = next.body
  base = next
}

reset(props.task)
watch(
  () => props.task,
  (next) => {
    if (next.frontmatter.id === base.frontmatter.id) adopt(next)
    else reset(next)
  },
)

const columns = computed(() => board.value?.columns.map((c) => c.column) ?? [])
const assignee = computed(() => props.task.frontmatter.assignee)
const acList = computed(() => acItems(body.value))
const acDone = computed(() => acList.value.filter((a) => a.done).length)
const hasBody = computed(() => body.value.trim().length > 0)
const created = computed(() => shortDate(props.task.frontmatter.created))
const updated = computed(() => shortDate(props.task.frontmatter.updated))

function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') closeTask()
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))

/**
 * Only the fields the user actually changed, measured against `base`. Sending
 * the whole form would revert whatever landed on disk since the card opened —
 * a `suivre move`, a comment appended to the body.
 * An explicit null clears priority; omitting it preserves the current value.
 */
function patchOf(clean: string): UpdateInput {
  const patch: UpdateInput = {}
  const list = labels.value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (clean !== base.frontmatter.title) patch.title = clean
  if (status.value !== base.frontmatter.status) patch.status = status.value
  if (priority.value !== (base.frontmatter.priority ?? ''))
    patch.priority = priority.value ? (priority.value as Priority) : null
  if (list.join('\0') !== base.frontmatter.labels.join('\0')) patch.labels = list
  if (body.value !== base.body) patch.body = body.value
  return patch
}

async function run(write: () => Promise<boolean>): Promise<void> {
  error.value = null
  saving.value = true
  try {
    if (await write()) closeTask()
    else error.value = actionError.value
  } finally {
    saving.value = false
  }
}

async function save(): Promise<void> {
  const clean = title.value.trim()
  if (!clean) return
  const patch = patchOf(clean)
  if (Object.keys(patch).length === 0) {
    closeTask()
    return
  }
  await run(() => update(props.task.frontmatter.id, patch))
}

async function destroy(): Promise<void> {
  const { id, title: name } = props.task.frontmatter
  if (!window.confirm(`Delete ${id} "${name}"? Its .md file is removed from the repo.`)) return
  await run(() => remove(id))
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

        <!-- Edit-only: in read mode the renderer draws the same boxes, right below. -->
        <div v-if="acList.length && bodyMode === 'edit'" class="ac">
          <div class="ac-l">## acceptance criteria · {{ acDone }}/{{ acList.length }}</div>
          <div class="ac-list">
            <div v-for="(a, i) in acList" :key="i" class="ac-item">
              <span v-if="a.done" class="ac-done">[x] {{ a.text }}</span>
              <span v-else class="ac-todo">[ ] {{ a.text }}</span>
            </div>
          </div>
        </div>

        <div class="field">
          <div class="body-head">
            <span class="field-l">## body</span>
            <span class="body-rule"></span>
            <div class="seg" role="group" aria-label="Body mode">
              <button
                class="seg-opt"
                :class="{ 'seg-opt--on': bodyMode === 'read' }"
                type="button"
                :aria-pressed="bodyMode === 'read'"
                @click="setBodyMode('read')"
              >
                read
              </button>
              <button
                class="seg-opt"
                :class="{ 'seg-opt--on': bodyMode === 'edit' }"
                type="button"
                :aria-pressed="bodyMode === 'edit'"
                @click="setBodyMode('edit')"
              >
                edit
              </button>
            </div>
          </div>
          <div v-if="bodyMode === 'read'" class="body-read">
            <MarkdownBody v-if="hasBody" :source="body" measure="100%" />
            <p v-else class="body-none">No body yet — switch to edit to write one.</p>
          </div>
          <textarea
            v-else
            ref="bodyInput"
            v-model="body"
            class="input textarea"
            rows="7"
            spellcheck="false"
            aria-label="Task body, markdown"
            placeholder="Description, acceptance criteria, notes…"
          ></textarea>
        </div>

        <div v-if="error" class="sheet-err">✗ {{ error }}</div>

        <footer class="sheet-foot">
          <div class="sheet-foot-l">
            <button class="btn btn--danger" type="button" :disabled="saving" @click="destroy">
              rm
            </button>
            <span class="sheet-meta">created {{ created }} · updated {{ updated }}</span>
          </div>
          <div class="sheet-actions">
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
  background: var(--sv-scrim);
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
.body-head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 3px;
}
.body-rule {
  flex: 1;
  height: 1px;
  background: var(--sv-line-soft);
}
.seg {
  display: inline-flex;
  gap: 2px;
  border: 1px solid var(--sv-line);
  border-radius: var(--sv-r-badge);
  overflow: hidden;
}
.seg-opt {
  background: transparent;
  border: 0;
  padding: 3px 9px;
  color: var(--sv-fg-dim);
  font-family: inherit;
  font-size: 10.5px;
  cursor: pointer;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
}
.seg-opt:hover {
  color: var(--sv-fg-mid);
}
.seg-opt--on,
.seg-opt--on:hover {
  background: var(--sv-surface-3);
  color: var(--sv-fg);
}
.body-read {
  border: 1px solid var(--sv-line);
  border-radius: var(--sv-r);
  background: var(--sv-surface);
  padding: 14px 16px;
  max-height: 320px;
  overflow-y: auto;
}
.body-read :deep(.mkd > :first-child) {
  margin-top: 0;
}
.body-read :deep(.mkd > :last-child) {
  margin-bottom: 0;
}
.body-none {
  margin: 0;
  font-size: 12.5px;
  color: var(--sv-fg-dim);
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
.sheet-err {
  border: 1px solid var(--sv-danger-line);
  background: var(--sv-danger-bg);
  border-radius: var(--sv-r);
  padding: 9px 12px;
  font-size: 11.5px;
  color: var(--sv-danger);
  overflow-wrap: anywhere;
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
/* `rm` deletes a file: it does not sit next to `save`. It lives on the left,
   with the dates, out of the reach of a mis-aimed click on the primary. */
.sheet-foot-l {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 14px;
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
