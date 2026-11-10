<script setup lang="ts">
import { Box, Check, Gauge, Pause, Play, RotateCcw, TrafficCone, TriangleAlert } from 'lucide-vue-next'
import { computed } from 'vue'

import { LOS_COLORS } from '@/map/style'
import { LOS_LABELS, LOS_TITLES, type Period } from '@/sim/macro'
import { DRIVER_STYLES, STYLE_LABELS, VIOLATION_LABELS, type ViolationKind } from '@/sim/micro'
import { signalGroupAt } from '@/sim/net'
import { useEditor } from '@/stores/editor'
import { useSimulation } from '@/stores/simulation'

import SignalSummary from './SignalSummary.vue'

const editor = useEditor()
const sim = useSimulation()

const periods: { id: Period; label: string }[] = [
  { id: 'morning', label: 'Утро' },
  { id: 'midday', label: 'День' },
  { id: 'evening', label: 'Вечер' },
]
const speeds = [1, 2, 5, 10]

const totals = computed(() => sim.macro?.totals ?? null)

const worstLoads = computed(() => {
  const loads = sim.macro?.loads
  if (!loads) return []
  return [...loads.values()]
    .filter((load) => load.vc >= 0.75)
    .sort((a, b) => b.vc - a.vc)
    .slice(0, 8)
})

const losRows = computed(() =>
  LOS_LABELS.map((label, index) => ({
    label,
    title: LOS_TITLES[index]!,
    color: LOS_COLORS[index]!,
    share: totals.value?.losShares[index] ?? 0,
  })),
)

const selectedWay = computed(() => editor.selectedWays[0] ?? null)
const selectedSignalNode = computed(() => {
  const node = editor.selectedNodes[0]
  return node && sim.net && signalGroupAt(sim.net, node.id) ? node.id : null
})
const selectedLoads = computed(() => (selectedWay.value ? sim.loadsOfWay(selectedWay.value.id) : []))

/** Участки одной дороги собираем по направлениям: нагружен обычно самый узкий кусок. */
const selectedDirections = computed(() => {
  const groups = new Map<boolean, typeof selectedLoads.value>()
  for (const load of selectedLoads.value) {
    const list = groups.get(load.edge.forward)
    if (list) list.push(load)
    else groups.set(load.edge.forward, [load])
  }
  return [...groups.entries()].map(([forward, loads]) => ({
    forward,
    worst: [...loads].sort((a, b) => b.vc - a.vc)[0]!,
  }))
})

const selectedMicroCars = computed(() => {
  void sim.loadRev
  const way = selectedWay.value
  return way ? sim.edgesOfWay(way.id).reduce((sum, edge) => sum + edge.carCount, 0) : 0
})

const violations = computed(() =>
  (Object.keys(VIOLATION_LABELS) as ViolationKind[]).map((kind) => ({
    kind,
    label: VIOLATION_LABELS[kind],
    count: sim.stats?.violations[kind] ?? 0,
  })),
)

const normalShare = computed(() => Math.max(0, 1 - sim.mix.aggressive - sim.mix.calm))

function edgeName(load: { edge: { tags: Record<string, string>; wayId: number } }): string {
  return load.edge.tags.name ?? `Дорога ${load.edge.wayId}`
}

function formatTime(seconds: number): string {
  const total = Math.floor(seconds)
  const minutes = Math.floor(total / 60)
  return `${minutes}:${String(total % 60).padStart(2, '0')}`
}

function setDemand(event: Event): void {
  sim.demand = Number((event.target as HTMLInputElement).value)
}

/** Сумма долей не должна превышать 100%: вторая доля уступает той, которую двигают сейчас. */
function setMix(key: 'aggressive' | 'calm', event: Event): void {
  const value = Number((event.target as HTMLInputElement).value)
  const other = key === 'aggressive' ? 'calm' : 'aggressive'
  sim.mix[key] = value
  if (value + sim.mix[other] > 1) sim.mix[other] = Math.max(0, 1 - value)
}
</script>

