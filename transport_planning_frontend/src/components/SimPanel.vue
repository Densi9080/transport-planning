<script setup lang="ts">
import { Box, Gauge, Pause, Play, RotateCcw, TrafficCone, TriangleAlert } from 'lucide-vue-next'
import { computed } from 'vue'

import { LOS_LABELS, LOS_TITLES, type Period } from '@/sim/macro'
import { losFromSpeedRatio } from '@/sim/micro'
import { LOS_COLORS } from '@/map/style'
import { useEditor } from '@/stores/editor'
import { useSimulation } from '@/stores/simulation'

const editor = useEditor()
const sim = useSimulation()

const periods: { id: Period; label: string }[] = [
  { id: 'morning', label: 'Утро' },
  { id: 'midday', label: 'День' },
  { id: 'evening', label: 'Вечер' },
]
const speeds = [1, 2, 5, 10]

const totals = computed(() => sim.macro?.totals ?? null)
const zoneCounts = computed(() => {
  const zones = sim.macro?.zones ?? []
  return { gateways: zones.filter((zone) => zone.kind === 'gateway').length, internal: zones.filter((zone) => zone.kind === 'internal').length }
})

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

const selectedMicro = computed(() => {
  void sim.loadRev
  const way = selectedWay.value
  if (!way) return []
  return sim.edgesOfWay(way.id).map((edge) => ({
    edge,
    los: losFromSpeedRatio(edge.speedRatio),
    speed: edge.speedRatio,
  }))
})

function edgeName(load: { edge: { tags: Record<string, string>; wayId: number } }): string {
  return load.edge.tags.name ?? `Дорога ${load.edge.wayId}`
}

function focusEdge(wayId: number): void {
  editor.focusWay(wayId)
}

function formatTime(seconds: number): string {
  const total = Math.floor(seconds)
  const minutes = Math.floor(total / 60)
  return `${minutes}:${String(total % 60).padStart(2, '0')}`
}

function setDemand(event: Event): void {
  sim.demand = Number((event.target as HTMLInputElement).value)
}
</script>

