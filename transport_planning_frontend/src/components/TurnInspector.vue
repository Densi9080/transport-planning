<script setup lang="ts">
import { computed } from 'vue'

import { type Movement, type TurnKind } from '@/core/topology'
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

    <label class="check"><input type="checkbox" :checked="current.allowed" @change="editor.setTurnAllowed(current!.to.neighbor, ($event.target as HTMLInputElement).checked)" /> Поворот разрешён</label>

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
      <span class="state">{{ item.allowed ? 'разрешён' : 'запрещён' }}</span>
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
</style>
