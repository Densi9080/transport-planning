<script setup lang="ts">
import { Columns2, ImageUp, Trash2 } from 'lucide-vue-next'
import { ref } from 'vue'

import { BASEMAP_OPTIONS } from '@/map/style'
import { useEditor } from '@/stores/editor'

const editor = useEditor()
const fileInput = ref<HTMLInputElement | null>(null)

const layerList = [
  { key: 'buildings', label: 'Здания' },
  { key: 'landuse', label: 'Территории и вода' },
  { key: 'minor', label: 'Тротуары и тропы' },
  { key: 'rail', label: 'Железная дорога' },
  { key: 'other', label: 'Прочие линии' },
  { key: 'points', label: 'Точечные объекты' },
  { key: 'turnPaths', label: 'Траектории на перекрёстках' },
  { key: 'arrows', label: 'Стрелки на полосах' },
  { key: 'crossings', label: 'Пешеходные переходы' },
  { key: 'signals', label: 'Светофоры' },
  { key: 'labels', label: 'Названия улиц' },
  { key: 'transit', label: 'Линии ОТ и остановки' },
  { key: 'issues', label: 'Ошибки на карте' },
] as const

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
    <label v-if="editor.basemap !== 'none'" class="slider">
      <span>Яркость подложки: {{ Math.round(editor.basemapOpacity * 100) }}%</span>
      <input v-model.number="editor.basemapOpacity" type="range" min="0.1" max="1" step="0.05" />
    </label>
    <label class="slider">
      <span>Непрозрачность модели: {{ Math.round(editor.modelOpacity * 100) }}%</span>
      <input v-model.number="editor.modelOpacity" type="range" min="0" max="1" step="0.05" />
    </label>
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
    <div class="eyebrow">Слои карты</div>
    <label v-for="layer in layerList" :key="layer.key" class="check">
      <input v-model="editor.layers[layer.key]" type="checkbox" />
      {{ layer.label }}
    </label>
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
.slider {
  display: flex;
  flex-direction: column;
  gap: 1px;
  font-size: 11px;
}
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
