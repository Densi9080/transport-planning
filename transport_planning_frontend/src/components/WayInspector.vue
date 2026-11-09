<script setup lang="ts">
import { ArrowLeftRight, Copy, Minus, Plus, Scissors, Sparkles, Spline, Trash2 } from 'lucide-vue-next'
import { computed, ref } from 'vue'

import { applyElevationRamp, clearElevation, maxSlopePercent, wayHeights } from '@/core/elevation'
import { polylineLength } from '@/core/geo'
import { isOneway, parseProfile, totalWidth, withLanes } from '@/core/lanes'
import { ROAD_TYPES, TYPE_DEFAULTS } from '@/core/presets'
import type { OWay, Tags } from '@/core/types'
import { useEditor } from '@/stores/editor'

import LaneEditor from './LaneEditor.vue'
import TagTable from './TagTable.vue'

const props = defineProps<{ way: OWay }>()
const editor = useEditor()
type Tab = 'props' | 'lanes' | 'tags'
const tab = ref<Tab>('props')

const tags = computed<Tags>(() => props.way.tags ?? {})
const profile = computed(() => parseProfile(tags.value))
const title = computed(() => tags.value.name ?? `Дорога ${props.way.id}`)
const isRoad = computed(() => !!tags.value.highway)

const lengthM = computed(() => {
  const doc = editor.doc
  const projector = editor.projector
  if (!doc || !projector) return 0
  const points = props.way.nds
    .map((id) => doc.nodes.get(id))
    .filter((node): node is NonNullable<typeof node> => !!node)
    .map((node) => projector.toXY(node))
  return polylineLength(points)
})

const heights = computed(() => {
  void editor.rev
  const doc = editor.doc
  if (!doc) return { start: 0, end: 0, hasEle: false }
  const map = wayHeights(doc, props.way)
  return {
    start: map.get(props.way.nds[0]!) ?? 0,
    end: map.get(props.way.nds.at(-1)!) ?? 0,
    hasEle: props.way.nds.some((id) => doc.nodes.get(id)?.tags?.ele !== undefined),
  }
})
const parallelGap = ref(12)
const rampStart = ref(0)
const rampEnd = ref(5.5)
const slope = computed(() => {
  void editor.rev
  const doc = editor.doc
  const projector = editor.projector
  return doc && projector ? maxSlopePercent(doc, props.way, projector) : 0
})

function applyRamp(): void {
  const from = Number(rampStart.value)
  const to = Number(rampEnd.value)
  if (!Number.isFinite(from) || !Number.isFinite(to)) {
    editor.toast('Высота должна быть числом', 'error')
    return
  }
  editor.mutate('Плавный переход по Z', (doc, projector) => applyElevationRamp(doc, projector, props.way.id, from, to))
  editor.toast('Высоты записаны в теги ele узлов', 'success')
}

function resetRamp(): void {
  editor.mutate('Сброс высот', (doc) => clearElevation(doc, props.way.id))
}

const structure = computed<'none' | 'bridge' | 'tunnel'>(() => {
  if (tags.value.bridge && tags.value.bridge !== 'no') return 'bridge'
  if (tags.value.tunnel && tags.value.tunnel !== 'no') return 'tunnel'
  return 'none'
})

function update(next: Tags, label?: string): void {
  editor.updateWayTags(props.way.id, next, label)
}

function setTag(key: string, value: string, label?: string): void {
  const next: Tags = { ...tags.value }
  if (value.trim()) next[key] = value.trim()
  else delete next[key]
  update(next, label)
}

function setHighway(value: string): void {
  const next: Tags = { ...tags.value, highway: value }
  const defaults = TYPE_DEFAULTS[value]
  if (defaults && !next.maxspeed) next.maxspeed = defaults.maxspeed
  update(next, 'Тип дороги')
}

