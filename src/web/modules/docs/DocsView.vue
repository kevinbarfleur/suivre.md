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
import { useDocs } from './docs.store'

// "Docs" view: documentation index + reading (rendered markdown).
// Deep-linkable (#docs/doc-001).
const { docs, ensureLoaded, error, loading, reload } = useDocs()
const { item, setView } = useView()
onMounted(ensureLoaded)

const search = ref('')
const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  const list = [...docs.value].sort((a, b) =>
    a.frontmatter.title.localeCompare(b.frontmatter.title),
  )
  if (!q) return list
  return list.filter((d) => `${d.frontmatter.title} ${d.body}`.toLowerCase().includes(q))
})
const activeFilters = computed<string[]>(() => {
  const q = search.value.trim()
  return q ? [`/${q}`] : []
})

const selectedId = computed(() => {
  if (item.value && docs.value.some((d) => d.frontmatter.id === item.value)) return item.value
  return filtered.value[0]?.frontmatter.id ?? null
})
const selected = computed(
  () => docs.value.find((d) => d.frontmatter.id === selectedId.value) ?? null,
)

// The reader's own h1 is the document title, so the frontmatter title is
// rendered only for the bodies that carry no h1 at all — never both.
const titleInBody = computed(
  () => selected.value != null && toBlocks(selected.value.body).some((b) => b.type === 'h1'),
)

function select(id: string): void {
  setView('docs', id)
}
</script>

<template>
  <div class="dv">
    <SearchField v-model="search" class="dv-search" placeholder="grep docs…" />

    <ErrorBanner
      v-if="error"
      class="dv-err"
      message="The docs could not be read."
      :detail="error"
      @retry="reload"
    />

    <LoadingBlock v-if="loading && docs.length === 0" label="docs" message="reading docs/…" />

    <StateBlock
      v-else-if="!error && docs.length === 0"
      class="dv-empty"
      label="docs"
      message="No document yet."
    >
      <template #hint>
        Specs and long-form notes land here — what <span class="sb-cmd">/grill-with-docs</span>
        writes. Start one with
        <span class="sb-prompt">$</span><span class="sb-cmd">suivre doc create "Spec: …"</span>
      </template>
    </StateBlock>

    <div v-else-if="docs.length > 0" class="dv-grid">
      <div class="dv-list">
        <div v-if="filtered.length === 0" class="dv-none">
          <NoResults
            message="0 results — no doc matches"
            :filters="activeFilters"
            @clear="search = ''"
          />
        </div>
        <button
          v-for="d in filtered"
          :key="d.frontmatter.id"
          class="dv-item"
          :class="{ 'dv-item--on': d.frontmatter.id === selectedId }"
          type="button"
          @click="select(d.frontmatter.id)"
        >
          <span class="dv-item-t"
            ><span v-if="d.frontmatter.id === selectedId" class="dv-caret">›</span
            >{{ d.frontmatter.title }}</span
          >
          <span class="dv-item-d">upd {{ shortDate(d.frontmatter.updated) }}</span>
        </button>
      </div>

      <div v-if="selected" class="dv-reader">
        <div class="dv-reader-meta">
          <span v-for="t in selected.frontmatter.tags" :key="t" class="dv-tag">#{{ t }}</span>
          <span class="dv-reader-date">upd {{ shortDate(selected.frontmatter.updated) }}</span>
        </div>
        <h1 v-if="!titleInBody" class="dv-title">{{ selected.frontmatter.title }}</h1>
        <MarkdownBody :source="selected.body" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.dv {
  min-width: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
}
.dv-search {
  flex: 0 0 auto;
  max-width: 100%;
  margin-bottom: 16px;
}
.dv-err {
  flex: 0 0 auto;
  margin-bottom: 16px;
}
.dv-empty {
  max-width: var(--sv-measure);
}
.dv-grid {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 18px;
  align-items: stretch;
}
.dv-list {
  flex: 0 0 260px;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.dv-none {
  padding: 0 11px;
}
.dv-item {
  display: flex;
  flex-direction: column;
  gap: 3px;
  width: 100%;
  padding: 10px 11px;
  border: 0;
  border-radius: var(--sv-r-card);
  background: transparent;
  font-family: inherit;
  text-align: left;
  cursor: pointer;
}
.dv-item:hover {
  background: var(--sv-surface-2);
}
.dv-item--on {
  background: var(--sv-surface-3);
}
.dv-item-t {
  font-size: 12.5px;
  color: var(--sv-fg-mid);
}
.dv-item--on .dv-item-t {
  color: var(--sv-fg);
}
.dv-caret {
  color: var(--sv-prompt);
  margin-right: 5px;
}
.dv-item-d {
  font-size: 10px;
  color: var(--sv-fg-dim);
  padding-left: 11px;
}
.dv-reader {
  flex: 1;
  min-width: 340px;
  max-width: 680px;
  min-height: 0;
  overflow-y: auto;
  border: 1px solid var(--sv-line);
  border-radius: var(--sv-r-box);
  padding: 24px 26px;
  background: var(--sv-raised);
}
@media (max-width: 860px) {
  .dv {
    height: auto;
  }
  .dv-grid {
    flex-wrap: wrap;
    align-items: flex-start;
  }
  .dv-list,
  .dv-reader {
    min-height: auto;
    overflow-y: visible;
  }
}
.dv-reader-meta {
  display: flex;
  gap: 9px;
  align-items: center;
  margin-bottom: 14px;
  font-size: 10.5px;
}
.dv-tag {
  color: var(--sv-label);
}
.dv-reader-date {
  margin-left: auto;
  color: var(--sv-fg-dim);
  font-variant-numeric: tabular-nums;
}
/* Same type as the reader's own h1 (MarkdownBody `.mkd-h1`): a document reads
   identically whether its title sits in the frontmatter or in the body. */
.dv-title {
  font-size: 19px;
  font-weight: 700;
  line-height: 1.3;
  letter-spacing: -0.01em;
  color: var(--sv-bright);
  margin: 4px 0 14px;
  max-width: var(--sv-measure);
}
</style>
