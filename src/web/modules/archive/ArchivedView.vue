<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { ArchivedEntry, ArchivedType } from '../../lib/api'
import { useView } from '../shell/view.store'
import { shortDate } from '../../lib/task-meta'
import MarkdownBody from '../../components/MarkdownBody.vue'
import { useArchive } from './archive.store'

// Vue « archives » : liste transverse de tout ce qui est archivé (tâches au
// statut `archived`, décisions historiques, docs rangés dans archive/). Filtres
// type / période / label / recherche, tri, et lecture du détail sur place.
const { entries, ensureLoaded } = useArchive()
const { item, setView } = useView()
onMounted(ensureLoaded)

type TypeChoice = 'all' | ArchivedType
type Period = 'all' | '30d' | 'year' | 'old'
type SortKey = 'date' | 'title' | 'type'

const TYPE_LABEL: Record<ArchivedType, string> = { task: 'tâche', decision: 'décision', doc: 'doc' }

const search = ref('')
const typeFilter = ref<TypeChoice>('all')
const period = ref<Period>('all')
const labelFilter = ref<string>('')
const sortKey = ref<SortKey>('date')
const sortDir = ref<'asc' | 'desc'>('desc')

const typeCounts = computed(() => {
  const c: Record<TypeChoice, number> = { all: entries.value.length, task: 0, decision: 0, doc: 0 }
  for (const e of entries.value) c[e.type] += 1
  return c
})

const labels = computed(() => {
  const set = new Set<string>()
  for (const e of entries.value) for (const l of e.labels) set.add(l)
  return [...set].sort()
})

const DAY = 86_400_000
function inPeriod(dateIso: string): boolean {
  if (period.value === 'all') return true
  const d = new Date(dateIso)
  const t = d.getTime()
  if (Number.isNaN(t)) return false
  const nowYear = new Date().getFullYear()
  if (period.value === '30d') return t >= Date.now() - 30 * DAY
  if (period.value === 'year') return d.getFullYear() === nowYear
  return d.getFullYear() < nowYear
}

