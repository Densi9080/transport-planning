<script setup lang="ts">
import { computed } from 'vue'

import { type Movement, type TurnKind } from '@/core/topology'
import { outLaneFor } from '@/core/scene'
import { readTurnAttrs, TURN_TSYS, type TurnAttrs } from '@/core/turnAttrs'
import { useEditor } from '@/stores/editor'

const editor = useEditor()

const KIND_LABELS: Record<TurnKind, string> = { left: 'Налево', through: 'Прямо', right: 'Направо', reverse: 'Разворот' }
const KIND_TYPES: Record<TurnKind, number> = { right: 1, through: 2, left: 3, reverse: 4 }

const turn = computed(() => editor.selectedTurn!)
const movements = computed(() => editor.turnMovements)
const current = computed<Movement | undefined>(() => movements.value.find((item) => item.to.neighbor === turn.value.to))

function nameOf(movementArm: Movement['from']): string {
  return editor.doc?.ways.get(movementArm.link.wayId)?.tags?.name ?? `отрезок ${movementArm.link.wayId}`
}

const attrs = computed<TurnAttrs>(() => {
  void editor.rev
  return editor.doc ? readTurnAttrs(editor.doc, turn.value.node, turn.value.from, turn.value.to) : { capacity: '', penalty: '', tsys: [] }
})

function update(patch: Partial<TurnAttrs>): void {
  editor.updateTurnAttrs({ ...attrs.value, ...patch })
}

/** Полосы манёвра берутся из тех же соединений, что на карте и в редакторе узла. */
function lanesOf(toNeighbor: number) {
  return editor.turnConnectors.filter((c) => c.to.neighbor === toNeighbor)
}
const lanes = computed(() => lanesOf(turn.value.to).slice().sort((a, b) => b.fromLane - a.fromLane))

/** Номер полосы для человека: первая — крайняя правая. */
function inNumber(index: number): number {
  return (current.value?.from.lanesIn ?? 0) - index
}
function outNumber(index: number): number {
  return (current.value?.to.lanesOut ?? 0) - index
}

const missingLanes = computed(() => {
  const used = new Set(lanes.value.map((c) => c.fromLane))
  return Array.from({ length: current.value?.from.lanesIn ?? 0 }, (_, i) => i).filter((i) => !used.has(i))
})

function addLane(event: Event): void {
  const value = (event.target as HTMLSelectElement).value
  if (value === '' || !current.value) return
  const fromLane = Number(value)
  // Выезд — ближняя полоса по ходу манёвра, как у автоматических соединений: направо отсчёт
  // от правого края, налево — от левого. Раньше всегда считали справа, и левый поворот с правой
  // полосы уходил в дальнюю полосу выезда
  const used = [...lanes.value.map((c) => c.fromLane), fromLane].sort((a, b) => a - b)
  const toLane = outLaneFor(used.indexOf(fromLane), used.length, current.value.to.lanesOut, current.value.kind)
  editor.setTurnLane(fromLane, toLane, true)
  ;(event.target as HTMLSelectElement).value = ''
}

function movementState(item: Movement): string {
  const count = lanesOf(item.to.neighbor).length
  if (!item.allowed) return 'запрещён'
  if (count === 0) return 'нет полосы'
  return `полос ${count}`
}

function isOpenFor(system: string): boolean {
  return attrs.value.tsys.length === 0 || attrs.value.tsys.includes(system)
}

function toggleSystem(system: string): void {
  const open = TURN_TSYS.map((item) => item.id).filter(isOpenFor)
  const next = open.includes(system) ? open.filter((item) => item !== system) : [...open, system]
  update({ tsys: next.length === TURN_TSYS.length ? [] : next })
}
</script>

