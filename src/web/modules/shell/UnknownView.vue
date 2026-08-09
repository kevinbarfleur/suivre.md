<script setup lang="ts">
import { computed } from 'vue'
import { useView } from './view.store'
import { views } from './view-registry'
import StateBlock from '../../components/StateBlock.vue'

// Fallback for a view id nothing registered: a typo in the hash, `suivre show
// <view>` on a name that never existed, or a stale `defaultView` preference —
// which would otherwise open the app on a blank page, every time, with no way out.
const { view, setView } = useView()
const known = computed(() => views().filter((v) => v.group !== 'system'))
const message = computed(() => `Nothing is registered under ${view.value}.`)
</script>

<template>
  <div class="uv">
    <div class="uv-lead">
      <StateBlock label="unknown view" tone="warn" :message="message">
        <template #hint>
          The link, the <span class="uv-code">suivre show {{ view }}</span> command or the saved
          default view points at a view that does not exist.
        </template>
      </StateBlock>
    </div>

    <div class="uv-l">go to</div>
    <div class="uv-list">
      <button v-for="v in known" :key="v.id" class="uv-opt" type="button" @click="setView(v.id)">
        {{ v.label }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.uv {
  max-width: 84ch;
}
.uv-lead {
  max-width: 56ch;
}
.uv-code {
  background: var(--sv-code-bg);
  border: 1px solid var(--sv-line-soft);
  border-radius: var(--sv-r-badge);
  padding: 0 5px;
  color: var(--sv-fg-card);
  font-size: 0.92em;
}
.uv-l {
  font-size: 9px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--sv-faint);
  margin: 22px 0 10px;
}
.uv-list {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}
.uv-opt {
  background: transparent;
  border: 1px solid var(--sv-line);
  color: var(--sv-fg-mid);
  padding: 5px 12px;
  border-radius: 20px;
  font-family: inherit;
  font-size: 11.5px;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    color 0.15s ease;
}
.uv-opt:hover {
  border-color: var(--sv-line-strong);
  color: var(--sv-fg);
}
</style>
