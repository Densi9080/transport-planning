<script setup lang="ts">
import { Columns2, ImageUp, Trash2, X } from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'

import { BASEMAP_OPTIONS, isTileTemplate, TILE_CRS_OPTIONS } from '@/map/style'
import { useEditor } from '@/stores/editor'

/** Подложка целиком: источник, свой адрес тайлов с проекцией, карта рядом и свой снимок. */
const editor = useEditor()
const fileInput = ref<HTMLInputElement | null>(null)
const backdrop = ref<HTMLElement | null>(null)

const urlProblem = computed(() => {
  const url = editor.customTileUrl.trim()
  if (!url) return 'Вставьте адрес тайлов.'
  if (!url.startsWith('https://')) return 'Нужен адрес https://: браузер не загрузит тайлы по http со страницы редактора.'
  if (!isTileTemplate(url)) return 'В адресе нужны все три подстановки: {z}, {x} и {y}.'
  return ''
})

function close(): void {
  editor.basemapDialogOpen = false
}

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

onMounted(() => backdrop.value?.focus())
</script>

<template>
  <div ref="backdrop" class="backdrop" role="dialog" aria-modal="true" aria-labelledby="basemap-title" tabindex="-1" @keydown.esc="close" @click.self="close">
    <div class="box">
      <header>
        <h2 id="basemap-title">Подложка</h2>
        <button class="icon" aria-label="Закрыть" @click="close"><X :size="15" /></button>
      </header>

      <div class="field">
        <label for="basemap-source">Источник</label>
        <select id="basemap-source" v-model="editor.basemap" class="input">
          <option v-for="option in BASEMAP_OPTIONS" :key="option.id" :value="option.id">{{ option.label }}</option>
          <option value="custom">Свой адрес тайлов</option>
        </select>
        <span v-if="editor.basemap.startsWith('yandex')" class="faint note">
          Яндекс режет тайлы в EPSG:3395 (Меркатор на эллипсоиде). Редактор пересчитывает каждую строку пикселей в EPSG:3857,
          поэтому дороги на подложке совпадают с графом, а не съезжают на ~20 км к югу.
        </span>
      </div>

      <template v-if="editor.basemap === 'custom'">
        <div class="field">
          <label for="tile-url">Адрес тайлов с &#123;z&#125;, &#123;x&#125;, &#123;y&#125;</label>
          <input id="tile-url" v-model.lazy="editor.customTileUrl" class="input" spellcheck="false" placeholder="https://…/{z}/{x}/{y}.png?key=…" />
          <span v-if="urlProblem" class="note warn">{{ urlProblem }}</span>
          <span v-else class="faint note">Ключ API, если он есть в адресе, хранится только в этом браузере.</span>
        </div>
        <div class="field">
          <label for="tile-crs">Проекция тайлов</label>
          <select id="tile-crs" v-model="editor.customTileCrs" class="input">
            <option v-for="option in TILE_CRS_OPTIONS" :key="option.id" :value="option.id">{{ option.label }}</option>
          </select>
          <span class="faint note">Для адресов Яндекса проекция выбирается сама. Если подложка сдвинута по вертикали, смените её здесь.</span>
        </div>
      </template>

      <button class="btn block" :class="{ on: editor.compareOpen }" :aria-pressed="editor.compareOpen" @click="editor.compareOpen = !editor.compareOpen">
        <Columns2 :size="13" aria-hidden="true" /> Подложка рядом с графом
      </button>

      <div class="field">
        <span class="label">Свой снимок</span>
        <div class="row">
          <button class="btn grow" @click="fileInput?.click()">
            <ImageUp :size="13" aria-hidden="true" /> {{ editor.imageUnderlay ? 'Заменить снимок' : 'Загрузить снимок' }}
          </button>
          <button v-if="editor.imageUnderlay" class="btn" aria-label="Убрать снимок" @click="editor.clearImageUnderlay"><Trash2 :size="13" /></button>
        </div>
        <input ref="fileInput" type="file" accept="image/*" hidden @change="onImage" />
        <span v-if="editor.imageUnderlay" class="faint note">Совместите снимок с графом, перетаскивая углы на карте.</span>
      </div>

      <footer>
        <button class="btn primary" @click="close">Готово</button>
      </footer>
    </div>
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
  outline: none;
}
.box {
  display: flex;
  flex-direction: column;
  gap: 10px;
  width: min(440px, 100%);
  padding: 12px;
  background: var(--panel);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
}
header,
footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
footer {
  justify-content: flex-end;
}
h2 {
  margin: 0;
  font-size: 15px;
}
.icon {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  padding: 0;
  background: transparent;
  border: 0;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.label {
  color: var(--muted);
}
.row {
  display: flex;
  gap: 6px;
}
.grow {
  flex: 1;
}
.note {
  font-size: 11px;
}
.warn {
  color: var(--warn-text);
}
.btn.on {
  background: var(--row-selected);
  border-color: var(--accent);
}
</style>
