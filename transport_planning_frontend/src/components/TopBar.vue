<script setup lang="ts">
import {
  Box,
  CircleHelp,
  Cloud,
  CloudAlert,
  Download,
  FolderOpen,
  Network,
  PanelLeft,
  PanelRight,
  PencilRuler,
  Redo2,
  Undo2,
} from 'lucide-vue-next'
import { computed } from 'vue'

import { type ViewMode, useEditor } from '@/stores/editor'

const editor = useEditor()

const modes: { id: ViewMode; label: string; icon: typeof Box }[] = [
  { id: 'engineering', label: 'Инженерия', icon: PencilRuler },
  { id: 'graph', label: 'Граф', icon: Network },
  { id: '3d', label: '3D', icon: Box },
]

const saveLabel = computed(() => {
  switch (editor.saveState) {
    case 'saving':
      return 'Сохраняем…'
    case 'dirty':
      return 'Есть несохранённые правки'
    case 'error':
      return 'Ошибка сохранения'
    default:
      return 'Правки сохранены'
  }
})

const stats = computed(() => {
  void editor.rev
  const doc = editor.doc
  return doc ? `${doc.nodes.size} узлов · ${doc.ways.size} линий` : ''
})
</script>

<template>
  <header class="topbar panel">
    <button
      class="btn ghost icon"
      :class="{ pressed: editor.navigatorOpen }"
      :aria-pressed="editor.navigatorOpen"
      title="Навигатор"
      aria-label="Показать или скрыть навигатор"
      @click="editor.navigatorOpen = !editor.navigatorOpen"
    >
      <PanelLeft :size="15" />
    </button>
    <RouterLink class="btn ghost" to="/" title="Другие проекты">
      <FolderOpen :size="15" aria-hidden="true" />
      <span class="name">{{ editor.projectName }}</span>
    </RouterLink>

    <div class="sep" />

    <button class="btn ghost icon" :disabled="!editor.canUndo" title="Отменить (Ctrl+Z)" aria-label="Отменить" @click="editor.undo">
      <Undo2 :size="15" />
    </button>
    <button class="btn ghost icon" :disabled="!editor.canRedo" title="Повторить (Ctrl+Y)" aria-label="Повторить" @click="editor.redo">
      <Redo2 :size="15" />
    </button>

    <span class="save" :class="editor.saveState" :title="saveLabel">
      <CloudAlert v-if="editor.saveState === 'error'" :size="14" aria-hidden="true" />
      <Cloud v-else :size="14" aria-hidden="true" />
      {{ saveLabel }}
    </span>

    <div class="spacer" />

    <div class="segmented accent modes" role="group" aria-label="Режим просмотра">
      <button
        v-for="mode in modes"
        :key="mode.id"
        :class="{ active: editor.viewMode === mode.id }"
        :aria-pressed="editor.viewMode === mode.id"
        @click="editor.viewMode = mode.id"
      >
        <component :is="mode.icon" :size="14" aria-hidden="true" />
        {{ mode.label }}
      </button>
    </div>

    <div class="spacer" />

    <span class="stats faint">{{ stats }} · правок {{ editor.changeCount }}</span>
    <button class="btn ghost icon" title="Горячие клавиши (F1)" aria-label="Горячие клавиши" @click="editor.helpOpen = true">
      <CircleHelp :size="15" />
    </button>
    <button class="btn primary" @click="editor.exportOpen = true">
      <Download :size="15" aria-hidden="true" />
      Экспорт .osm
    </button>
    <button
      class="btn ghost icon"
      :class="{ pressed: editor.inspectorOpen }"
      :aria-pressed="editor.inspectorOpen"
      title="Инспектор"
      aria-label="Показать или скрыть инспектор"
      @click="editor.inspectorOpen = !editor.inspectorOpen"
    >
      <PanelRight :size="15" />
    </button>
  </header>
</template>

<style scoped>
.topbar {
  position: absolute;
  top: 8px;
  left: 8px;
  right: 8px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 6px;
  z-index: 10;
}
.name {
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.btn {
  text-decoration: none;
}
.icon {
  padding: 4px 7px;
}
.icon.pressed {
  color: var(--select);
}
.sep {
  width: 1px;
  height: 20px;
  background: var(--line);
}
.save {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin-left: 6px;
  color: var(--faint);
  font-size: 12px;
  white-space: nowrap;
}
.save.dirty,
.save.saving {
  color: var(--warn);
}
.save.error {
  color: var(--err);
}
.modes button {
  padding: 2px 12px;
}
.stats {
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
@media (max-width: 1180px) {
  .stats,
  .save {
    display: none;
  }
}
@media (max-width: 760px) {
  .name,
  .sep {
    display: none;
  }
  .modes button {
    padding: 2px 6px;
    font-size: 12px;
  }
}
</style>
