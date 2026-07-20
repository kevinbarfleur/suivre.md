<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Task } from '../../../domain'
import { useBoard } from '../board/board.store'
import { useFilter } from '../filter/filter.store'
import { acProgress, blockedBy, meter, shortDate } from '../../lib/task-meta'

// Vue « liste » : toutes les tâches en table dense, triable. Réutilise le filtre.
const { board, allTasks, openTask } = useBoard()
const { matches } = useFilter()

const PRIO_RANK: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 }

const sortKey = ref('updated')
const sortDir = ref<'asc' | 'desc'>('desc')

function sortBy(key: string): void {
  if (sortKey.value === key) sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  else {
    sortKey.value = key
    sortDir.value = 'asc'
  }
}

const HEADERS: { key: string; label: string; cls: string }[] = [
  { key: 'id', label: 'id', cls: 'c-id' },
  { key: 'status', label: 'statut', cls: 'c-status' },
  { key: 'priority', label: 'prio', cls: 'c-prio' },
  { key: 'title', label: 'titre', cls: 'c-title' },
  { key: 'labels', label: 'labels', cls: 'c-labels' },
  { key: 'assignee', label: 'resp.', cls: 'c-assignee' },
  { key: 'ac', label: 'critères', cls: 'c-ac' },
  { key: 'blocked', label: '⤳', cls: 'c-blocked' },
  { key: 'updated', label: 'maj', cls: 'c-updated' },
]

interface Row {
  task: Task
  id: string
  statusLabel: string
  statusRank: number
  isOrphan: boolean
  priority: string | undefined
  prioRank: number
  title: string
  labels: string[]
  hasDebt: boolean
  assignee: string | undefined
  acDone: number
  acTotal: number
  acRatio: number
  acFilled: string
  acEmpty: string
  blocked: boolean
  updated: string
  updatedShort: string
}

const rows = computed<Row[]>(() => {
  if (!board.value) return []
  const columns = board.value.columns.map((c) => c.column)
  const doneById = new Map(allTasks.value.map((t) => [t.frontmatter.id, t.frontmatter.status === 'done']))
  const statusIndex = new Map(columns.map((c, i) => [c.id, i]))
  const statusLabel = new Map(columns.map((c) => [c.id, c.label]))

  const list = allTasks.value.filter(matches).map<Row>((task) => {
    const fm = task.frontmatter
    const ac = acProgress(task.body)
    const acRatio = ac.total > 0 ? ac.done / ac.total : -1
    const m = meter(ac.done, ac.total, 5)
    const dep = blockedBy(task)
    const blocked = task.frontmatter.depends.some((id) => doneById.get(id) !== true)
    const isOrphan = !statusIndex.has(fm.status)
    return {
      task,
      id: fm.id,
      statusLabel: statusLabel.get(fm.status) ?? fm.status,
      statusRank: statusIndex.get(fm.status) ?? columns.length,
      isOrphan,
      priority: fm.priority,
      prioRank: PRIO_RANK[fm.priority ?? 'none'] ?? 4,
      title: fm.title,
      labels: fm.labels.filter((l) => l !== 'dette'),
      hasDebt: fm.labels.includes('dette'),
      assignee: fm.assignee,
      acDone: ac.done,
      acTotal: ac.total,
      acRatio,
      acFilled: m.filled,
      acEmpty: m.empty,
      blocked: dep != null && blocked,
      updated: fm.updated,
      updatedShort: shortDate(fm.updated),
    }
  })

  const dir = sortDir.value === 'asc' ? 1 : -1
  list.sort((a, b) => dir * compare(a, b, sortKey.value))
  return list
})

function compare(a: Row, b: Row, key: string): number {
  switch (key) {
    case 'id':
      return a.id.localeCompare(b.id)
    case 'status':
      return a.statusRank - b.statusRank
    case 'priority':
      return a.prioRank - b.prioRank
    case 'title':
      return a.title.localeCompare(b.title)
    case 'labels':
      return (a.labels[0] ?? '').localeCompare(b.labels[0] ?? '')
    case 'assignee':
      return (a.assignee ?? '').localeCompare(b.assignee ?? '')
    case 'ac':
      return a.acRatio - b.acRatio
    case 'blocked':
      return Number(a.blocked) - Number(b.blocked)
    default:
      return a.updated.localeCompare(b.updated)
  }
}

const sortLabel = computed(() => `${sortKey.value} ${sortDir.value === 'asc' ? '↑' : '↓'}`)
</script>

