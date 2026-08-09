<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import { resolveSprint } from '../../../domain/sprint-resolve'
import type { SprintStep } from '../../lib/api'
import ErrorBanner from '../../components/ErrorBanner.vue'
import LoadingBlock from '../../components/LoadingBlock.vue'
import MarkdownBody from '../../components/MarkdownBody.vue'
import SearchField from '../../components/SearchField.vue'
import StateBlock from '../../components/StateBlock.vue'
import { useBoard } from '../board/board.store'
import { useView } from '../shell/view.store'
import { finalColumnId } from '../../lib/aggregate'
import { acItems, acProgress, meter } from '../../lib/task-meta'
import { useSprints } from './sprints.store'

// Sprints view: an ordered checklist of existing tasks to ship. Each step is a
// full card — description + acceptance criteria inline, so the detail is visible
// without opening the task. Checking a step moves the task to the board's final
// column; subtasks (tasks whose parent is a sprint task) nest under it.
const { sprints, loading, error, ensureLoaded, reload, create, update, remove } = useSprints()
const { board, allTasks, openTask, move } = useBoard()
const { item, setView } = useView()
onMounted(ensureLoaded)

// Gauge widths. 25 is what the overview and the stats panel already print for a
// headline ratio; 6 is the compact card gauge; 14 fits the sprint list column.
const HERO_WIDTH = 25
const SIDE_WIDTH = 14
const AC_WIDTH = 6

// Every status this view reads or writes comes from the board columns. A
// literal would move cards into a column that does not exist on a renamed
// board — which is how ticking a checkbox ends up kicking a card off the board.
const columns = computed(() => board.value?.columns.map((c) => c.column) ?? [])
const doneId = computed(() => finalColumnId(columns.value))
const reopenId = computed(() => (columns.value.at(-2) ?? columns.value[0])?.id ?? null)

const statusLabel = (id: string | null): string =>
  board.value?.columns.find((c) => c.column.id === id)?.column.label ?? id ?? ''

const sorted = computed(() =>
  [...sprints.value].sort((a, b) => {
    const av = a.frontmatter.status === 'done' ? 1 : 0
    const bv = b.frontmatter.status === 'done' ? 1 : 0
    if (av !== bv) return av - bv
    return b.frontmatter.id.localeCompare(a.frontmatter.id)
  }),
)

// One resolution per sprint: the list read its progress helper three times per
// row, and each read re-resolved the sprint against every task on the board.
const listed = computed(() =>
  sorted.value.map((s) => {
    const r = resolveSprint(s.frontmatter.items, allTasks.value, doneId.value ?? undefined)
    const m = meter(r.done, r.total, SIDE_WIDTH)
    return {
      id: s.frontmatter.id,
      title: s.frontmatter.title,
      done: r.done,
      total: r.total,
      filled: m.filled,
      empty: m.empty,
    }
  }),
)

const selectedId = computed(() => {
  if (item.value && sprints.value.some((s) => s.frontmatter.id === item.value)) return item.value
  return sorted.value[0]?.frontmatter.id ?? null
})
const selected = computed(
  () => sprints.value.find((s) => s.frontmatter.id === selectedId.value) ?? null,
)

const resolved = computed(() =>
  selected.value
    ? resolveSprint(selected.value.frontmatter.items, allTasks.value, doneId.value ?? undefined)
    : null,
)
const pct = computed(() =>
  resolved.value && resolved.value.total
    ? Math.round((resolved.value.done / resolved.value.total) * 100)
    : 0,
)
const hero = computed(() =>
  meter(resolved.value?.done ?? 0, resolved.value?.total ?? 0, HERO_WIDTH, '█', '░'),
)

