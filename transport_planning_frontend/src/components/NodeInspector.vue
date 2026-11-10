<script setup lang="ts">
import { Footprints, Route, Scissors, TrafficCone, Trash2, Unlink } from 'lucide-vue-next'
import { computed } from 'vue'

import { formatPosition } from '@/core/crs'
import { bearing } from '@/core/geo'
import { nodeConnectors, setMovementLanes } from '@/core/laneOps'
import { moveNode } from '@/core/ops'
import { type Arm, junctionMovements, type Movement } from '@/core/topology'
import { signApplies } from '@/core/traffic'
import type { ONode, Tags } from '@/core/types'
import { useEditor } from '@/stores/editor'

import JunctionPriorityCard from './JunctionPriorityCard.vue'
import SignalSummary from './SignalSummary.vue'
import TagTable from './TagTable.vue'

const props = defineProps<{ node: ONode }>()
const editor = useEditor()

const tags = computed<Tags>(() => props.node.tags ?? {})
const wayIds = computed(() => {
  void editor.rev
  return editor.doc?.waysOfNode(props.node.id) ?? []
})
const isSignal = computed(() => tags.value.highway === 'traffic_signals')
const isCrossing = computed(() => tags.value.highway === 'crossing')

const COMPASS = ['С', 'СВ', 'В', 'ЮВ', 'Ю', 'ЮЗ', 'З', 'СЗ']
const TURN_LABELS: Record<string, string> = {
  left: 'налево',
  through: 'прямо',
  right: 'направо',
  reverse: 'разворот',
}

function armName(arm: Arm): string {
  const name = editor.doc?.ways.get(arm.link.wayId)?.tags?.name
  const side = COMPASS[Math.round(bearing(arm.dir) / 45) % 8]
  return name ? `${name} (${side})` : `сторона ${side}`
}

const groups = computed(() => {
  const network = editor.network
  const doc = editor.doc
  if (!network || !doc) return []
  const arms = network.arms.get(props.node.id) ?? []
  if (arms.length < 2) return []
  const all = junctionMovements(doc, network, props.node.id)
  const byArm = new Map<Arm, Movement[]>()
  for (const movement of all) {
    const list = byArm.get(movement.from)
    if (list) list.push(movement)
    else byArm.set(movement.from, [movement])
  }
  return [...byArm.entries()].map(([arm, movements]) => ({ arm, movements }))
})

/** Соединения полос узла — те же, что рисуются на карте и в редакторе узла. */
const connectors = computed(() => {
  void editor.rev
  return editor.doc && editor.projector && wayIds.value.length > 1 ? nodeConnectors(editor.doc, editor.projector, props.node.id).connectors : []
})

function lanesOf(movement: Movement): number[] {
  return connectors.value
    .filter((c) => c.from.neighbor === movement.from.neighbor && c.to.neighbor === movement.to.neighbor)
    .map((c) => movement.from.lanesIn - c.fromLane)
    .sort((a, b) => a - b)
}

/** Полосы для человека: 1 — крайняя правая. */
function laneText(movement: Movement): string {
  const lanes = lanesOf(movement)
  if (!movement.allowed) return 'запрещён'
  if (lanes.length === 0) return movement.kind === 'reverse' ? 'не строится без соединения' : 'нет полосы по разметке'
  return lanes.length === 1 ? `полоса ${lanes[0]}` : `полосы ${lanes.join(', ')}`
}

function isOpen(movement: Movement): boolean {
  return movement.allowed && lanesOf(movement).length > 0
}

function toggleMovement(movement: Movement): void {
  const open = isOpen(movement)
  editor.mutate(open ? 'Запрет манёвра' : 'Разрешение манёвра', (doc, projector) => {
    setMovementLanes(doc, projector, props.node.id, movement.from.neighbor, movement.to.neighbor, !open)
  })
}

function showMovement(movement: Movement): void {
  editor.selectTurn(props.node.id, movement.from.neighbor, movement.to.neighbor)
}

const RANK: Record<string, number> = { motorway: 9, trunk: 8, primary: 7, secondary: 6, tertiary: 5, unclassified: 4, residential: 3, living_street: 2 }

