import type { OsmDoc } from './doc'
import { dist, pointAlong, type Projector } from './geo'
import { isOneway } from './lanes'
import { insertNodeOnWay, setNodeTags } from './ops'
import type { Arm, Network } from './topology'
import { signApplies } from './traffic'
import type { LatLon, Tags } from './types'

/**
 * Черновая расстановка знаков «Уступи дорогу» (2.4) по классу дорог.
 *
 * Это не данные ПОДД, а предложение для проверки человеком: главной считается дорога старшего класса OSM,
 * если по ней на перекрёсток выходят хотя бы два подхода. Подходы младшего класса получают знак.
 * Не трогаются перекрёстки со светофором, выезды со служебных проездов (ПДД п. 8.3 — выезд
 * с прилегающей территории уступает без знака) и узлы, где главную по классу не определить.
 * На кольце уступают въезды.
 */

export const RANK: Record<string, number> = {
  motorway: 9,
  trunk: 8,
  primary: 7,
  secondary: 6,
  tertiary: 5,
  unclassified: 4,
  residential: 3,
  living_street: 2,
}

const SIGN_MIN_M = 3
const SIGN_MAX_M = 30
const SIGN_NEW_M = 8
/** Знак дальше этого от перекрёстка к нему уже не относится. */
const EXISTING_REACH_M = 40

export const CLASS_LABELS: Record<string, string> = {
  motorway: 'магистраль',
  trunk: 'скоростная',
  primary: 'основная',
  secondary: 'второстепенная',
  tertiary: 'районная',
  unclassified: 'местная',
  residential: 'жилая улица',
  living_street: 'жилая зона',
}

export interface PrioritySuggestion {
  id: string
  junction: number
  wayId: number
  /** Узел дороги, на который встанет знак. Пусто — узел будет вставлен. */
  signNode: number | null
  position: LatLon
  direction: 'forward' | 'backward' | null
  roadName: string
  roadClass: string
  mainName: string
  mainClass: string
  roundabout: boolean
}

export interface PrioritySummary {
  junctions: number
  signalized: number
  equal: number[]
  unclear: number[]
  alreadySigned: number
  suggestions: PrioritySuggestion[]
}

function baseClass(highway: string | undefined): string {
  return (highway ?? '').replace(/_link$/, '')
}

function rankOf(tags: Tags | undefined): number | null {
  const highway = tags?.highway ?? ''
  if (highway === 'service' || highway === 'track') return null
  const rank = RANK[baseClass(highway)]
  if (rank === undefined) return null
  // Съезд уступает дороге своего класса
  return highway.endsWith('_link') ? rank - 0.5 : rank
}

function isRoundabout(tags: Tags | undefined): boolean {
  return tags?.junction === 'roundabout' || tags?.junction === 'circular'
}

/** Едут ли машины по этому подходу к узлу по ходу дороги. */
export function travelsForward(arm: Arm): boolean {
  return !arm.atStart
}

export function hasSignTowards(doc: OsmDoc, arm: Arm): boolean {
  const ids = arm.atStart ? arm.link.nodes : [...arm.link.nodes].reverse()
  const points = arm.atStart ? arm.link.points : [...arm.link.points].reverse()
  let walked = 0
  for (let i = 1; i < ids.length; i++) {
    walked += dist(points[i - 1]!, points[i]!)
    if (walked > EXISTING_REACH_M) break
    if (signApplies(doc.nodes.get(ids[i]!)?.tags, travelsForward(arm))) return true
  }
  return false
}

