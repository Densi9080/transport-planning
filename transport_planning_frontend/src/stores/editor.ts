import { defineStore } from 'pinia'
import { computed, markRaw, reactive, ref, shallowRef, watch } from 'vue'

import { loadProject, saveChanges } from '@/api'
import { OsmDoc } from '@/core/doc'
import { computeHidden, type FilterLogic, type FilterMode, type FilterRule, NOTHING_HIDDEN } from '@/core/filter'
import { offsetPolyline, Projector, smoothCurve } from '@/core/geo'
import {
  addNode,
  addWay,
  deleteNode,
  deleteWay,
  insertNodeOnWay,
  joinWays,
  mergeNodes,
  reverseWay,
  setNodeTags,
  setWayTags,
  splitWay,
  toggleNodeHighway,
  toggleStructure,
  unglueNode,
} from '@/core/ops'
import { DEFAULT_PRESET_ID, ROAD_PRESETS } from '@/core/presets'
import type { CrsId } from '@/core/crs'
import { arrivalArm, departureArm, laneAtPoint, lanePolyline, type LanePort, lanePorts, laneStubNearNode } from '@/core/lanePick'
import { nodeConnectors, setLaneConnection } from '@/core/laneOps'
import { laneOffsets, parseProfile, totalWidth } from '@/core/lanes'
import { buildNetwork } from '@/core/topology'
import {
  addSpeedBump,
  applySpeedSection,
  type BumpKind,
  createParallelWay,
  removeSpeedBump,
  type SignKind,
  smoothWay,
  toggleSign,
} from '@/core/traffic'
import {
  addLineStop,
  addLineWay,
  createLine,
  createStopOnWay,
  deleteLine,
  listLines,
  readLine,
  removeLineStop,
  removeLineWay,
  setLineTags,
  type TransitLine,
  type TransitMode,
} from '@/core/transit'
import type { LatLon, Tags, XY } from '@/core/types'
import type { BasemapId, ThemeName } from '@/map/style'
import { type Issue, validate } from '@/core/validate'
import { customObjectTags, isCustomObject, matchesNode, matchesWay, type NetObject, pickTypeOf } from '@/core/netObjects'

export type Tool =
  | 'select'
  | 'node'
  | 'road'
  | 'split'
  | 'signal'
  | 'crossing'
  | 'bridge'
  | 'tunnel'
  | 'speed'
  | 'bump'
  | 'sign'
  | 'connector'
  | 'lineWay'
  | 'lineStop'
  | 'object'
  | 'stopPoint'
  | 'stopArea'
  | 'stopGroup'

/** Какие объекты сети выбираются щелчком: как активный тип объектов в Visum. */
export type ActiveType = 'auto' | 'links' | 'nodes'
/** Режимы окна сети: вставка, редактирование и выделение рамкой. */
export type EditMode = 'insert' | 'edit' | 'select'

export interface ConsoleEntry {
  id: number
  time: string
  level: 'error' | 'warning' | 'info'
  source: string
  text: string
}

const INSERT_TOOLS: Record<NetObject, Tool> = {
  nodes: 'node',
  links: 'road',
  turns: 'connector',
  stopPoints: 'stopPoint',
  stopAreas: 'stopArea',
  stops: 'stopGroup',
  routes: 'lineWay',
  desiredSpeed: 'object',
  reducedSpeed: 'object',
  stopSigns: 'sign',
  priorityRules: 'object',
  signals: 'signal',
  detectors: 'object',
  inflows: 'object',
}

const OBJECT_OF_TOOL = new Map<Tool, NetObject>(
  (Object.entries(INSERT_TOOLS) as [NetObject, Tool][]).filter(([, tool]) => tool !== 'object').map(([object, tool]) => [tool, object]),
)
const CONSOLE_LIMIT = 500
export type LeftTab = 'network' | 'graphics' | 'filter' | 'transit' | 'issues'
export type ListTab = 'links' | 'nodes' | 'signals' | 'lines' | 'stops' | 'zones' | 'matrix'
export type ViewMode = 'engineering' | 'graph' | '3d' | 'sim'
export type Basemap = BasemapId

export interface CameraState {
  center: [number, number]
  zoom: number
  bearing: number
  pitch: number
}

export interface ImageUnderlay {
  url: string
  /** Углы по часовой стрелке от верхнего левого: [долгота, широта]. */
  corners: [[number, number], [number, number], [number, number], [number, number]]
}
export type DrawMode = 'polyline' | 'straight' | 'curve'
export type SaveState = 'saved' | 'dirty' | 'saving' | 'error'

export interface SelectedItem {
  kind: 'node' | 'way'
  id: number
}

export interface DrawPoint extends LatLon {
  nodeId?: number
  wayId?: number
}

export interface Toast {
  id: number
  text: string
  tone: 'info' | 'error' | 'success'
}

const AUTOSAVE_DELAY_MS = 800
const VALIDATE_DELAY_MS = 350
const TOAST_MS = 3500
const WIDE_SCREEN_PX = 1100
const TILE_URL_KEY = 'osm-editor-tile-url'
const THEME_KEY = 'osm-editor-theme'
const FILTER_KEY = 'osm-editor-filter:'
const CRS_KEY = 'osm-editor-crs'
const CONNECTOR_STUB_M = 25
const STOP_GROUP_RADIUS_M = 100

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStored(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Без браузерного хранилища настройка проживёт только до перезагрузки
  }
}