/** Атрибуты узла как в Visum: вид регулирования и главная дорога. */
const control = computed(() => {
  void editor.rev
  const doc = editor.doc
  const arms = editor.network?.arms.get(props.node.id) ?? []
  if (!doc || arms.length < 3) return null
  const wayTags = (arm: Arm) => doc.ways.get(arm.link.wayId)?.tags ?? {}
  const ring = arms.some((arm) => wayTags(arm).junction === 'roundabout')
  const signed = arms.filter((arm) => {
    const ids = arm.atStart ? arm.link.nodes : [...arm.link.nodes].reverse()
    return ids.slice(1, 6).some((id) => signApplies(doc.nodes.get(id)?.tags, !arm.atStart))
  })
  const ranks = arms.map((arm) => RANK[(wayTags(arm).highway ?? '').replace(/_link$/, '')] ?? 0)
  const top = Math.max(...ranks)
  const main = arms.filter((_, i) => ranks[i] === top)
  const mainName = [...new Set(main.map((arm) => wayTags(arm).name).filter(Boolean))].join(', ')
  let kind: string
  if (isSignal.value) kind = 'Светофорное регулирование'
  else if (ring) kind = 'Круговое движение'
  else if (signed.length > 0) kind = `Знаки приоритета на подходах: ${signed.length}`
  else if (main.length === arms.length) kind = 'Равнозначный: правило правой руки (п. 13.11 ПДД)'
  else kind = 'Неравнозначный по классу дорог, знаков нет'
  return {
    kind,
    approaches: arms.length,
    lanesIn: arms.reduce((sum, arm) => sum + arm.lanesIn, 0),
    main: main.length < arms.length ? mainName || `класс ${wayTags(main[0]!).highway}` : null,
  }
})

function setCoordinate(key: 'lat' | 'lon', event: Event): void {
  const value = Number.parseFloat((event.target as HTMLInputElement).value)
  if (!Number.isFinite(value)) {
    editor.toast('Координата должна быть числом', 'error')
    return
  }
  editor.mutate('Координаты узла', (doc) => {
    moveNode(doc, props.node.id, { lat: props.node.lat, lon: props.node.lon, [key]: value })
  })
}
</script>

