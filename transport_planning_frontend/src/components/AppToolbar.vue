<script setup lang="ts">
import {
  Box,
  BusFront,
  CarFront,
  Circle,
  Download,
  Footprints,
  Gauge,
  Landmark,
  MapPinPlus,
  Maximize,
  MousePointer2,
  Network,
  OctagonAlert,
  PanelBottom,
  PanelLeft,
  PanelRight,
  Pause,
  PencilRuler,
  Play,
  Redo2,
  Route,
  Scissors,
  Sparkles,
  TrafficCone,
  TrainFrontTunnel,
  Undo2,
  Waves,
} from 'lucide-vue-next'

import { type Tool, useEditor, type ViewMode } from '@/stores/editor'
import { useSimulation } from '@/stores/simulation'

const editor = useEditor()
const sim = useSimulation()

const tools: { id: Tool; label: string; key: string; icon: typeof Circle }[] = [
  { id: 'select', label: 'Выбор', key: 'V', icon: MousePointer2 },
  { id: 'road', label: 'Новая дорога', key: 'D', icon: Route },
  { id: 'node', label: 'Новый узел', key: 'N', icon: Circle },
  { id: 'split', label: 'Разрезать дорогу', key: 'X', icon: Scissors },
  { id: 'signal', label: 'Светофор', key: 'T', icon: TrafficCone },
  { id: 'crossing', label: 'Пешеходный переход', key: 'C', icon: Footprints },
  { id: 'speed', label: 'Участок сниженной скорости', key: 'S', icon: Gauge },
  { id: 'bump', label: 'Лежачий полицейский', key: 'L', icon: Waves },
  { id: 'sign', label: 'Знак приоритета', key: 'P', icon: OctagonAlert },
  { id: 'bridge', label: 'Мост', key: 'B', icon: Landmark },
  { id: 'tunnel', label: 'Тоннель', key: 'G', icon: TrainFrontTunnel },
]

const modes: { id: ViewMode; label: string; icon: typeof Box }[] = [
  { id: 'engineering', label: 'Инженерия', icon: PencilRuler },
  { id: 'graph', label: 'Граф', icon: Network },
  { id: '3d', label: '3D', icon: Box },
  { id: 'sim', label: 'Симуляция', icon: CarFront },
]

function toggleAssistant(): void {
  if (editor.inspectorOpen && editor.rightTab === 'assistant') {
    editor.rightTab = 'quick'
    return
  }
  editor.inspectorOpen = true
  editor.rightTab = 'assistant'
}

function chooseLineTool(tool: 'lineWay' | 'lineStop'): void {
  editor.navigatorOpen = true
  editor.leftTab = 'transit'
  if (editor.selectedLineId === null) {
    editor.toast('Выберите маршрут в окне «Линии ОТ» или создайте новый')
    return
  }
  editor.setTool(tool)
}
</script>

<template>
  <div class="toolbar" role="toolbar" aria-label="Панель инструментов">
    <button class="tool" title="Отменить (Ctrl+Z)" aria-label="Отменить" :disabled="!editor.canUndo" @click="editor.undo"><Undo2 :size="15" /></button>
    <button class="tool" title="Повторить (Ctrl+Y)" aria-label="Повторить" :disabled="!editor.canRedo" @click="editor.redo"><Redo2 :size="15" /></button>
    <span class="sep" />

    <template v-if="editor.viewMode !== 'sim'">
      <button
        v-for="tool in tools"
        :key="tool.id"
        class="tool"
        :class="{ active: editor.tool === tool.id }"
        :aria-pressed="editor.tool === tool.id"
        :aria-label="tool.label"
        :title="`${tool.label} (${tool.key})`"
        @click="editor.setTool(tool.id)"
      >
        <component :is="tool.icon" :size="15" />
      </button>
      <span class="sep" />
      <button class="tool" :class="{ active: editor.tool === 'lineWay' }" title="Добавлять дороги в маршрут ОТ" aria-label="Добавлять дороги в маршрут ОТ" @click="chooseLineTool('lineWay')"><BusFront :size="15" /></button>
      <button class="tool" :class="{ active: editor.tool === 'lineStop' }" title="Добавлять остановки в маршрут ОТ" aria-label="Добавлять остановки в маршрут ОТ" @click="chooseLineTool('lineStop')"><MapPinPlus :size="15" /></button>
      <span class="sep" />
    </template>

    <template v-else>
      <button class="btn small" :class="{ primary: !sim.running }" :disabled="sim.level !== 'micro'" @click="sim.togglePlay">
        <Pause v-if="sim.running" :size="13" aria-hidden="true" />
        <Play v-else :size="13" aria-hidden="true" />
        {{ sim.running ? 'Пауза' : 'Запуск' }}
      </button>
      <span class="sep" />
    </template>

    <button class="tool" title="Показать весь участок (H)" aria-label="Показать весь участок" @click="editor.fitRev++"><Maximize :size="15" /></button>
    <span class="sep" />

    <div class="segmented modes" role="group" aria-label="Режим просмотра">
      <button
        v-for="mode in modes"
        :key="mode.id"
        :class="{ active: editor.viewMode === mode.id }"
        :aria-pressed="editor.viewMode === mode.id"
        @click="editor.viewMode = mode.id"
      >
        <component :is="mode.icon" :size="13" aria-hidden="true" />
        {{ mode.label }}
      </button>
    </div>

    <span class="spacer" />

    <button
      class="tool"
      :class="{ active: editor.inspectorOpen && editor.rightTab === 'assistant' }"
      title="Помощник"
      aria-label="Помощник"
      @click="toggleAssistant"
    >
      <Sparkles :size="15" />
    </button>
    <span class="sep" />
    <button class="tool" :class="{ active: editor.navigatorOpen }" :aria-pressed="editor.navigatorOpen" title="Окно «Сеть»" aria-label="Окно «Сеть»" @click="editor.navigatorOpen = !editor.navigatorOpen"><PanelLeft :size="15" /></button>
    <button class="tool" :class="{ active: editor.listOpen }" :aria-pressed="editor.listOpen" title="Списки" aria-label="Списки" @click="editor.listOpen = !editor.listOpen"><PanelBottom :size="15" /></button>
    <button class="tool" :class="{ active: editor.inspectorOpen }" :aria-pressed="editor.inspectorOpen" title="Быстрый просмотр" aria-label="Быстрый просмотр" @click="editor.inspectorOpen = !editor.inspectorOpen"><PanelRight :size="15" /></button>
    <span class="sep" />
    <button class="btn small primary" @click="editor.exportOpen = true">
      <Download :size="13" aria-hidden="true" />
      Экспорт .osm
    </button>
  </div>
</template>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  gap: 2px;
  min-height: 31px;
  padding: 2px 5px;
  background: linear-gradient(var(--panel), var(--titlebar));
  border-bottom: 1px solid var(--line-strong);
  overflow-x: auto;
}
.tool {
  display: grid;
  place-items: center;
  flex: none;
  width: 26px;
  height: 25px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 2px;
}
.tool:hover:not(:disabled) {
  background: var(--row-hover);
  border-color: var(--line-strong);
}
.tool.active {
  background: var(--row-selected);
  border-color: var(--accent);
}
.sep {
  flex: none;
  width: 1px;
  height: 20px;
  margin: 0 4px;
  background: var(--line-strong);
}
.modes {
  flex: none;
}
</style>
