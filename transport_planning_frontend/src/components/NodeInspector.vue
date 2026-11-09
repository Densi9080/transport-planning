<script setup lang="ts">
import { Footprints, Route, Scissors, TrafficCone, Trash2, Unlink } from 'lucide-vue-next'
import { computed } from 'vue'

import { bearing } from '@/core/geo'
import { moveNode, setMovementAllowed } from '@/core/ops'
import { type Arm, junctionMovements, type Movement } from '@/core/topology'
import type { ONode, Tags } from '@/core/types'
import { useEditor } from '@/stores/editor'

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

function toggleMovement(movement: Movement): void {
  editor.mutate(movement.allowed ? 'Запрет манёвра' : 'Разрешение манёвра', (doc, projector) => {
    setMovementAllowed(doc, projector, props.node.id, movement.from.neighbor, movement.to.neighbor, !movement.allowed)
  })
}

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

  <div v-if="groups.length" class="section">
    <div class="eyebrow">Разрешённые манёвры</div>
    <div v-for="group in groups" :key="`${group.arm.neighbor}`" class="movement-group">
      <div class="from">Из: {{ armName(group.arm) }}</div>
      <div class="chips">
        <button
          v-for="movement in group.movements"
          :key="movement.to.neighbor"
          class="chip"
          :class="[movement.kind, { off: !movement.allowed }]"
          :aria-pressed="movement.allowed"
          :title="`${armName(movement.to)}: ${movement.allowed ? 'разрешено, нажмите, чтобы запретить' : 'запрещено, нажмите, чтобы разрешить'}`"
          @click="toggleMovement(movement)"
        >
          {{ TURN_LABELS[movement.kind] }}
          <span class="to">{{ armName(movement.to) }}</span>
        </button>
      </div>
    </div>
    <p class="faint note">Запрет записывается отношением type=restriction. Дороги при этом разрезаются в узле, как требует OSM.</p>
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
  align-items: baseline;
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
