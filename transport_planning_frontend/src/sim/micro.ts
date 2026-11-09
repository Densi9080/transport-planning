import type { XY } from '@/core/types'

import type { OdFlow } from './macro'
import { parseSpeed } from './macro'
import { type SimConnector, type SimEdge, SimLane, type SimNet, signalState, type Track, type TrackPoint } from './net'

/**
 * Микроуровень: каждая машина едет по полосе по модели следования IDM,
 * перестраивается, уступает на перекрёстках и останавливается на светофорах.
 */

export const VEHICLE_TYPES = {
  car: { length: 4.5, width: 1.8, height: 1.45, mesh: 0, accel: 1.7, share: 0.86 },
  van: { length: 5.6, width: 2.0, height: 2.15, mesh: 0, accel: 1.4, share: 0.08 },
  bus: { length: 12, width: 2.5, height: 3.1, mesh: 1, accel: 1.0, share: 0.04 },
  truck: { length: 8, width: 2.4, height: 3, mesh: 1, accel: 0.9, share: 0.02 },
} as const
export type VehicleKind = keyof typeof VEHICLE_TYPES

const FLEET_COLORS: [number, number, number][] = [
  [0.92, 0.92, 0.93],
  [0.75, 0.76, 0.78],
  [0.42, 0.44, 0.47],
  [0.12, 0.13, 0.15],
  [0.62, 0.12, 0.14],
  [0.13, 0.27, 0.55],
  [0.1, 0.4, 0.38],
  [0.82, 0.68, 0.22],
]
const BIG_COLORS: Record<'bus' | 'truck', [number, number, number]> = {
  bus: [0.9, 0.62, 0.12],
  truck: [0.28, 0.42, 0.6],
}

export const SIM_STEP_S = 0.1
const MIN_GAP_M = 2
const MIN_STOP_GAP_M = 0.3
const TIME_HEADWAY_S = 1.3
const COMFORT_DECEL = 2.2
const MAX_DECEL = 7
const LOOKAHEAD_M = 90
const ENTRY_CHECK_S = 3.2
const ENTRY_CHECK_MIN_M = 9
const PRIORITY_HORIZON_S = 3.5
const PRIORITY_NEAR_M = 7
const PATIENCE_S = 14
const CONFLICT_MARGIN_M = 2
const LANE_CHANGE_PERIOD_S = 0.6
const LANE_BLEND_S = 1.6
const STUCK_LIMIT_S = 240
const STOPPED_MPS = 1.2
const JAM_MIN_CARS = 4
const JAM_MIN_S = 12
const METRICS_PERIOD_S = 1
const EMA_SHARE = 0.08
const MAX_ACTIVE_CARS = 1800
const DESTINATION_SLOWDOWN_M = 1

export const LOS_SPEED_THRESHOLDS = [0.8, 0.65, 0.5, 0.35, 0.2]

export function losFromSpeedRatio(ratio: number): number {
  for (let i = 0; i < LOS_SPEED_THRESHOLDS.length; i++) if (ratio >= LOS_SPEED_THRESHOLDS[i]!) return i
  return 5
}

export class Car {
  track: Track
  s = 0
  prevS = 0
  v = 0
  acc = 0
  /** Следующее соединение на текущей полосе. */
  next: SimConnector | null = null
  cleared = false
  waited = 0
  stuck = 0
  routeIndex = 0
  blendX = 0
  blendY = 0
  blendLeft = 0
  laneTimer = Math.random() * LANE_CHANGE_PERIOD_S
  // Положение для плавной отрисовки между шагами симуляции
  x = 0
  y = 0
  z = 0
  heading = 0
  prevX = 0
  prevY = 0
  prevZ = 0
  prevHeading = 0
  placed = false
  readonly length: number
  readonly width: number
  readonly height: number
  readonly accel: number
  readonly mesh: number
  readonly color: [number, number, number]
  readonly desireFactor = 0.92 + Math.random() * 0.16

