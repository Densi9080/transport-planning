<script setup lang="ts">
import { computed, reactive, ref } from 'vue'

import { parseProfile } from '@/core/lanes'
import { ROAD_TYPES } from '@/core/presets'
import { useEditor } from '@/stores/editor'

const editor = useEditor()
const profile = parseProfile(editor.preset.tags)

const form = reactive({
  id: editor.doc?.peekId() ?? 0,
  type: editor.preset.tags.highway ?? 'residential',
  name: '',
  forward: Math.max(1, profile.forward || profile.backward),
  backward: profile.oneway ? 1 : profile.backward,
  maxspeed: editor.preset.tags.maxspeed ?? '',
  blockReverse: profile.oneway,
})
const error = ref('')

const points = computed(() => editor.pendingRoad?.points ?? [])
function describe(index: number): string {
  const point = points.value.at(index)
  if (point?.nodeId !== undefined) return `Узел ${point.nodeId}`
  return point?.wayId !== undefined ? `Новый узел на отрезке ${point.wayId}` : 'Новый узел'
}

function submit(): void {
  const id = Math.trunc(Number(form.id))
  if (!Number.isFinite(id) || id <= 0) error.value = 'Номер должен быть положительным целым числом'
  else if (editor.doc?.ways.has(id)) error.value = `Отрезок с номером ${id} уже есть`
  else if (form.forward < 1 || (!form.blockReverse && form.backward < 1)) error.value = 'Полос должно быть не меньше одной'
  else {
    error.value = ''
    editor.confirmRoad({ ...form, id })
  }
}
</script>

<template>
  <div class="backdrop" role="dialog" aria-modal="true" aria-labelledby="link-title">
    <form class="box" @submit.prevent="submit" @keydown.esc="editor.cancelRoadDialog">
      <h2 id="link-title">Новый отрезок</h2>
      <div class="grid">
        <label><span>Номер</span><input v-model.number="form.id" class="input" type="number" min="1" /></label>
        <label><span>Тип</span>
          <select v-model="form.type" class="input">
            <option v-for="item in ROAD_TYPES" :key="item.value" :value="item.value">{{ item.label }}</option>
          </select>
        </label>
        <div class="readonly"><span>Из узла</span><strong>{{ describe(0) }}</strong></div>
        <div class="readonly"><span>В узел</span><strong>{{ describe(-1) }}</strong></div>
        <label class="wide"><span>Название</span><input v-model="form.name" class="input" /></label>
        <label><span>Полос в прямом направлении</span><input v-model.number="form.forward" class="input" type="number" min="1" max="8" /></label>
        <label><span>Полос в обратном направлении</span><input v-model.number="form.backward" class="input" type="number" min="1" max="8" :disabled="form.blockReverse" /></label>
        <label><span>Разрешённая скорость, км/ч</span><input v-model="form.maxspeed" class="input" type="number" min="5" step="5" /></label>
        <label class="check"><input v-model="form.blockReverse" type="checkbox" /> Заблокировать обратное направление</label>
      </div>
      <p v-if="error" class="bad" role="alert">{{ error }}</p>
      <footer>
        <button type="submit" class="btn primary">ОК</button>
        <button type="button" class="btn" @click="editor.cancelRoadDialog">Отмена</button>
      </footer>
    </form>
  </div>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: grid;
  place-items: center;
  padding: 16px;
  background: rgba(0, 0, 0, 0.45);
}
.box {
  width: min(520px, 100%);
  max-height: calc(100vh - 32px);
  overflow-y: auto;
  padding: 14px;
  background: var(--panel);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
}
h2 {
  margin: 0 0 10px;
  font-size: 15px;
}
.grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.grid label,
.readonly {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.grid span {
  color: var(--muted);
}
.wide {
  grid-column: 1 / -1;
}
.grid label.check {
  flex-direction: row;
  align-items: center;
  gap: 6px;
  align-self: end;
  padding-bottom: 5px;
}
.bad {
  margin: 8px 0 0;
  color: var(--err-text);
}
footer {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  margin-top: 12px;
}
</style>
