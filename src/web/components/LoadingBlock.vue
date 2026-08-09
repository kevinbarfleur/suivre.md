<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

// The loading state every reader store could already drive and none rendered:
// a slow first fetch used to show "no decisions yet", so the app lied about an
// empty folder. The gauge is the app's own ASCII meter, so waiting is told in
// the same language as progress everywhere else.
const props = defineProps<{ label: string; message: string }>()

const WIDTH = 6
const tick = ref(3)
const reduced = ref(false)
let timer: ReturnType<typeof setInterval> | null = null

const bar = (): string => '▓'.repeat(tick.value) + '░'.repeat(WIDTH - tick.value)
const glyphs = ref(bar())

onMounted(() => {
  // The gauge animates by swapping glyphs, which no @media block can stop —
  // reduced motion has to be read here.
  reduced.value = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (reduced.value) {
    glyphs.value = '▓▓▓░░░'
    return
  }
  timer = setInterval(() => {
    tick.value = (tick.value % WIDTH) + 1
    glyphs.value = bar()
  }, 420)
})

onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
})

defineExpose({ label: props.label })
</script>

<template>
  <div class="lb">
    <div class="lb-label">{{ label }}</div>
    <div class="lb-line">
      <span class="lb-bar" :class="{ 'lb-bar--pulse': !reduced }">{{ glyphs }}</span>
      <span>{{ message }}</span>
    </div>
  </div>
</template>

<style scoped>
.lb {
  padding: 18px 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.lb-label {
  font-size: 9px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--sv-faint);
}
.lb-line {
  display: flex;
  align-items: baseline;
  gap: 10px;
  font-size: 13px;
  color: var(--sv-fg-mid);
}
.lb-bar {
  color: var(--sv-fg-dim);
  letter-spacing: -0.05em;
}
.lb-bar--pulse {
  animation: sv-load 1.4s ease-in-out infinite;
}
@keyframes sv-load {
  0% {
    opacity: 0.35;
  }
  50% {
    opacity: 1;
  }
  100% {
    opacity: 0.35;
  }
}
@media (prefers-reduced-motion: reduce) {
  .lb-bar--pulse {
    animation: none;
  }
}
</style>