  constructor(
    readonly id: number,
    readonly kind: VehicleKind,
    readonly route: SimEdge[],
    lane: SimLane,
  ) {
    const type = VEHICLE_TYPES[kind]
    this.length = type.length
    this.width = type.width
    this.height = type.height
    this.accel = type.accel
    this.mesh = type.mesh
    this.color =
      kind === 'bus' || kind === 'truck'
        ? BIG_COLORS[kind]
        : FLEET_COLORS[Math.floor(Math.random() * FLEET_COLORS.length)]!
    this.track = lane
  }
}

export interface MicroStats {
  time: number
  active: number
  spawned: number
  finished: number
  teleported: number
  waitingToEnter: number
  avgSpeedKmh: number
  stopped: number
  jams: JamInfo[]
}

export interface JamInfo {
  edge: SimEdge
  cars: number
  lengthM: number
  point: XY
}

interface SpawnSource {
  flow: OdFlow
  ratePerSecond: number
  accumulator: number
}

const point: TrackPoint = { x: 0, y: 0, z: 0, heading: 0 }

function pickKind(): VehicleKind {
  const roll = Math.random()
  let sum = 0
  for (const [kind, type] of Object.entries(VEHICLE_TYPES)) {
    sum += type.share
    if (roll < sum) return kind as VehicleKind
  }
  return 'car'
}

export class MicroSim {
  time = 0
  cars: Car[] = []
  spawned = 0
  finished = 0
  teleported = 0
  jams: JamInfo[] = []
  private sources: SpawnSource[] = []
  private pending: { route: SimEdge[]; kind: VehicleKind }[] = []
  private nextId = 1
  private metricsTimer = 0
  private edgeSpeed = new Map<SimEdge, number>()
  private tracks: Track[] = []

  constructor(
    readonly net: SimNet,
    flows: OdFlow[],
    scale: number,
  ) {
    this.tracks = [...net.edges.flatMap((edge) => edge.lanes), ...net.connectors]
    for (const edge of net.edges) {
      edge.speedRatio = 1
      edge.carCount = 0
      edge.queueCars = 0
      edge.jamFor = 0
      edge.queuePoint = null
      for (const lane of edge.lanes) lane.cars = []
      const limit = parseSpeed(edge.tags.maxspeed, edge.tags.highway ?? 'road') / 3.6
      this.edgeSpeed.set(edge, limit)
    }
    for (const connector of net.connectors) {
      connector.cars = []
      connector.reserved.clear()
    }
    this.setFlows(flows, scale)
  }

  setFlows(flows: OdFlow[], scale: number): void {
    this.sources = flows.map((flow) => ({
      flow,
      ratePerSecond: (flow.trips * scale) / 3600,
      accumulator: Math.random(),
    }))
  }

  step(dt: number): void {
    this.time += dt
    this.spawn(dt)
    for (const car of this.cars) car.acc = this.acceleration(car, dt)
    for (const car of this.cars) this.laneChange(car, dt)
    for (const car of this.cars) {
      car.prevS = car.s
      car.v = Math.max(0, car.v + car.acc * dt)
      car.s += car.v * dt
    }
    this.keepOrder()
    for (let i = this.cars.length - 1; i >= 0; i--) this.advance(this.cars[i]!, i, dt)
    this.metricsTimer += dt
    if (this.metricsTimer >= METRICS_PERIOD_S) {
      this.updateMetrics(this.metricsTimer)
      this.metricsTimer = 0
    }
  }

  stats(): MicroStats {
    let speed = 0
    let stopped = 0
    for (const car of this.cars) {
      speed += car.v
      if (car.v < STOPPED_MPS) stopped++
    }
    return {
      time: this.time,
      active: this.cars.length,
      spawned: this.spawned,
      finished: this.finished,
      teleported: this.teleported,
      waitingToEnter: this.pending.length,
      avgSpeedKmh: this.cars.length > 0 ? (speed / this.cars.length) * 3.6 : 0,
      stopped,
      jams: this.jams,
    }
  }