/** Место знака: ближайший свободный узел дороги в 3–30 м от перекрёстка, иначе новая точка в 8 м. */
export function signPlace(doc: OsmDoc, projector: Projector, arm: Arm): { node: number | null; position: LatLon } {
  const ids = arm.atStart ? arm.link.nodes : [...arm.link.nodes].reverse()
  const points = arm.atStart ? arm.link.points : [...arm.link.points].reverse()
  const reach = Math.min(SIGN_MAX_M, arm.link.length / 2)
  let walked = 0
  for (let i = 1; i < ids.length - 1; i++) {
    walked += dist(points[i - 1]!, points[i]!)
    if (walked > reach) break
    const node = doc.nodes.get(ids[i]!)
    if (walked >= SIGN_MIN_M && node && !node.tags?.highway && !node.tags?.railway && doc.waysOfNode(node.id).length === 1) {
      return { node: node.id, position: { lat: node.lat, lon: node.lon } }
    }
  }
  const along = Math.min(SIGN_NEW_M, arm.link.length / 2)
  return { node: null, position: projector.toLatLon(pointAlong(points, along).point) }
}

export function suggestPrioritySigns(doc: OsmDoc, projector: Projector, network: Network): PrioritySummary {
  const summary: PrioritySummary = { junctions: 0, signalized: 0, equal: [], unclear: [], alreadySigned: 0, suggestions: [] }
  for (const [junction, arms] of network.arms) {
    if (arms.length < 3) continue
    summary.junctions++
    const tags = doc.nodes.get(junction)?.tags
    if (tags?.highway === 'traffic_signals') {
      summary.signalized++
      continue
    }
    const wayTags = (arm: Arm) => doc.ways.get(arm.link.wayId)?.tags
    const ring = arms.filter((arm) => isRoundabout(wayTags(arm)))

    let main: Arm[]
    let minor: Arm[]
    if (ring.length > 0 && ring.length < arms.length) {
      main = ring
      minor = arms.filter((arm) => !isRoundabout(wayTags(arm)))
    } else {
      const ranked = arms.map((arm) => ({ arm, rank: rankOf(wayTags(arm)) }))
      const known = ranked.filter((item) => item.rank !== null)
      if (known.length < 2) continue
      const top = Math.max(...known.map((item) => item.rank!))
      main = known.filter((item) => item.rank === top).map((item) => item.arm)
      minor = known.filter((item) => item.rank! < top).map((item) => item.arm)
      if (minor.length === 0) {
        summary.equal.push(junction)
        continue
      }
      // Главная по классу одна: дорога здесь кончается или поворачивает, решать человеку
      if (main.length < 2) {
        summary.unclear.push(junction)
        continue
      }
    }

    const mainTags = wayTags(main[0]!)
    for (const arm of minor) {
      if (arm.lanesIn === 0) continue
      if (hasSignTowards(doc, arm)) {
        summary.alreadySigned++
        continue
      }
      const road = wayTags(arm) ?? {}
      const place = signPlace(doc, projector, arm)
      summary.suggestions.push({
        id: `${junction}-${arm.link.wayId}-${arm.atStart ? 's' : 'e'}`,
        junction,
        wayId: arm.link.wayId,
        signNode: place.node,
        position: place.position,
        direction: isOneway(road) ? null : travelsForward(arm) ? 'forward' : 'backward',
        roadName: road.name ?? `дорога ${arm.link.wayId}`,
        roadClass: road.highway ?? '',
        mainName: mainTags?.name ?? `дорога ${main[0]!.link.wayId}`,
        mainClass: mainTags?.highway ?? '',
        roundabout: ring.length > 0,
      })
    }
  }
  return summary
}

/** Ставит выбранные знаки. Возвращает узлы, на которых они оказались. */
export function applyPrioritySigns(doc: OsmDoc, projector: Projector, suggestions: PrioritySuggestion[]): number[] {
  const placed: number[] = []
  for (const item of suggestions) {
    const nodeId = item.signNode ?? insertNodeOnWay(doc, projector, item.wayId, item.position)
    const tags: Tags = { ...(doc.node(nodeId).tags ?? {}), highway: 'give_way' }
    if (item.direction) tags.direction = item.direction
    else delete tags.direction
    setNodeTags(doc, nodeId, tags)
    placed.push(nodeId)
  }
  return placed
}
