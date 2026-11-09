<script setup lang="ts">
import { computed } from 'vue'

import { useEditor } from '@/stores/editor'

const editor = useEditor()

const TOOL_HINTS: Record<string, string> = {
  select: 'Щелчок выбирает объект, Shift добавляет к выбору, двойной щелчок по узлу открывает редактор узла',
  road: 'Щелчки ставят точки и прилипают к дорогам. Enter или двойной щелчок завершает, Shift фиксирует угол, Alt отключает прилипание',
  node: 'Щелчок по дороге вставляет узел, по пустому месту создаёт отдельный',
  split: 'Щелчок по дороге или узлу разрезает дорогу на две',
  signal: 'Щелчок по узлу или дороге ставит или снимает светофор',
  crossing: 'Щелчок по узлу или дороге ставит или снимает пешеходный переход',
  bridge: 'Щелчок по дороге отмечает мост. Чтобы отметить часть, сначала разрежьте дорогу',
  tunnel: 'Щелчок по дороге отмечает тоннель. Чтобы отметить часть, сначала разрежьте дорогу',
  lineWay: 'Щёлкайте по дорогам по порядку следования маршрута',
  lineStop: 'Щелчок по дороге создаёт остановку, по существующему узлу добавляет её в маршрут',
}

const hint = computed(() => (editor.viewMode === 'sim' ? 'Режим расчёта: граф не редактируется. Пробел ставит микромодель на паузу' : (TOOL_HINTS[editor.tool] ?? '')))

const saveLabel = computed(() => {
  switch (editor.saveState) {
    case 'saving':
      return 'Сохранение…'
    case 'dirty':
      return 'Не сохранено'
    case 'error':
      return 'Ошибка сохранения'
    default:
      return 'Сохранено'
  }
})

const counts = computed(() => {
  void editor.rev
  const doc = editor.doc
  return doc ? `Узлов ${doc.nodes.size}  ·  Линий ${doc.ways.size}  ·  Отношений ${doc.relations.size}` : ''
})

const hiddenCount = computed(() => editor.hidden.ways.size + editor.hidden.nodes.size)

const position = computed(() => {
  const point = editor.cursor
  return point ? `${point.lat.toFixed(6)}, ${point.lon.toFixed(6)}` : ''
})

/** Масштаб при экранном разрешении 96 точек на дюйм. */
const scale = computed(() => {
  const camera = editor.camera
  if (!camera) return ''
  const metersPerPixel = (40_075_016.686 * Math.cos((camera.center[1] * Math.PI) / 180)) / (512 * 2 ** camera.zoom)
  const denominator = metersPerPixel * (96 / 0.0254)
  const rounded = denominator > 1000 ? Math.round(denominator / 100) * 100 : Math.round(denominator)
  return `1:${rounded.toLocaleString('ru-RU')}`
})
</script>

<template>
  <footer class="statusbar">
    <span class="hint ellipsis">{{ hint }}</span>
    <span class="cell" :class="editor.saveState">{{ saveLabel }}</span>
    <span class="cell">Правок {{ editor.changeCount }}</span>
    <span v-if="hiddenCount" class="cell">Скрыто {{ hiddenCount }}</span>
    <button v-if="editor.errorCount" class="cell link" @click="(editor.navigatorOpen = true), (editor.leftTab = 'issues')">Ошибок {{ editor.errorCount }}</button>
    <span class="cell wide">{{ counts }}</span>
    <span class="cell mono">{{ position }}</span>
    <span class="cell mono">{{ scale }}</span>
    <span class="cell mono">z{{ editor.zoom.toFixed(1) }}</span>
  </footer>
</template>

<style scoped>
.statusbar {
  display: flex;
  align-items: center;
  gap: 0;
  height: 21px;
  padding-left: 6px;
  background: var(--titlebar);
  border-top: 1px solid var(--line-strong);
  font-size: 11px;
}
.hint {
  flex: 1;
  min-width: 0;
  color: var(--muted);
}
.cell {
  flex: none;
  padding: 0 8px;
  border-left: 1px solid var(--line-strong);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.cell.mono {
  min-width: 60px;
  text-align: right;
}
.cell.dirty,
.cell.saving {
  color: var(--warn-text);
}
.cell.error {
  color: var(--err-text);
}
.link {
  background: transparent;
  border-top: 0;
  border-right: 0;
  border-bottom: 0;
  color: var(--err-text);
  font-weight: 600;
  text-decoration: underline;
}
@media (max-width: 1250px) {
  .cell.wide {
    display: none;
  }
}
</style>
