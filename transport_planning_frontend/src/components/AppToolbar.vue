<script setup lang="ts">
import { Activity, BoxSelect, Save, CarFront, Download, Maximize, PanelLeft, PanelRight, Pause, Pencil, Play, Redo2, SquarePlus, SquareTerminal, Undo2 } from 'lucide-vue-next'

import { type EditMode, useEditor } from '@/stores/editor'
import { useSimulation } from '@/stores/simulation'
import { useTraffic } from '@/stores/traffic'

const editor = useEditor()
const sim = useSimulation()
const traffic = useTraffic()

const modes: { id: EditMode; label: string; hint: string; icon: typeof Pencil }[] = [
  { id: 'insert', label: 'Вставка', hint: 'Создавать объекты активного типа (Insert)', icon: SquarePlus },
  { id: 'edit', label: 'Редактирование', hint: 'Выбирать, двигать и удалять объекты активного типа (Insert)', icon: Pencil },
  { id: 'select', label: 'Выделение', hint: 'Выделять рамкой объекты активного типа', icon: BoxSelect },
]

function toggleSim(): void {
  if (editor.viewMode === 'sim') editor.viewMode = 'engineering'
  else editor.enterSimulation()
}
</script>

<template>
  <div class="toolbar" role="toolbar" aria-label="Панель инструментов">
    <button class="tool" title="Отменить (Ctrl+Z)" aria-label="Отменить" :disabled="!editor.canUndo" @click="editor.undo"><Undo2 :size="15" /></button>
    <button class="tool" title="Повторить (Ctrl+Y)" aria-label="Повторить" :disabled="!editor.canRedo" @click="editor.redo"><Redo2 :size="15" /></button>
    <button class="btn small" :class="{ primary: editor.saveState === 'dirty' }" :disabled="editor.saveState !== 'dirty'" title="Сохранить правки (Ctrl+S)" @click="editor.saveNow">
      <Save :size="13" aria-hidden="true" />
      Сохранить
    </button>
    <span class="sep" />

    <div v-if="editor.viewMode !== 'sim'" class="segmented modes" role="group" aria-label="Режим работы с сетью">
      <button
        v-for="mode in modes"
        :key="mode.id"
        :class="{ active: editor.mode === mode.id }"
        :aria-pressed="editor.mode === mode.id"
        :title="mode.hint"
        @click="editor.setMode(mode.id)"
      >
        <component :is="mode.icon" :size="13" aria-hidden="true" />
        {{ mode.label }}
      </button>
    </div>
    <button v-else class="btn small" :class="{ primary: !sim.running }" :disabled="sim.level !== 'micro'" @click="sim.togglePlay">
      <Pause v-if="sim.running" :size="13" aria-hidden="true" />
      <Play v-else :size="13" aria-hidden="true" />
      {{ sim.running ? 'Пауза' : 'Запуск' }}
    </button>
    <span class="sep" />

    <button class="tool" title="Показать весь участок (H)" aria-label="Показать весь участок" @click="editor.fitRev++"><Maximize :size="15" /></button>
    <button class="btn small" :class="{ primary: editor.viewMode === 'sim' }" :aria-pressed="editor.viewMode === 'sim'" @click="toggleSim">
      <CarFront :size="13" aria-hidden="true" />
      Симуляция
    </button>
    <span class="sep" />
    <label class="trips" title="Сколько случайных поездок считать за час">
      Поездок
      <input v-model.number="traffic.trips" class="input" type="number" min="1" max="5000" step="100" aria-label="Поездок за час" />
    </label>
    <button class="btn small" :disabled="traffic.running" @click="traffic.run()">
      <Activity :size="13" aria-hidden="true" />
      {{ traffic.running ? 'Считаем…' : 'Расчёт загрузки' }}
    </button>
    <button class="btn small" :disabled="traffic.running" title="Те же настройки поездок, что на сервере организаторов" @click="traffic.run(100)">100</button>
    <button v-if="traffic.result" class="btn small" :aria-pressed="traffic.visible" @click="traffic.visible = !traffic.visible">
      {{ traffic.visible ? 'Скрыть загрузку' : 'Показать загрузку' }}
    </button>

    <span class="spacer" />

    <button class="tool" :class="{ active: editor.navigatorOpen }" :aria-pressed="editor.navigatorOpen" title="Окно «Сеть»" aria-label="Окно «Сеть»" @click="editor.navigatorOpen = !editor.navigatorOpen"><PanelLeft :size="15" /></button>
    <button class="tool console" :class="{ active: editor.consoleOpen, alert: editor.errorCount > 0 }" :aria-pressed="editor.consoleOpen" title="Консоль (Ё)" aria-label="Консоль" @click="editor.consoleOpen = !editor.consoleOpen">
      <SquareTerminal :size="15" />
    </button>
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
.tool.console.alert {
  color: var(--err-text);
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
.trips {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  flex: none;
  color: var(--muted);
}
.trips input {
  width: 62px;
}
.spacer {
  flex: 1;
}
</style>
