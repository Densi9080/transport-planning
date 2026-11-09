<script setup lang="ts">
import { RotateCcw } from 'lucide-vue-next'
import { computed, ref } from 'vue'

import { bearing } from '@/core/geo'
import { nodeConnectors, resetLaneConnections, setLaneConnection } from '@/core/laneOps'
import type { Arm } from '@/core/topology'
import { connectivityAt } from '@/core/topology'
import { COLORS } from '@/map/style'
import { useEditor } from '@/stores/editor'

const props = defineProps<{ node: number }>()
const editor = useEditor()

const VIEW = 560
const CENTER = VIEW / 2
const LANE_W = 17
const ARM_END = 232

const COMPASS = ['С', 'СВ', 'В', 'ЮВ', 'Ю', 'ЮЗ', 'З', 'СЗ']

interface LaneShape {
  arm: Arm
  index: number
  incoming: boolean
  polygon: string
  /** Точка стыка с центром узла и направление движения от неё наружу. */
  joint: { x: number; y: number }
  arrow: string
}

const data = computed(() => {
  void editor.rev
  const doc = editor.doc
  const projector = editor.projector
  if (!doc || !projector) return null
  return nodeConnectors(doc, projector, props.node)
})

/** Длинную сторону центра определяют самые широкие подходы. */
const armStart = computed(() => {
  const arms = data.value?.arms ?? []
  const widest = Math.max(1, ...arms.map((arm) => arm.lanesIn + arm.lanesOut))
  return Math.max(46, widest * LANE_W * 0.72)
})

function toSvg(x: number, y: number): { x: number; y: number } {
  return { x: CENTER + x, y: CENTER - y }
}

const shapes = computed<LaneShape[]>(() => {
  const result: LaneShape[] = []
  for (const arm of data.value?.arms ?? []) {
    const nx = -arm.dir.y
    const ny = arm.dir.x
    const make = (index: number, incoming: boolean) => {
      // Въезд лежит слева, если смотреть от узла наружу: движение правостороннее
      const offset = (incoming ? 1 : -1) * (index + 0.5) * LANE_W
      const half = LANE_W / 2 - 1
      const at = (radius: number, shift: number) =>
        toSvg(arm.dir.x * radius + nx * (offset + shift), arm.dir.y * radius + ny * (offset + shift))
      const a = at(armStart.value, half)
      const b = at(ARM_END, half)
      const c = at(ARM_END, -half)
      const d = at(armStart.value, -half)
      const tipRadius = ARM_END - 30
      const baseRadius = tipRadius + (incoming ? 16 : -16)
      const headRadius = incoming ? tipRadius : baseRadius + 16
      const backRadius = incoming ? baseRadius : baseRadius
      const tip = at(headRadius, 0)
      const left = at(backRadius, 5)
      const right = at(backRadius, -5)
      result.push({
        arm,
        index,
        incoming,
        polygon: [a, b, c, d].map((p) => `${p.x},${p.y}`).join(' '),
        joint: at(armStart.value, 0),
        arrow: [tip, left, right].map((p) => `${p.x},${p.y}`).join(' '),
      })
    }
    for (let i = 0; i < arm.lanesIn; i++) make(i, true)
    for (let i = 0; i < arm.lanesOut; i++) make(i, false)
  }
  return result
})

function armName(arm: Arm): string {
  const name = editor.doc?.ways.get(arm.link.wayId)?.tags?.name
  const side = COMPASS[Math.round(bearing(arm.dir) / 45) % 8]
  return name ? `${name} (${side})` : `Подход ${side}`
}

const labels = computed(() =>
  (data.value?.arms ?? []).map((arm) => {
    const point = toSvg(arm.dir.x * (ARM_END + 8), arm.dir.y * (ARM_END + 8))
    return {
      key: arm.neighbor,
      x: point.x,
      y: point.y,
      anchor: arm.dir.x > 0.3 ? 'end' : arm.dir.x < -0.3 ? 'start' : 'middle',
      dy: arm.dir.y > 0.5 ? 12 : arm.dir.y < -0.5 ? -4 : -10,
      text: armName(arm),
    }
  }),
)

const KIND_COLORS: Record<string, string> = {
  left: COLORS.left,
  right: COLORS.right,
  through: '#0f9d8a',
  reverse: COLORS.reverse,
}

const selected = ref<{ neighbor: number; lane: number } | null>(null)

function laneShape(arm: Arm, index: number, incoming: boolean): LaneShape | undefined {
  return shapes.value.find((shape) => shape.arm === arm && shape.index === index && shape.incoming === incoming)
}

const curves = computed(() => {
  return (data.value?.connectors ?? []).flatMap((connector) => {
    const from = laneShape(connector.from, connector.fromLane, true)
    const to = laneShape(connector.to, connector.toLane, false)
    if (!from || !to) return []
    const active = selected.value?.neighbor === connector.from.neighbor && selected.value.lane === connector.fromLane
    return [
      {
        key: `${connector.from.neighbor}:${connector.fromLane}>${connector.to.neighbor}:${connector.toLane}`,
        path: `M ${from.joint.x} ${from.joint.y} Q ${CENTER} ${CENTER} ${to.joint.x} ${to.joint.y}`,
        color: KIND_COLORS[connector.kind] ?? '#888',
        active,
        dim: selected.value !== null && !active,
      },
    ]
  })
})

function isConnected(toNeighbor: number, toLane: number): boolean {
  const from = selected.value
  if (!from) return false
  return (data.value?.connectors ?? []).some(
    (c) => c.from.neighbor === from.neighbor && c.fromLane === from.lane && c.to.neighbor === toNeighbor && c.toLane === toLane,
  )
}

