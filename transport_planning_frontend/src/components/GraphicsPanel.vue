<script setup lang="ts">
import { useEditor } from '@/stores/editor'

/** Показ графа. Подложка настраивается в меню «Подложка» вверху, здесь её нет, чтобы не было двух мест. */
const editor = useEditor()
</script>

<template>
  <section class="section">
    <div class="eyebrow">Система координат</div>
    <button class="btn block" @click="editor.crsDialogOpen = true">{{ editor.crs }}: выбрать</button>
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
.note {
  font-size: 11px;
}
</style>
