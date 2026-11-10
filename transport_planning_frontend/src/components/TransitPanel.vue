<script setup lang="ts">
import { BusFront, CalendarClock, MapPinPlus, Plus, Search, Trash2, X } from 'lucide-vue-next'
import { computed, ref } from 'vue'

import { computeFlows, estimateFlows, readFlowList, writeFlowLists } from '@/core/ridership'
import { formatClock, type IntervalPeriod, parseClock, writeIntervalPeriods, writeServiceWindow } from '@/core/timetable'
import { DEFAULT_INTERVAL_MIN, TRANSIT_MODE_LABELS, type TransitMode } from '@/core/transit'
import { computeRoute, DEFAULT_DWELL_S, groupLines, oppositeRoute, routeParams, writeProfileValue } from '@/core/transitCalc'
import { useEditor } from '@/stores/editor'
import { useSimulation } from '@/stores/simulation'

import TimetableDialog from './TimetableDialog.vue'

const editor = useEditor()
const sim = useSimulation()
const query = ref('')
const modeFilter = ref<'all' | TransitMode>('all')
const creating = ref(false)
const newRef = ref('')
const newMode = ref<TransitMode>('bus')
const newInterval = ref(10)

const modes: TransitMode[] = ['bus', 'trolleybus', 'tram', 'minibus']

const visible = computed(() => {
  const needle = query.value.trim().toLowerCase()
  return editor.lines
    .filter((line) => modeFilter.value === 'all' || line.mode === modeFilter.value)
    .filter((line) => !needle || line.ref.toLowerCase().includes(needle) || line.name.toLowerCase().includes(needle))
})

const line = computed(() => editor.selectedLine)
const groups = computed(() => groupLines(visible.value))

const route = computed(() => {
  void editor.rev
  const current = line.value
  if (!current || !editor.doc || !editor.projector) return null
  return computeRoute(editor.doc, editor.projector, current, oppositeRoute(current, editor.lines))
})
const params = computed(() => (line.value ? routeParams(line.value) : null))

const PARAM_FIELDS: { key: string; label: string; field: 'speedKmh' | 'vehicleCapacity' | 'layoverMin' }[] = [
  { key: 'tp:speed', label: 'Скорость на перегоне, км/ч', field: 'speedKmh' },
  { key: 'tp:vehcap', label: 'Вместимость машины, чел.', field: 'vehicleCapacity' },
  { key: 'tp:layover', label: 'Отстой на конечной, мин', field: 'layoverMin' },
]

const timetableOpen = ref(false)
const estimateTotal = ref(300)

function setWindow(which: 'first' | 'last', event: Event): void {
  if (!line.value || !params.value) return
  const value = parseClock((event.target as HTMLInputElement).value)
  if (value === null) {
    editor.toast('Время указывается как ЧЧ:ММ', 'error')
    return
  }
  const window = params.value.window
  const first = which === 'first' ? value : window.firstMin
  let last = which === 'last' ? value : window.lastMin % 1440
  // Последний рейс раньше первого означает работу за полночь
  if (last <= first) last += 1440
  editor.updateLineTags(line.value.id, writeServiceWindow(line.value.tags, first, last), 'Время работы маршрута')
}

function savePeriods(periods: IntervalPeriod[]): void {
  if (!line.value) return
  editor.updateLineTags(line.value.id, writeIntervalPeriods(line.value.tags, periods), 'Интервалы по периодам')
}

function addPeriod(): void {
  if (!params.value || !line.value) return
  const interval = Math.max(1, Math.round(line.value.interval / 2))
  savePeriods([...params.value.periods, { fromMin: 7 * 60, toMin: 10 * 60, interval }])
}

function editPeriod(index: number, field: 'from' | 'to' | 'interval', event: Event): void {
  if (!params.value) return
  const raw = (event.target as HTMLInputElement).value
  const periods = params.value.periods.map((p) => ({ ...p }))
  const period = periods[index]!
  if (field === 'interval') {
    const value = Number(raw)
    if (!(value > 0)) return
    period.interval = value
  } else {
    const value = parseClock(raw)
    if (value === null) return
    if (field === 'from') period.fromMin = value
    else period.toMin = value <= period.fromMin ? value + 1440 : value
  }
  savePeriods(periods)
}

function removePeriod(index: number): void {
  if (!params.value) return
  savePeriods(params.value.periods.filter((_, i) => i !== index))
}

