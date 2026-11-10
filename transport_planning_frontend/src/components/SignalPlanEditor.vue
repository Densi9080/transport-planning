<script setup lang="ts">
import { AlertTriangle, Plus, RotateCcw, TrafficCone, X } from 'lucide-vue-next'
import { computed, ref } from 'vue'

import { editNumber, useSignalPlan } from '@/composables/useSignalPlan'
import {
  MAX_ALL_RED_S,
  MAX_GREEN_S,
  MAX_YELLOW_S,
  MIN_GREEN_S,
  phaseWindows,
  type SignalPlan,
  withGreenMoved,
} from '@/core/signals'
import { approachName, formatSeconds, KIND_LABELS } from '@/sim/signalView'
import { useEditor } from '@/stores/editor'

import SignalBar from './SignalBar.vue'

const props = defineProps<{ node: number }>()
const editor = useEditor()
const signal = useSignalPlan(() => props.node)

const group = signal.group
const plan = signal.plan
const cycle = signal.cycle
const directions = signal.directions
const guessed = signal.guessed

interface MovementRow {
  key: string
  title: string
  detail: string
  kind: string
  phases: number[]
}

const rows = computed<MovementRow[]>(() => {
  const current = plan.value
  if (!group.value || !current) return []
  const byKey = new Map<string, MovementRow>()
  for (const connector of group.value.connectors) {
    if (byKey.has(connector.movement)) continue
    const toName = connector.toLane.edge.tags.name
    byKey.set(connector.movement, {
      key: connector.movement,
      title: approachName(connector),
      detail: `${KIND_LABELS[connector.kind] ?? connector.kind}${toName ? `, на ${toName}` : ''}`,
      kind: connector.kind,
      phases: current.phases.flatMap((phase, index) => (phase.movements.includes(connector.movement) ? [index] : [])),
    })
  }
  return [...byKey.values()].sort((a, b) => a.title.localeCompare(b.title, 'ru') || a.detail.localeCompare(b.detail, 'ru'))
})

const unassigned = computed(() => rows.value.filter((row) => row.phases.length === 0))

/** Два потока, пересекающиеся на одном зелёном. Левый поворот уступает встречным, это допустимо. */
const conflicts = computed(() => {
  const current = plan.value
  if (!group.value || !current) return []
  const found = new Map<string, string>()
  for (const connector of group.value.connectors) {
    if (connector.kind === 'left') continue
    for (const conflict of connector.conflicts) {
      const other = conflict.other
      if (other.kind === 'left' || other.fromLane.edge === connector.fromLane.edge) continue
      const shared = current.phases.some((phase) => phase.movements.includes(connector.movement) && phase.movements.includes(other.movement))
      if (!shared) continue
      const pair = [connector.movement, other.movement].sort().join('|')
      if (!found.has(pair)) {
        found.set(pair, `${approachName(connector)} ${KIND_LABELS[connector.kind]} и ${approachName(other)} ${KIND_LABELS[other.kind]}`)
      }
    }
  }
  return [...found.values()]
})

function clonePlan(): SignalPlan {
  const current = plan.value!
  return { ...current, phases: current.phases.map((phase) => ({ green: phase.green, movements: [...phase.movements] })) }
}

function toggle(row: MovementRow, index: number): void {
  const next = clonePlan()
  const phase = next.phases[index]!
  if (phase.movements.includes(row.key)) phase.movements = phase.movements.filter((key) => key !== row.key)
  else phase.movements.push(row.key)
  signal.commit(next, 'Состав фазы')
}

function addPhase(): void {
  const next = clonePlan()
  next.phases.push({ green: 15, movements: [] })
  signal.commit(next, 'Новая фаза')
}

function removePhase(index: number): void {
  const next = clonePlan()
  if (next.phases.length <= 1) return
  next.phases.splice(index, 1)
  signal.commit(next, 'Удаление фазы')
}

function placeSignal(): void {
  const node = editor.doc?.nodes.get(props.node)
  if (node) editor.toggleOnNode('signal', { nodeId: props.node, position: node })
}

const windows = computed(() => (plan.value ? phaseWindows(plan.value) : []))

const ticks = computed(() => {
  const step = cycle.value > 160 ? 20 : 10
  const list: number[] = []
  for (let t = 0; t < cycle.value; t += step) list.push(t)
  return list
})

const strip = ref<HTMLElement | null>(null)
let drag: { index: number; startX: number; width: number; cycle: number; base: SignalPlan } | null = null

/** Граница передаёт секунды от следующей фазы к предыдущей: шкала не плывёт, а цикл остаётся прежним. */
function startDrag(index: number, event: PointerEvent): void {
  if (!strip.value || !plan.value || guessed.value) return
  drag = { index, startX: event.clientX, width: strip.value.clientWidth, cycle: cycle.value, base: plan.value }
  ;(event.currentTarget as Element).setPointerCapture(event.pointerId)
  event.preventDefault()
}

