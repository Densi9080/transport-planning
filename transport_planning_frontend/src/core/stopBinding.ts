import type { OsmDoc } from './doc'
import { add, dist, nearestOnSegment, type Projector, scale, sub, unit } from './geo'
import { isDrivable } from './lanes'
import { insertNodeOnWay, setNodeTags } from './ops'
import { areaKey, STOP_AREA_TAG } from './stops'
import type { Member, ONode, Tags, XY } from './types'

/**
 * Привязка остановок к графу. В OSM автобусная остановка часто записана только платформой
 * (highway=bus_stop у обочины), а точки на дороге, где встаёт автобус, нет. Для графа, как в Visum,
 * нужен пункт остановки на отрезке: его ставим на дорогу маршрута напротив платформы и
 * вписываем в остановку (stop_area) и в маршруты ролью stop перед платформой (схема PTv2).
 */

/** Дальше этого платформа уже не «у дороги»: привязку надо делать вручную. */
export const BIND_REACH_M = 35
/** Пункт с тем же названием ближе этого уже обслуживает платформу. */
const SAME_STOP_M = 40
/** Узел дороги ближе этого используется как пункт, а не дублируется рядом. */
const REUSE_NODE_M = 2
/** От перекрёстка пункт отодвигается хотя бы на столько, чтобы не встать в узел развязки. */
const JUNCTION_GAP_M = 6

const ROAD_MODE_KEYS = ['bus', 'trolleybus', 'share_taxi', 'minibus'] as const

export interface StopBinding {
  platform: number
  name: string
  wayId: number
  /** Точка на оси дороги, куда встанет пункт. */
  point: XY
  distanceM: number
  /** Узел дороги, который станет пунктом, вместо нового. */
  reuseNode: number | null
  /** Маршруты, где платформа есть, а дорога привязки — нет: туда пункт не добавляется. */
  routesOffRoad: number[]
}

function isRoadPlatform(node: ONode, doc: OsmDoc): boolean {
  const tags = node.tags
  if (!tags) return false
  if (tags.railway || (tags.tram === 'yes' && !tags.bus && !tags.trolleybus)) return false
  const platform = tags.highway === 'bus_stop' || (tags.public_transport === 'platform' && ROAD_MODE_KEYS.some((key) => tags[key] === 'yes'))
  // Сама точка на проезжей части уже и есть пункт
  return platform && !doc.waysOfNode(node.id).some((id) => isDrivable(doc.ways.get(id)?.tags))
}

function isStopPositionOnRoad(node: ONode | undefined, doc: OsmDoc): boolean {
  return !!node && node.tags?.public_transport === 'stop_position' && doc.waysOfNode(node.id).some((id) => isDrivable(doc.ways.get(id)?.tags))
}

/** Есть ли у платформы пункт на дороге: в её остановке, по тегу привязки или рядом с тем же названием. */
function hasStopPosition(doc: OsmDoc, projector: Projector, platform: ONode): boolean {
  const key = areaKey('node', platform.id)
  for (const relation of doc.relations.values()) {
    if (relation.tags?.public_transport !== 'stop_area') continue
    if (!relation.members.some(([type, ref]) => type === 'node' && ref === platform.id)) continue
    if (relation.members.some(([type, ref, role]) => type === 'node' && role.startsWith('stop') && isStopPositionOnRoad(doc.nodes.get(ref), doc))) return true
  }
  const origin = projector.toXY(platform)
  const name = platform.tags?.name
  for (const node of doc.nodes.values()) {
    if (!isStopPositionOnRoad(node, doc)) continue
    if (node.tags?.[STOP_AREA_TAG] === key) return true
    if (name && node.tags?.name === name && dist(projector.toXY(node), origin) < SAME_STOP_M) return true
  }
  return false
}

function routesWith(doc: OsmDoc, nodeId: number) {
  return [...doc.relations.values()].filter(
    (relation) => relation.tags?.type === 'route' && relation.members.some(([type, ref]) => type === 'node' && ref === nodeId),
  )
}

function routeWays(members: Member[]): Set<number> {
  return new Set(members.filter(([type, , role]) => type === 'way' && !/^(stop|platform)/.test(role)).map(([, ref]) => ref))
}

/** Ближайшее место на дороге среди заданных; узлы развязок обходятся стороной. */
function nearestPlace(doc: OsmDoc, projector: Projector, origin: XY, wayIds: Iterable<number>) {
  let best: { wayId: number; point: XY; distanceM: number; reuseNode: number | null } | null = null
  for (const wayId of wayIds) {
    const way = doc.ways.get(wayId)
    if (!way || !isDrivable(way.tags)) continue
    for (let i = 1; i < way.nds.length; i++) {
      const a = doc.nodes.get(way.nds[i - 1]!)
      const b = doc.nodes.get(way.nds[i]!)
      if (!a || !b) continue
      const pa = projector.toXY(a)
      const pb = projector.toXY(b)
      const hit = nearestOnSegment(origin, pa, pb)
      if (hit.distance >= (best?.distanceM ?? BIND_REACH_M)) continue
      const length = dist(pa, pb)
      let point = hit.point
      let reuseNode: number | null = null
      for (const [node, end, other] of [[a, pa, pb], [b, pb, pa]] as const) {
        const gap = dist(point, end)
        const junction = doc.waysOfNode(node.id).filter((id) => isDrivable(doc.ways.get(id)?.tags)).length > 1
        if (junction && gap < JUNCTION_GAP_M) {
          // Отодвигаем от перекрёстка вдоль отрезка, но не дальше его середины
          point = add(end, scale(unit(sub(other, end)), Math.min(JUNCTION_GAP_M, length / 2)))
        } else if (!junction && gap < REUSE_NODE_M && !node.tags?.highway) {
          reuseNode = node.id
          point = end
        }
      }
      best = { wayId, point, distanceM: hit.distance, reuseNode }
    }
  }
  return best
}