<template>
  <div class="section">
    <div class="row">
      <h2>{{ wayIds.length > 1 ? 'Перекрёсток' : 'Узел' }}</h2>
      <span class="spacer" />
      <span class="faint id">#{{ node.id }}</span>
    </div>
    <p class="muted info">Дорог через узел: {{ wayIds.length }}</p>
    <div class="grid-2">
      <div class="field">
        <label for="node-lat">Широта</label>
        <input id="node-lat" class="input" :value="node.lat.toFixed(7)" @change="setCoordinate('lat', $event)" />
      </div>
      <div class="field">
        <label for="node-lon">Долгота</label>
        <input id="node-lon" class="input" :value="node.lon.toFixed(7)" @change="setCoordinate('lon', $event)" />
      </div>
    </div>
    <p v-if="editor.crs !== 'EPSG:4326'" class="muted info">{{ formatPosition(node, editor.crs, editor.projector) }}</p>
  </div>

  <div class="section">
    <button class="btn primary block" :disabled="wayIds.length < 2" @click="editor.openJunction(node.id)">
      <Route :size="13" aria-hidden="true" /> Редактор узла: полосы и фазы <kbd>E</kbd>
    </button>
    <div class="grid-2">
      <button class="btn small" :class="{ on: isSignal }" :aria-pressed="isSignal" @click="editor.toggleOnNode('signal', { nodeId: node.id, position: node })">
        <TrafficCone :size="13" aria-hidden="true" /> Светофор
      </button>
      <button class="btn small" :class="{ on: isCrossing }" :aria-pressed="isCrossing" @click="editor.toggleOnNode('crossing', { nodeId: node.id, position: node })">
        <Footprints :size="13" aria-hidden="true" /> Переход
      </button>
      <button class="btn small" :disabled="wayIds.length === 0" @click="editor.splitAtNode(node.id)">
        <Scissors :size="13" aria-hidden="true" /> Разрезать
      </button>
      <button class="btn small" :disabled="wayIds.length < 2" @click="editor.unglueSelected">
        <Unlink :size="13" aria-hidden="true" /> Расклеить
      </button>
    </div>
    <button class="btn small block danger" @click="editor.deleteSelection">
      <Trash2 :size="13" aria-hidden="true" /> Удалить узел
    </button>
  </div>

  <SignalSummary v-if="isSignal" :node="node.id" />

  <div v-if="control" class="section">
    <div class="eyebrow">Атрибуты узла</div>
    <dl class="attrs">
      <div><dt>Регулирование</dt><dd>{{ control.kind }}</dd></div>
      <div><dt>Подходов</dt><dd>{{ control.approaches }}</dd></div>
      <div><dt>Полос на въездах</dt><dd>{{ control.lanesIn }}</dd></div>
      <div v-if="control.main"><dt>Главная по классу</dt><dd>{{ control.main }}</dd></div>
    </dl>
  </div>

  <JunctionPriorityCard v-if="control" :key="`priority${node.id}`" :node="node.id" />

  <div v-if="groups.length" class="section">
    <div class="eyebrow">Разрешённые манёвры</div>
    <div v-for="group in groups" :key="`${group.arm.neighbor}`" class="movement-group">
      <div class="from">Из: {{ armName(group.arm) }}</div>
      <div class="chips">
        <div v-for="movement in group.movements" :key="movement.to.neighbor" class="chip" :class="[movement.kind, { off: !isOpen(movement) }]">
          <input
            type="checkbox"
            :checked="isOpen(movement)"
            :aria-label="`${TURN_LABELS[movement.kind]} на ${armName(movement.to)}: разрешён`"
            @change="toggleMovement(movement)"
          />
          <button class="show" title="Показать манёвр на карте" @click="showMovement(movement)">
            {{ TURN_LABELS[movement.kind] }}
            <span class="to">{{ armName(movement.to) }}</span>
          </button>
          <span class="lanes">{{ laneText(movement) }}</span>
        </div>
      </div>
    </div>
    <p class="faint note">Полоса 1 — крайняя правая. Без разметки действуют ПДД: направо с крайней правой, налево с крайней левой, прямо со всех. Запрет пишется отношением type=restriction, соединения полос — type=connectivity.</p>
  </div>

  <div class="section">
    <div class="eyebrow">Теги</div>
    <TagTable :tags="tags" @change="editor.updateNodeTags(node.id, $event)" />
  </div>
</template>

<style scoped>
h2 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}
.id {
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
.info {
  margin: 0;
}
.btn.on {
  border-color: var(--accent);
  background: var(--accent-soft);
}
.movement-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.from {
  font-size: 12px;
  font-weight: 600;
}
.chips {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.chip {
  display: flex;
  gap: 6px;
  align-items: center;
  padding: 4px 8px;
  background: rgba(45, 212, 191, 0.12);
  border: 1px solid rgba(45, 212, 191, 0.4);
  border-radius: 5px;
  font-size: 12px;
  text-align: left;
}
.chip.left {
  background: rgba(245, 158, 11, 0.12);
  border-color: rgba(245, 158, 11, 0.45);
}
.chip.right {
  background: rgba(59, 130, 246, 0.14);
  border-color: rgba(59, 130, 246, 0.5);
}
.chip.reverse {
  background: rgba(168, 85, 247, 0.12);
  border-color: rgba(168, 85, 247, 0.45);
}
.chip .show {
  flex: 1;
  display: flex;
  gap: 6px;
  align-items: baseline;
  min-width: 0;
  padding: 0;
  background: transparent;
  border: 0;
  text-align: left;
}
.chip .lanes {
  flex: none;
  color: var(--muted);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
.attrs {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  font-size: 12px;
}
.attrs > div {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}
.attrs dt {
  color: var(--muted);
}
.attrs dd {
  margin: 0;
  text-align: right;
}
.chip.off {
  background: rgba(239, 68, 68, 0.08);
  border-color: rgba(239, 68, 68, 0.4);
  color: var(--faint);
  text-decoration: line-through;
}
.to {
  color: var(--muted);
  font-size: 11px;
}
.note {
  margin: 0;
  font-size: 12px;
}
</style>