function fillDefaults(): void {
  const defaults = TYPE_DEFAULTS[tags.value.highway ?? '']
  if (!defaults) return
  const next: Tags = { ...tags.value }
  if (!next.maxspeed) next.maxspeed = defaults.maxspeed
  if (!next.lanes) {
    const lanes = Number(defaults.lanes)
    next.lanes = isOneway(next) ? String(Math.max(1, Math.ceil(lanes / 2))) : defaults.lanes
  }
  update(next, 'Автозаполнение')
}

function setOneway(oneway: boolean): void {
  const p = profile.value
  const total = Math.max(1, p.forward + p.backward)
  if (oneway) {
    const next: Tags = { ...tags.value, oneway: 'yes', lanes: String(total) }
    delete next['lanes:forward']
    delete next['lanes:backward']
    delete next['turn:lanes:backward']
    update(next, 'Односторонняя дорога')
  } else {
    const next: Tags = { ...tags.value }
    delete next.oneway
    const forward = Math.max(1, Math.ceil(total / 2))
    const backward = Math.max(1, total - forward)
    update(withLanes(next, forward, backward), 'Двусторонняя дорога')
  }
}

function changeLanes(direction: 'forward' | 'backward', delta: number): void {
  const p = profile.value
  if (p.oneway) {
    const reversed = p.forward === 0
    const lanes = Math.max(1, p.forward + p.backward + delta)
    update(withLanes(tags.value, reversed ? 0 : lanes, reversed ? lanes : 0), 'Число полос')
  } else {
    const forward = direction === 'forward' ? Math.max(1, p.forward + delta) : p.forward
    const backward = direction === 'backward' ? Math.max(1, p.backward + delta) : p.backward
    update(withLanes(tags.value, forward, backward), 'Число полос')
  }
}

function setStructure(kind: 'none' | 'bridge' | 'tunnel'): void {
  const next: Tags = { ...tags.value }
  delete next.bridge
  delete next.tunnel
  delete next.layer
  if (kind === 'bridge') {
    next.bridge = 'yes'
    next.layer = '1'
  } else if (kind === 'tunnel') {
    next.tunnel = 'yes'
    next.layer = '-1'
  }
  update(next, 'Мост или тоннель')
}

function changeLayer(delta: number): void {
  const layer = (Number.parseInt(tags.value.layer ?? '0', 10) || 0) + delta
  setTag('layer', layer === 0 ? '' : String(layer), 'Уровень дороги')
}
</script>

