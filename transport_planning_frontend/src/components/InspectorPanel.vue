<script setup lang="ts">
import { Combine, Merge, Spline, Trash2 } from 'lucide-vue-next'
import { computed } from 'vue'

import { useEditor } from '@/stores/editor'

import NodeInspector from './NodeInspector.vue'
import RoadPresets from './RoadPresets.vue'
import WayInspector from './WayInspector.vue'

const editor = useEditor()

const ways = computed(() => editor.selectedWays)
const nodes = computed(() => editor.selectedNodes)
const isSingleWay = computed(() => ways.value.length === 1 && nodes.value.length === 0)
const isSingleNode = computed(() => nodes.value.length === 1 && ways.value.length === 0)
const isMulti = computed(() => ways.value.length + nodes.value.length > 1)
</script>

<template>
  <aside class="inspector panel" aria-label="Инспектор">
    <RoadPresets v-if="editor.tool === 'road'" />
    <WayInspector v-else-if="isSingleWay" :key="ways[0]!.id" :way="ways[0]!" />
    <NodeInspector v-else-if="isSingleNode" :key="nodes[0]!.id" :node="nodes[0]!" />
    <div v-else-if="isMulti" class="section">
      <h2>Выбрано объектов: {{ ways.length + nodes.length }}</h2>
      <p class="muted">Дорог: {{ ways.length }}, узлов: {{ nodes.length }}</p>
      <button v-if="nodes.length >= 2" class="btn block" @click="editor.mergeSelected">
        <Merge :size="14" aria-hidden="true" /> Склеить узлы <kbd>M</kbd>
      </button>
      <button v-if="ways.length === 2" class="btn block" @click="editor.joinSelected">
        <Combine :size="14" aria-hidden="true" /> Объединить дороги <kbd>J</kbd>
      </button>
      <button v-if="ways.length >= 1" class="btn block" @click="editor.reverseSelected">
        <Spline :size="14" aria-hidden="true" /> Развернуть направление <kbd>F</kbd>
      </button>
      <button class="btn block danger" @click="editor.deleteSelection">
        <Trash2 :size="14" aria-hidden="true" /> Удалить <kbd>Del</kbd>
      </button>
    </div>
    <div v-else class="empty">
      <h2>Ничего не выбрано</h2>
      <p class="muted">Нажмите на дорогу или перекрёсток, чтобы увидеть и изменить их свойства.</p>
      <p class="muted">Чтобы добавить дорогу, включите инструмент «Дорога» или нажмите <kbd>D</kbd>.</p>
    </div>
  </aside>
</template>

<style scoped>
.inspector {
  position: absolute;
  top: 58px;
  right: 8px;
  bottom: 54px;
  width: min(320px, calc(100vw - 16px));
  overflow-y: auto;
  z-index: 11;
}
h2 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}
.empty {
  padding: 14px 12px;
}
.empty p {
  margin: 8px 0 0;
}
kbd {
  margin-left: auto;
}
</style>