<template>
  <div class="dock-title">Расчёт транспортной модели</div>

  <div class="section">
    <div class="segmented" role="group" aria-label="Уровень модели">
      <button :class="{ active: sim.level === 'macro' }" :aria-pressed="sim.level === 'macro'" @click="sim.setLevel('macro')">
        <Gauge :size="13" aria-hidden="true" /> Макро
      </button>
      <button :class="{ active: sim.level === 'micro' }" :aria-pressed="sim.level === 'micro'" @click="sim.setLevel('micro')">
        <TrafficCone :size="13" aria-hidden="true" /> Микро
      </button>
    </div>
    <p class="hint muted">
      <template v-if="sim.level === 'macro'">Загрузка всей сети за час, рассчитанная из атрибутов дорог и зданий.</template>
      <template v-else>Каждая машина едет по полосе, уступает, стоит на светофорах и иногда нарушает.</template>
    </p>
  </div>

  <SignalSummary v-if="selectedSignalNode !== null" :key="selectedSignalNode" :node="selectedSignalNode" />
  <div v-else-if="sim.net?.signals.length" class="section">
    <p class="hint muted">Щёлкните по светофору на карте, чтобы увидеть и поменять, сколько горит каждый сигнал.</p>
  </div>

  <div class="section">
    <div class="eyebrow">Последовательность расчёта</div>
    <ol class="procedure">
      <li v-for="step in sim.procedure" :key="step.id">
        <Check :size="12" class="done" aria-hidden="true" />
        <div>
          <strong>{{ step.title }}</strong>
          <span v-if="step.ms !== null" class="faint ms">{{ Math.max(1, Math.round(step.ms)) }} мс</span>
          <div class="muted detail">{{ step.detail }}</div>
        </div>
      </li>
    </ol>
  </div>

  <div class="section">
    <div class="eyebrow">Спрос</div>
    <div class="segmented" role="group" aria-label="Период">
      <button v-for="item in periods" :key="item.id" :class="{ active: sim.period === item.id }" :aria-pressed="sim.period === item.id" @click="sim.period = item.id">
        {{ item.label }}
      </button>
    </div>
    <label class="slider">
      <span>Уровень спроса: {{ Math.round(sim.demand * 100) }}%</span>
      <input type="range" min="0.2" max="2" step="0.1" :value="sim.demand" @change="setDemand" />
    </label>
    <label class="check"><input v-model="sim.transitOn" type="checkbox" /> Учитывать линии ОТ: {{ sim.services.length }}</label>
    <label class="check"><input v-model="sim.guessSignals" type="checkbox" /> Светофоры на пересечениях крупных дорог</label>
  </div>

  <template v-if="sim.level === 'micro'">
    <div class="section">
      <div class="row">
        <button class="btn primary grow" @click="sim.togglePlay">
          <Pause v-if="sim.running" :size="13" aria-hidden="true" />
          <Play v-else :size="13" aria-hidden="true" />
          {{ sim.running ? 'Пауза' : 'Запустить' }}
        </button>
        <button class="btn" aria-label="Начать заново" title="Начать заново" @click="sim.reset"><RotateCcw :size="13" /></button>
        <button class="btn" :class="{ on: sim.camera3d }" :aria-pressed="sim.camera3d" title="3D-вид" aria-label="3D-вид" @click="sim.camera3d = !sim.camera3d"><Box :size="13" /></button>
      </div>
      <div class="segmented" role="group" aria-label="Скорость симуляции">
        <button v-for="value in speeds" :key="value" :class="{ active: sim.speed === value }" :aria-pressed="sim.speed === value" @click="sim.speed = value">
          ×{{ value }}
        </button>
      </div>
      <div class="field">
        <label for="car-color">Цвет машин</label>
        <select id="car-color" v-model="sim.colorMode" class="input">
          <option value="fleet">Обычный</option>
          <option value="speed">По скорости</option>
          <option value="style">По стилю вождения</option>
        </select>
      </div>
      <label class="check"><input v-model="sim.showLoad" type="checkbox" /> Подсветка загрузки дорог</label>
    </div>

    <div class="section">
      <div class="eyebrow">Водители</div>
      <label class="slider">
        <span>Лихачи: {{ Math.round(sim.mix.aggressive * 100) }}%</span>
        <input type="range" min="0" max="1" step="0.05" :value="sim.mix.aggressive" @input="setMix('aggressive', $event)" />
      </label>
      <label class="slider">
        <span>Спокойные: {{ Math.round(sim.mix.calm * 100) }}%</span>
        <input type="range" min="0" max="1" step="0.05" :value="sim.mix.calm" @input="setMix('calm', $event)" />
      </label>
      <p class="hint faint">Обычные: {{ Math.round(normalShare * 100) }}%. Новая доля действует на машины, которые появятся дальше.</p>
    </div>

    <div v-if="sim.stats" class="section">
      <table class="grid">
        <tbody>
          <tr><th>Время модели</th><td>{{ formatTime(sim.stats.time) }}</td></tr>
          <tr><th>Машин в сети</th><td>{{ sim.stats.active }}</td></tr>
          <tr><th>Средняя скорость</th><td>{{ Math.round(sim.stats.avgSpeedKmh) }} км/ч</td></tr>
          <tr><th>Стоят</th><td>{{ sim.stats.stopped }}</td></tr>
          <tr><th>Превышают скорость</th><td>{{ sim.stats.speeding }}</td></tr>
          <tr><th>Доехали</th><td>{{ sim.stats.finished }}</td></tr>
          <tr><th>Ждут въезда</th><td>{{ sim.stats.waitingToEnter }}</td></tr>
          <tr><th>Автобусов на линии</th><td>{{ sim.stats.buses }}</td></tr>
          <tr v-for="style in DRIVER_STYLES" :key="style"><th>{{ STYLE_LABELS[style] }}</th><td>{{ sim.stats.byStyle[style] }}</td></tr>
        </tbody>
      </table>
      <p v-if="sim.stats.teleported > 0" class="warn">
        <TriangleAlert :size="12" aria-hidden="true" />
        Снято застрявших машин: {{ sim.stats.teleported }}. Так проявляются ошибки сети и заторы без выхода.
      </p>
    </div>

    <div class="section">
      <div class="eyebrow">Нарушения с начала расчёта</div>
      <table class="grid">
        <tbody>
          <tr v-for="item in violations" :key="item.kind"><th>{{ item.label }}</th><td>{{ item.count }}</td></tr>
        </tbody>
      </table>
    </div>

    <div class="section">
      <div class="eyebrow">Пробки: {{ sim.stats?.jams.length ?? 0 }}</div>
      <p v-if="!sim.stats?.jams.length" class="hint muted">Устойчивых очередей пока нет.</p>
      <button v-for="jam in sim.stats?.jams.slice(0, 8) ?? []" :key="jam.edge.id" class="row-button" @click="editor.focusWay(jam.edge.wayId)">
        <span class="ellipsis">{{ jam.edge.tags.name ?? `Дорога ${jam.edge.wayId}` }}</span>
        <span class="faint nums">{{ Math.round(jam.lengthM) }} м · {{ jam.cars }} авт</span>
      </button>
    </div>
  </template>

  <template v-else-if="totals">
    <div class="section">
      <div class="eyebrow">Показать на карте</div>
      <div class="segmented" role="group" aria-label="Вид результата">
        <button :class="{ active: sim.macroView === 'bars' }" :aria-pressed="sim.macroView === 'bars'" @click="sim.macroView = 'bars'">Столбики потока</button>
        <button :class="{ active: sim.macroView === 'fill' }" :aria-pressed="sim.macroView === 'fill'" @click="sim.macroView = 'fill'">Заливка дорог</button>
      </div>
      <!-- В Visum это Desire lines, «линии желаний»: корреспонденции между районами по прямой, без привязки к сети -->
      <label class="check" title="Корреспонденции между транспортными районами, нарисованные по прямой («по воздуху»), без привязки к улицам. В Visum — линии желаний (Desire lines)">
        <input v-model="sim.showDesire" type="checkbox" /> Районы и корреспонденции по прямой
      </label>
    </div>

    <div class="section">
      <table class="grid">
        <tbody>
          <tr><th>Поездок в час</th><td>{{ Math.round(totals.trips) }}</td></tr>
          <tr><th>Средняя скорость</th><td>{{ Math.round(totals.avgSpeedKmh) }} км/ч</td></tr>
          <tr><th>Пробег</th><td>{{ Math.round(totals.vehKm) }} авт·км</td></tr>
          <tr><th>Потери времени</th><td>{{ Math.round(totals.delayHours) }} авт·ч</td></tr>
          <tr><th>Перегружено</th><td>{{ totals.congestedKm.toFixed(1) }} из {{ totals.totalKm.toFixed(1) }} км</td></tr>
        </tbody>
      </table>
      <p v-if="totals.unservedTrips >= 1" class="warn">
        <TriangleAlert :size="12" aria-hidden="true" />
        Без маршрута: {{ Math.round(totals.unservedTrips) }} поездок в час. Проверьте связность сети.
      </p>
    </div>

    <div class="section">
      <div class="eyebrow">Уровень обслуживания, доля длины сети</div>
      <div v-for="row in losRows" :key="row.label" class="los-row">
        <span class="swatch" :style="{ background: row.color }" aria-hidden="true" />
        <span class="los-label">{{ row.label }}</span>
        <span class="muted">{{ row.title }}</span>
        <span class="nums">{{ Math.round(row.share * 100) }}%</span>
      </div>
    </div>

    <div class="section">
      <div class="eyebrow">Самые загруженные участки</div>
      <p v-if="worstLoads.length === 0" class="hint muted">Загрузка везде ниже 75% пропускной способности.</p>
      <button v-for="load in worstLoads" :key="load.edge.id" class="row-button" @click="editor.focusWay(load.edge.wayId)">
        <span class="ellipsis">{{ edgeName(load) }}</span>
        <span class="faint nums">{{ Math.round(load.vc * 100) }}%</span>
      </button>
    </div>
  </template>

  <div v-if="selectedWay" class="section">
    <div class="eyebrow">Выбрано: {{ selectedWay.tags?.name ?? `дорога ${selectedWay.id}` }}</div>
    <p v-if="selectedDirections.length === 0" class="hint muted">Эта дорога не участвует в движении автомобилей.</p>
    <div v-for="direction in selectedDirections" :key="String(direction.forward)" class="card">
      <div class="row">
        <strong>{{ direction.forward ? 'По ходу дороги' : 'Встречное направление' }}</strong>
        <span class="spacer" />
        <span class="pill">
          <span class="swatch small" :style="{ background: LOS_COLORS[direction.worst.los] }" aria-hidden="true" />
          {{ LOS_LABELS[direction.worst.los] }}
        </span>
      </div>
      <table class="grid">
        <tbody>
          <tr><th>Поток</th><td>{{ Math.round(direction.worst.volume) }} авт/ч</td></tr>
          <tr v-if="direction.worst.busesPerHour > 0"><th>Автобусы</th><td>{{ direction.worst.busesPerHour.toFixed(1) }} рейсов/ч</td></tr>
          <tr><th>Пропускная способность</th><td>{{ Math.round(direction.worst.capacity) }} авт/ч</td></tr>
          <tr><th>Загрузка</th><td>{{ Math.round(direction.worst.vc * 100) }}%</td></tr>
          <tr><th>Скорость</th><td>{{ Math.round(direction.worst.speedKmh) }} из {{ Math.round(direction.worst.freeSpeedKmh) }} км/ч</td></tr>
        </tbody>
      </table>
      <details>
        <summary>Как посчитана пропускная способность</summary>
        <ul>
          <li v-for="factor in direction.worst.factors" :key="factor.label">
            <span>{{ factor.label }}</span><span>{{ factor.value }}</span>
          </li>
        </ul>
      </details>
    </div>
    <p v-if="sim.level === 'micro'" class="hint muted">Сейчас в модели: {{ selectedMicroCars }} машин.</p>
  </div>

  <div class="section">
    <button class="btn block" @click="editor.viewMode = 'engineering'">Вернуться к редактированию</button>
  </div>
