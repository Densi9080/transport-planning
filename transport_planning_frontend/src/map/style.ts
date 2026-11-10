import type {
  ExpressionSpecification,
  LayerSpecification,
  RasterSourceSpecification,
  SourceSpecification,
} from 'maplibre-gl'

import { ellipsoidTileUrl } from './ellipsoidMercator'

const EARTH_CIRCUMFERENCE_M = 40_075_016.686
const WORLD_PX_AT_ZOOM_0 = 512

export const SOURCE_IDS = [
  'landuse',
  'water',
  'rail',
  'buildings',
  'minor',
  'surface',
  'junctions',
  'turnPaths',
  'markings',
  'laneLines',
  'crossings',
  'arrows',
  'signals',
  'trafficSigns',
  'labels',
  'elevated',
  'trafficLoad',
  'simLoad',
  'simBars',
  'simBarLabels',
  'simOd',
  'simZones',
  'zoneAreas',
  'zoneLabels',
  'zoneLinks',
  'userZones',
  'simJams',
  'simSignals',
  'other',
  'points',
  'transitLines',
  'transitLoad',
  'transitLoadLabels',
  'transitStops',
  'transitLabels',
  'graphLinks',
  'graphNodes',
  'issues',
  'netStops',
  'overlay',
] as const

/**
 * Уровни обслуживания A–F. Шкала упорядоченная: от холодного и незаметного к яркому,
 * зелёного нет, чтобы её читали и при нарушениях цветового зрения. В интерфейсе рядом всегда буква.
 */
export const LOS_COLORS = ['#4aa3c7', '#6fc2b0', '#f0c94a', '#ec835a', '#d03b3b', '#e0409f']

/** С этого приближения улица распадается на отдельные полосы. */
export const LANE_LINE_ZOOM = 16.5

/** Цвета подходов: стандарта на них нет, взята опубликованная палитра Okabe-Ito, различимая при нарушениях цветового зрения. */
export const APPROACH_COLORS = ['#56B4E9', '#E69F00', '#CC79A7', '#009E73', '#F0E442', '#D55E00']

const APPROACH_COLOR: ExpressionSpecification = [
  'match',
  ['get', 'approach'],
  0, APPROACH_COLORS[0]!,
  1, APPROACH_COLORS[1]!,
  2, APPROACH_COLORS[2]!,
  3, APPROACH_COLORS[3]!,
  4, APPROACH_COLORS[4]!,
  APPROACH_COLORS[5]!,
]

/** Подложка перехода: жёлтый ГОСТ Р 51256 для разметки 1.14.1 у детских учреждений. */
export const CROSSING_BAND = '#f2c200'

export const COLORS = {
  background: '#141518',
  building: '#37383c',
  buildingEdge: '#26272a',
  green: '#1e2a20',
  landuse: '#1b1c20',
  water: '#16303f',
  rail: '#5a5d64',
  minor: '#4b4e55',
  road: '#2b2d32',
  laneLine: '#2dd4bf',
  tunnel: '#22242a',
  bridge: '#34373d',
  bridgeEdge: '#c8ccd4',
  bridgeOutline: '#050607',
  marking: '#d7dae0',
  through: '#2dd4bf',
  left: '#f59e0b',
  right: '#3b82f6',
  reverse: '#a855f7',
  accent: '#f43f5e',
  accentSoft: '#fb7185',
  select: '#38bdf8',
  hover: '#7dd3fc',
  error: '#ef4444',
  warning: '#f59e0b',
  info: '#60a5fa',
}

/** Ширина линии в метрах: растёт вместе с масштабом, как настоящая разметка. */
export function metersExpression(meters: number, lat: number, minPx = 0): ExpressionSpecification {
  const pxPerMeterZ0 = WORLD_PX_AT_ZOOM_0 / (EARTH_CIRCUMFERENCE_M * Math.cos((lat * Math.PI) / 180))
  const low = Math.max(minPx, meters * pxPerMeterZ0 * 2 ** 10)
  return [
    'interpolate',
    ['exponential', 2],
    ['zoom'],
    10,
    low,
    24,
    Math.max(minPx, meters * pxPerMeterZ0 * 2 ** 24),
  ]
}

export function emptySources(): Record<string, SourceSpecification> {
  const sources: Record<string, SourceSpecification> = {}
  for (const id of SOURCE_IDS) {
    sources[id] = { type: 'geojson', data: { type: 'FeatureCollection', features: [] } }
  }
  // Загрузка меняется часто, а геометрия — нет: перекрашиваем дороги через состояние объекта
  sources.simLoad = { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, promoteId: 'id' }
  sources.simBars = { type: 'geojson', data: { type: 'FeatureCollection', features: [] }, promoteId: 'id' }
  return sources
}

const ICON_IMAGE_PX = 96
const ARROW_LENGTH_M = 5

