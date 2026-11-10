<script setup lang="ts">
import { ChevronDown, ChevronUp } from 'lucide-vue-next'
import { ref, watch } from 'vue'

const props = withDefaults(defineProps<{
  label: string
  /** Текущее значение. Может быть нечисловым, если так записано в файле, например RU:urban. */
  value: string
  unit?: string
  step?: number
  min?: number
  max?: number
  /** С чего начинать счётчик, если значения нет или оно не число. */
  start?: number
  /** Пустое поле снимает значение. */
  clearable?: boolean
}>(), { unit: '', step: 1, min: 1, max: 999, start: 1, clearable: false })

const emit = defineEmits<{ change: [value: number | null] }>()

const text = ref(props.value)
watch(() => props.value, (next) => (text.value = next))

function base(): number {
  const parsed = Number.parseInt(props.value, 10)
  return Number.isFinite(parsed) && /^\d+$/.test(props.value) ? parsed : props.start - props.step
}

function shift(direction: 1 | -1): void {
  const next = Math.max(props.min, Math.min(props.max, base() + direction * props.step))
  if (String(next) !== props.value) emit('change', next)
}

function commit(): void {
  const value = text.value.trim()
  if (value === props.value) return
  if (value === '' && props.clearable) {
    emit('change', null)
    return
  }
  const parsed = Number(value)
  if (!/^\d+$/.test(value) || parsed < props.min || parsed > props.max) {
    text.value = props.value
    return
  }
  emit('change', parsed)
}

function onKey(event: KeyboardEvent): void {
  if (event.key === 'Enter') (event.target as HTMLInputElement).blur()
  else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
    event.preventDefault()
    shift(event.key === 'ArrowUp' ? 1 : -1)
  } else if (event.key === 'Escape') {
    text.value = props.value
    ;(event.target as HTMLInputElement).blur()
  }
}
</script>

<template>
  <div class="counter">
    <span class="eyebrow">{{ label }}</span>
    <div class="line">
      <input v-model="text" inputmode="numeric" :aria-label="label" placeholder="—" @change="commit" @keydown="onKey" />
      <small v-if="unit">{{ unit }}</small>
      <span class="arrows">
        <button type="button" :aria-label="`${label}: больше`" @click="shift(1)"><ChevronUp :size="12" /></button>
        <button type="button" :aria-label="`${label}: меньше`" @click="shift(-1)"><ChevronDown :size="12" /></button>
      </span>
    </div>
  </div>
</template>

<style scoped>
.counter {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
  padding: 7px 9px;
  background: var(--inset);
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
}
.counter:hover,
.counter:focus-within {
  border-color: var(--accent);
}
.line {
  display: flex;
  align-items: center;
  gap: 4px;
}
input {
  flex: 1;
  width: 100%;
  min-width: 0;
  padding: 0;
  background: transparent;
  border: 0;
  outline: none;
  color: var(--text);
  font-size: 18px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
small {
  flex: none;
  color: var(--faint);
  font-size: 11px;
}
.arrows {
  flex: none;
  display: flex;
  flex-direction: column;
}
.arrows button {
  display: grid;
  place-items: center;
  width: 18px;
  height: 13px;
  padding: 0;
  background: var(--raised);
  border: 1px solid var(--line-strong);
  color: var(--text);
}
.arrows button:hover {
  background: var(--row-hover);
}
</style>
