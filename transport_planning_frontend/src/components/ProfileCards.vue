<script setup lang="ts">
import { computed } from 'vue'

import { ROAD_PRESETS, type RoadPreset } from '@/core/presets'

import CrossSection from './CrossSection.vue'

defineProps<{ activeId?: string }>()
const emit = defineEmits<{ pick: [preset: RoadPreset] }>()

const groups = computed(() => {
  const result = new Map<string, RoadPreset[]>()
  for (const preset of ROAD_PRESETS) {
    const list = result.get(preset.group)
    if (list) list.push(preset)
    else result.set(preset.group, [preset])
  }
  return [...result.entries()]
})

function widths(count: number, width: number): number[] {
  return Array.from({ length: count }, () => width)
}
</script>

<template>
  <div v-for="[group, presets] in groups" :key="group" class="group">
    <div class="eyebrow">{{ group }}</div>
    <div class="cards">
      <button
        v-for="preset in presets"
        :key="preset.id"
        class="card"
        :class="{ active: activeId === preset.id }"
        :aria-pressed="activeId === preset.id"
        @click="emit('pick', preset)"
      >
        <CrossSection :forward="widths(preset.forward, preset.laneWidth)" :backward="widths(preset.backward, preset.laneWidth)" />
        <strong>{{ preset.title }}</strong>
        <span class="faint">{{ preset.summary }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.cards {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}
.card {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  padding: 6px;
  background: var(--inset);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  font-size: 11px;
  text-align: left;
}
.card:hover {
  border-color: var(--line-strong);
}
.card.active {
  border-color: var(--accent);
  background: var(--accent-soft);
}
.card strong {
  font-size: 12px;
  font-weight: 500;
}
</style>
