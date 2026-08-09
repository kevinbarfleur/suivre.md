<script setup lang="ts">
// One search field for the whole app. There were four, at 250 / 280 / 240 / 320
// px and three different heights — the drift you feel when moving between
// views. The `/` stays dim: the green is the shell prompt, not a field prefix.
withDefaults(defineProps<{ modelValue: string; placeholder?: string; width?: string }>(), {
  placeholder: 'search…',
  width: '300px',
})
defineEmits<{ 'update:modelValue': [value: string] }>()
</script>

<template>
  <label class="sf" :style="{ width }">
    <span class="sf-slash" aria-hidden="true">/</span>
    <input
      class="sf-input"
      type="search"
      :value="modelValue"
      :placeholder="placeholder"
      @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    />
  </label>
</template>

<style scoped>
.sf {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 32px;
  background: var(--sv-raised);
  border: 1px solid var(--sv-line);
  border-radius: var(--sv-r);
  padding: 0 11px;
}
.sf:focus-within {
  border-color: var(--sv-line-strong);
}
.sf-slash {
  color: var(--sv-fg-dim);
  flex: 0 0 auto;
}
.sf-input {
  flex: 1;
  min-width: 0;
  background: transparent;
  border: 0;
  outline: none;
  font-size: 12.5px;
  color: var(--sv-fg);
}
.sf-input::-webkit-search-cancel-button {
  appearance: none;
}
</style>