// Anything that opens a markdown block: a heading, a bullet, an ordered item,
// a quote, a fence. Used to find where the prose starts and stops, never to
// render it — the reader does that.
const BLOCK_RE = /^\s*(#|[-*+][ \t]|\d+\.[ \t]|>|```)/
const isProse = (line: string): boolean => line.trim() !== '' && !BLOCK_RE.test(line)

// A step shows the task's opening paragraph — the criteria are already listed
// below it and the rest belongs to the task. Slicing the body is data, the
// paragraph itself goes to the shared reader as markdown.
function description(body: string): string {
  const lines = body.split('\n')
  const start = lines.findIndex(isProse)
  if (start < 0) return ''
  let end = start
  while (end < lines.length && isProse(lines[end]!)) end += 1
  return lines.slice(start, end).join('\n')
}

// Pre-resolve everything each card needs to render its detail inline.
const cards = computed(() => {
  const r = resolved.value
  if (!r) return []
  return r.steps.map((step, i) => {
    const t = step.task
    const body = t?.body ?? ''
    const p = acProgress(body)
    const m = meter(p.done, p.total, AC_WIDTH)
    return {
      step,
      i,
      here: i === r.currentIndex,
      title: t ? t.frontmatter.title : '(missing — task deleted)',
      priority: t?.frontmatter.priority ?? null,
      labels: t ? t.frontmatter.labels : [],
      description: description(body),
      ac: acItems(body),
      acDone: p.done,
      acTotal: p.total,
      acFilled: m.filled,
      acEmpty: m.empty,
      subtasks: step.subtasks,
    }
  })
})

function select(id: string): void {
  setView('sprints', id)
}

// --- Create ---
const creating = ref(false)
const newTitle = ref('')
const newInput = ref<HTMLInputElement | null>(null)
async function startCreate(): Promise<void> {
  creating.value = true
  await nextTick()
  newInput.value?.focus()
}
async function submitCreate(): Promise<void> {
  const t = newTitle.value.trim()
  if (!t) return
  newTitle.value = ''
  creating.value = false
  await create({ title: t })
}
function cancelCreate(): void {
  creating.value = false
  newTitle.value = ''
}

// --- Check off (moves the task in the board) ---
// Ticking sends the task to the final column, unticking to the one before it.
async function toggle(step: SprintStep): Promise<void> {
  const target = step.done ? reopenId.value : doneId.value
  if (!step.task || !target) return
  await move(step.task.frontmatter.id, { status: target })
}

// --- Builder (edit mode) ---
const editing = ref(false)
const pickerQuery = ref('')
const inSprint = computed(() => new Set(selected.value?.frontmatter.items ?? []))
const pickerResults = computed(() => {
  const q = pickerQuery.value.trim().toLowerCase()
  return allTasks.value
    .filter((t) => !inSprint.value.has(t.frontmatter.id))
    .filter((t) => !q || `${t.frontmatter.id} ${t.frontmatter.title}`.toLowerCase().includes(q))
    .slice(0, 10)
})
async function addTask(id: string): Promise<void> {
  if (!selected.value) return
  await update(selected.value.frontmatter.id, { items: [...selected.value.frontmatter.items, id] })
}
async function removeItem(id: string): Promise<void> {
  if (!selected.value) return
  await update(selected.value.frontmatter.id, {
    items: selected.value.frontmatter.items.filter((x) => x !== id),
  })
}
async function moveItem(index: number, dir: number): Promise<void> {
  if (!selected.value) return
  const items = [...selected.value.frontmatter.items]
  const j = index + dir
  if (j < 0 || j >= items.length) return
  const tmp = items[index]!
  items[index] = items[j]!
  items[j] = tmp
  await update(selected.value.frontmatter.id, { items })
}
async function deleteSprint(): Promise<void> {
  if (!selected.value) return
  if (!window.confirm(`Delete sprint "${selected.value.frontmatter.title}"?`)) return
  await remove(selected.value.frontmatter.id)
}
</script>

<template>
  <div class="sp">
    <div class="sp-bar">
      <template v-if="creating">
        <span class="sp-prompt">$</span>
        <input
          ref="newInput"
          v-model="newTitle"
          class="sp-new-in"
          type="text"
          placeholder="sprint title…"
          spellcheck="false"
          @keydown.enter="submitCreate"
          @keydown.esc="cancelCreate"
        />
        <button class="sp-btn sp-btn--primary" type="button" @click="submitCreate">create</button>
        <button class="sp-btn" type="button" @click="cancelCreate">esc</button>
      </template>
      <button v-else class="sp-new-btn" type="button" @click="startCreate">+ new sprint</button>
    </div>

    <ErrorBanner v-if="error" class="sp-err" :message="error" @retry="reload" />

    <LoadingBlock
      v-if="loading && sprints.length === 0"
      label="sprints"
      message="reading the sprint files…"
    />

    <StateBlock
      v-else-if="!error && sprints.length === 0 && !creating"
      label="no sprints"
      message="A sprint is an ordered checklist of tasks to ship. Create one, add tasks, then check them off as you go."
    >
      <template #hint>
        <span class="sb-prompt">$</span> <span class="sb-cmd">suivre sprint create "…"</span>
      </template>
    </StateBlock>

    <div v-else-if="sprints.length > 0" class="sp-grid">
      <div class="sp-side">
        <button
          v-for="s in listed"
          :key="s.id"
          class="sp-item"
          :class="{ 'sp-item--on': s.id === selectedId }"
          type="button"
          @click="select(s.id)"
        >
          <div class="sp-item-head">
            <span class="sp-item-title">{{ s.title }}</span>
            <span class="sp-item-n">{{ s.done }}/{{ s.total }}</span>
          </div>
          <div class="sp-item-meter">
            <span class="sp-item-on">{{ s.filled }}</span
            >{{ s.empty }}
          </div>
        </button>
      </div>

      <div v-if="selected && resolved" class="sp-detail">
        <header class="sp-hero">
          <div class="sp-hero-top">
            <h2 class="sp-title">{{ selected.frontmatter.title }}</h2>
            <div class="sp-actions">
              <button class="sp-btn" type="button" @click="editing = !editing">
                {{ editing ? 'done editing' : 'edit' }}
              </button>
              <button class="sp-btn sp-btn--danger" type="button" @click="deleteSprint">
                delete
              </button>
            </div>
          </div>
          <p v-if="selected.frontmatter.goal" class="sp-goal">{{ selected.frontmatter.goal }}</p>
          <div class="sp-hbar">
            <span class="sp-hbar-gauge"
              >[<span class="sp-hbar-on">{{ hero.filled }}</span
              >{{ hero.empty }}]</span
            >
            <span class="sp-hbar-pct">{{ pct }}%</span>
            <span class="sp-hbar-sep">·</span>
            <span>{{ resolved.done }}/{{ resolved.total }} done</span>
            <template v-if="resolved.currentIndex >= 0">
              <span class="sp-hbar-sep">·</span>
              <span>step {{ resolved.currentIndex + 1 }}/{{ resolved.total }}</span>
            </template>
            <template v-else-if="resolved.total > 0">
              <span class="sp-hbar-sep">·</span><span class="sp-hbar-ship">shipped ✓</span>
            </template>
          </div>
        </header>

        <StateBlock
          v-if="resolved.total === 0"
          label="no tasks"
          :message="
            editing
              ? 'Pick the tasks to ship from the list below, in the order you mean to ship them.'
              : 'This sprint is still empty — hit edit to add the tasks it should ship.'
          "
        />

        <div class="sp-steps">
          <article
            v-for="card in cards"
            :key="card.step.id"
            class="sp-card"
            :class="{
              'sp-card--done': card.step.done,
              'sp-card--here': card.here,
              'sp-card--missing': !card.step.task,
            }"
          >
            <div class="sp-rail">
              <button
                class="sp-check"
                :class="{ 'sp-check--on': card.step.done }"
                type="button"
                :disabled="!card.step.task"
                @click="toggle(card.step)"
              >
                {{ card.step.done ? '[x]' : '[ ]' }}
              </button>
            </div>

            <div class="sp-body">
              <div class="sp-head">
                <span class="sp-no">{{ card.i + 1 }}</span>
                <button
                  class="sp-title-btn"
                  type="button"
                  :disabled="!card.step.task"
                  @click="card.step.task && openTask(card.step.task)"
                >
                  <span class="sp-card-title">{{ card.title }}</span>
                </button>
                <span class="sp-spacer"></span>
                <span v-if="card.here" class="sp-here-tag">current</span>
                <span v-if="card.priority === 'urgent'" class="sp-prio sp-prio--urgent"
                  >URGENT</span
                >
                <span v-else-if="card.priority === 'high'" class="sp-prio sp-prio--high">HIGH</span>
                <span v-if="card.step.task && !card.step.done" class="sp-pill">{{
                  statusLabel(card.step.status)
                }}</span>
                <template v-if="editing">
                  <button
                    class="sp-mini"
                    type="button"
                    :disabled="card.i === 0"
                    @click="moveItem(card.i, -1)"
                  >
                    ↑
                  </button>
                  <button
                    class="sp-mini"
                    type="button"
                    :disabled="card.i === cards.length - 1"
                    @click="moveItem(card.i, 1)"
                  >
                    ↓
                  </button>
                  <button
                    class="sp-mini sp-mini--rm"
                    type="button"
                    @click="removeItem(card.step.id)"
                  >
                    ×
                  </button>
                </template>
              </div>

              <div class="sp-sub-id">{{ card.step.id }}</div>

              <div v-if="card.description" class="sp-desc">
                <MarkdownBody :source="card.description" />
              </div>

              <div v-if="card.acTotal > 0" class="sp-ac">
                <div class="sp-ac-head">
                  <span class="sp-ac-meter"
                    ><span class="sp-ac-on">{{ card.acFilled }}</span
                    >{{ card.acEmpty }}</span
                  >
                  <span class="sp-ac-n">{{ card.acDone }}/{{ card.acTotal }} criteria</span>
                </div>
                <ul class="sp-ac-list">
                  <li
                    v-for="(a, k) in card.ac"
                    :key="k"
                    class="sp-ac-item"
                    :class="{ 'sp-ac-item--done': a.done }"
                  >
                    <span class="sp-ac-box">{{ a.done ? '[x]' : '[ ]' }}</span>
                    <span class="sp-ac-text">{{ a.text }}</span>
                  </li>
                </ul>
              </div>

              <div v-if="card.subtasks.length" class="sp-subs">
                <div v-for="sub in card.subtasks" :key="sub.id" class="sp-subrow">
                  <button
                    class="sp-check sp-check--sm"
                    :class="{ 'sp-check--on': sub.done }"
                    type="button"
                    @click="toggle(sub)"
                  >
                    {{ sub.done ? '[x]' : '[ ]' }}
                  </button>
                  <button
                    class="sp-subrow-main"
                    type="button"
                    @click="sub.task && openTask(sub.task)"
                  >
                    <span class="sp-subrow-title" :class="{ 'sp-subrow-title--done': sub.done }">{{
                      sub.task?.frontmatter.title
                    }}</span>
                  </button>
                  <span v-if="!sub.done" class="sp-pill sp-pill--sm">{{
                    statusLabel(sub.status)
                  }}</span>
                </div>
              </div>

              <div v-if="card.labels.length" class="sp-labels">
                <span v-for="l in card.labels" :key="l" class="sp-tag">#{{ l }}</span>
              </div>
            </div>
          </article>
        </div>

        <div v-if="editing" class="sp-picker">
          <div class="sp-picker-l">add task</div>
          <SearchField
            v-model="pickerQuery"
            class="sp-picker-search"
            placeholder="search tasks to add…"
          />
          <div class="sp-picker-list">
            <button
              v-for="t in pickerResults"
              :key="t.frontmatter.id"
              class="sp-picker-row"
              type="button"
              @click="addTask(t.frontmatter.id)"
            >
              <span class="sp-picker-id">{{ t.frontmatter.id }}</span>
              <span class="sp-picker-title">{{ t.frontmatter.title }}</span>
              <span class="sp-pill sp-pill--sm">{{ statusLabel(t.frontmatter.status) }}</span>
            </button>
            <div v-if="pickerResults.length === 0" class="sp-none">no matching task</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sp {
  min-width: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
}
.sp-bar {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 18px;
}
.sp-prompt {
  color: var(--sv-prompt);
}
.sp-new-btn {
  background: transparent;
  border: 1px dashed var(--sv-line);
  color: var(--sv-fg-mid);
  padding: 7px 13px;
  border-radius: var(--sv-r);
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
}
.sp-new-btn:hover {
  border-color: var(--sv-line-strong);
  color: var(--sv-fg);
}
.sp-new-in {
  flex: 1;
  max-width: 320px;
  background: var(--sv-raised);
  border: 1px solid var(--sv-line);
  border-radius: var(--sv-r);
  padding: 7px 11px;
  font-family: inherit;
  font-size: 12.5px;
  color: var(--sv-fg);
}
.sp-err {
  flex: 0 0 auto;
  margin-bottom: 16px;
}
.sp-grid {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 18px;
  align-items: stretch;
}
/* Every progress reading in this view is the app's ASCII gauge. The filled
   half — and the number that repeats it — is the one bright note; the empty
   half stays in whatever colour its line already had. */
