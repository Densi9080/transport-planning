<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'

import { useSignalPlan } from '@/composables/useSignalPlan'
import { computeSignal, DEFAULT_CALC_PARAMS, type PhaseInput } from '@/core/signalCalc'
import type { Arm } from '@/core/topology'
import { useEditor } from '@/stores/editor'
import { useTraffic } from '@/stores/traffic'

const props = defineProps<{ node: number }>()
const editor = useEditor()
const traffic = useTraffic()
const signal = useSignalPlan(() => props.node)

const CALC_TAG = 'signal:calc'
const SATURATION_PER_LANE = 1800

const params = reactive({ ...DEFAULT_CALC_PARAMS })
const rows = ref<PhaseInput[]>([])

const COEFFICIENTS: { key: keyof typeof params; label: string; step: number }[] = [
  { key: 'phf', label: 'Коэффициент часа пик, PHF', step: 0.01 },
  { key: 'lost', label: 'Потерянное время на фазу, с', step: 1 },
  { key: 'minCycle', label: 'Минимальный цикл, с', step: 5 },
  { key: 'maxCycle', label: 'Максимальный цикл, с', step: 5 },
  { key: 'minGreen', label: 'Минимальный зелёный, с', step: 1 },
  { key: 'pedSpeed', label: 'Скорость пешехода, м/с', step: 0.1 },
  { key: 'pedStart', label: 'Время на начало перехода, с', step: 1 },
  { key: 'period', label: 'Период анализа T, ч', step: 0.05 },
  { key: 'k', label: 'Коэффициент приращения k', step: 0.05 },
  { key: 'upstream', label: 'Влияние соседних узлов I', step: 0.05 },
]

const ownerTags = computed(() => {
  void editor.rev
  const owner = signal.group.value?.owner
  return owner !== undefined ? editor.doc?.nodes.get(owner)?.tags : undefined
})

function arrivalArms(movements: string[]): Arm[] {
  const found = new Map<Arm, true>()
  for (const key of movements) {
    const match = /^(\d+):(\d+)>/.exec(key)
    if (!match) continue
    const arm = editor.network?.arms.get(Number(match[1]))?.find((item) => item.neighbor === Number(match[2]))
    if (arm) found.set(arm, true)
  }
  return [...found.keys()]
}

function armFlow(arm: Arm): number {
  const best = new Map<number, number>()
  for (const lane of traffic.result?.lanes ?? []) {
    // Подход въезжает в узел: если отрезок начинается в узле, движение идёт против его направления
    if (lane.way !== String(arm.link.wayId) || lane.edge.startsWith('-') !== arm.atStart) continue
    best.set(lane.lane, Math.max(best.get(lane.lane) ?? 0, lane.flow))
  }
  return [...best.values()].reduce((sum, value) => sum + value, 0)
}

function defaultSaturation(movements: string[]): number {
  const lanes = Math.max(1, ...arrivalArms(movements).map((arm) => arm.lanesIn))
  return lanes * SATURATION_PER_LANE
}

function syncRows(): void {
  const plan = signal.plan.value
  if (!plan) return
  let saved: { params?: Partial<typeof params>; rows?: PhaseInput[] } = {}
  try {
    saved = JSON.parse(ownerTags.value?.[CALC_TAG] ?? '{}')
  } catch {
    saved = {}
  }
  if (saved.params) Object.assign(params, saved.params)
  rows.value = plan.phases.map((phase, index) => rows.value[index] ?? saved.rows?.[index] ?? {
    flow: 0,
    saturation: defaultSaturation(phase.movements),
    pedestrian: !!phase.pedestrian,
    crossing: 0,
  })
}

watch(() => signal.plan.value?.phases.length, syncRows, { immediate: true })

const result = computed(() => computeSignal(rows.value, params))

function takeFromSumo(): void {
  const plan = signal.plan.value
  if (!plan || !traffic.result) {
    editor.toast('Сначала выполните «Расчёт загрузки»')
    return
  }
  plan.phases.forEach((phase, index) => {
    const row = rows.value[index]
    if (!row || row.pedestrian) return
    let critical = { flow: 0, saturation: row.saturation, ratio: -1 }
    for (const arm of arrivalArms(phase.movements)) {
      const flow = armFlow(arm)
      const saturation = arm.lanesIn * SATURATION_PER_LANE
      if (flow / saturation > critical.ratio) critical = { flow, saturation, ratio: flow / saturation }
    }
    row.flow = critical.flow
    row.saturation = critical.saturation
  })
}

function addPedestrianPhase(): void {
  const plan = signal.plan.value
  if (!plan) return
  rows.value = [...rows.value, { flow: 0, saturation: 0, pedestrian: true, crossing: 12 }]
  signal.commit({ ...plan, phases: [...plan.phases, { green: 15, movements: [], pedestrian: true }] }, 'Пешеходная фаза')
}

