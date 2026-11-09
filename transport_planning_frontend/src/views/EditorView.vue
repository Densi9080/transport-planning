<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

import BasemapBar from '@/components/BasemapBar.vue'
import ExportDialog from '@/components/ExportDialog.vue'
import HelpDialog from '@/components/HelpDialog.vue'
import InspectorPanel from '@/components/InspectorPanel.vue'
import MapCanvas from '@/components/MapCanvas.vue'
import NavigatorPanel from '@/components/NavigatorPanel.vue'
import ToolDock from '@/components/ToolDock.vue'
import TopBar from '@/components/TopBar.vue'
import { parseProfile, withLanes } from '@/core/lanes'
import { type Tool, useEditor } from '@/stores/editor'

const props = defineProps<{ id: string }>()
const editor = useEditor()
const canvas = ref<InstanceType<typeof MapCanvas> | null>(null)

const TOOL_KEYS: Record<string, Tool> = {
  v: 'select',
  n: 'node',
  d: 'road',
  x: 'split',
  t: 'signal',
  c: 'crossing',
  b: 'bridge',
  g: 'tunnel',
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
  const key = event.key.toLowerCase()
  const code = event.code

  if ((event.ctrlKey || event.metaKey) && (code === 'KeyZ' || code === 'KeyY')) {
    event.preventDefault()
    if (code === 'KeyY' || event.shiftKey) editor.redo()
    else editor.undo()
    return
  }
  if (event.ctrlKey || event.metaKey || event.altKey) return

  if (key === 'escape') {
    if (editor.drawPoints.length > 0) editor.drawPoints = []
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
      canvas.value?.fitToBounds()
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

// Свёрнутый инспектор открывается при выборе объекта, иначе клик выглядит безрезультатным
watch(
  () => editor.selection,
  (next, previous) => {
    if (next.length > 0 && previous.length === 0) editor.inspectorOpen = true
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
  <div class="editor">
    <div v-if="editor.loadError" class="state" role="alert">
      <strong>Не удалось открыть проект</strong>
      <p class="muted">{{ editor.loadError }}</p>
      <RouterLink class="btn" to="/">К списку проектов</RouterLink>
    </div>
    <div v-else-if="editor.loading || !editor.doc || editor.projectId !== id" class="state">
      Читаем граф…
    </div>
    <template v-else>
      <MapCanvas ref="canvas" :key="id" />
      <TopBar />
      <NavigatorPanel v-show="editor.navigatorOpen" />
      <InspectorPanel v-show="editor.inspectorOpen" />
      <ToolDock />
      <BasemapBar />
      <ExportDialog v-if="editor.exportOpen" />
      <HelpDialog v-if="editor.helpOpen" />
      <div class="toasts" aria-live="polite">
        <div v-for="item in editor.toasts" :key="item.id" class="toast" :class="item.tone">
          {{ item.text }}
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.editor {
  position: fixed;
  inset: 0;
  overflow: hidden;
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
  top: 58px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  pointer-events: none;
  z-index: 30;
}
.toast {
  padding: 6px 12px;
  background: var(--panel-solid);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.4);
}
.toast.error {
  border-color: var(--err);
  color: #fecaca;
}
.toast.success {
  border-color: rgba(34, 197, 94, 0.6);
}
</style>
