import type { OsmDoc } from './doc'
import { dist, Projector } from './geo'
import { isDrivable } from './lanes'
import { setNodeTags } from './ops'
import { type Link, wayLevel } from './topology'
import type { OWay, Tags } from './types'

/** Высота уровня: габарит 5,5 м над дорогой и железной дорогой плюс толщина пролётного строения. */
export const LAYER_HEIGHT_M = 7
const AUTO_RAMP_M = 30
const MAX_RAMP_SHARE = 0.45
/** Подъём по подходу к мосту: уклон около 6 % на высоту уровня. */
const APPROACH_RAMP_M = 110
const MAX_APPROACH_SHARE = 0.9

export interface HeightProfile {
  /** Накопленная длина в точках участка. */
  along: number[]
  heights: number[]
}

function parseEle(tags: Tags | undefined): number | null {
  const value = Number.parseFloat(tags?.ele ?? '')
  return Number.isFinite(value) ? value : null
}

function smoothstep(t: number): number {
  const x = Math.min(1, Math.max(0, t))
  return x * x * (3 - 2 * x)
}

function wayAlong(doc: OsmDoc, way: OWay, projector: Projector | null): number[] {
  const along = [0]
  const p = projector ?? new Projector(doc.bounds)
  for (let i = 1; i < way.nds.length; i++) {
    const a = doc.nodes.get(way.nds[i - 1]!)
    const b = doc.nodes.get(way.nds[i]!)
    along.push(along[i - 1]! + (a && b ? dist(p.toXY(a), p.toXY(b)) : 0))
  }
  return along
}

/** Дорога уходит на землю в этом конце: соседняя проезжая дорога лежит ниже. */
function touchesGround(doc: OsmDoc, nodeId: number, way: OWay): boolean {
  return doc.waysOfNode(nodeId).some((id) => {
    if (id === way.id) return false
    const other = doc.ways.get(id)
    return !!other && isDrivable(other.tags) && wayLevel(other.tags ?? {}) < wayLevel(way.tags ?? {})
  })
}

/**
 * Высоты узлов дороги. Теги ele важнее всего: их задаёт инструмент плавного перехода.
 * Без них мост поднимается на высоту своего уровня, а у съезда на землю плавно опускается.
 */
export function wayHeights(doc: OsmDoc, way: OWay): Map<number, number> {
  const result = new Map<number, number>()
  const values = way.nds.map((id) => parseEle(doc.nodes.get(id)?.tags))
  const level = wayLevel(way.tags ?? {})
  // Обычная дорога на земле без ele и без моста на концах — самый частый случай: длины ей не нужны
  if (level <= 0 && values.every((value) => value === null)) {
    const startTop = level === 0 ? bridgeHeightAt(doc, way.nds[0]!, way) : 0
    const endTop = level === 0 ? bridgeHeightAt(doc, way.nds.at(-1)!, way) : 0
    if (startTop === 0 && endTop === 0) {
      for (const id of way.nds) result.set(id, 0)
      return result
    }
  }
  const along = wayAlong(doc, way, null)
  const total = along.at(-1) ?? 0

  if (values.some((value) => value !== null)) {
    way.nds.forEach((id, index) => {
      const own = values[index]
      if (own !== null && own !== undefined) {
        result.set(id, own)
        return
      }
      let previous = index - 1
      while (previous >= 0 && values[previous] === null) previous--
      let next = index + 1
      while (next < values.length && values[next] === null) next++
      const low = previous >= 0 ? values[previous]! : 0
      const high = next < values.length ? values[next]! : 0
      const lowAt = previous >= 0 ? along[previous]! : 0
      const highAt = next < values.length ? along[next]! : total
      const t = highAt > lowAt ? (along[index]! - lowAt) / (highAt - lowAt) : 0
      result.set(id, low + (high - low) * t)
    })
    return result
  }

  if (level > 0) {
    // Пролёт моста целиком на своей высоте: подъём к нему идёт по подходам, а не внутри пролёта.
    // Иначе короткий мост поднимался бы лишь серединой и выглядел плоским, а машины ехали бы под настилом
    const plateau = level * LAYER_HEIGHT_M
    if (!isBridgeLike(way.tags) && total > 0) {
      // Эстакада без тега bridge (просто layer=1) по-прежнему сама опускается к земле
      const ramp = Math.min(AUTO_RAMP_M, total * MAX_RAMP_SHARE)
      const startGround = touchesGround(doc, way.nds[0]!, way)
      const endGround = touchesGround(doc, way.nds.at(-1)!, way)
      way.nds.forEach((id, index) => {
        const position = along[index]!
        const fromStart = startGround && ramp > 0 ? smoothstep(position / ramp) : 1
        const fromEnd = endGround && ramp > 0 ? smoothstep((total - position) / ramp) : 1
        result.set(id, plateau * Math.min(fromStart, fromEnd))
      })
      return result
    }
    for (const id of way.nds) result.set(id, plateau)
    return result
  }
  // Подход к мосту: дорога на земле поднимается к его концу
  const startTop = level === 0 ? bridgeHeightAt(doc, way.nds[0]!, way) : 0
  const endTop = level === 0 ? bridgeHeightAt(doc, way.nds.at(-1)!, way) : 0
  if (startTop === 0 && endTop === 0) {
    for (const id of way.nds) result.set(id, 0)
    return result
  }
  const share = startTop > 0 && endTop > 0 ? MAX_RAMP_SHARE : MAX_APPROACH_SHARE
  const ramp = Math.min(APPROACH_RAMP_M, total * share)
  way.nds.forEach((id, index) => {
    const position = along[index]!
    const fromStart = startTop > 0 && ramp > 0 ? startTop * (1 - smoothstep(position / ramp)) : 0
    const fromEnd = endTop > 0 && ramp > 0 ? endTop * (1 - smoothstep((total - position) / ramp)) : 0
    result.set(id, Math.max(fromStart, fromEnd))
  })
  return result
}