<template>
  <div v-if="current" class="section">
    <h2>Поворот: {{ KIND_LABELS[current.kind] }}</h2>
    <p class="route"><i class="from" aria-hidden="true" /> Откуда: {{ nameOf(current.from) }}</p>
    <p class="route"><i class="to" aria-hidden="true" /> Куда: {{ nameOf(current.to) }}</p>
    <p class="muted">Узел {{ turn.node }}, тип поворота {{ KIND_TYPES[current.kind] }}, полос на въезде {{ current.from.lanesIn }}, на выезде {{ current.to.lanesOut }}</p>

    <label class="check"><input type="checkbox" :checked="current.allowed && lanes.length > 0" @change="editor.setTurnAllowed(current!.to.neighbor, ($event.target as HTMLInputElement).checked)" /> Поворот разрешён</label>

    <h3>Полосы манёвра: {{ lanes.length }}</h3>
    <div class="lanes">
      <button
        class="lane-row"
        :class="{ active: turn.fromLane === null }"
        :aria-pressed="turn.fromLane === null"
        @click="editor.selectTurn(turn.node, turn.from, turn.to, null)"
      >Все полосы</button>
      <div v-for="lane in lanes" :key="`${lane.fromLane}-${lane.toLane}`" class="lane-item">
        <button
          class="lane-row"
          :class="{ active: turn.fromLane === lane.fromLane }"
          :aria-pressed="turn.fromLane === lane.fromLane"
          @click="editor.selectTurn(turn.node, turn.from, turn.to, lane.fromLane)"
        >
          <i class="from" aria-hidden="true" /> полоса {{ inNumber(lane.fromLane) }} <span class="arrow">→</span> <i class="to" aria-hidden="true" /> полоса {{ outNumber(lane.toLane) }}
        </button>
        <button class="btn ghost small" :aria-label="`Снять соединение полосы ${inNumber(lane.fromLane)}`" title="Снять соединение" @click="editor.setTurnLane(lane.fromLane, lane.toLane, false)">✕</button>
      </div>
      <select v-if="missingLanes.length" class="input" aria-label="Добавить полосу въезда к манёвру" @change="addLane">
        <option value="">Добавить полосу въезда…</option>
        <option v-for="index in missingLanes" :key="index" :value="index">полоса {{ inNumber(index) }}</option>
      </select>
    </div>
    <p class="muted rule">Полоса 1 — крайняя правая. Щелчок по траектории на карте выбирает манёвр, повторный щелчок — одну его полосу.</p>

    <h3>Атрибуты</h3>
    <label class="field">
      <span>Пропускная способность, авт/ч</span>
      <input class="input" type="number" min="0" step="50" :value="attrs.capacity" @change="update({ capacity: ($event.target as HTMLInputElement).value })" />
    </label>
    <label class="field">
      <span>Штраф времени t0, с</span>
      <input class="input" type="number" min="0" step="1" :value="attrs.penalty" @change="update({ penalty: ($event.target as HTMLInputElement).value })" />
    </label>
    <div class="field">
      <span>Транспортные системы</span>
      <label v-for="system in TURN_TSYS" :key="system.id" class="check"><input type="checkbox" :checked="isOpenFor(system.id)" @change="toggleSystem(system.id)" /> {{ system.label }}</label>
    </div>

    <h3>Манёвры с этого подхода</h3>
    <div class="templates">
      <button class="btn small" @click="editor.applyTurnTemplate('noLeft')">Запрет налево</button>
      <button class="btn small" @click="editor.applyTurnTemplate('noRight')">Запрет направо</button>
      <button class="btn small" @click="editor.applyTurnTemplate('onlyStraight')">Только прямо</button>
      <button class="btn small" @click="editor.applyTurnTemplate('noUturn')">Запрет разворота</button>
      <button class="btn small" @click="editor.applyTurnTemplate('all')">Разрешить всё</button>
    </div>
    <button v-for="item in movements" :key="item.to.neighbor" class="move" :class="{ active: item.to.neighbor === turn.to, off: !item.allowed }" @click="editor.selectTurn(turn.node, turn.from, item.to.neighbor)">
      <span>{{ KIND_LABELS[item.kind] }}</span>
      <span class="ellipsis muted">{{ nameOf(item.to) }}</span>
      <span class="state" :class="{ none: item.allowed && lanesOf(item.to.neighbor).length === 0 }">{{ movementState(item) }}</span>
    </button>

    <p class="muted rule">По умолчанию действуют ПДД: направо только с крайней правой полосы, налево и в разворот с крайней левой, прямо со всех. Разметка и знаки меняют это правило.</p>
    <button class="btn block" @click="editor.resetTurnRules">Сбросить соединения полос к ПДД</button>
  </div>
</template>

<style scoped>
.route {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 2px 0;
}
.route i {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}
.route .from {
  background: #22c55e;
}
.route .to {
  background: #ef4444;
}
h3 {
  margin: 10px 0 4px;
  font-size: 12px;
}
.check {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 1px 0;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-bottom: 6px;
}
.templates {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
  margin-bottom: 5px;
}
.move {
  display: grid;
  grid-template-columns: 62px 1fr auto;
  gap: 6px;
  width: 100%;
  padding: 3px 4px;
  background: transparent;
  border: 0;
  text-align: left;
}
.move:hover {
  background: var(--row-hover);
}
.move.active {
  background: var(--row-selected);
}
.move.off .state {
  color: var(--err-text);
}
.rule {
  margin-top: 8px;
}
.move .state.none {
  color: var(--warn, #f59e0b);
}
.lanes {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.lane-item {
  display: flex;
  align-items: center;
  gap: 4px;
}
.lane-row {
  display: flex;
  align-items: center;
  gap: 5px;
  flex: 1;
  padding: 2px 4px;
  background: transparent;
  border: 0;
  text-align: left;
}
.lane-row:hover {
  background: var(--row-hover);
}
.lane-row.active {
  background: var(--row-selected);
}
.lane-row i {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
.lane-row .from {
  background: #22c55e;
}
.lane-row .to {
  background: #ef4444;
}
.arrow {
  color: var(--muted);
}
</style>
