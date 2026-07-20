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
  oldestOpen,
  recentlyUpdated,
  type Dist,
} from '../../lib/aggregate'
import { meter, shortDate } from '../../lib/task-meta'

// Vue « overview » : l'état du projet en profondeur. Agrégats cliquables →
// appliquent le filtre correspondant et basculent vers la liste.
const { board, allTasks } = useBoard()
const { status, priority, label, assignee } = useFilter()
const { setView } = useView()

const columns = computed(() => board.value?.columns.map((c) => c.column) ?? [])
const total = computed(() => allTasks.value.length)
const done = computed(() => allTasks.value.filter((t) => t.frontmatter.status === 'done').length)
const pct = computed(() => (total.value ? Math.round((done.value / total.value) * 100) : 0))
const bar = computed(() => meter(done.value, total.value || 1, 25, '█', '░'))

const testingCount = computed(() => allTasks.value.filter((t) => t.frontmatter.status === 'test').length)
const prioCount = computed(
  () =>
    allTasks.value.filter(
      (t) => t.frontmatter.priority === 'urgent' || t.frontmatter.priority === 'high',
    ).length,
)
const debtCount = computed(
  () => allTasks.value.filter((t) => t.frontmatter.labels.includes('dette')).length,
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
  oldestOpen(allTasks.value).map((f) => ({ ...f, dateShort: shortDate(f.date) })),
)
const recent = computed(() =>
  recentlyUpdated(allTasks.value).map((f) => ({ ...f, dateShort: shortDate(f.date) })),
)

function goStatus(key: string): void {
  status.value = key
  setView('list')
}
function goPriority(key: string): void {
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
  <div class="ov">
    <div class="ov-top">
      <div class="ov-stat">
        <div class="ov-stat-n">{{ total }}</div>
        <div class="ov-stat-l">tâches</div>
      </div>
      <div class="ov-stat">
        <div class="ov-stat-n">{{ done }}<span class="ov-stat-of"> / {{ total }}</span></div>
        <div class="ov-stat-l">terminées</div>
      </div>
      <div class="ov-adv">
        <div class="ov-adv-head"><span>avancement</span><span class="ov-adv-pct">{{ pct }}%</span></div>
        <div class="ov-adv-bar">[<span class="ov-on">{{ bar.filled }}</span>{{ bar.empty }}]</div>
      </div>
    </div>

    <div class="ov-chips">
      <span class="ov-chip ov-chip--line">à tester <b>{{ testingCount }}</b></span>
      <span class="ov-chip ov-chip--fill">prioritaires {{ prioCount }}</span>
      <span class="ov-chip ov-chip--debt">dette {{ debtCount }}</span>
      <span class="ov-chip ov-chip--blocked">bloquées {{ blockedCount }}</span>
      <span class="ov-chip ov-chip--warn">orphelines {{ orphanCount }}</span>
      <span class="ov-chip ov-chip--line">critères <b>{{ acAgg.done }}/{{ acAgg.total }}</b></span>
    </div>

    <div class="ov-grid">
      <div class="ov-card">
        <div class="ov-card-l">par colonne</div>
        <button v-for="d in statusDist" :key="d.key" class="ov-row" type="button" @click="goStatus(d.key)">
          <span class="ov-row-l">{{ d.label }}</span>
          <span class="ov-row-bar"><span class="ov-on">{{ d.filled }}</span>{{ d.empty }}</span>
          <span class="ov-row-n">{{ d.count }}</span>
        </button>
      </div>

      <div class="ov-card">
        <div class="ov-card-l">par priorité</div>
        <button v-for="d in priorityDist" :key="d.key" class="ov-row" type="button" @click="goPriority(d.key)">
          <span class="ov-row-l">{{ d.label }}</span>
          <span class="ov-row-bar"><span class="ov-on">{{ d.filled }}</span>{{ d.empty }}</span>
          <span class="ov-row-n">{{ d.count }}</span>
        </button>
      </div>

      <div class="ov-card">
        <div class="ov-card-l">par label</div>
        <div v-if="labelDist.length === 0" class="ov-none">aucun label</div>
        <button v-for="d in labelDist" :key="d.key" class="ov-row" type="button" @click="goLabel(d.key)">
          <span class="ov-row-l" :class="{ 'ov-row-l--debt': d.key === 'dette' }">#{{ d.label }}</span>
          <span class="ov-row-bar"><span class="ov-on">{{ d.filled }}</span>{{ d.empty }}</span>
          <span class="ov-row-n">{{ d.count }}</span>
        </button>
      </div>

      <div class="ov-card">
        <div class="ov-card-l">par responsable</div>
        <div v-if="assigneeDist.length === 0" class="ov-none">aucun responsable assigné</div>
        <button v-for="d in assigneeDist" :key="d.key" class="ov-arow" type="button" @click="goAssignee(d.key)">
          <span class="ov-avatar">{{ d.label.charAt(0).toUpperCase() }}</span>
          <span class="ov-arow-l">@{{ d.label }}</span>
          <span class="ov-row-n">{{ d.count }}</span>
        </button>
      </div>

      <div class="ov-card">
        <div class="ov-card-l">fraîcheur</div>
        <div class="ov-fresh-l">plus anciennes non terminées</div>
        <div v-for="f in oldest" :key="f.id" class="ov-fresh">
          <span class="ov-fresh-t">{{ f.title }}</span>
          <span class="ov-fresh-d">{{ f.dateShort }}</span>
        </div>
        <div class="ov-fresh-l ov-fresh-l--mt">dernières modifiées</div>
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
  font-size: 9.5px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--sv-fg-dim);
  margin-top: 5px;
}
.ov-adv {
  flex: 1;
  min-width: 220px;
}
.ov-adv-head {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  letter-spacing: 0.1em;
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
.ov-chip {
  padding: 3px 10px;
  border-radius: 20px;
  font-variant-numeric: tabular-nums;
}
.ov-chip b {
  color: var(--sv-fg);
  font-weight: 400;
}
.ov-chip--line {
  border: 1px solid var(--sv-line-strong);
  color: var(--sv-fg-mid);
}
.ov-chip--fill {
  background: var(--sv-accent);
  color: var(--sv-on-accent);
}
.ov-chip--debt {
  border: 1px solid var(--sv-warn-line);
  background: var(--sv-warn-bg);
  color: var(--sv-warn);
}
.ov-chip--blocked {
  border: 1px solid var(--sv-danger-line);
  color: var(--sv-blocked);
}
.ov-chip--warn {
  border: 1px solid var(--sv-warn-line);
  color: var(--sv-warn);
}
.ov-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 14px;
}
.ov-card {
  border: 1px solid var(--sv-line);
  border-radius: 10px;
  padding: 16px 18px;
}
.ov-card-l {
  font-size: 10px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--sv-fg-dim);
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
  color: var(--sv-fg-mid);
}
.ov-fresh-l {
  font-size: 10px;
  color: var(--sv-fg-dim);
  margin-bottom: 6px;
}
.ov-fresh-l--mt {
  margin-top: 12px;
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
