import type {
  ExpressionSpecification,
  LayerSpecification,
  RasterSourceSpecification,
  SourceSpecification,
} from 'maplibre-gl'

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
  'simJams',
  'simSignals',
  'other',
  'points',
  'transitLines',
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
      // Свободные дороги не спорят с пробками: заметнее всего то, что требует внимания
      'fill-opacity': ['match', ['coalesce', ['feature-state', 'los'], -1], 0, 0.28, 1, 0.42, 2, 0.62, 3, 0.72, 4, 0.8, 5, 0.88, 0],
    } },
    { id: 'markings-edge', type: 'line', source: 'markings', minzoom: 15, filter: ['all', ground, ['==', ['get', 'kind'], 'edge']], paint: {
      'line-color': COLORS.marking,
      'line-width': m(0.14, 0.4),
      'line-opacity': 0.55,
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
    { id: 'lane-line', type: 'line', source: 'laneLines', minzoom: LANE_LINE_ZOOM, layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: {
      'line-color': COLORS.laneLine,
      'line-width': ['interpolate', ['linear'], ['zoom'], LANE_LINE_ZOOM, 0.8, 20, 2.2],
    } },
    { id: 'lane-arrow', type: 'symbol', source: 'laneLines', minzoom: LANE_LINE_ZOOM + 0.5, layout: {
      'symbol-placement': 'line',
      'symbol-spacing': 90,
      'icon-image': 'direction',
      'icon-rotate': 90,
      'icon-size': ['interpolate', ['linear'], ['zoom'], LANE_LINE_ZOOM, 0.35, 20, 0.7],
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    } },
    { id: 'turn-ribbon', type: 'line', source: 'turnPaths', minzoom: 15, paint: {
      'line-color': APPROACH_COLOR,
      'line-width': m(3, 1.5),
      'line-opacity': 0.22,
    } },
    { id: 'turn-line', type: 'line', source: 'turnPaths', minzoom: 15.5, paint: {
      'line-color': APPROACH_COLOR,
      'line-width': m(0.3, 0.8),
      'line-opacity': 0.9,
    } },
    { id: 'crossings', type: 'fill', source: 'crossings', minzoom: 15, paint: {
      'fill-color': '#e8e3cf',
      'fill-opacity': 0.9,
    } },

    { id: 'bridge-casing', type: 'line', source: 'markings', filter: ['all', elevated, ['==', ['get', 'kind'], 'edge']], paint: {
      'line-color': COLORS.bridgeEdge,
      'line-width': m(0.5, 1.2),
    } },
    { id: 'surface-bridge', type: 'fill', source: 'surface', filter: elevated, paint: {
      'fill-color': COLORS.bridge,
    } },
    { id: 'junctions-bridge', type: 'fill', source: 'junctions', filter: elevated, paint: {
      'fill-color': COLORS.bridge,
    } },
    { id: 'markings-bridge', type: 'line', source: 'markings', minzoom: 15, filter: ['all', elevated, ['!=', ['get', 'kind'], 'edge']], paint: {
      'line-color': COLORS.marking,
      'line-width': m(0.16, 0.5),
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
    } },

    { id: 'graph-links', type: 'line', source: 'graphLinks', layout: { visibility: 'none', 'line-cap': 'round' }, paint: {
      'line-color': ['match', ['get', 'highway'],
        'motorway', '#ef4444', 'trunk', '#f97316', 'primary', '#f59e0b',
        'secondary', '#eab308', 'tertiary', '#2dd4bf', 'residential', '#60a5fa',
        'unclassified', '#60a5fa', 'living_street', '#a78bfa', 'service', '#71717a', '#a1a1aa'],
      'line-width': ['interpolate', ['linear'], ['zoom'], 13, 0.7, 17, 1.3, 20, 2.4]
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
    { id: 'sim-bars', type: 'line', source: 'simBars', layout: { visibility: 'none', 'line-cap': 'butt', 'line-join': 'round' }, paint: {
      'line-color': ['match', ['coalesce', ['feature-state', 'los'], -1],
        0, LOS_COLORS[0]!, 1, LOS_COLORS[1]!, 2, LOS_COLORS[2]!, 3, LOS_COLORS[3]!, 4, LOS_COLORS[4]!, 5, LOS_COLORS[5]!,
        'rgba(0,0,0,0)'],
      // Столбик растёт вместе с масштабом и лежит справа по ходу движения
      'line-width': ['interpolate', ['exponential', 2], ['zoom'],
        13, ['*', 0.25, ['coalesce', ['feature-state', 'w'], 0]],
        17, ['coalesce', ['feature-state', 'w'], 0],
        20, ['*', 4, ['coalesce', ['feature-state', 'w'], 0]]],
      'line-offset': ['interpolate', ['exponential', 2], ['zoom'],
        13, ['*', 0.125, ['coalesce', ['feature-state', 'w'], 0]],
        17, ['*', 0.5, ['coalesce', ['feature-state', 'w'], 0]],
        20, ['*', 2, ['coalesce', ['feature-state', 'w'], 0]]],
      'line-opacity': 0.92,
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
    { id: 'node-dots', type: 'circle', source: 'graphNodes', minzoom: 13, filter: ['>=', ['get', 'degree'], 3], paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 2.5, 18, 5, 20, 7],
      'circle-color': '#e5e7eb',
      'circle-stroke-color': '#111827',
      'circle-stroke-width': 1,
    } },
    { id: 'net-stop-point', type: 'circle', source: 'netStops', minzoom: 14, filter: ['==', ['get', 'kind'], 'point'], paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 14, 3, 18, 6],
      'circle-color': '#2563eb',
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 1,
    } },
    { id: 'net-stop-area', type: 'circle', source: 'netStops', minzoom: 14, filter: ['==', ['get', 'kind'], 'area'], paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 14, 3, 18, 6],
      'circle-color': 'rgba(37,99,235,0.2)',
      'circle-stroke-color': '#60a5fa',
      'circle-stroke-width': 1.5,
    } },
    { id: 'net-stop', type: 'circle', source: 'netStops', minzoom: 14, filter: ['==', ['get', 'kind'], 'stop'], paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 14, 6, 18, 14],
      'circle-color': 'rgba(0,0,0,0)',
      'circle-stroke-color': '#93c5fd',
      'circle-stroke-width': 2,
    } },
    { id: 'traffic-lane', type: 'line', source: 'trafficLoad', layout: { visibility: 'none', 'line-cap': 'round', 'line-join': 'round' }, paint: {
      'line-color': ['interpolate', ['linear'], ['get', 'ratio'], 0, '#22c55e', 0.5, '#facc15', 0.8, '#f97316', 1, '#dc2626'],
      'line-width': ['interpolate', ['linear'], ['zoom'], 13, ['+', 1, ['*', ['get', 'ratio'], 2]], 19, ['+', 3, ['*', ['get', 'ratio'], 7]]],
      'line-opacity': 0.9,
    } },
    { id: 'overlay-ribbon', type: 'fill', source: 'overlay', filter: ['==', ['get', 'role'], 'ribbon'], paint: {
      'fill-color': COLORS.accent,
      'fill-opacity': 0.3,
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
      'line-color': COLORS.accentSoft,
      'line-width': 2.5,
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
    { id: 'overlay-turn', type: 'line', source: 'overlay', filter: ['==', ['get', 'role'], 'turn-selected'], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: {
      'line-color': '#ffffff',
      'line-width': 4,
    } },
    { id: 'overlay-turn-end', type: 'circle', source: 'overlay', filter: ['in', ['get', 'role'], ['literal', ['turn-start', 'turn-end']]], paint: {
      'circle-radius': 7,
      'circle-color': ['match', ['get', 'role'], 'turn-start', '#22c55e', '#ef4444'],
      'circle-stroke-width': 2,
      'circle-stroke-color': '#ffffff',
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
    { id: 'net-stop-link', type: 'line', source: 'netStops', minzoom: 15.5, filter: ['==', ['get', 'kind'], 'link'], paint: {
      'line-color': '#60a5fa',
      'line-width': 1.2,
      'line-dasharray': [2, 2],
    } },
    { id: 'overlay-band', type: 'line', source: 'overlay', filter: ['==', ['get', 'role'], 'band'], layout: { 'line-cap': 'round' }, paint: {
      'line-color': '#facc15',
      'line-width': 2,
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
    { id: 'overlay-draw-point', type: 'circle', source: 'overlay', filter: ['==', ['get', 'role'], 'draw-point'], paint: {
      'circle-radius': 5,
      'circle-color': '#141518',
      'circle-stroke-color': COLORS.accentSoft,
      'circle-stroke-width': 2,
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
  'surface-tunnel', 'surface', 'junctions', 'markings-edge', 'markings-divider', 'markings-lane', 'markings-lane-solid', 'lane-line', 'lane-arrow',
  'bridge-casing', 'surface-bridge', 'junctions-bridge', 'markings-bridge',
]
export const GRAPH_LAYERS = ['graph-links', 'graph-direction', 'graph-nodes']
export const TURN_LAYERS = ['turn-ribbon', 'turn-line']
export const SIM_LAYERS = ['sim-load', 'sim-bars', 'sim-bar-labels', 'sim-od', 'sim-zones', 'sim-jams', 'sim-signals']

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
  road3d: string
  marking: string
  nodeFill: string
  nodeStroke: string
  crossing: string
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
    road3d: '#a4a8af',
    marking: '#ffffff',
    nodeFill: '#ffffff',
    nodeStroke: '#20262d',
    crossing: '#ffffff',
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
    road3d: '#70747d',
    marking: COLORS.marking,
    nodeFill: '#141518',
    nodeStroke: '#e8ecf1',
    crossing: '#e8e3cf',
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
    ['road-3d', 'fill-extrusion-color', c.road3d],
    ['markings-edge', 'line-color', c.marking],
    ['markings-divider', 'line-color', c.marking],
    ['markings-lane', 'line-color', c.marking],
    ['markings-lane-solid', 'line-color', c.marking],
    ['markings-bridge', 'line-color', c.marking],
    ['crossings', 'fill-color', c.crossing],
    ['graph-nodes', 'circle-color', c.nodeFill],
    ['graph-nodes', 'circle-stroke-color', c.nodeStroke],
  ]
}

export type BasemapId = 'none' | 'satellite' | 'hybrid' | 'scheme2gis' | 'cartoDark' | 'cartoLight' | 'osm' | 'custom'

export const BASEMAP_OPTIONS: { id: BasemapId; label: string }[] = [
  { id: 'none', label: 'Без подложки' },
  { id: 'satellite', label: 'Снимок Esri' },
  { id: 'hybrid', label: 'Снимок и дороги' },
  { id: 'scheme2gis', label: 'Схема 2ГИС' },
  { id: 'osm', label: 'OSM' },
]

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
  osm: [
    { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, maxzoom: 19, attribution: '© OpenStreetMap' },
  ],
}

export function basemapSource(id: BasemapId, customUrl: string): RasterSourceSpecification[] {
  if (id === 'none') return []
  if (id === 'custom') {
    const url = customUrl.trim()
    return /^https:\/\/.+\{z\}.+/.test(url) ? [{ type: 'raster', tiles: [url], tileSize: 256, maxzoom: 20 }] : []
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
  'markings-divider',
  'markings-lane',
  'markings-lane-solid',
  'turn-ribbon',
  'turn-line',
  'crossings',
  'bridge-casing',
  'surface-bridge',
  'junctions-bridge',
  'markings-bridge',
  'arrows',
  'graph-links',
  'graph-direction',
  'graph-nodes',
  'points',
  'signals',
  'traffic-signs',
  'labels',
]
