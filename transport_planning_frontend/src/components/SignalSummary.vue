<script setup lang="ts">
import { TrafficCone } from 'lucide-vue-next'

import { editNumber, useSignalPlan } from '@/composables/useSignalPlan'
import { formatSeconds, SIGNAL_LABELS } from '@/sim/signalView'
import { useEditor } from '@/stores/editor'

import SignalBar from './SignalBar.vue'

/** Светофор в боковой панели: сколько горит каждый сигнал, и тут же можно это поправить. */
const props = defineProps<{ node: number }>()
const editor = useEditor()
const signal = useSignalPlan(() => props.node)

function placeSignal(): void {
  const node = editor.doc?.nodes.get(props.node)
  if (node) editor.toggleOnNode('signal', { nodeId: props.node, position: node })
}
</script>

<template>
  <div v-if="signal.group.value && signal.plan.value" class="section">
    <div class="row">
      <div class="eyebrow">Светофор, цикл {{ formatSeconds(signal.cycle.value) }} с</div>
      <span class="spacer" />
      <button v-if="!signal.guessed.value" class="btn small" @click="editor.openJunction(signal.group.value.owner, 'signal')">Все фазы</button>
    </div>

    <template v-if="signal.guessed.value">
      <p class="hint muted">Здесь нет светофора в данных: его предположила модель, поэтому настроить его нельзя. Поставьте настоящий, и план можно будет менять.</p>
      <button class="btn small block" @click="placeSignal"><TrafficCone :size="13" aria-hidden="true" /> Поставить светофор</button>
    </template>

    <div v-for="direction in signal.directions.value" :key="direction.key" class="direction">
      <div class="title">
        <span class="ellipsis" :title="`${direction.title}: ${direction.kinds}`">{{ direction.title }}</span>
        <span v-if="signal.liveState(direction)" class="state" :class="signal.liveState(direction)!.color">
          {{ SIGNAL_LABELS[signal.liveState(direction)!.color] }}<template v-if="Number.isFinite(signal.liveState(direction)!.left)">, ещё {{ Math.ceil(signal.liveState(direction)!.left) }} с</template>
        </span>
      </div>
      <div class="faint kinds ellipsis">{{ direction.kinds }}</div>
      <SignalBar :segments="direction.segments" :cycle="signal.cycle.value" :marker="signal.cycleTime.value" :labels="false" />
      <div class="times">
        <label class="time">
          <span class="dot green" aria-hidden="true" />
          <span class="sr-label">Зелёный, с: {{ direction.title }}</span>
          <input
            class="input"
            type="number"
            min="1"
            :value="direction.times.green"
            :disabled="signal.guessed.value || (direction.times.red === 0 && direction.times.yellow === 0)"
            @change="editNumber($event, direction.times.green, (value) => signal.setGreenTime(direction, value))"
          />
        </label>
        <span class="time fixed" title="Жёлтый задаётся для всего светофора в окне всех фаз">
          <span class="dot yellow" aria-hidden="true" />
          {{ formatSeconds(direction.times.yellow) }}
        </span>
        <label class="time">
          <span class="dot red" aria-hidden="true" />
          <span class="sr-label">Красный, с: {{ direction.title }}</span>
          <input
            class="input"
            type="number"
            min="0"
            :value="direction.times.red"
            :disabled="signal.guessed.value || direction.phases.length >= signal.plan.value.phases.length"
            @change="editNumber($event, direction.times.red, (value) => signal.setRedTime(direction, value))"
          />
        </label>
        <span class="faint unit">с</span>
      </div>
    </div>
    <p v-if="!signal.guessed.value" class="hint faint">Зелёный меняет фазу этого направления, красный меняет остальные фазы. Вместе с ними меняется и цикл.</p>
  </div>
</template>

<style scoped>
.hint {
  margin: 0;
  font-size: 11px;
}
.direction {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 4px 0;
  border-top: 1px solid var(--line);
}
.title {
  display: flex;
  justify-content: space-between;
  gap: 6px;
  font-weight: 600;
}
.kinds {
  font-size: 11px;
}
.state {
  flex: none;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  font-weight: 400;
}
.state.green {
  color: var(--ok-text);
}
.state.yellow {
  color: var(--warn-text);
}
.state.red {
  color: var(--err-text);
}
.times {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 2px;
}
.time {
  display: flex;
  align-items: center;
  gap: 3px;
  font-variant-numeric: tabular-nums;
}
.time .input {
  width: 58px;
  height: 22px;
  padding: 0 2px 0 4px;
}
.time.fixed {
  min-width: 34px;
}
.dot {
  flex: none;
  width: 9px;
  height: 9px;
  border-radius: 50%;
}
.dot.green {
  background: #15803d;
}
.dot.yellow {
  background: #eab308;
}
.dot.red {
  background: #c62f2f;
}
.unit {
  margin-left: -4px;
  font-size: 11px;
}
.sr-label {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
</style>
