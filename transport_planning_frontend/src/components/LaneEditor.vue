<script setup lang="ts">
import { ArrowLeft, ArrowRight, ArrowUp, Minus, Plus, RotateCcw, Undo2 } from 'lucide-vue-next'
import { computed } from 'vue'

import {
  dividerMode,
  type DividerMode,
  MAX_LANE_WIDTH,
  MIN_LANE_WIDTH,
  parseProfile,
  toggleTurn,
  totalWidth,
  type TravelDirection,
  type Turn,
  turnAllows,
  withDivider,
  withLaneWidth,
  withoutLaneWidths,
  withTurns,
} from '@/core/lanes'
import type { Tags } from '@/core/types'

import CrossSection from './CrossSection.vue'

const props = defineProps<{ tags: Tags }>()
const emit = defineEmits<{ change: [tags: Tags] }>()

const profile = computed(() => parseProfile(props.tags))

const buttons: { turn: Turn; check: 'left' | 'through' | 'right' | 'reverse'; icon: typeof ArrowUp; label: string }[] = [
  { turn: 'reverse', check: 'reverse', icon: Undo2, label: 'Разворот' },
  { turn: 'left', check: 'left', icon: ArrowLeft, label: 'Налево' },
  { turn: 'through', check: 'through', icon: ArrowUp, label: 'Прямо' },
  { turn: 'right', check: 'right', icon: ArrowRight, label: 'Направо' },
]

const DIVIDER_ORDER: DividerMode[] = ['both', 'none', 'to_right', 'to_left']
const DIVIDER_TITLES: Record<DividerMode, string> = {
  both: 'Пунктир: перестроение в обе стороны',
  none: 'Сплошная: перестраиваться нельзя',
  to_right: 'Двойная: только с левой полосы на правую',
  to_left: 'Двойная: только с правой полосы на левую',
}

function dividerOf(direction: TravelDirection, boundary: number): DividerMode {
  const rules = direction === 'forward' ? profile.value.changeForward : profile.value.changeBackward
  return dividerMode(rules, boundary)
}

function cycleDivider(direction: TravelDirection, boundary: number): void {
  const current = DIVIDER_ORDER.indexOf(dividerOf(direction, boundary))
  const next = DIVIDER_ORDER[(current + 1) % DIVIDER_ORDER.length]!
  emit('change', withDivider(props.tags, direction, boundary, next))
}

const WIDTH_STEP = 0.25
const hasCustomWidths = computed(() => ['width:lanes', 'width:lanes:forward', 'width:lanes:backward'].some((key) => props.tags[key] !== undefined))

function widthOf(direction: TravelDirection, lane: number): number {
  return (direction === 'forward' ? profile.value.widthsForward : profile.value.widthsBackward)[lane] ?? profile.value.laneWidth
}

