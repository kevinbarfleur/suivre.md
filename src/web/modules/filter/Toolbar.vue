<script setup lang="ts">
import { computed } from 'vue'

import { useBoard } from '../board/board.store'
import { NO_PRIORITY, useFilter, type PriorityFilter } from './filter.store'
import FilterMenu, { type FilterOption } from './FilterMenu.vue'
import SearchField from '../../components/SearchField.vue'

const { board } = useBoard()
const {
  text,
  status,
  priority,
  label,
  assignee,
  labels,
  assignees,
  activeCount,
  resultCount,
  clear,
} = useFilter()

const PRIORITIES: FilterOption[] = [
  { value: 'urgent', label: 'urgent' },
  { value: 'high', label: 'high' },
  { value: 'medium', label: 'medium' },
  { value: 'low', label: 'low' },
  { value: NO_PRIORITY, label: 'none' },
]
const statusOptions = computed<FilterOption[]>(
  () => board.value?.columns.map((c) => ({ value: c.column.id, label: c.column.label })) ?? [],
)
const labelOptions = computed<FilterOption[]>(() =>
  labels.value.map((l) => ({ value: l, label: l })),
)
const assigneeOptions = computed<FilterOption[]>(() =>
  assignees.value.map((a) => ({ value: a, label: a })),
)

// Casts in the script (never in a template expression).
function setPriority(value: string | null): void {
  priority.value = value as PriorityFilter | null
}
</script>

<template>
  <div class="tb">
    <SearchField v-model="text" placeholder="grep tasks…" />
    <FilterMenu
      label="--status"
      :model-value="status"
      :options="statusOptions"
      @update:model-value="status = $event"
    />
    <FilterMenu
      label="--priority"
      :model-value="priority"
      :options="PRIORITIES"
      @update:model-value="setPriority"
    />
    <FilterMenu
      label="--label"
      :model-value="label"
      :options="labelOptions"
      @update:model-value="label = $event"
    />
    <FilterMenu
      label="--assignee"
      :model-value="assignee"
      :options="assigneeOptions"
      @update:model-value="assignee = $event"
    />
    <span class="tb-tail">
      <span class="tb-count"
        ><span class="tb-count-n">{{ resultCount }}</span> results<template v-if="activeCount">
          · {{ activeCount }} filter{{ activeCount > 1 ? 's' : '' }}</template
        ></span
      >
      <template v-if="activeCount">
        <span class="tb-sep" aria-hidden="true">|</span>
        <button class="tb-clear" type="button" @click="clear">clear</button>
      </template>
    </span>
  </div>
</template>

<style scoped>
.tb {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  font-size: 12px;
}
.tb-tail {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 10px;
  white-space: nowrap;
}
.tb-count {
  color: var(--sv-fg-dim);
  font-variant-numeric: tabular-nums;
}
.tb-count-n {
  color: var(--sv-fg);
}
.tb-sep {
  color: var(--sv-line-strong);
}
/* The bar announced "2 filters" with no way to release them. */
.tb-clear {
  background: transparent;
  border: 0;
  padding: 0;
  color: var(--sv-fg-mid);
  cursor: pointer;
  text-decoration: underline;
  text-decoration-style: dotted;
  text-underline-offset: 3px;
}
.tb-clear:hover {
  color: var(--sv-fg);
}
</style>
