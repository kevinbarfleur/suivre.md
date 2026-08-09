<script setup lang="ts">
// Zero results is not an empty state: an empty view waits for you to create
// something, this one waits for you to let go. So it names the filters that
// are hiding everything and offers to release them.
defineProps<{ message: string; filters?: readonly string[] }>()
defineEmits<{ clear: [] }>()
</script>

<template>
  <div class="nr">
    <p class="nr-message">{{ message }}</p>
    <div v-if="filters && filters.length > 0" class="nr-chips">
      <span v-for="f in filters" :key="f" class="nr-chip">{{ f }}</span>
    </div>
    <button
      v-if="filters && filters.length > 0"
      class="nr-clear"
      type="button"
      @click="$emit('clear')"
    >
      clear filters
    </button>
  </div>
</template>

<style scoped>
.nr {
  padding: 18px 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: flex-start;
}
.nr-message {
  font-size: 13px;
  color: var(--sv-fg-mid);
  margin: 0;
}
.nr-chips {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.nr-chip {
  border: 1px solid var(--sv-line);
  border-radius: var(--sv-r);
  padding: 3px 9px;
  font-size: 11.5px;
  color: var(--sv-fg-mid);
}
.nr-clear {
  background: transparent;
  border: 1px solid var(--sv-line-strong);
  color: var(--sv-fg);
  padding: 5px 12px;
  border-radius: var(--sv-r);
  font-family: inherit;
  font-size: 11.5px;
  cursor: pointer;
}
.nr-clear:hover {
  background: var(--sv-surface-2);
}
</style>