<template>
  <div class="section head">
    <div class="row">
      <h2 class="ellipsis">{{ title }}</h2>
      <span class="spacer" />
      <span class="faint id">#{{ way.id }}</span>
    </div>
    <div v-if="isRoad" class="hero">
      <div class="stat">
        <span class="eyebrow">Полос</span>
        <strong>{{ profile.oneway ? profile.forward + profile.backward : `${profile.forward} + ${profile.backward}` }}</strong>
      </div>
      <div class="stat">
        <span class="eyebrow">Ширина</span>
        <strong>{{ totalWidth(profile).toFixed(1) }}<small> м</small></strong>
      </div>
      <div class="stat">
        <span class="eyebrow">Скорость</span>
        <strong>{{ tags.maxspeed ?? '—' }}<small v-if="tags.maxspeed && /^\d+$/.test(tags.maxspeed)"> км/ч</small></strong>
      </div>
      <div class="stat">
        <span class="eyebrow">Длина</span>
        <strong>{{ lengthM.toFixed(0) }}<small> м</small></strong>
      </div>
    </div>
    <p v-if="profile.inferred && isRoad" class="hint">Полос нет в файле: показано значение по умолчанию.</p>
  </div>

  <div class="tabs" role="tablist">
    <button :class="{ active: tab === 'props' }" role="tab" :aria-selected="tab === 'props'" @click="tab = 'props'">Свойства</button>
    <button :class="{ active: tab === 'lanes' }" role="tab" :aria-selected="tab === 'lanes'" @click="tab = 'lanes'">Полосы</button>
    <button :class="{ active: tab === 'tags' }" role="tab" :aria-selected="tab === 'tags'" @click="tab = 'tags'">Все теги</button>
  </div>

  <template v-if="tab === 'props'">
    <div class="section">
      <div class="field">
        <label for="way-name">Название</label>
        <input id="way-name" class="input" :value="tags.name ?? ''" @change="setTag('name', ($event.target as HTMLInputElement).value, 'Название')" />
      </div>
      <div class="field">
        <label for="way-type">Тип дороги</label>
        <select id="way-type" class="input" :value="tags.highway" @change="setHighway(($event.target as HTMLSelectElement).value)">
          <option v-if="!ROAD_TYPES.some((t) => t.value === tags.highway)" :value="tags.highway">{{ tags.highway }}</option>
          <option v-for="type in ROAD_TYPES" :key="type.value" :value="type.value">{{ type.label }}</option>
        </select>
      </div>
      <button class="btn block small" :disabled="!TYPE_DEFAULTS[tags.highway ?? ''] || (!!tags.lanes && !!tags.maxspeed)" @click="fillDefaults">
        <Sparkles :size="13" aria-hidden="true" /> Заполнить пустое по типу дороги
      </button>
    </div>

    <div class="section">
      <div class="field">
        <label>Направление</label>
        <div class="segmented" role="group" aria-label="Направление движения">
          <button :class="{ active: !profile.oneway }" :aria-pressed="!profile.oneway" @click="profile.oneway && setOneway(false)">Двустороннее</button>
          <button :class="{ active: profile.oneway }" :aria-pressed="profile.oneway" @click="!profile.oneway && setOneway(true)">Одностороннее</button>
        </div>
      </div>
      <button class="btn block small" @click="editor.reverseSelected">
        <ArrowLeftRight :size="13" aria-hidden="true" />
        {{ profile.oneway ? 'Развернуть движение' : 'Развернуть порядок узлов' }} <kbd>F</kbd>
      </button>
      <div class="grid-2">
        <div class="field">
          <label>{{ profile.oneway ? 'Полос' : 'По ходу' }}</label>
          <div class="stepper">
            <button aria-label="Меньше полос" @click="changeLanes('forward', -1)"><Minus :size="13" /></button>
            <span>{{ profile.oneway ? profile.forward + profile.backward : profile.forward }}</span>
            <button aria-label="Больше полос" @click="changeLanes('forward', 1)"><Plus :size="13" /></button>
          </div>
        </div>
        <div v-if="!profile.oneway" class="field">
          <label>Встречных</label>
          <div class="stepper">
            <button aria-label="Меньше встречных полос" @click="changeLanes('backward', -1)"><Minus :size="13" /></button>
            <span>{{ profile.backward }}</span>
            <button aria-label="Больше встречных полос" @click="changeLanes('backward', 1)"><Plus :size="13" /></button>
          </div>
        </div>
      </div>
      <div class="grid-2">
        <div class="field">
          <label for="way-speed">Скорость, км/ч</label>
          <input id="way-speed" class="input" :value="tags.maxspeed ?? ''" @change="setTag('maxspeed', ($event.target as HTMLInputElement).value, 'Скорость')" />
        </div>
        <div class="field">
          <label for="way-width">Ширина, м</label>
          <input id="way-width" class="input" :value="tags.width ?? ''" placeholder="авто" @change="setTag('width', ($event.target as HTMLInputElement).value, 'Ширина')" />
        </div>
      </div>
    </div>

    <div class="section">
      <div class="field">
        <label>Сооружение</label>
        <div class="segmented" role="group" aria-label="Сооружение">
          <button :class="{ active: structure === 'none' }" :aria-pressed="structure === 'none'" @click="setStructure('none')">Нет</button>
          <button :class="{ active: structure === 'bridge' }" :aria-pressed="structure === 'bridge'" @click="setStructure('bridge')">Мост</button>
          <button :class="{ active: structure === 'tunnel' }" :aria-pressed="structure === 'tunnel'" @click="setStructure('tunnel')">Тоннель</button>
        </div>
      </div>
      <div class="field">
        <label>Уровень (layer)</label>
        <div class="stepper">
          <button aria-label="Уровень ниже" @click="changeLayer(-1)"><Minus :size="13" /></button>
          <span>{{ tags.layer ?? '0' }}</span>
          <button aria-label="Уровень выше" @click="changeLayer(1)"><Plus :size="13" /></button>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="eyebrow">Плавный переход по высоте (Z)</div>
      <div class="grid-2">
        <div class="field">
          <label for="ramp-start">Начало, м</label>
          <input id="ramp-start" v-model.number="rampStart" class="input" type="number" step="0.5" />
        </div>
        <div class="field">
          <label for="ramp-end">Конец, м</label>
          <input id="ramp-end" v-model.number="rampEnd" class="input" type="number" step="0.5" />
        </div>
      </div>
      <button class="btn block small" @click="applyRamp">Построить плавный переход</button>
      <p class="muted info">
        Сейчас: {{ heights.start.toFixed(1) }} → {{ heights.end.toFixed(1) }} м, уклон до {{ slope.toFixed(1) }}%.
        <span v-if="slope > 12" class="warn">Круто для автомобильной дороги.</span>
      </p>
      <button v-if="heights.hasEle" class="btn block small" @click="resetRamp">Сбросить высоты</button>
    </div>

    <div class="section">
      <div class="eyebrow">Геометрия</div>
      <div class="grid-2">
        <button class="btn small" @click="editor.smoothSelected">
          <Spline :size="13" aria-hidden="true" /> Сгладить
        </button>
        <button class="btn small" @click="editor.duplicateSelected">
          <Copy :size="13" aria-hidden="true" /> Дублировать
        </button>
      </div>
      <div class="field">
        <label for="parallel-gap">Параллельная дорога, расстояние в метрах</label>
        <input id="parallel-gap" v-model.number="parallelGap" class="input" type="number" min="1" step="0.5" />
      </div>
      <div class="grid-2">
        <button class="btn small" @click="editor.parallelSelected(parallelGap, 1)">Слева</button>
        <button class="btn small" @click="editor.parallelSelected(parallelGap, -1)">Справа</button>
      </div>
    </div>

    <div class="section">
      <button class="btn block small" @click="editor.setTool('split')">
        <Scissors :size="13" aria-hidden="true" /> Разрезать дорогу <kbd>X</kbd>
      </button>
      <button class="btn block small danger" @click="editor.deleteSelection">
        <Trash2 :size="13" aria-hidden="true" /> Удалить дорогу <kbd>Del</kbd>
      </button>
    </div>
  </template>

  <div v-else-if="tab === 'lanes'" class="section">
    <LaneEditor :tags="tags" @change="update($event, 'Манёвры полос')" />
  </div>

  <div v-else class="section">
    <TagTable :tags="tags" @change="update($event)" />
  </div>
