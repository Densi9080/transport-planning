import { acceptHMRUpdate, defineStore } from 'pinia'
import { computed, markRaw, reactive, ref, shallowRef, watch } from 'vue'

import { loadProject, saveChanges } from '@/api'
import { OsmDoc } from '@/core/doc'
import { computeHidden, type FilterLogic, type FilterMode, type FilterRule, NOTHING_HIDDEN } from '@/core/filter'
import { nearestOnSegment, offsetPolyline, Projector, segmentsCross, smoothCurve } from '@/core/geo'
import {
  addNode,
  addWay,
  deleteNode,
  deleteWay,
  insertNodeOnWay,
  setMovementAllowed,
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
import { type CrsId, normalizeCrs, setCustomCrs } from '@/core/crs'
import type { CrsEntry } from '@/core/crsCatalog'
import { arrivalArm, departureArm, laneAtPoint, lanePolyline, type LanePort, lanePorts, laneStubNearNode } from '@/core/lanePick'
import { nodeConnectors, resetLaneConnections, setLaneConnection, setMovementLanes } from '@/core/laneOps'
import { type TurnAttrs, writeTurnAttrs } from '@/core/turnAttrs'
import { laneOffsets, parseProfile, totalWidth, withLanes, withLaneShift } from '@/core/lanes'
import { buildNetwork, junctionMovements } from '@/core/topology'
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
import { customObjectTags, isCustomObject, matchesNode, matchesWay, type NetObject, type ObjectFilter, passesFilter, pickTypeOf } from '@/core/netObjects'
import { applyJunctionPriority, type PrioritySign } from '@/core/priority'
import { readTurnShapes, writeTurnShape } from '@/core/scene'
import { applyPrioritySigns, type PrioritySuggestion } from '@/core/prioritySuggest'
import {
  AREA_REACH_M,
  areaKey,
  buildStopHierarchy,
  createStopForArea,
  moveAreaToStop,
  nearAreas,
  nearStops,
  parseAreaKey,
  sideOfRoad,
  type StopHierarchy,
  withStopArea,
} from '@/core/stops'

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
  | 'pan'
  | 'delete'

/** Какие объекты сети выбираются щелчком: как активный тип объектов в Visum. */
export type ActiveType = 'auto' | 'links' | 'nodes'
/** Режимы окна сети: вставка, редактирование и выделение рамкой. */
export type EditMode = 'insert' | 'edit' | 'select'
export type SelectShape = 'box' | 'polygon' | 'circle'

export interface NewLinkAttrs {
  id: number
  type: string
  name: string
  forward: number
  backward: number
  maxspeed: string | number
  blockReverse: boolean
}

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
  crossings: 'crossing',
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
const THEME_KEY = 'osm-editor-theme-v2'
const FILTER_KEY = 'osm-editor-filter:'
const CRS_KEY = 'osm-editor-crs'
const CRS_RECENT_KEY = 'osm-editor-crs-recent'
const CRS_CUSTOM_KEY = 'osm-editor-crs-custom'
const CRS_RECENT_LIMIT = 8
const CONNECTOR_STUB_M = 25
/** Новая зона входит в остановку, до центра которой не дальше этого. */
const STOP_JOIN_RADIUS_M = 150
/** Новая зона ставится сбоку от дороги, справа по ходу её направления. */
const AREA_SIDE_OFFSET_M = 6
const TURN_MARK_M = 18

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const value = readStored(key)
    return value ? (JSON.parse(value) as T) : fallback
  } catch {
    return fallback
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
  const selectShape = ref<SelectShape>('box')
  const selectPolygon = shallowRef<XY[]>([])
  const deleteRequest = shallowRef<{ items: SelectedItem[]; label: string } | null>(null)
  const pendingRoad = shallowRef<{ points: DrawPoint[] } | null>(null)
  const crossingStart = shallowRef<LatLon | null>(null)
  /** Выбранный манёвр. fromLane — индекс полосы въезда слева направо, если выбрана одна полоса. */
  const selectedTurn = shallowRef<{ node: number; from: number; to: number; fromLane: number | null } | null>(null)
  const objectFilter = reactive<Partial<Record<NetObject, ObjectFilter>>>({})
  /** Куда пользователь хотел перейти, пока не решил судьбу несохранённых правок. */
  const leaveRequest = ref<EditMode | 'sim' | null>(null)
  const selectedLane = shallowRef<{ wayId: number; forward: boolean; lane: number; count: number; points: XY[] } | null>(null)
  const consoleLog = shallowRef<ConsoleEntry[]>([])
  const viewMode = ref<ViewMode>('engineering')
  const selection = shallowRef<SelectedItem[]>([])
  const presetId = ref(DEFAULT_PRESET_ID)
  const drawMode = ref<DrawMode>('polyline')
  const drawPoints = shallowRef<DrawPoint[]>([])
  const speedStart = shallowRef<{ wayId: number; position: LatLon } | null>(null)
  const connectorFrom = shallowRef<{ node: number; neighbor: number; lane: number; points: XY[]; port?: XY } | null>(null)
  const mapBalance = ref(0.5)
  const crs = ref<CrsId>(normalizeCrs(readStored(CRS_KEY) ?? 'wgs84'))
  const crsDialogOpen = ref(false)
  const recentCrs = ref<string[]>(readJson<string[]>(CRS_RECENT_KEY, []))
  const customCrs = ref<CrsEntry[]>(readJson<CrsEntry[]>(CRS_CUSTOM_KEY, []))
  setCustomCrs(customCrs.value)

  function setCrs(id: string): void {
    crs.value = id
    recentCrs.value = [id, ...recentCrs.value.filter((item) => item !== id)].slice(0, CRS_RECENT_LIMIT)
    writeStored(CRS_RECENT_KEY, JSON.stringify(recentCrs.value))
  }

  function storeCustomCrs(): void {
    setCustomCrs(customCrs.value)
    writeStored(CRS_CUSTOM_KEY, JSON.stringify(customCrs.value))
  }

  function addCustomCrs(name: string, def: string): string {
    const id = `USER:${100000 + customCrs.value.length + 1}`
    customCrs.value = [...customCrs.value, { id, name, group: 'Свои', def, custom: true }]
    storeCustomCrs()
    return id
  }

  function removeCustomCrs(id: string): void {
    customCrs.value = customCrs.value.filter((entry) => entry.id !== id)
    storeCustomCrs()
  }
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
    markings: false,
    other: true,
    points: true,
  })

  const theme = ref<ThemeName>(readStored(THEME_KEY) === 'light' ? 'light' : 'dark')
  const activeType = ref<ActiveType>('links')
  const leftTab = ref<LeftTab>('network')
  const listOpen = ref(false)
  const listTab = ref<ListTab>('links')
  /** Узел, открытый в редакторе узла. */
  const junctionNode = ref<number | null>(null)
  const junctionTab = ref<'lanes' | 'signal'>('lanes')
  const selectedLineId = ref<number | null>(null)
  /** Эпюра наполнения выбранного маршрута на карте. */
  const transitLoadShown = ref(true)
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

  /** Остановка → зоны → пункты, как в Visum. */
  const stopHierarchy = computed<StopHierarchy | null>(() => {
    void rev.value
    return doc.value && projector.value ? markRaw(buildStopHierarchy(doc.value, projector.value)) : null
  })
  const selectedStopId = ref<number | null>(null)
  const selectedStop = computed(() => (selectedStopId.value === null ? null : (stopHierarchy.value?.stops.get(selectedStopId.value) ?? null)))

  function selectStop(id: number | null): void {
    selectedStopId.value = id
    if (id !== null) selection.value = []
  }

  function focusStop(id: number): void {
    selectStop(id)
    const position = stopHierarchy.value?.stops.get(id)?.position
    if (position) focusOn(position, 18.5)
  }

  function setPointArea(pointId: number, key: string | null): void {
    mutate('Пункт в зоне остановки', (d) => setNodeTags(d, pointId, withStopArea(d.node(pointId).tags, key)))
  }

  function setAreaStop(key: string, stopId: number | null): void {
    const area = parseAreaKey(key)
    if (!area) return
    mutate('Зона в остановке', (d) => moveAreaToStop(d, area.kind, area.id, stopId))
  }

  function createStopFromArea(key: string, name: string): void {
    const hierarchy = stopHierarchy.value
    if (!hierarchy) return
    const id = mutate('Новая остановка', (d) => createStopForArea(d, hierarchy, key, name))
    if (id !== undefined) selectStop(id)
  }

  function renameStop(id: number, name: string): void {
    mutate('Название остановки', (d) => {
      const relation = d.relations.get(id)
      if (relation) d.putRelation({ ...relation, tags: { ...relation.tags, name } })
    })
  }

  function deleteStop(id: number): void {
    mutate('Удаление остановки', (d) => d.removeRelation(id))
    if (selectedStopId.value === id) selectedStopId.value = null
  }

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
  watch(selection, (items) => {
    // Остановка — отношение, а не узел: выбор любого объекта на карте снимает её выбор
    if (items.length > 0) selectedStopId.value = null
    const turn = selectedTurn.value
    if (turn && !items.some((item) => item.kind === 'node' && item.id === turn.node)) selectedTurn.value = null
    const lane = selectedLane.value
    if (lane && !items.some((item) => item.kind === 'way' && item.id === lane.wayId)) selectedLane.value = null
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
    // Правки живут в браузере, пока их не сохранят кнопкой: случайная правка не попадёт в проект
    if (saveState.value !== 'saving') saveState.value = 'dirty'
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
    crossingStart.value = null
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

  /** Щелчок вблизи выбирает не только отрезок, но и конкретную полосу на нём. */
  function pickLane(wayId: number, point: XY): void {
    const net = network.value
    const hit = net ? laneAtPoint(net, point) : null
    selectedLane.value = hit && hit.link.wayId === wayId ? { wayId, forward: hit.forward, lane: hit.lane, count: hit.count, points: lanePolyline(hit) } : null
  }

  /**
   * Сдвиг выбранной полосы вбок, м: положительный — вправо по ходу движения.
   * Подсветка пересчитывается по новой геометрии на том же участке дороги.
   */
  function setLaneShift(shift: number): void {
    const lane = selectedLane.value
    if (!lane) return
    const way = doc.value?.ways.get(lane.wayId)
    if (!way) return
    const middle = lane.points[Math.floor(lane.points.length / 2)]!
    mutate('Сдвиг полосы', (d) => setWayTags(d, lane.wayId, withLaneShift(way.tags ?? {}, lane.forward ? 'forward' : 'backward', lane.lane, shift)))
    // Ближайший к старой подсветке участок той же дороги: дорога может состоять из нескольких отрезков сети
    const links = (network.value?.links ?? []).filter((link) => link.wayId === lane.wayId)
    let best: { link: (typeof links)[number]; distance: number } | null = null
    for (const link of links) {
      for (let i = 1; i < link.points.length; i++) {
        const distance = nearestOnSegment(middle, link.points[i - 1]!, link.points[i]!).distance
        if (!best || distance < best.distance) best = { link, distance }
      }
    }
    if (!best) return
    const offsets = laneOffsets(best.link.profile)
    const offset = (lane.forward ? offsets.forward : offsets.backward)[lane.lane]
    if (offset !== undefined) selectedLane.value = { ...lane, points: lanePolyline({ link: best.link, offset }) }
  }

  function selectTurn(node: number, from: number, to: number, fromLane: number | null = null): void {
    selection.value = [{ kind: 'node', id: node }]
    selectedTurn.value = { node, from, to, fromLane }
    inspectorOpen.value = true
  }

  /** Манёвры с подхода выбранного поворота, включая разворот. */
  const turnMovements = computed(() => {
    void rev.value
    const turn = selectedTurn.value
    const d = doc.value
    const net = network.value
    if (!turn || !d || !net) return []
    return junctionMovements(d, net, turn.node).filter((item) => item.from.neighbor === turn.from)
  })

  /**
   * Что подсветить на карте: манёвр по полосам, как в Visum. У каждой полосы въезда своя точка начала,
   * у каждой полосы выезда своя точка конца, поэтому три полосы прямо дают шесть точек.
   */
  const turnPreview = computed(() => {
    void rev.value
    const turn = selectedTurn.value
    const d = doc.value
    const p = projector.value
    if (!turn || !d || !p) return null
    const via = d.nodes.get(turn.node)
    const from = d.nodes.get(turn.from)
    const to = d.nodes.get(turn.to)
    if (!via || !from || !to) return null
    const connectors = nodeConnectors(d, p, turn.node).connectors.filter((c) => c.from.neighbor === turn.from && c.to.neighbor === turn.to)
    if (connectors.length === 0) {
      // Манёвр запрещён или полос нет: показываем направление схематично
      const center = p.toXY(via)
      const toward = (target: XY): XY => {
        const dx = target.x - center.x
        const dy = target.y - center.y
        const length = Math.hypot(dx, dy) || 1
        const reach = Math.min(TURN_MARK_M, length)
        return { x: center.x + (dx / length) * reach, y: center.y + (dy / length) * reach }
      }
      const start = toward(p.toXY(from))
      const end = toward(p.toXY(to))
      return { lanes: [{ fromLane: -1, toLane: -1, points: [start, center, end], active: true }], lanesIn: 0, lanesOut: 0 }
    }
    const lanes = connectors.map((c) => ({
      fromLane: c.fromLane,
      toLane: c.toLane,
      points: c.points,
      active: turn.fromLane === null || turn.fromLane === c.fromLane,
    }))
    return { lanes, lanesIn: connectors[0]!.from.lanesIn, lanesOut: connectors[0]!.to.lanesOut }
  })

  function setTurnAllowed(toNeighbor: number, allowed: boolean): void {
    const turn = selectedTurn.value
    if (!turn) return
    mutate(allowed ? 'Поворот разрешён' : 'Поворот запрещён', (d, p) => setMovementLanes(d, p, turn.node, turn.from, toNeighbor, allowed))
  }

  /** Соединения полос выбранного подхода: те же, что в редакторе узла и на карте. */
  const turnConnectors = computed(() => {
    void rev.value
    const turn = selectedTurn.value
    const d = doc.value
    const p = projector.value
    if (!turn || !d || !p) return []
    return nodeConnectors(d, p, turn.node).connectors.filter((c) => c.from.neighbor === turn.from)
  })

  /** Сдвиг середины выбранного манёвра, заданный вручную, м. */
  const turnShape = computed<XY | null>(() => {
    void rev.value
    const turn = selectedTurn.value
    const tags = turn ? doc.value?.nodes.get(turn.node)?.tags : undefined
    const shape = turn ? readTurnShapes(tags).find((item) => item.from === turn.from && item.to === turn.to) : undefined
    return shape ? { x: shape.dx, y: shape.dy } : null
  })

  /** Форма манёвра: середина траектории сдвинута на delta; null возвращает расчётную кривую. */
  function setTurnShape(delta: XY | null): void {
    const turn = selectedTurn.value
    if (!turn) return
    mutate(delta ? 'Форма манёвра' : 'Сброс формы манёвра', (d) =>
      setNodeTags(d, turn.node, writeTurnShape(d.node(turn.node).tags, turn.from, turn.to, delta)),
    )
  }

  function setTurnLane(fromLane: number, toLane: number, enabled: boolean): void {
    const turn = selectedTurn.value
    if (!turn) return
    mutate(enabled ? 'Соединение полос' : 'Снято соединение полос', (d, p) => setLaneConnection(d, p, turn.node, turn.from, fromLane, turn.to, toLane, enabled))
  }

  function applyTurnTemplate(template: 'noLeft' | 'noRight' | 'onlyStraight' | 'noUturn' | 'all'): void {
    const turn = selectedTurn.value
    if (!turn) return
    const plan = turnMovements.value.map((item) => {
      let allowed = item.allowed
      if (template === 'all') allowed = true
      if (template === 'noLeft' && item.kind === 'left') allowed = false
      if (template === 'noRight' && item.kind === 'right') allowed = false
      if (template === 'noUturn' && item.kind === 'reverse') allowed = false
      if (template === 'onlyStraight') allowed = item.kind === 'through'
      return { to: item.to.neighbor, allowed, changed: allowed !== item.allowed }
    })
    mutate('Шаблон запретов поворотов', (d, p) => {
      for (const item of plan) if (item.changed) setMovementLanes(d, p, turn.node, turn.from, item.to, item.allowed)
    })
  }

  function updateTurnAttrs(attrs: TurnAttrs): void {
    const turn = selectedTurn.value
    if (turn) mutate('Атрибуты поворота', (d) => writeTurnAttrs(d, turn.node, turn.from, turn.to, attrs))
  }

  function resetTurnRules(): void {
    const turn = selectedTurn.value
    if (turn) mutate('Соединения полос по ПДД', (d) => resetLaneConnections(d, turn.node))
  }

  /** Переход задаётся началом и концом, а его центр встаёт там, где линия пересекла дорогу. */
  function finishCrossing(end: LatLon): void {
    const start = crossingStart.value
    const net = network.value
    const p = projector.value
    if (!start || !net || !p) return
    const a = p.toXY(start)
    const b = p.toXY(end)
    let found: { wayId: number; point: XY } | null = null
    for (const link of net.links) {
      for (let i = 1; i < link.points.length && !found; i++) {
        const point = segmentsCross(a, b, link.points[i - 1]!, link.points[i]!)
        if (point) found = { wayId: link.wayId, point }
      }
      if (found) break
    }
    if (!found) {
      toast('Линия перехода должна пересекать дорогу', 'error')
      return
    }
    const road = found
    const id = mutate('Пешеходный переход', (d, proj) => {
      const first = addNode(d, start)
      const last = addNode(d, end)
      const center = insertNodeOnWay(d, proj, road.wayId, proj.toLatLon(road.point))
      setNodeTags(d, center, { ...(d.node(center).tags ?? {}), highway: 'crossing', crossing: 'marked' })
      return addWay(d, [first, center, last], { highway: 'footway', footway: 'crossing', crossing: 'marked' })
    })
    crossingStart.value = null
    if (id !== undefined) {
      selectOne({ kind: 'way', id })
      toast('Переход добавлен. Точки начала, центра и конца можно двигать', 'success')
    }
  }

  function requestDelete(items: SelectedItem[], label: string): void {
    if (items.length > 0) deleteRequest.value = { items, label }
  }

  /** Delete тоже спрашивает подтверждение: случайное нажатие не должно стирать объект. */
  function requestDeleteSelection(): void {
    const items = selection.value
    if (items.length === 0) return
    const [first] = items
    if (items.length > 1 || !first) {
      requestDelete(items, `Выбрано объектов: ${items.length}`)
      return
    }
    const tags = first.kind === 'node' ? doc.value?.nodes.get(first.id)?.tags : doc.value?.ways.get(first.id)?.tags
    requestDelete(items, tags?.name ?? `${first.kind === 'node' ? 'Узел' : 'Отрезок'} ${first.id}`)
  }

  function confirmDelete(): void {
    const request = deleteRequest.value
    deleteRequest.value = null
    if (!request) return
    selection.value = request.items
    deleteSelection()
  }

  function cancelDelete(): void {
    deleteRequest.value = null
  }

  /** Выделяет все объекты активного типа, кроме уже выделенных. */
  function invertSelection(): void {
    const d = doc.value
    if (!d) return
    const current = new Set(selection.value.map((item) => `${item.kind}${item.id}`))
    const next: SelectedItem[] = []
    for (const node of d.nodes.values()) if (acceptsNode(node.id) && !current.has(`node${node.id}`)) next.push({ kind: 'node', id: node.id })
    for (const way of d.ways.values()) if (acceptsWay(way.id) && !current.has(`way${way.id}`)) next.push({ kind: 'way', id: way.id })
    selection.value = next
    toast(`Выделено объектов: ${next.length}`)
  }

  function chooseObject(next: NetObject): void {
    if (next === 'routes') layers.transit = true
    selectedTurn.value = null
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

  async function saveNow(): Promise<boolean> {
    await flushSave()
    if (saveState.value === 'saved') toast('Правки сохранены', 'success')
    return saveState.value === 'saved'
  }

  function applyLeave(target: EditMode | 'sim'): void {
    if (target === 'sim') viewMode.value = 'sim'
    else setModeNow(target)
  }

  /** Выход из правки с несохранёнными изменениями требует явного решения. */
  async function resolveLeave(action: 'save' | 'discard' | 'cancel'): Promise<void> {
    const target = leaveRequest.value
    leaveRequest.value = null
    if (!target || action === 'cancel') return
    if (action === 'save' && !(await saveNow())) return
    if (action === 'discard' && projectId.value) {
      await open(projectId.value)
      toast('Несохранённые правки отменены')
    }
    applyLeave(target)
  }

  function enterSimulation(): void {
    if (saveState.value === 'dirty') leaveRequest.value = 'sim'
    else viewMode.value = 'sim'
  }

  function setMode(next: EditMode): void {
    if (next === 'select' && mode.value !== 'select' && saveState.value === 'dirty') {
      leaveRequest.value = next
      return
    }
    setModeNow(next)
  }

  function setModeNow(next: EditMode): void {
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
    if (!d || !node || objectLocked[activeObject.value] || objectHidden[activeObject.value]) return false
    if (!passesFilter(objectFilter[activeObject.value], node.tags)) return false
    if (activeObject.value === 'stops') return matchesNode('stopPoints', node, d) || matchesNode('stopAreas', node, d)
    return matchesNode(activeObject.value, node, d)
  }

  function acceptsWay(id: number): boolean {
    const way = doc.value?.ways.get(id)
    if (!way || objectLocked[activeObject.value] || objectHidden[activeObject.value]) return false
    if (!passesFilter(objectFilter[activeObject.value], way.tags)) return false
    return matchesWay(activeObject.value, way)
  }

  function placeNetObject(wayId: number, position: LatLon): void {
    const type = activeObject.value
    if (!isCustomObject(type)) return
    const id = mutate('Новый объект сети', (d) => addNode(d, position, customObjectTags(type, wayId)))
    if (id !== undefined) selectOne({ kind: 'node', id })
  }

  /**
   * Пункт ставится на дорогу. Как в Visum, он сразу входит в зону: в ближайшую,
   * а если рядом зоны нет — рядом с дорогой создаётся зона и остановка для неё.
   */
  function addStopPoint(wayId: number, position: LatLon): void {
    const hierarchy = stopHierarchy.value
    const p = projector.value
    const hasArea = !!hierarchy && !!p && nearAreas(hierarchy, p, position, AREA_REACH_M).length > 0
    const nearStop = hierarchy && p ? nearStops(hierarchy, p, position, STOP_JOIN_RADIUS_M)[0]?.stop : undefined
    const id = mutate('Новый пункт остановки', (d, pr) => {
      const node = insertNodeOnWay(d, pr, wayId, position)
      setNodeTags(d, node, { ...(d.node(node).tags ?? {}), public_transport: 'stop_position', bus: 'yes' })
      if (!hasArea) {
        const area = addNode(d, sideOfRoad(d, pr, wayId, d.node(node), AREA_SIDE_OFFSET_M), { public_transport: 'platform', bus: 'yes' })
        setNodeTags(d, node, withStopArea(d.node(node).tags, areaKey('node', area)))
        if (nearStop) moveAreaToStop(d, 'node', area, nearStop.id)
        else {
          d.putRelation({
            id: d.newId(),
            members: [['node', area, 'platform'], ['node', node, 'stop']],
            tags: { type: 'public_transport', public_transport: 'stop_area', name: `Остановка ${node}` },
          })
        }
      }
      return node
    })
    if (id !== undefined) {
      selectOne({ kind: 'node', id })
      if (!hasArea) toast(nearStop ? `Создана зона в остановке «${nearStop.name}»` : 'Рядом не было зоны: созданы зона и остановка')
    }
  }

  /** Новая зона входит в ближайшую остановку, если она рядом. */
  function addStopArea(position: LatLon): void {
    const hierarchy = stopHierarchy.value
    const p = projector.value
    const nearStop = hierarchy && p ? nearStops(hierarchy, p, position, STOP_JOIN_RADIUS_M)[0]?.stop : undefined
    const id = mutate('Новая зона остановки', (d) => {
      const area = addNode(d, position, { public_transport: 'platform', bus: 'yes' })
      if (nearStop) moveAreaToStop(d, 'node', area, nearStop.id)
      return area
    })
    if (id !== undefined) {
      selectOne({ kind: 'node', id })
      toast(nearStop ? `Зона вошла в остановку «${nearStop.name}»` : 'Зона создана. Остановку для неё можно создать в карточке зоны')
    }
  }

  /** Остановка создаётся из зоны. Щелчок по пункту берёт его зону. */
  function addStopFromNode(nodeId: number): void {
    const hierarchy = stopHierarchy.value
    const base = doc.value?.nodes.get(nodeId)
    if (!hierarchy || !base) return
    const key = hierarchy.areas.has(areaKey('node', nodeId)) ? areaKey('node', nodeId) : (hierarchy.points.get(nodeId)?.area ?? null)
    if (!key) {
      toast('Пункт не входит ни в одну зону: сначала поставьте зону рядом с ним', 'error')
      return
    }
    const area = hierarchy.areas.get(key)!
    if (area.stop !== null) {
      selectStop(area.stop)
      toast(`Зона уже входит в остановку «${hierarchy.stops.get(area.stop)?.name ?? area.stop}»`)
      return
    }
    createStopFromArea(key, base.tags?.name ?? area.name)
    toast('Остановка создана', 'success')
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

  /** Разрез дороги в точке. Возвращает узел разреза, если дорога разрезана. */
  function splitAtPosition(wayId: number, position: LatLon): number | null {
    let ok = false
    const nodeId = mutate('Разрезание дороги', (d, p) => {
      const id = insertNodeOnWay(d, p, wayId, position)
      ok = splitWay(d, wayId, id) !== null
      return id
    })
    if (ok) toast('Дорога разрезана', 'success')
    return ok && nodeId !== undefined ? nodeId : null
  }

  /**
   * Тройной щелчок по дороге: точка излома (вершина) в этом месте. Дорога не разрезается и остаётся выбранной,
   * поэтому новая вершина видна среди остальных и её можно сразу тянуть.
   */
  function addVertex(wayId: number, position: LatLon): void {
    const nodeId = mutate('Точка излома', (d, p) => insertNodeOnWay(d, p, wayId, position))
    if (nodeId === undefined) return
    selectOne({ kind: 'way', id: wayId })
    toast('Добавлена точка излома: потяните её, чтобы поправить линию')
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
      links: connectors.filter((c) => c.from.neighbor === from.neighbor && c.fromLane === from.lane).map((c) => ({ neighbor: c.to.neighbor, lane: c.toLane })),
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

  /** Приоритет перекрёстка: главная дорога по двум подходам и знаки на второстепенных. */
  function setJunctionPriority(node: number, main: [number, number] | null, signs: Record<number, PrioritySign>): void {
    mutate(main ? 'Главная дорога на перекрёстке' : 'Равнозначный перекрёсток', (d, p) => applyJunctionPriority(d, p, node, main, signs))
  }

  /** Окно черновой расстановки знаков приоритета. */
  const prioritySuggestOpen = ref(false)
  /** Предлагаемые знаки на карте, пока окно открыто. */
  const signPreview = shallowRef<(LatLon & { chosen: boolean; focused: boolean })[]>([])

  function applyPrioritySuggestions(items: PrioritySuggestion[]): void {
    if (items.length === 0) return
    const placed = mutate(`Знаки «Уступи дорогу»: ${items.length}`, (d, p) => applyPrioritySigns(d, p, items))
    if (placed) toast(`Поставлено знаков: ${placed.length}. Отменить все сразу: Ctrl+Z`, 'success')
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

  /** Завершение рисования только спрашивает атрибуты: в сеть отрезок попадёт после ОК. */
  function finishRoad(): void {
    if (drawPoints.value.length < 2) return
    pendingRoad.value = { points: drawPoints.value }
  }

  function cancelRoadDialog(): void {
    pendingRoad.value = null
  }

  function undoDrawPoint(): void {
    drawPoints.value = drawPoints.value.slice(0, -1)
  }

  function cancelInsert(): void {
    drawPoints.value = []
    crossingStart.value = null
    connectorFrom.value = null
    speedStart.value = null
  }

  function confirmRoad(attrs: NewLinkAttrs): void {
    const points = pendingRoad.value?.points ?? []
    pendingRoad.value = null
    drawPoints.value = []
    if (points.length < 2) return
    let tags: Tags = { ...preset.value.tags, highway: attrs.type }
    delete tags.name
    if (attrs.name.trim()) tags.name = attrs.name.trim()
    if (String(attrs.maxspeed).trim()) tags.maxspeed = String(attrs.maxspeed).trim()
    else delete tags.maxspeed
    if (attrs.blockReverse) {
      tags.oneway = 'yes'
      tags = withLanes(tags, attrs.forward, 0)
    } else {
      delete tags.oneway
      tags = withLanes(tags, attrs.forward, attrs.backward)
    }
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
      d.reserveId(attrs.id)
      d.putWay({ id: attrs.id, nds, tags })
      return attrs.id
    })
    if (wayId !== undefined) {
      // Сразу показываем свойства новой дороги: следующую начнут клавишей D
      toast(`Отрезок ${wayId} создан`, 'success')
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
    selectShape,
    selectPolygon,
    invertSelection,
    deleteRequest,
    requestDelete,
    requestDeleteSelection,
    confirmDelete,
    cancelDelete,
    pendingRoad,
    cancelRoadDialog,
    confirmRoad,
    undoDrawPoint,
    cancelInsert,
    crossingStart,
    finishCrossing,
    selectedTurn,
    selectTurn,
    turnMovements,
    turnPreview,
    turnConnectors,
    setTurnLane,
    turnShape,
    setTurnShape,
    setLaneShift,
    setTurnAllowed,
    applyTurnTemplate,
    updateTurnAttrs,
    resetTurnRules,
    crsDialogOpen,
    recentCrs,
    customCrs,
    setCrs,
    addCustomCrs,
    removeCustomCrs,
    objectFilter,
    leaveRequest,
    saveNow,
    resolveLeave,
    enterSimulation,
    selectedLane,
    pickLane,
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
    transitLoadShown,
    stopHierarchy,
    selectedStopId,
    selectedStop,
    selectStop,
    focusStop,
    setPointArea,
    setAreaStop,
    createStopFromArea,
    renameStop,
    deleteStop,
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
    addVertex,
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
    prioritySuggestOpen,
    setJunctionPriority,
    signPreview,
    applyPrioritySuggestions,
    smoothSelected,
    parallelSelected,
    duplicateSelected,
  }
})

// Без этого при правке хранилища открытая вкладка держит старый экземпляр без новых полей
if (import.meta.hot) import.meta.hot.accept(acceptHMRUpdate(useEditor, import.meta.hot))
