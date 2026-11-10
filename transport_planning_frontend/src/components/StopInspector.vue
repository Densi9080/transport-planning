<script setup lang="ts">
import { Trash2, X } from 'lucide-vue-next'
import { computed } from 'vue'

import { linesAtPoint, parseAreaKey } from '@/core/stops'
import { useEditor } from '@/stores/editor'

/** Остановка — верхний уровень иерархии Visum: название и весь комплекс зон и пунктов. */
const editor = useEditor()
const stop = computed(() => editor.selectedStop)
const hierarchy = computed(() => editor.stopHierarchy)

const tree = computed(() =>
  (stop.value?.areas ?? []).map((key) => {
    const area = hierarchy.value!.areas.get(key)!
    return { area, points: area.points.map((id) => ({ id, name: editor.doc?.nodes.get(id)?.tags?.name ?? `Пункт ${id}` })) }
  }),
)
const loosePoints = computed(() => {
  const inAreas = new Set(tree.value.flatMap((item) => item.points.map((p) => p.id)))
  return (stop.value?.points ?? []).filter((id) => !inAreas.has(id))
})

/** Расстояние между зонами по прямой: от него зависит время пешей пересадки. */
const walk = computed(() => {
  const projector = editor.projector
  if (!projector) return []
  const areas = tree.value.map((item) => item.area)
  return areas.map((a) => areas.map((b) => {
    const pa = projector.toXY(a.position)
    const pb = projector.toXY(b.position)
    return Math.round(Math.hypot(pa.x - pb.x, pa.y - pb.y))
  }))
})

const lines = computed(() => {
  void editor.rev
  const seen = new Map<number, { id: number; ref: string; name?: string }>()
  for (const point of stop.value?.points ?? []) {
    for (const line of linesAtPoint(editor.doc!, point)) seen.set(line.id, { id: line.id, ref: line.tags?.ref ?? String(line.id), name: line.tags?.name })
  }
  return [...seen.values()]
})

function openArea(key: string): void {
  const ref = parseAreaKey(key)
  if (ref) editor.selectOne({ kind: ref.kind, id: ref.id })
}

function rename(event: Event): void {
  if (!stop.value) return
  const value = (event.target as HTMLInputElement).value.trim()
  if (value) editor.renameStop(stop.value.id, value)
}

function remove(): void {
  if (!stop.value) return
  const name = stop.value.name
  editor.deleteStop(stop.value.id)
  editor.toast(`Остановка «${name}» удалена, зоны и пункты остались. Вернуть: Ctrl+Z`)
}
</script>

<template>
  <div v-if="stop" class="section">
    <div class="row">
      <h2>Остановка</h2>
      <span class="spacer" />
      <button class="btn ghost small" aria-label="Снять выбор остановки" @click="editor.selectStop(null)"><X :size="12" /></button>
    </div>
    <div class="field">
      <label for="stop-name">Название</label>
      <input id="stop-name" class="input" :value="stop.name" @change="rename" />
    </div>

    <div class="field">
      <span class="label">Зоны: {{ tree.length }}, пунктов: {{ stop.points.length }}</span>
      <ul class="tree">
        <li v-for="item in tree" :key="item.area.key">
          <button class="link" @click="openArea(item.area.key)">{{ item.area.name }}</button>
          <ul>
            <li v-for="point in item.points" :key="point.id"><button class="link" @click="editor.focusNode(point.id)">{{ point.name }}</button></li>
            <li v-if="item.points.length === 0" class="bad">нет пунктов</li>
          </ul>
        </li>
        <li v-for="id in loosePoints" :key="`p${id}`" class="bad">
          <button class="link" @click="editor.focusNode(id)">Пункт {{ id }}</button> без зоны
        </li>
      </ul>
      <p v-if="stop.points.length === 0" class="bad">У остановки нет ни одного пункта: транспорт здесь не встаёт.</p>
    </div>

    <div v-if="tree.length > 1" class="field">
      <span class="label">Расстояние между зонами, м</span>
      <table class="matrix">
        <thead><tr><th /><th v-for="(item, i) in tree" :key="item.area.key" :title="item.area.name">{{ i + 1 }}</th></tr></thead>
        <tbody>
          <tr v-for="(row, i) in walk" :key="i">
            <th :title="tree[i]!.area.name">{{ i + 1 }}</th>
            <td v-for="(value, j) in row" :key="j">{{ i === j ? '—' : value }}</td>
          </tr>
        </tbody>
      </table>
      <p class="muted note">По прямой между зонами. Время пересадки в Visum задаётся на остановке по этим парам.</p>
    </div>

    <div class="field">
      <span class="label">Маршруты: {{ lines.length }}</span>
      <div class="chips">
        <button v-for="line in lines" :key="line.id" class="chip" :title="line.name" @click="editor.focusLine(line.id)">{{ line.ref }}</button>
      </div>
    </div>
    <button class="btn block" @click="remove"><Trash2 :size="13" aria-hidden="true" /> Удалить остановку</button>
  </div>
</template>

<style scoped>
.label {
  color: var(--muted);
  font-size: 12px;
}
.tree,
.tree ul {
  margin: 0;
  padding-left: 14px;
  font-size: 12px;
}
.tree {
  padding-left: 2px;
  list-style: none;
}
.link {
  padding: 0;
  background: transparent;
  border: 0;
  color: var(--accent);
  cursor: pointer;
  text-align: left;
}
.matrix {
  border-collapse: collapse;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
.matrix th,
.matrix td {
  padding: 1px 6px;
  border: 1px solid var(--line);
  text-align: right;
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
