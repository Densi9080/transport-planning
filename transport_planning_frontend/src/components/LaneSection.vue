<script setup lang="ts">
import { ArrowLeft, ArrowRight } from 'lucide-vue-next'
import { computed } from 'vue'

import { laneNumber } from '@/core/lanePick'
import { parseProfile } from '@/core/lanes'
import { readLaneValue, writeLaneValue } from '@/core/laneTags'
import type { OWay } from '@/core/types'
import { useEditor } from '@/stores/editor'

const props = defineProps<{ way: OWay }>()
const editor = useEditor()
const SHIFT_STEP_M = 0.1

const lane = computed(() => (editor.selectedLane?.wayId === props.way.id ? editor.selectedLane : null))
const tags = computed(() => props.way.tags ?? {})
const speed = computed(() => (lane.value ? readLaneValue(tags.value, 'maxspeed', lane.value.forward, lane.value.lane) : ''))

/** Текущий сдвиг и его предел: треть ширины полосы, чтобы она не выходила за разметку. */
const shift = computed(() => {
  if (!lane.value) return { value: 0, limit: 1 }
  const profile = parseProfile(tags.value)
  const widths = lane.value.forward ? profile.widthsForward : profile.widthsBackward
  const shifts = lane.value.forward ? profile.shiftForward : profile.shiftBackward
  return { value: shifts[lane.value.lane] ?? 0, limit: (widths[lane.value.lane] ?? 3) / 3 }
})

function setSpeed(value: string): void {
  if (!lane.value) return
  editor.updateWayTags(props.way.id, writeLaneValue(tags.value, 'maxspeed', lane.value.forward, lane.value.lane, value), 'Скорость полосы')
}

function setShift(value: number): void {
  if (!Number.isFinite(value)) return
  const limit = shift.value.limit
  editor.setLaneShift(Math.max(-limit, Math.min(limit, Math.round(value * 100) / 100)))
}
</script>

<template>
  <div v-if="lane" class="section">
    <h2>Полоса {{ laneNumber(lane.lane, lane.count) }} из {{ lane.count }}</h2>
    <p class="muted">{{ lane.forward ? 'По направлению линии' : 'Против направления линии' }}. Полоса 1 крайняя правая по ходу движения</p>
    <label class="field">
      <span>Скорость полосы, км/ч</span>
      <input class="input" type="number" min="0" step="5" :value="speed" :placeholder="tags.maxspeed ?? 'как у дороги'" @change="setSpeed(($event.target as HTMLInputElement).value)" />
    </label>
    <div class="field">
      <span>Сдвиг полосы вбок, м</span>
      <div class="shift">
        <button class="btn small" :disabled="shift.value <= -shift.limit + 0.001" aria-label="Сдвинуть полосу влево" title="Влево по ходу движения" @click="setShift(shift.value - SHIFT_STEP_M)"><ArrowLeft :size="13" /></button>
        <input
          class="input"
          type="number"
          step="0.05"
          :min="-shift.limit"
          :max="shift.limit"
          :value="shift.value"
          aria-label="Сдвиг полосы, метров: плюс — вправо по ходу движения"
          @change="setShift(Number.parseFloat(($event.target as HTMLInputElement).value.replace(',', '.')))"
        />
        <button class="btn small" :disabled="shift.value >= shift.limit - 0.001" aria-label="Сдвинуть полосу вправо" title="Вправо по ходу движения" @click="setShift(shift.value + SHIFT_STEP_M)"><ArrowRight :size="13" /></button>
        <button v-if="shift.value !== 0" class="btn ghost small" @click="setShift(0)">Сброс</button>
      </div>
      <span class="faint note">Двигается средняя линия полосы, по ней едут машины в микромодели. Разметка и ширина остаются. Предел ±{{ shift.limit.toFixed(2) }} м.</span>
    </div>
  </div>
</template>

<style scoped>
.field {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.shift {
  display: flex;
  align-items: center;
  gap: 4px;
}
.shift .input {
  width: 72px;
}
.note {
  font-size: 11px;
}
</style>