<template>
  <div class="lv">
    <div class="lv-head">
      <button
        v-for="h in HEADERS"
        :key="h.key"
        class="lv-h"
        :class="[h.cls, { 'lv-h--active': sortKey === h.key }]"
        type="button"
        @click="sortBy(h.key)"
      >
        {{ h.label }}<span v-if="sortKey === h.key" class="lv-arrow">{{ sortDir === 'asc' ? '↑' : '↓' }}</span>
      </button>
    </div>

    <div v-if="rows.length === 0" class="lv-empty">0 results — aucune tâche ne correspond</div>

    <button v-for="r in rows" :key="r.id" class="lv-row" type="button" @click="openTask(r.task)">
      <span class="c-id" :class="{ 'c-id--orphan': r.isOrphan }">{{ r.id }}</span>
      <span class="c-status"><span class="lv-pill">{{ r.statusLabel }}</span></span>
      <span class="c-prio">
        <span v-if="r.priority === 'urgent'" class="lv-prio lv-prio--urgent">URGENT</span>
        <span v-else-if="r.priority === 'high'" class="lv-prio lv-prio--high">HIGH</span>
        <span v-else-if="r.priority === 'medium'" class="lv-prio lv-prio--med">med</span>
        <span v-else-if="r.priority === 'low'" class="lv-prio lv-prio--low">low</span>
      </span>
      <span class="c-title">{{ r.title }}</span>
      <span class="c-labels">
        <span v-for="l in r.labels" :key="l" class="lv-label">#{{ l }}</span>
        <span v-if="r.hasDebt" class="lv-debt">#dette</span>
      </span>
      <span class="c-assignee">{{ r.assignee ? '@' + r.assignee : '' }}</span>
      <span class="c-ac">
        <template v-if="r.acTotal > 0"
          ><span class="lv-meter"><span class="lv-meter-on">{{ r.acFilled }}</span>{{ r.acEmpty }}</span>
          {{ r.acDone }}/{{ r.acTotal }}</template
        >
      </span>
      <span class="c-blocked"><span v-if="r.blocked" class="lv-blocked">⤳</span></span>
      <span class="c-updated">{{ r.updatedShort }}</span>
    </button>

    <div class="lv-foot">{{ rows.length }} tâches · tri {{ sortLabel }}</div>
  </div>
</template>

<style scoped>
.lv {
  border: 1px solid var(--sv-line);
  border-radius: 10px;
  overflow: hidden;
}
.lv-head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 9px 14px;
  background: var(--sv-raised);
  border-bottom: 1px solid var(--sv-line);
}
.lv-h {
  background: transparent;
  border: 0;
  padding: 0;
  text-align: left;
  font-family: inherit;
  font-size: 10px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--sv-fg-dim);
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
}
.lv-h:hover {
  color: var(--sv-fg-mid);
}
.lv-h--active {
  color: var(--sv-fg);
}
.lv-arrow {
  margin-left: 3px;
}
.lv-row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 0 14px;
  height: 42px;
  border: 0;
  border-bottom: 1px solid var(--sv-line-soft);
  background: transparent;
  font-family: inherit;
  font-size: 12px;
  color: var(--sv-fg);
  text-align: left;
  cursor: pointer;
}
.lv-row:hover {
  background: var(--sv-raised);
}
/* Colonnes — largeurs partagées entre header et rangées */
.c-id {
  width: 84px;
  flex: 0 0 auto;
  color: var(--sv-fg-mid);
  white-space: nowrap;
}
.c-id--orphan {
  color: var(--sv-warn);
}
.c-status {
  width: 96px;
  flex: 0 0 auto;
}
.c-prio {
  width: 70px;
  flex: 0 0 auto;
}
.c-title {
  flex: 1;
  min-width: 0;
  color: var(--sv-fg);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.c-labels {
  width: 150px;
  flex: 0 0 auto;
  display: flex;
  gap: 7px;
  overflow: hidden;
  font-size: 10px;
}
.c-assignee {
  width: 80px;
  flex: 0 0 auto;
  color: var(--sv-fg-dim);
  white-space: nowrap;
}
.c-ac {
  width: 96px;
  flex: 0 0 auto;
  font-size: 10px;
  color: var(--sv-fg-mid);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.c-blocked {
  width: 34px;
  flex: 0 0 auto;
  text-align: center;
}
.c-updated {
  width: 64px;
  flex: 0 0 auto;
  color: var(--sv-fg-dim);
  text-align: right;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.lv-pill {
  font-size: 10.5px;
  color: var(--sv-fg-mid);
  border: 1px solid var(--sv-line);
  padding: 2px 8px;
  border-radius: 20px;
  white-space: nowrap;
}
.lv-prio {
  font-size: 9px;
  letter-spacing: 0.06em;
}
.lv-prio--urgent {
  background: var(--sv-accent);
  color: var(--sv-on-accent);
  padding: 1px 6px;
  border-radius: 3px;
}
.lv-prio--high {
  color: var(--sv-fg);
  border: 1px solid var(--sv-line-strong);
  padding: 1px 6px;
  border-radius: 3px;
}
.lv-prio--med {
  color: var(--sv-fg-mid);
}
.lv-prio--low {
  color: var(--sv-fg-dim);
}
.lv-label {
  color: var(--sv-label);
  white-space: nowrap;
}
.lv-debt {
  color: var(--sv-warn);
  white-space: nowrap;
}
.lv-meter {
  letter-spacing: -0.05em;
}
.lv-meter-on {
  color: var(--sv-fg);
}
.lv-blocked {
  color: var(--sv-blocked);
}
.lv-empty {
  padding: 22px 14px;
  font-size: 12px;
  color: var(--sv-fg-dim);
  text-align: center;
}
.lv-foot {
  padding: 9px 14px;
  font-size: 11px;
  color: var(--sv-fg-dim);
  background: var(--sv-rail-bg);
}
</style>
