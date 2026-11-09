<script setup lang="ts">
import {
  type GeoJSONSource,
  type ImageSource,
  type LngLat,
  Map as MlMap,
  type MapMouseEvent,
  Marker,
  NavigationControl,
  ScaleControl,
  setWorkerUrl,
} from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import type { Feature, FeatureCollection } from 'geojson'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'

import type { OsmDoc } from '@/core/doc'
import { bearing, dist, nearestOnSegment, offsetPolyline, pointInPolygon, polylineLength, type Projector, sub, unit } from '@/core/geo'
import { hiddenJunctions } from '@/core/filter'
import type { LanePort } from '@/core/lanePick'
import { isDrivable, parseProfile, totalWidth } from '@/core/lanes'
import { insertNodeOnWay, mergeNodes, moveNode } from '@/core/ops'
import { buildScene, buildStaticScene, type StaticScene } from '@/core/scene'
import { laneLineFeatures } from '@/core/laneLines'
import { lineSegments } from '@/core/transit'
import { stopPointOfArea } from '@/core/transitCalc'
import { wayHeights } from '@/core/elevation'
import { CUSTOM_TYPES, type CustomObject, customObjectOf, matchesNode, TP_TYPE } from '@/core/netObjects'
import type { LatLon, ONode, XY } from '@/core/types'
import { ensureLabelImage, registerIcons } from '@/map/icons'
import { CarLayer } from '@/map/carLayer'
import CoordMenu from '@/components/CoordMenu.vue'
import {
  basemapSource,
  buildLayers,
  emptySources,
  ENGINEERING_LAYERS,
  GRAPH_LAYERS,
  MODEL_LAYERS,
  SIM_LAYERS,
  themePaint,
  TURN_LAYERS,
  LANE_LINE_ZOOM,
} from '@/map/style'
import { parseSpeed } from '@/sim/macro'
import { losFromSpeedRatio } from '@/sim/micro'
import { signalState } from '@/sim/net'
import { type DrawPoint, type SelectedItem, useEditor } from '@/stores/editor'
import { useSimulation } from '@/stores/simulation'
import { useTraffic } from '@/stores/traffic'

// Сам MapLibre ищет воркер рядом со своим модулем, а после сборки его там нет
setWorkerUrl(mapWorkerUrl)

const NODE_PICK_PX = 11
const PITCH_3D = 5
const SELECT_LIFT_M = 0.3
const SELECT_HEIGHT_M = 0.8
const MIN_SELECT_HALF_M = 1.5
const NODE_SELECT_M = 3
const CIRCLE_POINTS = 72
/** Выше этой отметки машина уже на мосту и должна быть видна поверх него. */
const BRIDGE_CAR_Z_M = 1.5
const TURN_PICK_PX = 5
/** Пропускная способность полосы, авт/ч: на быстрых дорогах выше, во дворах заметно ниже. */
function laneCapacity(speedLimit: number): number {
  if (speedLimit >= 60) return 1800
  return speedLimit >= 40 ? 1200 : 500
}
const MIN_BOX_PX = 4
const SIGNAL_PICK_PX = 6
const SEGMENT_PICK_PX = 7
const SNAP_PX = 13
const ANGLE_STEP_DEG = 15
const MIN_DRAW_STEP_PX = 5
const BAR_MAX_PX = 34
const BAR_VEHICLES_PER_PX = 70
const BAR_LABEL_MIN = 300
const BAR_LABEL_COUNT = 40
const OD_LINES = 150

const editor = useEditor()
const sim = useSimulation()
const container = ref<HTMLDivElement | null>(null)
const traffic = useTraffic()
const hud = ref<{ x: number; y: number; text: string }[]>([])
const insertMenu = ref<{ x: number; y: number } | null>(null)
const coordMenu = ref<{ x: number; y: number; lat: number; lon: number } | null>(null)
const selectionBox = ref<{ left: number; top: number; width: number; height: number } | null>(null)
let boxStart: { x: number; y: number } | null = null
let boxShift = false
let circleDrag: { center: XY; radius: number } | null = null
let polygonCursor: XY | null = null
const customNodes = computed(() => {
  void editor.rev
  const result: { node: ONode; type: CustomObject }[] = []
  for (const node of editor.doc?.nodes.values() ?? []) {
    const type = customObjectOf(node.tags)
    if (type) result.push({ node, type })
  }
  return result
})

interface HitNode {
  kind: 'node'
  id: number
}
interface HitWay {
  kind: 'way'
  id: number
  point: XY
}
interface HitMid {
  kind: 'mid'
  wayId: number
  position: LatLon
}
type Hit = HitNode | HitWay | HitMid

interface Drag {
  nodeId: number
  moved: boolean
  startPoint: { x: number; y: number }
  snap: Snap | null
}

interface Snap {
  nodeId?: number
  wayId?: number
  position: LatLon
}

let map: MlMap | null = null
let ready = false
let frame = 0
let drag: Drag | null = null
let hover: Hit | null = null
let cursorSnap: Snap | null = null
let cursorPosition: LatLon | null = null
let suppressClick = false
let resizeObserver: ResizeObserver | null = null

/** Координаты дорог в метрах, чтобы искать ближайшую без лишних пересчётов на каждое движение мыши. */
let wayCache = new Map<number, { points: XY[]; ids: number[]; half: number; level: number; drivable: boolean }>()
let wayCacheRev = -1

function refreshWayCache(): void {
  if (wayCacheRev === editor.rev) return
  wayCacheRev = editor.rev
  const doc = editor.doc!
  const projector = editor.projector!
  wayCache = new Map()
  for (const way of doc.ways.values()) {
    const tags = way.tags ?? {}
    if (!tags.highway || tags.area === 'yes') continue
    const drivable = isDrivable(tags)
    if (!drivable && !editor.layers.minor) continue
    // Скрытый объект нельзя случайно выбрать на карте
    if (editor.hidden.ways.has(way.id)) continue
    const ids = way.nds.filter((id) => doc.nodes.has(id))
    if (ids.length < 2) continue
    wayCache.set(way.id, {
      ids,
      points: ids.map((id) => projector.toXY(doc.node(id))),
      half: drivable ? totalWidth(parseProfile(tags)) / 2 : 1,
      level: Number.parseInt(tags.layer ?? '0', 10) || 0,
      drivable,
    })
  }
}

function metersPerPixel(lngLat: LngLat): number {
  const m = map!
  const a = m.project(lngLat)
  const b = m.unproject([a.x + 1, a.y])
  const projector = editor.projector!
  return dist(projector.toXY({ lat: lngLat.lat, lon: lngLat.lng }), projector.toXY({ lat: b.lat, lon: b.lng }))
}

/** Тип объектов важен только при выборе. Инструменты вставки сами решают, куда их можно поставить. */
function pickType(): 'auto' | 'links' | 'nodes' {
  if (editor.tool === 'select' || editor.tool === 'delete') return editor.activeType
  return ['object', 'stopPoint', 'lineWay', 'bridge', 'tunnel'].includes(editor.tool) ? 'links' : 'auto'
}

/** Объекты вне дорог не входят в кэш дорог, поэтому ищем их отдельно. */
function pickFreeObject(p: XY, mpp: number): HitNode | null {
  if (editor.tool !== 'select' && editor.tool !== 'delete' && editor.tool !== 'stopGroup') return null
  const doc = editor.doc!
  let best: HitNode | null = null
  let distance = NODE_PICK_PX * mpp
  for (const node of doc.nodes.values()) {
    if (doc.waysOfNode(node.id).length > 0 || !editor.acceptsNode(node.id)) continue
    const d = dist(editor.projector!.toXY(node), p)
    if (d < distance) {
      distance = d
      best = { kind: 'node', id: node.id }
    }
  }
  return best
}

function pickableNode(id: number): boolean {
  const doc = editor.doc!
  if (editor.hidden.nodes.has(id)) return false
  if (pickType() === 'nodes') return true
  if (editor.selection.some((item) => item.kind === 'node' && item.id === id)) return true
  const node = doc.nodes.get(id)
  if (node?.tags?.highway || node?.tags?.traffic_calming) return true
  if (editor.viewMode === 'graph') return true
  return doc.waysOfNode(id).length > 1
}

function pick(lngLat: LngLat): Hit | null {
  const projector = editor.projector
  if (!projector || !editor.doc) return null
  refreshWayCache()
  const p = projector.toXY({ lat: lngLat.lat, lon: lngLat.lng })
  const mpp = metersPerPixel(lngLat)
  const type = pickType()
  const free = pickFreeObject(p, mpp)
  if (free) return free

  const selectedWayIds = new Set(editor.selectedWays.map((way) => way.id))

  // Узлы выбранной дороги и середины её отрезков важнее всего остального
  let bestHandle: Hit | null = null
  let bestHandleDistance = NODE_PICK_PX * mpp
  for (const wayId of selectedWayIds) {
    const entry = wayCache.get(wayId)
    if (!entry) continue
    entry.points.forEach((point, index) => {
      const d = dist(point, p)
      if (d < bestHandleDistance) {
        bestHandleDistance = d
        bestHandle = { kind: 'node', id: entry.ids[index]! }
      }
      const next = entry.points[index + 1]
      if (next && dist(point, next) > 24 * mpp) {
        const middle = { x: (point.x + next.x) / 2, y: (point.y + next.y) / 2 }
        const dMid = dist(middle, p)
        if (dMid < bestHandleDistance) {
          bestHandleDistance = dMid
          bestHandle = { kind: 'mid', wayId, position: projector.toLatLon(middle) }
        }
      }
    })
  }
  if (bestHandle && (type !== 'links' || editor.tool === 'select')) return bestHandle

  let nodeHit: HitNode | null = null
  let nodeDistance = NODE_PICK_PX * mpp
  const seen = new Set<number>()
  for (const entry of wayCache.values()) {
    entry.ids.forEach((id, index) => {
      if (seen.has(id)) return
      seen.add(id)
      const d = dist(entry.points[index]!, p)
      if (d < nodeDistance && pickableNode(id)) {
        nodeDistance = d
        nodeHit = { kind: 'node', id }
      }
    })
  }
  if (nodeHit && type !== 'links') return nodeHit
  if (type === 'nodes') return null

  let wayHit: HitWay | null = null
  let score = Number.POSITIVE_INFINITY
  for (const [id, entry] of wayCache) {
    const tolerance = Math.max(entry.half, SEGMENT_PICK_PX * mpp)
    for (let i = 1; i < entry.points.length; i++) {
      const a = entry.points[i - 1]!
      const b = entry.points[i]!
      if (
        Math.min(a.x, b.x) - tolerance > p.x ||
        Math.max(a.x, b.x) + tolerance < p.x ||
        Math.min(a.y, b.y) - tolerance > p.y ||
        Math.max(a.y, b.y) + tolerance < p.y
      ) {
        continue
      }
      const hit = nearestOnSegment(p, a, b)
      if (hit.distance > tolerance) continue
      // Сверху лежит то, что выше уровнем, а тротуар не перебивает проезжую часть
      const rank = hit.distance / tolerance - entry.level * 2 + (entry.drivable ? 0 : 1)
      if (rank < score) {
        score = rank
        wayHit = { kind: 'way', id, point: hit.point }
      }
    }
  }
  return wayHit
}