const flows = computed(() => {
  if (!line.value || !route.value || !params.value) return null
  return computeFlows(line.value.tags, route.value.profile, route.value.peakCapacityPerHour, params.value.vehicleCapacity)
})

function setFlow(key: 'tp:board' | 'tp:alight', index: number, event: Event): void {
  if (!line.value || !route.value) return
  const count = route.value.profile.length
  const board = readFlowList(line.value.tags, 'tp:board', count)
  const alight = readFlowList(line.value.tags, 'tp:alight', count)
  const raw = (event.target as HTMLInputElement).value.trim()
  const value = raw === '' ? null : Math.max(0, Number(raw))
  if (value !== null && !Number.isFinite(value)) return
  ;(key === 'tp:board' ? board : alight)[index] = value
  editor.updateLineTags(line.value.id, writeFlowLists(line.value.tags, board, alight), 'Пассажиропоток')
}

function fillEstimate(): void {
  if (!line.value || !route.value) return
  const { board, alight } = estimateFlows(route.value.profile.length, estimateTotal.value)
  editor.updateLineTags(line.value.id, writeFlowLists(line.value.tags, board, alight), 'Оценка пассажиропотока')
  editor.toast('Вход и выход заполнены равномерной оценкой. Замените их данными обследования, когда они будут')
}

