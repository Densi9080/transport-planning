<script setup lang="ts">
import { type Basemap, useEditor } from '@/stores/editor'

const editor = useEditor()
const options: { id: Basemap; label: string }[] = [
  { id: 'none', label: 'Вектор' },
  { id: 'osm', label: 'OSM' },
  { id: 'satellite', label: 'Снимок' },
]
</script>

<template>
  <div class="bar panel">
    <div class="segmented" role="group" aria-label="Подложка">
      <button
        v-for="option in options"
        :key="option.id"
        :class="{ active: editor.basemap === option.id }"
        :aria-pressed="editor.basemap === option.id"
        @click="editor.basemap = option.id"
      >
        {{ option.label }}
      </button>
    </div>
    <label v-if="editor.basemap !== 'none'" class="row opacity">
      <span class="faint">Яркость</span>
      <input v-model.number="editor.basemapOpacity" type="range" min="0.1" max="1" step="0.05" aria-label="Яркость подложки" />
    </label>
  </div>
</template>

<style scoped>
.bar {
  position: absolute;
  left: 8px;
  bottom: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 4px;
  width: 300px;
  z-index: 10;
}
/* Посередине низа стоит панель инструментов: на узком окне подложка уходит над ней */
@media (max-width: 1240px) {
  .bar {
    bottom: 72px;
    width: 230px;
  }
}
.opacity {
  padding: 0 6px 2px;
  font-size: 12px;
}
.opacity input {
  flex: 1;
  min-width: 0;
  accent-color: var(--accent);
}
</style>
