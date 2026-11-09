<script setup lang="ts">
import { Trash2 } from 'lucide-vue-next'
import { computed } from 'vue'

import { nearStopPoints, stopPointOfArea } from '@/core/transitCalc'
import type { ONode } from '@/core/types'
import { useEditor } from '@/stores/editor'

const props = defineProps<{ node: ONode }>()
const editor = useEditor()
const SEARCH_REACH_M = 300

const bound = computed(() => {
  void editor.rev
  return editor.doc && editor.projector ? stopPointOfArea(editor.doc, editor.projector, props.node) : null
})

const options = computed(() => {
  void editor.rev
  return editor.doc && editor.projector ? nearStopPoints(editor.doc, editor.projector, props.node, SEARCH_REACH_M) : []
})

function nameOf(node: ONode): string {
  return node.tags?.name ?? `Пункт ${node.id}`
}

function choose(event: Event): void {
  const value = (event.target as HTMLSelectElement).value
  const tags = { ...(props.node.tags ?? {}) }
  if (value) tags['tp:stop_point'] = value
  else delete tags['tp:stop_point']
  editor.updateNodeTags(props.node.id, tags, 'Привязка зоны остановки')
}
</script>

<template>
  <div class="section">
    <h2>Зона остановки</h2>
    <p class="muted">{{ node.tags?.name ?? `Узел ${node.id}` }}</p>
    <div class="field">
      <label for="area-point">Пункт остановки</label>
      <select id="area-point" class="input" :value="node.tags?.['tp:stop_point'] ?? ''" @change="choose">
        <option value="">Автоматически: ближайший</option>
        <option v-for="item in options" :key="item.node.id" :value="String(item.node.id)">{{ nameOf(item.node) }}, {{ Math.round(item.distanceM) }} м</option>
      </select>
    </div>
    <p v-if="bound" class="muted">
      Сейчас привязана к пункту «{{ nameOf(bound.node) }}»{{ bound.explicit ? '' : ', выбран как ближайший' }}.
      <button class="link" @click="editor.focusOn(bound!.node, 18.5)">Показать</button>
    </p>
    <p v-else class="bad">Рядом нет пункта остановки: посадка в этой зоне не свяжется с маршрутом.</p>
    <button class="btn block" @click="editor.requestDeleteSelection"><Trash2 :size="13" aria-hidden="true" /> Удалить зону</button>
  </div>
</template>

<style scoped>
.link {
  padding: 0;
  background: transparent;
  border: 0;
  color: var(--accent);
  cursor: pointer;
}
.bad {
  color: var(--err-text);
}
</style>