function isBridgeLike(tags: Tags | undefined): boolean {
  return (!!tags?.bridge && tags.bridge !== 'no') || tags?.man_made === 'bridge'
}

/** Высота настила моста, который начинается или кончается в этом узле. 0 — моста нет. */
function bridgeHeightAt(doc: OsmDoc, nodeId: number, way: OWay): number {
  let top = 0
  for (const id of doc.waysOfNode(nodeId)) {
    if (id === way.id) continue
    const other = doc.ways.get(id)
    if (!other || !isDrivable(other.tags) || !isBridgeLike(other.tags)) continue
    const level = wayLevel(other.tags ?? {})
    if (level > 0) top = Math.max(top, level * LAYER_HEIGHT_M)
  }
  return top
}

export function linkHeights(doc: OsmDoc, link: Link): HeightProfile {
  const way = doc.ways.get(link.wayId)
  const map = way ? wayHeights(doc, way) : new Map<number, number>()
  const along = [0]
  for (let i = 1; i < link.points.length; i++) {
    along.push(along[i - 1]! + dist(link.points[i - 1]!, link.points[i]!))
  }
  return { along, heights: link.nodes.map((id) => map.get(id) ?? 0) }
}

export function heightAlong(profile: HeightProfile, position: number): number {
  const { along, heights } = profile
  if (position <= 0) return heights[0] ?? 0
  for (let i = 1; i < along.length; i++) {
    if (position <= along[i]!) {
      const span = along[i]! - along[i - 1]!
      const t = span > 1e-6 ? (position - along[i - 1]!) / span : 0
      return heights[i - 1]! + (heights[i]! - heights[i - 1]!) * t
    }
  }
  return heights.at(-1) ?? 0
}

/** Плавный переход по Z: записывает ele в узлы дороги по кривой без резких изломов. */
export function applyElevationRamp(
  doc: OsmDoc,
  projector: Projector,
  wayId: number,
  from: number,
  to: number,
): void {
  const way = doc.way(wayId)
  const along = wayAlong(doc, way, projector)
  const total = along.at(-1) ?? 0
  way.nds.forEach((id, index) => {
    const t = total > 0 ? along[index]! / total : 0
    const height = from + (to - from) * smoothstep(t)
    setNodeTags(doc, id, { ...doc.node(id).tags, ele: height.toFixed(2) })
  })
}

export function clearElevation(doc: OsmDoc, wayId: number): void {
  for (const id of new Set(doc.way(wayId).nds)) {
    const tags: Tags = { ...doc.node(id).tags }
    if (tags.ele === undefined) continue
    delete tags.ele
    setNodeTags(doc, id, tags)
  }
}

/** Наибольший уклон дороги в процентах. */
export function maxSlopePercent(doc: OsmDoc, way: OWay, projector: Projector): number {
  const heights = wayHeights(doc, way)
  let worst = 0
  for (let i = 1; i < way.nds.length; i++) {
    const a = doc.nodes.get(way.nds[i - 1]!)
    const b = doc.nodes.get(way.nds[i]!)
    if (!a || !b) continue
    const run = dist(projector.toXY(a), projector.toXY(b))
    if (run < 1) continue
    const rise = Math.abs((heights.get(b.id) ?? 0) - (heights.get(a.id) ?? 0))
    worst = Math.max(worst, (rise / run) * 100)
  }
  return worst
}
