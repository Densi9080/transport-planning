<script setup lang="ts">
import {
  type GeoJSONSource,
  type ImageSource,
  type LngLat,
  Map as MlMap,
  type MapMouseEvent,
  Marker,
  NavigationControl,
  setWorkerUrl,
} from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import mapWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url'
import type { Feature, FeatureCollection } from 'geojson'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { bearing, dist, nearestOnSegment, offsetPolyline, polylineLength, sub, unit } from '@/core/geo'
import { isDrivable, parseProfile, totalWidth } from '@/core/lanes'
import { insertNodeOnWay, mergeNodes, moveNode } from '@/core/ops'
import { buildScene, buildStaticScene } from '@/core/scene'
import type { LatLon, XY } from '@/core/types'
import { ensureLabelImage, registerIcons } from '@/map/icons'
import { CarLayer } from '@/map/carLayer'
import {
  basemapSource,
  buildLayers,
  emptySources,
  ENGINEERING_LAYERS,
  GRAPH_LAYERS,
  MODEL_FILL_LAYERS,
  SIM_LAYERS,
  TURN_LAYERS,
} from '@/map/style'
import { parseSpeed } from '@/sim/macro'
import { losFromSpeedRatio } from '@/sim/micro'
import { signalState } from '@/sim/net'
import { type DrawPoint, useEditor } from '@/stores/editor'
import { useSimulation } from '@/stores/simulation'

// Сам MapLibre ищет воркер рядом со своим модулем, а после сборки его там нет
setWorkerUrl(mapWorkerUrl)

const NODE_PICK_PX = 11
const SEGMENT_PICK_PX = 7
const SNAP_PX = 13
const ANGLE_STEP_DEG = 15
const MIN_DRAW_STEP_PX = 5

const editor = useEditor()
const sim = useSimulation()
const container = ref<HTMLDivElement | null>(null)
const hud = ref<{ x: number; y: number; text: string }[]>([])

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

function pickableNode(id: number): boolean {
  const doc = editor.doc!
  if (editor.selection.some((item) => item.kind === 'node' && item.id === id)) return true
  const node = doc.nodes.get(id)
  if (node?.tags?.highway) return true
  if (editor.viewMode === 'graph') return true
  return doc.waysOfNode(id).length > 1
}