const filtered = computed<ArchivedEntry[]>(() => {
  const q = search.value.trim().toLowerCase()
  const list = entries.value.filter((e) => {
    if (typeFilter.value !== 'all' && e.type !== typeFilter.value) return false
    if (labelFilter.value && !e.labels.includes(labelFilter.value)) return false
    if (!inPeriod(e.date)) return false
    if (q) {
      const hay = `${e.id} ${e.title} ${e.excerpt} ${e.labels.join(' ')}`.toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })
  const dir = sortDir.value === 'asc' ? 1 : -1
  const TYPE_RANK: Record<ArchivedType, number> = { task: 0, decision: 1, doc: 2 }
  list.sort((a, b) => {
    if (sortKey.value === 'title') return dir * a.title.localeCompare(b.title)
    if (sortKey.value === 'type') return dir * (TYPE_RANK[a.type] - TYPE_RANK[b.type])
    return dir * a.date.localeCompare(b.date)
  })
  return list
})

const selectedId = computed(() => {
  if (item.value && entries.value.some((e) => e.id === item.value)) return item.value
  return filtered.value[0]?.id ?? null
})
const selected = computed(() => entries.value.find((e) => e.id === selectedId.value) ?? null)

function select(id: string): void {
  setView('archive', id)
}
// Un item n'est ouvrable dans son reader que s'il y vit encore : une décision
// archivée PAR STATUT (superseded/rejected) reste dans le registre ADR ; tout
// item rangé physiquement dans archive/ n'y est pas chargé → pas de lien mort.
function canOpenInReader(entry: ArchivedEntry): boolean {
  return entry.type === 'decision' && entry.reason === 'status'
}
function openInReader(entry: ArchivedEntry): void {
  if (entry.type === 'decision') setView('decisions', entry.id)
}
function setSort(key: SortKey): void {
  if (sortKey.value === key) sortDir.value = sortDir.value === 'asc' ? 'desc' : 'asc'
  else {
    sortKey.value = key
    sortDir.value = key === 'title' ? 'asc' : 'desc'
  }
}
</script>

<template>
  <div class="ar">
    <div class="ar-bar">
      <div class="ar-search">
        <span class="ar-search-i">/</span>
        <input
          v-model="search"
          class="ar-search-in"
          type="text"
          placeholder="rechercher un item archivé…"
          spellcheck="false"
        />
      </div>

      <div class="ar-seg">
        <button
          v-for="t in ['all', 'task', 'decision', 'doc'] as TypeChoice[]"
          :key="t"
          class="ar-opt"
          :class="{ 'ar-opt--on': typeFilter === t }"
          type="button"
          @click="typeFilter = t"
        >
          {{ t === 'all' ? 'tout' : TYPE_LABEL[t as ArchivedType] }}
          <span class="ar-opt-n">{{ typeCounts[t] }}</span>
        </button>
      </div>

      <div class="ar-seg">
        <button
          v-for="p in [
            ['all', 'toutes dates'],
            ['30d', '30 j'],
            ['year', 'cette année'],
            ['old', 'plus ancien'],
          ] as [Period, string][]"
          :key="p[0]"
          class="ar-opt"
          :class="{ 'ar-opt--on': period === p[0] }"
          type="button"
          @click="period = p[0]"
        >
          {{ p[1] }}
        </button>
      </div>

      <select v-if="labels.length" v-model="labelFilter" class="ar-select">
        <option value="">tous labels</option>
        <option v-for="l in labels" :key="l" :value="l">#{{ l }}</option>
      </select>

      <div class="ar-sort">
        <span class="ar-sort-l">tri</span>
        <button
          v-for="s in ['date', 'title', 'type'] as SortKey[]"
          :key="s"
          class="ar-sort-b"
          :class="{ 'ar-sort-b--on': sortKey === s }"
          type="button"
          @click="setSort(s)"
        >
          {{ s === 'title' ? 'titre' : s
          }}<span v-if="sortKey === s" class="ar-arrow">{{ sortDir === 'asc' ? '↑' : '↓' }}</span>
        </button>
      </div>
    </div>

    <div v-if="entries.length === 0" class="ar-empty">
      aucune archive — rien de statusé <code>archived</code> ni rangé dans un dossier
      <code>archive/</code>
    </div>

    <div v-else class="ar-grid">
      <div class="ar-list">
        <div v-if="filtered.length === 0" class="ar-none">
          0 résultat — aucun item ne correspond
        </div>
        <button
          v-for="e in filtered"
          :key="e.id"
          class="ar-row"
          :class="{ 'ar-row--on': e.id === selectedId }"
          type="button"
          @click="select(e.id)"
        >
          <span class="ar-type" :data-type="e.type">{{ TYPE_LABEL[e.type] }}</span>
          <span class="ar-row-id">{{ e.id }}</span>
          <span class="ar-row-title">{{ e.title }}</span>
          <span class="ar-row-labels">
            <span v-for="l in e.labels.slice(0, 2)" :key="l" class="ar-tag">#{{ l }}</span>
          </span>
          <span class="ar-row-date">{{ shortDate(e.date) }}</span>
        </button>
      </div>

      <div v-if="selected" class="ar-detail">
        <div class="ar-detail-head">
          <span class="ar-type" :data-type="selected.type">{{ TYPE_LABEL[selected.type] }}</span>
          <span class="ar-detail-id">{{ selected.id }}</span>
          <span v-if="selected.status" class="ar-detail-status">{{ selected.status }}</span>
          <span class="ar-detail-date">{{ shortDate(selected.date) }}</span>
        </div>
        <div class="ar-detail-title">{{ selected.title }}</div>
        <div class="ar-detail-meta">
          <span class="ar-reason">{{
            selected.reason === 'folder' ? 'rangé dans archive/' : 'archivé par statut'
          }}</span>
          <span v-for="l in selected.labels" :key="l" class="ar-tag">#{{ l }}</span>
          <button
            v-if="canOpenInReader(selected)"
            class="ar-open"
            type="button"
            @click="openInReader(selected)"
          >
            ouvrir dans décisions →
          </button>
        </div>
        <div v-if="selected.body.trim()" class="ar-body">
          <MarkdownBody :source="selected.body" />
        </div>
        <div v-else class="ar-body ar-body--empty">— corps vide —</div>
      </div>
    </div>

    <div v-if="entries.length" class="ar-foot">
      {{ filtered.length }} / {{ entries.length }} archivés · tri {{ sortKey }}
      {{ sortDir === 'asc' ? '↑' : '↓' }}
    </div>
  </div>
</template>

