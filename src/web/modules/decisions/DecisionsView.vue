<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useView } from '../shell/view.store'
import { shortDate } from '../../lib/task-meta'
import MarkdownBody from '../../components/MarkdownBody.vue'
import { useDecisions } from './decisions.store'

// Vue « décisions » : registre ADR. Liste filtrable par statut + détail
// (contexte / décision / conséquences). Deep-linkable (#decisions/decision-001).
const { decisions, ensureLoaded } = useDecisions()
const { item, setView } = useView()
onMounted(ensureLoaded)

const FILTERS = ['all', 'proposed', 'accepted', 'rejected', 'superseded'] as const
const statusFilter = ref<string>('all')

const sorted = computed(() =>
  [...decisions.value].sort((a, b) => b.frontmatter.date.localeCompare(a.frontmatter.date)),
)
const filtered = computed(() =>
  statusFilter.value === 'all'
    ? sorted.value
    : sorted.value.filter((d) => d.frontmatter.status === statusFilter.value),
)

const selectedId = computed(() => {
  if (item.value && decisions.value.some((d) => d.frontmatter.id === item.value)) return item.value
  return filtered.value[0]?.frontmatter.id ?? null
})
const selected = computed(
  () => decisions.value.find((d) => d.frontmatter.id === selectedId.value) ?? null,
)

function select(id: string): void {
  setView('decisions', id)
}
</script>

<template>
  <div class="dc">
    <div class="dc-filters">
      <button
        v-for="f in FILTERS"
        :key="f"
        class="dc-filter"
        :class="{ 'dc-filter--on': statusFilter === f }"
        type="button"
        @click="statusFilter = f"
      >
        {{ f === 'all' ? 'tous' : f }}
      </button>
    </div>

    <div v-if="decisions.length === 0" class="dc-empty">
      aucune décision — le registre ADR est vide
    </div>

    <div v-else class="dc-grid">
      <div class="dc-list">
        <button
          v-for="d in filtered"
          :key="d.frontmatter.id"
          class="dc-row"
          :class="{ 'dc-row--on': d.frontmatter.id === selectedId }"
          type="button"
          @click="select(d.frontmatter.id)"
        >
          <span class="dc-row-id">{{ d.frontmatter.id }}</span>
          <span class="dc-status" :data-status="d.frontmatter.status">{{
            d.frontmatter.status === 'accepted' ? 'ACCEPTED' : d.frontmatter.status
          }}</span>
          <span class="dc-row-title">{{ d.frontmatter.title }}</span>
          <span class="dc-row-date">{{ shortDate(d.frontmatter.date) }}</span>
        </button>
      </div>

      <div v-if="selected" class="dc-detail">
        <div class="dc-detail-head">
          <span>{{ selected.frontmatter.id }}</span>
          <span class="dc-status" :data-status="selected.frontmatter.status">{{
            selected.frontmatter.status === 'accepted' ? 'ACCEPTED' : selected.frontmatter.status
          }}</span>
          <span class="dc-detail-date">{{ shortDate(selected.frontmatter.date) }}</span>
        </div>
        <div class="dc-detail-title">{{ selected.frontmatter.title }}</div>
        <div v-if="selected.frontmatter.supersedes" class="dc-link dc-link--sup">
          remplace
          <button type="button" @click="select(selected.frontmatter.supersedes!)">
            {{ selected.frontmatter.supersedes }}
          </button>
        </div>
        <div v-if="selected.frontmatter.supersededBy" class="dc-link dc-link--by">
          remplacée par
          <button type="button" @click="select(selected.frontmatter.supersededBy!)">
            {{ selected.frontmatter.supersededBy }}
          </button>
        </div>
        <div class="dc-body"><MarkdownBody :source="selected.body" /></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dc {
  min-width: 0;
}
.dc-filters {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 18px;
}
.dc-filter {
  background: transparent;
  border: 1px solid var(--sv-line);
  color: var(--sv-fg-mid);
  padding: 4px 11px;
  border-radius: 20px;
  font-family: inherit;
  font-size: 11px;
  cursor: pointer;
}
.dc-filter:hover {
  border-color: var(--sv-line-strong);
  color: var(--sv-fg);
}
.dc-filter--on,
.dc-filter--on:hover {
  background: var(--sv-surface-3);
  color: var(--sv-fg);
  border-color: var(--sv-line-strong);
}
.dc-empty {
  border: 1px dashed var(--sv-line);
  border-radius: 8px;
  padding: 28px;
  text-align: center;
  color: var(--sv-fg-dim);
  font-size: 12px;
}
.dc-grid {
  display: flex;
  gap: 16px;
  align-items: flex-start;
  flex-wrap: wrap;
}
.dc-list {
  flex: 1;
  min-width: 340px;
  border: 1px solid var(--sv-line);
  border-radius: 10px;
  overflow: hidden;
}
.dc-row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 12px 15px;
  border: 0;
  border-bottom: 1px solid var(--sv-line-soft);
  background: transparent;
  font-family: inherit;
  font-size: 12px;
  color: var(--sv-fg);
  text-align: left;
  cursor: pointer;
}
.dc-row:hover {
  background: var(--sv-raised);
}
.dc-row--on {
  background: var(--sv-surface-3);
}
.dc-row-id {
  width: 96px;
  flex: 0 0 auto;
  color: var(--sv-fg-dim);
}
.dc-row-title {
  flex: 1;
  min-width: 0;
  color: var(--sv-fg);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dc-row-date {
  color: var(--sv-fg-dim);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.dc-status {
  flex: 0 0 auto;
  font-size: 9.5px;
  letter-spacing: 0.06em;
  padding: 1px 7px;
  border-radius: 3px;
}
.dc-status[data-status='accepted'] {
  background: var(--sv-accent);
  color: var(--sv-on-accent);
}
.dc-status[data-status='proposed'] {
  color: var(--sv-fg);
  border: 1px solid var(--sv-line-strong);
}
.dc-status[data-status='rejected'] {
  color: var(--sv-blocked);
  border: 1px solid var(--sv-danger-line);
}
.dc-status[data-status='superseded'] {
  color: var(--sv-fg-dim);
  border: 1px solid var(--sv-line);
  text-decoration: line-through;
}
.dc-detail {
  flex: 1;
  min-width: 340px;
  border: 1px solid var(--sv-line);
  border-radius: 10px;
  padding: 20px 22px;
  background: var(--sv-raised);
}
.dc-detail-head {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 10px;
  color: var(--sv-fg-dim);
  margin-bottom: 10px;
}
.dc-detail-date {
  margin-left: auto;
  font-variant-numeric: tabular-nums;
}
.dc-detail-title {
  font-size: 17px;
  color: var(--sv-bright);
  margin-bottom: 14px;
}
.dc-link {
  font-size: 11px;
  border-radius: 7px;
  padding: 8px 11px;
  margin-bottom: 12px;
}
.dc-link button {
  background: transparent;
  border: 0;
  font-family: inherit;
  font-size: 11px;
  cursor: pointer;
  text-decoration: underline;
}
.dc-link--sup {
  color: var(--sv-ok);
  border: 1px solid var(--sv-ok-line);
  background: var(--sv-ok-bg);
}
.dc-link--sup button {
  color: var(--sv-ok);
}
.dc-link--by {
  color: var(--sv-warn);
  border: 1px solid var(--sv-warn-line);
  background: var(--sv-warn-bg);
}
.dc-link--by button {
  color: var(--sv-warn);
}
.dc-body {
  border-top: 1px solid var(--sv-line);
  padding-top: 14px;
}
</style>
