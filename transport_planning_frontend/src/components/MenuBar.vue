<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import { BASEMAP_OPTIONS } from '@/map/style'
import { useAssistant } from '@/stores/assistant'
import { useEditor } from '@/stores/editor'
import { useSimulation } from '@/stores/simulation'

interface MenuItem {
  label?: string
  hint?: string
  checked?: boolean
  disabled?: boolean
  action?: () => void
  separator?: boolean
}

interface Menu {
  title: string
  items: MenuItem[]
}

const editor = useEditor()
const sim = useSimulation()
const router = useRouter()
const assistant = useAssistant()
const openMenu = ref<string | null>(null)
const root = ref<HTMLElement | null>(null)

const separator: MenuItem = { separator: true }

function openLeft(tab: typeof editor.leftTab): void {
  editor.navigatorOpen = true
  editor.leftTab = tab
}

function openList(tab: typeof editor.listTab): void {
  editor.listOpen = true
  editor.listTab = tab
}

function openAssistant(): void {
  editor.inspectorOpen = true
  editor.rightTab = 'assistant'
}

function runSim(level: 'macro' | 'micro'): void {
  editor.viewMode = 'sim'
  sim.setLevel(level)
}

const menus = computed<Menu[]>(() => [
  {
    title: 'Файл',
    items: [
      { label: 'Открыть другой проект', action: () => void router.push('/') },
      { label: 'Экспорт .osm', hint: 'с проверкой сети', action: () => (editor.exportOpen = true) },
    ],
  },
  {
    title: 'Правка',
    items: [
      { label: 'Отменить', hint: 'Ctrl+Z', disabled: !editor.canUndo, action: editor.undo },
      { label: 'Повторить', hint: 'Ctrl+Y', disabled: !editor.canRedo, action: editor.redo },
      separator,
      { label: 'Удалить выбранное', hint: 'Del', disabled: editor.selection.length === 0, action: editor.deleteSelection },
      { label: 'Развернуть направление', hint: 'F', disabled: editor.selectedWays.length === 0, action: editor.reverseSelected },
      { label: 'Склеить выбранные узлы', hint: 'M', disabled: editor.selectedNodes.length < 2, action: editor.mergeSelected },
      { label: 'Расклеить перекрёсток', hint: 'U', disabled: editor.selectedNodes.length === 0, action: editor.unglueSelected },
      { label: 'Объединить две дороги', hint: 'J', disabled: editor.selectedWays.length !== 2, action: editor.joinSelected },
      { label: 'Дублировать дорогу', hint: 'Ctrl+D', disabled: editor.selectedWays.length === 0, action: editor.duplicateSelected },
      { label: 'Сгладить дорогу', disabled: editor.selectedWays.length === 0, action: editor.smoothSelected },
    ],
  },
  {
    title: 'Вид',
    items: [
      { label: 'Инженерный вид', checked: editor.viewMode === 'engineering', action: () => (editor.viewMode = 'engineering') },
      { label: 'Граф сети', checked: editor.viewMode === 'graph', action: () => (editor.viewMode = 'graph') },
      { label: '3D', checked: editor.viewMode === '3d', action: () => (editor.viewMode = '3d') },
      separator,
      { label: 'Окно «Сеть»', checked: editor.navigatorOpen, action: () => (editor.navigatorOpen = !editor.navigatorOpen) },
      { label: 'Быстрый просмотр', checked: editor.inspectorOpen, action: () => (editor.inspectorOpen = !editor.inspectorOpen) },
      { label: 'Списки', checked: editor.listOpen, action: () => (editor.listOpen = !editor.listOpen) },
      separator,
      { label: 'Подложка рядом с графом', checked: editor.compareOpen, action: () => (editor.compareOpen = !editor.compareOpen) },
      { label: 'Показать весь участок', hint: 'H', action: () => editor.fitRev++ },
      separator,
      { label: 'Светлая тема', checked: editor.theme === 'light', action: () => (editor.theme = 'light') },
      { label: 'Тёмная тема', checked: editor.theme === 'dark', action: () => (editor.theme = 'dark') },
    ],
  },
  {
    title: 'Сеть',
    items: [
      { label: 'Выбор', hint: 'V', checked: editor.tool === 'select', action: () => editor.setTool('select') },
      { label: 'Новая дорога', hint: 'D', checked: editor.tool === 'road', action: () => editor.setTool('road') },
      { label: 'Новый узел', hint: 'N', checked: editor.tool === 'node', action: () => editor.setTool('node') },
      { label: 'Разрезать дорогу', hint: 'X', checked: editor.tool === 'split', action: () => editor.setTool('split') },
      { label: 'Соединить полосы', hint: 'Q', checked: editor.tool === 'connector', action: () => editor.setTool('connector') },
      { label: 'Светофор', hint: 'T', checked: editor.tool === 'signal', action: () => editor.setTool('signal') },
      { label: 'Переход', hint: 'C', checked: editor.tool === 'crossing', action: () => editor.setTool('crossing') },
      { label: 'Участок скорости', hint: 'S', checked: editor.tool === 'speed', action: () => editor.setTool('speed') },
      { label: 'Лежачий полицейский', hint: 'L', checked: editor.tool === 'bump', action: () => editor.setTool('bump') },
      { label: 'Знак приоритета', hint: 'P', checked: editor.tool === 'sign', action: () => editor.setTool('sign') },
      { label: 'Мост', hint: 'B', checked: editor.tool === 'bridge', action: () => editor.setTool('bridge') },
      { label: 'Тоннель', hint: 'G', checked: editor.tool === 'tunnel', action: () => editor.setTool('tunnel') },
      separator,
      {
        label: 'Редактор узла',
        hint: 'E',
        disabled: editor.selectedNodes.length !== 1,
        action: () => {
          const node = editor.selectedNodes[0]
          if (node) editor.openJunction(node.id)
        },
      },
      { label: 'Скрыть объекты по атрибутам', action: () => openLeft('filter') },
      { label: 'Проверка сети', action: () => openLeft('issues') },
    ],
  },
  {
    title: 'ОТ',
    items: [
      { label: 'Линии и маршруты', action: () => openLeft('transit') },
      { label: 'Показать все линии на карте', checked: editor.layers.transit, action: () => (editor.layers.transit = !editor.layers.transit) },
      separator,
      { label: 'Список линий', action: () => openList('lines') },
      { label: 'Список остановок', action: () => openList('stops') },
    ],
  },
  {
    title: 'Расчёты',
    items: [
      { label: 'Макромодель: загрузка сети', action: () => runSim('macro') },
      { label: 'Микромодель: движение машин', action: () => runSim('micro') },
      separator,
      { label: 'Список отрезков с результатами', action: () => openList('links') },
      { label: 'Районы', action: () => openList('zones') },
      { label: 'Матрица корреспонденций', action: () => openList('matrix') },
    ],
  },
  {
    title: 'Помощник',
    items: [
      { label: 'Открыть помощника', action: () => openAssistant() },
      { label: 'Подключение к модели', action: () => (assistant.settingsOpen = true) },
    ],
  },
  {
    title: 'Подложка',
    items: BASEMAP_OPTIONS.map((option) => ({
      label: option.label,
      checked: editor.basemap === option.id,
      action: () => (editor.basemap = option.id),
    })),
  },
  {
    title: 'Справка',
    items: [{ label: 'Горячие клавиши', hint: 'F1', action: () => (editor.helpOpen = true) }],
  },
])