  private spawn(dt: number): void {
    for (const source of this.sources) {
      source.accumulator += source.ratePerSecond * dt
      while (source.accumulator >= 1) {
        source.accumulator -= 1
        const routes = source.flow.routes
        const route = routes[Math.floor(Math.random() * routes.length)]
        if (route && this.pending.length < MAX_ACTIVE_CARS) {
          this.pending.push({ route: route.edges, kind: pickKind() })
        }
      }
    }
    for (let i = this.pending.length - 1; i >= 0; i--) {
      if (this.cars.length >= MAX_ACTIVE_CARS) break
      const request = this.pending[i]!
      if (this.tryPlace(request.route, request.kind)) this.pending.splice(i, 1)
    }
  }

  private tryPlace(route: SimEdge[], kind: VehicleKind): boolean {
    const edge = route[0]
    if (!edge) return true
    const lanes = this.lanesToward(edge, route[1])
    for (const lane of lanes) {
      const last = lane.cars[0]
      const type = VEHICLE_TYPES[kind]
      if (last && last.s - last.length < type.length + MIN_GAP_M * 2) continue
      // Нельзя появляться прямо перед машиной, которая уже въезжает на эту полосу
      if (lane.feeders.some((feeder) => feeder.cars.length > 0 || feeder.reserved.size > 0)) continue
      const car = new Car(this.nextId++, kind, route, lane)
      car.s = Math.min(type.length, lane.length)
      car.v = Math.min(this.edgeSpeed.get(edge)! * 0.5, 7)
      lane.insert(car)
      this.selectConnector(car, lane)
      this.cars.push(car)
      this.spawned++
      return true
    }
    return false
  }

  /** Полосы, с которых можно выполнить следующий манёвр: остальные приведут к перестроению. */
  private lanesToward(edge: SimEdge, next: SimEdge | undefined): SimLane[] {
    if (!next) return [...edge.lanes].sort(() => Math.random() - 0.5)
    const good = edge.lanes.filter((lane) => lane.connectors.some((c) => c.toLane.edge === next))
    return (good.length > 0 ? good : edge.lanes).slice().sort(() => Math.random() - 0.5)
  }

  private selectConnector(car: Car, lane: SimLane): void {
    const next = car.route[car.routeIndex + 1]
    car.cleared = false
    car.waited = 0
    if (!next) {
      car.next = null
      return
    }
    const options = lane.connectors.filter((connector) => connector.toLane.edge === next)
    if (options.length === 0) {
      car.next = null
      return
    }
    const after = car.route[car.routeIndex + 2]
    const fitting = after ? options.filter((c) => c.toLane.connectors.some((d) => d.toLane.edge === after)) : options
    const pool = fitting.length > 0 ? fitting : options
    car.next = pool[Math.floor(Math.random() * pool.length)]!
  }

  private desiredSpeed(car: Car): number {
    const edge = car.route[car.routeIndex]!
    const base = this.edgeSpeed.get(edge)! * car.desireFactor
    const track = car.track
    if (track instanceof SimLane) {
      if (car.next) {
        const limit = car.next.speedLimit
        const distance = track.length - car.s
        return Math.min(base, Math.sqrt(limit * limit + 2 * COMFORT_DECEL * Math.max(0, distance)))
      }
      return base
    }
    return Math.min(base, (track as SimConnector).speedLimit)
  }

  /** Ближайшая машина впереди, в том числе на следующих участках маршрута. */
  private leader(car: Car): { gap: number; speed: number } | null {
    const track = car.track
    const index = track.cars.indexOf(car)
    const ahead = track.cars[index + 1]
    if (ahead) return { gap: ahead.s - ahead.length - car.s, speed: ahead.v }

    let walked = track.length - car.s
    let current: Track | null = track
    let connector: SimConnector | null = track instanceof SimLane ? car.next : (track as SimConnector)
    let routeIndex = car.routeIndex
    while (walked < LOOKAHEAD_M) {
      let nextTrack: Track | null = null
      if (current instanceof SimLane) {
        nextTrack = connector
      } else if (current) {
        nextTrack = (current as SimConnector).toLane
        routeIndex++
      }
      if (!nextTrack) return null
      const first = nextTrack.cars[0]
      if (first) return { gap: walked + first.s - first.length, speed: first.v }
      walked += nextTrack.length
      if (nextTrack instanceof SimLane) {
        const after = car.route[routeIndex + 1]
        connector = after ? (nextTrack.connectors.find((c) => c.toLane.edge === after) ?? null) : null
      }
      current = nextTrack
    }
    return null
  }