.sp-item-on,
.sp-hbar-on,
.sp-hbar-pct,
.sp-ac-on {
  color: var(--sv-fg);
}

/* --- Sprint list (left) --- */
.sp-side {
  flex: 0 0 260px;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.sp-item {
  display: flex;
  flex-direction: column;
  gap: 5px;
  width: 100%;
  text-align: left;
  background: transparent;
  border: 0;
  border-radius: var(--sv-r-card);
  padding: 11px 12px;
  font-family: inherit;
  cursor: pointer;
  transition: background-color 0.12s ease;
}
.sp-item:hover {
  background: var(--sv-surface-2);
}
.sp-item--on {
  background: var(--sv-surface-3);
}
.sp-item-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}
.sp-item-title {
  font-size: 12.5px;
  color: var(--sv-fg-mid);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.sp-item--on .sp-item-title {
  color: var(--sv-bright);
}
.sp-item-n {
  flex: 0 0 auto;
  font-size: 10px;
  color: var(--sv-fg-dim);
  font-variant-numeric: tabular-nums;
}
.sp-item-meter {
  font-size: 10px;
  letter-spacing: -0.05em;
  color: var(--sv-fg-dim);
}

/* --- Detail (right) --- */
.sp-detail {
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow-y: auto;
  border: 1px solid var(--sv-line);
  border-radius: var(--sv-r-box);
  padding: 24px 26px;
  background: var(--sv-raised);
}
.sp-hero {
  padding-bottom: 18px;
  border-bottom: 1px solid var(--sv-line);
}
.sp-hero-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.sp-title {
  margin: 0;
  font-size: 19px;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: var(--sv-bright);
}
.sp-actions {
  display: flex;
  gap: 9px;
  flex: 0 0 auto;
}
.sp-btn {
  background: transparent;
  border: 1px solid var(--sv-line);
  color: var(--sv-fg-mid);
  padding: 5px 12px;
  border-radius: var(--sv-r);
  font-family: inherit;
  font-size: 11.5px;
  cursor: pointer;
}
.sp-btn:hover {
  border-color: var(--sv-line-strong);
  color: var(--sv-fg);
}
.sp-btn--primary {
  background: var(--sv-accent);
  border-color: var(--sv-accent);
  color: var(--sv-on-accent);
}
.sp-btn--danger {
  color: var(--sv-danger);
  border-color: var(--sv-danger-line);
}
.sp-goal {
  margin: 10px 0 0;
  font-size: 13px;
  color: var(--sv-fg-body);
  line-height: 1.65;
  max-width: var(--sv-measure);
}
.sp-hbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 14px;
  font-size: 12px;
  color: var(--sv-fg-mid);
  font-variant-numeric: tabular-nums;
}
/* the gauge is 25 glyphs wide: it wraps as a whole rather than being cut */
.sp-hbar-gauge {
  flex: 0 0 auto;
  letter-spacing: -0.02em;
  white-space: nowrap;
}
.sp-hbar-sep {
  color: var(--sv-fg-dim);
}
.sp-hbar-ship {
  color: var(--sv-ok);
}
.sp-none {
  font-size: 12.5px;
  color: var(--sv-fg-dim);
  padding: 18px 2px;
}