/** Куда прилипнет точка: к узлу, а если разрешено — к ближайшей дороге. */
function findSnap(lngLat: LngLat, excludeNode: number | null, allowWay: boolean): Snap | null {
  const projector = editor.projector!
  refreshWayCache()
  const p = projector.toXY({ lat: lngLat.lat, lon: lngLat.lng })
  const tolerance = SNAP_PX * metersPerPixel(lngLat)
  let bestNode: Snap | null = null
  let bestNodeDistance = tolerance
  let bestWay: Snap | null = null
  let bestWayDistance = tolerance * 0.8

  for (const [id, entry] of wayCache) {
    if (!entry.drivable) continue
    const contains = excludeNode !== null && entry.ids.includes(excludeNode)
    entry.points.forEach((point, index) => {
      const nodeId = entry.ids[index]!
      if (nodeId === excludeNode) return
      const d = dist(point, p)
      if (d < bestNodeDistance) {
        bestNodeDistance = d
        bestNode = { nodeId, position: projector.toLatLon(point) }
      }
      if (index === 0 || !allowWay || contains) return
      const hit = nearestOnSegment(p, entry.points[index - 1]!, point)
      if (hit.distance < bestWayDistance) {
        bestWayDistance = hit.distance
        bestWay = { wayId: id, position: projector.toLatLon(hit.point) }
      }
    })
  }
  return bestNode ?? bestWay
}

function setData(id: string, data: FeatureCollection): void {
  ;(map?.getSource(id) as GeoJSONSource | undefined)?.setData(data)
}

function scheduleRender(): void {
  if (frame) return
  frame = requestAnimationFrame(() => {
    frame = 0
    renderScene()
    renderOverlay()
  })
}

/** Пункты, зоны и остановки рисуются раздельно, чтобы скрывать их независимо друг от друга. */
function lineLngLat(coordinates: number[][], properties: Record<string, unknown>): Feature {
  return { type: 'Feature', properties, geometry: { type: 'LineString', coordinates } }
}

function stopObjectFeatures(): Feature[] {
  const doc = editor.doc!
  const features: Feature[] = []
  for (const node of doc.nodes.values()) {
    if (matchesNode('stopPoints', node, doc)) features.push(pointOf(node, { kind: 'point' }))
    if (matchesNode('stopAreas', node, doc)) {
      features.push(pointOf(node, { kind: 'area' }))
      const bound = stopPointOfArea(doc, editor.projector!, node)
      if (bound) features.push(lineLngLat([[node.lon, node.lat], [bound.node.lon, bound.node.lat]], { kind: 'link' }))
    }
  }
  for (const way of doc.ways.values()) {
    const node = way.tags?.public_transport === 'platform' ? doc.nodes.get(way.nds[0]!) : undefined
    if (node) features.push(pointOf(node, { kind: 'area' }))
  }
  for (const relation of doc.relations.values()) {
    if (relation.tags?.public_transport !== 'stop_area') continue
    const nodes = relation.members.filter(([type, ref]) => type === 'node' && doc.nodes.has(ref)).map(([, ref]) => doc.node(ref))
    if (nodes.length === 0) continue
    const lat = nodes.reduce((sum, node) => sum + node.lat, 0) / nodes.length
    const lon = nodes.reduce((sum, node) => sum + node.lon, 0) / nodes.length
    features.push(pointOf({ lat, lon }, { kind: 'stop' }))
  }
  return features
}

function renderScene(): void {
  if (!ready || !editor.doc || !editor.projector || !map) return
  const { scene, network: laneNetwork } = buildScene(editor.doc, editor.projector)
  setData('laneLines', { type: 'FeatureCollection', features: laneLineFeatures(laneNetwork) })
  setData('netStops', { type: 'FeatureCollection', features: stopObjectFeatures() })
  for (const feature of scene.labels.features) {
    const name = feature.properties?.name as string
    feature.properties = { ...feature.properties, image: ensureLabelImage(map, name, editor.theme) }
  }
  const hidden = editor.hidden
  const anyHidden = hidden.ways.size > 0 || hidden.nodes.size > 0
  const network = editor.network
  const junctions = anyHidden && network ? hiddenJunctions(network, hidden) : null
  for (const [key, value] of Object.entries(scene)) {
    setData(key, anyHidden ? filterCollection(value, junctions) : value)
  }
}

/** Убирает скрытые по атрибутам объекты. Сам граф при этом остаётся целым: геометрия узлов не меняется. */
function filterCollection(collection: FeatureCollection, junctions: Set<number> | null): FeatureCollection {
  const { ways, nodes } = editor.hidden
  return {
    type: 'FeatureCollection',
    features: collection.features.filter((feature) => {
      const props = feature.properties
      if (!props) return true
      if (props.wayId !== undefined && ways.has(props.wayId as number)) return false
      if (props.node !== undefined) {
        if (nodes.has(props.node as number)) return false
        if (junctions?.has(props.node as number)) return false
      }
      return true
    }),
  }
}

let backdrop: StaticScene | null = null

function applyStatic(): void {
  if (!ready || !backdrop) return
  for (const key of ['buildings', 'landuse', 'rail', 'water', 'other', 'points'] as const) {
    setData(key, filterCollection(backdrop[key], null))
  }
}

function applyTheme(): void {
  if (!ready || !map) return
  for (const [layer, property, value] of themePaint(editor.theme)) {
    if (map.getLayer(layer)) map.setPaintProperty(layer, property as never, value as never)
  }
  applyModelOpacity()
  scheduleRender()
  renderTransit()
}

/** Маршруты ОТ: толщина линии показывает, сколько маршрутов идёт по этой дороге. */
function renderTransit(): void {
  const doc = editor.doc
  if (!ready || !map || !doc) return
  const showAll = editor.layers.transit
  const selectedId = editor.selectedLineId
  const lines = editor.lines
  const counts = new Map<string, number>()
  const segmentsByLine = new Map<number, number[][]>()
  for (const line of lines) {
    if (!showAll && line.id !== selectedId) continue
    const segments = lineSegments(doc, line.wayIds)
    segmentsByLine.set(line.id, segments)
    for (const segment of segments) {
      for (let i = 1; i < segment.length; i++) {
        const key = segmentKey(segment[i - 1]!, segment[i]!)
        counts.set(key, (counts.get(key) ?? 0) + 1)
      }
    }
  }
  const features: Feature[] = []
  const stopFeatures: Feature[] = []
  const labelFeatures: Feature[] = []
  const seenStops = new Set<number>()
  for (const line of lines) {
    const segments = segmentsByLine.get(line.id)
    if (!segments) continue
    const selected = line.id === selectedId
    for (const segment of segments) {
      const coordinates = segment
        .map((id) => doc.nodes.get(id))
        .filter((node): node is NonNullable<typeof node> => !!node)
        .map((node) => [node.lon, node.lat])
      if (coordinates.length < 2) continue
      let count = 1
      for (let i = 1; i < segment.length; i++) {
        count = Math.max(count, counts.get(segmentKey(segment[i - 1]!, segment[i]!)) ?? 1)
      }
      features.push({
        type: 'Feature',
        properties: { line: line.id, selected, color: line.color, count },
        geometry: { type: 'LineString', coordinates },
      })
    }
    for (const stop of line.stops) {
      if (!selected && seenStops.has(stop.node)) continue
      seenStops.add(stop.node)
      stopFeatures.push({
        type: 'Feature',
        properties: { selected, color: line.color },
        geometry: { type: 'Point', coordinates: [stop.position.lon, stop.position.lat] },
      })
      if (selected) {
        labelFeatures.push({
          type: 'Feature',
          properties: { image: ensureLabelImage(map, stop.name, editor.theme) },
          geometry: { type: 'Point', coordinates: [stop.position.lon, stop.position.lat] },
        })
      }
    }
  }
  // Выбранный маршрут рисуется поверх остальных
  features.sort((a, b) => Number(a.properties?.selected) - Number(b.properties?.selected))
  setData('transitLines', { type: 'FeatureCollection', features })
  setData('transitStops', { type: 'FeatureCollection', features: stopFeatures })
  setData('transitLabels', { type: 'FeatureCollection', features: labelFeatures })
  map.setLayoutProperty('transit-all', 'visibility', showAll ? 'visible' : 'none')
  map.setLayoutProperty('transit-stops', 'visibility', showAll || selectedId !== null ? 'visible' : 'none')
}

