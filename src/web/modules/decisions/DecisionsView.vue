<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useView } from '../shell/view.store'
import { shortDate } from '../../lib/task-meta'
import { toBlocks } from '../../lib/markdown-blocks'
import ErrorBanner from '../../components/ErrorBanner.vue'
import LoadingBlock from '../../components/LoadingBlock.vue'
import MarkdownBody from '../../components/MarkdownBody.vue'
import NoResults from '../../components/NoResults.vue'
import SearchField from '../../components/SearchField.vue'
import StateBlock from '../../components/StateBlock.vue'
import { useDecisions } from './decisions.store'

// "Decisions" view: ADR registry. List filterable by status + detail
// (context / decision / consequences). Deep-linkable (#decisions/decision-001).
const { decisions, ensureLoaded, error, loading, reload } = useDecisions()
const { item, setView } = useView()
onMounted(ensureLoaded)

const FILTERS = ['all', 'proposed', 'accepted', 'rejected', 'superseded'] as const
const statusFilter = ref<string>('all')
const search = ref('')

const sorted = computed(() =>
  [...decisions.value].sort((a, b) => b.frontmatter.date.localeCompare(a.frontmatter.date)),
)
const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  return sorted.value.filter((d) => {
    if (statusFilter.value !== 'all' && d.frontmatter.status !== statusFilter.value) return false
    if (!q) return true
    return `${d.frontmatter.id} ${d.frontmatter.title} ${d.body}`.toLowerCase().includes(q)
  })
})
const activeFilters = computed<string[]>(() => {
  const out: string[] = []
  const q = search.value.trim()
  if (q) out.push(`/${q}`)
  if (statusFilter.value !== 'all') out.push(`--status=${statusFilter.value}`)
  return out
})

const selectedId = computed(() => {
  if (item.value && decisions.value.some((d) => d.frontmatter.id === item.value)) return item.value
  return filtered.value[0]?.frontmatter.id ?? null
})
const selected = computed(
  () => decisions.value.find((d) => d.frontmatter.id === selectedId.value) ?? null,
)

// The reader's own h1 is the decision title, so the frontmatter title is
// rendered only for the bodies that carry no h1 at all — never both.
const titleInBody = computed(
  () => selected.value != null && toBlocks(selected.value.body).some((b) => b.type === 'h1'),
)

function select(id: string): void {
  setView('decisions', id)
}
function clearFilters(): void {
  search.value = ''
  statusFilter.value = 'all'
}
</script>

<template>
  <div class="dc">
    <div class="dc-bar">
      <SearchField v-model="search" placeholder="grep decisions…" />
      <div class="dc-filters">
        <button
          v-for="f in FILTERS"
          :key="f"
          class="dc-filter"
          :class="{ 'dc-filter--on': statusFilter === f }"
          type="button"
          @click="statusFilter = f"
        >
          {{ f === 'all' ? 'all' : f }}
        </button>
      </div>
    </div>

    <ErrorBanner
      v-if="error"
      class="dc-err"
      message="The decisions could not be read."
      :detail="error"
      @retry="reload"
    />

    <LoadingBlock
      v-if="loading && decisions.length === 0"
      label="decisions"
      message="reading decisions/…"
    />

    <StateBlock
      v-else-if="!error && decisions.length === 0"
      class="dc-empty"
      label="decisions"
      message="No decision recorded yet."
    >
      <template #hint>
        An ADR — context, decision, consequences — lands here the moment a choice is worth
        remembering. Record one with <span class="sb-prompt">$</span
        ><span class="sb-cmd">suivre decision create "…" --status accepted</span>
      </template>
    </StateBlock>

    <div v-else-if="decisions.length > 0" class="dc-grid">
      <div class="dc-list">
        <div v-if="filtered.length === 0" class="dc-none">
          <NoResults
            message="0 results — no decision matches"
            :filters="activeFilters"
            @clear="clearFilters"
          />
        </div>
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
        <h1 v-if="!titleInBody" class="dc-detail-title">{{ selected.frontmatter.title }}</h1>
        <div v-if="selected.frontmatter.supersedes" class="dc-link dc-link--sup">
          supersedes
          <button type="button" @click="select(selected.frontmatter.supersedes!)">
            {{ selected.frontmatter.supersedes }}
          </button>
        </div>
        <div v-if="selected.frontmatter.supersededBy" class="dc-link dc-link--by">
          superseded by
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
  height: 100%;
  display: flex;
  flex-direction: column;
}
.dc-bar {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 18px;
}
.dc-filters {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
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
.dc-err {
  flex: 0 0 auto;
  margin-bottom: 16px;
}
.dc-empty {
  max-width: var(--sv-measure);
}
.dc-none {
  padding: 4px 15px;
}
.dc-grid {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 16px;
  align-items: stretch;
}
.dc-list {
  flex: 1;
  min-width: 340px;
  min-height: 0;
  overflow-y: auto;
  border: 1px solid var(--sv-line);
  border-radius: var(--sv-r-box);
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
  border-radius: var(--sv-r-badge);
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
  min-height: 0;
  overflow-y: auto;
  border: 1px solid var(--sv-line);
  border-radius: var(--sv-r-box);
  padding: 24px 26px;
  background: var(--sv-raised);
}
@media (max-width: 860px) {
  .dc {
    height: auto;
  }
  .dc-grid {
    flex-wrap: wrap;
    align-items: flex-start;
  }
  .dc-list,
  .dc-detail {
    min-height: auto;
    overflow-y: visible;
  }
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
/* Same type as the reader's own h1 (MarkdownBody `.mkd-h1`): a decision reads
   identically whether its title sits in the frontmatter or in the body. */
.dc-detail-title {
  font-size: 19px;
  font-weight: 700;
  line-height: 1.3;
  letter-spacing: -0.01em;
  color: var(--sv-bright);
  margin: 4px 0 14px;
  max-width: var(--sv-measure);
}
.dc-link {
  font-size: 11px;
  border-radius: var(--sv-r);
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