export function buildLayers(lat: number): LayerSpecification[] {
  const m = (meters: number, minPx = 0) => metersExpression(meters, lat, minPx)
  const pxPerMeterZ0 = WORLD_PX_AT_ZOOM_0 / (EARTH_CIRCUMFERENCE_M * Math.cos((lat * Math.PI) / 180))
  const iconSize = (meters: number): ExpressionSpecification => [
    'interpolate',
    ['exponential', 2],
    ['zoom'],
    10,
    (meters * pxPerMeterZ0 * 2 ** 10) / ICON_IMAGE_PX,
    24,
    (meters * pxPerMeterZ0 * 2 ** 24) / ICON_IMAGE_PX,
  ]
  const ground: ExpressionSpecification = ['<=', ['get', 'level'], 0]
  const elevated: ExpressionSpecification = ['>', ['get', 'level'], 0]
  // У линий полос и манёвров уровень может отсутствовать: тогда это земля
  const groundSafe: ExpressionSpecification = ['<=', ['coalesce', ['get', 'level'], 0], 0]
  const elevatedSafe: ExpressionSpecification = ['>', ['coalesce', ['get', 'level'], 0], 0]

  return [
    { id: 'landuse', type: 'fill', source: 'landuse', paint: {
      'fill-color': ['case', ['get', 'green'], COLORS.green, COLORS.landuse],
      'fill-opacity': 0.85,
    } },
    { id: 'water-fill', type: 'fill', source: 'water', filter: ['==', ['geometry-type'], 'Polygon'], paint: {
      'fill-color': COLORS.water,
    } },
    { id: 'water-line', type: 'line', source: 'water', filter: ['==', ['geometry-type'], 'LineString'], paint: {
      'line-color': COLORS.water,
      'line-width': m(6, 1.5),
    } },
    { id: 'buildings', type: 'fill', source: 'buildings', paint: {
      'fill-color': COLORS.building,
      'fill-outline-color': COLORS.buildingEdge,
    } },
    { id: 'other', type: 'line', source: 'other', paint: {
      'line-color': COLORS.minor,
      'line-width': 0.8,
      'line-opacity': 0.55,
    } },
    { id: 'rail', type: 'line', source: 'rail', paint: {
      'line-color': COLORS.rail,
      'line-width': m(1.4, 1),
      'line-dasharray': [3, 2],
    } },
    { id: 'minor', type: 'line', source: 'minor', paint: {
      'line-color': COLORS.minor,
      'line-width': m(1.4, 0.7),
      'line-opacity': 0.9,
      'line-dasharray': ['case', ['==', ['get', 'highway'], 'steps'], ['literal', [0.6, 0.6]], ['literal', [1, 0]]],
    } },

    // Движение под землёй видно приглушённо, чтобы не спорить с дорогами сверху
    { id: 'surface-tunnel', type: 'fill', source: 'surface', filter: ['<', ['get', 'level'], 0], paint: {
      'fill-color': COLORS.tunnel,
      'fill-opacity': 0.65,
    } },
    { id: 'surface', type: 'fill', source: 'surface', filter: ['==', ['get', 'level'], 0], paint: {
      'fill-color': COLORS.road,
    } },
    { id: 'junctions', type: 'fill', source: 'junctions', filter: ground, paint: {
      'fill-color': COLORS.road,
    } },
    { id: 'sim-load', type: 'fill', source: 'simLoad', layout: { visibility: 'none' }, paint: {
      'fill-color': ['match', ['coalesce', ['feature-state', 'los'], -1],
        0, LOS_COLORS[0]!, 1, LOS_COLORS[1]!, 2, LOS_COLORS[2]!, 3, LOS_COLORS[3]!, 4, LOS_COLORS[4]!, 5, LOS_COLORS[5]!,
        'rgba(0,0,0,0)'],
      // Лёгкий оттенок: полосы и разметка под ним видны, а главное показывает линия sim-flow по кромке
      'fill-opacity': ['match', ['coalesce', ['feature-state', 'los'], -1], 0, 0.06, 1, 0.1, 2, 0.16, 3, 0.22, 4, 0.28, 5, 0.34, 0],
    } },
    // Уровень обслуживания тонкой линией вдоль кромки каждого направления, внутри проезжей части.
    // Слой лежит на асфальте, ниже машин: иначе в 3D линия проходила бы поверх кузовов
    { id: 'sim-flow', type: 'line', source: 'simBars', layout: { visibility: 'none', 'line-cap': 'round', 'line-join': 'round' }, paint: {
      'line-color': ['match', ['coalesce', ['feature-state', 'los'], -1],
        0, LOS_COLORS[0]!, 1, LOS_COLORS[1]!, 2, LOS_COLORS[2]!, 3, LOS_COLORS[3]!, 4, LOS_COLORS[4]!, 5, LOS_COLORS[5]!,
        'rgba(0,0,0,0)'],
      'line-width': ['interpolate', ['linear'], ['zoom'], 13, 1.5, 16, 2.5, 19, 4],
      'line-offset': ['interpolate', ['linear'], ['zoom'], 13, -0.75, 16, -1.25, 19, -2],
      'line-opacity': ['match', ['coalesce', ['feature-state', 'los'], -1], -1, 0, 0.95],
    } },
    { id: 'markings-edge', type: 'line', source: 'markings', minzoom: 15, filter: ['all', ['==', ['get', 'level'], 0], ['==', ['get', 'kind'], 'edge']], paint: {
      'line-color': COLORS.marking,
      'line-width': m(0.14, 0.4),
      'line-opacity': 0.55,
    } },
    // Кромки тоннеля пунктиром, как на топографических картах: дорога идёт под землёй
    { id: 'tunnel-edge', type: 'line', source: 'markings', minzoom: 14, filter: ['all', ['<', ['get', 'level'], 0], ['==', ['get', 'kind'], 'edge']], paint: {
      'line-color': COLORS.marking,
      'line-width': m(0.25, 0.8),
      'line-opacity': 0.75,
      'line-dasharray': [2, 1.5],
    } },
    { id: 'markings-divider', type: 'line', source: 'markings', minzoom: 15, filter: ['all', ground, ['==', ['get', 'kind'], 'divider']], paint: {
      'line-color': COLORS.marking,
      'line-width': m(0.22, 0.6),
    } },
    { id: 'markings-lane', type: 'line', source: 'markings', minzoom: 16, maxzoom: LANE_LINE_ZOOM, filter: ['all', ground, ['==', ['get', 'kind'], 'lane']], paint: {
      'line-color': COLORS.marking,
      'line-width': m(0.15, 0.5),
      'line-opacity': 0.85,
      // ГОСТ Р 51256: линия 1.5, штрих к разрыву 1:3, при ширине 0,15 м это 3 м и 9 м
      'line-dasharray': [20, 60],
    } },
    { id: 'markings-lane-solid', type: 'line', source: 'markings', minzoom: 15.5, maxzoom: LANE_LINE_ZOOM, filter: ['all', ground, ['==', ['get', 'kind'], 'lane-solid']], paint: {
      'line-color': COLORS.marking,
      'line-width': m(0.18, 0.6),
    } },
    { id: 'marking-stop', type: 'line', source: 'markings', minzoom: 15.5, filter: ['==', ['get', 'kind'], 'stop-line'], layout: { visibility: 'none' }, paint: {
      'line-color': COLORS.marking,
      'line-width': m(0.4, 1),
    } },
    { id: 'marking-zigzag', type: 'line', source: 'markings', minzoom: 15.5, filter: ['==', ['get', 'kind'], 'zigzag'], layout: { visibility: 'none', 'line-join': 'miter' }, paint: {
      'line-color': '#f5c400',
      'line-width': m(0.15, 1),
    } },
    { id: 'lane-line', filter: groundSafe, type: 'line', source: 'laneLines', minzoom: LANE_LINE_ZOOM, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: {
      'line-color': COLORS.laneLine,
      'line-width': ['interpolate', ['linear'], ['zoom'], LANE_LINE_ZOOM, 0.8, 20, 2.2],
    } },
    { id: 'lane-arrow', filter: groundSafe, type: 'symbol', source: 'laneLines', minzoom: LANE_LINE_ZOOM + 0.5, layout: {
      'symbol-placement': 'line',
      'symbol-spacing': 90,
      'icon-image': 'direction',
      'icon-rotate': 90,
      'icon-size': ['interpolate', ['linear'], ['zoom'], LANE_LINE_ZOOM, 0.35, 20, 0.7],
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    } },
    { id: 'turn-ribbon', type: 'line', source: 'turnPaths', minzoom: 15, filter: ['all', groundSafe, ['!', ['to-boolean', ['get', 'continuation']]], ['!', ['to-boolean', ['get', 'forbidden']]]], paint: {
      'line-color': APPROACH_COLOR,
      'line-width': m(3, 1.5),
      'line-opacity': 0.22,
    } },
    { id: 'turn-line', type: 'line', source: 'turnPaths', minzoom: 15.5, filter: ['all', groundSafe, ['!', ['to-boolean', ['get', 'continuation']]], ['!', ['to-boolean', ['get', 'forbidden']]]], paint: {
      'line-color': APPROACH_COLOR,
      'line-width': m(0.3, 0.8),
      'line-opacity': 0.9,
    } },
    // Запрещённый манёвр: красный пунктир со знаком посередине; щелчок открывает его, как обычный поворот
    { id: 'turn-forbidden', type: 'line', source: 'turnPaths', minzoom: 15.5, filter: ['to-boolean', ['get', 'forbidden']], paint: {
      'line-color': COLORS.error,
      'line-width': m(0.35, 1.2),
      'line-opacity': 0.85,
      'line-dasharray': [2, 1.5],
    } },
    { id: 'turn-forbidden-sign', type: 'symbol', source: 'turnPaths', minzoom: 16.5, filter: ['to-boolean', ['get', 'forbidden']], layout: {
      'symbol-placement': 'line-center',
      'icon-image': ['match', ['get', 'turn'], 'left', 'sign:3.18.2', 'right', 'sign:3.18.1', 'sign:no-straight'],
      'icon-rotation-alignment': 'viewport',
      'icon-size': ['interpolate', ['linear'], ['zoom'], 16.5, 0.35, 19, 0.6],
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    } },
    // Продолжение полос через стык двух отрезков выглядит как сама полоса
    { id: 'turn-continuation', type: 'line', source: 'turnPaths', minzoom: LANE_LINE_ZOOM, filter: ['all', groundSafe, ['to-boolean', ['get', 'continuation']]], layout: { 'line-cap': 'round' }, paint: {
      'line-color': COLORS.laneLine,
      'line-width': ['interpolate', ['linear'], ['zoom'], LANE_LINE_ZOOM, 0.8, 20, 2.2],
    } },
    // Переход: жёлто-белая зебра, как у школ, читается на сером асфальте в обеих темах.
    // Издалека — жёлтая черта поперёк дороги, ближе — жёлтая подложка, вблизи на ней белые полосы
    { id: 'crossings-axis', type: 'line', source: 'crossings', minzoom: 13, maxzoom: 15.5, filter: ['==', ['get', 'kind'], 'axis'], layout: { 'line-cap': 'butt' }, paint: {
      'line-color': CROSSING_BAND,
      'line-width': ['interpolate', ['linear'], ['zoom'], 13, 2, 15.5, 5],
    } },
    { id: 'crossings-band', type: 'fill', source: 'crossings', minzoom: 15, filter: ['==', ['get', 'kind'], 'band'], paint: {
      'fill-color': CROSSING_BAND,
      'fill-opacity': 0.92,
    } },
    { id: 'crossings', type: 'fill', source: 'crossings', minzoom: 16.5, filter: ['==', ['get', 'kind'], 'stripe'], paint: {
      'fill-color': '#ffffff',
      'fill-opacity': ['interpolate', ['linear'], ['zoom'], 16.5, 0, 17.2, 1],
    } },

    // Мост поверх всего, что под ним: тень на нижнюю дорогу, тёмный контур, плотный настил,
    // светлые перила и отогнутые края у концов. Нижняя дорога под настилом лишь угадывается
    { id: 'bridge-shadow', type: 'fill', source: 'surface', filter: elevated, paint: {
      'fill-color': '#000000',
      'fill-opacity': 0.45,
      'fill-translate': ['interpolate', ['linear'], ['zoom'], 14, ['literal', [1, 1.5]], 19, ['literal', [4, 6]]],
      'fill-translate-anchor': 'viewport',
    } },
    { id: 'bridge-outline', type: 'line', source: 'markings', filter: ['all', elevated, ['in', ['get', 'kind'], ['literal', ['edge', 'wing']]]], layout: { 'line-cap': 'round' }, paint: {
      'line-color': COLORS.bridgeOutline,
      'line-width': m(1.2, 3),
    } },
    { id: 'surface-bridge', type: 'fill', source: 'surface', filter: elevated, paint: {
      'fill-color': COLORS.bridge,
      'fill-opacity': 0.9,
    } },
    { id: 'junctions-bridge', type: 'fill', source: 'junctions', filter: elevated, paint: {
      'fill-color': COLORS.bridge,
      'fill-opacity': 0.9,
    } },
    { id: 'bridge-casing', type: 'line', source: 'markings', filter: ['all', elevated, ['in', ['get', 'kind'], ['literal', ['edge', 'wing']]]], layout: { 'line-cap': 'round' }, paint: {
      'line-color': COLORS.bridgeEdge,
      'line-width': m(0.45, 1.2),
    } },
    { id: 'markings-bridge', type: 'line', source: 'markings', minzoom: 15, filter: ['all', elevated, ['!', ['in', ['get', 'kind'], ['literal', ['edge', 'wing']]]]], paint: {
      'line-color': COLORS.marking,
      'line-width': m(0.16, 0.5),
    } },
    // Полосы и манёвры моста лежат поверх его настила: раньше настил закрывал их и они «обрывались»
    { id: 'lane-line-bridge', filter: elevatedSafe, type: 'line', source: 'laneLines', minzoom: LANE_LINE_ZOOM, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: {
      'line-color': COLORS.laneLine,
      'line-width': ['interpolate', ['linear'], ['zoom'], LANE_LINE_ZOOM, 0.8, 20, 2.2],
    } },
    { id: 'lane-arrow-bridge', filter: elevatedSafe, type: 'symbol', source: 'laneLines', minzoom: LANE_LINE_ZOOM + 0.5, layout: {
      'symbol-placement': 'line',
      'symbol-spacing': 90,
      'icon-image': 'direction',
      'icon-rotate': 90,
      'icon-size': ['interpolate', ['linear'], ['zoom'], LANE_LINE_ZOOM, 0.35, 20, 0.7],
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    } },
    { id: 'turn-ribbon-bridge', type: 'line', source: 'turnPaths', minzoom: 15, filter: ['all', elevatedSafe, ['!', ['to-boolean', ['get', 'continuation']]], ['!', ['to-boolean', ['get', 'forbidden']]]], paint: {
      'line-color': APPROACH_COLOR,
      'line-width': m(3, 1.5),
      'line-opacity': 0.22,
    } },
    { id: 'turn-line-bridge', type: 'line', source: 'turnPaths', minzoom: 15.5, filter: ['all', elevatedSafe, ['!', ['to-boolean', ['get', 'continuation']]], ['!', ['to-boolean', ['get', 'forbidden']]]], paint: {
      'line-color': APPROACH_COLOR,
      'line-width': m(0.3, 0.8),
      'line-opacity': 0.9,
    } },
    { id: 'turn-continuation-bridge', type: 'line', source: 'turnPaths', minzoom: LANE_LINE_ZOOM, filter: ['all', elevatedSafe, ['to-boolean', ['get', 'continuation']]], layout: { 'line-cap': 'round' }, paint: {
      'line-color': COLORS.laneLine,
      'line-width': ['interpolate', ['linear'], ['zoom'], LANE_LINE_ZOOM, 0.8, 20, 2.2],
    } },

    { id: 'arrows', type: 'symbol', source: 'arrows', minzoom: 16.5, layout: {
      'icon-image': ['concat', 'arrow-', ['get', 'icon']],
      'icon-rotate': ['get', 'rot'],
      'icon-size': iconSize(ARROW_LENGTH_M),
      'icon-rotation-alignment': 'map',
      'icon-pitch-alignment': 'map',
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    } },

    { id: 'buildings-3d', type: 'fill-extrusion', source: 'buildings', layout: { visibility: 'none' }, paint: {
      'fill-extrusion-color': '#4a4c52',
      'fill-extrusion-height': ['get', 'height'],
      'fill-extrusion-opacity': 0.92,
    } },
    { id: 'road-3d', type: 'fill-extrusion', source: 'elevated', layout: { visibility: 'none' }, paint: {
      'fill-extrusion-color': '#70747d',
      'fill-extrusion-base': ['get', 'base'],
      'fill-extrusion-height': ['get', 'top'],
      'fill-extrusion-opacity': 0.96,
      'fill-extrusion-vertical-gradient': true,
    } },

    { id: 'graph-links', type: 'line', source: 'graphLinks', layout: { visibility: 'none', 'line-cap': 'round' }, paint: {
      'line-color': ['match', ['get', 'highway'],
        'motorway', '#ef4444', 'trunk', '#f97316', 'primary', '#f59e0b',
        'secondary', '#eab308', 'tertiary', '#2dd4bf', 'residential', '#60a5fa',
        'unclassified', '#60a5fa', 'living_street', '#a78bfa', 'service', '#71717a', '#a1a1aa'],
      // Толщина растёт с числом полос, но остаётся линией: граф не должен превращаться в проезжую часть
      'line-width': ['interpolate', ['linear'], ['zoom'],
        13, ['+', 0.8, ['*', 0.15, ['min', ['get', 'lanes'], 6]]],
        17, ['+', 1.6, ['*', 0.35, ['min', ['get', 'lanes'], 6]]],
        20, ['+', 2.6, ['*', 0.6, ['min', ['get', 'lanes'], 6]]]],
    } },
    { id: 'graph-direction', type: 'symbol', source: 'graphLinks', filter: ['get', 'oneway'], layout: {
      visibility: 'none',
      'symbol-placement': 'line',
      'symbol-spacing': 90,
      'icon-image': 'direction',
      'icon-rotate': 90,
      'icon-size': ['interpolate', ['linear'], ['zoom'], 15, 0.35, 19, 0.7],
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    } },
    { id: 'graph-nodes', type: 'circle', source: 'graphNodes', layout: { visibility: 'none' }, paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 1.8, 19, 6],
      'circle-color': '#141518',
      'circle-stroke-color': '#e8ecf1',
      'circle-stroke-width': 1.5,
    } },

    { id: 'points', type: 'circle', source: 'points', minzoom: 15.5, paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 15.5, 1.5, 19, 4],
      'circle-color': COLORS.minor,
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 0.6,
    } },
    { id: 'transit-all', type: 'line', source: 'transitLines', layout: { visibility: 'none', 'line-cap': 'round', 'line-join': 'round' }, paint: {
      'line-color': '#7c3aed',
      'line-width': ['interpolate', ['linear'], ['get', 'count'], 1, 1.5, 12, 7],
      'line-opacity': 0.55,
    } },
    // Эпюра наполнения: полоса справа по ходу движения, толщина пропорциональна потоку на перегоне
    { id: 'transit-load', type: 'line', source: 'transitLoad', layout: { 'line-cap': 'butt', 'line-join': 'round' }, paint: {
      'line-color': ['case', ['>', ['get', 'fill'], 1], '#dc2626', '#2563eb'],
      'line-width': ['get', 'width'],
      'line-offset': ['+', ['/', ['get', 'width'], 2], 4],
      'line-opacity': 0.6,
    } },
    { id: 'transit-load-labels', type: 'symbol', source: 'transitLoadLabels', layout: {
      'icon-image': ['get', 'image'],
      'icon-allow-overlap': false,
    } },
    { id: 'transit-selected', type: 'line', source: 'transitLines', filter: ['==', ['get', 'selected'], true], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: {
      'line-color': ['get', 'color'],
      'line-width': 6,
    } },
    { id: 'transit-direction', type: 'symbol', source: 'transitLines', filter: ['==', ['get', 'selected'], true], layout: {
      'symbol-placement': 'line',
      'symbol-spacing': 80,
      'icon-image': 'direction',
      'icon-rotate': 90,
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    } },
    { id: 'transit-stops', type: 'circle', source: 'transitStops', minzoom: 14, layout: { visibility: 'none' }, paint: {
      // zoom допустим только на верхнем уровне выражения, поэтому case лежит внутри interpolate
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 14, ['case', ['get', 'selected'], 7, 2.5], 18, ['case', ['get', 'selected'], 7, 5]],
      'circle-color': ['case', ['get', 'selected'], '#ffffff', '#7c3aed'],
      'circle-stroke-color': ['case', ['get', 'selected'], ['get', 'color'], '#ffffff'],
      'circle-stroke-width': ['case', ['get', 'selected'], 3, 1],
    } },
    { id: 'transit-labels', type: 'symbol', source: 'transitLabels', layout: {
      'icon-image': ['get', 'image'],
      'icon-anchor': 'left',
      'icon-offset': [14, 0],
      'icon-allow-overlap': false,
    } },
    { id: 'signals', type: 'symbol', source: 'signals', minzoom: 14, layout: {
      'icon-image': 'traffic-light',
      'icon-size': ['interpolate', ['linear'], ['zoom'], 14, 0.55, 18, 1, 21, 1.6],
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    } },
    { id: 'traffic-signs', type: 'symbol', source: 'trafficSigns', minzoom: 15, layout: {
      'icon-image': ['get', 'icon'],
      'icon-size': ['interpolate', ['linear'], ['zoom'], 15, 0.5, 18, 0.9, 21, 1.4],
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    } },
    { id: 'labels', type: 'symbol', source: 'labels', minzoom: 15.5, layout: {
      'icon-image': ['get', 'image'],
      'icon-rotate': ['get', 'rot'],
      'icon-rotation-alignment': 'map',
      'icon-allow-overlap': false,
    } },

    // Районы, заданные вручную: видны в редакторе всегда, в расчёте их показывает слой районов модели
    { id: 'user-zone-fill', type: 'fill', source: 'userZones', filter: ['==', ['get', 'kind'], 'area'], paint: {
      'fill-color': '#a78bfa',
      'fill-opacity': 0.1,
    } },
    { id: 'user-zone-line', type: 'line', source: 'userZones', filter: ['==', ['get', 'kind'], 'area'], layout: { 'line-join': 'round' }, paint: {
      'line-color': '#a78bfa',
      'line-width': 2,
      'line-dasharray': [3, 2],
    } },
    { id: 'user-zone-label', type: 'symbol', source: 'userZones', minzoom: 13, filter: ['==', ['get', 'kind'], 'label'], layout: {
      'icon-image': ['get', 'image'],
      'icon-allow-overlap': true,
    } },
    { id: 'zone-area', type: 'fill', source: 'zoneAreas', layout: { visibility: 'none' }, paint: {
      'fill-color': ['interpolate', ['linear'], ['get', 'share'], 0, '#22c55e', 0.5, '#eab308', 1, '#ef4444'],
      'fill-opacity': 0.16,
    } },
    { id: 'zone-outline', type: 'line', source: 'zoneAreas', layout: { visibility: 'none', 'line-join': 'round' }, paint: {
      'line-color': ['interpolate', ['linear'], ['get', 'share'], 0, '#22c55e', 0.5, '#eab308', 1, '#ef4444'],
      'line-width': 1.6,
    } },
    { id: 'zone-link', type: 'line', source: 'zoneLinks', layout: { visibility: 'none' }, paint: {
      'line-color': '#f59e0b',
      'line-width': 1.2,
      'line-dasharray': [2, 2],
    } },
    { id: 'zone-label', type: 'symbol', source: 'zoneLabels', minzoom: 14, layout: {
      visibility: 'none',
      'icon-image': ['get', 'image'],
      'icon-allow-overlap': true,
    } },
    { id: 'sim-od', type: 'line', source: 'simOd', layout: { visibility: 'none', 'line-cap': 'round' }, paint: {
      'line-color': '#7c3aed',
      'line-width': ['get', 'width'],
      'line-opacity': 0.4,
    } },
    { id: 'sim-zones', type: 'circle', source: 'simZones', layout: { visibility: 'none' }, paint: {
      'circle-radius': ['get', 'radius'],
      'circle-color': ['match', ['get', 'kind'], 'gateway', '#0b5cad', '#7c3aed'],
      'circle-opacity': 0.75,
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 1.5,
    } },
    // Столбик объёма за правой кромкой своего направления. Растёт с масштабом умеренно:
    // раньше на 20-м уровне он был в 4 раза толще и закрывал соседние улицы
    { id: 'sim-bars', type: 'line', source: 'simBars', layout: { visibility: 'none', 'line-cap': 'butt', 'line-join': 'round' }, paint: {
      'line-color': ['match', ['coalesce', ['feature-state', 'los'], -1],
        0, LOS_COLORS[0]!, 1, LOS_COLORS[1]!, 2, LOS_COLORS[2]!, 3, LOS_COLORS[3]!, 4, LOS_COLORS[4]!, 5, LOS_COLORS[5]!,
        'rgba(0,0,0,0)'],
      'line-width': ['interpolate', ['linear'], ['zoom'],
        13, ['*', 0.35, ['coalesce', ['feature-state', 'w'], 0]],
        16, ['*', 0.75, ['coalesce', ['feature-state', 'w'], 0]],
        18, ['coalesce', ['feature-state', 'w'], 0],
        20, ['*', 1.3, ['coalesce', ['feature-state', 'w'], 0]]],
      'line-offset': ['interpolate', ['linear'], ['zoom'],
        13, ['+', 0.5, ['*', 0.175, ['coalesce', ['feature-state', 'w'], 0]]],
        16, ['+', 1, ['*', 0.375, ['coalesce', ['feature-state', 'w'], 0]]],
        18, ['+', 1.5, ['*', 0.5, ['coalesce', ['feature-state', 'w'], 0]]],
        20, ['+', 2, ['*', 0.65, ['coalesce', ['feature-state', 'w'], 0]]]],
      'line-opacity': 0.85,
    } },
    { id: 'sim-bar-labels', type: 'symbol', source: 'simBarLabels', minzoom: 14.5, layout: {
      visibility: 'none',
      'icon-image': ['get', 'image'],
      'icon-allow-overlap': false,
    } },
    { id: 'sim-jams', type: 'circle', source: 'simJams', layout: { visibility: 'none' }, paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 5, 18, 13],
      'circle-color': 'rgba(224,64,159,0.22)',
      'circle-stroke-color': LOS_COLORS[5]!,
      'circle-stroke-width': 2,
    } },
    { id: 'sim-signals', type: 'circle', source: 'simSignals', minzoom: 15, layout: { visibility: 'none' }, paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 15, 2, 19, 5.5],
      'circle-color': ['match', ['get', 'state'], 'green', '#22c55e', 'yellow', '#facc15', '#ef4444'],
      'circle-stroke-color': '#0b0c0e',
      'circle-stroke-width': 1.5,
    } },
    // Узлы перекрёстков и места разреза дороги (меньше, с 15-го масштаба)
    { id: 'node-dots', type: 'circle', source: 'graphNodes', minzoom: 13, filter: ['any', ['>=', ['get', 'degree'], 3], ['to-boolean', ['get', 'split']]], paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, ['case', ['to-boolean', ['get', 'split']], 0, 2.5], 15, ['case', ['to-boolean', ['get', 'split']], 1.8, 3.5], 18, ['case', ['to-boolean', ['get', 'split']], 3.5, 5], 20, ['case', ['to-boolean', ['get', 'split']], 5, 7]],
      'circle-color': '#e5e7eb',
      'circle-stroke-color': '#111827',
      'circle-stroke-width': 1,
    } },
    // Платформа-линия — полупрозрачная полоса по её форме, под значком
    { id: 'net-stop-area-line', type: 'line', source: 'netStops', minzoom: 15, filter: ['==', ['get', 'kind'], 'areaLine'], layout: { 'line-cap': 'butt' }, paint: {
      'line-color': ['case', ['==', ['get', 'stop'], null], 'rgba(248,113,113,0.5)', 'rgba(96,165,250,0.45)'],
      'line-width': ['interpolate', ['linear'], ['zoom'], 15, 2, 19, 7],
    } },
    // Остановочный пункт: точка на дороге, где транспорт берёт пассажиров. Без зоны — красная, трамвайный — коричневый
    { id: 'net-stop-point', type: 'circle', source: 'netStops', minzoom: 14, filter: ['==', ['get', 'kind'], 'point'], paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 14, 2, 18, 4],
      'circle-color': ['case', ['get', 'orphan'], '#ef4444', ['==', ['get', 'mode'], 'tram'], '#b45309', '#1d4ed8'],
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 1.2,
    } },
    // Остановка (павильон, платформа): значок 5.16 / 5.17, трамвайная своим значком
    { id: 'net-stop-icon', type: 'symbol', source: 'netStops', minzoom: 14, filter: ['==', ['get', 'kind'], 'areaIcon'], layout: {
      'icon-image': ['get', 'image'],
      'icon-size': ['interpolate', ['linear'], ['zoom'], 14, ['case', ['get', 'selected'], 0.55, 0.38], 18, ['case', ['get', 'selected'], 0.95, 0.7], 21, ['case', ['get', 'selected'], 1.4, 1.1]],
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    }, paint: {
      'icon-opacity': ['case', ['get', 'orphan'], 0.6, 1],
    } },
    // Название остановки над её значками
    { id: 'net-stop-label', type: 'symbol', source: 'netStops', minzoom: 15.5, filter: ['==', ['get', 'kind'], 'stopLabel'], layout: {
      'icon-image': ['get', 'image'],
      'icon-anchor': 'bottom',
      'icon-offset': [0, -14],
      'icon-allow-overlap': false,
    } },
    { id: 'traffic-lane', type: 'line', source: 'trafficLoad', layout: { visibility: 'none', 'line-cap': 'round', 'line-join': 'round' }, paint: {
      'line-color': ['interpolate', ['linear'], ['get', 'ratio'], 0, '#22c55e', 0.5, '#facc15', 0.8, '#f97316', 1, '#dc2626'],
      // Тонко, по оси своей полосы: загрузка видна, а полосы и соседние дороги не закрыты
      'line-width': ['interpolate', ['linear'], ['zoom'], 13, ['+', 0.8, ['*', ['get', 'ratio'], 1]], 17, ['+', 1.5, ['*', ['get', 'ratio'], 2]], 19, ['+', 2, ['*', ['get', 'ratio'], 3]]],
      'line-opacity': 0.85,
    } },
    // Новая дорога в том виде, в каком появится: настил, кромки, полосы и направление
    { id: 'overlay-draw-surface', type: 'fill', source: 'overlay', filter: ['==', ['get', 'role'], 'draw-surface'], paint: {
      'fill-color': '#4b5059',
      'fill-opacity': 0.82,
    } },
    { id: 'overlay-draw-edge', type: 'line', source: 'overlay', filter: ['==', ['get', 'role'], 'draw-edge'], layout: { 'line-join': 'round' }, paint: {
      'line-color': COLORS.select,
      'line-width': 1.6,
    } },
    { id: 'overlay-draw-lane', type: 'line', source: 'overlay', filter: ['==', ['get', 'role'], 'draw-lane'], paint: {
      'line-color': '#e5e7eb',
      'line-width': 1,
      'line-opacity': 0.75,
      'line-dasharray': [3, 3],
    } },
    { id: 'overlay-draw-divider', type: 'line', source: 'overlay', filter: ['==', ['get', 'role'], 'draw-divider'], paint: {
      'line-color': '#e5e7eb',
      'line-width': 1.6,
    } },
    { id: 'overlay-draw-flow', type: 'symbol', source: 'overlay', filter: ['==', ['get', 'role'], 'draw-flow'], layout: {
      'symbol-placement': 'line',
      'symbol-spacing': 60,
      'icon-image': 'direction',
      'icon-rotate': 90,
      'icon-size': 0.8,
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    } },
    { id: 'overlay-zone-draft', type: 'fill', source: 'overlay', filter: ['==', ['get', 'role'], 'zone-draft'], paint: {
      'fill-color': '#a78bfa',
      'fill-opacity': 0.22,
    } },
    { id: 'overlay-proposal', type: 'line', source: 'overlay', filter: ['==', ['get', 'role'], 'proposal'], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: {
      'line-color': '#f59e0b',
      'line-width': 5,
      'line-dasharray': [1.5, 1.2],
    } },
    { id: 'overlay-proposal-node', type: 'circle', source: 'overlay', filter: ['==', ['get', 'role'], 'proposal-node'], paint: {
      'circle-radius': 10,
      'circle-color': 'rgba(245,158,11,0.25)',
      'circle-stroke-color': '#f59e0b',
      'circle-stroke-width': 2.5,
    } },
    { id: 'overlay-hover', type: 'line', source: 'overlay', filter: ['==', ['get', 'role'], 'hover'], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: {
      'line-color': COLORS.hover,
      'line-width': ['+', ['*', ['coalesce', ['get', 'px'], 0], 1], 4],
      'line-opacity': 0.35,
    } },
    { id: 'overlay-selected', type: 'line', source: 'overlay', filter: ['==', ['get', 'role'], 'selected'], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: {
      'line-color': COLORS.select,
      'line-width': 3,
    } },
    { id: 'overlay-direction', type: 'symbol', source: 'overlay', filter: ['==', ['get', 'role'], 'selected'], layout: {
      'symbol-placement': 'line',
      'symbol-spacing': 70,
      'icon-image': 'direction',
      'icon-rotate': 90,
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    } },
    { id: 'overlay-draw', type: 'line', source: 'overlay', filter: ['==', ['get', 'role'], 'draw'], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: {
      'line-color': COLORS.select,
      'line-width': 2,
    } },
    { id: 'overlay-draw-rubber', type: 'line', source: 'overlay', filter: ['==', ['get', 'role'], 'draw-rubber'], layout: { 'line-join': 'round' }, paint: {
      'line-color': COLORS.select,
      'line-width': 2,
      'line-dasharray': [2, 1.5],
    } },
    // Пересечение с существующей дорогой без общего узла: потом это ошибка «Пересечение без узла»
    { id: 'overlay-draw-cross', type: 'circle', source: 'overlay', filter: ['==', ['get', 'role'], 'draw-cross'], paint: {
      'circle-radius': 7,
      'circle-color': 'rgba(245,158,11,0.3)',
      'circle-stroke-color': COLORS.warning,
      'circle-stroke-width': 2.5,
    } },
    { id: 'overlay-object', type: 'circle', source: 'overlay', filter: ['==', ['get', 'role'], 'net-object'], paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 14, 4, 18, 9],
      'circle-color': '#14171c',
      'circle-stroke-width': 1.5,
      'circle-stroke-color': ['match', ['get', 'letter'], 'V', '#38bdf8', 'З', '#fb923c', 'П', '#f472b6', 'Д', '#a3e635', 'Q', '#facc15', '#ffffff'],
    } },
    { id: 'issues', type: 'circle', source: 'issues', paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 3, 18, 7],
      'circle-color': ['match', ['get', 'severity'], 'error', COLORS.error, 'warning', COLORS.warning, COLORS.info],
      'circle-opacity': 0.85,
      'circle-stroke-color': '#0b0c0e',
      'circle-stroke-width': 1.5,
    } },
    { id: 'issues-focus', type: 'circle', source: 'issues', filter: ['==', ['get', 'focused'], true], paint: {
      'circle-radius': 18,
      'circle-color': 'rgba(0,0,0,0)',
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 2,
    } },
    // Манёвр по полосам: у каждой полосы своя траектория, точка начала (зелёная) и конца (красная)
    { id: 'overlay-turn', type: 'line', source: 'overlay', filter: ['==', ['get', 'role'], 'turn-selected'], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: {
      'line-color': '#ffffff',
      'line-width': ['case', ['get', 'active'], 3.5, 2],
      'line-opacity': ['case', ['get', 'active'], 1, 0.35],
    } },
    { id: 'overlay-turn-end', type: 'circle', source: 'overlay', filter: ['in', ['get', 'role'], ['literal', ['turn-start', 'turn-end']]], paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 16, ['case', ['get', 'active'], 4, 3], 20, ['case', ['get', 'active'], 7, 5]],
      'circle-color': ['match', ['get', 'role'], 'turn-start', '#22c55e', '#ef4444'],
      'circle-opacity': ['case', ['get', 'active'], 1, 0.4],
      'circle-stroke-width': 1.5,
      'circle-stroke-color': '#ffffff',
      'circle-stroke-opacity': ['case', ['get', 'active'], 1, 0.4],
    } },
    // Ручка формы манёвра: белый круг с синей каймой, его тянут мышью
    { id: 'overlay-turn-handle', type: 'circle', source: 'overlay', filter: ['==', ['get', 'role'], 'turn-handle'], paint: {
      'circle-radius': 7,
      'circle-color': '#ffffff',
      'circle-stroke-color': '#2563eb',
      'circle-stroke-width': 3,
    } },
    { id: 'overlay-select-fill', type: 'fill', source: 'overlay', filter: ['==', ['get', 'role'], 'select-area'], paint: {
      'fill-color': 'rgba(56,189,248,0.14)',
    } },
    { id: 'overlay-select-line', type: 'line', source: 'overlay', filter: ['==', ['get', 'role'], 'select-area'], paint: {
      'line-color': COLORS.accentSoft,
      'line-width': 1.5,
      'line-dasharray': [3, 2],
    } },
    { id: 'overlay-selected-3d', type: 'fill-extrusion', source: 'overlay', filter: ['==', ['get', 'role'], 'selected-3d'], paint: {
      'fill-extrusion-color': COLORS.select,
      'fill-extrusion-base': ['get', 'base'],
      'fill-extrusion-height': ['get', 'top'],
      'fill-extrusion-opacity': 0.92,
    } },
    // Связь зоны со своими пунктами
    { id: 'net-stop-link', type: 'line', source: 'netStops', minzoom: 15.5, filter: ['==', ['get', 'kind'], 'link'], paint: {
      'line-color': '#60a5fa',
      'line-width': 1.2,
    } },
    { id: 'overlay-band', type: 'line', source: 'overlay', filter: ['==', ['get', 'role'], 'band'], layout: { 'line-cap': 'round' }, paint: {
      'line-color': '#facc15',
      'line-width': 2,
    } },
    // Предлагаемый знак «Уступи дорогу»: отмеченный — жёлтый с красной каймой, как сам знак
    { id: 'overlay-sign-preview', type: 'circle', source: 'overlay', filter: ['==', ['get', 'role'], 'sign-preview'], paint: {
      'circle-radius': ['case', ['get', 'focused'], 9, 6],
      'circle-color': ['case', ['get', 'chosen'], '#fde047', 'rgba(0,0,0,0)'],
      'circle-stroke-color': ['case', ['get', 'chosen'], '#dc2626', '#a1a1aa'],
      'circle-stroke-width': ['case', ['get', 'focused'], 3, 2],
    } },
    { id: 'overlay-ghost', type: 'circle', source: 'overlay', filter: ['==', ['get', 'role'], 'ghost'], paint: {
      'circle-radius': 7,
      'circle-color': 'rgba(250,204,21,0.25)',
      'circle-stroke-width': 2,
      'circle-stroke-color': '#facc15',
    } },
    { id: 'overlay-port', type: 'circle', source: 'overlay', filter: ['in', ['get', 'role'], ['literal', ['port-in', 'port-out', 'port-source', 'port-target', 'port-linked']]], paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 17, ['match', ['get', 'role'], 'port-source', 5, 'port-target', 7, 3], 20, ['match', ['get', 'role'], 'port-source', 9, 'port-target', 12, 7]],
      'circle-color': ['match', ['get', 'role'], 'port-source', '#f59e0b', 'port-target', 'rgba(74,222,128,0.25)', '#14171c'],
      'circle-stroke-width': 2,
      'circle-stroke-color': ['match', ['get', 'role'], 'port-in', '#ef4444', 'port-out', '#22d3ee', 'port-target', '#4ade80', 'port-linked', '#facc15', '#ffffff'],
    } },
    { id: 'overlay-mid', type: 'circle', source: 'overlay', filter: ['==', ['get', 'role'], 'mid'], paint: {
      'circle-radius': 3.5,
      'circle-color': 'rgba(56,189,248,0.25)',
      'circle-stroke-color': COLORS.select,
      'circle-stroke-width': 1,
    } },
    { id: 'overlay-vertex', type: 'circle', source: 'overlay', filter: ['==', ['get', 'role'], 'vertex'], paint: {
      'circle-radius': ['case', ['get', 'junction'], 6, 4.5],
      'circle-color': ['case', ['get', 'junction'], '#0ea5e9', '#0b0c0e'],
      'circle-stroke-color': '#e0f2fe',
      'circle-stroke-width': 1.5,
    } },
    { id: 'overlay-node-hover', type: 'circle', source: 'overlay', filter: ['==', ['get', 'role'], 'node-hover'], paint: {
      'circle-radius': 8,
      'circle-color': 'rgba(125,211,252,0.25)',
      'circle-stroke-color': COLORS.hover,
      'circle-stroke-width': 2,
    } },
    { id: 'overlay-node-selected', type: 'circle', source: 'overlay', filter: ['==', ['get', 'role'], 'node-selected'], paint: {
      'circle-radius': 7,
      'circle-color': COLORS.select,
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 2,
    } },
    // Точки новой дороги: первая крупнее, пристыкованные к сети — зелёные, точка под курсором — призрак
    { id: 'overlay-draw-point', type: 'circle', source: 'overlay', filter: ['==', ['get', 'role'], 'draw-point'], paint: {
      'circle-radius': ['case', ['to-boolean', ['get', 'first']], 6.5, 5],
      'circle-color': '#141518',
      'circle-stroke-color': ['case', ['to-boolean', ['get', 'joined']], '#22c55e', COLORS.select],
      'circle-stroke-width': 2,
      'circle-opacity': ['case', ['to-boolean', ['get', 'ghost']], 0.5, 1],
      'circle-stroke-opacity': ['case', ['to-boolean', ['get', 'ghost']], 0.6, 1],
    } },
    { id: 'overlay-snap', type: 'circle', source: 'overlay', filter: ['==', ['get', 'role'], 'snap'], paint: {
      'circle-radius': 11,
      'circle-color': 'rgba(34,197,94,0.2)',
      'circle-stroke-color': '#22c55e',
      'circle-stroke-width': 2,
    } },
  ]
}

