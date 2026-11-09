<script setup lang="ts">
import { onBeforeUnmount, onMounted, watch } from 'vue'

import AppToolbar from '@/components/AppToolbar.vue'
import AssistantSettingsDialog from '@/components/AssistantSettingsDialog.vue'
import CompareMap from '@/components/CompareMap.vue'
import ConsoleDock from '@/components/ConsoleDock.vue'
import CrsDialog from '@/components/CrsDialog.vue'
import ExportDialog from '@/components/ExportDialog.vue'
import HelpDialog from '@/components/HelpDialog.vue'
import IdentifyCard from '@/components/IdentifyCard.vue'
import SaveGuardDialog from '@/components/SaveGuardDialog.vue'
import InspectorPanel from '@/components/InspectorPanel.vue'
import JunctionEditor from '@/components/JunctionEditor.vue'
import LeftDock from '@/components/LeftDock.vue'
import LegendBox from '@/components/LegendBox.vue'
import ListDock from '@/components/ListDock.vue'
import MapBalance from '@/components/MapBalance.vue'
import MapCanvas from '@/components/MapCanvas.vue'
import MenuBar from '@/components/MenuBar.vue'
import StatusBar from '@/components/StatusBar.vue'
import ToolDock from '@/components/ToolDock.vue'
import TrafficOptions from '@/components/TrafficOptions.vue'
import { parseProfile, withLanes } from '@/core/lanes'
import { useAssistant } from '@/stores/assistant'
import { type Tool, useEditor } from '@/stores/editor'
import { useSimulation } from '@/stores/simulation'

const props = defineProps<{ id: string }>()
const editor = useEditor()
const sim = useSimulation()
const assistant = useAssistant()

const TOOL_KEYS: Record<string, Tool> = {
  v: 'select',
  n: 'node',
  d: 'road',
  x: 'split',
  t: 'signal',
  c: 'crossing',
  b: 'bridge',
  g: 'tunnel',
  s: 'speed',
  l: 'bump',
  p: 'sign',
  q: 'connector',
  i: 'identify',
}

function isTyping(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null
  return !!element && (['INPUT', 'SELECT', 'TEXTAREA'].includes(element.tagName) || element.isContentEditable)
}

function changeLanes(delta: number): void {
  const way = editor.selectedWays[0]
  if (!way) return
  const tags = way.tags ?? {}
  const profile = parseProfile(tags)
  if (profile.oneway) {
    const reversed = profile.forward === 0
    const lanes = Math.max(1, profile.forward + profile.backward + delta)
    editor.updateWayTags(way.id, withLanes(tags, reversed ? 0 : lanes, reversed ? lanes : 0), 'Число полос')
  } else {
    editor.updateWayTags(
      way.id,
      withLanes(tags, Math.max(1, profile.forward + delta), Math.max(1, profile.backward + delta)),
      'Число полос',
    )
  }
}

function onKeyDown(event: KeyboardEvent): void {
  if (isTyping(event.target) || !editor.doc || editor.doc.inTransaction) return
  // Пока открыт диалог, клавиши принадлежат ему: Esc закрывает окно, а не снимает выделение
  if (editor.exportOpen || editor.helpOpen || editor.junctionNode !== null || assistant.settingsOpen || editor.leaveRequest || editor.crsDialogOpen) return
  const key = event.key.toLowerCase()
  const code = event.code

  if ((event.ctrlKey || event.metaKey) && code === 'KeyS') {
    event.preventDefault()
    void editor.saveNow()
    return
  }

  if ((event.ctrlKey || event.metaKey) && (code === 'KeyZ' || code === 'KeyY')) {
    event.preventDefault()
    if (code === 'KeyY' || event.shiftKey) editor.redo()
    else editor.undo()
    return
  }

  if (code === 'Backquote') {
    event.preventDefault()
    editor.consoleOpen = !editor.consoleOpen
    return
  }

  // Инструментами в симуляции граф не правится, а отмену расчёт подхватит сам
  if (editor.viewMode === 'sim') {
    if (code === 'Space') {
      event.preventDefault()
      sim.togglePlay()
    } else if (key === 'escape') {
      editor.select([])
    } else if (code === 'F1') {
      event.preventDefault()
      editor.helpOpen = !editor.helpOpen
    }
    return
  }

  if ((event.ctrlKey || event.metaKey) && code === 'KeyD') {
    event.preventDefault()
    editor.duplicateSelected()
    return
  }
  if (event.ctrlKey || event.metaKey || event.altKey) return

  if (code === 'Insert') {
    event.preventDefault()
    editor.toggleInsert()
    return
  }

  if (key === 'escape') {
    if (editor.drawPoints.length > 0) editor.drawPoints = []
    else if (editor.speedStart) editor.speedStart = null
    else if (editor.connectorFrom) editor.connectorFrom = null
    else if (editor.tool !== 'select') editor.setTool('select')
    else editor.select([])
    return
  }
  if (key === 'enter' && editor.tool === 'road') {
    editor.finishRoad()
    return
  }
  if (key === 'backspace' && editor.tool === 'road') {
    event.preventDefault()
    editor.drawPoints = editor.drawPoints.slice(0, -1)
    return
  }
  if (key === 'delete' || key === 'backspace') {
    event.preventDefault()
    editor.deleteSelection()
    return
  }
  if (key === '?' || code === 'F1') {
    event.preventDefault()
    editor.helpOpen = !editor.helpOpen
    return
  }

  // Коды клавиш работают и в русской раскладке
  const latin = code.startsWith('Key') ? code.slice(3).toLowerCase() : key
  const nextTool = TOOL_KEYS[latin]
  if (nextTool) {
    editor.setTool(nextTool)
    return
  }
  switch (latin) {
    case 'f':
      editor.reverseSelected()
      break
    case 'm':
      editor.mergeSelected()
      break
    case 'u':
      editor.unglueSelected()
      break
    case 'j':
      editor.joinSelected()
      break
    case 'h':
      editor.fitRev++
      break
    case 'e':
      if (editor.selectedNodes[0]) editor.openJunction(editor.selectedNodes[0].id)
      else editor.toast('Выберите узел, чтобы открыть его редактор')
      break
  }
  if (code === 'BracketRight' || key === ']') changeLanes(1)
  else if (code === 'BracketLeft' || key === '[') changeLanes(-1)
}