function pick(lngLat: LngLat): Hit | null {
  const projector = editor.projector
  if (!projector || !editor.doc) return null
  refreshWayCache()
  const p = projector.toXY({ lat: lngLat.lat, lon: lngLat.lng })
  const mpp = metersPerPixel(lngLat)

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
  if (bestHandle) return bestHandle

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
  if (nodeHit) return nodeHit

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

function renderScene(): void {
  if (!ready || !editor.doc || !editor.projector || !map) return
  const { scene } = buildScene(editor.doc, editor.projector)
  for (const feature of scene.labels.features) {
    const name = feature.properties?.name as string
    feature.properties = { ...feature.properties, image: ensureLabelImage(map, name) }
  }
  for (const [key, value] of Object.entries(scene)) setData(key, value)
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
  for (const node of editor.selectedNodes) features.push(pointOf(node, { role: 'node-selected' }))

  const snap = drag?.snap ?? cursorSnap
  if (snap) features.push(pointOf(snap.position, { role: 'snap' }))

  if (editor.tool === 'road') renderDrawPreview(features)
  else hud.value = []

  setData('overlay', { type: 'FeatureCollection', features })
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

  if (editor.tool === 'road') {
    cursorSnap = original.altKey ? null : findSnap(event.lngLat, null, true)
    cursorPosition = cursorSnap?.position ?? constrained(event.lngLat, original.shiftKey)
    hover = null
    map!.getCanvas().style.cursor = 'crosshair'
    scheduleOverlay()
    return
  }

  const next = pick(event.lngLat)
  const changed = JSON.stringify(next) !== JSON.stringify(hover)
  hover = next
  const canvas = map!.getCanvas()
  if (editor.tool === 'select') canvas.style.cursor = next ? (next.kind === 'way' ? 'pointer' : 'move') : ''
  else canvas.style.cursor = 'crosshair'
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

function onMouseDown(event: MapMouseEvent): void {
  if (editor.viewMode === 'sim') return
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
  map!.dragPan.disable()
  event.preventDefault()
}

function onMouseUp(): void {
  if (!drag) return
  const finished = drag
  drag = null
  map!.dragPan.enable()
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
    const snap = finished.snap
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
  const original = event.originalEvent
  const position = { lat: event.lngLat.lat, lon: event.lngLat.lng }
  const hit = pick(event.lngLat)

  switch (editor.tool) {
    case 'select':
      if (hit?.kind === 'mid') return
      if (!hit) {
        if (!original.shiftKey) editor.select([])
      } else {
        const item = hit.kind === 'node' ? { kind: 'node' as const, id: hit.id } : { kind: 'way' as const, id: (hit as HitWay).id }
        if (original.shiftKey) editor.toggleSelect(item)
        else editor.selectOne(item)
      }
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
    case 'signal':
    case 'crossing':
      if (hit?.kind === 'node') editor.toggleOnNode(editor.tool, { nodeId: hit.id, position })
      else if (hit?.kind === 'way') {
        editor.toggleOnNode(editor.tool, { wayId: hit.id, position: editor.projector!.toLatLon(hit.point) })
      }
      break
    case 'bridge':
    case 'tunnel':
      if (hit?.kind === 'way') editor.toggleWayStructure(hit.id, editor.tool)
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
  if (editor.tool === 'road') {
    event.preventDefault()
    editor.finishRoad()
    scheduleOverlay()
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
  visible(ENGINEERING_LAYERS, lane)
  visible(GRAPH_LAYERS, mode === 'graph')
  // В симуляции траектории поворотов только мешали бы видеть машины и пробки
  visible(TURN_LAYERS, lane && !isSim && editor.layers.turnPaths)
  visible(SIM_LAYERS, isSim)
  m.setLayoutProperty('sim-load', 'visibility', isSim && sim.showLoad ? 'visible' : 'none')
  m.setLayoutProperty('sim-jams', 'visibility', isSim && sim.level === 'micro' ? 'visible' : 'none')
  m.setLayoutProperty('sim-signals', 'visibility', isSim && sim.level === 'micro' ? 'visible' : 'none')
  visible(['arrows'], lane && editor.layers.arrows)
  visible(['crossings'], lane && editor.layers.crossings)
  visible(['signals'], editor.layers.signals)
  visible(['labels'], lane && editor.layers.labels)
  visible(['minor'], editor.layers.minor)
  visible(['rail'], editor.layers.rail)
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

function applyModelOpacity(): void {
  if (!ready || !map) return
  for (const layer of MODEL_FILL_LAYERS) {
    map.setPaintProperty(layer.id, 'fill-opacity', layer.opacity * editor.modelOpacity)
  }
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
  applyLoadColors()
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
    }
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
        properties: { state: signalState(group, stop.connector.phase, time) },
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
  carLayer.alpha = sim.alpha
  carLayer.colorBySpeed = sim.colorBySpeed
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
      layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#141518' } }],
    },
  })
  map = instance
  if (import.meta.env.DEV) (window as unknown as { __map: MlMap }).__map = instance
  instance.doubleClickZoom.disable()
  instance.addControl(new NavigationControl({ visualizePitch: true }), 'bottom-right')

  instance.on('load', () => {
    registerIcons(instance)
    for (const layer of buildLayers(center[1])) instance.addLayer(layer)
    ready = true
    carLayer = new CarLayer(editor.projector!)
    carLayer.limitOf = (car) => {
      const edge = car.route[car.routeIndex]
      return edge ? parseSpeed(edge.tags.maxspeed, edge.tags.highway ?? 'road') / 3.6 : 14
    }
    instance.addLayer(carLayer, 'buildings-3d')
    const backdrop = buildStaticScene(doc)
    setData('buildings', backdrop.buildings)
    setData('landuse', backdrop.landuse)
    setData('rail', backdrop.rail)
    setData('water', backdrop.water)
    applyView()
    applyBasemap()
    fitToBounds()
    renderScene()
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
  instance.on('click', onClick)
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
  map?.remove()
  map = null
  ready = false
})

watch(() => editor.rev, scheduleRender)
watch(() => editor.selection, scheduleOverlay)
watch(() => [editor.issues, editor.focusedIssue], renderIssues)
watch(() => editor.drawPoints, scheduleOverlay)
watch(() => ({ ...editor.layers }), applyView)
watch(() => editor.tool, () => {
  hover = null
  cursorSnap = null
  cursorPosition = null
  if (map) map.getCanvas().style.cursor = editor.tool === 'select' ? '' : 'crosshair'
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
watch(() => sim.loadRev, () => {
  applyLoadColors()
  applyJams()
})
watch(() => [sim.level, sim.showLoad], () => {
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
.hud-label {
  position: absolute;
  transform: translate(-50%, -50%);
  padding: 2px 7px;
  border-radius: 5px;
  background: rgba(20, 21, 24, 0.9);
  border: 1px solid rgba(244, 63, 94, 0.55);
  color: #fecdd3;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  pointer-events: none;
}
</style>