function segmentKey(a: number, b: number): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`
}

function renderIssues(): void {
  if (!ready) return
  setData('issues', {
    type: 'FeatureCollection',
    features: editor.issues
      .filter((issue) => issue.severity !== 'info')
      .map((issue) => ({
        type: 'Feature',
        properties: { severity: issue.severity, focused: issue.id === editor.focusedIssue, id: issue.id },
        geometry: { type: 'Point', coordinates: [issue.position.lon, issue.position.lat] },
      })),
  })
}

function lineOf(points: XY[], properties: Record<string, unknown>): Feature {
  const projector = editor.projector!
  return {
    type: 'Feature',
    properties,
    geometry: { type: 'LineString', coordinates: points.map((p) => projector.toLngLat(p)) },
  }
}

function pointOf(position: LatLon, properties: Record<string, unknown>): Feature {
  return { type: 'Feature', properties, geometry: { type: 'Point', coordinates: [position.lon, position.lat] } }
}

function renderOverlay(): void {
  const doc = editor.doc
  const projector = editor.projector
  if (!ready || !doc || !projector || !map) return
  refreshWayCache()
  const features: Feature[] = []
  const mpp = metersPerPixel(map.getCenter())

  if (hover?.kind === 'way' && !editor.selection.some((s) => s.kind === 'way' && s.id === (hover as HitWay).id)) {
    const entry = wayCache.get(hover.id)
    if (entry) features.push(lineOf(entry.points, { role: 'hover', px: (entry.half * 2) / mpp }))
  }
  if (hover?.kind === 'node') {
    const node = doc.nodes.get(hover.id)
    if (node) features.push(pointOf(node, { role: 'node-hover' }))
  }

  for (const way of editor.selectedWays) {
    const entry = wayCache.get(way.id)
    if (!entry) continue
    features.push(lineOf(entry.points, { role: 'selected' }))
    entry.points.forEach((point, index) => {
      const id = entry.ids[index]!
      features.push(pointOf(projector.toLatLon(point), { role: 'vertex', junction: doc.waysOfNode(id).length > 1 }))
      const next = entry.points[index + 1]
      if (next && dist(point, next) > 24 * mpp) {
        features.push(pointOf(projector.toLatLon({ x: (point.x + next.x) / 2, y: (point.y + next.y) / 2 }), { role: 'mid' }))
      }
    })
  }
  for (const { node, type } of customNodes.value) {
    if (!editor.objectHidden[type]) features.push(pointOf(node, { role: 'net-object', letter: CUSTOM_TYPES[type].letter }))
  }
  renderSelectShapes(features)
  if (map.getPitch() > PITCH_3D) renderSelected3d(features, doc, projector)
  const turnView = editor.turnPreview
  if (turnView) {
    for (const path of turnView.paths) features.push(lineOf(path, { role: 'turn-selected' }))
    features.push(pointOf(projector.toLatLon(turnView.start), { role: 'turn-start' }))
    features.push(pointOf(projector.toLatLon(turnView.end), { role: 'turn-end' }))
  }
  if (editor.selectedLane) features.push(lineOf(editor.selectedLane.points, { role: 'hover', px: 8 }))
  for (const node of editor.selectedNodes) features.push(pointOf(node, { role: 'node-selected' }))

  // Предложения помощника видны на карте, пока человек не решил, применять ли их
  const proposal = editor.proposalTargets
  if (proposal) {
    for (const id of proposal.ways) {
      const way = doc.ways.get(id)
      const points = way?.nds.map((nd) => doc.nodes.get(nd)).filter((node): node is NonNullable<typeof node> => !!node).map((node) => projector.toXY(node))
      if (points && points.length >= 2) features.push(lineOf(points, { role: 'proposal' }))
    }
    for (const id of proposal.nodes) {
      const node = doc.nodes.get(id)
      if (node) features.push(pointOf(node, { role: 'proposal-node' }))
    }
  }

  const snap = drag?.snap ?? cursorSnap
  if (snap) features.push(pointOf(snap.position, { role: 'snap' }))

  if (editor.tool === 'road') renderDrawPreview(features)
  else hud.value = editLabels()
  if (editor.speedStart) features.push(pointOf(editor.speedStart.position, { role: 'draw-point' }))
  const connector = editor.connectorPreview
  if (connector) {
    for (const stub of connector.targets) features.push(lineOf(stub, { role: 'hover', px: 7 }))
    for (const path of connector.connected) features.push(lineOf(path, { role: 'draw' }))
    features.push(lineOf(connector.source, { role: 'selected' }))
  }
  if (editor.tool === 'connector' && map.getZoom() >= PORT_MIN_ZOOM) {
    const bounds = map.getBounds()
    for (const port of editor.connectorPorts) {
      const position = projector.toLatLon(port.point)
      if (!bounds.contains([position.lon, position.lat])) continue
      const source = editor.connectorFrom
      const isSource = !!source && port.incoming && source.node === port.node && source.neighbor === port.neighbor && source.lane === port.lane
      const isLinked = !port.incoming && !!connector?.links.some((link) => port.node === editor.connectorFrom?.node && link.neighbor === port.neighbor && link.lane === port.lane)
      const role = isSource ? 'port-source' : port === hoverPort ? 'port-target' : isLinked ? 'port-linked' : port.incoming ? 'port-in' : 'port-out'
      features.push(pointOf(position, { role }))
    }
    const anchor = editor.connectorFrom?.port
    if (anchor) {
      // Уже проведённые связи видны паутиной от исходной полосы, пока она выбрана
      for (const link of connector?.links ?? []) {
        const target = editor.connectorPorts.find((port) => !port.incoming && port.node === editor.connectorFrom?.node && port.neighbor === link.neighbor && port.lane === link.lane)
        if (target) features.push(lineOf([anchor, target.point], { role: 'band' }))
      }
      const end = hoverPort?.point ?? portCursor
      if (end) features.push(lineOf([anchor, end], { role: 'band' }))
    }
  }
  if (leash) {
    if (leash.target) features.push(lineOf([leash.cursor, leash.target], { role: 'band' }))
    features.push(pointOf(projector.toLatLon(leash.target ?? leash.cursor), { role: 'ghost' }))
  }

  setData('overlay', { type: 'FeatureCollection', features })
}

function segmentLabel(a: XY, b: XY): { x: number; y: number; text: string } {
  const projector = editor.projector!
  const middle = projector.toLatLon({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
  const screen = map!.project([middle.lon, middle.lat])
  return { x: screen.x, y: screen.y, text: `${dist(a, b).toFixed(1)} м · ${formatAngle(a, b)}` }
}

/** Длина и направление отрезков, пока их меняют, как при рисовании новой дороги. */
function editLabels(): { x: number; y: number; text: string }[] {
  const doc = editor.doc!
  const projector = editor.projector!
  const labels: { x: number; y: number; text: string }[] = []
  if (drag?.moved) {
    const moved = projector.toXY(doc.node(drag.nodeId))
    for (const wayId of doc.waysOfNode(drag.nodeId)) {
      const nds = doc.way(wayId).nds
      nds.forEach((id, index) => {
        if (id !== drag!.nodeId) return
        for (const near of [nds[index - 1], nds[index + 1]]) {
          if (near !== undefined) labels.push(segmentLabel(projector.toXY(doc.node(near)), moved))
        }
      })
    }
  }
  if (circleDrag && circleDrag.radius > 0) {
    const position = projector.toLatLon(circleDrag.center)
    const screen = map!.project([position.lon, position.lat])
    labels.push({ x: screen.x, y: screen.y - 18, text: `R ${circleDrag.radius.toFixed(1)} м` })
  }
  if (editor.tool === 'crossing' && editor.crossingStart && leash) labels.push(segmentLabel(projector.toXY(editor.crossingStart), leash.cursor))
  return labels
}

/** На наклонной карте выбор виден объёмом: плоская линия теряется среди домов и настилов мостов. */
function renderSelected3d(features: Feature[], doc: OsmDoc, projector: Projector): void {
  const ribbon = (points: XY[], halfWidth: number, z: number): void => {
    const left = offsetPolyline(points, halfWidth)
    const right = offsetPolyline(points, -halfWidth)
    const ring = [...left, ...[...right].reverse()].map((point) => projector.toLngLat(point))
    ring.push(ring[0]!)
    features.push({ type: 'Feature', properties: { role: 'selected-3d', base: z + SELECT_LIFT_M, top: z + SELECT_LIFT_M + SELECT_HEIGHT_M }, geometry: { type: 'Polygon', coordinates: [ring] } })
  }
  for (const way of editor.selectedWays) {
    const entry = wayCache.get(way.id)
    if (!entry) continue
    const heights = wayHeights(doc, way)
    ribbon(entry.points, Math.max(entry.half, MIN_SELECT_HALF_M), Math.max(0, ...heights.values()))
  }
  for (const node of editor.selectedNodes) {
    const center = projector.toXY(node)
    ribbon([{ x: center.x - NODE_SELECT_M, y: center.y }, { x: center.x + NODE_SELECT_M, y: center.y }], NODE_SELECT_M, 0)
  }
}

function selectAreaFeature(points: XY[]): Feature {
  const ring = [...points, points[0]!].map((point) => editor.projector!.toLngLat(point))
  return { type: 'Feature', properties: { role: 'select-area' }, geometry: { type: 'Polygon', coordinates: [ring] } }
}

function renderSelectShapes(features: Feature[]): void {
  if (circleDrag && circleDrag.radius > 0) {
    const { center, radius } = circleDrag
    features.push(selectAreaFeature(Array.from({ length: CIRCLE_POINTS }, (_, i) => {
      const angle = (i / CIRCLE_POINTS) * Math.PI * 2
      return { x: center.x + Math.cos(angle) * radius, y: center.y + Math.sin(angle) * radius }
    })))
    features.push(pointOf(editor.projector!.toLatLon(center), { role: 'draw-point' }))
  }
  const polygon = editor.selectPolygon
  if (polygon.length > 0) {
    const outline = polygonCursor ? [...polygon, polygonCursor] : polygon
    if (outline.length >= 3) features.push(selectAreaFeature(outline))
    else if (outline.length === 2) features.push(lineOf(outline, { role: 'band' }))
    for (const point of polygon) features.push(pointOf(editor.projector!.toLatLon(point), { role: 'draw-point' }))
  }
}

function formatAngle(from: XY, to: XY): string {
  return `${Math.round(bearing(unit(sub(to, from))))}°`
}

function renderDrawPreview(features: Feature[]): void {
  const projector = editor.projector!
  const m = map!
  const points: LatLon[] = [...editor.drawPoints]
  if (cursorPosition && editor.drawPoints.length > 0) points.push(cursorPosition)
  const xy = points.map((p) => projector.toXY(p))
  const labels: typeof hud.value = []

  if (xy.length >= 2) {
    const profile = parseProfile(editor.preset.tags)
    const half = totalWidth(profile) / 2
    const left = offsetPolyline(xy, half)
    const right = offsetPolyline(xy, -half)
    const ring = [...left, ...right.reverse()].map((p) => projector.toLngLat(p))
    ring.push(ring[0]!)
    features.push({
      type: 'Feature',
      properties: { role: 'ribbon' },
      geometry: { type: 'Polygon', coordinates: [ring] },
    })
    features.push(lineOf(xy, { role: 'draw' }))
    for (let i = 1; i < xy.length; i++) {
      const a = xy[i - 1]!
      const b = xy[i]!
      const middle = projector.toLatLon({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
      const screen = m.project([middle.lon, middle.lat])
      labels.push({ x: screen.x, y: screen.y, text: `${dist(a, b).toFixed(1)} м · ${formatAngle(a, b)}` })
    }
    if (xy.length > 2) {
      const tip = points.at(-1)!
      const screen = m.project([tip.lon, tip.lat])
      labels.push({ x: screen.x + 8, y: screen.y - 22, text: `всего ${polylineLength(xy).toFixed(0)} м` })
    }
  }
  for (const point of editor.drawPoints) features.push(pointOf(point, { role: 'draw-point' }))
  hud.value = labels
}

function constrained(lngLat: LngLat, shift: boolean): LatLon {
  const position = { lat: lngLat.lat, lon: lngLat.lng }
  const last = editor.drawPoints.at(-1)
  if (!shift || !last) return position
  const projector = editor.projector!
  const origin = projector.toXY(last)
  const target = projector.toXY(position)
  const length = dist(origin, target)
  const step = (ANGLE_STEP_DEG * Math.PI) / 180
  const angle = Math.round(Math.atan2(target.x - origin.x, target.y - origin.y) / step) * step
  return projector.toLatLon({ x: origin.x + Math.sin(angle) * length, y: origin.y + Math.cos(angle) * length })
}

function onMouseMove(event: MapMouseEvent): void {
  if (circleDrag) {
    circleDrag.radius = dist(circleDrag.center, editor.projector!.toXY({ lat: event.lngLat.lat, lon: event.lngLat.lng }))
    scheduleOverlay()
    return
  }
  if (editor.mode === 'select' && editor.selectPolygon.length > 0) {
    polygonCursor = editor.projector!.toXY({ lat: event.lngLat.lat, lon: event.lngLat.lng })
    scheduleOverlay()
    return
  }
  if (boxStart) {
    const left = Math.min(boxStart.x, event.point.x)
    const top = Math.min(boxStart.y, event.point.y)
    selectionBox.value = { left, top, width: Math.abs(event.point.x - boxStart.x), height: Math.abs(event.point.y - boxStart.y) }
    return
  }
  const original = event.originalEvent
  if (drag) {
    const dx = event.point.x - drag.startPoint.x
    const dy = event.point.y - drag.startPoint.y
    if (!drag.moved && Math.hypot(dx, dy) < 3) return
    drag.moved = true
    const doc = editor.doc!
    const nodeId = drag.nodeId
    const isEnd = doc.waysOfNode(nodeId).some((id) => {
      const nds = doc.way(id).nds
      return nds[0] === nodeId || nds.at(-1) === nodeId
    })
    drag.snap = original.altKey ? null : findSnap(event.lngLat, nodeId, isEnd)
    const position = drag.snap?.position ?? { lat: event.lngLat.lat, lon: event.lngLat.lng }
    moveNode(doc, nodeId, position)
    editor.rev++
    scheduleRender()
    return
  }

  editor.cursor = { lat: event.lngLat.lat, lon: event.lngLat.lng }

  if (editor.tool === 'connector') {
    if (portDragging) portMoved = true
    portCursor = editor.projector!.toXY({ lat: event.lngLat.lat, lon: event.lngLat.lng })
    const port = portAt(event.lngLat)
    const source = editor.connectorFrom
    hoverPort = port && (source ? !port.incoming && port.node === source.node && port.neighbor !== source.neighbor : port.incoming) ? port : null
    map!.getCanvas().style.cursor = hoverPort ? 'pointer' : 'crosshair'
    scheduleOverlay()
    return
  }

  if (editor.tool === 'road') {
    cursorSnap = original.altKey ? null : findSnap(event.lngLat, null, true)
    cursorPosition = cursorSnap?.position ?? constrained(event.lngLat, original.shiftKey)
    leash = editor.drawPoints.length === 0 ? { cursor: editor.projector!.toXY(cursorPosition), target: null } : null
    hover = null
    map!.getCanvas().style.cursor = 'crosshair'
    scheduleOverlay()
    return
  }

  const next = pick(event.lngLat)
  const changed = JSON.stringify(next) !== JSON.stringify(hover)
  hover = next
  const hadLeash = !!leash
  updateLeash(event.lngLat, next)
  if (editor.tool === 'crossing') {
    const cursor = editor.projector!.toXY({ lat: event.lngLat.lat, lon: event.lngLat.lng })
    leash = { cursor, target: editor.crossingStart ? editor.projector!.toXY(editor.crossingStart) : null }
  }
  if (leash || hadLeash) scheduleOverlay()
  const canvas = map!.getCanvas()
  if (editor.tool === 'select' && editor.mode !== 'select') canvas.style.cursor = next ? (next.kind === 'way' ? 'pointer' : 'move') : ''
  else canvas.style.cursor = editor.tool === 'pan' ? 'grab' : 'crosshair'
  if (changed) scheduleOverlay()
}

let overlayFrame = 0
function scheduleOverlay(): void {
  if (overlayFrame) return
  overlayFrame = requestAnimationFrame(() => {
    overlayFrame = 0
    renderOverlay()
  })
}

const PORT_MIN_ZOOM = 17
const LEASH_TOOLS = new Set<string>(['object', 'stopPoint', 'stopArea', 'stopGroup', 'signal', 'sign', 'crossing', 'node', 'bump', 'lineStop'])
const PORT_PICK_PX = 12
let portDragging = false
let portMoved = false
let portCursor: XY | null = null
let hoverPort: LanePort | null = null
/** Поводок вставки: от курсора к месту, куда встанет объект. */
let leash: { cursor: XY; target: XY | null } | null = null

function updateLeash(lngLat: LngLat, hit: Hit | null): void {
  if (!LEASH_TOOLS.has(editor.tool) || editor.viewMode === 'sim') {
    leash = null
    return
  }
  const projector = editor.projector!
  const cursor = projector.toXY({ lat: lngLat.lat, lon: lngLat.lng })
  let target: XY | null = null
  if (hit?.kind === 'way') target = (hit as HitWay).point
  else if (hit?.kind === 'node') {
    const node = editor.doc!.nodes.get(hit.id)
    if (node) target = projector.toXY(node)
  }
  leash = { cursor, target }
}

function portAt(lngLat: LngLat): LanePort | null {
  if (!map || map.getZoom() < PORT_MIN_ZOOM) return null
  const p = editor.projector!.toXY({ lat: lngLat.lat, lon: lngLat.lng })
  let best: LanePort | null = null
  let bestDistance = PORT_PICK_PX * metersPerPixel(lngLat)
  for (const port of editor.connectorPorts) {
    const d = dist(port.point, p)
    if (d < bestDistance) {
      bestDistance = d
      best = port
    }
  }
  return best
}

function finishBox(): void {
  const box = selectionBox.value
  boxStart = null
  selectionBox.value = null
  if (!box || (box.width < MIN_BOX_PX && box.height < MIN_BOX_PX)) return
  suppressClick = true
  setTimeout(() => (suppressClick = false), 0)
  selectInside((node) => {
    const screen = map!.project([node.lon, node.lat])
    return screen.x >= box.left && screen.x <= box.left + box.width && screen.y >= box.top && screen.y <= box.top + box.height
  })
}

function finishCircle(): void {
  const circle = circleDrag!
  circleDrag = null
  scheduleOverlay()
  if (circle.radius < MIN_BOX_PX * metersPerPixel(map!.getCenter())) return
  suppressClick = true
  setTimeout(() => (suppressClick = false), 0)
  const projector = editor.projector!
  selectInside((node) => dist(projector.toXY(node), circle.center) <= circle.radius)
}

function finishPolygon(): void {
  const polygon = editor.selectPolygon
  editor.selectPolygon = []
  polygonCursor = null
  if (polygon.length < 3) {
    editor.toast('Для полигона нужно хотя бы три точки')
    return
  }
  const projector = editor.projector!
  selectInside((node) => pointInPolygon(projector.toXY(node), polygon))
}

/** Отбирает объекты активного типа. Дорога попадает в выделение, если внутри есть хотя бы один её узел. */
function selectInside(inside: (node: LatLon) => boolean): void {
  const doc = editor.doc!
  const items: SelectedItem[] = []
  for (const node of doc.nodes.values()) if (editor.acceptsNode(node.id) && inside(node)) items.push({ kind: 'node', id: node.id })
  for (const way of doc.ways.values()) {
    if (!editor.acceptsWay(way.id)) continue
    if (way.nds.some((nd) => { const node = doc.nodes.get(nd); return !!node && inside(node) })) items.push({ kind: 'way', id: way.id })
  }
  const merged = boxShift ? [...editor.selection, ...items.filter((item) => !editor.selection.some((old) => old.kind === item.kind && old.id === item.id))] : items
  editor.select(merged)
  editor.toast(`Выделено объектов: ${merged.length}`)
}

function onMouseDown(event: MapMouseEvent): void {
  insertMenu.value = null
  coordMenu.value = null
  if (editor.viewMode === 'sim') return
  if (editor.mode === 'select' && event.originalEvent.button === 0) {
    boxShift = event.originalEvent.shiftKey
    event.preventDefault()
    if (editor.selectShape === 'polygon') return
    if (editor.selectShape === 'circle') {
      circleDrag = { center: editor.projector!.toXY({ lat: event.lngLat.lat, lon: event.lngLat.lng }), radius: 0 }
      return
    }
    boxStart = { x: event.point.x, y: event.point.y }
    return
  }
  if (editor.tool === 'connector' && event.originalEvent.button === 0) {
    const port = portAt(event.lngLat)
    if (port?.incoming) {
      editor.startConnectorAtPort(port)
      portDragging = true
      portMoved = false
      portCursor = null
      event.preventDefault()
      scheduleOverlay()
    }
    return
  }
  if (event.originalEvent.button !== 0 || editor.tool !== 'select' || event.originalEvent.shiftKey) return
  const hit = pick(event.lngLat)
  if (!hit || hit.kind === 'way') return

  const doc = editor.doc!
  let nodeId: number
  if (hit.kind === 'mid') {
    doc.begin('Изгиб дороги')
    nodeId = insertNodeOnWay(doc, editor.projector!, hit.wayId, hit.position)
  } else {
    // Узел нельзя тянуть, пока его не выбрали: иначе случайный клик по перекрёстку сдвинет его
    const selected =
      editor.selection.some((item) => item.kind === 'node' && item.id === hit.id) ||
      editor.selectedWays.some((way) => way.nds.includes(hit.id))
    if (!selected) return
    doc.begin('Перемещение узла')
    nodeId = hit.id
  }
  drag = { nodeId, moved: false, startPoint: { x: event.point.x, y: event.point.y }, snap: null }
  event.preventDefault()
}

function onMouseUp(event: MapMouseEvent): void {
  if (circleDrag) {
    finishCircle()
    return
  }
  if (boxStart) {
    finishBox()
    return
  }
  if (portDragging) {
    portDragging = false
    portCursor = null
    suppressClick = true
    setTimeout(() => (suppressClick = false), 0)
    const target = portMoved ? portAt(event.lngLat) : null
    if (target && !target.incoming) editor.finishConnectorAtPort(target)
    scheduleOverlay()
    return
  }
  if (!drag) return
  const finished = drag
  drag = null
  const doc = editor.doc!

  if (!finished.moved) {
    doc.rollback()
    editor.rev++
    scheduleRender()
    return
  }
  suppressClick = true
  setTimeout(() => (suppressClick = false), 0)

  try {
    const snap = doc.node(finished.nodeId).tags?.[TP_TYPE] ? null : finished.snap
    if (snap?.nodeId !== undefined) {
      mergeNodes(doc, snap.nodeId, finished.nodeId)
      editor.selectOne({ kind: 'node', id: snap.nodeId })
      editor.toast('Узлы склеены в перекрёсток', 'success')
    } else if (snap?.wayId !== undefined) {
      const inserted = insertNodeOnWay(doc, editor.projector!, snap.wayId, snap.position)
      mergeNodes(doc, inserted, finished.nodeId)
      editor.selectOne({ kind: 'node', id: inserted })
      editor.toast('Дорога присоединена', 'success')
    }
    doc.commit()
  } catch (error) {
    doc.rollback()
    editor.toast(error instanceof Error ? error.message : String(error), 'error')
  }
  editor.touch()
}

function onClick(event: MapMouseEvent): void {
  if (suppressClick) return
  if (editor.mode === 'select' && editor.selectShape === 'polygon' && editor.viewMode !== 'sim') {
    const point = editor.projector!.toXY({ lat: event.lngLat.lat, lon: event.lngLat.lng })
    const last = editor.selectPolygon.at(-1)
    if (!last || dist(last, point) > MIN_BOX_PX * metersPerPixel(event.lngLat)) editor.selectPolygon = [...editor.selectPolygon, point]
    polygonCursor = point
    return
  }
  const original = event.originalEvent
  // Сигнал в симуляции стоит на стоп-линии, а не в узле: щелчок по нему выбирает весь светофор
  if (editor.viewMode === 'sim' && map?.getLayer('sim-signals')) {
    const { x, y } = event.point
    const signal = map.queryRenderedFeatures([[x - SIGNAL_PICK_PX, y - SIGNAL_PICK_PX], [x + SIGNAL_PICK_PX, y + SIGNAL_PICK_PX]], { layers: ['sim-signals'] })[0]
    const node = signal?.properties?.node as number | undefined
    if (node !== undefined) {
      editor.selectOne({ kind: 'node', id: node })
      return
    }
  }
  const position = { lat: event.lngLat.lat, lon: event.lngLat.lng }
  const hit = pick(event.lngLat)

  switch (editor.tool) {
    case 'delete':
    case 'select': {
      if (hit?.kind === 'mid') return
      const isSim = editor.viewMode === 'sim'
      if (editor.activeObject === 'routes' && !isSim) {
        const { x, y } = event.point
        const route = map!.queryRenderedFeatures([[x - TURN_PICK_PX, y - TURN_PICK_PX], [x + TURN_PICK_PX, y + TURN_PICK_PX]], { layers: ['transit-selected', 'transit-all'] })[0]
        const id = route?.properties?.line as number | undefined
        if (id !== undefined) editor.selectLine(id)
        return
      }
      if (editor.activeObject === 'turns' && !isSim && !editor.objectLocked.turns) {
        const { x, y } = event.point
        const turn = map!.queryRenderedFeatures([[x - TURN_PICK_PX, y - TURN_PICK_PX], [x + TURN_PICK_PX, y + TURN_PICK_PX]], { layers: ['turn-line', 'turn-ribbon'] })[0]
        const props = turn?.properties as { node?: number; from?: number; to?: number } | undefined
        if (props?.node !== undefined && props.from !== undefined && props.to !== undefined) {
          editor.selectTurn(props.node, props.from, props.to)
          return
        }
      }
      // Вершины выбранного отрезка двигают мышью, щелчок по ним не должен менять выбор
      if (hit?.kind === 'node' && editor.activeObject === 'links' && !isSim) return
      const accepted = hit && (isSim || (hit.kind === 'node' ? editor.acceptsNode(hit.id) : editor.acceptsWay(hit.id)))
      if (!accepted) {
        if (!original.shiftKey) editor.select([])
      } else {
        const item = hit.kind === 'node' ? { kind: 'node' as const, id: hit.id } : { kind: 'way' as const, id: (hit as HitWay).id }
        if (original.shiftKey) editor.toggleSelect(item)
        else editor.selectOne(item)
        if (hit.kind === 'way' && !isSim) {
          if (map!.getZoom() >= LANE_LINE_ZOOM) editor.pickLane(hit.id, editor.projector!.toXY(position))
          else editor.selectedLane = null
        }
      }
      break
    }
    case 'object':
      if (hit?.kind === 'way') editor.placeNetObject(hit.id, editor.projector!.toLatLon(hit.point))
      break
    case 'stopPoint':
      if (hit?.kind === 'way') editor.addStopPoint(hit.id, editor.projector!.toLatLon(hit.point))
      break
    case 'stopArea':
      editor.addStopArea(position)
      break
    case 'stopGroup':
      if (hit?.kind === 'node' && editor.acceptsNode(hit.id)) editor.addStopFromNode(hit.id)
      else editor.toast('Щёлкните по пункту или зоне остановки')
      break
    case 'node':
      if (hit?.kind === 'way') editor.addNodeOnWay(hit.id, editor.projector!.toLatLon(hit.point))
      else if (hit?.kind === 'node') editor.selectOne({ kind: 'node', id: hit.id })
      else editor.addFreeNode(position)
      break
    case 'road':
      addDrawPoint(event)
      break
    case 'split':
      if (hit?.kind === 'node') editor.splitAtNode(hit.id)
      else if (hit?.kind === 'way') editor.splitAtPosition(hit.id, editor.projector!.toLatLon(hit.point))
      break
    case 'crossing':
      if (editor.crossingStart) editor.finishCrossing(position)
      else if (hit?.kind === 'node' && editor.doc!.node(hit.id).tags?.highway === 'crossing') editor.toggleOnNode('crossing', { nodeId: hit.id, position })
      else editor.crossingStart = position
      scheduleOverlay()
      break
    case 'signal':
      if (hit?.kind === 'node') editor.toggleOnNode(editor.tool, { nodeId: hit.id, position })
      else if (hit?.kind === 'way') {
        editor.toggleOnNode(editor.tool, { wayId: hit.id, position: editor.projector!.toLatLon(hit.point) })
      }
      break
    case 'bridge':
    case 'tunnel':
      if (hit?.kind === 'way') editor.toggleWayStructure(hit.id, editor.tool)
      break
    case 'speed':
      if (hit?.kind === 'way') editor.pickSpeedPoint(hit.id, editor.projector!.toLatLon(hit.point))
      else if (hit?.kind === 'node') {
        const wayId = editor.speedStart?.wayId ?? editor.doc!.waysOfNode(hit.id)[0]
        if (wayId !== undefined) editor.pickSpeedPoint(wayId, position)
      }
      scheduleOverlay()
      break
    case 'connector': {
      const port = portAt(event.lngLat)
      if (port) editor.finishConnectorAtPort(port)
      else if (editor.connectorFrom?.port) editor.connectorFrom = null
      else editor.pickConnectorLane(editor.projector!.toXY(position))
      scheduleOverlay()
      break
    }
    case 'bump':
    case 'sign': {
      const place = editor.tool === 'bump' ? editor.placeBump : editor.placeSign
      if (hit?.kind === 'node') place({ nodeId: hit.id, position })
      else if (hit?.kind === 'way') place({ wayId: hit.id, position: editor.projector!.toLatLon(hit.point) })
      break
    }
    case 'lineWay':
      if (hit?.kind === 'way') editor.appendWayToLine(hit.id)
      break
    case 'lineStop':
      if (hit?.kind === 'node') editor.addNodeToLineAsStop(hit.id)
      else if (hit?.kind === 'way') editor.addStopOnWay(hit.id, editor.projector!.toLatLon(hit.point))
      break
  }
}

function addDrawPoint(event: MapMouseEvent): void {
  const original = event.originalEvent
  const snap = original.altKey ? null : findSnap(event.lngLat, null, true)
  const position = snap?.position ?? constrained(event.lngLat, original.shiftKey)
  const point: DrawPoint = { ...position, nodeId: snap?.nodeId, wayId: snap?.wayId }
  const last = editor.drawPoints.at(-1)
  if (last) {
    // Второй клик двойного щелчка попадает почти в ту же точку: она не нужна
    const previous = map!.project([last.lon, last.lat])
    if (Math.hypot(previous.x - event.point.x, previous.y - event.point.y) < MIN_DRAW_STEP_PX) return
  }
  editor.drawPoints = [...editor.drawPoints, point]
  if (editor.drawMode === 'straight' && editor.drawPoints.length === 2) editor.finishRoad()
  scheduleOverlay()
}

function onDoubleClick(event: MapMouseEvent): void {
  if (editor.mode === 'select' && editor.selectShape === 'polygon' && editor.selectPolygon.length > 0) {
    event.preventDefault()
    finishPolygon()
    return
  }
  if (editor.tool === 'delete') {
    event.preventDefault()
    const hit = pick(event.lngLat)
    const doc = editor.doc!
    if (hit?.kind === 'node' && editor.acceptsNode(hit.id)) {
      editor.requestDelete([{ kind: 'node', id: hit.id }], doc.node(hit.id).tags?.name ?? `Узел ${hit.id}`)
    } else if (hit?.kind === 'way' && editor.acceptsWay(hit.id)) {
      editor.requestDelete([{ kind: 'way', id: hit.id }], doc.way(hit.id).tags?.name ?? `Отрезок ${hit.id}`)
    }
    return
  }
  if (editor.tool === 'road') {
    event.preventDefault()
    editor.finishRoad()
    scheduleOverlay()
    return
  }
  // Двойной щелчок по узлу открывает редактор узла
  if (editor.tool === 'select') {
    const hit = pick(event.lngLat)
    if (hit?.kind === 'node' && editor.doc!.waysOfNode(hit.id).length >= 2) {
      event.preventDefault()
      editor.openJunction(hit.id)
    }
  }
}

function applyView(): void {
  if (!ready || !map) return
  const m = map
  const visible = (ids: string[], show: boolean) => {
    for (const id of ids) m.setLayoutProperty(id, 'visibility', show ? 'visible' : 'none')
  }
  const mode = editor.viewMode
  const isSim = mode === 'sim'
  const lane = mode !== 'graph'
  const threeD = mode === '3d' || (isSim && sim.camera3d)
  visible(ENGINEERING_LAYERS, lane && !editor.objectHidden.links)
  visible(GRAPH_LAYERS, mode === 'graph')
  // В симуляции траектории поворотов только мешали бы видеть машины и пробки
  visible(TURN_LAYERS, lane && !isSim && editor.layers.turnPaths && !editor.objectHidden.turns)
  visible(SIM_LAYERS, false)
  const macro = isSim && sim.level === 'macro'
  const micro = isSim && sim.level === 'micro'
  visible(['sim-load'], isSim && sim.showLoad && (micro || sim.macroView === 'fill'))
  visible(['sim-bars', 'sim-bar-labels'], macro && sim.macroView === 'bars')
  visible(['sim-od', 'sim-zones'], macro && sim.showDesire)
  visible(['sim-jams', 'sim-signals'], micro)
  visible(['arrows'], lane && editor.layers.arrows && !editor.objectHidden.links)
  visible(['node-dots'], lane && !isSim && !editor.objectHidden.nodes)
  // Полосы и разметка показываются по очереди, иначе на дороге лежат два слоя линий
  const marks = editor.layers.markings
  const roads = lane && !editor.objectHidden.links
  visible(['lane-line', 'lane-arrow'], roads && !marks)
  visible(TURN_LAYERS, lane && !isSim && editor.layers.turnPaths && !editor.objectHidden.turns && !marks)
  visible(['marking-stop', 'marking-zigzag'], roads && marks)
  const markTop = marks ? 24 : LANE_LINE_ZOOM
  m.setLayerZoomRange('markings-edge', 15, markTop)
  m.setLayerZoomRange('markings-divider', 15, markTop)
  m.setLayerZoomRange('markings-lane', 16, markTop)
  m.setLayerZoomRange('markings-lane-solid', 15.5, markTop)
  visible(['net-stop-point'], !isSim && !editor.objectHidden.stopPoints)
  visible(['net-stop-area', 'net-stop-link'], !isSim && !editor.objectHidden.stopAreas)
  visible(['net-stop'], !isSim && !editor.objectHidden.stops)
  visible(['crossings'], lane && editor.layers.crossings)
  visible(['signals'], editor.layers.signals)
  visible(['traffic-signs'], editor.layers.trafficSigns)
  visible(['zone-area', 'zone-outline', 'zone-link', 'zone-label'], editor.layers.zones)
  visible(['labels'], lane && editor.layers.labels)
  visible(['minor'], editor.layers.minor)
  visible(['rail'], editor.layers.rail)
  visible(['other'], editor.layers.other)
  visible(['points'], editor.layers.points)
  visible(['landuse', 'water-fill', 'water-line'], editor.layers.landuse)
  visible(['buildings'], editor.layers.buildings && !threeD)
  visible(['buildings-3d'], editor.layers.buildings && threeD)
  visible(['road-3d'], threeD)
  visible(['issues', 'issues-focus'], editor.layers.issues && !isSim)
  wayCacheRev = -1
}

const BASEMAP_LAYERS = ['basemap', 'basemap-2']

function applyBasemap(): void {
  if (!ready || !map) return
  const m = map
  for (const id of BASEMAP_LAYERS) {
    if (m.getLayer(id)) m.removeLayer(id)
    if (m.getSource(id)) m.removeSource(id)
  }
  basemapSource(editor.basemap, editor.customTileUrl).forEach((spec, index) => {
    const id = BASEMAP_LAYERS[index]!
    m.addSource(id, spec)
    m.addLayer(
      {
        id,
        type: 'raster',
        source: id,
        paint: {
          'raster-opacity': editor.basemapOpacity,
          // Плавное масштабирование и короткое появление: без мыла и без мигания при панорамировании
          'raster-resampling': 'linear',
          'raster-fade-duration': 120,
        },
      },
      'landuse',
    )
  })
  applyModelOpacity()
}

const OPACITY_PROPERTY: Record<string, string> = {
  fill: 'fill-opacity',
  line: 'line-opacity',
  symbol: 'icon-opacity',
  circle: 'circle-opacity',
}
const baseOpacity = new Map<string, unknown>()

/** Умножает прозрачность слоя с учётом того, что она бывает задана выражением по масштабу. */
function scaleOpacity(base: unknown, factor: number): unknown {
  if (base === undefined || base === null) return factor
  if (typeof base === 'number') return base * factor
  if (Array.isArray(base) && base[0] === 'interpolate') {
    return base.map((value, index) => (index >= 3 && (index - 3) % 2 === 1 && typeof value === 'number' ? value * factor : value))
  }
  return ['*', factor, base]
}

function applyModelOpacity(): void {
  if (!ready || !map) return
  for (const id of MODEL_LAYERS) {
    const layer = map.getLayer(id)
    if (!layer) continue
    const property = OPACITY_PROPERTY[layer.type]
    if (!property) continue
    if (!baseOpacity.has(id)) baseOpacity.set(id, map.getPaintProperty(id, property as never))
    map.setPaintProperty(id, property as never, scaleOpacity(baseOpacity.get(id), editor.modelOpacity) as never)
    if (layer.type === 'circle') map.setPaintProperty(id, 'circle-stroke-opacity', editor.modelOpacity)
  }
}

/** Транспортные районы: граница застройки, подпись и связь с точкой подключения к улице. */
function renderZones(): void {
  if (!ready || !map || !editor.projector) return
  const m = map
  const projector = editor.projector
  const zones = (sim.macro?.zones ?? []).filter((zone) => zone.outline && zone.outline.length >= 3 && zone.center)
  const biggest = Math.max(1, ...zones.map((zone) => zone.production + zone.attraction))
  const share = (zone: (typeof zones)[number]) => (zone.production + zone.attraction) / biggest
  setData('zoneAreas', {
    type: 'FeatureCollection',
    features: zones.map((zone) => {
      const ring = zone.outline!.map((point) => projector.toLngLat(point))
      return { type: 'Feature', properties: { share: share(zone) }, geometry: { type: 'Polygon', coordinates: [[...ring, ring[0]!]] } }
    }),
  })
  setData('zoneLabels', {
    type: 'FeatureCollection',
    features: zones.map((zone) => ({
      type: 'Feature',
      properties: { image: ensureLabelImage(m, zone.label.replace('Район ', 'ТР-'), editor.theme) },
      geometry: { type: 'Point', coordinates: projector.toLngLat(zone.center!) },
    })),
  })
  setData('zoneLinks', {
    type: 'FeatureCollection',
    features: zones.map((zone) => ({
      type: 'Feature',
      properties: {},
      geometry: { type: 'LineString', coordinates: [projector.toLngLat(zone.center!), projector.toLngLat(zone.position)] },
    })),
  })
}

let cornerMarkers: Marker[] = []

function applyImageUnderlay(): void {
  if (!ready || !map) return
  const m = map
  const image = editor.imageUnderlay
  if (!image) {
    if (m.getLayer('image-underlay')) m.removeLayer('image-underlay')
    if (m.getSource('image-underlay')) m.removeSource('image-underlay')
    cornerMarkers.forEach((marker) => marker.remove())
    cornerMarkers = []
    return
  }
  const source = m.getSource('image-underlay') as ImageSource | undefined
  if (source) {
    source.setCoordinates(image.corners)
  } else {
    m.addSource('image-underlay', { type: 'image', url: image.url, coordinates: image.corners })
    m.addLayer({ id: 'image-underlay', type: 'raster', source: 'image-underlay', paint: { 'raster-fade-duration': 0 } }, 'landuse')
  }
  if (cornerMarkers.length === 0) {
    cornerMarkers = image.corners.map((corner, index) => {
      const marker = new Marker({ draggable: true, color: '#f43f5e', scale: 0.7 }).setLngLat(corner).addTo(m)
      marker.on('drag', () => {
        const position = marker.getLngLat()
        editor.moveImageCorner(index, [position.lng, position.lat])
      })
      return marker
    })
  }
}

function publishCamera(): void {
  if (!map) return
  const center = map.getCenter()
  editor.camera = {
    center: [center.lng, center.lat],
    zoom: map.getZoom(),
    bearing: map.getBearing(),
    pitch: map.getPitch(),
  }
}

let carLayer: CarLayer | null = null
let carLayerTop: CarLayer | null = null
let simFrame = 0
let lastFrameTime = 0
let lastSignalsAt = 0

/** Контуры направлений задаются один раз на сеть: потом меняется только цвет. */
function applySimNet(): void {
  if (!ready || !map) return
  const net = sim.net
  const projector = editor.projector
  if (!net || !projector) {
    setData('simLoad', { type: 'FeatureCollection', features: [] })
    return
  }
  const features: Feature[] = []
  for (const edge of net.edges) {
    if (edge.outline.length < 3) continue
    const ring = edge.outline.map((point) => projector.toLngLat(point))
    ring.push(ring[0]!)
    features.push({
      type: 'Feature',
      properties: { id: edge.id, wayId: edge.wayId },
      geometry: { type: 'Polygon', coordinates: [ring] },
    })
  }
  setData('simLoad', { type: 'FeatureCollection', features })
  const bars: Feature[] = []
  for (const edge of net.edges) {
    const lane = edge.lanes[Math.floor(edge.lanes.length / 2)]
    if (!lane) continue
    bars.push({
      type: 'Feature',
      properties: { id: edge.id, wayId: edge.wayId },
      geometry: { type: 'LineString', coordinates: lane.points.map((point) => projector.toLngLat(point)) },
    })
  }
  setData('simBars', { type: 'FeatureCollection', features: bars })
  applyLoadColors()
}

/** Подписи объёмов и линии желания: как столбики в Visum, только на самых нагруженных участках. */
function applyMacroOverlays(): void {
  const macro = sim.macro
  const projector = editor.projector
  if (!ready || !map || !macro || !projector) return
  const top = [...macro.loads.values()]
    .filter((load) => load.volume + load.transitPcu >= BAR_LABEL_MIN)
    .sort((a, b) => b.volume + b.transitPcu - a.volume - a.transitPcu)
    .slice(0, BAR_LABEL_COUNT)
  setData('simBarLabels', {
    type: 'FeatureCollection',
    features: top.map((load) => {
      const lane = load.edge.lanes[0]!
      const middle = lane.points[Math.floor(lane.points.length / 2)]!
      const value = Math.round((load.volume + load.transitPcu) / 10) * 10
      return {
        type: 'Feature',
        properties: { image: ensureLabelImage(map!, String(value), editor.theme) },
        geometry: { type: 'Point', coordinates: projector.toLngLat(middle) },
      }
    }),
  })
  const flows = [...macro.flows].sort((a, b) => b.trips - a.trips).slice(0, OD_LINES)
  const biggest = flows[0]?.trips ?? 1
  setData('simOd', {
    type: 'FeatureCollection',
    features: flows.map((flow) => ({
      type: 'Feature',
      properties: { width: 0.6 + (flow.trips / biggest) * 8 },
      geometry: {
        type: 'LineString',
        coordinates: [projector.toLngLat(flow.from.position), projector.toLngLat(flow.to.position)],
      },
    })),
  })
  setData('simZones', {
    type: 'FeatureCollection',
    features: macro.zones.map((zone) => ({
      type: 'Feature',
      properties: { kind: zone.kind, radius: 3 + Math.sqrt(zone.production + zone.attraction) / 5 },
      geometry: { type: 'Point', coordinates: projector.toLngLat(zone.position) },
    })),
  })
}

function applyLoadColors(): void {
  if (!ready || !map) return
  const m = map
  const net = sim.net
  if (!net || !m.getSource('simLoad')) return
  if (sim.level === 'macro') {
    const loads = sim.macro?.loads
    if (!loads) return
    for (const edge of net.edges) {
      const load = loads.get(edge)
      m.setFeatureState({ source: 'simLoad', id: edge.id }, { los: load ? load.los : -1 })
      if (m.getSource('simBars')) {
        const total = load ? load.volume + load.transitPcu : 0
        m.setFeatureState(
          { source: 'simBars', id: edge.id },
          { los: load ? load.los : -1, w: Math.min(BAR_MAX_PX, total / BAR_VEHICLES_PER_PX) },
        )
      }
    }
    applyMacroOverlays()
  } else {
    for (const edge of net.edges) {
      const hasTraffic = edge.carCount > 0 || edge.speedRatio < 0.95
      m.setFeatureState({ source: 'simLoad', id: edge.id }, { los: hasTraffic ? losFromSpeedRatio(edge.speedRatio) : -1 })
    }
  }
}

function applyJams(): void {
  const projector = editor.projector
  if (!ready || !projector) return
  const jams = sim.level === 'micro' ? (sim.stats?.jams ?? []) : []
  setData('simJams', {
    type: 'FeatureCollection',
    features: jams.map((jam) => ({
      type: 'Feature',
      properties: { cars: jam.cars },
      geometry: { type: 'Point', coordinates: projector.toLngLat(jam.point) },
    })),
  })
}

function applySignals(time: number): void {
  const projector = editor.projector
  const net = sim.net
  if (!ready || !projector || !net) return
  const features: Feature[] = []
  for (const group of net.signals) {
    for (const stop of group.stops) {
      features.push({
        type: 'Feature',
        properties: { state: signalState(stop.connector, time), node: group.owner },
        geometry: { type: 'Point', coordinates: projector.toLngLat(stop) },
      })
    }
  }
  setData('simSignals', { type: 'FeatureCollection', features })
}

/** Отдельный цикл кадров: симуляция идёт даже тогда, когда карта сама не перерисовывается. */
function simLoop(now: number): void {
  simFrame = requestAnimationFrame(simLoop)
  const seconds = lastFrameTime ? (now - lastFrameTime) / 1000 : 0
  lastFrameTime = now
  if (!map || !carLayer || editor.viewMode !== 'sim' || sim.level !== 'micro') return
  const micro = sim.micro
  if (!micro) return
  sim.frame(seconds)
  carLayer.cars = micro.cars
  if (carLayerTop) carLayerTop.cars = micro.cars
  carLayer.alpha = sim.alpha
  if (carLayerTop) carLayerTop.alpha = sim.alpha
  carLayer.colorMode = sim.colorMode
  if (carLayerTop) carLayerTop.colorMode = sim.colorMode
  if (sim.running) {
    map.triggerRepaint()
    if (now - lastSignalsAt > 400) {
      lastSignalsAt = now
      applySignals(micro.time)
    }
  }
}

function syncCars(): void {
  if (!carLayer) return
  const showCars = editor.viewMode === 'sim' && sim.level === 'micro'
  carLayer.cars = showCars ? (sim.micro?.cars ?? []) : []
  if (carLayerTop) carLayerTop.cars = showCars ? (sim.micro?.cars ?? []) : []
  map?.triggerRepaint()
}

function applyCamera(): void {
  if (!map) return
  const threeD = editor.viewMode === '3d' || (editor.viewMode === 'sim' && sim.camera3d)
  map.easeTo({ pitch: threeD ? 58 : 0, bearing: threeD ? -20 : 0, duration: 700 })
}

function fitToBounds(): void {
  const b = editor.doc?.bounds
  if (!b || !map) return
  map.fitBounds(
    [
      [b.minlon, b.minlat],
      [b.maxlon, b.maxlat],
    ],
    { padding: 60, duration: 0 },
  )
}

onMounted(() => {
  const doc = editor.doc!
  const center: [number, number] = [
    (doc.bounds.minlon + doc.bounds.maxlon) / 2,
    (doc.bounds.minlat + doc.bounds.maxlat) / 2,
  ]
  const instance = new MlMap({
    container: container.value!,
    center,
    zoom: 15,
    maxZoom: 22,
    attributionControl: { compact: true, customAttribution: 'Данные © OpenStreetMap' },
    style: {
      version: 8,
      sources: emptySources(),
      layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#f4f3ee' } }],
    },
  })
  map = instance
  if (import.meta.env.DEV) (window as unknown as { __map: MlMap }).__map = instance
  instance.doubleClickZoom.disable()
  // Левая кнопка двигает карту, а правка и выделение отменяют это для своего жеста. Зажатое колёсико работает всегда
  let wheelPan: { x: number; y: number } | null = null
  const canvasContainer = instance.getCanvasContainer()
  canvasContainer.addEventListener('mousedown', (event) => {
    if (event.button !== 1) return
    event.preventDefault()
    wheelPan = { x: event.clientX, y: event.clientY }
    instance.getCanvas().style.cursor = 'grabbing'
  })
  const onWheelPanMove = (event: MouseEvent): void => {
    if (!wheelPan) return
    instance.panBy([wheelPan.x - event.clientX, wheelPan.y - event.clientY], { animate: false })
    wheelPan = { x: event.clientX, y: event.clientY }
  }
  const onWheelPanEnd = (event: MouseEvent): void => {
    if (event.button !== 1 || !wheelPan) return
    wheelPan = null
    instance.getCanvas().style.cursor = ''
  }
  window.addEventListener('mousemove', onWheelPanMove)
  window.addEventListener('mouseup', onWheelPanEnd)
  instance.once('remove', () => {
    window.removeEventListener('mousemove', onWheelPanMove)
    window.removeEventListener('mouseup', onWheelPanEnd)
  })
  instance.addControl(new NavigationControl({ visualizePitch: true }), 'top-right')
  instance.addControl(new ScaleControl({ unit: 'metric', maxWidth: 140 }), 'bottom-left')

  instance.on('load', () => {
    registerIcons(instance)
    for (const layer of buildLayers(center[1])) instance.addLayer(layer)
    ready = true
    carLayer = new CarLayer(editor.projector!, 'cars', (car) => car.z < BRIDGE_CAR_Z_M)
    carLayerTop = new CarLayer(editor.projector!, 'cars-top', (car) => car.z >= BRIDGE_CAR_Z_M)
    carLayer.limitOf = (car) => {
      const edge = car.route[car.routeIndex]
      return edge ? parseSpeed(edge.tags.maxspeed, edge.tags.highway ?? 'road') / 3.6 : 14
    }
    carLayerTop.limitOf = carLayer.limitOf
    instance.addLayer(carLayer, 'bridge-casing')
    instance.addLayer(carLayerTop, 'buildings-3d')
    backdrop = buildStaticScene(doc)
    applyStatic()
    applyView()
    applyTheme()
    applyBasemap()
    fitToBounds()
    renderScene()
    renderTransit()
    renderIssues()
    renderOverlay()
    publishCamera()
    applyImageUnderlay()
    if (editor.viewMode === 'sim') {
      applySimNet()
      syncCars()
    }
  })

  simFrame = requestAnimationFrame(simLoop)
  resizeObserver = new ResizeObserver(() => instance.resize())
  resizeObserver.observe(container.value!)

  instance.on('mousemove', onMouseMove)
  instance.on('mousedown', onMouseDown)
  instance.on('mouseup', onMouseUp)
  instance.on('moveend', () => {
    if (editor.tool === 'connector') scheduleOverlay()
  })
  instance.on('click', onClick)
  instance.on('contextmenu', (event) => {
    if (editor.mode === 'select' && editor.selectPolygon.length > 0) {
      event.preventDefault()
      finishPolygon()
      return
    }
    const inserting = editor.drawPoints.length > 0 || !!editor.crossingStart || !!editor.connectorFrom || !!editor.speedStart
    insertMenu.value = inserting ? { x: event.point.x, y: event.point.y } : null
    coordMenu.value = editor.tool === 'pan' ? { x: event.point.x, y: event.point.y, lat: event.lngLat.lat, lon: event.lngLat.lng } : null
    if (inserting || coordMenu.value) event.preventDefault()
  })
  instance.on('dblclick', onDoubleClick)
  instance.on('zoom', () => (editor.zoom = instance.getZoom()))
  instance.on('move', () => {
    if (editor.tool === 'road') scheduleOverlay()
    publishCamera()
  })
  instance.on('mouseout', () => {
    if (hover) {
      hover = null
      scheduleOverlay()
    }
  })
})

onBeforeUnmount(() => {
  cancelAnimationFrame(frame)
  cancelAnimationFrame(overlayFrame)
  cancelAnimationFrame(simFrame)
  resizeObserver?.disconnect()
  cornerMarkers.forEach((marker) => marker.remove())
  cornerMarkers = []
  carLayer = null
  carLayerTop = null
  map?.remove()
  map = null
  ready = false
})

watch(() => editor.rev, () => {
  scheduleRender()
  renderTransit()
})
watch(() => editor.theme, applyTheme)
watch(() => editor.fitRev, fitToBounds)
watch(() => editor.hidden, () => {
  wayCacheRev = -1
  applyStatic()
  scheduleRender()
})
watch(() => [editor.selectedLineId, editor.layers.transit], renderTransit)
watch(() => editor.selection, scheduleOverlay)
watch(() => editor.proposalTargets, scheduleOverlay)
watch(() => [editor.issues, editor.focusedIssue], renderIssues)
watch(() => editor.drawPoints, scheduleOverlay)
watch(() => ({ ...editor.layers }), applyView)
watch(() => editor.connectorFrom, () => {
  if (!editor.connectorFrom) hoverPort = null
  scheduleOverlay()
})
watch(() => editor.tool, () => {
  hover = null
  cursorSnap = null
  cursorPosition = null
  leash = null
  portCursor = null
  hoverPort = null
  if (map) map.getCanvas().style.cursor = editor.tool === 'select' ? '' : editor.tool === 'pan' ? 'grab' : 'crosshair'
  scheduleOverlay()
})
watch(() => [editor.basemap, editor.customTileUrl], applyBasemap)
watch(() => editor.basemapOpacity, (value) => {
  for (const id of BASEMAP_LAYERS) if (map?.getLayer(id)) map.setPaintProperty(id, 'raster-opacity', value)
})
watch(() => editor.modelOpacity, applyModelOpacity)
watch(() => editor.imageUnderlay, applyImageUnderlay)
watch(() => editor.cameraRequest, (state) => {
  if (state && map) map.jumpTo({ center: state.center, zoom: state.zoom, bearing: state.bearing, pitch: state.pitch })
})
watch(() => editor.viewMode, () => {
  applyView()
  scheduleOverlay()
  applyCamera()
  syncCars()
})
watch(() => sim.net, applySimNet)
watch(() => sim.macro, applyLoadColors)
watch(() => [sim.macro, editor.layers.zones, editor.theme], renderZones)
watch(() => editor.tool, () => scheduleOverlay())
watch(() => sim.loadRev, () => {
  applyLoadColors()
  applyJams()
})
watch(() => [sim.level, sim.showLoad, sim.macroView, sim.showDesire], () => {
  applyView()
  applyLoadColors()
  applyJams()
  syncCars()
})
watch(() => sim.camera3d, () => {
  applyView()
  applyCamera()
})
watch(() => sim.micro, () => {
  syncCars()
  applyLoadColors()
})
function renderTraffic(): void {
  if (!ready || !map) return
  const lanes = traffic.result?.lanes ?? []
  setData('trafficLoad', {
    type: 'FeatureCollection',
    features: lanes.map((lane) => ({
      type: 'Feature',
      properties: { way: lane.way, flow: lane.flow, ratio: Math.min(1, lane.flow / laneCapacity(lane.speedLimit)) },
      geometry: { type: 'LineString', coordinates: lane.shape },
    })),
  })
  map.setLayoutProperty('traffic-lane', 'visibility', traffic.visible && lanes.length > 0 ? 'visible' : 'none')
}

watch(() => [traffic.result, traffic.visible], renderTraffic)
watch(() => editor.selectedLane, () => scheduleOverlay())
watch(() => editor.selectPolygon, () => scheduleOverlay())
watch(() => editor.turnPreview, () => scheduleOverlay())
watch(() => ({ ...editor.objectHidden }), () => {
  applyView()
  scheduleOverlay()
})
watch(() => editor.mode, (mode) => {
  if (!map) return
  map.getCanvas().style.cursor = mode === 'select' || editor.tool !== 'select' ? 'crosshair' : ''
  if (mode === 'select') map.boxZoom.disable()
  else map.boxZoom.enable()
})
watch(() => editor.focusRequest, (request) => {
  if (!request || !map) return
  map.easeTo({
    center: [request.position.lon, request.position.lat] as [number, number],
    zoom: Math.max(map.getZoom(), request.zoom ?? 18),
    duration: 500,
  })
})

defineExpose({ fitToBounds })
</script>

<template>
  <div class="map-wrap">
    <div ref="container" class="map" />
    <CoordMenu v-if="coordMenu" v-bind="coordMenu" @close="coordMenu = null" />
    <div v-if="insertMenu" class="insert-menu" role="menu" :style="{ left: `${insertMenu.x}px`, top: `${insertMenu.y}px` }">
      <button v-if="editor.drawPoints.length > 1" role="menuitem" @click="editor.undoDrawPoint(); insertMenu = null">Отменить последнее действие</button>
      <button v-if="editor.drawPoints.length > 1" role="menuitem" @click="editor.finishRoad(); insertMenu = null">Завершить отрезок</button>
      <button role="menuitem" @click="editor.cancelInsert(); insertMenu = null">Отменить вставку полностью</button>
    </div>
    <div
      v-if="selectionBox"
      class="selection-box"
      :style="{ left: `${selectionBox.left}px`, top: `${selectionBox.top}px`, width: `${selectionBox.width}px`, height: `${selectionBox.height}px` }"
    />
    <div
      v-for="(label, index) in hud"
      :key="index"
      class="hud-label"
      :style="{ left: `${label.x}px`, top: `${label.y}px` }"
    >
      {{ label.text }}
    </div>
  </div>
</template>

<style scoped>
.map-wrap,
.map {
  position: absolute;
  inset: 0;
}
.insert-menu {
  position: absolute;
  z-index: 20;
  display: flex;
  flex-direction: column;
  min-width: 210px;
  padding: 3px;
  background: var(--panel);
  border: 1px solid var(--line-strong);
  border-radius: var(--radius-sm);
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.3);
}
.insert-menu button {
  padding: 4px 8px;
  background: transparent;
  border: 0;
  text-align: left;
}
.insert-menu button:hover {
  background: var(--row-hover);
}
.selection-box {
  position: absolute;
  background: rgba(56, 189, 248, 0.14);
  border: 1px dashed var(--accent);
  pointer-events: none;
}
.hud-label {
  position: absolute;
  transform: translate(-50%, -50%);
  padding: 2px 7px;
  border-radius: 5px;
  background: var(--panel-solid);
  border: 1px solid var(--accent);
  color: var(--text);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  pointer-events: none;
}
</style>
