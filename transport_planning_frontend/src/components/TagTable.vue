<script setup lang="ts">
import { Plus, X } from 'lucide-vue-next'
import { computed, ref } from 'vue'

import { COMMON_KEYS } from '@/core/presets'
import type { Tags } from '@/core/types'

const props = defineProps<{ tags: Tags }>()
const emit = defineEmits<{ change: [tags: Tags] }>()

const newKey = ref('')
const newValue = ref('')
const rows = computed(() => Object.entries(props.tags).sort(([a], [b]) => a.localeCompare(b)))
const listId = `tag-keys-${Math.random().toString(36).slice(2)}`

function setValue(key: string, value: string): void {
  if (props.tags[key] === value) return
  emit('change', { ...props.tags, [key]: value })
}

function renameKey(key: string, nextKey: string): void {
  const trimmed = nextKey.trim()
  if (!trimmed || trimmed === key) return
  const next: Tags = { ...props.tags }
  const value = next[key] ?? ''
  delete next[key]
  next[trimmed] = value
  emit('change', next)
}

function remove(key: string): void {
  const next: Tags = { ...props.tags }
  delete next[key]
  emit('change', next)
}

function add(): void {
  const key = newKey.value.trim()
  if (!key) return
  emit('change', { ...props.tags, [key]: newValue.value.trim() })
  newKey.value = ''
  newValue.value = ''
}
</script>

<template>
  <div class="tags">
    <div v-for="[key, value] in rows" :key="key" class="tag-row">
      <input class="input" :value="key" :aria-label="`Ключ ${key}`" @change="renameKey(key, ($event.target as HTMLInputElement).value)" />
      <input class="input" :value="value" :aria-label="`Значение ${key}`" @change="setValue(key, ($event.target as HTMLInputElement).value)" />
      <button class="btn ghost small remove" :aria-label="`Удалить тег ${key}`" @click="remove(key)"><X :size="13" /></button>
    </div>
    <form class="tag-row" @submit.prevent="add">
      <input v-model="newKey" class="input" placeholder="новый ключ" aria-label="Новый ключ" :list="listId" />
      <input v-model="newValue" class="input" placeholder="значение" aria-label="Новое значение" />
      <button class="btn small remove" type="submit" aria-label="Добавить тег" :disabled="!newKey.trim()"><Plus :size="13" /></button>
    </form>
    <datalist :id="listId">
      <option v-for="key in COMMON_KEYS" :key="key" :value="key" />
    </datalist>
  </div>
</template>

<style scoped>
.tags {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.tag-row {
  display: grid;
  grid-template-columns: 1fr 1fr 24px;
  gap: 3px;
  align-items: center;
}
.tag-row .input {
  min-height: 26px;
  padding: 2px 6px;
  font-size: 12px;
  min-width: 0;
}
.remove {
  padding: 2px;
  min-height: 24px;
}
</style>
