import type { OsmDoc } from './doc'
import { pointInPolygon, type Projector } from './geo'
import { parseProfile } from './lanes'
import { readLaneValue, writeLaneValue } from './laneTags'
import { addNode } from './ops'
import type { LatLon, OWay, Tags, XY } from './types'

/**
 * Транспортные районы и ручная интенсивность по полосам.
 *
 * Район — замкнутый контур вне дорог с тегами tp:type=zone, tp:residents (жители),
 * tp:jobs (рабочие места). У контура нет highway, поэтому netconvert и MATSim его не читают,
 * а сеть в выгрузке не меняется. От жителей и рабочих мест считается спрос района в час пик.
 *
 * Интенсивность полос — теги tp:volume:lanes(:forward|:backward) как у turn:lanes: значения
 * слева направо по ходу движения, авт/ч. На въезде в сеть они задают поток вместо оценки.
 */

export const ZONE_TYPE = 'zone'
export const RESIDENTS_TAG = 'tp:residents'
export const JOBS_TAG = 'tp:jobs'
export const VOLUME_BASE = 'tp:volume'
/** Площадь квартир на жителя и офисов на рабочее место, м²: для оценки по застройке. */
export const M2_PER_RESIDENT = 25
export const M2_PER_JOB = 30

export interface UserZone {
  wayId: number
  name: string
  residents: number
  jobs: number
  polygon: XY[]
  centroid: XY
}

export function isZoneWay(way: OWay | undefined): boolean {
  return way?.tags?.['tp:type'] === ZONE_TYPE
}

function count(value: string | undefined): number {
  const parsed = Number.parseFloat(value ?? '')
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

export function polygonArea(points: XY[]): number {
  let area = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!
    const b = points[(i + 1) % points.length]!
    area += a.x * b.y - b.x * a.y
  }
  return Math.abs(area) / 2
}

function centroidOf(points: XY[]): XY {
  let area = 0
  let cx = 0
  let cy = 0
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!
    const b = points[(i + 1) % points.length]!
    const f = a.x * b.y - b.x * a.y
    area += f
    cx += (a.x + b.x) * f
    cy += (a.y + b.y) * f
  }
  if (Math.abs(area) < 1e-9) {
    return { x: points.reduce((s, p) => s + p.x, 0) / points.length, y: points.reduce((s, p) => s + p.y, 0) / points.length }
  }
  return { x: cx / (3 * area), y: cy / (3 * area) }
}

export function zonePolygon(doc: OsmDoc, projector: Projector, way: OWay): XY[] {
  const nds = way.nds.length > 1 && way.nds[0] === way.nds.at(-1) ? way.nds.slice(0, -1) : way.nds
  return nds.map((id) => doc.nodes.get(id)).filter((node): node is NonNullable<typeof node> => !!node).map((node) => projector.toXY(node))
}

export function readUserZones(doc: OsmDoc, projector: Projector): UserZone[] {
  const zones: UserZone[] = []
  for (const way of doc.ways.values()) {
    if (!isZoneWay(way)) continue
    const polygon = zonePolygon(doc, projector, way)
    if (polygon.length < 3) continue
    zones.push({
      wayId: way.id,
      name: way.tags?.name ?? `Район ${way.id}`,
      residents: count(way.tags?.[RESIDENTS_TAG]),
      jobs: count(way.tags?.[JOBS_TAG]),
      polygon,
      centroid: centroidOf(polygon),
    })
  }
  return zones
}

export function zoneContaining(zones: UserZone[], point: XY): UserZone | undefined {
  return zones.find((zone) => pointInPolygon(point, zone.polygon))
}

/** Новый район по точкам контура. Узлы контура отдельные: к дорогам район не приклеивается. */
export function createZone(doc: OsmDoc, points: LatLon[], tags: Tags): number {
  const nds = points.map((point) => addNode(doc, point))
  const id = doc.newId()
  doc.putWay({ id, nds: [...nds, nds[0]!], tags: { 'tp:type': ZONE_TYPE, ...tags } })
  return id
}

/** Интенсивность каждой полосы направления, авт/ч; null — не задана. */
export function laneVolumes(tags: Tags, forward: boolean): (number | null)[] {
  const profile = parseProfile(tags)
  const lanes = profile.oneway ? Math.max(profile.forward, profile.backward) : forward ? profile.forward : profile.backward
  return Array.from({ length: lanes }, (_, lane) => {
    const value = Number.parseFloat(readLaneValue(tags, VOLUME_BASE, forward, lane))
    return Number.isFinite(value) && value >= 0 ? value : null
  })
}

/** Сумма заданных интенсивностей направления или null, если ни одна полоса не задана. */
export function countedVolume(tags: Tags, forward: boolean): number | null {
  const values = laneVolumes(tags, forward).filter((value): value is number => value !== null)
  return values.length ? values.reduce((sum, value) => sum + value, 0) : null
}

export function withLaneVolume(tags: Tags, forward: boolean, lane: number, value: string): Tags {
  const clean = value.trim() === '' ? '' : String(Math.max(0, Math.round(Number(value) || 0)))
  return writeLaneValue(tags, VOLUME_BASE, forward, lane, clean)
}