/** Платформы у дороги, у которых нет пункта на графе, и место для него. */
export function unboundPlatforms(doc: OsmDoc, projector: Projector): StopBinding[] {
  const result: StopBinding[] = []
  for (const node of doc.nodes.values()) {
    if (!isRoadPlatform(node, doc) || hasStopPosition(doc, projector, node)) continue
    const origin = projector.toXY(node)
    const routes = routesWith(doc, node.id)
    const coverage = new Map<number, number>()
    for (const relation of routes) for (const wayId of routeWays(relation.members)) coverage.set(wayId, (coverage.get(wayId) ?? 0) + 1)
    // Дорога, по которой идёт больше всего маршрутов этой платформы, а из равных — ближайшая.
    // Просто ближайшая не годится: у остановки часто ближе съезд, где ходит один маршрут из двадцати
    let place: ReturnType<typeof nearestPlace> = null
    let bestCoverage = 0
    for (const [wayId, count] of coverage) {
      const candidate = nearestPlace(doc, projector, origin, [wayId])
      if (!candidate) continue
      if (count > bestCoverage || (count === bestCoverage && candidate.distanceM < place!.distanceM)) {
        place = candidate
        bestCoverage = count
      }
    }
    place ??= nearestPlace(doc, projector, origin, doc.ways.keys())
    if (!place) continue
    result.push({
      platform: node.id,
      name: node.tags?.name ?? '',
      ...place,
      routesOffRoad: routes.filter((relation) => !routeWays(relation.members).has(place.wayId)).map((relation) => relation.id),
    })
  }
  return result
}

const STOP_ROLE_OF: Record<string, string> = {
  platform: 'stop',
  platform_entry_only: 'stop_entry_only',
  platform_exit_only: 'stop_exit_only',
}

/** Ставит пункт на дорогу и вписывает его в остановку и маршруты. Возвращает id пункта. */
export function bindPlatform(doc: OsmDoc, projector: Projector, binding: StopBinding): number {
  const platform = doc.node(binding.platform)
  const nodeId = binding.reuseNode ?? insertNodeOnWay(doc, projector, binding.wayId, projector.toLatLon(binding.point))
  const modes: Tags = {}
  for (const key of ROAD_MODE_KEYS) if (platform.tags?.[key] === 'yes') modes[key] = 'yes'
  for (const relation of routesWith(doc, platform.id)) {
    const mode = relation.tags?.route
    if (mode && (ROAD_MODE_KEYS as readonly string[]).includes(mode)) modes[mode] = 'yes'
  }
  if (!Object.keys(modes).length) modes.bus = 'yes'
  setNodeTags(doc, nodeId, {
    ...doc.node(nodeId).tags,
    public_transport: 'stop_position',
    ...modes,
    ...(platform.tags?.name ? { name: platform.tags.name } : {}),
    [STOP_AREA_TAG]: areaKey('node', platform.id),
  })
  // Платформа у обочины по схеме PTv2 — платформа, а не пункт: так её понимают редактор и OSM
  if (platform.tags?.public_transport !== 'platform') setNodeTags(doc, platform.id, { ...platform.tags, public_transport: 'platform' })

  let inStopArea = false
  for (const relation of [...doc.relations.values()]) {
    if (relation.tags?.public_transport !== 'stop_area') continue
    if (!relation.members.some(([type, ref]) => type === 'node' && ref === platform.id)) continue
    inStopArea = true
    if (!relation.members.some(([type, ref]) => type === 'node' && ref === nodeId)) {
      doc.putRelation({ ...relation, members: [['node', nodeId, 'stop'], ...relation.members] })
    }
  }
  if (!inStopArea) {
    doc.putRelation({
      id: doc.newId(),
      members: [['node', nodeId, 'stop'], ['node', platform.id, 'platform']],
      tags: { type: 'public_transport', public_transport: 'stop_area', ...(platform.tags?.name ? { name: platform.tags.name } : {}) },
    })
  }

  for (const relation of routesWith(doc, platform.id)) {
    if (!routeWays(relation.members).has(binding.wayId)) continue
    if (relation.members.some(([type, ref]) => type === 'node' && ref === nodeId)) continue
    const members: Member[] = []
    for (const member of relation.members) {
      const [type, ref, role] = member
      if (type === 'node' && ref === platform.id) members.push(['node', nodeId, STOP_ROLE_OF[role] ?? 'stop'])
      members.push(member)
    }
    doc.putRelation({ ...relation, members })
  }
  return nodeId
}
