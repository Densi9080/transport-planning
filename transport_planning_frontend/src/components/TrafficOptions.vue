<script setup lang="ts">
import { BUMP_KINDS, SECTION_SPEEDS } from '@/core/traffic'
import { useEditor } from '@/stores/editor'

const editor = useEditor()
</script>

<template>
  <div v-if="editor.tool === 'speed' || editor.tool === 'bump' || editor.tool === 'sign'" class="options panel">
    <template v-if="editor.tool === 'speed'">
      <label for="section-speed">Скорость, км/ч</label>
      <select id="section-speed" v-model.number="editor.trafficOptions.sectionSpeed" class="input">
        <option v-for="speed in SECTION_SPEEDS" :key="speed" :value="speed">{{ speed }}</option>
      </select>
      <span class="state">{{ editor.speedStart ? 'Теперь конец участка' : 'Клик: начало участка' }}</span>
    </template>

    <template v-else-if="editor.tool === 'bump'">
      <label for="bump-kind">Тип</label>
      <select id="bump-kind" v-model="editor.trafficOptions.bumpKind" class="input">
        <option v-for="kind in BUMP_KINDS" :key="kind.value" :value="kind.value">{{ kind.label }}</option>
      </select>
      <label for="bump-speed">Проезд, км/ч</label>
      <select id="bump-speed" v-model.number="editor.trafficOptions.bumpSpeed" class="input">
        <option v-for="speed in SECTION_SPEEDS" :key="speed" :value="speed">{{ speed }}</option>
      </select>
    </template>

    <div v-else class="segmented" role="group" aria-label="Знак приоритета">
      <button :class="{ active: editor.trafficOptions.signKind === 'give_way' }" :aria-pressed="editor.trafficOptions.signKind === 'give_way'" @click="editor.trafficOptions.signKind = 'give_way'">Уступи дорогу</button>
      <button :class="{ active: editor.trafficOptions.signKind === 'stop' }" :aria-pressed="editor.trafficOptions.signKind === 'stop'" @click="editor.trafficOptions.signKind = 'stop'">Стоп</button>
    </div>
  </div>
</template>

<style scoped>
.options {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 10px;
  font-size: 12px;
  color: var(--muted);
}
.options .input {
  width: auto;
}
.state {
  white-space: nowrap;
}
@media (max-width: 760px) {
  .options {
    flex-wrap: wrap;
    justify-content: center;
  }
}
</style>
