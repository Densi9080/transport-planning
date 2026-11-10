<script setup lang="ts">
import { Combine, Merge, Sparkles, Spline, Trash2 } from 'lucide-vue-next'
import { computed } from 'vue'

import { customObjectOf } from '@/core/netObjects'
import { isZoneWay } from '@/core/zones'
import StopAreaInspector from './StopAreaInspector.vue'
import StopInspector from './StopInspector.vue'
import StopPointInspector from './StopPointInspector.vue'
import { useAssistant } from '@/stores/assistant'
import { useEditor } from '@/stores/editor'

import AssistantPanel from './AssistantPanel.vue'
import LaneSection from './LaneSection.vue'
import NetObjectInspector from './NetObjectInspector.vue'
import NodeInspector from './NodeInspector.vue'
import TurnInspector from './TurnInspector.vue'
import RoadPresets from './RoadPresets.vue'
import SimPanel from './SimPanel.vue'
import WayInspector from './WayInspector.vue'
import ZoneInspector from './ZoneInspector.vue'

const editor = useEditor()
const assistant = useAssistant()
const pendingProposals = computed(() => assistant.proposals.filter((item) => item.status === 'pending').length)

const ways = computed(() => editor.selectedWays)
const nodes = computed(() => editor.selectedNodes)
const isSingleWay = computed(() => ways.value.length === 1 && nodes.value.length === 0)
const isSingleNode = computed(() => nodes.value.length === 1 && ways.value.length === 0)
const isMulti = computed(() => ways.value.length + nodes.value.length > 1)
</script>

<template>
  <aside class="inspector" aria-label="Быстрый просмотр и помощник">
    <div class="dock-tabs" role="tablist">
      <button role="tab" :class="{ active: editor.rightTab === 'quick' }" :aria-selected="editor.rightTab === 'quick'" @click="editor.rightTab = 'quick'">
        {{ editor.viewMode === 'sim' ? 'Расчёт' : 'Быстрый просмотр' }}
      </button>
      <button v-if="editor.rightTab === 'assistant'" role="tab" class="active" :aria-selected="editor.rightTab === 'assistant'" @click="editor.rightTab = 'assistant'">
        <Sparkles :size="12" aria-hidden="true" /> Помощник
        <span v-if="pendingProposals" class="badge">{{ pendingProposals }}</span>
      </button>
    </div>
    <AssistantPanel v-show="editor.rightTab === 'assistant'" />
    <div v-show="editor.rightTab === 'quick'" class="quick">
    <SimPanel v-if="editor.viewMode === 'sim'" />
    <RoadPresets v-else-if="editor.tool === 'road'" />
    <TurnInspector v-else-if="editor.selectedTurn" :key="`turn${editor.selectedTurn.node}-${editor.selectedTurn.from}`" />
    <StopInspector v-else-if="editor.selectedStop && ways.length + nodes.length === 0" :key="`stop${editor.selectedStop.id}`" />
    <StopAreaInspector v-else-if="isSingleWay && ways[0]!.tags?.public_transport === 'platform'" :key="`areaw${ways[0]!.id}`" kind="way" :id="ways[0]!.id" />
    <ZoneInspector v-else-if="isSingleWay && isZoneWay(ways[0])" :key="`zone${ways[0]!.id}`" :way="ways[0]!" />
    <template v-else-if="isSingleWay">
      <LaneSection :way="ways[0]!" />
      <WayInspector :key="ways[0]!.id" :way="ways[0]!" />
    </template>
    <StopAreaInspector v-else-if="isSingleNode && nodes[0]!.tags?.public_transport === 'platform'" :key="`area${nodes[0]!.id}`" kind="node" :id="nodes[0]!.id" />
    <template v-else-if="isSingleNode && editor.stopHierarchy?.points.has(nodes[0]!.id)">
      <StopPointInspector :key="`point${nodes[0]!.id}`" :node="nodes[0]!" />
      <NodeInspector :key="nodes[0]!.id" :node="nodes[0]!" />
    </template>
    <NetObjectInspector v-else-if="isSingleNode && customObjectOf(nodes[0]!.tags)" :key="`object${nodes[0]!.id}`" :node="nodes[0]!" />
    <NodeInspector v-else-if="isSingleNode" :key="nodes[0]!.id" :node="nodes[0]!" />
    <div v-else-if="isMulti" class="section">
      <h2>Выбрано объектов: {{ ways.length + nodes.length }}</h2>
      <p class="muted">Дорог: {{ ways.length }}, узлов: {{ nodes.length }}</p>
      <button v-if="nodes.length >= 2" class="btn block" @click="editor.mergeSelected">
        <Merge :size="14" aria-hidden="true" /> Склеить узлы <kbd>M</kbd>
      </button>
      <button v-if="ways.length === 2" class="btn block" @click="editor.joinSelected">
        <Combine :size="14" aria-hidden="true" /> Объединить дороги <kbd>J</kbd>
      </button>
      <button v-if="ways.length >= 1" class="btn block" @click="editor.reverseSelected">
        <Spline :size="14" aria-hidden="true" /> Развернуть направление <kbd>F</kbd>
      </button>
      <button class="btn block danger" @click="editor.deleteSelection">
        <Trash2 :size="14" aria-hidden="true" /> Удалить <kbd>Del</kbd>
      </button>
    </div>
    <div v-else>
      <div class="empty">
        <p class="muted">Щёлкните по дороге или узлу, чтобы увидеть и изменить их атрибуты.</p>
        <p class="muted">Двойной щелчок по узлу откроет редактор узла со схемой полос и фазами светофора.</p>
        <p class="muted">Новая дорога: инструмент на панели или клавиша <kbd>D</kbd>.</p>
      </div>
    </div>
    </div>
  </aside>
</template>

<style scoped>
.inspector {
  flex: none;
  display: flex;
  flex-direction: column;
  width: 320px;
  min-height: 0;
  background: var(--panel);
  border-left: 1px solid var(--line-strong);
}
.quick {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
.badge {
  min-width: 14px;
  padding: 0 3px;
  background: var(--warn);
  border-radius: 7px;
  color: #fff;
  font-size: 10px;
  line-height: 14px;
  text-align: center;
}
h2 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}
.empty {
  padding: 14px 12px;
}
.empty p {
  margin: 8px 0 0;
}
kbd {
  margin-left: auto;
}
</style>