  private canEnter(car: Car, connector: SimConnector, distance: number): boolean {
    if (connector.signal) {
      const state = signalState(connector.signal, connector.phase, this.time)
      if (state === 'red') return false
      if (state === 'yellow' && (car.v * car.v) / (2 * MAX_DECEL * 0.6) < distance) return false
    }
    const last = connector.toLane.cars[0]
    if (last) {
      const room = last.s - last.length
      if (room < car.length + MIN_GAP_M && last.v < 3) return false
      // Хвост длинной машины ещё в узле: она уже ушла с соединения, но место не освободила
      if (room < MIN_GAP_M && connector.toLane.feeders.length > 1) return false
    }

    for (const conflict of connector.conflicts) {
      const other = conflict.other
      for (const occupant of other.cars) {
        if (occupant.s - occupant.length < conflict.atOther + CONFLICT_MARGIN_M) return false
      }
      for (const reserved of other.reserved) {
        if (reserved !== car) return false
      }
      if (!conflict.otherHasPriority || car.waited > PATIENCE_S) continue
      if (other.signal && signalState(other.signal, other.phase, this.time) === 'red') continue
      const lane = other.fromLane
      for (let i = lane.cars.length - 1; i >= 0; i--) {
        const rival = lane.cars[i]!
        if (rival.next !== other) {
          if (rival.cleared) continue
          break
        }
        const gap = lane.length - rival.s
        if (gap < PRIORITY_NEAR_M || gap / Math.max(rival.v, 0.5) < PRIORITY_HORIZON_S) return false
        break
      }
    }
    return true
  }

  private acceleration(car: Car, dt: number): number {
    const desired = Math.max(this.desiredSpeed(car), 0.5)
    const free = car.accel * (1 - (car.v / desired) ** 4)
    let gap = Number.POSITIVE_INFINITY
    let leadSpeed = 0

    const lead = this.leader(car)
    if (lead) {
      gap = lead.gap
      leadSpeed = lead.speed
    }

    const track = car.track
    if (track instanceof SimLane) {
      const distance = track.length - car.s
      const isLast = car.routeIndex >= car.route.length - 1
      if (!isLast) {
        const connector = car.next
        let mayGo = false
        if (connector) {
          if (car.cleared) {
            // На красный можно передумать, пока есть место для торможения
            const signal = connector.signal
            const red = signal && signalState(signal, connector.phase, this.time) === 'red'
            if (red && (car.v * car.v) / (2 * MAX_DECEL * 0.6) < distance) {
              car.cleared = false
              connector.reserved.delete(car)
            } else {
              mayGo = true
            }
          } else {
            const near = Math.max(ENTRY_CHECK_MIN_M, car.v * ENTRY_CHECK_S)
            const index = track.cars.indexOf(car)
            const ahead = track.cars[index + 1]
            const headOfLine = !ahead || ahead.cleared
            if (distance <= near && headOfLine && this.canEnter(car, connector, distance)) {
              car.cleared = true
              connector.reserved.add(car)
              mayGo = true
            }
          }
        }
        if (!mayGo) {
          car.waited += car.v < STOPPED_MPS ? dt : 0
          const stopGap = distance - DESTINATION_SLOWDOWN_M
          if (stopGap < gap) {
            gap = stopGap
            leadSpeed = 0
          }
        }
      }
    }

    if (!Number.isFinite(gap)) return Math.max(free, -MAX_DECEL)
    const effectiveGap = Math.max(gap, 0.1)
    const delta = car.v - leadSpeed
    const desiredGap =
      MIN_GAP_M + Math.max(0, car.v * TIME_HEADWAY_S + (car.v * delta) / (2 * Math.sqrt(car.accel * COMFORT_DECEL)))
    const value = car.accel * (1 - (car.v / desired) ** 4 - (desiredGap / effectiveGap) ** 2)
    return Math.max(value, -MAX_DECEL)
  }

