<script setup lang="ts">
import { Copy, ExternalLink, X } from 'lucide-vue-next'
import { computed } from 'vue'

import { formatPosition } from '@/core/crs'
import { useEditor } from '@/stores/editor'

const editor = useEditor()
const COORD_DIGITS = 6

const point = computed(() => editor.identified)
const text = computed(() => (point.value ? `${point.value.lat.toFixed(COORD_DIGITS)}, ${point.value.lon.toFixed(COORD_DIGITS)}` : ''))
const link = computed(() => {
  if (!point.value) return ''
  const place = `${point.value.lon.toFixed(COORD_DIGITS)},${point.value.lat.toFixed(COORD_DIGITS)}`
  return `https://yandex.ru/maps/?ll=${place}&z=18&pt=${place},pm2rdm`
})

async function copy(): Promise<void> {
  try {
    await navigator.clipboard.writeText(text.value)
    editor.toast('Координаты скопированы', 'success')
  } catch {
    editor.toast('Браузер не дал скопировать: выделите координаты вручную', 'error')
  }
}
</script>

<template>
  <div v-if="point" class="card">
    <div class="head">
      <strong class="ellipsis">{{ point.label }}</strong>
      <button class="icon" aria-label="Закрыть" @click="editor.identified = null"><X :size="13" /></button>
    </div>
    <div class="coords">{{ text }}</div>
    <div v-if="editor.crs !== 'EPSG:4326'" class="coords other">{{ editor.crs }}: {{ formatPosition(point, editor.crs, editor.projector) }}</div>
    <div class="actions">
      <button class="btn small" @click="copy"><Copy :size="12" aria-hidden="true" /> Копировать</button>
      <a class="btn small" :href="link" target="_blank" rel="noopener noreferrer"><ExternalLink :size="12" aria-hidden="true" /> Яндекс Карты</a>
    </div>
  </div>
</template>

<style scoped>
.card {
  position: absolute;
  top: 10px;
  left: 10px;
  z-index: 12;
  width: 230px;
  padding: 8px;
  background: var(--panel);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
}
.head {
  display: flex;
  justify-content: space-between;
  gap: 6px;
}
.icon {
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  padding: 0;
  background: transparent;
  border: 0;
}
.coords {
  margin: 5px 0 7px;
  font-variant-numeric: tabular-nums;
  user-select: all;
}
.actions {
  display: flex;
  gap: 5px;
}
.actions a {
  text-decoration: none;
}
</style>