function choose(item: MenuItem): void {
  if (item.disabled || !item.action) return
  openMenu.value = null
  item.action()
}

function onDocumentPointer(event: PointerEvent): void {
  if (openMenu.value && !root.value?.contains(event.target as Node)) openMenu.value = null
}

function onKey(event: KeyboardEvent): void {
  if (event.key === 'Escape' && openMenu.value) {
    event.stopPropagation()
    openMenu.value = null
  }
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointer)
  document.addEventListener('keydown', onKey, true)
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocumentPointer)
  document.removeEventListener('keydown', onKey, true)
})
</script>

<template>
  <nav ref="root" class="menubar" role="menubar" aria-label="Главное меню">
    <div v-for="menu in menus" :key="menu.title" class="menu">
      <button
        class="title"
        :class="{ open: openMenu === menu.title }"
        role="menuitem"
        aria-haspopup="true"
        :aria-expanded="openMenu === menu.title"
        @click="openMenu = openMenu === menu.title ? null : menu.title"
        @mouseenter="openMenu && (openMenu = menu.title)"
      >
        {{ menu.title }}
      </button>
      <div v-if="openMenu === menu.title" class="dropdown" role="menu">
        <template v-for="(item, index) in menu.items" :key="index">
          <hr v-if="item.separator" />
          <button v-else class="item" role="menuitem" :disabled="item.disabled" @click="choose(item)">
            <span class="mark">{{ item.checked ? '✓' : '' }}</span>
            <span class="label">{{ item.label }}</span>
            <span class="hint">{{ item.hint }}</span>
          </button>
        </template>
      </div>
    </div>
    <span class="spacer" />
    <span class="project ellipsis" :title="editor.projectName">{{ editor.projectName }}</span>
  </nav>
</template>

<style scoped>
.menubar {
  display: flex;
  align-items: center;
  height: 23px;
  padding: 0 4px;
  background: var(--panel);
  border-bottom: 1px solid var(--line);
}
.menu {
  position: relative;
}
.title {
  height: 21px;
  padding: 0 8px;
  background: transparent;
  border: 0;
  border-radius: 2px;
}
.title:hover,
.title.open {
  background: var(--row-selected);
}
.dropdown {
  position: absolute;
  top: 22px;
  left: 0;
  min-width: 250px;
  padding: 3px;
  background: var(--raised);
  border: 1px solid var(--line-strong);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
  z-index: 60;
}
.item {
  display: grid;
  grid-template-columns: 16px 1fr auto;
  align-items: center;
  gap: 4px;
  width: 100%;
  min-height: 22px;
  padding: 1px 6px;
  background: transparent;
  border: 0;
  text-align: left;
}
.item:hover:not(:disabled) {
  background: var(--accent);
  color: var(--on-accent);
}
.item:hover:not(:disabled) .hint {
  color: var(--on-accent);
}
.hint {
  color: var(--faint);
  font-size: 11px;
}
hr {
  margin: 3px 0;
  border: 0;
  border-top: 1px solid var(--line);
}
.project {
  max-width: 280px;
  padding-right: 6px;
  color: var(--faint);
}
</style>