  private gapsInLane(lane: SimLane, s: number): { ahead: Car | null; behind: Car | null } {
    let behind: Car | null = null
    for (const other of lane.cars) {
      if (other.s <= s) behind = other
      else return { ahead: other, behind }
    }
    return { ahead: null, behind }
  }

  private laneChange(car: Car, dt: number): void {
    const track = car.track
    if (!(track instanceof SimLane) || car.cleared) return
    car.laneTimer -= dt
    if (car.laneTimer > 0) return
    car.laneTimer = LANE_CHANGE_PERIOD_S
    const edge = track.edge
    if (edge.lanes.length < 2) return

    const next = car.route[car.routeIndex + 1]
    const hasMove = (lane: SimLane) => !next || lane.connectors.some((c) => c.toLane.edge === next)
    const distance = track.length - car.s
    const mandatory = !hasMove(track)
    if (!mandatory && distance < 25) return

    const candidates: SimLane[] = []
    if (mandatory) {
      let bestDistance = Number.POSITIVE_INFINITY
      for (const lane of edge.lanes) {
        if (!hasMove(lane)) continue
        bestDistance = Math.min(bestDistance, Math.abs(lane.index - track.index))
      }
      if (!Number.isFinite(bestDistance)) return
      for (const lane of edge.lanes) {
        if (Math.abs(lane.index - track.index) !== 1) continue
        const towards = edge.lanes.some((good) => hasMove(good) && Math.abs(good.index - lane.index) < bestDistance)
        if (towards) candidates.push(lane)
      }
    } else {
      // По желанию перестраиваются, только когда впереди идут заметно медленнее
      const index = track.cars.indexOf(car)
      const ahead = track.cars[index + 1]
      if (!ahead || ahead.s - ahead.length - car.s > 30 || ahead.v > car.v * 0.8 + 1) return
      for (const lane of edge.lanes) {
        if (Math.abs(lane.index - track.index) === 1 && hasMove(lane)) candidates.push(lane)
      }
    }

    for (const lane of candidates) {
      const position = Math.min(car.s * (lane.length / track.length), lane.length - 0.5)
      const { ahead, behind } = this.gapsInLane(lane, position)
      const urgency = mandatory ? Math.max(0.25, Math.min(1, distance / 60)) : 1
      if (ahead) {
        const gap = ahead.s - ahead.length - position
        if (gap < (MIN_GAP_M + car.v * 0.6) * urgency) continue
        if (!mandatory) {
          const currentAhead = track.cars[track.cars.indexOf(car) + 1]
          if (currentAhead && ahead.v <= currentAhead.v + 1) continue
        }
      }
      if (behind) {
        const gap = position - car.length - behind.s
        if (gap < (MIN_GAP_M + Math.max(0, behind.v - car.v) * 1.5 + behind.v * 0.4) * urgency) continue
      }
      this.moveToLane(car, track, lane, position)
      return
    }
  }

  private moveToLane(car: Car, from: SimLane, to: SimLane, position: number): void {
    from.sample(car.s, point)
    const oldX = point.x
    const oldY = point.y
    from.remove(car)
    car.track = to
    car.s = position
    to.insert(car)
    to.sample(position, point)
    car.blendX = oldX - point.x
    car.blendY = oldY - point.y
    car.blendLeft = LANE_BLEND_S
    this.selectConnector(car, to)
  }

  /**
   * Модель следования только просит тормозить, а торможение ограничено. Этот шаг гарантирует,
   * что машина физически не въедет в переднюю, даже если та появилась перед ней внезапно.
   */
  private keepOrder(): void {
    for (const track of this.tracks) {
      const cars = track.cars
      for (let i = cars.length - 2; i >= 0; i--) {
        const back = cars[i]!
        const front = cars[i + 1]!
        const limit = front.s - front.length - MIN_STOP_GAP_M
        if (back.s <= limit) continue
        back.s = Math.min(Math.max(back.prevS, limit), front.s)
        back.v = Math.min(back.v, front.v)
      }
    }
  }