function moveDrag(event: PointerEvent): void {
  if (!drag) return
  const seconds = ((event.clientX - drag.startX) / drag.width) * drag.cycle
  signal.preview.value = withGreenMoved(drag.base, drag.index + 1, drag.index, seconds)
}

function endDrag(): void {
  if (!drag) return
  drag = null
  const next = signal.preview.value
  if (next) signal.commit(next, 'Граница фаз')
}

function cancelDrag(): void {
  drag = null
  signal.preview.value = null
}

function nudge(index: number, event: KeyboardEvent): void {
  const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
  if (step === 0 || !plan.value || guessed.value) return
  event.preventDefault()
  signal.commit(withGreenMoved(plan.value, index + 1, index, step), 'Граница фаз')
}
</script>

<template>
  <div v-if="!group" class="empty">
    <TrafficCone :size="24" class="faint" aria-hidden="true" />
    <p class="muted">В этом узле нет светофора.</p>
    <button class="btn primary" @click="placeSignal">Поставить светофор</button>
    <p class="faint note">В режиме симуляции такие узлы могут получать план автоматически, но редактировать можно только настоящий светофор.</p>
  </div>

  <div v-else-if="plan" class="plan">
    <div v-if="guessed" class="warn">
      <AlertTriangle :size="13" aria-hidden="true" />
      <span>Этот светофор предположила модель, в данных его нет, поэтому план только для просмотра.</span>
      <span class="spacer" />
      <button class="btn small" @click="placeSignal">Поставить настоящий</button>
    </div>

    <fieldset class="bare" :disabled="guessed">
      <div class="common">
        <div class="field">
          <label for="sig-cycle">Цикл, с</label>
          <input id="sig-cycle" class="input" type="number" min="1" :value="cycle" @change="editNumber($event, cycle, signal.setCycle)" />
        </div>
        <div class="field">
          <label for="sig-offset">Сдвиг, с</label>
          <input id="sig-offset" class="input" type="number" min="0" :value="plan.offset" @change="editNumber($event, plan!.offset, (value) => signal.setCommon('offset', value))" />
        </div>
        <div class="field">
          <label for="sig-yellow">Жёлтый, с</label>
          <input id="sig-yellow" class="input" type="number" min="0" :max="MAX_YELLOW_S" step="0.5" :value="plan.yellow" @change="editNumber($event, plan!.yellow, (value) => signal.setCommon('yellow', value))" />
        </div>
        <div class="field">
          <label for="sig-allred">Общий красный, с</label>
          <input id="sig-allred" class="input" type="number" min="0" :max="MAX_ALL_RED_S" step="0.5" :value="plan.allRed" @change="editNumber($event, plan!.allRed, (value) => signal.setCommon('allRed', value))" />
        </div>
        <span class="spacer" />
        <button class="btn" @click="addPhase"><Plus :size="13" aria-hidden="true" /> Фаза</button>
        <button class="btn" :disabled="!group.custom" @click="signal.resetToAuto"><RotateCcw :size="13" aria-hidden="true" /> Автоплан</button>
      </div>

      <!-- Строка есть всегда: иначе после первой правки таблица сдвинулась бы прямо под курсором -->
      <p v-if="signal.notice.value" class="note limit" role="status">{{ signal.notice.value }}</p>
      <p v-else-if="!guessed" class="muted note">
        {{ group.custom ? 'Действует ваш план. Вернуть автоматический можно кнопкой «Автоплан».' : 'Сейчас действует автоматический план. Любая правка сохранит его как ваш.' }}
      </p>
      <p v-if="group.nodes.length > 1" class="muted note">Рядом стоит ещё светофор: {{ group.nodes.length }} узла работают как один объект.</p>

      <section aria-labelledby="sig-times">
        <div class="section-head">
          <h3 id="sig-times" class="eyebrow">Сколько горит сигнал за цикл, секунды</h3>
          <span class="spacer" />
          <span class="legend"><i class="green" />зелёный</span>
          <span class="legend"><i class="yellow" />жёлтый</span>
          <span class="legend"><i class="red" />красный</span>
        </div>
        <div class="table-wrap">
          <table class="times">
            <thead>
              <tr>
                <th class="left">Направление</th>
                <th class="left">Манёвры</th>
                <th class="num">Зелёный</th>
                <th class="num">Жёлтый</th>
                <th class="num">Красный</th>
                <th class="num" title="Доля зелёного в цикле">Доля</th>
                <th class="left graph-head">
                  <div ref="strip" class="strip" aria-label="Фазы светофора">
                    <template v-for="(window, index) in windows" :key="index">
                      <span
                        class="phase"
                        :style="{ left: `${(window.start / cycle) * 100}%`, width: `${(window.length / cycle) * 100}%` }"
                        :title="`Фаза ${index + 1}: зелёный ${window.green} с`"
                      >Ф{{ index + 1 }}: {{ window.green }}</span>
                      <span
                        v-if="index < windows.length - 1"
                        class="handle"
                        role="slider"
                        tabindex="0"
                        :aria-label="`Граница фаз ${index + 1} и ${index + 2}`"
                        :aria-valuenow="window.green"
                        :aria-valuemin="MIN_GREEN_S"
                        :aria-valuemax="MAX_GREEN_S"
                        title="Тяните, чтобы передать секунды зелёного соседней фазе. Цикл не изменится"
                        :style="{ left: `${((window.start + window.length) / cycle) * 100}%` }"
                        @pointerdown="startDrag(index, $event)"
                        @pointermove="moveDrag"
                        @pointerup="endDrag"
                        @pointercancel="cancelDrag"
                        @keydown="nudge(index, $event)"
                      />
                    </template>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="direction in directions" :key="direction.key">
                <td class="left name">
                  <span class="ellipsis" :title="direction.title">{{ direction.title }}</span>
                </td>
                <td class="left kinds">
                  <span class="ellipsis" :title="direction.kinds">{{ direction.kinds }}</span>
                  <span v-if="direction.unassigned" class="lost-note" title="Манёвра нет ни в одной фазе: зелёный ему назначила модель">не в плане</span>
                </td>
                <td class="num">
                  <input
                    class="input time"
                    type="number"
                    min="1"
                    :aria-label="`Зелёный, секунд: ${direction.title}, ${direction.kinds}`"
                    :value="direction.times.green"
                    :disabled="direction.times.red === 0 && direction.times.yellow === 0"
                    @change="editNumber($event, direction.times.green, (value) => signal.setGreenTime(direction, value))"
                  />
                </td>
                <td class="num value">{{ formatSeconds(direction.times.yellow) }}</td>
                <td class="num">
                  <input
                    class="input time"
                    type="number"
                    min="0"
                    :aria-label="`Красный, секунд: ${direction.title}, ${direction.kinds}`"
                    :value="direction.times.red"
                    :disabled="direction.phases.length >= plan.phases.length"
                    @change="editNumber($event, direction.times.red, (value) => signal.setRedTime(direction, value))"
                  />
                </td>
                <td class="num value">{{ Math.round((direction.times.green / cycle) * 100) }}%</td>
                <td class="graph">
                  <SignalBar :segments="direction.segments" :cycle="cycle" :marker="signal.cycleTime.value" />
                </td>
              </tr>
              <tr class="axis">
                <td colspan="6" class="faint left axis-note">
                  Зелёный меняет фазы своего направления, красный меняет остальные фазы. Вместе с ними меняется цикл.
                </td>
                <td class="graph">
                  <div class="ruler" aria-hidden="true">
                    <span v-for="tick in ticks" :key="tick" :style="{ left: `${(tick / cycle) * 100}%` }">{{ tick }}</span>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <div v-if="unassigned.length" class="warn">
        <AlertTriangle :size="13" aria-hidden="true" />
        Без зелёного: {{ unassigned.length }} манёвров. В модели они получат зелёный по оси движения, чтобы не встать навсегда.
      </div>
      <div v-if="conflicts.length" class="warn">
        <AlertTriangle :size="13" aria-hidden="true" />
        <span>
          На одном зелёном пересекаются потоки: {{ conflicts.length }}.
          <span class="faint">{{ conflicts.slice(0, 2).join('; ') }}</span>
        </span>
      </div>

      <section aria-labelledby="sig-phases">
        <h3 id="sig-phases" class="eyebrow">Фазы: длительность зелёного и кто в них едет</h3>
        <div class="table-wrap matrix">
          <table>
            <thead>
              <tr>
                <th class="left">Манёвр</th>
                <th v-for="(phase, index) in plan.phases" :key="index">
                  <div class="phase-head">
                    <span>Фаза {{ index + 1 }}</span>
                    <button class="remove" :disabled="plan.phases.length <= 1" :aria-label="`Удалить фазу ${index + 1}`" @click="removePhase(index)"><X :size="11" /></button>
                  </div>
                  <input
                    class="input green"
                    type="number"
                    :min="MIN_GREEN_S"
                    :max="MAX_GREEN_S"
                    :value="phase.green"
                    :aria-label="`Зелёный фазы ${index + 1}, секунд`"
                    @change="editNumber($event, phase.green, (value) => signal.setPhaseGreen(index, value))"
                  />
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in rows" :key="row.key" :class="{ lost: row.phases.length === 0 }">
                <td class="left">
                  <div class="movement">
                    <span class="ellipsis title">{{ row.title }}</span>
                    <span class="faint ellipsis detail">{{ row.detail }}</span>
                  </div>
                </td>
                <td v-for="(_, index) in plan.phases" :key="index" class="cell">
                  <input type="checkbox" :checked="row.phases.includes(index)" :aria-label="`${row.title}, ${row.detail}, фаза ${index + 1}`" @change="toggle(row, index)" />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </fieldset>

    <p class="faint note">
      План действует в моделях редактора и хранится в теге узла <code>signal:plan</code>. SUMO строит собственную программу
      светофора и этот тег не читает.
    </p>
  </div>
