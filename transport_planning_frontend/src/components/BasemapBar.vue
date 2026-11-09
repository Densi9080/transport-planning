<script setup lang="ts">
import { Columns2, ImageUp, Layers, Trash2 } from 'lucide-vue-next'
import { ref } from 'vue'

import { BASEMAP_OPTIONS } from '@/map/style'
import { useEditor } from '@/stores/editor'

const editor = useEditor()
const open = ref(false)
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
  <div class="bar panel">
    <div class="row head">
      <button class="btn ghost small toggle" :aria-expanded="open" @click="open = !open">
        <Layers :size="14" aria-hidden="true" />
        Подложка
      </button>
      <select v-model="editor.basemap" class="input select" aria-label="Источник подложки">
        <option v-for="option in BASEMAP_OPTIONS" :key="option.id" :value="option.id">{{ option.label }}</option>
        <option value="custom">Свой адрес тайлов…</option>
      </select>
      <button
        class="btn ghost small icon"
        :class="{ pressed: editor.compareOpen }"
        :aria-pressed="editor.compareOpen"
        title="Подложка рядом с графом"
        aria-label="Показать подложку рядом с графом"
        @click="editor.compareOpen = !editor.compareOpen"
      >
        <Columns2 :size="14" />
      </button>
    </div>

    <div v-if="open || editor.basemap === 'custom'" class="details">
      <label v-if="editor.basemap !== 'none'" class="slider">
        <span class="faint">Яркость подложки</span>
        <input v-model.number="editor.basemapOpacity" type="range" min="0.1" max="1" step="0.05" />
      </label>
      <label class="slider">
        <span class="faint">Прозрачность модели</span>
        <input v-model.number="editor.modelOpacity" type="range" min="0" max="1" step="0.05" />
      </label>

      <div v-if="editor.basemap === 'custom'" class="field">
        <label for="tile-url">Адрес тайлов с &#123;z&#125;, &#123;x&#125;, &#123;y&#125;</label>
        <input
          id="tile-url"
          v-model.lazy="editor.customTileUrl"
          class="input"
          placeholder="https://…/{z}/{x}/{y}.png?key=…"
        />
        <span class="faint note">Например, тайлы 2ГИС, Google или Яндекса с вашим ключом API. Ключ хранится только в этом браузере.</span>
      </div>

      <div class="field">
        <label>Свой снимок или скриншот карты</label>
        <div class="row">
          <button class="btn small grow" @click="fileInput?.click()">
            <ImageUp :size="13" aria-hidden="true" /> {{ editor.imageUnderlay ? 'Заменить' : 'Загрузить' }}
          </button>
          <button v-if="editor.imageUnderlay" class="btn small" aria-label="Убрать снимок" @click="editor.clearImageUnderlay">
            <Trash2 :size="13" />
          </button>
        </div>
        <input ref="fileInput" type="file" accept="image/*" hidden @change="onImage" />
        <span v-if="editor.imageUnderlay" class="faint note">Совместите снимок с графом, перетаскивая углы на карте.</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.bar {
  position: absolute;
  left: 8px;
  bottom: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 4px;
  width: 300px;
  z-index: 12;
}
@media (max-width: 1240px) {
  .bar {
    bottom: 72px;
    width: 270px;
  }
}
.head {
  gap: 4px;
}
.toggle {
  flex: none;
}
.select {
  flex: 1;
  min-width: 0;
  min-height: 24px;
  padding: 1px 4px;
  font-size: 12px;
}
.icon {
  flex: none;
  padding: 2px 5px;
}
.icon.pressed {
  color: var(--select);
}
.details {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 6px;
}
.slider {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12px;
}
.slider input {
  accent-color: var(--accent);
}
.grow {
  flex: 1;
}
.note {
  font-size: 11px;
}
</style>