function setWidth(direction: TravelDirection, lane: number, width: number): void {
  if (!Number.isFinite(width)) return
  emit('change', withLaneWidth(props.tags, direction, lane, width))
}

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
    <div class="gabarit">
      <div class="row">
        <span class="eyebrow">Поперечное сечение</span>
        <span class="spacer" />
        <strong>{{ totalWidth(profile).toFixed(2) }} м</strong>
      </div>
      <CrossSection :forward="profile.widthsForward" :backward="profile.widthsBackward" dimensions />
      <button v-if="hasCustomWidths" class="btn small block" @click="emit('change', withoutLaneWidths(tags))">
        <RotateCcw :size="12" aria-hidden="true" /> Сбросить ширину полос
      </button>
    </div>
    <div v-for="direction in directions" :key="direction.id" class="direction">
      <div class="eyebrow">{{ direction.title }}</div>
      <div class="strip" role="group" :aria-label="direction.title">
        <template v-for="(lane, index) in direction.lanes" :key="index">
        <button
          v-if="index > 0"
          class="divider"
          :class="dividerOf(direction.id, index - 1)"
          :title="`${DIVIDER_TITLES[dividerOf(direction.id, index - 1)]}. Нажмите, чтобы сменить`"
          :aria-label="`Линия между полосами ${direction.lanes.length - index + 1} и ${direction.lanes.length - index}: ${DIVIDER_TITLES[dividerOf(direction.id, index - 1)]}`"
          @click="cycleDivider(direction.id, index - 1)"
        >
          <i /><i />
        </button>
        <div class="lane">
          <span class="lane-number">{{ direction.lanes.length - index }}</span>
          <button
            v-for="button in buttons"
            :key="button.turn"
            class="turn"
            :class="{ on: turnAllows(lane, button.check) }"
            :aria-pressed="turnAllows(lane, button.check)"
            :aria-label="`Полоса ${direction.lanes.length - index}: ${button.label}`"
            :title="button.label"
            @click="toggle(direction.id, direction.lanes, index, button.turn)"
          >
            <component :is="button.icon" :size="14" />
          </button>
          <div class="width" role="group" :aria-label="`Ширина полосы ${direction.lanes.length - index}`">
            <button aria-label="Уже" :disabled="widthOf(direction.id, index) <= MIN_LANE_WIDTH" @click="setWidth(direction.id, index, widthOf(direction.id, index) - WIDTH_STEP)"><Minus :size="10" /></button>
            <input
              :value="widthOf(direction.id, index).toFixed(2)"
              inputmode="decimal"
              :aria-label="`Ширина полосы ${direction.lanes.length - index}, метров`"
              :title="`От ${MIN_LANE_WIDTH} до ${MAX_LANE_WIDTH} м`"
              @change="setWidth(direction.id, index, Number.parseFloat(($event.target as HTMLInputElement).value.replace(',', '.')))"
            />
            <button aria-label="Шире" :disabled="widthOf(direction.id, index) >= MAX_LANE_WIDTH" @click="setWidth(direction.id, index, widthOf(direction.id, index) + WIDTH_STEP)"><Plus :size="10" /></button>
          </div>
        </div>
        </template>
      </div>
    </div>
    <p class="faint note">
      Полосы нарисованы так, как их видит водитель, а номер 1 у крайней правой. В turn:lanes
      порядок по правилам OSM обратный: слева направо. Полоса без отметок
      даёт симулятору выбрать манёвр самому. Линия между полосами меняется щелчком и пишется в
      change:lanes. Точные соединения полос настраиваются в редакторе узла.
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
  gap: 0;
  padding: 3px;
  overflow-x: auto;
  background: var(--strip);
}
.divider {
  flex: none;
  display: flex;
  gap: 2px;
  justify-content: center;
  width: 16px;
  padding: 0;
  background: var(--lane);
  border: 0;
}
.divider:hover {
  background: var(--accent);
}
.divider i {
  display: block;
  width: 2px;
  background: repeating-linear-gradient(#fff 0 7px, transparent 7px 13px);
}
.divider i + i {
  display: none;
}
.divider.none i {
  background: #fff;
}
.divider.to_right i + i,
.divider.to_left i + i {
  display: block;
}
.divider.to_right i:last-child {
  background: #fff;
}
.divider.to_left i:first-child {
  background: #fff;
}
.lane {
  flex: 1 0 62px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 4px 2px;
  background: var(--lane);
}
.lane-number {
  color: #fff;
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
  color: rgba(255, 255, 255, 0.55);
}
.turn:hover {
  color: #fff;
  border-color: rgba(255, 255, 255, 0.5);
}
.turn.on {
  background: #0f9d8a;
  border-color: #0b7d6e;
  color: #fff;
}
.note {
  margin: 0;
  font-size: 12px;
}
.gabarit {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.width {
  display: flex;
  align-items: center;
  margin-top: 3px;
}
.width button {
  display: grid;
  place-items: center;
  width: 13px;
  height: 18px;
  padding: 0;
  background: transparent;
  border: 0;
  color: #fff;
}
.width button:disabled {
  opacity: 0.35;
}
.width input {
  width: 32px;
  height: 18px;
  padding: 0;
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 2px;
  color: #fff;
  font-size: 10px;
  text-align: center;
}
</style>