<template>
  <div class="section">
    <h2>Транспортная модель</h2>
    <div class="segmented accent" role="group" aria-label="Уровень модели">
      <button :class="{ active: sim.level === 'macro' }" :aria-pressed="sim.level === 'macro'" @click="sim.setLevel('macro')">
        <Gauge :size="14" aria-hidden="true" /> Макро
      </button>
      <button :class="{ active: sim.level === 'micro' }" :aria-pressed="sim.level === 'micro'" @click="sim.setLevel('micro')">
        <TrafficCone :size="14" aria-hidden="true" /> Микро
      </button>
    </div>
    <p class="muted hint">
      <template v-if="sim.level === 'macro'">
        Загрузка всей сети за час. Рассчитана из атрибутов дорог и зданий, без отдельных машин.
      </template>
      <template v-else>Каждая машина едет по полосе, уступает и стоит на светофорах.</template>
    </p>
  </div>

  <div class="section">
    <div class="field">
      <label>Период</label>
      <div class="segmented" role="group" aria-label="Период">
        <button
          v-for="item in periods"
          :key="item.id"
          :class="{ active: sim.period === item.id }"
          :aria-pressed="sim.period === item.id"
          @click="sim.period = item.id"
        >
          {{ item.label }}
        </button>
      </div>
    </div>
    <div class="field">
      <label for="sim-demand">Спрос: {{ Math.round(sim.demand * 100) }}%</label>
      <input id="sim-demand" class="range" type="range" min="0.2" max="2" step="0.1" :value="sim.demand" @change="setDemand" />
    </div>
  </div>

  <template v-if="sim.level === 'micro'">
    <div class="section">
      <div class="row">
        <button class="btn primary grow" @click="sim.togglePlay">
          <Pause v-if="sim.running" :size="14" aria-hidden="true" />
          <Play v-else :size="14" aria-hidden="true" />
          {{ sim.running ? 'Пауза' : 'Запустить' }} <kbd>Пробел</kbd>
        </button>
        <button class="btn" aria-label="Начать заново" title="Начать заново" @click="sim.reset">
          <RotateCcw :size="14" />
        </button>
      </div>
      <div class="segmented" role="group" aria-label="Скорость симуляции">
        <button
          v-for="value in speeds"
          :key="value"
          :class="{ active: sim.speed === value }"
          :aria-pressed="sim.speed === value"
          @click="sim.speed = value"
        >
          ×{{ value }}
        </button>
      </div>
      <button class="btn block" :class="{ on: sim.camera3d }" :aria-pressed="sim.camera3d" @click="sim.camera3d = !sim.camera3d">
        <Box :size="14" aria-hidden="true" /> {{ sim.camera3d ? '3D-вид включён' : 'Включить 3D-вид' }}
      </button>
      <label class="check"><input v-model="sim.colorBySpeed" type="checkbox" /> Красить машины по скорости</label>
      <label class="check"><input v-model="sim.guessSignals" type="checkbox" /> Светофоры на пересечениях крупных дорог</label>
      <label class="check"><input v-model="sim.showLoad" type="checkbox" /> Подсветка загрузки дорог</label>
    </div>

    <div v-if="sim.stats" class="section">
      <div class="stats">
        <div class="stat"><span class="eyebrow">Время</span><strong>{{ formatTime(sim.stats.time) }}</strong></div>
        <div class="stat"><span class="eyebrow">Машин</span><strong>{{ sim.stats.active }}</strong></div>
        <div class="stat"><span class="eyebrow">Ср. скорость</span><strong>{{ Math.round(sim.stats.avgSpeedKmh) }}<small> км/ч</small></strong></div>
        <div class="stat"><span class="eyebrow">Стоят</span><strong>{{ sim.stats.stopped }}</strong></div>
        <div class="stat"><span class="eyebrow">Доехали</span><strong>{{ sim.stats.finished }}</strong></div>
        <div class="stat"><span class="eyebrow">Ждут въезда</span><strong>{{ sim.stats.waitingToEnter }}</strong></div>
      </div>
      <p v-if="sim.stats.teleported > 0" class="warn">
        <TriangleAlert :size="13" aria-hidden="true" />
        Снято застрявших машин: {{ sim.stats.teleported }}. Так проявляются ошибки сети и заторы без выхода.
      </p>
    </div>

    <div class="section">
      <div class="eyebrow">Пробки: {{ sim.stats?.jams.length ?? 0 }}</div>
      <p v-if="!sim.stats?.jams.length" class="muted hint">Устойчивых очередей пока нет.</p>
      <button
        v-for="jam in sim.stats?.jams.slice(0, 8) ?? []"
        :key="jam.edge.id"
        class="row-button"
        @click="focusEdge(jam.edge.wayId)"
      >
        <span class="ellipsis">{{ jam.edge.tags.name ?? `Дорога ${jam.edge.wayId}` }}</span>
        <span class="faint">{{ Math.round(jam.lengthM) }} м · {{ jam.cars }} авт</span>
      </button>
    </div>
  </template>

  <template v-else-if="totals">
    <div class="section">
      <div class="stats">
        <div class="stat"><span class="eyebrow">Поездок в час</span><strong>{{ Math.round(totals.trips) }}</strong></div>
        <div class="stat"><span class="eyebrow">Ср. скорость</span><strong>{{ Math.round(totals.avgSpeedKmh) }}<small> км/ч</small></strong></div>
        <div class="stat"><span class="eyebrow">Пробег</span><strong>{{ Math.round(totals.vehKm) }}<small> авт·км</small></strong></div>
        <div class="stat"><span class="eyebrow">Потери времени</span><strong>{{ Math.round(totals.delayHours) }}<small> авт·ч</small></strong></div>
      </div>
      <p v-if="totals.unservedTrips >= 1" class="warn">
        <TriangleAlert :size="13" aria-hidden="true" />
        Без маршрута: {{ Math.round(totals.unservedTrips) }} поездок в час. Проверьте связность сети.
      </p>
      <p class="muted hint">
        Спрос: {{ zoneCounts.gateways }} въездов на границе и {{ zoneCounts.internal }} районов по площади зданий.
      </p>
    </div>

    <div class="section">
      <div class="eyebrow">Уровень обслуживания, доля длины сети</div>
      <div v-for="row in losRows" :key="row.label" class="los-row">
        <span class="swatch" :style="{ background: row.color }" aria-hidden="true" />
        <span class="los-label">{{ row.label }}</span>
        <span class="los-title">{{ row.title }}</span>
        <span class="los-value">{{ Math.round(row.share * 100) }}%</span>
      </div>
    </div>

    <div class="section">
      <div class="eyebrow">Самые загруженные участки</div>
      <p v-if="worstLoads.length === 0" class="muted hint">Загрузка везде ниже 75% пропускной способности.</p>
      <button v-for="load in worstLoads" :key="load.edge.id" class="row-button" @click="focusEdge(load.edge.wayId)">
        <span class="ellipsis">{{ edgeName(load) }}</span>
        <span class="faint">{{ Math.round(load.volume) }} / {{ Math.round(load.capacity) }} · {{ Math.round(load.vc * 100) }}%</span>
      </button>
    </div>
  </template>

  <div v-if="selectedWay" class="section">
    <div class="eyebrow">Выбрано: {{ selectedWay.tags?.name ?? `дорога ${selectedWay.id}` }}</div>
    <p v-if="selectedDirections.length === 0" class="muted hint">Эта дорога не участвует в движении автомобилей.</p>
    <div v-for="direction in selectedDirections" :key="String(direction.forward)" class="card">
      <div class="row">
        <strong>{{ direction.forward ? 'По ходу дороги' : 'Встречное направление' }}</strong>
        <span class="spacer" />
        <span class="pill">
          <span class="swatch small" :style="{ background: LOS_COLORS[direction.worst.los] }" aria-hidden="true" />
          {{ LOS_LABELS[direction.worst.los] }}
        </span>
      </div>
      <dl>
        <div><dt>Поток</dt><dd>{{ Math.round(direction.worst.volume) }} авт/ч</dd></div>
        <div><dt>Пропускная способность</dt><dd>{{ Math.round(direction.worst.capacity) }} авт/ч</dd></div>
        <div><dt>Загрузка</dt><dd>{{ Math.round(direction.worst.vc * 100) }}%</dd></div>
        <div><dt>Скорость</dt><dd>{{ Math.round(direction.worst.speedKmh) }} из {{ Math.round(direction.worst.freeSpeedKmh) }} км/ч</dd></div>
      </dl>
      <details>
        <summary>Как посчитана пропускная способность</summary>
        <ul>
          <li v-for="factor in direction.worst.factors" :key="factor.label">
            <span>{{ factor.label }}</span><span>{{ factor.value }}</span>
          </li>
        </ul>
      </details>
    </div>
    <p v-if="sim.level === 'micro' && selectedMicro.length" class="muted hint">
      Сейчас в модели: {{ selectedMicro.reduce((sum, item) => sum + item.edge.carCount, 0) }} машин.
    </p>
  </div>

  <div class="section">
    <button class="btn block" @click="editor.viewMode = 'engineering'">Вернуться к редактированию</button>
  </div>