/* --- Steps: a vertical checklist of full cards --- */
.sp-steps {
  position: relative;
  padding-top: 6px;
}
/* pixel-dotted connector down each card's rail (ASCII-ish, not a solid line).
   Per-card so the current step's dots can be colored while staying little dots. */
.sp-card::before {
  content: '';
  position: absolute;
  left: 13px;
  /* bounded to the item's content: starts at the checkbox, ends at its last line */
  top: 18px;
  bottom: 18px;
  width: 2px;
  background-image: repeating-linear-gradient(
    to bottom,
    var(--sv-line-strong) 0 2px,
    transparent 2px 7px
  );
}
.sp-card--here::before {
  background-image: repeating-linear-gradient(
    to bottom,
    var(--sv-prompt) 0 2px,
    transparent 2px 7px
  );
}
.sp-card {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 16px 4px 16px 0;
  border-bottom: 1px solid var(--sv-line-soft);
}
.sp-card:last-child {
  border-bottom: 0;
}
/* current step: no side bar — the green checkbox + CURRENT tag carry it */
.sp-card--here .sp-check {
  color: var(--sv-prompt);
}
.sp-rail {
  flex: 0 0 auto;
  width: 28px;
  display: flex;
  justify-content: center;
}
.sp-check {
  z-index: 1;
  background: var(--sv-raised);
  border: 0;
  padding: 2px 0;
  font-family: inherit;
  font-size: 13px;
  color: var(--sv-fg-dim);
  cursor: pointer;
  line-height: 1.2;
}
.sp-check:disabled {
  cursor: default;
  opacity: 0.5;
}
.sp-check--on {
  color: var(--sv-ok);
}
.sp-check--sm {
  font-size: 11px;
  background: transparent;
}
.sp-body {
  flex: 1;
  min-width: 0;
}
.sp-head {
  display: flex;
  align-items: center;
  gap: 9px;
}
.sp-no {
  flex: 0 0 auto;
  font-size: 10px;
  color: var(--sv-faint);
  font-variant-numeric: tabular-nums;
}
.sp-title-btn {
  min-width: 0;
  background: transparent;
  border: 0;
  padding: 0;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
}
.sp-title-btn:disabled {
  cursor: default;
}
.sp-card-title {
  font-size: 14.5px;
  color: var(--sv-fg);
}
.sp-title-btn:hover .sp-card-title {
  color: var(--sv-bright);
}
.sp-card--done .sp-card-title {
  color: var(--sv-fg-dim);
  text-decoration: line-through;
}
.sp-card--missing .sp-card-title {
  color: var(--sv-warn);
}
.sp-spacer {
  flex: 1;
}
.sp-here-tag {
  flex: 0 0 auto;
  font-size: 8.5px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--sv-prompt);
  border: 1px solid var(--sv-ok-line);
  padding: 2px 7px;
  border-radius: 20px;
}
.sp-prio {
  flex: 0 0 auto;
  font-size: 9px;
  letter-spacing: 0.06em;
  padding: 1px 6px;
  border-radius: var(--sv-r-badge);
}
.sp-prio--urgent {
  background: var(--sv-accent);
  color: var(--sv-on-accent);
}
.sp-prio--high {
  color: var(--sv-fg);
  border: 1px solid var(--sv-line-strong);
}
.sp-pill {
  flex: 0 0 auto;
  font-size: 9.5px;
  color: var(--sv-fg-mid);
  border: 1px solid var(--sv-line);
  padding: 1px 8px;
  border-radius: 20px;
  white-space: nowrap;
}
.sp-pill--sm {
  font-size: 9px;
}
.sp-sub-id {
  font-size: 10px;
  color: var(--sv-fg-dim);
  margin-top: 3px;
}
.sp-desc {
  margin-top: 9px;
}
/* the reader ends its last paragraph on a margin meant for a document */
.sp-desc :deep(.mkd-p:last-child) {
  margin-bottom: 0;
}
.sp-card--done .sp-desc :deep(.mkd) {
  color: var(--sv-fg-dim);
}
.sp-ac {
  margin-top: 12px;
}
.sp-ac-head {
  display: flex;
  align-items: center;
  gap: 9px;
  font-size: 10.5px;
  color: var(--sv-fg-mid);
  margin-bottom: 7px;
}
.sp-ac-meter {
  letter-spacing: -0.05em;
}
.sp-ac-n {
  font-variant-numeric: tabular-nums;
}
.sp-ac-list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.sp-ac-item {
  display: flex;
  gap: 8px;
  font-size: 12px;
  color: var(--sv-fg-body);
  line-height: 1.5;
}
.sp-ac-box {
  flex: 0 0 auto;
  color: var(--sv-fg-dim);
}
.sp-ac-item--done {
  color: var(--sv-fg-dim);
}
.sp-ac-item--done .sp-ac-box {
  color: var(--sv-ok);
}
.sp-ac-item--done .sp-ac-text {
  text-decoration: line-through;
}
.sp-subs {
  margin-top: 12px;
  padding-left: 8px;
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.sp-subrow {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-left: 8px;
}
.sp-subrow-main {
  flex: 1;
  min-width: 0;
  background: transparent;
  border: 0;
  padding: 0;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
}
.sp-subrow-title {
  font-size: 12px;
  color: var(--sv-fg-mid);
}
.sp-subrow-title--done {
  color: var(--sv-fg-dim);
  text-decoration: line-through;
}
.sp-labels {
  display: flex;
  flex-wrap: wrap;
  gap: 9px;
  margin-top: 12px;
}
.sp-tag {
  font-size: 10px;
  color: var(--sv-label);
}
.sp-mini {
  flex: 0 0 auto;
  background: transparent;
  border: 1px solid var(--sv-line);
  color: var(--sv-fg-dim);
  width: 22px;
  height: 22px;
  border-radius: var(--sv-r-card);
  font-family: inherit;
  font-size: 11px;
  cursor: pointer;
}
.sp-mini:hover {
  border-color: var(--sv-line-strong);
  color: var(--sv-fg);
}
.sp-mini:disabled {
  opacity: 0.35;
  cursor: default;
}
.sp-mini--rm:hover {
  color: var(--sv-danger);
  border-color: var(--sv-danger-line);
}

/* --- Picker (edit mode) --- */
.sp-picker {
  margin-top: 20px;
  padding-top: 18px;
  border-top: 1px solid var(--sv-line);
}
.sp-picker-l {
  font-size: 9.5px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--sv-faint);
  margin-bottom: 10px;
}
.sp-picker-search {
  margin-bottom: 8px;
  max-width: 100%;
}
.sp-picker-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.sp-picker-row {
  display: flex;
  align-items: baseline;
  gap: 10px;
  width: 100%;
  text-align: left;
  background: transparent;
  border: 0;
  padding: 8px 9px;
  border-radius: var(--sv-r-card);
  font-family: inherit;
  cursor: pointer;
}
.sp-picker-row:hover {
  background: var(--sv-surface-3);
}
.sp-picker-id {
  flex: 0 0 auto;
  font-size: 10.5px;
  color: var(--sv-fg-dim);
}
.sp-picker-title {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  color: var(--sv-fg);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
@media (max-width: 860px) {
  .sp {
    height: auto;
  }
  .sp-grid {
    flex-wrap: wrap;
    align-items: flex-start;
  }
  .sp-side,
  .sp-detail {
    flex-basis: 100%;
    min-height: auto;
    overflow-y: visible;
  }
}
</style>
