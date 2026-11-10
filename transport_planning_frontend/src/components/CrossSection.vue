<script setup lang="ts">
import { computed } from 'vue'

/** Поперечное сечение проезжей части в масштабе: встречные полосы слева, попутные справа. */
const props = defineProps<{
  forward: number[]
  backward: number[]
  /** Подписывать ширину полос и общий габарит. */
  dimensions?: boolean
}>()

const SCALE = 26
const HEIGHT = 40
const LABEL = 15

function metres(value: number): string {
  return String(Math.round(value * 100) / 100)
}

const layout = computed(() => {
  // Ближняя к разделительной линии полоса идёт первой, поэтому встречные выводим в обратном порядке
  const cells = [
    ...[...props.backward].reverse().map((width) => ({ width, up: false })),
    ...props.forward.map((width) => ({ width, up: true })),
  ]
  let x = 0
  const lanes = cells.map((cell) => {
    const lane = { ...cell, x, w: cell.width * SCALE }
    x += lane.w
    return lane
  })
  const total = lanes.reduce((sum, lane) => sum + lane.width, 0)
  return { lanes, width: x, total, divider: props.backward.reduce((sum, width) => sum + width, 0) * SCALE }
})

const top = computed(() => (props.dimensions ? LABEL : 0))
const viewHeight = computed(() => HEIGHT + (props.dimensions ? LABEL * 2 : 0))
const label = computed(() => {
  const backward = props.backward.length
  const forward = props.forward.length
  return `Сечение дороги: ${backward ? `${backward} встречных и ` : ''}${forward} попутных полос, всего ${metres(layout.value.total)} м`
})
</script>

<template>
  <svg class="cross" :class="{ compact: !dimensions }" :viewBox="`0 0 ${layout.width} ${viewHeight}`" role="img" :aria-label="label" preserveAspectRatio="xMidYMid meet">
    <g v-for="(lane, index) in layout.lanes" :key="index">
      <rect :x="lane.x" :y="top" :width="lane.w" :height="HEIGHT" class="lane" :class="{ back: !lane.up }" />
      <line v-if="index > 0" :x1="lane.x" :x2="lane.x" :y1="top + 4" :y2="top + HEIGHT - 4" class="mark" />
      <path
        :d="lane.up ? `M ${lane.x + lane.w / 2} ${top + 10} l 7 11 h -14 z` : `M ${lane.x + lane.w / 2} ${top + HEIGHT - 10} l 7 -11 h -14 z`"
        class="arrow"
      />
      <text v-if="dimensions" :x="lane.x + lane.w / 2" :y="LABEL - 4" class="dim">{{ metres(lane.width) }}</text>
    </g>
    <line v-if="backward.length && forward.length" :x1="layout.divider" :x2="layout.divider" :y1="top" :y2="top + HEIGHT" class="axis" />
    <template v-if="dimensions">
      <line :x1="0" :x2="layout.width" :y1="top + HEIGHT + 6" :y2="top + HEIGHT + 6" class="measure" />
      <text :x="layout.width / 2" :y="top + HEIGHT + 21" class="dim total">{{ metres(layout.total) }} м</text>
    </template>
  </svg>
</template>

<style scoped>
.cross {
  display: block;
  width: 100%;
  max-height: 70px;
}
.cross.compact {
  max-height: 26px;
}
.lane {
  fill: #6d727b;
}
.lane.back {
  fill: #575c65;
}
.mark {
  stroke: #fff;
  stroke-width: 1.5;
  stroke-dasharray: 7 6;
}
.axis {
  stroke: #fff;
  stroke-width: 3;
}
.arrow {
  fill: rgba(255, 255, 255, 0.9);
}
.dim {
  fill: var(--muted);
  font-size: 11px;
  text-anchor: middle;
  font-variant-numeric: tabular-nums;
}
.dim.total {
  fill: var(--text);
  font-weight: 600;
}
.measure {
  stroke: var(--muted);
  stroke-width: 1;
}
</style>