  private advance(car: Car, index: number, dt: number): void {
    car.stuck = car.v < 0.2 ? car.stuck + dt : 0
    if (car.blendLeft > 0) car.blendLeft = Math.max(0, car.blendLeft - dt)

    let track = car.track
    while (car.s >= track.length) {
      if (track instanceof SimLane) {
        if (car.routeIndex >= car.route.length - 1) {
          this.finish(car, index)
          return
        }
        const connector = car.next
        if (!connector || !car.cleared) {
          car.s = track.length - 0.05
          car.v = 0
          break
        }
        const rest = car.s - track.length
        track.remove(car)
        connector.reserved.delete(car)
        car.track = connector
        car.s = rest
        connector.insert(car)
        track = connector
      } else {
        const connector = track as SimConnector
        const rest = car.s - connector.length
        connector.remove(car)
        const lane = connector.toLane
        car.routeIndex++
        car.track = lane
        car.s = rest
        lane.insert(car)
        this.selectConnector(car, lane)
        track = lane
      }
    }

    if (car.stuck > STUCK_LIMIT_S) {
      this.teleported++
      this.remove(car, index)
    }
  }

  private finish(car: Car, index: number): void {
    this.finished++
    this.remove(car, index)
  }

  private remove(car: Car, index: number): void {
    car.track.remove(car)
    if (car.next) car.next.reserved.delete(car)
    const last = this.cars.pop()!
    if (last !== car) this.cars[index] = last
  }

  private updateMetrics(dt: number): void {
    const jams: JamInfo[] = []
    for (const edge of this.net.edges) {
      const limit = this.edgeSpeed.get(edge)!
      let count = 0
      let sum = 0
      let bestQueue = 0
      let queuePoint: XY | null = null
      let queueLength = 0
      for (const lane of edge.lanes) {
        let queue = 0
        let tail = lane.length
        for (let i = lane.cars.length - 1; i >= 0; i--) {
          const car = lane.cars[i]!
          count++
          sum += car.v
          if (car.v < STOPPED_MPS && queue === lane.cars.length - 1 - i) {
            queue++
            tail = car.s - car.length
          }
        }
        if (queue > bestQueue) {
          bestQueue = queue
          queueLength = lane.length - tail
          lane.sample(Math.max(0, tail), point)
          queuePoint = { x: point.x, y: point.y }
        }
      }
      edge.carCount = count
      edge.queueCars = bestQueue
      edge.queuePoint = queuePoint
      if (count > 0) {
        const ratio = Math.min(1, sum / count / limit)
        edge.speedRatio += (ratio - edge.speedRatio) * Math.min(1, EMA_SHARE * dt * 2)
      } else {
        edge.speedRatio += (1 - edge.speedRatio) * Math.min(1, EMA_SHARE * dt)
      }
      edge.jamFor = bestQueue >= JAM_MIN_CARS ? edge.jamFor + dt : Math.max(0, edge.jamFor - dt * 2)
      if (edge.jamFor >= JAM_MIN_S && queuePoint) {
        jams.push({ edge, cars: bestQueue, lengthM: queueLength, point: queuePoint })
      }
    }
    jams.sort((a, b) => b.lengthM - a.lengthM)
    this.jams = jams
  }

  /** Положения всех машин для плавной отрисовки. Вызывается после каждого шага. */
  updatePoses(dt: number): void {
    for (const car of this.cars) {
      car.prevX = car.x
      car.prevY = car.y
      car.prevZ = car.z
      car.prevHeading = car.heading
      const center = car.s - car.length / 2
      car.track.sample(center, point)
      const blend = car.blendLeft > 0 ? car.blendLeft / LANE_BLEND_S : 0
      car.x = point.x + car.blendX * blend
      car.y = point.y + car.blendY * blend
      car.z = point.z
      if (!car.placed) {
        car.prevX = car.x
        car.prevY = car.y
        car.prevZ = car.z
        car.heading = point.heading
        car.prevHeading = point.heading
        car.placed = true
      } else {
        let difference = point.heading - car.heading
        while (difference > Math.PI) difference -= Math.PI * 2
        while (difference < -Math.PI) difference += Math.PI * 2
        car.heading += difference * Math.min(1, dt * (2 + car.v * 0.6))
      }
    }
  }
}
