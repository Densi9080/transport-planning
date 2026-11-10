<script setup lang="ts">
import { Plus, Trash2 } from 'lucide-vue-next'
import { computed, ref } from 'vue'

import { areaKey, linesAtPoint, nearStops } from '@/core/stops'
import { useEditor } from '@/stores/editor'

import StopPath from './StopPath.vue'

/** Зона остановки: платформа или сторона улицы. Объединяет пункты и входит в одну остановку. */
const props = defineProps<{ kind: 'node' | 'way'; id: number }>()
const editor = useEditor()
const STOP_REACH_M = 400
const POINT_REACH_M = 150

const key = computed(() => areaKey(props.kind, props.id))
const area = computed(() => editor.stopHierarchy?.areas.get(key.value) ?? null)
const tags = computed(() => {
  void editor.rev
  return (props.kind === 'node' ? editor.doc?.nodes.get(props.id)?.tags : editor.doc?.ways.get(props.id)?.tags) ?? {}
})
const stopOptions = computed(() =>
  editor.stopHierarchy && editor.projector && area.value ? nearStops(editor.stopHierarchy, editor.projector, area.value.position, STOP_REACH_M) : [],
)
const points = computed(() => (area.value?.points ?? []).map((id) => ({ id, info: editor.stopHierarchy!.points.get(id)!, node: editor.doc!.node(id) })))
const candidates = computed(() => {
  const hierarchy = editor.stopHierarchy
  const projector = editor.projector
  if (!hierarchy || !projector || !area.value) return []
  const origin = projector.toXY(area.value.position)
  return [...hierarchy.points.values()]
    .filter((point) => point.area !== key.value)
    .map((point) => {
      const at = projector.toXY(point.node)
      return { point, distanceM: Math.hypot(at.x - origin.x, at.y - origin.y) }
    })
    .filter((item) => item.distanceM <= POINT_REACH_M)
    .sort((a, b) => a.distanceM - b.distanceM)
})
const lines = computed(() => {
  void editor.rev
  const seen = new Map<number, { id: number; ref: string; name?: string }>()
  for (const point of area.value?.points ?? []) {
    for (const line of linesAtPoint(editor.doc!, point)) seen.set(line.id, { id: line.id, ref: line.tags?.ref ?? String(line.id), name: line.tags?.name })
  }
  return [...seen.values()]
})
const newStopName = ref('')
const adding = ref('')

function setName(value: string): void {
  const next = { ...tags.value }
  if (value) next.name = value
  else delete next.name
  if (props.kind === 'node') editor.updateNodeTags(props.id, next, 'Название зоны')
  else editor.updateWayTags(props.id, next, 'Название зоны')
}

function chooseStop(event: Event): void {
  const value = (event.target as HTMLSelectElement).value
  editor.setAreaStop(key.value, value ? Number(value) : null)
}

function addPoint(): void {
  if (!adding.value) return
  editor.setPointArea(Number(adding.value), key.value)
  adding.value = ''
}

function pointName(id: number): string {
  return editor.doc?.nodes.get(id)?.tags?.name ?? `Пункт ${id}`
}
</script>

<template>
  <div v-if="area" class="section">
    <h2>Зона остановки</h2>
    <StopPath :area="key" />
    <div class="field">
      <label for="area-name">Название</label>
      <input id="area-name" class="input" :value="tags.name ?? ''" @change="setName(($event.target as HTMLInputElement).value.trim())" />
    </div>
    <div class="field">
      <label for="area-stop">Остановка</label>
      <select id="area-stop" class="input" :value="area.stop ?? ''" @change="chooseStop">
        <option value="">Не входит в остановку</option>
        <option v-for="item in stopOptions" :key="item.stop.id" :value="item.stop.id">{{ item.stop.name }}, {{ Math.round(item.distanceM) }} м</option>
      </select>
    </div>
    <div v-if="area.stop === null" class="create">
      <input v-model="newStopName" class="input" :placeholder="area.name" aria-label="Название новой остановки" />
      <button class="btn small" @click="editor.createStopFromArea(key, newStopName)"><Plus :size="12" aria-hidden="true" /> Новая остановка</button>
    </div>

    <div class="field">
      <span class="label">Пункты остановки в зоне: {{ points.length }}</span>
      <div v-for="item in points" :key="item.id" class="member">
        <button class="link ellipsis" @click="editor.focusNode(item.id)">{{ pointName(item.id) }}</button>
        <span class="faint">{{ item.info.explicit ? 'задан' : 'по расстоянию' }}</span>
      </div>
      <p v-if="points.length === 0" class="bad">В зоне нет пунктов: транспорт здесь не останавливается.</p>
      <div v-if="candidates.length" class="create">
        <select v-model="adding" class="input" aria-label="Пункт, который войдёт в зону">
          <option value="">Добавить пункт рядом…</option>
          <option v-for="item in candidates" :key="item.point.node.id" :value="String(item.point.node.id)">{{ pointName(item.point.node.id) }}, {{ Math.round(item.distanceM) }} м</option>
        </select>
        <button class="btn small" :disabled="!adding" @click="addPoint"><Plus :size="12" aria-hidden="true" /></button>
      </div>
    </div>
    <div class="field">
      <span class="label">Маршруты через зону: {{ lines.length }}</span>
      <div class="chips">
        <button v-for="line in lines" :key="line.id" class="chip" :title="line.name" @click="editor.focusLine(line.id)">{{ line.ref }}</button>
      </div>
    </div>
    <p class="muted note">Зона объединяет соседние пункты и даёт к ним подход пешеходам. Пересадки считаются между зонами одной остановки.</p>
    <button class="btn block" @click="editor.requestDeleteSelection"><Trash2 :size="13" aria-hidden="true" /> Удалить зону</button>
  </div>
</template>

<style scoped>
.label {
  color: var(--muted);
  font-size: 12px;
}
.create {
  display: flex;
  gap: 4px;
}
.create .input {
  flex: 1;
  min-width: 0;
}
.member {
  display: flex;
  justify-content: space-between;
  gap: 6px;
  font-size: 12px;
}
.link {
  padding: 0;
  background: transparent;
  border: 0;
  color: var(--accent);
  cursor: pointer;
  text-align: left;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.chip {
  min-width: 28px;
  padding: 0 5px;
  background: var(--raised);
  border: 1px solid var(--line-strong);
  border-radius: 2px;
  font-size: 11px;
  font-weight: 600;
}
.bad {
  color: var(--err-text);
}
.note {
  font-size: 11px;
}
</style>