/** Какие слои видны в каждом режиме просмотра. Остальные слои зависят только от настроек. */
export const ENGINEERING_LAYERS = [
  'surface-tunnel', 'surface', 'junctions', 'markings-edge', 'tunnel-edge', 'markings-divider', 'markings-lane', 'markings-lane-solid', 'lane-line', 'lane-arrow',
  'bridge-shadow', 'bridge-outline', 'bridge-casing', 'surface-bridge', 'junctions-bridge', 'markings-bridge', 'lane-line-bridge', 'lane-arrow-bridge',
]
export const GRAPH_LAYERS = ['graph-links', 'graph-direction', 'graph-nodes']
export const TURN_LAYERS = ['turn-ribbon', 'turn-line', 'turn-ribbon-bridge', 'turn-line-bridge', 'turn-forbidden', 'turn-forbidden-sign']
/** Продолжение полос показывается вместе с полосами, даже если траектории манёвров скрыты. */
export const CONTINUATION_LAYERS = ['turn-continuation', 'turn-continuation-bridge']
export const SIM_LAYERS = ['sim-load', 'sim-flow', 'sim-bars', 'sim-bar-labels', 'sim-od', 'sim-zones', 'sim-jams', 'sim-signals']

export type ThemeName = 'light' | 'dark'