</template>

<style scoped>
.hint {
  margin: 0;
  font-size: 11px;
}
.procedure {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.procedure li {
  display: flex;
  gap: 5px;
}
.procedure .done {
  flex: none;
  margin-top: 2px;
  color: var(--ok);
}
.ms {
  margin-left: 5px;
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}
.detail {
  font-size: 11px;
}
.slider {
  display: flex;
  flex-direction: column;
  gap: 1px;
  font-size: 11px;
}
.grow {
  flex: 1;
}
.btn.on {
  background: var(--row-selected);
  border-color: var(--accent);
}
.grid {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
}
.grid th,
.grid td {
  padding: 1px 4px;
  border: 1px solid var(--line);
}
.grid th {
  background: var(--inset);
  font-weight: 400;
  text-align: left;
  color: var(--muted);
}
.grid td {
  background: var(--raised);
  text-align: right;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.warn {
  display: flex;
  gap: 5px;
  margin: 0;
  color: var(--warn-text);
  font-size: 11px;
}
.warn svg {
  flex: none;
  margin-top: 2px;
}
.los-row {
  display: grid;
  grid-template-columns: 20px 12px 1fr auto;
  align-items: center;
  gap: 5px;
  font-size: 11px;
}
.swatch {
  width: 20px;
  height: 7px;
}
.swatch.small {
  display: inline-block;
  width: 10px;
}
.los-label {
  font-weight: 600;
}
.nums {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.row-button {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  padding: 2px 4px;
  background: transparent;
  border: 0;
  font-size: 11px;
  text-align: left;
}
.row-button:hover {
  background: var(--row-hover);
}
.card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 5px;
  background: var(--inset);
  font-size: 11px;
}
.pill {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-weight: 600;
}
details summary {
  color: var(--muted);
  cursor: pointer;
}
details ul {
  display: flex;
  flex-direction: column;
  gap: 1px;
  margin: 3px 0 0;
  padding: 0;
  list-style: none;
}
details li {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}
details li span:first-child {
  color: var(--muted);
}
</style>
