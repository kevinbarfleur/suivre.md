<script setup lang="ts">
import { computed } from 'vue'
import { useView } from './view.store'
import { views } from './view-registry'

// Fallback for a view id nothing registered: a typo in the hash, a link to a
// view that never existed, or a stale `defaultView` preference — which would
// otherwise open the app on a blank page, every time, with no way out.
const { view, setView } = useView()
const known = computed(() => views().filter((v) => v.group !== 'system'))
</script>

<template>
  <div class="uv">
    <div class="uv-title"><span class="uv-mark">?</span> Unknown view</div>
    <p class="uv-blurb">
      Nothing is registered under <span class="uv-code">{{ view }}</span> — the link or the saved
      default view points at a view that does not exist.
    </p>
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
  border: 1px dashed var(--sv-line);
  border-radius: var(--sv-r-box);
  padding: 34px 30px;
  max-width: 560px;
}
.uv-title {
  font-size: 15px;
  color: var(--sv-fg);
  margin-bottom: 8px;
}
.uv-mark {
  color: var(--sv-warn);
}
.uv-blurb {
  margin: 0 0 20px;
  font-size: 12.5px;
  color: var(--sv-fg-mid);
  line-height: 1.6;
}
.uv-code {
  color: var(--sv-fg);
}
.uv-l {
  font-size: 9.5px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--sv-faint);
  margin-bottom: 10px;
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
}
.uv-opt:hover {
  border-color: var(--sv-line-strong);
  color: var(--sv-fg);
}
</style>
