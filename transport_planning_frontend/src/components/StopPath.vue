<script setup lang="ts">
import { ChevronRight } from 'lucide-vue-next'
import { computed } from 'vue'

import { parseAreaKey } from '@/core/stops'
import { useEditor } from '@/stores/editor'

/** Положение объекта в иерархии: Остановка › Зона › Пункт. Каждый уровень открывается щелчком. */
const props = defineProps<{ point?: number; area?: string }>()
const editor = useEditor()

const areaKey = computed(() => props.area ?? (props.point !== undefined ? (editor.stopHierarchy?.points.get(props.point)?.area ?? null) : null))
const area = computed(() => (areaKey.value ? (editor.stopHierarchy?.areas.get(areaKey.value) ?? null) : null))
const stop = computed(() => (area.value?.stop != null ? (editor.stopHierarchy?.stops.get(area.value.stop) ?? null) : null))

function openArea(): void {
  const ref = parseAreaKey(areaKey.value ?? '')
  if (ref) editor.selectOne({ kind: ref.kind, id: ref.id })
}
</script>

<template>
  <nav class="path" aria-label="Положение в иерархии остановки">
    <button v-if="stop" class="link" @click="editor.focusStop(stop.id)">{{ stop.name }}</button>
    <span v-else class="faint">без остановки</span>
    <template v-if="point !== undefined">
      <ChevronRight :size="11" aria-hidden="true" />
      <button v-if="area" class="link" @click="openArea">{{ area.name }}</button>
      <span v-else class="faint">без зоны</span>
    </template>
    <ChevronRight :size="11" aria-hidden="true" />
    <span>{{ point !== undefined ? 'пункт' : 'зона' }}</span>
  </nav>
</template>

<style scoped>
.path {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 2px;
  margin-bottom: 6px;
  font-size: 11px;
  color: var(--muted);
}
.link {
  padding: 0;
  background: transparent;
  border: 0;
  color: var(--accent);
  cursor: pointer;
}
</style>