interface MapPalette {
  background: string
  building: string
  buildingEdge: string
  building3d: string
  green: string
  landuse: string
  water: string
  rail: string
  minor: string
  road: string
  tunnel: string
  bridge: string
  bridgeEdge: string
  bridgeOutline: string
  bridgeShadow: number
  road3d: string
  marking: string
  nodeFill: string
  nodeStroke: string
}

const PALETTES: Record<ThemeName, MapPalette> = {
  light: {
    background: '#f4f3ee',
    building: '#d9d6cf',
    buildingEdge: '#bdb9af',
    building3d: '#d2cfc7',
    green: '#dde9d2',
    landuse: '#ecebe4',
    water: '#b9d8e9',
    rail: '#8c8e93',
    minor: '#b5b0a6',
    road: '#868b94',
    tunnel: '#b7bac1',
    bridge: '#969ba4',
    bridgeEdge: '#3f444c',
    bridgeOutline: '#2b2f36',
    bridgeShadow: 0.28,
    road3d: '#a4a8af',
    marking: '#ffffff',
    nodeFill: '#ffffff',
    nodeStroke: '#20262d',
  },
  dark: {
    background: COLORS.background,
    building: COLORS.building,
    buildingEdge: COLORS.buildingEdge,
    building3d: '#4a4c52',
    green: COLORS.green,
    landuse: COLORS.landuse,
    water: COLORS.water,
    rail: COLORS.rail,
    minor: COLORS.minor,
    road: COLORS.road,
    tunnel: COLORS.tunnel,
    bridge: COLORS.bridge,
    bridgeEdge: COLORS.bridgeEdge,
    bridgeOutline: COLORS.bridgeOutline,
    bridgeShadow: 0.45,
    road3d: '#70747d',
    marking: COLORS.marking,
    nodeFill: '#141518',
    nodeStroke: '#e8ecf1',
  },
}

