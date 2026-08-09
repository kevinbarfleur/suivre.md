<script setup lang="ts">
// The app's one empty state. Deliberately NOT a dashed box: dashed means
// "something can land here" (a drop target, an add affordance), and an empty
// state is not a target — it is a sentence. Slot `hint` carries what the user
// can do about it, usually the CLI command that would fill this view.
//
// `tone` is what separates "nothing here yet" from "you are somewhere that does
// not exist": the unknown view is not an empty folder, and its label has to say
// so without a second component.
withDefaults(defineProps<{ label: string; message: string; tone?: 'quiet' | 'warn' }>(), {
  tone: 'quiet',
})
</script>

<template>
  <div class="sb">
    <div class="sb-label" :class="{ 'sb-label--warn': tone === 'warn' }">{{ label }}</div>
    <p class="sb-message">{{ message }}</p>
    <p v-if="$slots.hint" class="sb-hint"><slot name="hint" /></p>
  </div>
</template>

<style scoped>
.sb {
  padding: 18px 0;
  max-width: var(--sv-measure);
}
.sb-label {
  font-size: 9px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--sv-faint);
  margin-bottom: 8px;
}
.sb-label--warn {
  color: var(--sv-warn);
}
.sb-message {
  font-size: 13px;
  color: var(--sv-fg-mid);
  margin: 0 0 6px;
}
.sb-hint {
  font-size: 11.5px;
  line-height: 1.7;
  color: var(--sv-fg-dim);
  margin: 0;
}
.sb-hint :deep(.sb-cmd) {
  color: var(--sv-fg-mid);
}
/* The gap lives here, not at the call sites: Vue condenses a newline between
   the two spans away, so a hint written across two lines rendered `$suivre …`.
   A margin also cannot break the line, which is what you want between a prompt
   and its command. */
.sb-hint :deep(.sb-prompt) {
  color: var(--sv-prompt);
  margin-right: 0.5ch;
}
</style>