function apply(): void {
  const plan = signal.plan.value
  const owner = signal.group.value?.owner
  if (!plan || owner === undefined) return
  const next = { ...plan, phases: plan.phases.map((phase, index) => ({ ...phase, green: Math.max(1, result.value.phases[index]?.green ?? phase.green) })) }
  signal.commit(next, 'План по расчёту')
  editor.updateNodeTags(owner, { ...(ownerTags.value ?? {}), [CALC_TAG]: JSON.stringify({ params: { ...params }, rows: rows.value }) })
  editor.toast(`План применён, цикл ${result.value.cycle} с`, 'success')
}
</script>

<template>
  <div class="calc">
    <p v-if="signal.guessed.value" class="warn">Светофор ещё не настроен: на вкладке «Светофор и фазы» задайте план, расчёт применится к нему.</p>
    <p v-else-if="!signal.plan.value" class="muted">На этом узле нет светофора.</p>
    <template v-if="signal.plan.value">
      <div class="top">
        <button class="btn small" @click="takeFromSumo">Взять потоки из расчёта SUMO</button>
        <button class="btn small" :disabled="signal.guessed.value" @click="addPedestrianPhase">Добавить пешеходную фазу</button>
        <span class="spacer" />
        <button class="btn small primary" :disabled="signal.guessed.value" @click="apply">Применить к плану</button>
      </div>

      <table>
        <thead>
          <tr><th>Фаза</th><th>Пешеходная</th><th>q, авт/ч</th><th>s, авт/ч</th><th>Переход, м</th><th>y</th><th>g, с</th><th>c, авт/ч</th><th>X</th><th>d, с</th><th>УО</th></tr>
        </thead>
        <tbody>
          <tr v-for="(row, index) in rows" :key="index">
            <td>{{ index + 1 }}</td>
            <td><input v-model="row.pedestrian" type="checkbox" :aria-label="`Фаза ${index + 1} пешеходная`" /></td>
            <td><input v-model.number="row.flow" class="input" type="number" min="0" :disabled="row.pedestrian" /></td>
            <td><input v-model.number="row.saturation" class="input" type="number" min="0" step="100" :disabled="row.pedestrian" /></td>
            <td><input v-model.number="row.crossing" class="input" type="number" min="0" step="0.5" /></td>
            <td>{{ result.phases[index]?.ratio.toFixed(2) }}</td>
            <td><strong>{{ result.phases[index]?.green }}</strong></td>
            <td>{{ result.phases[index]?.capacity }}</td>
            <td :class="{ bad: (result.phases[index]?.saturationDegree ?? 0) > 1 }">{{ result.phases[index]?.saturationDegree.toFixed(2) }}</td>
            <td>{{ result.phases[index]?.delay.toFixed(1) }}</td>
            <td>{{ result.phases[index]?.los }}</td>
          </tr>
        </tbody>
      </table>

      <div class="summary">
        <span>Цикл: <strong>{{ result.cycle }} с</strong></span>
        <span>Y = {{ result.sumRatio.toFixed(3) }}</span>
        <span>L = {{ result.lostTotal.toFixed(0) }} с</span>
        <span>Средняя задержка: <strong>{{ result.delay.toFixed(1) }} с</strong></span>
        <span>Уровень обслуживания: <strong>{{ result.los }}</strong></span>
      </div>
      <p v-if="result.oversaturated" class="warn">Суммарная загрузка Y не меньше 1: перекрёсток перегружен, взят максимальный цикл.</p>

      <h3>Коэффициенты</h3>
      <div class="coefficients">
        <label v-for="item in COEFFICIENTS" :key="item.key">
          <span>{{ item.label }}</span>
          <input v-model.number="params[item.key]" class="input" type="number" :step="item.step" min="0" />
        </label>
      </div>
      <p class="muted note">Цикл: C = (1,5·L + 5) / (1 − Y), Вебстер. Задержка: d = d₁ + d₂, уровень обслуживания по HCM 2000. Пешеходный зелёный: t = tнач + B / v. Пешеходная фаза прибавляется к потерянному времени L.</p>
    </template>
  </div>
</template>

<style scoped>
.calc {
  padding: 10px;
  overflow: auto;
}
.top {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-bottom: 8px;
}
.spacer {
  flex: 1;
}
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}
th,
td {
  padding: 3px 4px;
  border-bottom: 1px solid var(--line);
  text-align: left;
  white-space: nowrap;
}
th {
  color: var(--muted);
  font-weight: 500;
}
td input.input {
  width: 74px;
}
.bad {
  color: var(--err-text);
}
.summary {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 16px;
  margin: 10px 0;
}
h3 {
  margin: 10px 0 6px;
  font-size: 12px;
}
.coefficients {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: 6px 10px;
}
.coefficients label {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.coefficients span {
  color: var(--muted);
}
.warn {
  margin: 4px 0 8px;
  color: var(--warn-text);
}
.note {
  margin-top: 10px;
}
</style>
