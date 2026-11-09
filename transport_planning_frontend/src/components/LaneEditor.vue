<script setup lang="ts">
import { ArrowLeft, ArrowRight, ArrowUp, Undo2 } from 'lucide-vue-next'
import { computed } from 'vue'

import {
  parseProfile,
  toggleTurn,
  type TravelDirection,
  type Turn,
  turnAllows,
  withTurns,
} from '@/core/lanes'
import type { Tags } from '@/core/types'

const props = defineProps<{ tags: Tags }>()
const emit = defineEmits<{ change: [tags: Tags] }>()

const profile = computed(() => parseProfile(props.tags))

const buttons: { turn: Turn; check: 'left' | 'through' | 'right' | 'reverse'; icon: typeof ArrowUp; label: string }[] = [
  { turn: 'reverse', check: 'reverse', icon: Undo2, label: 'Разворот' },
  { turn: 'left', check: 'left', icon: ArrowLeft, label: 'Налево' },
  { turn: 'through', check: 'through', icon: ArrowUp, label: 'Прямо' },
  { turn: 'right', check: 'right', icon: ArrowRight, label: 'Направо' },
]

const directions = computed(() => {
  const result: { id: TravelDirection; title: string; lanes: string[] }[] = []
  const fill = (count: number, turns: string[] | null) =>
    Array.from({ length: count }, (_, index) => turns?.[index] ?? '')
  if (profile.value.forward > 0) {
    result.push({
      id: 'forward',
      title: profile.value.oneway ? 'По направлению движения' : 'По ходу дороги',
      lanes: fill(profile.value.forward, profile.value.turnsForward),
    })
  }
  if (profile.value.backward > 0) {
    result.push({
      id: 'backward',
      title: profile.value.oneway ? 'По направлению движения' : 'Встречное направление',
      lanes: fill(profile.value.backward, profile.value.turnsBackward),
    })
  }
  return result
})

function toggle(direction: TravelDirection, lanes: string[], index: number, turn: Turn): void {
  const next = [...lanes]
  next[index] = toggleTurn(next[index] ?? '', turn)
  emit('change', withTurns(props.tags, direction, next))
}
</script>

<template>
  <div class="lanes">
    <div v-for="direction in directions" :key="direction.id" class="direction">
      <div class="eyebrow">{{ direction.title }}</div>
      <div class="strip" role="group" :aria-label="direction.title">
        <div v-for="(lane, index) in direction.lanes" :key="index" class="lane">
          <span class="lane-number faint">{{ index + 1 }}</span>
          <button
            v-for="button in buttons"
            :key="button.turn"
            class="turn"
            :class="{ on: turnAllows(lane, button.check) }"
            :aria-pressed="turnAllows(lane, button.check)"
            :aria-label="`Полоса ${index + 1}: ${button.label}`"
            :title="button.label"
            @click="toggle(direction.id, direction.lanes, index, button.turn)"
          >
            <component :is="button.icon" :size="14" />
          </button>
        </div>
      </div>
    </div>
    <p class="faint note">
      Полосы идут слева направо по ходу движения. Манёвры записываются в turn:lanes. Полоса без
      отметок даёт симулятору выбрать манёвр самому.
    </p>
  </div>
</template>

<style scoped>
.lanes {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.direction {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.strip {
  display: flex;
  gap: 2px;
  padding: 4px;
  overflow-x: auto;
  background: #101114;
  border-radius: var(--radius-sm);
}
.lane {
  flex: 1 0 44px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 4px 2px;
  background: #2b2d32;
  border-radius: 3px;
}
.lane-number {
  font-size: 10px;
}
.turn {
  display: grid;
  place-items: center;
  width: 28px;
  height: 24px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 4px;
  color: var(--faint);
}
.turn:hover {
  color: var(--text);
  border-color: var(--line-strong);
}
.turn.on {
  background: rgba(45, 212, 191, 0.2);
  border-color: rgba(45, 212, 191, 0.6);
  color: #5eead4;
}
.note {
  margin: 0;
  font-size: 12px;
}
</style>
