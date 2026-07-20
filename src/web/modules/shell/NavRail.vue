<script setup lang="ts">
import { computed } from 'vue'
import type { Board } from '../../../domain'
import { useBoard } from '../board/board.store'
import { useView } from './view.store'
import { views, type ViewDef } from './view-registry'

// Rail de navigation : marque + deux groupes (tâches / ressources) tirés du
// registre de vues. La vue active est mise en avant ; les badges sont des comptes.
const { board } = useBoard()
const { view, setView } = useView()

const projectName = computed(() => board.value?.config.name ?? '—')
const taskViews = computed(() => views('tasks'))
const resourceViews = computed(() => views('resources'))

function badge(def: ViewDef): string | number {
  if (!def.badge || !board.value) return ''
  return def.badge(board.value as Board)
}
</script>

<template>
  <nav class="rail">
    <div class="rail-brand">
      <div class="rail-name">suivre.md</div>
      <div class="rail-sub">{{ projectName }} · v0.1</div>
    </div>

    <div class="rail-group">
      <div class="rail-group-l">tasks</div>
      <button
        v-for="def in taskViews"
        :key="def.id"
        class="rail-item"
        :class="{ 'rail-item--active': view === def.id }"
        type="button"
        @click="setView(def.id)"
      >
        <span class="rail-item-label"
          ><span v-if="view === def.id" class="rail-caret">›</span>{{ def.label }}</span
        >
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
        @click="setView(def.id)"
      >
        <span class="rail-item-label"
          ><span v-if="view === def.id" class="rail-caret">›</span>{{ def.label }}</span
        >
        <span class="rail-item-badge">{{ badge(def) }}</span>
      </button>
    </div>

    <div class="rail-bottom">
      <button
        class="rail-item"
        :class="{ 'rail-item--active': view === 'settings' }"
        type="button"
        @click="setView('settings')"
      >
        <span class="rail-item-label"
          ><span v-if="view === 'settings'" class="rail-caret">›</span>settings</span
        >
      </button>
      <div class="rail-foot">
        <div>.suivre/ · markdown</div>
        <div>web · cli · mcp</div>
      </div>
    </div>
  </nav>
</template>

<style scoped>
.rail {
  flex: 0 0 208px;
  border-right: 1px solid var(--sv-line);
  background: var(--sv-rail-bg);
  padding: 22px 16px;
  display: flex;
  flex-direction: column;
  gap: 22px;
  overflow-y: auto;
}
.rail-name {
  font-size: 14px;
  font-weight: 700;
  color: var(--sv-bright);
}
.rail-sub {
  font-size: 10px;
  color: var(--sv-fg-dim);
  margin-top: 3px;
}
.rail-group-l {
  font-size: 9px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--sv-faint);
  margin: 0 8px 8px;
}
.rail-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
  padding: 7px 9px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  font-family: inherit;
  font-size: 12.5px;
  color: var(--sv-fg-mid);
  cursor: pointer;
  transition:
    background-color 0.12s ease,
    color 0.12s ease;
}
.rail-item:hover {
  background: var(--sv-surface-2);
  color: var(--sv-fg-card);
}
.rail-item--active,
.rail-item--active:hover {
  background: var(--sv-surface-3);
  color: var(--sv-fg);
}
.rail-item-label {
  display: inline-flex;
  align-items: baseline;
  gap: 5px;
  padding-left: 11px;
}
.rail-item--active .rail-item-label {
  padding-left: 0;
}
.rail-caret {
  color: var(--sv-prompt);
}
.rail-item-badge {
  font-size: 10px;
  color: var(--sv-fg-dim);
  font-variant-numeric: tabular-nums;
}
.rail-bottom {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.rail-foot {
  font-size: 10px;
  color: var(--sv-faint);
  line-height: 1.7;
  border-top: 1px solid var(--sv-line-soft);
  padding-top: 14px;
}
</style>