function clickLane(shape: LaneShape): void {
  if (shape.incoming) {
    const same = selected.value?.neighbor === shape.arm.neighbor && selected.value.lane === shape.index
    selected.value = same ? null : { neighbor: shape.arm.neighbor, lane: shape.index }
    return
  }
  const from = selected.value
  if (!from) {
    editor.toast('Сначала выберите полосу, с которой въезжают в узел')
    return
  }
  if (shape.arm.neighbor === from.neighbor) {
    editor.toast('Разворот на ту же дорогу здесь не настраивается')
    return
  }
  const enabled = !isConnected(shape.arm.neighbor, shape.index)
  editor.mutate(enabled ? 'Соединение полос' : 'Отключение соединения', (doc, projector) =>
    setLaneConnection(doc, projector, props.node, from.neighbor, from.lane, shape.arm.neighbor, shape.index, enabled),
  )
}

const hasManual = computed(() => {
  void editor.rev
  return editor.doc ? connectivityAt(editor.doc, props.node).length > 0 : false
})

function reset(): void {
  editor.mutate('Сброс соединений полос', (doc) => resetLaneConnections(doc, props.node))
  selected.value = null
}

function laneClass(shape: LaneShape): Record<string, boolean> {
  const isFrom = selected.value?.neighbor === shape.arm.neighbor && selected.value.lane === shape.index
  return {
    lane: true,
    incoming: shape.incoming,
    selected: shape.incoming && isFrom,
    connected: !shape.incoming && isConnected(shape.arm.neighbor, shape.index),
    target: !shape.incoming && selected.value !== null,
  }
}
</script>

<template>
  <div class="schematic">
    <svg :viewBox="`0 0 ${VIEW} ${VIEW}`" role="img" aria-label="Схема полос узла">
      <rect x="0" y="0" :width="VIEW" :height="VIEW" class="bg" />
      <g>
        <polygon
          v-for="shape in shapes"
          :key="`${shape.arm.neighbor}-${shape.incoming}-${shape.index}`"
          :points="shape.polygon"
          :class="laneClass(shape)"
          tabindex="0"
          role="button"
          :aria-label="`${armName(shape.arm)}, ${shape.incoming ? 'въезд' : 'выезд'}, полоса ${shape.index + 1}`"
          @click="clickLane(shape)"
          @keydown.enter="clickLane(shape)"
        />
      </g>
      <g pointer-events="none">
        <polygon v-for="shape in shapes" :key="`a-${shape.arm.neighbor}-${shape.incoming}-${shape.index}`" :points="shape.arrow" class="arrow" />
        <path
          v-for="curve in curves"
          :key="curve.key"
          :d="curve.path"
          fill="none"
          :stroke="curve.color"
          :stroke-width="curve.active ? 4 : 2.5"
          :opacity="curve.dim ? 0.18 : 0.95"
          stroke-linecap="round"
        />
        <text v-for="label in labels" :key="label.key" :x="label.x" :y="label.y" :dy="label.dy" :text-anchor="label.anchor" class="name">{{ label.text }}</text>
      </g>
    </svg>
    <div class="side">
      <p class="muted">
        <strong>1.</strong> Щёлкните полосу въезда.<br />
        <strong>2.</strong> Щёлкните полосу выезда, чтобы включить или отключить соединение.
      </p>
      <p class="muted">Так можно разрешить манёвр и с «неправильной» полосы, например поворот налево со второй полосы.</p>
      <div class="legend">
        <span><i :style="{ background: KIND_COLORS.through }" /> Прямо</span>
        <span><i :style="{ background: KIND_COLORS.left }" /> Налево</span>
        <span><i :style="{ background: KIND_COLORS.right }" /> Направо</span>
      </div>
      <button class="btn block" :disabled="!hasManual" @click="reset">
        <RotateCcw :size="13" aria-hidden="true" /> Вернуть автоматические соединения
      </button>
      <p class="faint note">
        Соединения пишутся в <code>turn:lanes</code> и в отношение <code>type=connectivity</code>. Симуляторы читают
        в первую очередь <code>turn:lanes</code>, поэтому точное назначение полосы может отличаться.
      </p>
    </div>
  </div>
</template>

<style scoped>
.schematic {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 230px;
  gap: 12px;
  min-height: 0;
}
svg {
  width: 100%;
  max-height: 560px;
  display: block;
}
.bg {
  fill: var(--inset);
}
.lane {
  fill: #868b94;
  stroke: #ffffff;
  stroke-width: 1;
  cursor: pointer;
}
.lane.incoming {
  fill: #6d727b;
}
.lane:hover {
  fill: #5c8fc6;
}
.lane:focus-visible {
  outline: none;
  stroke: var(--select);
  stroke-width: 2.5;
}
.lane.selected {
  fill: var(--accent);
}
.lane.target {
  fill: #a9adb5;
}
.lane.connected {
  fill: #0f9d8a;
}
.arrow {
  fill: rgba(255, 255, 255, 0.9);
}
.name {
  fill: var(--text);
  font-size: 12px;
  font-weight: 600;
  paint-order: stroke;
  stroke: var(--inset);
  stroke-width: 4px;
}
.side {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.side p {
  margin: 0;
}
.legend {
  display: flex;
  gap: 10px;
}
.legend span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.legend i {
  width: 14px;
  height: 3px;
}
.note {
  font-size: 11px;
}
code {
  font-size: 11px;
}
</style>