<style scoped>
.ar {
  min-width: 0;
}
.ar-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 18px;
}
.ar-search {
  display: flex;
  align-items: center;
  gap: 7px;
  border: 1px solid var(--sv-line);
  border-radius: 8px;
  padding: 0 11px;
  height: 32px;
  background: var(--sv-raised);
  min-width: 240px;
  flex: 1 1 240px;
}
.ar-search-i {
  color: var(--sv-prompt);
}
.ar-search-in {
  flex: 1;
  min-width: 0;
  background: transparent;
  border: 0;
  outline: none;
  font-family: inherit;
  font-size: 12.5px;
  color: var(--sv-fg);
}
.ar-search-in::placeholder {
  color: var(--sv-placeholder);
}
.ar-seg {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.ar-opt {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  background: transparent;
  border: 1px solid var(--sv-line);
  color: var(--sv-fg-mid);
  padding: 5px 11px;
  border-radius: 20px;
  font-family: inherit;
  font-size: 11px;
  cursor: pointer;
}
.ar-opt:hover {
  border-color: var(--sv-line-strong);
  color: var(--sv-fg);
}
.ar-opt--on,
.ar-opt--on:hover {
  background: var(--sv-surface-3);
  color: var(--sv-fg);
  border-color: var(--sv-line-strong);
}
.ar-opt-n {
  font-size: 9.5px;
  color: var(--sv-fg-dim);
  font-variant-numeric: tabular-nums;
}
.ar-select {
  height: 32px;
  background: var(--sv-raised);
  border: 1px solid var(--sv-line);
  border-radius: 8px;
  color: var(--sv-fg-mid);
  font-family: inherit;
  font-size: 11px;
  padding: 0 8px;
  cursor: pointer;
}
.ar-sort {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.ar-sort-l {
  font-size: 9px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--sv-faint);
}
.ar-sort-b {
  background: transparent;
  border: 0;
  color: var(--sv-fg-dim);
  font-family: inherit;
  font-size: 11px;
  cursor: pointer;
  padding: 2px 4px;
}
.ar-sort-b:hover {
  color: var(--sv-fg-mid);
}
.ar-sort-b--on {
  color: var(--sv-fg);
}
.ar-arrow {
  margin-left: 2px;
}
.ar-empty {
  border: 1px dashed var(--sv-line);
  border-radius: 8px;
  padding: 28px;
  text-align: center;
  color: var(--sv-fg-dim);
  font-size: 12px;
}
.ar-empty code {
  color: var(--sv-fg-mid);
}
.ar-grid {
  display: flex;
  gap: 16px;
  align-items: flex-start;
  flex-wrap: wrap;
}
.ar-list {
  flex: 1.7;
  min-width: 360px;
  border: 1px solid var(--sv-line);
  border-radius: 10px;
  overflow: hidden;
}
.ar-none {
  padding: 22px 15px;
  font-size: 12px;
  color: var(--sv-fg-dim);
  text-align: center;
}
.ar-row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 11px 15px;
  border: 0;
  border-bottom: 1px solid var(--sv-line-soft);
  background: transparent;
  font-family: inherit;
  font-size: 12px;
  color: var(--sv-fg);
  text-align: left;
  cursor: pointer;
}
.ar-row:hover {
  background: var(--sv-raised);
}
.ar-row--on {
  background: var(--sv-surface-3);
}
.ar-type {
  flex: 0 0 auto;
  width: 58px;
  font-size: 9px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  padding: 2px 7px;
  border-radius: 3px;
  border: 1px solid var(--sv-line);
  color: var(--sv-fg-dim);
  text-align: center;
}
.ar-type[data-type='task'] {
  color: var(--sv-fg);
  border-color: var(--sv-line-strong);
}
.ar-type[data-type='decision'] {
  color: var(--sv-prompt);
  border-color: var(--sv-ok-line);
}
.ar-type[data-type='doc'] {
  color: var(--sv-label);
  border-color: var(--sv-line);
}
.ar-row-id {
  flex: 0 0 auto;
  width: 104px;
  color: var(--sv-fg-dim);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ar-row-title {
  flex: 1;
  min-width: 0;
  color: var(--sv-fg);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ar-row-labels {
  flex: 0 0 auto;
  display: flex;
  gap: 6px;
  overflow: hidden;
}
.ar-row-date {
  flex: 0 0 auto;
  width: 62px;
  text-align: right;
  color: var(--sv-fg-dim);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.ar-tag {
  font-size: 10px;
  color: var(--sv-label);
  white-space: nowrap;
}
.ar-detail {
  flex: 1;
  min-width: 320px;
  border: 1px solid var(--sv-line);
  border-radius: 10px;
  padding: 20px 22px;
  background: var(--sv-raised);
}
.ar-detail-head {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 10px;
  color: var(--sv-fg-dim);
  margin-bottom: 12px;
}
.ar-detail-id {
  color: var(--sv-fg-mid);
}
.ar-detail-status {
  font-size: 9.5px;
  letter-spacing: 0.06em;
  padding: 1px 7px;
  border-radius: 3px;
  border: 1px solid var(--sv-line);
  color: var(--sv-fg-dim);
}
.ar-detail-date {
  margin-left: auto;
  font-variant-numeric: tabular-nums;
}
.ar-detail-title {
  font-size: 17px;
  color: var(--sv-bright);
  margin-bottom: 12px;
}
.ar-detail-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 14px;
}
.ar-reason {
  font-size: 9px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--sv-faint);
}
.ar-open {
  margin-left: auto;
  background: transparent;
  border: 1px solid var(--sv-line);
  color: var(--sv-fg-mid);
  font-family: inherit;
  font-size: 11px;
  padding: 4px 10px;
  border-radius: 6px;
  cursor: pointer;
}
.ar-open:hover {
  border-color: var(--sv-line-strong);
  color: var(--sv-fg);
}
.ar-body {
  border-top: 1px solid var(--sv-line);
  padding-top: 14px;
}
.ar-body--empty {
  color: var(--sv-fg-dim);
  font-size: 12px;
}
.ar-foot {
  margin-top: 14px;
  padding: 9px 2px;
  font-size: 11px;
  color: var(--sv-fg-dim);
  font-variant-numeric: tabular-nums;
}
</style>
