<script setup lang="ts">
import { computed } from 'vue'
import type { Priority } from '../../../domain'
import { useBoard } from '../board/board.store'
import { useFilter } from '../filter/filter.store'
import { useView } from '../shell/view.store'
import {
  acAggregate,
  blockedTasks,
  byAssignee,
  byLabel,
  byPriority,
  byStatus,
  finalColumnId,
  oldestOpen,
  recentlyUpdated,
  type Dist,
} from '../../lib/aggregate'
import { meter, shortDate } from '../../lib/task-meta'
import StateBlock from '../../components/StateBlock.vue'

// "Overview" view: the project's state in depth. Clickable aggregates →
// apply the matching filter and switch to the list.
const { board, allTasks } = useBoard()
const { status, priority, label, assignee } = useFilter()
const { setView } = useView()

const columns = computed(() => board.value?.columns.map((c) => c.column) ?? [])
const total = computed(() => allTasks.value.length)
const doneId = computed(() => finalColumnId(columns.value))
const done = computed(
  () => allTasks.value.filter((t) => t.frontmatter.status === doneId.value).length,
)
const pct = computed(() => (total.value ? Math.round((done.value / total.value) * 100) : 0))
const bar = computed(() => meter(done.value, total.value || 1, 25, '█', '░'))

const prioCount = computed(
  () =>
    allTasks.value.filter(
      (t) => t.frontmatter.priority === 'urgent' || t.frontmatter.priority === 'high',
    ).length,
)
const debtCount = computed(
  () => allTasks.value.filter((t) => t.frontmatter.labels.includes('debt')).length,
)
const blockedCount = computed(() => blockedTasks(allTasks.value, columns.value).length)
const orphanCount = computed(() => board.value?.orphans.length ?? 0)
const acAgg = computed(() => acAggregate(allTasks.value))

function bars(dist: Dist[]): (Dist & { filled: string; empty: string })[] {
  const max = Math.max(1, ...dist.map((d) => d.count))
  return dist.map((d) => ({ ...d, ...meter(d.count, max, 14) }))
}

const statusDist = computed(() => bars(byStatus(allTasks.value, columns.value)))
const priorityDist = computed(() => bars(byPriority(allTasks.value)))
const labelDist = computed(() => bars(byLabel(allTasks.value)))
const assigneeDist = computed(() => byAssignee(allTasks.value))
const oldest = computed(() =>
  oldestOpen(allTasks.value, columns.value).map((f) => ({ ...f, dateShort: shortDate(f.date) })),
)
const recent = computed(() =>
  recentlyUpdated(allTasks.value).map((f) => ({ ...f, dateShort: shortDate(f.date) })),
)

function goStatus(key: string): void {
  status.value = key
  setView('list')
}
function goPriority(key: string): void {
  // No filter value expresses "has no priority", so the `none` row can only
  // land on an unfiltered list. Fixing it belongs to the filter model.
  if (key !== 'none') priority.value = key as Priority
  setView('list')
}
function goLabel(key: string): void {
  label.value = key
  setView('list')
}
function goAssignee(key: string): void {
  assignee.value = key
  setView('list')
}
</script>