</template>

<style scoped>
h2 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}
.ellipsis {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.id {
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
.hero {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}
.stat {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 7px 9px;
  background: var(--inset);
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
.hint {
  margin: 0;
  color: var(--warn-text);
  font-size: 12px;
}
.info {
  margin: 0;
  font-size: 12px;
}
.warn {
  color: var(--warn-text);
}
.tabs {
  display: flex;
  border-top: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
  position: sticky;
  top: 0;
  background: var(--panel-solid);
  z-index: 1;
}
.tabs button {
  flex: 1;
  padding: 7px 2px;
  background: transparent;
  border: 0;
  border-bottom: 2px solid transparent;
  color: var(--muted);
  font-size: 12px;
}
.tabs button:hover {
  color: var(--text);
}
.tabs button.active {
  color: var(--text);
  border-bottom-color: var(--accent);
}
.tabs + .section {
  border-top: 0;
}
.stepper {
  display: flex;
  align-items: center;
  background: var(--field-bg);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
}
.stepper button {
  display: grid;
  place-items: center;
  width: 30px;
  height: 28px;
  background: transparent;
  border: 0;
  border-radius: 5px;
}
.stepper button:hover {
  background: var(--raised-hover);
}
.stepper span {
  flex: 1;
  text-align: center;
  font-variant-numeric: tabular-nums;
}
kbd {
  margin-left: auto;
}
</style>
