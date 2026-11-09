<script setup lang="ts">
import { Diamond, Map as MapIcon } from 'lucide-vue-next'
import { computed } from 'vue'

import { type Basemap, useEditor } from '@/stores/editor'

const editor = useEditor()

const options = computed<{ id: Basemap; label: string }[]>(() => [
  { id: 'none', label: 'Нет' },
  { id: 'scheme2gis', label: 'Схема' },
  { id: 'satellite', label: 'Снимок' },
  { id: 'osm', label: 'OSM' },
])

const percent = computed(() => `${Math.round(editor.mapBalance * 100)}%`)
</script>

<template>
  <div v-if="editor.viewMode !== 'sim'" class="balance" role="group" aria-label="Соотношение модели и карты">
    <div class="segmented chips" role="group" aria-label="Подложка">
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
    <span class="sep" aria-hidden="true" />
    <span class="end"><Diamond :size="12" aria-hidden="true" /> Модель</span>
    <input
      v-model.number="editor.mapBalance"
      type="range"
      min="0"
      max="1"
      step="0.02"
      aria-label="Соотношение модели и карты"
      :style="{ '--fill': percent }"
      :title="'Посередине видно и модель, и карту полностью'"
    />
    <span class="end"><MapIcon :size="12" aria-hidden="true" /> Карта</span>
  </div>
</template>

<style scoped>
.balance {
  position: absolute;
  left: 50%;
  bottom: 36px;
  transform: translateX(-50%);
  z-index: 8;
  display: flex;
  align-items: center;
  gap: 8px;
  max-width: calc(100% - 24px);
  padding: 5px 10px;
  background: var(--panel);
  border: 1px solid var(--line-strong);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.22);
  font-size: 12px;
  white-space: nowrap;
}
.chips {
  flex: none;
}
.sep {
  width: 1px;
  height: 18px;
  background: var(--line-strong);
}
.end {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--muted);
}
input[type='range'] {
  width: 150px;
  height: 4px;
  appearance: none;
  background: linear-gradient(to right, var(--accent) var(--fill), var(--line-strong) var(--fill));
  border-radius: 2px;
  cursor: pointer;
}
input[type='range']::-webkit-slider-thumb {
  appearance: none;
  width: 14px;
  height: 14px;
  background: var(--accent);
  border: 2px solid #fff;
  border-radius: 50%;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.4);
}
input[type='range']::-moz-range-thumb {
  width: 11px;
  height: 11px;
  background: var(--accent);
  border: 2px solid #fff;
  border-radius: 50%;
}
@media (max-width: 760px) {
  .chips,
  .sep {
    display: none;
  }
  input[type='range'] {
    width: 100px;
  }
}
</style>