<template>
  <StateBlock
    v-if="total === 0"
    label="overview"
    message="No task on this board — there is nothing to summarise yet."
  >
    <template #hint>
      Start with <span class="sb-prompt">$</span>
      <span class="sb-cmd">suivre add "First task"</span>
    </template>
  </StateBlock>

  <div v-else class="ov">
    <div class="ov-top">
      <div class="ov-stat">
        <div class="ov-stat-n">{{ total }}</div>
        <div class="ov-stat-l">tasks</div>
      </div>
      <div class="ov-stat">
        <div class="ov-stat-n">
          {{ done }}<span class="ov-stat-of"> / {{ total }}</span>
        </div>
        <div class="ov-stat-l">done</div>
      </div>
      <div class="ov-adv">
        <div class="ov-adv-head">
          <span>progress</span><span class="ov-adv-pct">{{ pct }}%</span>
        </div>
        <div class="ov-adv-bar">
          [<span class="ov-on">{{ bar.filled }}</span
          >{{ bar.empty }}]
        </div>
      </div>
    </div>

    <div class="ov-chips">
      <span class="ov-chip"
        >high prio <span class="ov-chip-n">{{ prioCount }}</span></span
      >
      <span class="ov-chip ov-chip--debt"
        >debt <span class="ov-chip-n">{{ debtCount }}</span></span
      >
      <span class="ov-chip ov-chip--blocked"
        >blocked <span class="ov-chip-n">{{ blockedCount }}</span></span
      >
      <span class="ov-chip ov-chip--warn"
        >orphans <span class="ov-chip-n">{{ orphanCount }}</span></span
      >
      <span class="ov-chip"
        >criteria <span class="ov-chip-n">{{ acAgg.done }}/{{ acAgg.total }}</span></span
      >
    </div>

    <div class="ov-grid">
      <div class="ov-card">
        <div class="ov-card-l">by column</div>
        <button
          v-for="d in statusDist"
          :key="d.key"
          class="ov-row"
          type="button"
          @click="goStatus(d.key)"
        >
          <span class="ov-row-l">{{ d.label }}</span>
          <span class="ov-row-bar"
            ><span class="ov-on">{{ d.filled }}</span
            >{{ d.empty }}</span
          >
          <span class="ov-row-n">{{ d.count }}</span>
        </button>
      </div>

      <div class="ov-card">
        <div class="ov-card-l">by priority</div>
        <button
          v-for="d in priorityDist"
          :key="d.key"
          class="ov-row"
          type="button"
          @click="goPriority(d.key)"
        >
          <span class="ov-row-l">{{ d.label }}</span>
          <span class="ov-row-bar"
            ><span class="ov-on">{{ d.filled }}</span
            >{{ d.empty }}</span
          >
          <span class="ov-row-n">{{ d.count }}</span>
        </button>
      </div>

      <div class="ov-card">
        <div class="ov-card-l">by label</div>
        <div v-if="labelDist.length === 0" class="ov-none">no labels</div>
        <button
          v-for="d in labelDist"
          :key="d.key"
          class="ov-row"
          type="button"
          @click="goLabel(d.key)"
        >
          <span class="ov-row-l" :class="{ 'ov-row-l--debt': d.key === 'debt' }"
            >#{{ d.label }}</span
          >
          <span class="ov-row-bar"
            ><span class="ov-on">{{ d.filled }}</span
            >{{ d.empty }}</span
          >
          <span class="ov-row-n">{{ d.count }}</span>
        </button>
      </div>

      <div class="ov-card">
        <div class="ov-card-l">by owner</div>
        <div v-if="assigneeDist.length === 0" class="ov-none">no owner assigned</div>
        <button
          v-for="d in assigneeDist"
          :key="d.key"
          class="ov-arow"
          type="button"
          @click="goAssignee(d.key)"
        >
          <span class="ov-avatar">{{ d.label.charAt(0).toUpperCase() }}</span>
          <span class="ov-arow-l">@{{ d.label }}</span>
          <span class="ov-row-n">{{ d.count }}</span>
        </button>
      </div>

      <div class="ov-card">
        <div class="ov-card-l">freshness</div>
        <div class="ov-fresh-l">oldest open</div>
        <div v-for="f in oldest" :key="f.id" class="ov-fresh">
          <span class="ov-fresh-t">{{ f.title }}</span>
          <span class="ov-fresh-d">{{ f.dateShort }}</span>
        </div>
        <div class="ov-fresh-l ov-fresh-l--mt">recently updated</div>
        <div v-for="f in recent" :key="f.id" class="ov-fresh">
          <span class="ov-fresh-t">{{ f.title }}</span>
          <span class="ov-fresh-d">{{ f.dateShort }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ov {
  min-width: 0;
}
.ov-top {
  display: flex;
  gap: 32px;
  flex-wrap: wrap;
  align-items: flex-end;
  margin-bottom: 22px;
}
.ov-stat-n {
  font-size: 30px;
  font-weight: 700;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}
.ov-stat-of {
  font-size: 18px;
  color: var(--sv-fg-dim);
}
.ov-stat-l {
  font-size: 9px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--sv-fg-dim);
  margin-top: 6px;
}
.ov-adv {
  flex: 1;
  min-width: 220px;
}
.ov-adv-head {
  display: flex;
  justify-content: space-between;
  font-size: 9px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--sv-fg-dim);
  margin-bottom: 7px;
}
.ov-adv-pct {
  color: var(--sv-fg);
}
.ov-adv-bar {
  font-size: 13px;
  letter-spacing: -0.02em;
  color: var(--sv-fg-mid);
  overflow-x: auto;
  white-space: nowrap;
}
.ov-on {
  color: var(--sv-fg);
}
.ov-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 9px;
  margin-bottom: 24px;
  font-size: 11px;
}
/* Outline only: a solid fill reads as a state (URGENT, ACCEPTED), and none of
   these chips is one. The count carries the weight, and the three semantic
   notes keep their colour on the border and on that count. */
