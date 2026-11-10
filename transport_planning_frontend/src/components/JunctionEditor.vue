<script setup lang="ts">
import { X } from 'lucide-vue-next'
import { computed, onMounted, ref } from 'vue'

import { useEditor } from '@/stores/editor'

import JunctionSchematic from './JunctionSchematic.vue'
import SignalCalcPanel from './SignalCalcPanel.vue'
import SignalPlanEditor from './SignalPlanEditor.vue'

const editor = useEditor()
const dialog = ref<HTMLDialogElement | null>(null)
const tab = ref<'lanes' | 'signal' | 'calc'>(editor.junctionTab)

const nodeId = computed(() => editor.junctionNode!)

const title = computed(() => {
  void editor.rev
  const doc = editor.doc
  if (!doc) return ''
  const names = [...new Set(doc.waysOfNode(nodeId.value).map((id) => doc.ways.get(id)?.tags?.name).filter(Boolean))]
  return names.slice(0, 3).join(' / ') || `Узел ${nodeId.value}`
})

function close(): void {
  editor.junctionNode = null
}

onMounted(() => dialog.value?.showModal())
</script>

<template>
  <dialog ref="dialog" class="dialog" aria-labelledby="junction-title" @close="close">
    <div class="dock-title">
      <span id="junction-title" class="ellipsis">Редактор узла: {{ title }}</span>
      <span class="faint id">#{{ nodeId }}</span>
      <span class="spacer" />
      <button class="btn ghost small" aria-label="Закрыть" @click="close"><X :size="14" /></button>
    </div>
    <div class="dock-tabs" role="tablist">
      <button role="tab" :class="{ active: tab === 'lanes' }" :aria-selected="tab === 'lanes'" @click="tab = 'lanes'">Полосы и повороты</button>
      <button role="tab" :class="{ active: tab === 'signal' }" :aria-selected="tab === 'signal'" @click="tab = 'signal'">Светофор и фазы</button>
      <button role="tab" :class="{ active: tab === 'calc' }" :aria-selected="tab === 'calc'" @click="tab = 'calc'">Расчёт цикла</button>
    </div>
    <div class="content">
      <JunctionSchematic v-if="tab === 'lanes'" :node="nodeId" />
      <SignalPlanEditor v-else-if="tab === 'signal'" :node="nodeId" />
      <SignalCalcPanel v-else :node="nodeId" />
    </div>
  </dialog>
</template>

<style scoped>
.dialog {
  width: min(1040px, calc(100vw - 24px));
  height: min(720px, calc(100vh - 24px));
  padding: 0;
  background: var(--panel);
  border: 1px solid var(--line-strong);
  color: var(--text);
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.35);
}
.dialog[open] {
  display: flex;
  flex-direction: column;
}
.dialog::backdrop {
  background: rgba(20, 25, 32, 0.4);
}
.id {
  font-weight: 400;
  font-variant-numeric: tabular-nums;
}
.content {
  flex: 1;
  min-height: 0;
  padding: 10px;
  overflow: auto;
}
</style>