</template>

<style scoped>
h2 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}
.hint {
  margin: 0;
  font-size: 12px;
}
.range {
  width: 100%;
  accent-color: var(--accent);
}
.grow {
  flex: 1;
}
.btn.on {
  border-color: var(--accent);
  background: var(--accent-soft);
}
kbd {
  background: rgba(0, 0, 0, 0.2);
  border-color: rgba(255, 255, 255, 0.35);
}
.check {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 12px;
}
.check input {
  accent-color: var(--accent);
}
.stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}
.stat {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 7px 9px;
  background: rgba(0, 0, 0, 0.22);
  border-radius: var(--radius-sm);
}
.stat strong {
  font-size: 18px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.stat small {
  color: var(--faint);
  font-size: 11px;
  font-weight: 400;
}
.warn {
  display: flex;
  gap: 6px;
  margin: 0;
  color: #fcd34d;
  font-size: 12px;
}
.warn svg {
  flex: none;
  margin-top: 2px;
}
.los-row {
  display: grid;
  grid-template-columns: 22px 16px 1fr auto;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}
.swatch {
  width: 20px;
  height: 8px;
  border-radius: 2px;
}
.swatch.small {
  display: inline-block;
  width: 10px;
}
.los-label {
  font-weight: 600;
}
.los-title {
  color: var(--muted);
}
.los-value {
  font-variant-numeric: tabular-nums;
}
.row-button {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  padding: 5px 6px;
  background: transparent;
  border: 0;
  border-radius: 5px;
  font-size: 12px;
  text-align: left;
}
.row-button:hover {
  background: var(--raised);
}
.row-button .faint {
  flex: none;
  font-variant-numeric: tabular-nums;
}
.ellipsis {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  background: rgba(0, 0, 0, 0.22);
  border-radius: var(--radius-sm);
  font-size: 12px;
}
.pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-weight: 600;
}
dl {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
}
dl > div {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}
dt {
  color: var(--muted);
}
dd {
  margin: 0;
  font-variant-numeric: tabular-nums;
}
details summary {
  color: var(--muted);
  cursor: pointer;
}
details ul {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 4px 0 0;
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