function clearFlows(): void {
  if (!line.value || !route.value) return
  const empty = route.value.profile.map(() => null)
  editor.updateLineTags(line.value.id, writeFlowLists(line.value.tags, empty, empty), 'Очистка пассажиропотока')
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`
}

function setParam(key: string, event: Event): void {
  if (!line.value) return
  const value = (event.target as HTMLInputElement).value.trim()
  const tags = { ...line.value.tags }
  if (value && Number(value) > 0) tags[key] = value
  else delete tags[key]
  editor.updateLineTags(line.value.id, tags, 'Параметры маршрута')
}

function setProfile(key: 'tp:run' | 'tp:dwell', index: number, event: Event, scale: number): void {
  if (!line.value || !route.value) return
  const raw = (event.target as HTMLInputElement).value.trim()
  const value = raw === '' ? null : Math.max(0, Number(raw) * scale)
  if (value !== null && !Number.isFinite(value)) return
  editor.updateLineTags(line.value.id, writeProfileValue(line.value.tags, key, index, value, route.value.profile.length), 'Профиль времени')
}

function clock(seconds: number): string {
  const total = Math.round(seconds)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

const lineResult = computed(() => {
  const id = editor.selectedLineId
  return sim.macro?.lines.find((item) => item.service.line.id === id) ?? null
})

function createLine(): void {
  const ref = newRef.value.trim()
  if (!ref) {
    editor.toast('Укажите номер маршрута', 'error')
    return
  }
  editor.createTransitLine({ ref, mode: newMode.value, interval: newInterval.value })
  creating.value = false
  newRef.value = ''
}

function setField(key: string, event: Event): void {
  if (!line.value) return
  const value = (event.target as HTMLInputElement).value.trim()
  const tags = { ...line.value.tags }
  if (value) tags[key] = value
  else delete tags[key]
  editor.updateLineTags(line.value.id, tags)
}

function setInterval(event: Event): void {
  if (!line.value) return
  const value = Number((event.target as HTMLInputElement).value)
  if (!Number.isFinite(value) || value <= 0) {
    editor.toast('Интервал должен быть положительным числом минут', 'error')
    return
  }
  editor.updateLineTags(line.value.id, { ...line.value.tags, interval: String(value) }, 'Интервал маршрута')
}

function toggleTool(tool: 'lineWay' | 'lineStop'): void {
  editor.setTool(editor.tool === tool ? 'select' : tool)
}

function wayName(id: number): string {
  return editor.doc?.ways.get(id)?.tags?.name ?? `Дорога ${id}`
}

/** Удаление отменяется через Ctrl+Z, поэтому отдельного подтверждения не нужно. */
function deleteSelected(): void {
  if (!line.value) return
  const name = line.value.name
  editor.deleteTransitLine(line.value.id)
  editor.toast(`Маршрут «${name}» удалён. Вернуть: Ctrl+Z`)
}
</script>

<template>
  <section class="section">
    <div class="row">
      <label class="check grow"><input v-model="editor.layers.transit" type="checkbox" /> Все линии на карте</label>
      <button class="btn small" @click="creating = !creating"><Plus :size="12" aria-hidden="true" /> Новая</button>
    </div>
    <form v-if="creating" class="create" @submit.prevent="createLine">
      <div class="grid-2">
        <div class="field">
          <label for="new-ref">Номер</label>
          <input id="new-ref" v-model="newRef" class="input" />
        </div>
        <div class="field">
          <label for="new-mode">Вид</label>
          <select id="new-mode" v-model="newMode" class="input">
            <option v-for="mode in modes" :key="mode" :value="mode">{{ TRANSIT_MODE_LABELS[mode] }}</option>
          </select>
        </div>
      </div>
      <div class="field">
        <label for="new-interval">Интервал, мин</label>
        <input id="new-interval" v-model.number="newInterval" class="input" type="number" min="1" />
      </div>
      <button class="btn primary block" type="submit">Создать и выбрать дороги</button>
    </form>
    <div class="search">
      <Search :size="13" class="faint" aria-hidden="true" />
      <input v-model="query" class="input" placeholder="Номер или название" aria-label="Поиск маршрута" />
    </div>
    <select v-model="modeFilter" class="input" aria-label="Вид транспорта">
      <option value="all">Все виды</option>
      <option v-for="mode in modes" :key="mode" :value="mode">{{ TRANSIT_MODE_LABELS[mode] }}</option>
    </select>
  </section>

  <section class="list" aria-label="Маршруты">
    <div v-for="group in groups" :key="group.key" class="line-group">
      <div class="line-head">
        <span class="chip" :style="{ background: group.color }">{{ group.ref || '—' }}</span>
        <span class="ellipsis">{{ TRANSIT_MODE_LABELS[group.mode] }}</span>
        <span class="faint count">направлений {{ group.routes.length }}</span>
      </div>
      <button
        v-for="(item, index) in group.routes"
        :key="item.id"
        class="line-row"
        :class="{ active: editor.selectedLineId === item.id }"
        :aria-pressed="editor.selectedLineId === item.id"
        @click="editor.focusLine(item.id)"
      >
        <span class="direction" aria-hidden="true">{{ index === 0 ? '→' : '←' }}</span>
        <span class="ellipsis">{{ item.from && item.to ? `${item.from} → ${item.to}` : item.name }}</span>
      </button>
    </div>
    <p v-if="visible.length === 0" class="empty">Маршрутов не найдено</p>
  </section>

  <section v-if="line" class="section card">
    <div class="row">
      <span class="chip" :style="{ background: line.color }">{{ line.ref || '—' }}</span>
      <strong class="ellipsis">{{ TRANSIT_MODE_LABELS[line.mode] }}</strong>
      <span class="spacer" />
      <button class="btn ghost small" aria-label="Снять выбор маршрута" @click="editor.selectLine(null)"><X :size="12" /></button>
    </div>
    <div class="field">
      <label for="line-name">Название</label>
      <input id="line-name" class="input" :value="line.tags.name ?? ''" @change="setField('name', $event)" />
    </div>
    <div class="grid-2">
      <div class="field">
        <label for="line-ref">Номер</label>
        <input id="line-ref" class="input" :value="line.ref" @change="setField('ref', $event)" />
      </div>
      <div class="field">
        <label for="line-interval">Интервал, мин</label>
        <input id="line-interval" class="input" type="number" min="1" :value="line.interval" @change="setInterval" />
      </div>
    </div>
    <p v-if="!line.intervalTagged" class="muted info">Интервала нет в файле: принято {{ DEFAULT_INTERVAL_MIN }} минут.</p>

    <dl>
      <div><dt>На участке</dt><dd>{{ (line.lengthM / 1000).toFixed(2) }} км, {{ line.wayIds.length }} дорог</dd></div>
      <div><dt>За рамкой файла</dt><dd>{{ line.outsideWays }} дорог, {{ line.outsideStops }} остановок</dd></div>
      <div><dt>Остановок на участке</dt><dd>{{ line.stops.length }}</dd></div>
      <template v-if="lineResult">
        <div><dt>Рейсов в час</dt><dd>{{ lineResult.service.frequency.toFixed(1) }}</dd></div>
        <div><dt>Время по участку</dt><dd>{{ Math.round(lineResult.timeS / 60) }} мин</dd></div>
        <div><dt>Скорость сообщения</dt><dd>{{ Math.round(lineResult.speedKmh) }} км/ч</dd></div>
      </template>
    </dl>

    <template v-if="route && params">
      <h3 class="head">Показатели</h3>
      <dl>
        <div><dt>Длина по пунктам</dt><dd>{{ (route.lengthM / 1000).toFixed(2) }} км</dd></div>
        <div><dt>Время рейса</dt><dd>{{ clock(route.totalS) }}</dd></div>
        <div><dt>Скорость сообщения</dt><dd>{{ route.commercialKmh.toFixed(1) }} км/ч</dd></div>
        <div><dt>Рейсов в час</dt><dd>{{ route.tripsPerHour.toFixed(1) }}</dd></div>
        <div><dt>Провозная способность</dt><dd>{{ Math.round(route.capacityPerHour) }} чел/ч</dd></div>
        <div><dt>Оборотный рейс</dt><dd>{{ clock(route.roundTripS) }}{{ route.hasOpposite ? '' : ', встречного нет: принято то же время' }}</dd></div>
        <div v-if="route.peakIntervalMin < line.interval"><dt>Интервал в пик</dt><dd>{{ route.peakIntervalMin }} мин, {{ Math.round(route.peakCapacityPerHour) }} чел/ч</dd></div>
        <div><dt>Машин на линии{{ route.peakIntervalMin < line.interval ? ' в пик' : '' }}</dt><dd>{{ route.vehicles }}</dd></div>
        <div><dt>Рейсов в сутки</dt><dd>{{ route.tripsPerDay }}</dd></div>
        <div><dt>Пробег в сутки</dt><dd>{{ Math.round(route.vehicleKmPerDay) }} км</dd></div>
      </dl>
      <div class="grid-2">
        <div v-for="item in PARAM_FIELDS" :key="item.key" class="field">
          <label>{{ item.label }}</label>
          <input class="input" type="number" min="0" :value="params[item.field]" @change="setParam(item.key, $event)" />
        </div>
      </div>

      <h3 class="head">Расписание</h3>
      <div class="grid-2">
        <div class="field">
          <label for="line-first">Первый рейс</label>
          <input id="line-first" class="input" type="time" :value="formatClock(params.window.firstMin % 1440)" @change="setWindow('first', $event)" />
        </div>
        <div class="field">
          <label for="line-last">Последний рейс</label>
          <input id="line-last" class="input" type="time" :value="formatClock(params.window.lastMin % 1440)" @change="setWindow('last', $event)" />
        </div>
      </div>
      <p v-if="!params.window.tagged" class="muted info">Времени работы нет в файле: принято 06:00–22:00.</p>
      <div class="periods">
        <div class="period-head muted"><span>Период</span><span>Интервал, мин</span></div>
        <div class="period base"><span>Остальное время</span><span>{{ line.interval }}</span><span /></div>
        <div v-for="(period, index) in params.periods" :key="index" class="period">
          <span class="times">
            <input class="input" type="time" :value="formatClock(period.fromMin % 1440)" :aria-label="`Начало периода ${index + 1}`" @change="editPeriod(index, 'from', $event)" />
            –
            <input class="input" type="time" :value="formatClock(period.toMin % 1440)" :aria-label="`Конец периода ${index + 1}`" @change="editPeriod(index, 'to', $event)" />
          </span>
          <input class="input num" type="number" min="1" :value="period.interval" :aria-label="`Интервал периода ${index + 1}`" @change="editPeriod(index, 'interval', $event)" />
          <button class="btn ghost small" :aria-label="`Удалить период ${index + 1}`" @click="removePeriod(index)"><X :size="11" /></button>
        </div>
      </div>
      <div class="grid-2">
        <button class="btn small" @click="addPeriod"><Plus :size="12" aria-hidden="true" /> Период пик</button>
        <button class="btn small primary" :disabled="route.departures.length === 0" @click="timetableOpen = true">
          <CalendarClock :size="12" aria-hidden="true" /> Расписание рейсов
        </button>
      </div>
      <h3 class="head">Профиль времени</h3>
      <table class="profile">
        <thead><tr><th>№</th><th>Пункт</th><th>км</th><th>Ход, с</th><th>Стоянка, с</th><th>Время</th></tr></thead>
        <tbody>
          <tr v-for="(point, index) in route.profile" :key="`${point.node}-${index}`">
            <td>{{ index + 1 }}</td>
            <td class="name"><button class="link ellipsis" @click="editor.focusNode(point.node)">{{ point.name }}</button></td>
            <td>{{ (point.distanceM / 1000).toFixed(2) }}</td>
            <td><input v-if="index > 0" class="input" type="number" min="0" :value="Math.round(point.runS)" :class="{ tagged: point.runTagged }" @change="setProfile('tp:run', index, $event, 1)" /></td>
            <td><input v-if="index > 0 && index < route.profile.length - 1" class="input" type="number" min="0" :value="point.dwellS" :placeholder="String(DEFAULT_DWELL_S)" @change="setProfile('tp:dwell', index, $event, 1)" /></td>
            <td>{{ clock(point.arrivalS) }}</td>
          </tr>
        </tbody>
      </table>

      <template v-if="flows">
        <h3 class="head">Пассажиропотоки в час пик</h3>
        <table class="profile">
          <thead><tr><th>№</th><th>Пункт</th><th>Вошло</th><th>Вышло</th><th>Едет дальше</th></tr></thead>
          <tbody>
            <tr v-for="(point, index) in route.profile" :key="`f-${point.node}-${index}`" :class="{ max: flows.maxSpan === index, short: flows.shortageAt === index }">
              <td>{{ index + 1 }}</td>
              <td class="name ellipsis">{{ point.name }}</td>
              <td><input v-if="index < route.profile.length - 1" class="input" type="number" min="0" :value="flows.hasData ? flows.stops[index]!.board : ''" @change="setFlow('tp:board', index, $event)" /></td>
              <td><input v-if="index > 0" class="input" type="number" min="0" :value="flows.hasData ? flows.stops[index]!.alight : ''" @change="setFlow('tp:alight', index, $event)" /></td>
              <td>{{ index < route.profile.length - 1 && flows.hasData ? `${Math.round(flows.stops[index]!.loadAfter)} · ${percent(flows.spans[index]!.fill)}` : '' }}</td>
            </tr>
          </tbody>
        </table>
        <p class="muted info">Пасс/ч. Наполнение считается от провозной способности при интервале {{ route.peakIntervalMin }} мин.</p>
        <p v-if="flows.shortageAt !== null" class="bad info">На пункте {{ flows.shortageAt + 1 }} выходит больше, чем едет: выход урезан до числа едущих.</p>
        <p v-else-if="flows.hasData && !flows.balanced" class="bad info">Вошло {{ Math.round(flows.boardings) }}, вышло {{ Math.round(flows.alightings) }}: вход и выход не сходятся.</p>
        <dl v-if="flows.hasData">
          <div><dt>Перевезено за час</dt><dd>{{ Math.round(flows.boardings) }} пасс.</dd></div>
          <div><dt>Пассажирооборот</dt><dd>{{ Math.round(flows.passengerKm) }} пасс·км</dd></div>
          <div><dt>Средняя дальность поездки</dt><dd>{{ flows.avgTripKm.toFixed(2) }} км</dd></div>
          <div><dt>Коэффициент сменности</dt><dd>{{ flows.turnover.toFixed(2) }}</dd></div>
          <div><dt>Наибольший поток на перегоне</dt><dd>{{ Math.round(flows.maxLoad) }} пасс/ч, перегон {{ (flows.maxSpan ?? 0) + 1 }}–{{ (flows.maxSpan ?? 0) + 2 }}</dd></div>
          <div><dt>Наполнение на нём</dt><dd :class="{ bad: flows.maxFill > 1 }">{{ percent(flows.maxFill) }}</dd></div>
          <div><dt>Неравномерность по участкам</dt><dd>{{ flows.unevenness.toFixed(2) }}</dd></div>
          <div><dt>Нужно рейсов в час по вместимости</dt><dd>{{ flows.neededTripsPerHour.toFixed(1) }}, есть {{ (60 / route.peakIntervalMin).toFixed(1) }}</dd></div>
        </dl>
        <label class="check"><input v-model="editor.transitLoadShown" type="checkbox" /> Эпюра наполнения на карте</label>
        <div class="estimate">
          <label for="flow-total">Всего входящих, пасс/ч</label>
          <input id="flow-total" v-model.number="estimateTotal" class="input num" type="number" min="1" />
          <button class="btn small" @click="fillEstimate">Оценить</button>
          <button v-if="flows.hasData" class="btn ghost small" @click="clearFlows">Очистить</button>
        </div>
        <p class="muted info">Оценка делит вход поровну между пунктами, а выход равновероятно по следующим. Это допущение до появления данных обследования.</p>
      </template>
    </template>

    <div class="grid-2">
      <button class="btn small" :class="{ on: editor.tool === 'lineWay' }" :aria-pressed="editor.tool === 'lineWay'" @click="toggleTool('lineWay')">
        <BusFront :size="12" aria-hidden="true" /> Добавить дороги
      </button>
      <button class="btn small" :class="{ on: editor.tool === 'lineStop' }" :aria-pressed="editor.tool === 'lineStop'" @click="toggleTool('lineStop')">
        <MapPinPlus :size="12" aria-hidden="true" /> Добавить остановки
      </button>
    </div>

    <details>
      <summary>Остановки: {{ line.stops.length }}</summary>
      <div v-for="stop in line.stops" :key="`${stop.node}-${stop.role}`" class="member">
        <button class="link ellipsis" @click="editor.focusNode(stop.node)">{{ stop.name }}</button>
        <button class="btn ghost small" :aria-label="`Убрать остановку ${stop.name}`" @click="editor.removeStopFromLine(line!.id, stop.node)"><X :size="11" /></button>
      </div>
    </details>
    <details>
      <summary>Дороги: {{ line.wayIds.length }}</summary>
      <div v-for="(id, index) in line.wayIds" :key="`${id}-${index}`" class="member">
        <button class="link ellipsis" @click="editor.focusWay(id)">{{ wayName(id) }}</button>
        <button class="btn ghost small" :aria-label="`Убрать дорогу ${wayName(id)} из маршрута`" @click="editor.removeWayFromLine(line!.id, id)"><X :size="11" /></button>
      </div>
    </details>
    <button class="btn block small danger" @click="deleteSelected"><Trash2 :size="12" aria-hidden="true" /> Удалить маршрут</button>
    <TimetableDialog
      v-if="timetableOpen && route"
      :title="line.from && line.to ? `${line.ref} ${line.from} → ${line.to}` : line.name"
      :profile="route.profile"
      :departures="route.departures"
      @close="timetableOpen = false"
    />
  </section>
</template>

<style scoped>
.grow {
  flex: 1;
}
.line-head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 6px 1px;
}
.count {
  margin-left: auto;
  flex: none;
}
.direction {
  flex: none;
  width: 14px;
  color: var(--accent);
  font-weight: 600;
}
.head {
  margin: 8px 0 3px;
  font-size: 12px;
}
.profile {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
}
.profile th,
.profile td {
  padding: 2px 3px;
  border-bottom: 1px solid var(--line);
  text-align: left;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.profile th {
  color: var(--muted);
  font-weight: 500;
}
.profile .name {
  max-width: 92px;
  white-space: normal;
}
.profile input {
  width: 52px;
  padding: 1px 3px;
}
.profile input.tagged {
  border-color: var(--accent);
}
.profile tr.max td {
  background: var(--row-selected);
}
.profile tr.short td {
  color: var(--err-text);
}
.bad {
  color: var(--err-text);
}
.periods {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 11px;
}
.period-head,
.period {
  display: grid;
  grid-template-columns: 1fr 56px 22px;
  align-items: center;
  gap: 4px;
}
.period .times {
  display: flex;
  align-items: center;
  gap: 2px;
}
.period .times input {
  min-width: 0;
  padding: 1px 2px;
}
.num {
  width: 56px;
  padding: 1px 3px;
}
.estimate {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
}
.estimate label {
  flex: 1;
  color: var(--muted);
}
.create {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 6px;
  background: var(--inset);
}
.search {
  position: relative;
}
.search svg {
  position: absolute;
  left: 6px;
  top: 5px;
}
.search input {
  padding-left: 23px;
}
.list {
  max-height: 260px;
  overflow-y: auto;
  border-top: 1px solid var(--line);
}
.line-row {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 2px 8px;
  background: transparent;
  border: 0;
  text-align: left;
}
.line-row:hover {
  background: var(--row-hover);
}
.line-row.active {
  background: var(--row-selected);
}
.chip {
  flex: none;
  min-width: 30px;
  padding: 0 4px;
  border-radius: 2px;
  color: #ffffff;
  font-weight: 600;
  font-size: 11px;
  line-height: 16px;
  text-align: center;
}
.empty {
  margin: 6px 8px;
  color: var(--faint);
}
.info {
  margin: 0;
  font-size: 11px;
}
dl {
  display: flex;
  flex-direction: column;
  gap: 1px;
  margin: 0;
  font-size: 11px;
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
.btn.on {
  background: var(--row-selected);
  border-color: var(--accent);
}
details summary {
  cursor: pointer;
  color: var(--muted);
}
.member {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
}
.link {
  padding: 0;
  background: transparent;
  border: 0;
  color: var(--select);
  text-align: left;
}
.member .btn {
  padding: 0 2px;
  min-height: 17px;
}
</style>
