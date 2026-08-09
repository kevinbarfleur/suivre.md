<script setup lang="ts">
import { computed } from 'vue'
import type { Board } from '../../../domain'
// Single source of truth for the version: a literal here drifts from the
// published package the moment it is bumped.
import { version } from '../../../../package.json'
import { useBoard } from '../board/board.store'
import { useView } from './view.store'
import { views, type ViewDef } from './view-registry'

// Navigation rail: brand, the three groups pulled from the view registry, and
// the facts about where the data lives.
//
// Selection is carried by contrast alone — no background step, no caret, no
// indent shift. The active view is the only bright label in the column, so the
// rail states where you are without spending a surface on it, and nothing has
// to move when the selection changes.
const { board } = useBoard()
const { view, setView } = useView()

const projectName = computed(() => board.value?.config.name ?? '—')
const taskViews = computed(() => views('tasks'))
const resourceViews = computed(() => views('resources'))
// The `system` group is read from the registry like the other two: hard-coding
// the settings entry here meant a fourth system view would never appear.
const systemViews = computed(() => views('system'))

/** What the store is, in the rail rather than in a decorative footer. */
const FACTS: readonly { k: string; v: string }[] = [
  { k: 'store', v: '.suivre/' },
  { k: 'format', v: 'markdown' },
  { k: 'surfaces', v: 'web · cli · mcp' },
]

function badge(def: ViewDef): string | number {
  if (!def.badge || !board.value) return ''
  return def.badge(board.value as Board)
}
</script>

<template>
  <nav class="rail">
    <div class="rail-brand">
      <div class="rail-name">suivre.md</div>
      <div class="rail-sub">
        <span class="rail-project">{{ projectName }}</span>
        <span class="rail-version"> · v{{ version }}</span>
      </div>
    </div>

    <div class="rail-group">
      <div class="rail-group-l">tasks</div>
      <button
        v-for="def in taskViews"
        :key="def.id"
        class="rail-item"
        :class="{ 'rail-item--active': view === def.id }"
        type="button"
        :aria-current="view === def.id ? 'page' : undefined"
        @click="setView(def.id)"
      >
        <span class="rail-item-label">{{ def.label }}</span>
        <span class="rail-item-badge">{{ badge(def) }}</span>
      </button>
    </div>

    <div class="rail-group">
      <div class="rail-group-l">resources</div>
      <button
        v-for="def in resourceViews"
        :key="def.id"
        class="rail-item"
        :class="{ 'rail-item--active': view === def.id }"
        type="button"
        :aria-current="view === def.id ? 'page' : undefined"
        @click="setView(def.id)"
      >
        <span class="rail-item-label">{{ def.label }}</span>
        <span class="rail-item-badge">{{ badge(def) }}</span>
      </button>
    </div>

    <div class="rail-bottom">
      <div class="rail-group-l">system</div>
      <button
        v-for="def in systemViews"
        :key="def.id"
        class="rail-item"
        :class="{ 'rail-item--active': view === def.id }"
        type="button"
        :aria-current="view === def.id ? 'page' : undefined"
        @click="setView(def.id)"
      >
        <span class="rail-item-label">{{ def.label }}</span>
        <span class="rail-item-badge">{{ badge(def) }}</span>
      </button>
      <div v-for="f in FACTS" :key="f.k" class="rail-fact">
        <span class="rail-fact-k">{{ f.k }}</span>
        <span class="rail-fact-v">{{ f.v }}</span>
      </div>
    </div>
  </nav>
</template>

<style scoped>
.rail {
  flex: 0 0 208px;
  border-right: 1px solid var(--sv-line);
  background: var(--sv-rail-bg);
  /* Vertical only: the items run edge to edge, so their own padding sets the
     left margin and a selected item can never look inset. */
  padding: 22px 0;
  display: flex;
  flex-direction: column;
  gap: 22px;
  overflow-y: auto;
}
.rail-brand {
  padding: 0 16px;
}
.rail-name {
  font-size: 14px;
  font-weight: 700;
  color: var(--sv-bright);
}
.rail-sub {
  font-size: 10px;
  margin-top: 3px;
}
.rail-project {
  color: var(--sv-fg-mid);
}
.rail-version {
  color: var(--sv-faint);
}
.rail-group-l {
  font-size: 9px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--sv-faint);
  margin: 0 16px 8px;
}
.rail-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  padding: 7px 16px;
  border: 0;
  border-radius: 0;
  background: transparent;
  font-family: inherit;
  font-size: 12.5px;
  text-align: left;
  color: var(--sv-fg-dim);
  cursor: pointer;
  transition: color 0.12s ease;
}
.rail-item:hover {
  color: var(--sv-fg-mid);
}
.rail-item--active,
.rail-item--active:hover {
  color: var(--sv-bright);
}
.rail-item-badge {
  font-size: 10px;
  color: var(--sv-fg-dim);
  font-variant-numeric: tabular-nums;
}
.rail-bottom {
  margin-top: auto;
}
.rail-fact {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
  padding: 7px 16px;
  font-size: 10px;
  line-height: 1.5;
}
.rail-fact-k {
  color: var(--sv-faint);
}
.rail-fact-v {
  color: var(--sv-fg-dim);
  text-align: right;
}
</style>
