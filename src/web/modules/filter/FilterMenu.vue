<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'

// Pilule-filtre terminal : `--flag ▾`. Inactif → menu déroulant d'options ;
// actif → pilule pleine `--flag valeur ×` (le × efface). Ferme au clic dehors.
export interface FilterOption {
  value: string
  label: string
}

const props = defineProps<{
  label: string
  modelValue: string | null
  options: readonly FilterOption[]
}>()
const emit = defineEmits<{ 'update:modelValue': [string | null] }>()

const open = ref(false)
const root = ref<HTMLElement | null>(null)

const activeLabel = computed(
  () => props.options.find((o) => o.value === props.modelValue)?.label ?? props.modelValue,
)

function toggle(): void {
  if (props.modelValue) {
    emit('update:modelValue', null)
    return
  }
  open.value = !open.value
}
function pick(value: string): void {
  emit('update:modelValue', value)
  open.value = false
}
function onDoc(event: MouseEvent): void {
  if (root.value && !root.value.contains(event.target as Node)) open.value = false
}
watch(open, (isOpen) => {
  if (isOpen) document.addEventListener('mousedown', onDoc)
  else document.removeEventListener('mousedown', onDoc)
})
onBeforeUnmount(() => document.removeEventListener('mousedown', onDoc))
</script>

<template>
  <div ref="root" class="fm">
    <button
      class="fm-pill"
      :class="{ 'fm-pill--active': modelValue }"
      type="button"
      @click="toggle"
    >
      <span class="fm-pill-text">{{ label }}<template v-if="modelValue"> {{ activeLabel }}</template></span>
      <span class="fm-caret">{{ modelValue ? '×' : '▾' }}</span>
    </button>
    <div v-if="open" class="fm-menu">
      <button
        v-for="option in options"
        :key="option.value"
        class="fm-item"
        type="button"
        @click="pick(option.value)"
      >
        {{ option.label }}
      </button>
      <div v-if="options.length === 0" class="fm-empty">aucune valeur</div>
    </div>
  </div>
</template>

<style scoped>
.fm {
  position: relative;
}
.fm-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: transparent;
  border: 1px solid var(--sv-line);
  color: var(--sv-fg-mid);
  padding: 7px 10px;
  border-radius: var(--sv-r);
  font-size: 12px;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    color 0.15s ease;
}
.fm-pill:hover {
  border-color: var(--sv-line-strong);
  color: var(--sv-fg);
}
.fm-pill--active,
.fm-pill--active:hover {
  background: var(--sv-accent);
  border-color: var(--sv-accent);
  color: var(--sv-on-accent);
}
.fm-caret {
  color: var(--sv-fg-dim);
}
.fm-pill--active .fm-caret {
  color: var(--sv-on-accent);
}
.fm-menu {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 40;
  min-width: 160px;
  max-height: 280px;
  overflow-y: auto;
  background: var(--sv-surface-2);
  border: 1px solid var(--sv-line);
  border-radius: 8px;
  padding: 6px;
  box-shadow: var(--sv-shadow-pop);
}
.fm-item {
  display: block;
  width: 100%;
  text-align: left;
  background: transparent;
  border: 0;
  color: var(--sv-fg);
  padding: 7px 10px;
  border-radius: 5px;
  font-size: 12px;
  cursor: pointer;
}
.fm-item:hover {
  background: var(--sv-surface-3);
}
.fm-empty {
  padding: 7px 10px;
  font-size: 11px;
  color: var(--sv-fg-dim);
}
</style>
