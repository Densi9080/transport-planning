<script setup lang="ts">
import { AlertCircle, AlertTriangle, ChevronRight, Info, Search, Wrench } from 'lucide-vue-next'
import { computed, reactive, ref } from 'vue'

import { isDrivable } from '@/core/lanes'
import { ISSUE_TITLES, type Issue, type IssueCode } from '@/core/validate'
import { COLORS } from '@/map/style'
import { useEditor } from '@/stores/editor'

const editor = useEditor()
type Tab = 'objects' | 'layers' | 'issues' | 'legend'
const tab = ref<Tab>('objects')
const query = ref('')
const open = reactive<Record<string, boolean>>({ roads: true, signals: false, junctions: false })

interface RoadGroup {
  name: string
  wayIds: number[]
}

const roads = computed<RoadGroup[]>(() => {
  void editor.rev
  const doc = editor.doc
  if (!doc) return []
  const groups = new Map<string, number[]>()
  for (const way of doc.ways.values()) {
    if (!isDrivable(way.tags)) continue
    const name = way.tags?.name ?? 'Без названия'
    const list = groups.get(name)
    if (list) list.push(way.id)
    else groups.set(name, [way.id])
  }
  const needle = query.value.trim().toLowerCase()
  return [...groups.entries()]
    .map(([name, wayIds]) => ({ name, wayIds }))
    .filter((group) => !needle || group.name.toLowerCase().includes(needle))
    .sort((a, b) => (a.name === 'Без названия' ? 1 : b.name === 'Без названия' ? -1 : a.name.localeCompare(b.name, 'ru')))
})

const signals = computed(() => {
  void editor.rev
  const doc = editor.doc
  if (!doc) return []
  return [...doc.nodes.values()].filter((node) => node.tags?.highway === 'traffic_signals')
})

const junctions = computed(() => {
  const network = editor.network
  const doc = editor.doc
  if (!network || !doc) return []
  const result: { id: number; degree: number; title: string }[] = []
  for (const [id, arms] of network.arms) {
    if (arms.length < 3) continue
    const names = [...new Set(arms.map((arm) => doc.ways.get(arm.link.wayId)?.tags?.name).filter(Boolean))]
    result.push({ id, degree: arms.length, title: names.slice(0, 2).join(' / ') || `Узел ${id}` })
  }
  return result.sort((a, b) => b.degree - a.degree)
})

const issueGroups = computed(() => {
  const groups = new Map<IssueCode, Issue[]>()
  for (const issue of editor.issues) {
    const list = groups.get(issue.code)
    if (list) list.push(issue)
    else groups.set(issue.code, [issue])
  }
  return [...groups.entries()].map(([code, issues]) => ({ code, issues }))
})

const counts = computed(() => {
  const result = { error: 0, warning: 0, info: 0 }
  for (const issue of editor.issues) result[issue.severity]++
  return result
})

const layerList = [
  { key: 'buildings', label: 'Здания' },
  { key: 'landuse', label: 'Территории и вода' },
  { key: 'minor', label: 'Тротуары и тропы' },
  { key: 'rail', label: 'Железная дорога' },
  { key: 'turnPaths', label: 'Траектории на перекрёстках' },
  { key: 'arrows', label: 'Стрелки на полосах' },
  { key: 'crossings', label: 'Пешеходные переходы' },
  { key: 'signals', label: 'Светофоры' },
  { key: 'labels', label: 'Названия улиц' },
  { key: 'issues', label: 'Ошибки на карте' },
] as const

const legend = [
  { color: COLORS.through, label: 'Проезд прямо' },
  { color: COLORS.left, label: 'Поворот налево' },
  { color: COLORS.right, label: 'Поворот направо' },
  { color: COLORS.select, label: 'Выбранный объект' },
  { color: COLORS.error, label: 'Ошибка сети' },
  { color: COLORS.warning, label: 'Предупреждение' },
]
</script>