export const useEditor = defineStore('editor', () => {
  const doc = shallowRef<OsmDoc | null>(null)
  const projector = shallowRef<Projector | null>(null)
  const rev = ref(0)

  const projectId = ref<string | null>(null)
  const projectName = ref('')
  const saveState = ref<SaveState>('saved')
  const loading = ref(false)
  const loadError = ref<string | null>(null)

  const tool = ref<Tool>('select')
  const mode = ref<EditMode>('edit')
  const activeObject = ref<NetObject>('links')
  const objectHidden = reactive<Partial<Record<NetObject, boolean>>>({})
  const objectLocked = reactive<Partial<Record<NetObject, boolean>>>({})
  const consoleOpen = ref(true)
  const consoleLog = shallowRef<ConsoleEntry[]>([])
  const viewMode = ref<ViewMode>('engineering')
  const selection = shallowRef<SelectedItem[]>([])
  const presetId = ref(DEFAULT_PRESET_ID)
  const drawMode = ref<DrawMode>('polyline')
  const drawPoints = shallowRef<DrawPoint[]>([])
  const speedStart = shallowRef<{ wayId: number; position: LatLon } | null>(null)
  const connectorFrom = shallowRef<{ node: number; neighbor: number; lane: number; points: XY[]; port?: XY } | null>(null)
  const mapBalance = ref(0.5)
  const crs = ref<CrsId>((readStored(CRS_KEY) as CrsId | null) ?? 'wgs84')
  const filterMode = ref<FilterMode>('hide')
  const filterLogic = ref<FilterLogic>('any')
  const trafficOptions = reactive({
    sectionSpeed: 30,
    bumpKind: 'hump' as BumpKind,
    bumpSpeed: 20,
    signKind: 'give_way' as SignKind,
  })

  const basemap = ref<Basemap>('none')
  const basemapOpacity = ref(1)
  const modelOpacity = ref(1)
  const compareOpen = ref(false)
  const customTileUrl = ref(readStored(TILE_URL_KEY) ?? '')
  const imageUnderlay = shallowRef<ImageUnderlay | null>(null)
  /** Положение основной карты: от него зависит карта рядом и начальное место снимка. */
  const camera = shallowRef<CameraState | null>(null)
  const cameraRequest = shallowRef<CameraState | null>(null)
  const layers = reactive({
    buildings: true,
    landuse: true,
    minor: true,
    rail: true,
    turnPaths: true,
    arrows: true,
    crossings: true,
    signals: true,
    trafficSigns: true,
    zones: false,
    labels: true,
    issues: true,
    transit: false,
    other: true,
    points: true,
  })

  const theme = ref<ThemeName>(readStored(THEME_KEY) === 'dark' ? 'dark' : 'light')
  const activeType = ref<ActiveType>('links')
  const leftTab = ref<LeftTab>('network')
  const listOpen = ref(false)
  const listTab = ref<ListTab>('links')
  /** Узел, открытый в редакторе узла. */
  const junctionNode = ref<number | null>(null)
  const junctionTab = ref<'lanes' | 'signal'>('lanes')
  const selectedLineId = ref<number | null>(null)
  const cursor = shallowRef<LatLon | null>(null)
  const filterRules = ref<FilterRule[]>([])
  const rightTab = ref<'quick' | 'assistant'>('quick')
  /** Объекты из предложений помощника, ожидающих решения. */
  const proposalTargets = shallowRef<{ ways: number[]; nodes: number[] } | null>(null)

  const issues = shallowRef<Issue[]>([])
  const focusedIssue = ref<string | null>(null)
  const focusRequest = shallowRef<{ position: LatLon; zoom?: number } | null>(null)

  const toasts = ref<Toast[]>([])
  const helpOpen = ref(false)
  const exportOpen = ref(false)
  const zoom = ref(15)
  /** Счётчик запросов «показать весь участок». */
  const fitRev = ref(0)
  // На узком окне панели закрыли бы карту целиком, поэтому там они изначально свёрнуты
  const wideScreen = window.innerWidth >= WIDE_SCREEN_PX
  const navigatorOpen = ref(wideScreen)
  const inspectorOpen = ref(wideScreen)

  watch(customTileUrl, (value) => writeStored(TILE_URL_KEY, value))
  watch(crs, (value) => writeStored(CRS_KEY, value))
  // Один ползунок вместо двух: посередине видно и модель, и карту, к краям одно плавно уступает другому
  watch(mapBalance, (value) => {
    modelOpacity.value = Math.min(1, (1 - value) * 2)
    basemapOpacity.value = Math.min(1, value * 2)
    if (value > 0.5 && basemap.value === 'none') basemap.value = 'scheme2gis'
  })
  watch([filterMode, filterLogic], ([mode, logic]) => {
    if (projectId.value) writeStored(`${FILTER_KEY}${projectId.value}:mode`, `${mode}|${logic}`)
  })
  watch(
    theme,
    (value) => {
      writeStored(THEME_KEY, value)
      document.documentElement.dataset.theme = value
    },
    { immediate: true },
  )
  watch(
    filterRules,
    (rules) => {
      if (projectId.value) writeStored(FILTER_KEY + projectId.value, JSON.stringify(rules))
    },
    { deep: true },
  )

  /** Скрытые по атрибутам объекты. Считается заново при правке графа и при смене правил. */
  const hidden = computed(() => {
    void rev.value
    return doc.value && filterRules.value.length > 0 ? markRaw(computeHidden(doc.value, filterRules.value, filterMode.value, filterLogic.value)) : NOTHING_HIDDEN
  })

  const lines = computed<TransitLine[]>(() => {
    void rev.value
    return doc.value && projector.value ? listLines(doc.value, projector.value) : []
  })

  const selectedLine = computed(() => lines.value.find((line) => line.id === selectedLineId.value) ?? null)

  const preset = computed(
    () => ROAD_PRESETS.find((item) => item.id === presetId.value) ?? ROAD_PRESETS[0]!,
  )
  const network = computed(() => {
    void rev.value
    return doc.value && projector.value ? markRaw(buildNetwork(doc.value, projector.value)) : null
  })
  const selectedWays = computed(() => {
    void rev.value
    return selection.value
      .filter((item) => item.kind === 'way')
      .map((item) => doc.value?.ways.get(item.id))
      .filter((way): way is NonNullable<typeof way> => !!way)
  })
  const selectedNodes = computed(() => {
    void rev.value
    return selection.value
      .filter((item) => item.kind === 'node')
      .map((item) => doc.value?.nodes.get(item.id))
      .filter((node): node is NonNullable<typeof node> => !!node)
  })
  const canUndo = computed(() => {
    void rev.value
    return doc.value?.canUndo ?? false
  })
  const canRedo = computed(() => {
    void rev.value
    return doc.value?.canRedo ?? false
  })
  const changeCount = computed(() => {
    void rev.value
    return doc.value?.changeCount ?? 0
  })
  const errorCount = computed(() => issues.value.filter((i) => i.severity === 'error').length)

  let consoleId = 0
  function logConsole(level: ConsoleEntry['level'], source: string, text: string): void {
    const time = new Date().toLocaleTimeString('ru-RU')
    consoleLog.value = [...consoleLog.value, { id: ++consoleId, time, level, source, text }].slice(-CONSOLE_LIMIT)
  }

  let toastId = 0
  function toast(text: string, tone: Toast['tone'] = 'info'): void {
    if (tone === 'error') logConsole('error', 'Редактор', text)
    const id = ++toastId
    toasts.value.push({ id, text, tone })
    setTimeout(() => {
      toasts.value = toasts.value.filter((item) => item.id !== id)
    }, TOAST_MS)
  }

  async function open(id: string): Promise<void> {
    loading.value = true
    loadError.value = null
    try {
      const project = await loadProject(id)
      const next = new OsmDoc(project.document)
      next.applySaved(project.changes)
      projector.value = markRaw(new Projector(project.document.bounds))
      doc.value = markRaw(next)
      projectId.value = project.id
      projectName.value = project.name
      selection.value = []
      drawPoints.value = []
      tool.value = 'select'
      saveState.value = 'saved'
      selectedLineId.value = null
      junctionNode.value = null
      filterRules.value = readFilterRules(project.id)
      const [storedMode, storedLogic] = (readStored(FILTER_KEY + project.id + ':mode') ?? '').split('|')
      filterMode.value = storedMode === 'only' ? 'only' : 'hide'
      filterLogic.value = storedLogic === 'all' ? 'all' : 'any'
      rev.value++
      runValidation()
    } catch (error) {
      loadError.value = error instanceof Error ? error.message : String(error)
    } finally {
      loading.value = false
    }
  }

  function readFilterRules(id: string): FilterRule[] {
    try {
      const parsed = JSON.parse(readStored(FILTER_KEY + id) ?? '[]')
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }

  function selectLine(id: number | null): void {
    selectedLineId.value = id
  }

  function focusLine(id: number): void {
    selectedLineId.value = id
    const line = lines.value.find((item) => item.id === id)
    const way = line ? doc.value?.ways.get(line.wayIds[Math.floor(line.wayIds.length / 2)] ?? -1) : undefined
    const node = way && doc.value?.nodes.get(way.nds[0]!)
    if (node) focusOn(node, 15.5)
  }

  function createTransitLine(fields: { ref: string; mode: TransitMode; name?: string; interval?: number }): void {
    const id = mutate('Новый маршрут', (d) => createLine(d, fields))
    if (id !== undefined) {
      selectedLineId.value = id
      tool.value = 'lineWay'
      toast('Маршрут создан. Щёлкайте по дорогам по порядку следования', 'success')
    }
  }

  function updateLineTags(id: number, tags: Tags, label = 'Атрибуты маршрута'): void {
    mutate(label, (d) => setLineTags(d, id, tags))
  }

  function deleteTransitLine(id: number): void {
    mutate('Удаление маршрута', (d) => deleteLine(d, id))
    if (selectedLineId.value === id) selectedLineId.value = null
    if (tool.value === 'lineWay' || tool.value === 'lineStop') tool.value = 'select'
  }

  function appendWayToLine(wayId: number): void {
    const id = selectedLineId.value
    if (id === null) {
      toast('Сначала выберите маршрут')
      return
    }
    const result = mutate('Дорога маршрута', (d) => addLineWay(d, id, wayId))
    if (result && !result.connected) toast('Эта дорога не примыкает к концу маршрута: в нём появится разрыв', 'error')
  }

  function removeWayFromLine(id: number, wayId: number): void {
    mutate('Дорога маршрута', (d) => removeLineWay(d, id, wayId))
  }

  function addNodeToLineAsStop(nodeId: number): void {
    const id = selectedLineId.value
    if (id === null) {
      toast('Сначала выберите маршрут')
      return
    }
    mutate('Остановка маршрута', (d, p) => addLineStop(d, p, id, nodeId))
  }

  function addStopOnWay(wayId: number, position: LatLon): void {
    const id = selectedLineId.value
    if (id === null) {
      toast('Сначала выберите маршрут')
      return
    }
    const relation = doc.value?.relations.get(id)
    const count = relation && projector.value ? readLine(doc.value!, relation, projector.value).stops.length : 0
    mutate('Новая остановка', (d, p) => {
      const nodeId = createStopOnWay(d, p, wayId, position, `Остановка ${count + 1}`)
      addLineStop(d, p, id, nodeId)
    })
    toast('Остановка добавлена', 'success')
  }

  function removeStopFromLine(id: number, nodeId: number): void {
    mutate('Остановка маршрута', (d) => removeLineStop(d, id, nodeId))
  }

  function setImageUnderlay(url: string): void {
    const view = camera.value
    const bounds = doc.value?.bounds
    const lat = view?.center[1] ?? ((bounds?.minlat ?? 0) + (bounds?.maxlat ?? 0)) / 2
    const lon = view?.center[0] ?? ((bounds?.minlon ?? 0) + (bounds?.maxlon ?? 0)) / 2
    // Снимок сначала кладём в центр текущего вида: дальше его подгоняют за углы
    const halfHeight = (360 / 2 ** (view?.zoom ?? 15)) * 0.5 * Math.cos((lat * Math.PI) / 180)
    const halfWidth = 360 / 2 ** (view?.zoom ?? 15) * 0.6
    imageUnderlay.value = {
      url,
      corners: [
        [lon - halfWidth, lat + halfHeight],
        [lon + halfWidth, lat + halfHeight],
        [lon + halfWidth, lat - halfHeight],
        [lon - halfWidth, lat - halfHeight],
      ],
    }
  }

  function moveImageCorner(index: number, lngLat: [number, number]): void {
    const current = imageUnderlay.value
    if (!current) return
    const corners = [...current.corners] as ImageUnderlay['corners']
    corners[index] = lngLat
    imageUnderlay.value = { ...current, corners }
  }

  function clearImageUnderlay(): void {
    imageUnderlay.value = null
  }

  function requestCamera(state: CameraState): void {
    cameraRequest.value = state
  }

  function touch(): void {
    rev.value++
    if (saveState.value !== 'saving') saveState.value = 'dirty'
    scheduleSave()
    scheduleValidation()
  }

  let saveTimer: ReturnType<typeof setTimeout> | null = null
  let savingNow = false
  let saveAgain = false

  function scheduleSave(): void {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => void flushSave(), AUTOSAVE_DELAY_MS)
  }

  async function flushSave(): Promise<void> {
    // Перетаскивание ещё идёт: сохраним после его завершения
    if (!doc.value || !projectId.value || doc.value.inTransaction) return
    if (savingNow) {
      saveAgain = true
      return
    }
    savingNow = true
    saveState.value = 'saving'
    try {
      await saveChanges(projectId.value, doc.value.changes())
      saveState.value = 'saved'
    } catch {
      saveState.value = 'error'
      toast('Не удалось сохранить правки на сервере', 'error')
    } finally {
      savingNow = false
      if (saveAgain) {
        saveAgain = false
        scheduleSave()
      }
    }
  }

  let validateTimer: ReturnType<typeof setTimeout> | null = null
  function scheduleValidation(): void {
    if (validateTimer) clearTimeout(validateTimer)
    validateTimer = setTimeout(runValidation, VALIDATE_DELAY_MS)
  }

  function runValidation(): void {
    if (!doc.value || !projector.value || doc.value.inTransaction) return
    issues.value = validate(doc.value, projector.value)
  }

  /** Выполняет правку одним шагом отмены. Ошибка откатывает всё и показывается пользователю. */
  /** Редактор узла. На светофоре сразу открываются фазы: за ними туда и идут. */
  function openJunction(id: number, tab?: 'lanes' | 'signal'): void {
    junctionTab.value = tab ?? (doc.value?.nodes.get(id)?.tags?.highway === 'traffic_signals' ? 'signal' : 'lanes')
    junctionNode.value = id
  }

  function mutate<T>(label: string, action: (d: OsmDoc, p: Projector) => T): T | undefined {
    const d = doc.value
    const p = projector.value
    if (!d || !p) return undefined
    try {
      const result = d.transact(label, () => action(d, p))
      pruneSelection()
      touch()
      return result
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error), 'error')
      return undefined
    }
  }

  function pruneSelection(): void {
    const d = doc.value
    if (!d) return
    const kept = selection.value.filter((item) =>
      item.kind === 'way' ? d.ways.has(item.id) : d.nodes.has(item.id),
    )
    if (kept.length !== selection.value.length) selection.value = kept
  }

  function undo(): void {
    const d = doc.value
    if (!d) return
    const label = d.undoLabel
    if (d.undo()) {
      pruneSelection()
      touch()
      toast(`Отменено: ${label}`)
    }
  }

  function redo(): void {
    const d = doc.value
    if (!d) return
    const label = d.redoLabel
    if (d.redo()) {
      pruneSelection()
      touch()
      toast(`Повторено: ${label}`)
    }
  }

  function select(items: SelectedItem[]): void {
    selection.value = items
  }

  function selectOne(item: SelectedItem | null): void {
    selection.value = item ? [item] : []
  }

  function toggleSelect(item: SelectedItem): void {
    const exists = selection.value.some((s) => s.kind === item.kind && s.id === item.id)
    selection.value = exists
      ? selection.value.filter((s) => !(s.kind === item.kind && s.id === item.id))
      : [...selection.value, item]
  }

  function setTool(next: Tool): void {
    if (tool.value === 'road' && next !== 'road') drawPoints.value = []
    speedStart.value = null
    connectorFrom.value = null
    tool.value = next
    const object = OBJECT_OF_TOOL.get(next)
    if (object) {
      mode.value = 'insert'
      if (activeObject.value !== object) chooseObject(object)
    } else if (next === 'object' || next === 'lineStop') {
      mode.value = 'insert'
    } else if (next !== 'select' || mode.value === 'insert') {
      mode.value = 'edit'
    }
  }

  function chooseObject(next: NetObject): void {
    activeObject.value = next
    activeType.value = pickTypeOf(next)
    selection.value = []
  }

  function applyInsertTool(): void {
    if (activeObject.value === 'routes' && selectedLineId.value === null) toast('Выберите маршрут в списке или создайте новый')
    setTool(INSERT_TOOLS[activeObject.value])
  }

  function setActiveObject(next: NetObject): void {
    chooseObject(next)
    if (mode.value === 'insert') applyInsertTool()
  }

  function setMode(next: EditMode): void {
    if (next === 'insert') {
      applyInsertTool()
      return
    }
    setTool('select')
    mode.value = next
  }

  function toggleInsert(): void {
    setMode(mode.value === 'insert' ? 'edit' : 'insert')
  }

  /** Можно ли выбрать этот объект: объекты другого типа в режиме редактирования не реагируют. */
  function acceptsNode(id: number): boolean {
    const d = doc.value
    const node = d?.nodes.get(id)
    if (!d || !node || objectLocked[activeObject.value]) return false
    if (activeObject.value === 'stops') return matchesNode('stopPoints', node, d) || matchesNode('stopAreas', node, d)
    return matchesNode(activeObject.value, node, d)
  }

  function acceptsWay(id: number): boolean {
    const way = doc.value?.ways.get(id)
    if (!way || objectLocked[activeObject.value]) return false
    return matchesWay(activeObject.value, way)
  }

  function placeNetObject(wayId: number, position: LatLon): void {
    const type = activeObject.value
    if (!isCustomObject(type)) return
    const id = mutate('Новый объект сети', (d) => addNode(d, position, customObjectTags(type, wayId)))
    if (id !== undefined) selectOne({ kind: 'node', id })
  }

  function addStopPoint(wayId: number, position: LatLon): void {
    const id = mutate('Новый пункт остановки', (d, p) => {
      const node = insertNodeOnWay(d, p, wayId, position)
      setNodeTags(d, node, { ...(d.node(node).tags ?? {}), public_transport: 'stop_position', bus: 'yes' })
      return node
    })
    if (id !== undefined) selectOne({ kind: 'node', id })
  }

  function addStopArea(position: LatLon): void {
    const id = mutate('Новая зона остановки', (d) => addNode(d, position, { public_transport: 'platform', bus: 'yes' }))
    if (id !== undefined) selectOne({ kind: 'node', id })
  }

  /** Остановка объединяет выбранный пункт или зону и всё, что стоит рядом. */
  function addStopFromNode(nodeId: number): void {
    const d = doc.value
    const p = projector.value
    const base = d?.nodes.get(nodeId)
    if (!d || !p || !base) return
    const origin = p.toXY(base)
    const members: number[] = []
    for (const node of d.nodes.values()) {
      if (!matchesNode('stopPoints', node, d) && !matchesNode('stopAreas', node, d)) continue
      const point = p.toXY(node)
      if (Math.hypot(point.x - origin.x, point.y - origin.y) <= STOP_GROUP_RADIUS_M) members.push(node.id)
    }
    mutate('Новая остановка', (target) => {
      target.putRelation({
        id: target.newId(),
        members: members.map((id) => ['node', id, target.node(id).tags?.public_transport === 'platform' ? 'platform' : 'stop']),
        tags: { type: 'public_transport', public_transport: 'stop_area', name: base.tags?.name ?? `Остановка ${nodeId}` },
      })
    })
    toast(`Остановка создана, объектов в ней: ${members.length}`, 'success')
  }

  function focusOn(position: LatLon, zoomLevel?: number): void {
    focusRequest.value = { position, zoom: zoomLevel }
  }

  function focusWay(wayId: number): void {
    const way = doc.value?.ways.get(wayId)
    const node = way && doc.value?.nodes.get(way.nds[Math.floor(way.nds.length / 2)]!)
    selectOne({ kind: 'way', id: wayId })
    if (node) focusOn(node, 18)
  }

  function focusNode(nodeId: number): void {
    const node = doc.value?.nodes.get(nodeId)
    selectOne({ kind: 'node', id: nodeId })
    if (node) focusOn(node, 18.5)
  }

  function focusIssue(issue: Issue): void {
    focusedIssue.value = issue.id
    selection.value = [
      ...issue.nodeIds.map((id) => ({ kind: 'node' as const, id })),
      ...issue.wayIds.slice(0, 8).map((id) => ({ kind: 'way' as const, id })),
    ]
    focusOn(issue.position, 18.5)
  }

  function applyFix(issue: Issue): void {
    if (!issue.fix) return
    const fix = issue.fix
    mutate(issue.fixLabel ?? 'Исправление', () => fix())
    runValidation()
    toast(`Исправлено: ${issue.fixLabel ?? ''}`, 'success')
  }

  function updateWayTags(id: number, tags: Tags, label = 'Изменение атрибутов'): void {
    mutate(label, (d) => setWayTags(d, id, tags))
  }

  function updateNodeTags(id: number, tags: Tags, label = 'Изменение атрибутов узла'): void {
    mutate(label, (d) => setNodeTags(d, id, tags))
  }

  function deleteSelection(): void {
    if (selection.value.length === 0) return
    const items = selection.value
    mutate(items.length > 1 ? `Удаление объектов: ${items.length}` : 'Удаление', (d) => {
      for (const item of items) {
        if (item.kind === 'way') deleteWay(d, item.id)
        else if (d.nodes.has(item.id)) deleteNode(d, item.id)
      }
    })
    selection.value = []
  }

  function reverseSelected(): void {
    const ways = selectedWays.value
    if (ways.length === 0) {
      toast('Выберите дорогу, чтобы развернуть направление')
      return
    }
    mutate('Разворот направления', (d) => ways.forEach((way) => reverseWay(d, way.id)))
  }

  function mergeSelected(): void {
    const nodes = selectedNodes.value
    if (nodes.length < 2) {
      toast('Выберите два узла с Shift, чтобы склеить их')
      return
    }
    const keep = nodes[0]!
    mutate('Склейка узлов', (d) => {
      for (const node of nodes.slice(1)) mergeNodes(d, keep.id, node.id)
    })
    selectOne({ kind: 'node', id: keep.id })
    toast('Узлы склеены', 'success')
  }

  function unglueSelected(): void {
    const node = selectedNodes.value[0]
    if (!node) {
      toast('Выберите узел перекрёстка')
      return
    }
    const created = mutate('Расклейка узла', (d, p) => unglueNode(d, p, node.id))
    if (created && created.length > 0) toast(`Перекрёсток расклеен: ${created.length + 1} дороги`, 'success')
    else if (created) toast('Этот узел принадлежит одной дороге')
  }

  function joinSelected(): void {
    const ways = selectedWays.value
    if (ways.length !== 2) {
      toast('Выберите две дороги с общим концом')
      return
    }
    const [a, b] = ways as [(typeof ways)[0], (typeof ways)[0]]
    const joined = mutate('Объединение дорог', (d) => joinWays(d, a.id, b.id))
    if (joined === false) toast('У этих дорог нет общего конца', 'error')
    else if (joined) selectOne({ kind: 'way', id: a.id })
  }

  function splitAtNode(nodeId: number, wayId?: number): void {
    const d = doc.value
    if (!d) return
    const targets = wayId !== undefined ? [wayId] : d.waysOfNode(nodeId)
    let done = 0
    mutate('Разрезание дороги', (doc_) => {
      for (const id of targets) if (splitWay(doc_, id, nodeId) !== null) done++
    })
    toast(done > 0 ? 'Дорога разрезана' : 'Конец дороги резать не нужно', done > 0 ? 'success' : 'info')
  }

  function splitAtPosition(wayId: number, position: LatLon): void {
    let ok = false
    mutate('Разрезание дороги', (d, p) => {
      const nodeId = insertNodeOnWay(d, p, wayId, position)
      ok = splitWay(d, wayId, nodeId) !== null
    })
    if (ok) toast('Дорога разрезана', 'success')
  }

  function addFreeNode(position: LatLon): void {
    const id = mutate('Новый узел', (d) => addNode(d, position))
    if (id !== undefined) selectOne({ kind: 'node', id })
  }

  function addNodeOnWay(wayId: number, position: LatLon): void {
    const id = mutate('Новый узел на дороге', (d, p) => insertNodeOnWay(d, p, wayId, position))
    if (id !== undefined) selectOne({ kind: 'node', id })
  }

  /** Узел для светофора или перехода: существующий либо новый на дороге. */
  function toggleOnNode(kind: 'signal' | 'crossing', target: { nodeId?: number; wayId?: number; position: LatLon }): void {
    const value = kind === 'signal' ? 'traffic_signals' : 'crossing'
    const title = kind === 'signal' ? 'Светофор' : 'Переход'
    let enabled = false
    const nodeId = mutate(title, (d, p) => {
      let id = target.nodeId
      if (id === undefined && target.wayId !== undefined) {
        id = insertNodeOnWay(d, p, target.wayId, target.position)
      }
      if (id === undefined) return undefined
      enabled = toggleNodeHighway(d, id, value)
      return id
    })
    if (nodeId !== undefined) {
      selectOne({ kind: 'node', id: nodeId })
      toast(`${title}: ${enabled ? 'добавлен' : 'снят'}`, 'success')
    }
  }

  function toggleWayStructure(wayId: number, kind: 'bridge' | 'tunnel'): void {
    let enabled = false
    mutate(kind === 'bridge' ? 'Мост' : 'Тоннель', (d) => {
      enabled = toggleStructure(d, wayId, kind)
    })
    selectOne({ kind: 'way', id: wayId })
    const title = kind === 'bridge' ? 'Мост' : 'Тоннель'
    toast(`${title}: ${enabled ? 'отмечен, чтобы часть дороги, сначала разрежьте её' : 'снят'}`, 'success')
  }

  /**
   * Соединение полос на карте: первый щелчок выбирает полосу, по которой подъезжают к узлу,
   * второй — полосу, на которую из него выезжают. Повторный щелчок снимает соединение.
   */
  function pickConnectorLane(point: XY): void {
    const net = network.value
    const d = doc.value
    const p = projector.value
    if (!net || !d || !p) return
    const hit = laneAtPoint(net, point)
    if (!hit) {
      toast('Щёлкните по полосе дороги')
      return
    }
    const from = connectorFrom.value
    const target = from ? departureArm(net, hit, from.node) : null
    if (from && target) {
      toggleConnection(target.neighbor, hit.lane)
      return
    }
    const arrival = arrivalArm(net, hit)
    if (!arrival || (net.arms.get(arrival.node)?.length ?? 0) < 2) {
      toast(from ? 'Эта полоса не выходит из выбранного узла' : 'Выберите полосу, которая подходит к перекрёстку')
      return
    }
    connectorFrom.value = { node: arrival.node, neighbor: arrival.neighbor, lane: hit.lane, points: lanePolyline(hit) }
  }

  function toggleConnection(toNeighbor: number, toLane: number): void {
    const from = connectorFrom.value
    const d = doc.value
    const p = projector.value
    if (!from || !d || !p) return
    if (toNeighbor === from.neighbor) {
      toast('Разворот на ту же дорогу здесь не настраивается')
      return
    }
    const exists = nodeConnectors(d, p, from.node).connectors.some(
      (c) => c.from.neighbor === from.neighbor && c.fromLane === from.lane && c.to.neighbor === toNeighbor && c.toLane === toLane,
    )
    const done = mutate(exists ? 'Снятие соединения полос' : 'Соединение полос', (doc_, proj) => {
      setLaneConnection(doc_, proj, from.node, from.neighbor, from.lane, toNeighbor, toLane, !exists)
      return true
    })
    if (done) toast(exists ? 'Соединение снято' : 'Полосы соединены', 'success')
  }

  /** Концы полос у перекрёстков: считаются, только пока включён инструмент соединения. */
  const connectorPorts = computed<LanePort[]>(() => {
    void rev.value
    return tool.value === 'connector' && network.value ? markRaw(lanePorts(network.value)) : []
  })

  function startConnectorAtPort(port: LanePort): void {
    if (port.incoming) connectorFrom.value = { node: port.node, neighbor: port.neighbor, lane: port.lane, points: port.points, port: port.point }
  }

  function finishConnectorAtPort(port: LanePort): void {
    const from = connectorFrom.value
    if (!from) toast('Сначала выберите красную точку: конец полосы, по которой подъезжают')
    else if (port.incoming) startConnectorAtPort(port)
    else if (port.node !== from.node) toast('Соединять можно только полосы одного перекрёстка')
    else toggleConnection(port.neighbor, port.lane)
  }

  /** Что подсветить на карте, пока выбрана исходная полоса. */
  const connectorPreview = computed(() => {
    void rev.value
    const from = connectorFrom.value
    const d = doc.value
    const p = projector.value
    if (!from || !d || !p) return null
    const { arms, connectors } = nodeConnectors(d, p, from.node)
    const targets: XY[][] = []
    for (const arm of arms) {
      if (arm.neighbor === from.neighbor) continue
      const offsets = laneOffsets(arm.link.profile)
      const list = arm.atStart ? offsets.forward : offsets.backward
      for (const offset of list) targets.push(laneStubNearNode(offsetPolyline(arm.link.points, offset), arm.atStart, CONNECTOR_STUB_M))
    }
    return {
      source: from.points,
      targets,
      connected: connectors.filter((c) => c.from.neighbor === from.neighbor && c.fromLane === from.lane).map((c) => c.points),
    }
  })

  /** Первый клик задаёт начало участка, второй на той же дороге — его конец. */
  function pickSpeedPoint(wayId: number, position: LatLon): void {
    const start = speedStart.value
    if (!start) {
      speedStart.value = { wayId, position }
      return
    }
    if (start.wayId !== wayId) {
      toast('Конец участка должен быть на той же дороге', 'error')
      return
    }
    speedStart.value = null
    const speed = trafficOptions.sectionSpeed
    const id = mutate('Участок скорости', (d, p) => applySpeedSection(d, p, wayId, start.position, position, speed))
    if (id !== undefined) {
      selectOne({ kind: 'way', id })
      toast(`Участок скорости: ${speed} км/ч`, 'success')
    }
  }

  function placeBump(target: { nodeId?: number; wayId?: number; position: LatLon }): void {
    const d = doc.value
    if (!d) return
    if (target.nodeId !== undefined && d.nodes.get(target.nodeId)?.tags?.traffic_calming) {
      const nodeId = target.nodeId
      mutate('Снятие лежачего полицейского', (doc_, p) => removeSpeedBump(doc_, p, nodeId))
      selection.value = []
      toast('Лежачий полицейский снят', 'success')
      return
    }
    const wayId = target.wayId ?? (target.nodeId !== undefined ? d.waysOfNode(target.nodeId)[0] : undefined)
    if (wayId === undefined) return
    const options = { kind: trafficOptions.bumpKind, speed: trafficOptions.bumpSpeed }
    const placed = mutate('Лежачий полицейский', (doc_, p) => addSpeedBump(doc_, p, wayId, target.position, options))
    if (placed) {
      selectOne({ kind: 'node', id: placed.nodeId })
      toast(`Лежачий полицейский: проезд ${options.speed} км/ч`, 'success')
    }
  }

  function placeSign(target: { nodeId?: number; wayId?: number; position: LatLon }): void {
    const kind = trafficOptions.signKind
    const placed = mutate('Знак приоритета', (d, p) => toggleSign(d, p, target, kind))
    if (placed) {
      selectOne({ kind: 'node', id: placed.nodeId })
      const title = kind === 'stop' ? 'Знак «Стоп»' : 'Знак «Уступи дорогу»'
      toast(`${title}: ${placed.enabled ? 'поставлен' : 'снят'}`, 'success')
    }
  }

  function smoothSelected(): void {
    const ways = selectedWays.value
    if (ways.length === 0) {
      toast('Выберите дорогу, чтобы сгладить её')
      return
    }
    const added = mutate('Сглаживание дороги', (d, p) => ways.reduce((sum, way) => sum + smoothWay(d, p, way.id), 0))
    if (added) toast(`Дорога сглажена, новых точек: ${added}`, 'success')
    else if (added === 0) toast('Сглаживать нечего: нужны хотя бы три точки и достаточная длина')
  }

  /** Копия выбранной дороги рядом: side 1 — слева по ходу узлов, -1 — справа. */
  function parallelSelected(gap: number, side: 1 | -1, label = 'Параллельная дорога'): void {
    const way = selectedWays.value[0]
    if (!way) {
      toast('Выберите дорогу')
      return
    }
    if (!Number.isFinite(gap) || gap <= 0) {
      toast('Расстояние должно быть больше нуля', 'error')
      return
    }
    const id = mutate(label, (d, p) => createParallelWay(d, p, way.id, gap * side))
    if (id !== undefined) selectOne({ kind: 'way', id })
  }

  function duplicateSelected(): void {
    const way = selectedWays.value[0]
    if (!way) {
      toast('Выберите дорогу, чтобы продублировать её')
      return
    }
    parallelSelected(totalWidth(parseProfile(way.tags ?? {})) + 2, 1, 'Дублирование дороги')
  }

  function finishRoad(): void {
    const points = drawPoints.value
    drawPoints.value = []
    if (points.length < 2) return
    const tags = { ...preset.value.tags }
    const wayId = mutate('Новая дорога', (d, p) => {
      const resolve = (point: DrawPoint): number => {
        if (point.nodeId !== undefined) return point.nodeId
        if (point.wayId !== undefined) return insertNodeOnWay(d, p, point.wayId, point)
        return addNode(d, point)
      }
      let nds: number[]
      if (drawMode.value === 'curve' && points.length >= 3) {
        const smooth = smoothCurve(points.map((point) => p.toXY(point)))
        const first = resolve(points[0]!)
        const last = resolve(points.at(-1)!)
        const inner = smooth.slice(1, -1).map((xy) => addNode(d, p.toLatLon(xy)))
        nds = [first, ...inner, last]
      } else {
        nds = points.map(resolve)
      }
      return addWay(d, nds, tags)
    })
    if (wayId !== undefined) {
      // Сразу показываем свойства новой дороги: следующую начнут клавишей D
      tool.value = 'select'
      selectOne({ kind: 'way', id: wayId })
      toast('Дорога создана', 'success')
    }
  }

  return {
    doc,
    projector,
    rev,
    projectId,
    projectName,
    saveState,
    loading,
    loadError,
    tool,
    viewMode,
    selection,
    presetId,
    preset,
    drawMode,
    drawPoints,
    theme,
    activeType,
    leftTab,
    listOpen,
    mode,
    activeObject,
    objectHidden,
    objectLocked,
    consoleOpen,
    consoleLog,
    logConsole,
    setMode,
    setActiveObject,
    toggleInsert,
    acceptsNode,
    acceptsWay,
    placeNetObject,
    addStopPoint,
    addStopArea,
    addStopFromNode,
    listTab,
    junctionNode,
    junctionTab,
    openJunction,
    selectedLineId,
    selectedLine,
    lines,
    cursor,
    filterRules,
    rightTab,
    proposalTargets,
    hidden,
    selectLine,
    focusLine,
    createTransitLine,
    updateLineTags,
    deleteTransitLine,
    appendWayToLine,
    removeWayFromLine,
    addNodeToLineAsStop,
    addStopOnWay,
    removeStopFromLine,
    basemap,
    basemapOpacity,
    modelOpacity,
    compareOpen,
    customTileUrl,
    imageUnderlay,
    camera,
    cameraRequest,
    setImageUnderlay,
    moveImageCorner,
    clearImageUnderlay,
    requestCamera,
    layers,
    issues,
    focusedIssue,
    focusRequest,
    toasts,
    helpOpen,
    exportOpen,
    zoom,
    fitRev,
    navigatorOpen,
    inspectorOpen,
    network,
    selectedWays,
    selectedNodes,
    canUndo,
    canRedo,
    changeCount,
    errorCount,
    toast,
    open,
    touch,
    mutate,
    undo,
    redo,
    select,
    selectOne,
    toggleSelect,
    setTool,
    focusOn,
    focusWay,
    focusNode,
    focusIssue,
    applyFix,
    runValidation,
    updateWayTags,
    updateNodeTags,
    deleteSelection,
    reverseSelected,
    mergeSelected,
    unglueSelected,
    joinSelected,
    splitAtNode,
    splitAtPosition,
    addFreeNode,
    addNodeOnWay,
    toggleOnNode,
    toggleWayStructure,
    finishRoad,
    speedStart,
    connectorFrom,
    connectorPreview,
    pickConnectorLane,
    connectorPorts,
    startConnectorAtPort,
    finishConnectorAtPort,
    mapBalance,
    crs,
    filterMode,
    filterLogic,
    trafficOptions,
    pickSpeedPoint,
    placeBump,
    placeSign,
    smoothSelected,
    parallelSelected,
    duplicateSelected,
  }
})
