<script setup lang="ts">
import { Copy, ExternalLink } from 'lucide-vue-next'
import { computed, ref } from 'vue'

import { formatPosition, resolveCrs } from '@/core/crs'
import { WGS84_ID } from '@/core/crsCatalog'
import { useEditor } from '@/stores/editor'

const props = defineProps<{ x: number; y: number; lat: number; lon: number }>()
const emit = defineEmits<{ close: [] }>()

const editor = useEditor()
const COORD_DIGITS = 6
const chosen = ref(editor.crs)

const options = computed(() => {
  const ids = [...new Set([editor.crs, WGS84_ID, ...editor.recentCrs])]
  return ids.map((id) => ({ id, name: resolveCrs(id)?.name ?? id }))
})
const point = computed(() => ({ lat: props.lat, lon: props.lon }))
const text = computed(() => formatPosition(point.value, chosen.value, editor.projector))
const link = computed(() => {
  const place = `${props.lon.toFixed(COORD_DIGITS)},${props.lat.toFixed(COORD_DIGITS)}`
  return `https://yandex.ru/maps/?ll=${place}&z=18&pt=${place},pm2rdm`
})

async function copy(): Promise<void> {
  try {
    await navigator.clipboard.writeText(text.value)
    editor.toast('Координаты скопированы', 'success')
    emit('close')
  } catch {
    editor.toast('Браузер не дал скопировать: выделите координаты вручную', 'error')
  }
}

function otherCrs(): void {
  editor.crsDialogOpen = true
  emit('close')
}
</script>

<template>
  <div class="menu" role="menu" :style="{ left: `${x}px`, top: `${y}px` }" @contextmenu.prevent>
    <select v-model="chosen" class="input" aria-label="Система координат">
      <option v-for="item in options" :key="item.id" :value="item.id">{{ item.id }}: {{ item.name }}</option>
    </select>
    <div class="coords">{{ text }}</div>
    <button role="menuitem" @click="copy"><Copy :size="13" aria-hidden="true" /> Копировать координаты</button>
    <a role="menuitem" :href="link" target="_blank" rel="noopener noreferrer" @click="emit('close')"><ExternalLink :size="13" aria-hidden="true" /> Открыть в Яндекс Картах</a>
    <button role="menuitem" @click="otherCrs">Другая система координат…</button>
  </div>
</template>

<style scoped>
.menu {
  position: absolute;
  z-index: 20;
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 280px;
  padding: 5px;
  background: var(--panel);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.3);
}
.coords {
  padding: 4px 3px;
  font-variant-numeric: tabular-nums;
  user-select: all;
}
button,
a {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px;
  background: transparent;
  border: 0;
  color: var(--text);
  text-align: left;
  text-decoration: none;
}
button:hover,
a:hover {
  background: var(--row-hover);
}
</style>