.ov-chip {
  padding: 3px 10px;
  border-radius: var(--sv-r);
  border: 1px solid var(--sv-chip-line);
  color: var(--sv-fg-mid);
  font-variant-numeric: tabular-nums;
}
.ov-chip-n {
  color: var(--sv-fg);
}
.ov-chip--debt {
  border-color: var(--sv-warn-line);
}
.ov-chip--debt .ov-chip-n {
  color: var(--sv-warn);
}
.ov-chip--blocked {
  border-color: var(--sv-danger-line);
}
.ov-chip--blocked .ov-chip-n {
  color: var(--sv-blocked);
}
.ov-chip--warn {
  border-color: var(--sv-warn-line);
}
.ov-chip--warn .ov-chip-n {
  color: var(--sv-warn);
}
/* 240px, not 300px: the macOS overlay opens narrow and the rail breakpoint
   never reaches this grid. */
.ov-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 14px;
}
.ov-card {
  border: 1px solid var(--sv-line);
  border-radius: var(--sv-r-box);
  padding: 16px 18px;
  min-width: 0;
}
.ov-card-l {
  font-size: 9px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--sv-faint);
  margin-bottom: 14px;
}
.ov-none {
  font-size: 11.5px;
  color: var(--sv-fg-dim);
}
.ov-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  background: transparent;
  border: 0;
  padding: 0;
  margin-bottom: 9px;
  font-family: inherit;
  font-size: 11.5px;
  color: var(--sv-fg-mid);
  cursor: pointer;
  text-align: left;
}
.ov-row:hover .ov-row-l {
  color: var(--sv-fg);
}
.ov-row-l {
  width: 74px;
  flex: 0 0 auto;
  color: var(--sv-fg-mid);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ov-row-l--debt {
  color: var(--sv-warn);
}
.ov-row-bar {
  flex: 1;
  letter-spacing: -0.05em;
  color: var(--sv-line-strong);
  overflow: hidden;
}
.ov-row-n {
  color: var(--sv-fg-dim);
  width: 26px;
  text-align: right;
  flex: 0 0 auto;
  font-variant-numeric: tabular-nums;
}
.ov-arow {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  background: transparent;
  border: 0;
  padding: 0;
  margin-bottom: 10px;
  font-family: inherit;
  font-size: 11.5px;
  cursor: pointer;
  text-align: left;
}
.ov-avatar {
  width: 22px;
  height: 22px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: var(--sv-avatar-bg);
  color: var(--sv-avatar-fg);
  font-size: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.ov-arow-l {
  flex: 1;
  min-width: 0;
  color: var(--sv-fg-mid);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ov-fresh-l {
  font-size: 9px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--sv-faint);
  margin-bottom: 8px;
}
.ov-fresh-l--mt {
  margin-top: 14px;
}
.ov-fresh {
  display: flex;
  gap: 10px;
  font-size: 11px;
  margin-bottom: 5px;
  color: var(--sv-fg-mid);
}
.ov-fresh-t {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ov-fresh-d {
  color: var(--sv-fg-dim);
  font-variant-numeric: tabular-nums;
}
</style>
