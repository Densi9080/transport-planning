<script setup lang="ts">
import { computed } from 'vue'

import { ROAD_PRESETS } from '@/core/presets'
import { type DrawMode, useEditor } from '@/stores/editor'

const editor = useEditor()
const modes: { id: DrawMode; label: string }[] = [
  { id: 'polyline', label: 'Ломаная' },
  { id: 'straight', label: 'Прямая' },
  { id: 'curve', label: 'Кривая' },
]

const groups = computed(() => {
  const result = new Map<string, typeof ROAD_PRESETS>()
  for (const preset of ROAD_PRESETS) {
    const list = result.get(preset.group)
    if (list) list.push(preset)
    else result.set(preset.group, [preset])
  }
  return [...result.entries()]
})
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
  <div v-for="[group, presets] in groups" :key="group" class="section">
    <div class="eyebrow">{{ group }}</div>
    <div class="cards">
      <button
        v-for="preset in presets"
        :key="preset.id"
        class="card"
        :class="{ active: editor.presetId === preset.id }"
        :aria-pressed="editor.presetId === preset.id"
        @click="editor.presetId = preset.id"
      >
        <span class="cut" aria-hidden="true">
          <i v-for="n in preset.backward" :key="`b${n}`" class="back" />
          <b v-if="preset.backward" />
          <i v-for="n in preset.forward" :key="`f${n}`" />
        </span>
        <strong>{{ preset.title }}</strong>
        <span class="faint">{{ preset.summary }}</span>
      </button>
    </div>
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
.cards {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}
.card {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px;
  background: rgba(0, 0, 0, 0.22);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  font-size: 11px;
  text-align: left;
}
.card:hover {
  border-color: var(--line-strong);
}
.card.active {
  border-color: var(--accent);
  background: var(--accent-soft);
}
.card strong {
  font-weight: 500;
  font-size: 12px;
}
.cut {
  display: flex;
  justify-content: center;
  align-items: stretch;
  gap: 2px;
  height: 22px;
  margin-bottom: 4px;
  padding: 2px 8px;
  background: #101114;
  border-radius: 4px;
}
.cut i {
  flex: 0 1 18px;
  background: #4b4e57;
  border-radius: 1px;
}
.cut i.back {
  background: #35373e;
}
.cut b {
  width: 2px;
  background: #e8e9ec;
}
</style>
