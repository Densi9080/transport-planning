<script setup lang="ts">
import { X } from 'lucide-vue-next'
import { onMounted, ref } from 'vue'

import { useEditor } from '@/stores/editor'

const editor = useEditor()
const dialog = ref<HTMLDialogElement | null>(null)

const groups = [
  {
    title: 'Инструменты',
    items: [
      ['V', 'Выбор'],
      ['D', 'Новая дорога'],
      ['N', 'Новый узел'],
      ['X', 'Разрезать дорогу'],
      ['T', 'Светофор'],
      ['C', 'Пешеходный переход'],
      ['B', 'Мост'],
      ['G', 'Тоннель'],
    ],
  },
  {
    title: 'Правка',
    items: [
      ['Ctrl+Z', 'Отменить'],
      ['Ctrl+Y', 'Повторить'],
      ['Del', 'Удалить выбранное'],
      ['F', 'Развернуть направление'],
      ['M', 'Склеить выбранные узлы'],
      ['U', 'Расклеить перекрёсток'],
      ['J', 'Объединить две дороги'],
      ['[ ]', 'Меньше или больше полос'],
    ],
  },
  {
    title: 'Мышь и рисование',
    items: [
      ['Shift+клик', 'Добавить к выбору'],
      ['Перетащить узел', 'Подвести к другому, чтобы склеить'],
      ['Alt', 'Отключить прилипание'],
      ['Shift', 'Рисовать под углом с шагом 15°'],
      ['Enter', 'Закончить дорогу'],
      ['Backspace', 'Убрать последнюю точку'],
      ['Esc', 'Отмена и возврат к выбору'],
      ['H', 'Показать весь участок'],
    ],
  },
]

onMounted(() => dialog.value?.showModal())
</script>

<template>
  <dialog ref="dialog" class="dialog" aria-labelledby="help-title" @close="editor.helpOpen = false">
    <div class="head">
      <h2 id="help-title">Горячие клавиши</h2>
      <button class="btn ghost small" aria-label="Закрыть" @click="editor.helpOpen = false"><X :size="15" /></button>
    </div>
    <div class="groups">
      <section v-for="group in groups" :key="group.title">
        <div class="eyebrow">{{ group.title }}</div>
        <div v-for="[key, label] in group.items" :key="key" class="line">
          <kbd>{{ key }}</kbd>
          <span>{{ label }}</span>
        </div>
      </section>
    </div>
  </dialog>
</template>

<style scoped>
.dialog {
  width: min(760px, calc(100vw - 32px));
  padding: 16px;
  background: var(--panel-solid);
  border: 1px solid var(--line-strong);
  border-radius: 12px;
  color: var(--text);
}
.dialog::backdrop {
  background: rgba(0, 0, 0, 0.55);
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}
.groups {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: 16px;
}
section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.line {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