/** Цвета карты для темы: свойства слоёв, которые надо перекрасить. */
export function themePaint(theme: ThemeName): [string, string, unknown][] {
  const c = PALETTES[theme]
  return [
    ['background', 'background-color', c.background],
    ['landuse', 'fill-color', ['case', ['get', 'green'], c.green, c.landuse]],
    ['water-fill', 'fill-color', c.water],
    ['water-line', 'line-color', c.water],
    ['buildings', 'fill-color', c.building],
    ['buildings', 'fill-outline-color', c.buildingEdge],
    ['buildings-3d', 'fill-extrusion-color', c.building3d],
    ['other', 'line-color', c.minor],
    ['rail', 'line-color', c.rail],
    ['minor', 'line-color', c.minor],
    ['points', 'circle-color', c.minor],
    ['surface-tunnel', 'fill-color', c.tunnel],
    ['surface', 'fill-color', c.road],
    ['junctions', 'fill-color', c.road],
    ['surface-bridge', 'fill-color', c.bridge],
    ['junctions-bridge', 'fill-color', c.bridge],
    ['bridge-casing', 'line-color', c.bridgeEdge],
    ['bridge-outline', 'line-color', c.bridgeOutline],
    ['bridge-shadow', 'fill-opacity', c.bridgeShadow],
    // Опоры темнее настила, насыпь подходов чуть светлее: мост читается объёмом, как здание
    ['road-3d', 'fill-extrusion-color', ['match', ['get', 'kind'], 'pier', c.building3d, c.road3d]],
    ['markings-edge', 'line-color', c.marking],
    ['markings-divider', 'line-color', c.marking],
    ['markings-lane', 'line-color', c.marking],
    ['markings-lane-solid', 'line-color', c.marking],
    ['markings-bridge', 'line-color', c.marking],
    ['graph-nodes', 'circle-color', c.nodeFill],
    ['graph-nodes', 'circle-stroke-color', c.nodeStroke],
  ]
}

