<script setup lang="ts">
import { Circle, Footprints, Hand, Landmark, MousePointer2, Route, Scissors, TrafficCone, TrainFrontTunnel, Trash2, Workflow } from 'lucide-vue-next'
import { computed } from 'vue'

import { type Tool, useEditor } from '@/stores/editor'

const editor = useEditor()

const tools: { id: Tool; label: string; key: string; icon: typeof Circle; hint: string }[] = [
  { id: 'select', label: 'Выбор', key: 'V', icon: MousePointer2, hint: 'Щелчок выбирает объект активного типа, Shift добавляет к выбору' },
  { id: 'pan', label: 'Рука', key: 'K', icon: Hand, hint: 'Двигает карту левой кнопкой. Правая кнопка показывает координаты точки' },
  { id: 'road', label: 'Дорога', key: 'D', icon: Route, hint: 'Щелчки ставят точки и прилипают к дорогам. Enter или двойной щелчок завершает' },
  { id: 'node', label: 'Узел', key: 'N', icon: Circle, hint: 'Щелчок по дороге вставляет узел, по пустому месту создаёт отдельный' },
  { id: 'split', label: 'Разрез', key: 'X', icon: Scissors, hint: 'Щелчок по дороге или узлу разрезает дорогу' },
  { id: 'connector', label: 'Поворот', key: 'Q', icon: Workflow, hint: 'Щёлкните красную точку въезда: линия потянется за курсором. Щёлкните голубую точку выезда. Щелчок по пустому месту завершает' },
  { id: 'signal', label: 'Светофор', key: 'T', icon: TrafficCone, hint: 'Щелчок по узлу или дороге ставит или снимает светофор' },
  { id: 'crossing', label: 'Переход', key: 'C', icon: Footprints, hint: 'Щёлкните начало перехода, затем его конец: линия должна пересечь дорогу. Щелчок по существующему переходу снимает его' },
  { id: 'bridge', label: 'Мост', key: 'B', icon: Landmark, hint: 'Щелчок по дороге отмечает её как мост' },
  { id: 'tunnel', label: 'Тоннель', key: 'G', icon: TrainFrontTunnel, hint: 'Щелчок по дороге отмечает её как тоннель' },
]

const hint = computed(() => tools.find((tool) => tool.id === editor.tool)?.hint ?? '')
</script>

<template>
  <div class="dock-wrap">
    <p v-if="editor.tool !== 'select' && hint" class="hint">{{ hint }}</p>
    <nav class="dock" aria-label="Инструменты">
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
      <span class="sep" aria-hidden="true" />
      <button class="tool danger" :disabled="editor.selection.length === 0" title="Удалить выбранное (Delete)" @click="editor.deleteSelection">
        <Trash2 :size="17" aria-hidden="true" />
        <span>Удалить</span>
        <kbd>Del</kbd>
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
  max-width: calc(100% - 16px);
}
.hint {
  margin: 0;
  padding: 5px 10px;
  background: var(--panel);
  border: 1px solid var(--line-strong);
  color: var(--muted);
  font-size: 12px;
  text-align: center;
}
.dock {
  display: flex;
  gap: 2px;
  padding: 4px;
  background: var(--panel);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.25);
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
.sep {
  flex: none;
  width: 1px;
  margin: 4px 3px;
  background: var(--line-strong);
}
.tool:disabled {
  opacity: 0.4;
}
.tool.danger:hover:not(:disabled) {
  color: var(--err-text);
}
.tool:hover {
  background: var(--raised);
  color: var(--text);
}
.tool.active {
  background: var(--accent);
  color: var(--on-accent);
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
@media (max-width: 760px) {
  .tool {
    min-width: 34px;
  }
  .tool span,
  .hint {
    display: none;
  }
}
</style>
