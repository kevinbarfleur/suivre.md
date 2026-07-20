<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useView } from '../shell/view.store'
import { shortDate } from '../../lib/task-meta'
import MarkdownBody from '../../components/MarkdownBody.vue'
import { useDocs } from './docs.store'

// Vue « docs » : index de la documentation + lecture (markdown rendu).
// Deep-linkable (#docs/doc-001).
const { docs, ensureLoaded } = useDocs()
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

const selectedId = computed(() => {
  if (item.value && docs.value.some((d) => d.frontmatter.id === item.value)) return item.value
  return filtered.value[0]?.frontmatter.id ?? null
})
const selected = computed(
  () => docs.value.find((d) => d.frontmatter.id === selectedId.value) ?? null,
)

function select(id: string): void {
  setView('docs', id)
}
</script>

<template>
  <div class="dv">
    <div class="dv-search">
      <span class="dv-slash">/</span>
      <input v-model="search" class="dv-input" type="text" placeholder="search docs…" />
    </div>

    <div v-if="docs.length === 0" class="dv-empty">no docs — documentation is empty</div>

    <div v-else class="dv-grid">
      <div class="dv-list">
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
  display: flex;
  align-items: center;
  gap: 8px;
  width: 280px;
  max-width: 100%;
  background: var(--sv-surface-2);
  border: 1px solid var(--sv-line);
  border-radius: 8px;
  padding: 8px 11px;
  margin-bottom: 16px;
}
.dv-slash {
  color: var(--sv-fg-dim);
}
.dv-input {
  border: 0;
  background: transparent;
  flex: 1;
  min-width: 0;
  font-size: 12px;
  color: var(--sv-fg);
}
.dv-empty {
  border: 1px dashed var(--sv-line);
  border-radius: 8px;
  padding: 28px;
  text-align: center;
  color: var(--sv-fg-dim);
  font-size: 12px;
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
.dv-item {
  display: flex;
  flex-direction: column;
  gap: 3px;
  width: 100%;
  padding: 10px 11px;
  border: 0;
  border-radius: 6px;
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
  border-radius: 10px;
  padding: 24px 28px;
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
</style>
