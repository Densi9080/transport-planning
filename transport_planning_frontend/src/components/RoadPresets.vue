<script setup lang="ts">
import { type DrawMode, useEditor } from '@/stores/editor'

import ProfileCards from './ProfileCards.vue'

const editor = useEditor()
const modes: { id: DrawMode; label: string }[] = [
  { id: 'polyline', label: 'Ломаная' },
  { id: 'straight', label: 'Прямая' },
  { id: 'curve', label: 'Кривая' },
]
</script>

<template>
  <div class="section">
    <h2>Новая дорога</h2>
    <div class="field">
      <label>Режим ведения</label>
      <div class="segmented" role="group" aria-label="Режим ведения">
        <button
          v-for="mode in modes"
          :key="mode.id"
          :class="{ active: editor.drawMode === mode.id }"
          :aria-pressed="editor.drawMode === mode.id"
          @click="editor.drawMode = mode.id"
        >
          {{ mode.label }}
        </button>
      </div>
    </div>
    <p v-if="editor.drawPoints.length" class="row muted drawing">
      Точек: {{ editor.drawPoints.length }}
      <span class="spacer" />
      <button class="btn small" :disabled="editor.drawPoints.length < 2" @click="editor.finishRoad">Готово <kbd>Enter</kbd></button>
      <button class="btn small" @click="editor.drawPoints = []">Отмена</button>
    </p>
  </div>
  <div class="section">
    <ProfileCards :active-id="editor.presetId" @pick="editor.presetId = $event.id" />
  </div>
</template>

<style scoped>
h2 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}
.drawing {
  margin: 0;
}
</style>
