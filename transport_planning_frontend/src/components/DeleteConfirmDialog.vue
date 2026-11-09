<script setup lang="ts">
import { onMounted, ref } from 'vue'

import { useEditor } from '@/stores/editor'

const editor = useEditor()
const yes = ref<HTMLButtonElement | null>(null)

onMounted(() => yes.value?.focus())
</script>

<template>
  <div class="backdrop" role="alertdialog" aria-modal="true" aria-labelledby="delete-title" @keydown.esc="editor.cancelDelete" @click.self="editor.cancelDelete">
    <div class="box">
      <h2 id="delete-title">Удалить?</h2>
      <p>{{ editor.deleteRequest?.label }}</p>
      <div class="actions">
        <button ref="yes" class="btn primary" @click="editor.confirmDelete">Да</button>
        <button class="btn" @click="editor.cancelDelete">Нет</button>
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
  width: min(360px, calc(100vw - 32px));
  padding: 16px;
  background: var(--panel);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
}
h2 {
  margin: 0 0 6px;
  font-size: 15px;
}
p {
  margin: 0;
}
.actions {
  display: flex;
  gap: 6px;
  margin-top: 12px;
}
</style>