function onBeforeUnload(event: BeforeUnloadEvent): void {
  if (editor.saveState === 'dirty' || editor.saveState === 'saving') event.preventDefault()
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('beforeunload', onBeforeUnload)
  void editor.open(props.id)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('beforeunload', onBeforeUnload)
})

watch(() => props.id, (id) => void editor.open(id))

// Свёрнутый быстрый просмотр открывается при выборе объекта, иначе щелчок выглядит безрезультатным
watch(
  () => editor.selection,
  (next, previous) => {
    if (next.length > 0 && previous.length === 0) editor.inspectorOpen = true
  },
)
watch(
  () => editor.viewMode,
  (mode, previous) => {
    if (mode === 'sim') {
      editor.setTool('select')
      editor.inspectorOpen = true
      sim.enter()
    } else if (previous === 'sim') {
      sim.leave()
    }
  },
)
watch(
  () => editor.tool,
  (tool) => {
    if (tool === 'road') editor.inspectorOpen = true
  },
)
</script>

<template>
  <div class="app">
    <div v-if="editor.loadError" class="state" role="alert">
      <strong>Не удалось открыть проект</strong>
      <p class="muted">{{ editor.loadError }}</p>
      <RouterLink class="btn" to="/">К списку проектов</RouterLink>
    </div>
    <div v-else-if="editor.loading || !editor.doc || editor.projectId !== id" class="state">
      Читаем граф…
    </div>
    <template v-else>
      <MenuBar />
      <AppToolbar />
      <div class="workspace">
        <LeftDock v-show="editor.navigatorOpen" />
        <div class="center">
          <div class="stage">
            <div class="map-slot" :class="{ split: editor.compareOpen }">
              <MapCanvas :key="id" />
              <LegendBox />
            </div>
            <CompareMap v-if="editor.compareOpen" />
            <TrafficOptions />
            <MapBalance />
            <IdentifyCard />
            <ToolDock v-if="editor.viewMode !== 'sim'" />
            <div class="toasts" aria-live="polite">
              <div v-for="item in editor.toasts" :key="item.id" class="toast" :class="item.tone">
                {{ item.text }}
              </div>
            </div>
          </div>
          <ConsoleDock v-if="editor.consoleOpen" />
          <ListDock v-if="editor.listOpen" />
        </div>
        <InspectorPanel v-show="editor.inspectorOpen" />
      </div>
      <StatusBar />
      <ExportDialog v-if="editor.exportOpen" />
      <HelpDialog v-if="editor.helpOpen" />
      <SaveGuardDialog v-if="editor.leaveRequest" />
      <CrsDialog v-if="editor.crsDialogOpen" />
      <JunctionEditor v-if="editor.junctionNode !== null" :key="editor.junctionNode" />
      <AssistantSettingsDialog v-if="assistant.settingsOpen" />
    </template>
  </div>
</template>

<style scoped>
.app {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.workspace {
  flex: 1;
  min-height: 0;
  display: flex;
}
.center {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.stage {
  position: relative;
  flex: 1;
  min-height: 0;
}
.map-slot {
  position: absolute;
  inset: 0;
}
.map-slot.split {
  right: 50%;
}
.state {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--muted);
}
.state strong {
  color: var(--text);
}
.state p {
  margin: 0 0 8px;
}
.toasts {
  position: absolute;
  top: 10px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  pointer-events: none;
  z-index: 30;
}
.toast {
  padding: 4px 10px;
  background: var(--raised);
  border: 1px solid var(--line-strong);
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.2);
}
.toast.error {
  border-color: var(--err);
  color: var(--err-text);
}
.toast.success {
  border-color: var(--ok);
}
</style>
