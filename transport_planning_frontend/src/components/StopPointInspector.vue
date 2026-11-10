<script setup lang="ts">
import { Trash2 } from 'lucide-vue-next'
import { computed } from 'vue'

import { linesAtPoint, nearAreas, STOP_AREA_TAG } from '@/core/stops'
import { TRANSIT_MODE_LABELS } from '@/core/transit'
import type { ONode } from '@/core/types'
import { useEditor } from '@/stores/editor'

import StopPath from './StopPath.vue'

const props = defineProps<{ node: ONode }>()
const editor = useEditor()
const SEARCH_REACH_M = 300
const SYSTEMS = ['bus', 'trolleybus', 'tram', 'share_taxi'] as const

const info = computed(() => editor.stopHierarchy?.points.get(props.node.id) ?? null)
const area = computed(() => (info.value?.area ? (editor.stopHierarchy?.areas.get(info.value.area) ?? null) : null))
const options = computed(() =>
  editor.stopHierarchy && editor.projector ? nearAreas(editor.stopHierarchy, editor.projector, props.node, SEARCH_REACH_M) : [],
)
const lines = computed(() => {
  void editor.rev
  return editor.doc ? linesAtPoint(editor.doc, props.node.id) : []
})

function setTag(key: string, value: string | null): void {
  const tags = { ...(props.node.tags ?? {}) }
  if (value) tags[key] = value
  else delete tags[key]
  editor.updateNodeTags(props.node.id, tags, 'Пункт остановки')
}

function chooseArea(event: Event): void {
  const value = (event.target as HTMLSelectElement).value
  editor.setPointArea(props.node.id, value || null)
}
</script>

<template>
  <div class="section">
    <h2>Пункт остановки</h2>
    <StopPath :point="node.id" />
    <div class="field">
      <label for="point-name">Название</label>
      <input id="point-name" class="input" :value="node.tags?.name ?? ''" @change="setTag('name', ($event.target as HTMLInputElement).value.trim() || null)" />
    </div>
    <div class="field">
      <label for="point-area">Зона остановки</label>
      <select id="point-area" class="input" :value="node.tags?.[STOP_AREA_TAG] ?? ''" @change="chooseArea">
        <option value="">Автоматически{{ area && !info?.explicit ? `: ${area.name}` : '' }}</option>
        <option v-for="item in options" :key="item.area.key" :value="item.area.key">{{ item.area.name }}, {{ Math.round(item.distanceM) }} м</option>
      </select>
    </div>
    <p v-if="!area" class="bad">Пункт не входит ни в одну зону. В Visum пункт всегда принадлежит зоне: поставьте зону рядом или выберите её здесь.</p>
    <div class="field">
      <span class="label">Виды транспорта, которые здесь останавливаются</span>
      <div class="systems">
        <label v-for="system in SYSTEMS" :key="system" class="check">
          <input type="checkbox" :checked="node.tags?.[system] === 'yes'" @change="setTag(system, ($event.target as HTMLInputElement).checked ? 'yes' : null)" />
          {{ TRANSIT_MODE_LABELS[system] }}
        </label>
      </div>
    </div>
    <div class="field">
      <span class="label">Маршруты через пункт: {{ lines.length }}</span>
      <div class="chips">
        <button v-for="line in lines" :key="line.id" class="chip" :title="line.tags?.name" @click="editor.focusLine(line.id)">{{ line.tags?.ref ?? line.id }}</button>
      </div>
    </div>
    <p class="muted note">Пункт стоит на дороге: из трёх уровней остановки только он связан с сетью.</p>
    <button class="btn block" @click="editor.requestDeleteSelection"><Trash2 :size="13" aria-hidden="true" /> Удалить пункт</button>
  </div>
</template>

<style scoped>
.label {
  color: var(--muted);
  font-size: 12px;
}
.systems,
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 10px;
}
.chips {
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