export type BasemapId =
  | 'none'
  | 'satellite'
  | 'hybrid'
  | 'scheme2gis'
  | 'yandexMap'
  | 'yandexSat'
  | 'cartoDark'
  | 'cartoLight'
  | 'osm'
  | 'custom'

/** Проекция, в которой нарезаны тайлы. Карта показывается в EPSG:3857, тайлы 3395 пересчитываются. */
export type TileCrs = 'EPSG:3857' | 'EPSG:3395'

export const TILE_CRS_OPTIONS: { id: TileCrs; label: string }[] = [
  { id: 'EPSG:3857', label: 'EPSG:3857, Web Mercator (OSM, Google, 2ГИС, Esri)' },
  { id: 'EPSG:3395', label: 'EPSG:3395, World Mercator (Яндекс)' },
]

export const BASEMAP_OPTIONS: { id: BasemapId; label: string }[] = [
  { id: 'none', label: 'Без подложки' },
  { id: 'satellite', label: 'Снимок Esri' },
  { id: 'hybrid', label: 'Снимок и дороги' },
  { id: 'scheme2gis', label: 'Схема 2ГИС' },
  { id: 'yandexMap', label: 'Яндекс Карты (EPSG:3395)' },
  { id: 'yandexSat', label: 'Яндекс Спутник (EPSG:3395)' },
  { id: 'osm', label: 'OSM' },
]