<template>
  <aside class="nav panel" aria-label="Навигатор">
    <div class="tabs" role="tablist">
      <button :class="{ active: tab === 'objects' }" role="tab" :aria-selected="tab === 'objects'" @click="tab = 'objects'">Объекты</button>
      <button :class="{ active: tab === 'layers' }" role="tab" :aria-selected="tab === 'layers'" @click="tab = 'layers'">Слои</button>
      <button :class="{ active: tab === 'issues' }" role="tab" :aria-selected="tab === 'issues'" @click="tab = 'issues'">
        Проверка
        <span v-if="counts.error" class="badge">{{ counts.error }}</span>
      </button>
      <button :class="{ active: tab === 'legend' }" role="tab" :aria-selected="tab === 'legend'" @click="tab = 'legend'">Легенда</button>
    </div>

    <div class="body">
      <template v-if="tab === 'objects'">
        <div class="search">
          <Search :size="14" class="faint" aria-hidden="true" />
          <input v-model="query" class="input" placeholder="Поиск улицы" aria-label="Поиск улицы" />
        </div>

        <button class="group-head" :aria-expanded="open.roads" @click="open.roads = !open.roads">
          <ChevronRight :size="14" :class="{ turned: open.roads }" aria-hidden="true" />
          Дороги <span class="faint">{{ roads.length }}</span>
        </button>
        <template v-if="open.roads">
          <button v-for="group in roads" :key="group.name" class="item" @click="editor.focusWay(group.wayIds[0]!)">
            <span class="ellipsis">{{ group.name }}</span>
            <span class="faint">{{ group.wayIds.length }}</span>
          </button>
          <p v-if="roads.length === 0" class="empty">Ничего не найдено</p>
        </template>

        <button class="group-head" :aria-expanded="open.junctions" @click="open.junctions = !open.junctions">
          <ChevronRight :size="14" :class="{ turned: open.junctions }" aria-hidden="true" />
          Перекрёстки <span class="faint">{{ junctions.length }}</span>
        </button>
        <template v-if="open.junctions">
          <button v-for="item in junctions.slice(0, 100)" :key="item.id" class="item" @click="editor.focusNode(item.id)">
            <span class="ellipsis">{{ item.title }}</span>
            <span class="faint">{{ item.degree }} подх.</span>
          </button>
        </template>

        <button class="group-head" :aria-expanded="open.signals" @click="open.signals = !open.signals">
          <ChevronRight :size="14" :class="{ turned: open.signals }" aria-hidden="true" />
          Светофоры <span class="faint">{{ signals.length }}</span>
        </button>
        <template v-if="open.signals">
          <button v-for="node in signals" :key="node.id" class="item" @click="editor.focusNode(node.id)">
            Узел {{ node.id }}
          </button>
        </template>
      </template>

      <template v-else-if="tab === 'layers'">
        <label v-for="layer in layerList" :key="layer.key" class="check">
          <input v-model="editor.layers[layer.key]" type="checkbox" />
          {{ layer.label }}
        </label>
      </template>

      <template v-else-if="tab === 'issues'">
        <div class="summary">
          <span class="count error"><AlertCircle :size="14" aria-hidden="true" /> {{ counts.error }} ошибок</span>
          <span class="count warning"><AlertTriangle :size="14" aria-hidden="true" /> {{ counts.warning }}</span>
          <span class="count info"><Info :size="14" aria-hidden="true" /> {{ counts.info }}</span>
        </div>
        <p v-if="editor.issues.length === 0" class="empty">Ошибок в сети не найдено</p>
        <template v-for="group in issueGroups" :key="group.code">
          <button class="group-head" :aria-expanded="open[group.code] ?? false" @click="open[group.code] = !open[group.code]">
            <ChevronRight :size="14" :class="{ turned: open[group.code] }" aria-hidden="true" />
            <span class="dot" :class="group.issues[0]!.severity" aria-hidden="true" />
            <span class="ellipsis">{{ ISSUE_TITLES[group.code] }}</span>
            <span class="faint">{{ group.issues.length }}</span>
          </button>
          <template v-if="open[group.code]">
            <div
              v-for="issue in group.issues.slice(0, 80)"
              :key="issue.id"
              class="issue"
              :class="{ focused: editor.focusedIssue === issue.id }"
            >
              <button class="issue-text" @click="editor.focusIssue(issue)">{{ issue.message }}</button>
              <button v-if="issue.fix" class="btn small" @click="editor.applyFix(issue)">
                <Wrench :size="12" aria-hidden="true" />
                {{ issue.fixLabel }}
              </button>
            </div>
          </template>
        </template>
      </template>

      <template v-else>
        <div v-for="item in legend" :key="item.label" class="legend-row">
          <span class="swatch" :style="{ background: item.color }" aria-hidden="true" />
          {{ item.label }}
        </div>
        <p class="note faint">
          Траектории на перекрёстках построены из полос и запретов поворота. Симуляторы могут
          строить соединения по-своему: это подсказка, а не их результат.
        </p>
      </template>
    </div>
  </aside>
