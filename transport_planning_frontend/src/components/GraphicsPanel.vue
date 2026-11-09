<script setup lang="ts">
import { Columns2, ImageUp, Trash2 } from 'lucide-vue-next'
import { ref } from 'vue'

import { CRS_OPTIONS } from '@/core/crs'
import { BASEMAP_OPTIONS } from '@/map/style'
import { useEditor } from '@/stores/editor'

const editor = useEditor()
const fileInput = ref<HTMLInputElement | null>(null)

function onImage(event: Event): void {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (!file.type.startsWith('image/')) {
    editor.toast('Выберите файл с картинкой', 'error')
    return
  }
  const reader = new FileReader()
  reader.onload = () => editor.setImageUnderlay(String(reader.result))
  reader.onerror = () => editor.toast('Не удалось прочитать файл', 'error')
  reader.readAsDataURL(file)
}
</script>

<template>
  <section class="section">
    <div class="eyebrow">Подложка</div>
    <select v-model="editor.basemap" class="input" aria-label="Источник подложки">
      <option v-for="option in BASEMAP_OPTIONS" :key="option.id" :value="option.id">{{ option.label }}</option>
      <option value="custom">Свой адрес тайлов…</option>
    </select>
    <div v-if="editor.basemap === 'custom'" class="field">
      <label for="tile-url">Адрес тайлов с &#123;z&#125;, &#123;x&#125;, &#123;y&#125;</label>
      <input id="tile-url" v-model.lazy="editor.customTileUrl" class="input" placeholder="https://…/{z}/{x}/{y}.png?key=…" />
      <span class="faint note">Например, тайлы 2ГИС, Google или Яндекса с вашим ключом API. Ключ хранится только в этом браузере.</span>
    </div>
    <button class="btn block" :class="{ on: editor.compareOpen }" :aria-pressed="editor.compareOpen" @click="editor.compareOpen = !editor.compareOpen">
      <Columns2 :size="13" aria-hidden="true" /> Подложка рядом с графом
    </button>
    <div class="row">
      <button class="btn grow" @click="fileInput?.click()">
        <ImageUp :size="13" aria-hidden="true" /> {{ editor.imageUnderlay ? 'Заменить снимок' : 'Загрузить свой снимок' }}
      </button>
      <button v-if="editor.imageUnderlay" class="btn" aria-label="Убрать снимок" @click="editor.clearImageUnderlay"><Trash2 :size="13" /></button>
    </div>
    <input ref="fileInput" type="file" accept="image/*" hidden @change="onImage" />
    <span v-if="editor.imageUnderlay" class="faint note">Совместите снимок с графом, перетаскивая углы на карте.</span>
  </section>

  <section class="section">
    <div class="eyebrow">Система координат</div>
    <select v-model="editor.crs" class="input" aria-label="Система координат">
      <option v-for="option in CRS_OPTIONS" :key="option.id" :value="option.id">{{ option.label }}</option>
    </select>
    <span class="faint note">Меняет только показ координат. В файле .osm они всегда в WGS 84.</span>
  </section>

  <section class="section">
    <div class="eyebrow">Оформление</div>
    <div class="segmented" role="group" aria-label="Тема">
      <button :class="{ active: editor.theme === 'light' }" :aria-pressed="editor.theme === 'light'" @click="editor.theme = 'light'">Светлая</button>
      <button :class="{ active: editor.theme === 'dark' }" :aria-pressed="editor.theme === 'dark'" @click="editor.theme = 'dark'">Тёмная</button>
    </div>
  </section>
</template>

<style scoped>
.grow {
  flex: 1;
}
.note {
  font-size: 11px;
}
.btn.on {
  background: var(--row-selected);
  border-color: var(--accent);
}
</style>
