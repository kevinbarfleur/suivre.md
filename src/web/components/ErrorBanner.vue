<script setup lang="ts">
// The app's one error banner. The ✗ is the mark the board banners already use,
// and the retry button sits on the danger line rather than on a neutral one:
// it belongs to the error, it is not a plain control dropped inside it.
defineProps<{ message: string; detail?: string }>()
defineEmits<{ retry: [] }>()
</script>

<template>
  <div class="eb" role="alert">
    <span class="eb-mark" aria-hidden="true">✗</span>
    <span class="eb-text">
      {{ message }}
      <span v-if="detail" class="eb-detail">{{ detail }}</span>
    </span>
    <button class="eb-retry" type="button" @click="$emit('retry')">retry</button>
  </div>
</template>

<style scoped>
.eb {
  display: flex;
  align-items: flex-start;
  gap: 11px;
  border: 1px solid var(--sv-danger-line);
  background: var(--sv-danger-bg);
  border-radius: var(--sv-r);
  padding: 11px 14px;
  font-size: 12px;
}
.eb-mark {
  flex: 0 0 auto;
  color: var(--sv-danger);
}
.eb-text {
  flex: 1;
  min-width: 0;
  color: var(--sv-danger);
  line-height: 1.6;
  overflow-wrap: anywhere;
}
.eb-detail {
  color: var(--sv-fg-mid);
}
.eb-retry {
  flex: 0 0 auto;
  background: transparent;
  border: 1px solid var(--sv-danger-line);
  color: var(--sv-danger);
  padding: 4px 11px;
  border-radius: var(--sv-r-badge);
  font-family: inherit;
  font-size: 11.5px;
  cursor: pointer;
}
.eb-retry:hover {
  border-color: var(--sv-danger);
}
</style>