/** По адресу видно тайлы Яндекса: они в EPSG:3395, без пересчёта в Иркутске съезжают на 20,7 км к югу. */
export function guessTileCrs(url: string): TileCrs {
  return /yandex\.(net|ru|com)/i.test(url) ? 'EPSG:3395' : 'EPSG:3857'
}

const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services'
const CARTO = 'https://basemaps.cartocdn.com'
const carto = (style: string) =>
  ['a', 'b', 'c', 'd'].map((sub) => `https://${sub}.${CARTO.slice(8)}/${style}/{z}/{x}/{y}@2x.png`)

/**
 * Источники подложки. Предел maxzoom задан по реальному наличию данных: выше него MapLibre
 * растягивает последний уровень, а не просит пустые тайлы-заглушки.
 */
const BASEMAP_SOURCES: Record<Exclude<BasemapId, 'none' | 'custom'>, RasterSourceSpecification[]> = {
  satellite: [
    { type: 'raster', tiles: [`${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`], tileSize: 256, maxzoom: 19, attribution: 'Снимки © Esri, Maxar' },
  ],
  hybrid: [
    { type: 'raster', tiles: [`${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`], tileSize: 256, maxzoom: 19, attribution: 'Снимки © Esri, Maxar' },
    { type: 'raster', tiles: [`${ESRI}/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}`], tileSize: 256, maxzoom: 19 },
  ],
  scheme2gis: [
    { type: 'raster', tiles: ['https://tile0.maps.2gis.com/tiles?x={x}&y={y}&z={z}&v=1', 'https://tile1.maps.2gis.com/tiles?x={x}&y={y}&z={z}&v=1', 'https://tile2.maps.2gis.com/tiles?x={x}&y={y}&z={z}&v=1'], tileSize: 256, maxzoom: 18, attribution: '© 2ГИС' },
  ],
  cartoDark: [
    { type: 'raster', tiles: carto('dark_all'), tileSize: 256, maxzoom: 20, attribution: '© CARTO, © OpenStreetMap' },
  ],
  cartoLight: [
    { type: 'raster', tiles: carto('rastertiles/voyager'), tileSize: 256, maxzoom: 20, attribution: '© CARTO, © OpenStreetMap' },
  ],
  yandexMap: [
    {
      type: 'raster',
      tiles: [ellipsoidTileUrl('https://core-renderer-tiles.maps.yandex.net/tiles?l=map&x={x}&y={y}&z={z}&scale=1&lang=ru_RU')],
      tileSize: 256,
      maxzoom: 20,
      attribution: '© Яндекс',
    },
  ],
  yandexSat: [
    { type: 'raster', tiles: [ellipsoidTileUrl('https://core-sat.maps.yandex.net/tiles?l=sat&x={x}&y={y}&z={z}')], tileSize: 256, maxzoom: 19, attribution: '© Яндекс' },
  ],
  osm: [
    { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, maxzoom: 19, attribution: '© OpenStreetMap' },
  ],
}

