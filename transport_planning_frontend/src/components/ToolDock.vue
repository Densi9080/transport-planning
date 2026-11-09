<script setup lang="ts">
import { Circle, Footprints, Gauge, Landmark, MousePointer2, OctagonAlert, Route, Scissors, TrafficCone, TrainFrontTunnel, Waves } from 'lucide-vue-next'
import { computed } from 'vue'

import { type Tool, useEditor } from '@/stores/editor'

import TrafficOptions from './TrafficOptions.vue'

const editor = useEditor()

const tools: { id: Tool; label: string; key: string; icon: typeof Circle; hint: string }[] = [
  { id: 'select', label: 'Выбор', key: 'V', icon: MousePointer2, hint: 'Клик выбирает объект, Shift добавляет к выбору. Выбранную дорогу правьте за точки: их можно тянуть' },
  { id: 'road', label: 'Дорога', key: 'D', icon: Route, hint: 'Клики ставят точки и прилипают к дорогам. Enter или двойной клик завершает, Shift фиксирует угол, Alt отключает прилипание' },
  { id: 'node', label: 'Узел', key: 'N', icon: Circle, hint: 'Клик по дороге вставляет узел, клик по пустому месту создаёт отдельный' },
  { id: 'split', label: 'Разрез', key: 'X', icon: Scissors, hint: 'Клик по дороге или узлу разрезает дорогу на две' },
  { id: 'signal', label: 'Светофор', key: 'T', icon: TrafficCone, hint: 'Клик по узлу или дороге ставит или снимает светофор' },
  { id: 'crossing', label: 'Переход', key: 'C', icon: Footprints, hint: 'Клик по узлу или дороге ставит или снимает пешеходный переход' },
  { id: 'speed', label: 'Скорость', key: 'S', icon: Gauge, hint: 'Два клика по одной дороге задают участок сниженной скорости. Esc отменяет начало' },
  { id: 'bump', label: 'Лежачий', key: 'L', icon: Waves, hint: 'Клик по дороге ставит лежачего полицейского и участок низкой скорости вокруг него. Клик по нему снимает' },
  { id: 'sign', label: 'Знак', key: 'P', icon: OctagonAlert, hint: 'Клик по дороге на подходе к перекрёстку ставит или снимает знак приоритета' },
  { id: 'bridge', label: 'Мост', key: 'B', icon: Landmark, hint: 'Клик по дороге отмечает её как мост. Чтобы отметить только часть, сначала разрежьте дорогу' },
  { id: 'tunnel', label: 'Тоннель', key: 'G', icon: TrainFrontTunnel, hint: 'Клик по дороге отмечает её как тоннель. Чтобы отметить только часть, сначала разрежьте дорогу' },
]

const hint = computed(() => tools.find((tool) => tool.id === editor.tool)?.hint ?? '')
</script>

<template>
  <div class="dock-wrap">
    <p v-if="editor.tool !== 'select'" class="hint panel">{{ hint }}</p>
    <TrafficOptions />
    <nav class="dock panel" aria-label="Инструменты">
      <button
        v-for="tool in tools"
        :key="tool.id"
        class="tool"
        :class="{ active: editor.tool === tool.id }"
        :aria-pressed="editor.tool === tool.id"
        :title="`${tool.hint} (${tool.key})`"
        @click="editor.setTool(tool.id)"
      >
        <component :is="tool.icon" :size="17" aria-hidden="true" />
        <span>{{ tool.label }}</span>
        <kbd>{{ tool.key }}</kbd>
      </button>
    </nav>
  </div>
</template>

<style scoped>
.dock-wrap {
  position: absolute;
  bottom: 10px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  z-index: 10;
  max-width: calc(100vw - 16px);
}
.hint {
  margin: 0;
  padding: 5px 10px;
  color: var(--muted);
  font-size: 12px;
  text-align: center;
}
.dock {
  display: flex;
  gap: 2px;
  padding: 4px;
}
.tool {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  min-width: 58px;
  padding: 6px 6px 4px;
  background: transparent;
  border: 0;
  border-radius: var(--radius-sm);
  color: var(--muted);
  font-size: 11px;
}
.tool:hover {
  background: var(--raised);
  color: var(--text);
}
.tool.active {
  background: var(--accent);
  color: #fff;
}
.tool kbd {
  position: absolute;
  top: 2px;
  right: 3px;
  min-width: 0;
  padding: 0 2px;
  background: transparent;
  border: 0;
  font-size: 9px;
  line-height: 11px;
  opacity: 0.55;
}
@media (max-width: 1500px) {
  .hint {
    max-width: 640px;
  }
}
@media (max-width: 760px) {
  .tool {
    min-width: 38px;
  }
  .tool span {
    display: none;
  }
  .hint {
    display: none;
  }
}
</style>
