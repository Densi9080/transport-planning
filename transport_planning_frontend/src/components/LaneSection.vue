<script setup lang="ts">
import { computed } from 'vue'

import { laneNumber } from '@/core/lanePick'
import { readLaneValue, writeLaneValue } from '@/core/laneTags'
import type { OWay } from '@/core/types'
import { useEditor } from '@/stores/editor'

const props = defineProps<{ way: OWay }>()
const editor = useEditor()

const lane = computed(() => (editor.selectedLane?.wayId === props.way.id ? editor.selectedLane : null))
const tags = computed(() => props.way.tags ?? {})
const speed = computed(() => (lane.value ? readLaneValue(tags.value, 'maxspeed', lane.value.forward, lane.value.lane) : ''))

function setSpeed(value: string): void {
  if (!lane.value) return
  editor.updateWayTags(props.way.id, writeLaneValue(tags.value, 'maxspeed', lane.value.forward, lane.value.lane, value), 'Скорость полосы')
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
  </div>
</template>

<style scoped>
.field {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
</style>