export function isTileTemplate(url: string): boolean {
  return /^https:\/\/.+/.test(url) && ['{z}', '{x}', '{y}'].every((part) => url.includes(part))
}

export function basemapSource(id: BasemapId, customUrl: string, customCrs: TileCrs = 'EPSG:3857'): RasterSourceSpecification[] {
  if (id === 'none') return []
  if (id === 'custom') {
    const url = customUrl.trim()
    if (!isTileTemplate(url)) return []
    return [{ type: 'raster', tiles: [customCrs === 'EPSG:3395' ? ellipsoidTileUrl(url) : url], tileSize: 256, maxzoom: 20 }]
  }
  return BASEMAP_SOURCES[id]
}

/** Слои модели, прозрачность которых меняет ползунок: разметка остаётся, чтобы сверять её со снимком. */
/** Слои модели: ползунок «модель — карта» гасит их все вместе, а не только заливки. */
export const MODEL_LAYERS = [
  'landuse',
  'water-fill',
  'water-line',
  'buildings',
  'other',
  'rail',
  'minor',
  'surface-tunnel',
  'surface',
  'junctions',
  'markings-edge',
  'tunnel-edge',
  'markings-divider',
  'markings-lane',
  'markings-lane-solid',
  'turn-ribbon',
  'turn-line',
  'crossings-axis',
  'crossings-band',
  'crossings',
  'bridge-shadow',
  'bridge-outline',
  'bridge-casing',
  'surface-bridge',
  'junctions-bridge',
  'markings-bridge',
  'turn-ribbon-bridge',
  'turn-line-bridge',
  'arrows',
  'graph-links',
  'graph-direction',
  'graph-nodes',
  'points',
  'signals',
  'traffic-signs',
  'labels',
]
