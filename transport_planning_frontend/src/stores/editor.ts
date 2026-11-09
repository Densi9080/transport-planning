import { defineStore } from 'pinia'
import { computed, markRaw, reactive, ref, shallowRef } from 'vue'

import { loadProject, saveChanges } from '@/api'
import { OsmDoc } from '@/core/doc'
import { Projector, smoothCurve } from '@/core/geo'
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
import { buildNetwork } from '@/core/topology'
import type { LatLon, Tags } from '@/core/types'
import { type Issue, validate } from '@/core/validate'

export type Tool = 'select' | 'node' | 'road' | 'split' | 'signal' | 'crossing' | 'bridge' | 'tunnel'
export type ViewMode = 'engineering' | 'graph' | '3d'
export type Basemap = 'none' | 'osm' | 'satellite'
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
  const viewMode = ref<ViewMode>('engineering')
  const selection = shallowRef<SelectedItem[]>([])
  const presetId = ref(DEFAULT_PRESET_ID)
  const drawMode = ref<DrawMode>('polyline')
  const drawPoints = shallowRef<DrawPoint[]>([])

  const basemap = ref<Basemap>('none')
  const basemapOpacity = ref(0.65)
  const layers = reactive({
    buildings: true,
    landuse: true,
    minor: true,
    rail: true,
    turnPaths: true,
    arrows: true,
    crossings: true,
    signals: true,
    labels: true,
    issues: true,
  })

  const issues = shallowRef<Issue[]>([])
  const focusedIssue = ref<string | null>(null)
  const focusRequest = shallowRef<{ position: LatLon; zoom?: number } | null>(null)

  const toasts = ref<Toast[]>([])
  const helpOpen = ref(false)
  const exportOpen = ref(false)
  const zoom = ref(15)
  // На узком окне панели закрыли бы карту целиком, поэтому там они изначально свёрнуты
  const wideScreen = window.innerWidth >= WIDE_SCREEN_PX
  const navigatorOpen = ref(wideScreen)
  const inspectorOpen = ref(wideScreen)

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

  let toastId = 0
  function toast(text: string, tone: Toast['tone'] = 'info'): void {
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
      rev.value++
      runValidation()
    } catch (error) {
      loadError.value = error instanceof Error ? error.message : String(error)
    } finally {
      loading.value = false
    }
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
    tool.value = next
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
    basemap,
    basemapOpacity,
    layers,
    issues,
    focusedIssue,
    focusRequest,
    toasts,
    helpOpen,
    exportOpen,
    zoom,
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
  }
})
