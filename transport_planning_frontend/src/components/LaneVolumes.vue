<script setup lang="ts">
import { computed } from 'vue'

import { parseProfile } from '@/core/lanes'
import type { OWay } from '@/core/types'
import { countedVolume, laneVolumes, withLaneVolume } from '@/core/zones'
import { useEditor } from '@/stores/editor'

/**
 * Интенсивность по каждой полосе, авт/ч, как в натурном обследовании. На въезде в сеть она
 * заменяет оценку потока, а в результатах макромодели стоит рядом с расчётной для сверки.
 */
const props = defineProps<{ way: OWay }>()
const editor = useEditor()

const tags = computed(() => props.way.tags ?? {})
const directions = computed(() => {
  const profile = parseProfile(tags.value)
  const list: { forward: boolean; title: string }[] = []
  if (profile.forward > 0 || profile.oneway) list.push({ forward: true, title: profile.oneway ? 'По ходу движения' : 'По направлению линии' })
  if (!profile.oneway && profile.backward > 0) list.push({ forward: false, title: 'Против направления линии' })
  return list.map((item) => {
    const values = laneVolumes(tags.value, item.forward)
    // Полосы в тегах слева направо, человеку привычнее «полоса 1 — крайняя правая»
    const lanes = values.map((value, lane) => ({ lane, number: values.length - lane, value })).reverse()
    return { ...item, lanes, total: countedVolume(tags.value, item.forward) }
  })
})

function set(forward: boolean, lane: number, value: string): void {
  editor.updateWayTags(props.way.id, withLaneVolume(tags.value, forward, lane, value), 'Интенсивность полосы')
}
</script>

<template>
  <div class="volumes">
    <h3>Интенсивность по полосам, авт/ч</h3>
    <div v-for="direction in directions" :key="String(direction.forward)" class="direction">
      <div class="head">
        <span>{{ direction.title }}</span>
        <span class="muted">{{ direction.total === null ? 'не задана' : `всего ${direction.total}` }}</span>
      </div>
      <label v-for="item in direction.lanes" :key="item.lane" class="lane">
        <span class="muted">Полоса {{ item.number }}</span>
        <input
          class="input"
          type="number"
          min="0"
          step="10"
          :value="item.value ?? ''"
          placeholder="—"
          :aria-label="`${direction.title}, полоса ${item.number}, авт/ч`"
          @change="set(direction.forward, item.lane, ($event.target as HTMLInputElement).value)"
        />
      </label>
    </div>
    <p class="muted note">Полоса 1 — крайняя правая. Пустое поле — интенсивность не задана. Значения пишутся в теги tp:volume:lanes и в сеть SUMO и MATSim не попадают.</p>
  </div>
</template>

<style scoped>
.volumes {
  margin-top: 12px;
}
h3 {
  margin: 0 0 6px;
  font-size: 12px;
}
.direction {
  margin-bottom: 8px;
}
.head {
  display: flex;
  justify-content: space-between;
  margin-bottom: 4px;
  font-size: 12px;
}
.lane {
  display: grid;
  grid-template-columns: 1fr 96px;
  align-items: center;
  gap: 6px;
  margin-bottom: 3px;
}
.note {
  font-size: 11px;
}
</style>