</template>

<style scoped>
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 40px 20px;
  text-align: center;
}
.empty p {
  margin: 0;
}
.plan,
.bare {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.bare {
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}
.common {
  display: flex;
  align-items: flex-end;
  gap: 8px;
}
.common .field {
  width: 96px;
}
.note {
  margin: 0;
  font-size: 11px;
}
.limit {
  color: var(--warn-text);
}
section {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
h3 {
  margin: 0;
}
.section-head {
  display: flex;
  align-items: center;
  gap: 10px;
}
.legend {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  color: var(--muted);
  font-size: 11px;
}
.legend i {
  width: 10px;
  height: 10px;
}
.legend .green {
  background: #15803d;
}
.legend .yellow {
  background: #eab308;
}
.legend .red {
  background: #c62f2f;
}
.table-wrap {
  overflow: auto;
  border: 1px solid var(--line-strong);
}
.matrix {
  max-height: 240px;
}
table {
  width: 100%;
  border-collapse: collapse;
}
thead th {
  position: sticky;
  top: 0;
  background: var(--titlebar);
  border-bottom: 1px solid var(--line-strong);
  border-right: 1px solid var(--line);
  padding: 3px 5px;
  font-weight: 600;
  z-index: 2;
}
th.left,
td.left {
  text-align: left;
}
th.num,
td.num {
  width: 62px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}
td {
  padding: 1px 5px;
  border-bottom: 1px solid var(--line);
  border-right: 1px solid var(--line);
}
td.name {
  max-width: 190px;
}
td.name span {
  display: block;
}
td.kinds {
  max-width: 130px;
}
td.kinds .ellipsis {
  display: block;
}
.lost-note {
  color: var(--err-text);
  font-size: 10px;
}
.time {
  width: 56px;
  height: 22px;
  padding: 0 2px 0 4px;
  text-align: right;
}
.value {
  padding-right: 8px;
}
.graph-head {
  min-width: 340px;
  padding: 2px 6px;
}
.graph {
  padding: 2px 6px;
}
.strip {
  position: relative;
  height: 20px;
  background: var(--inset);
}
.phase {
  position: absolute;
  top: 0;
  bottom: 0;
  display: grid;
  place-items: center;
  overflow: hidden;
  background: var(--raised);
  border-right: 1px solid var(--line-strong);
  box-sizing: border-box;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
  white-space: nowrap;
}
.handle {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 11px;
  margin-left: -6px;
  cursor: ew-resize;
  touch-action: none;
  z-index: 1;
}
.handle::after {
  content: '';
  position: absolute;
  top: 2px;
  bottom: 2px;
  left: 4px;
  width: 3px;
  background: var(--accent);
  border-radius: 1px;
}
.handle:hover::after,
.handle:focus-visible::after {
  left: 3px;
  width: 5px;
}
.handle:focus-visible {
  outline: 1px solid var(--accent);
}
.bare:disabled .handle {
  display: none;
}
.axis td {
  border-bottom: 0;
}
.axis-note {
  font-size: 11px;
}
.ruler {
  position: relative;
  height: 14px;
}
.ruler span {
  position: absolute;
  transform: translateX(-50%);
  color: var(--faint);
  font-size: 10px;
}
.ruler span:first-child {
  transform: none;
}
.phase-head {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
}
.remove {
  display: grid;
  place-items: center;
  width: 15px;
  height: 15px;
  padding: 0;
  background: transparent;
  border: 0;
}
.remove:hover:not(:disabled) {
  background: var(--err-bg);
}
.green.input {
  width: 62px;
  margin-top: 2px;
  text-align: center;
}
.movement {
  display: flex;
  gap: 6px;
  min-width: 300px;
  max-width: 460px;
}
td .title {
  flex: 1 1 55%;
}
td .detail {
  flex: 1 1 45%;
}
.cell {
  text-align: center;
}
tbody tr:not(.axis):hover td {
  background: var(--row-hover);
}
tr.lost td.left .title {
  color: var(--err-text);
}
.warn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 4px 7px;
  background: var(--warn-bg);
  color: var(--warn-text);
}
.warn svg {
  flex: none;
}
code {
  font-size: 11px;
}
</style>
