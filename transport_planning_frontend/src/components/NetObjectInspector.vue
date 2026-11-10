<script setup lang="ts">
import { Trash2 } from 'lucide-vue-next'
import { computed } from 'vue'

import { CUSTOM_TYPES, customObjectOf, TP_WAY } from '@/core/netObjects'
import type { ONode } from '@/core/types'
import { useEditor } from '@/stores/editor'

const props = defineProps<{ node: ONode }>()
const editor = useEditor()

const FIELDS: Record<string, { label: string; unit: string }> = {
  'tp:speed': { label: 'Скорость', unit: 'км/ч' },
  'tp:length': { label: 'Длина', unit: 'м' },
  'tp:gap': { label: 'Минимальный разрыв', unit: 'с' },
  'tp:headway': { label: 'Минимальная дистанция', unit: 'м' },
  'tp:volume': { label: 'Интенсивность', unit: 'авт/ч' },
}

const tags = computed(() => props.node.tags ?? {})
const type = computed(() => customObjectOf(tags.value))
const title = computed(() => (type.value ? CUSTOM_TYPES[type.value].title : 'Объект'))
const fields = computed(() => Object.keys(FIELDS).filter((key) => key in tags.value))
const wayId = computed(() => Number(tags.value[TP_WAY]))
const wayExists = computed(() => {
  void editor.rev
  return !!editor.doc?.ways.has(wayId.value)
})

function update(key: string, value: string): void {
  editor.updateNodeTags(props.node.id, { ...tags.value, [key]: value.trim() })
}
</script>

<template>
  <div class="section">
    <h2>{{ title }}</h2>
    <p class="muted">
      Отрезок
      <button v-if="wayExists" class="link" @click="editor.focusWay(wayId)">{{ wayId }}</button>
      <span v-else class="missing">{{ wayId }} удалён</span>
    </p>
    <label v-for="key in fields" :key="key" class="field">
      <span>{{ FIELDS[key]!.label }}, {{ FIELDS[key]!.unit }}</span>
      <input class="input" type="number" min="0" step="any" :value="tags[key]" @change="update(key, ($event.target as HTMLInputElement).value)" />
    </label>
    <p class="muted">Хранится в файле тегами tp:*. SUMO и MATSim эти теги не читают.</p>
    <button class="btn block" @click="editor.deleteSelection">
      <Trash2 :size="13" aria-hidden="true" /> Удалить объект
    </button>
  </div>
</template>

<style scoped>
.field {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-bottom: 6px;
}
.link {
  padding: 0;
  background: transparent;
  border: 0;
  color: var(--accent);
  cursor: pointer;
}
.missing {
  color: var(--err-text);
}
</style>
