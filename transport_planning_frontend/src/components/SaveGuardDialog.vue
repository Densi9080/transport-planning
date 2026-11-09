<script setup lang="ts">
import { useEditor } from '@/stores/editor'

const editor = useEditor()
</script>

<template>
  <div class="backdrop" role="dialog" aria-modal="true" aria-labelledby="save-guard-title">
    <div class="box">
      <h2 id="save-guard-title">Есть несохранённые правки</h2>
      <p class="muted">Сохраните их перед выходом из редактирования или отмените. Отмена вернёт проект к последнему сохранению.</p>
      <div class="actions">
        <button class="btn primary" @click="editor.resolveLeave('save')">Сохранить</button>
        <button class="btn" @click="editor.resolveLeave('discard')">Не сохранять</button>
        <button class="btn" @click="editor.resolveLeave('cancel')">Продолжить правку</button>
      </div>
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
  background: rgba(0, 0, 0, 0.45);
}
.box {
  width: min(420px, calc(100vw - 32px));
  padding: 16px;
  background: var(--panel);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
}
h2 {
  margin: 0 0 6px;
  font-size: 15px;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 12px;
}
</style>