</template>

<style scoped>
.nav {
  position: absolute;
  top: 58px;
  left: 8px;
  bottom: 54px;
  width: min(300px, calc(100vw - 16px));
  display: flex;
  flex-direction: column;
  z-index: 11;
  overflow: hidden;
}
@media (max-width: 1240px) {
  .nav {
    bottom: 120px;
  }
}
.tabs {
  display: flex;
  border-bottom: 1px solid var(--line);
}
.tabs button {
  flex: 1;
  display: inline-flex;
  justify-content: center;
  align-items: center;
  gap: 4px;
  padding: 9px 2px;
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
.badge {
  min-width: 16px;
  padding: 0 4px;
  background: var(--err);
  border-radius: 8px;
  color: #fff;
  font-size: 10px;
  line-height: 15px;
}
.body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.search {
  position: relative;
  margin-bottom: 6px;
}
.search svg {
  position: absolute;
  left: 8px;
  top: 8px;
}
.search input {
  padding-left: 28px;
}
.group-head {
  display: flex;
  align-items: center;
  gap: 5px;
  width: 100%;
  padding: 6px 4px;
  background: transparent;
  border: 0;
  border-radius: 5px;
  font-weight: 600;
  text-align: left;
}
.group-head:hover {
  background: var(--raised);
}
.group-head svg {
  flex: none;
  transition: transform 0.12s;
}
.group-head svg.turned {
  transform: rotate(90deg);
}
.group-head > .faint {
  margin-left: auto;
  font-weight: 400;
}
.item {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  padding: 5px 8px 5px 23px;
  background: transparent;
  border: 0;
  border-radius: 5px;
  text-align: left;
}
.item:hover {
  background: var(--raised);
}
.ellipsis {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.empty {
  margin: 6px 8px;
  color: var(--faint);
}
.check {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 4px;
  border-radius: 5px;
}
.check:hover {
  background: var(--raised);
}
.check input {
  accent-color: var(--accent);
}
.summary {
  display: flex;
  gap: 12px;
  padding: 2px 4px 8px;
}
.count {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.count.error {
  color: #fca5a5;
}
.count.warning {
  color: #fcd34d;
}
.count.info {
  color: #93c5fd;
}
.dot {
  flex: none;
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
.dot.error {
  background: var(--err);
}
.dot.warning {
  background: var(--warn);
}
.dot.info {
  background: var(--info);
}
.issue {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
  margin-left: 18px;
  padding: 5px 6px;
  border-radius: 5px;
}
.issue:hover,
.issue.focused {
  background: var(--raised);
}
.issue-text {
  padding: 0;
  background: transparent;
  border: 0;
  color: var(--muted);
  font-size: 12px;
  text-align: left;
}
.issue-text:hover {
  color: var(--text);
}
.legend-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 4px;
}
.swatch {
  width: 22px;
  height: 6px;
  border-radius: 3px;
}
.note {
  margin: 8px 4px;
  font-size: 12px;
}
</style>
