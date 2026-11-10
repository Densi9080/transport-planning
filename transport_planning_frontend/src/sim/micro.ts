import { canChangeLane } from '@/core/lanes'
import type { XY } from '@/core/types'

import type { OdFlow } from './macro'
import { parseSpeed } from './macro'
import { secondsSinceRed, type SimConnector, type SimEdge, SimLane, type SimNet, signalState, type Track, type TrackPoint } from './net'
import type { ServiceStop, TransitService } from './transit'

/**
 * Микроуровень: каждая машина едет по полосе по модели следования IDM, перестраивается,
 * уступает и стоит на светофорах. Водители разные: кто-то едет спокойно, а кто-то лихачит,
 * проскакивает на красный и перестраивается через сплошную.
 */

export const VEHICLE_TYPES = {
  car: { length: 4.5, width: 1.8, height: 1.45, mesh: 0, accel: 1.7, share: 0.89 },
  van: { length: 5.6, width: 2.0, height: 2.15, mesh: 0, accel: 1.4, share: 0.08 },
  truck: { length: 8, width: 2.4, height: 3, mesh: 1, accel: 0.9, share: 0.03 },
  bus: { length: 12, width: 2.5, height: 3.1, mesh: 1, accel: 1.0, share: 0 },
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
const TRUCK_COLOR: [number, number, number] = [0.28, 0.42, 0.6]

export type DriverStyle = 'calm' | 'normal' | 'aggressive'

export const DRIVER_STYLES: DriverStyle[] = ['calm', 'normal', 'aggressive']

export const STYLE_LABELS: Record<DriverStyle, string> = {
  calm: 'Спокойные',
  normal: 'Обычные',
  aggressive: 'Лихачи',
}

interface StyleProfile {
  speed: [number, number]
  headway: number
  minGap: number
  accel: number
  comfortDecel: number
  /** Запас при перестроении: меньше единицы значит, что водитель подрезает. */
  gapFactor: number
  /** Пауза между перестроениями, с. */
  laneCooldown: number
  /** Насколько заранее уступает по приоритету, с. */
  yieldHorizon: number
  /** Сколько ждёт на второстепенной, прежде чем поедет напролом, с. */
  patience: number
  /** Вероятности нарушений: решение принимается один раз на подход к узлу. */
  runRed: number
  crossSolid: number
  wrongLaneTurn: number
  blockBox: number
  ignoreYield: number
}

const STYLES: Record<DriverStyle, StyleProfile> = {
  calm: {
    speed: [0.82, 0.96],
    headway: 1.8,
    minGap: 2.6,
    accel: 0.8,
    comfortDecel: 0.8,
    gapFactor: 1.4,
    laneCooldown: 7,
    yieldHorizon: 4.5,
    patience: 24,
    runRed: 0,
    crossSolid: 0,
    wrongLaneTurn: 0,
    blockBox: 0,
    ignoreYield: 0,
  },
  normal: {
    speed: [0.94, 1.08],
    headway: 1.3,
    minGap: 2,
    accel: 1,
    comfortDecel: 1,
    gapFactor: 1,
    laneCooldown: 4.5,
    yieldHorizon: 3.5,
    patience: 14,
    runRed: 0.03,
    crossSolid: 0.06,
    wrongLaneTurn: 0.02,
    blockBox: 0.04,
    ignoreYield: 0.01,
  },
  aggressive: {
    speed: [1.12, 1.4],
    headway: 0.8,
    minGap: 1.2,
    accel: 1.4,
    comfortDecel: 1.4,
    gapFactor: 0.5,
    laneCooldown: 2,
    yieldHorizon: 1.8,
    patience: 5,
    runRed: 0.4,
    crossSolid: 0.6,
    wrongLaneTurn: 0.3,
    blockBox: 0.35,
    ignoreYield: 0.15,
  },
}

export const VIOLATION_LABELS = {
  redLight: 'Проезд на красный',
  solidLine: 'Перестроение через сплошную',
  wrongLane: 'Манёвр не из своей полосы',
  blockBox: 'Выезд на занятый перекрёсток',
  noYield: 'Не уступил дорогу',
} as const
export type ViolationKind = keyof typeof VIOLATION_LABELS

export interface DriverMix {
  /** Доля лихачей от 0 до 1. */
  aggressive: number
  /** Доля спокойных от 0 до 1. */
  calm: number
}

export interface MicroOptions {
  scale: number
  mix: DriverMix
  services: TransitService[]
}

export const DEFAULT_MIX: DriverMix = { aggressive: 0.15, calm: 0.2 }

export const SIM_STEP_S = 0.1
const MIN_STOP_GAP_M = 0.3
const COMFORT_DECEL = 2.2
const MAX_DECEL = 7
const LOOKAHEAD_M = 90
const ENTRY_CHECK_S = 3.2
const ENTRY_CHECK_MIN_M = 9
const PRIORITY_NEAR_M = 7
const CONFLICT_MARGIN_M = 2
const LANE_CHECK_PERIOD_S = 0.5
/** Перестроение растянуто на расстояние: стоящая машина не должна ехать боком. */
const LANE_CHANGE_MIN_M = 16
const LANE_CHANGE_TIME_S = 2.8
const JOINT_BLEND_M = 7
const JOINT_MIN_OFFSET_M = 0.03
const REAR_AXLE_SHARE = 0.72
const STUCK_LIMIT_S = 240
const STOPPED_MPS = 1.2
const JAM_MIN_CARS = 4
const JAM_MIN_S = 12
const METRICS_PERIOD_S = 1
const EMA_SHARE = 0.08
const MAX_ACTIVE_CARS = 1800
const STOP_LINE_GAP_M = 1
const DWELL_MIN_S = 12
const DWELL_MAX_S = 28
const STOP_ARRIVED_M = 2
const WRONG_LANE_DECISION_M = 18
const RED_RUN_WINDOW_S = 2.5
const CURVE_LOOKAHEAD_M = 70
const CURVE_NERVE_MAX = 1.2

export const LOS_SPEED_THRESHOLDS = [0.8, 0.65, 0.5, 0.35, 0.2]

export function losFromSpeedRatio(ratio: number): number {
  for (let i = 0; i < LOS_SPEED_THRESHOLDS.length; i++) if (ratio >= LOS_SPEED_THRESHOLDS[i]!) return i
  return 5
}

function randomBetween(low: number, high: number): number {
  return low + Math.random() * (high - low)
}

function smoothstep(t: number): number {
  const x = Math.min(1, Math.max(0, t))
  return x * x * (3 - 2 * x)
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
  laneTimer = Math.random() * LANE_CHECK_PERIOD_S
  laneCooldown = 0

  // Решения водителя на текущий подход к узлу
  willRunRed = false
  willCrossSolid = false
  willTurnFromWrongLane = false
  willBlockBox = false
  willIgnoreYield = false

  // Сглаживание: смещение от полосы плавно гасится по мере движения
  blendX = 0
  blendY = 0
  blendDone = 1
  blendLength = 1

  // Задняя ось следует за передним бампером: так получается настоящая кривая поворота
  frontX = 0
  frontY = 0
  rearX = 0
  rearY = 0

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

  // Автобус
  stops: ServiceStop[] = []
  stopIndex = 0
  dwell = 0
  lineId: number | null = null

  readonly length: number
  readonly width: number
  readonly height: number
  readonly accel: number
  readonly mesh: number
  readonly color: [number, number, number]
  readonly desireFactor: number
  readonly profile: StyleProfile

  constructor(
    readonly id: number,
    readonly kind: VehicleKind,
    readonly style: DriverStyle,
    readonly route: SimEdge[],
    lane: SimLane,
    color?: [number, number, number],
  ) {
    const type = VEHICLE_TYPES[kind]
    this.profile = STYLES[style]
    this.length = type.length
    this.width = type.width
    this.height = type.height
    this.accel = type.accel * this.profile.accel
    this.mesh = type.mesh
    this.color = color ?? (kind === 'truck' ? TRUCK_COLOR : FLEET_COLORS[Math.floor(Math.random() * FLEET_COLORS.length)]!)
    // Большие машины лихачат скромнее: им просто не на чем
    const [low, high] = this.profile.speed
    this.desireFactor = type.mesh === 1 ? Math.min(randomBetween(low, high), 1.05) : randomBetween(low, high)
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
  byStyle: Record<DriverStyle, number>
  violations: Record<ViolationKind, number>
  buses: number
  busTrips: number
  speeding: number
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

interface ServiceSource {
  service: TransitService
  next: number
}

interface PendingCar {
  route: SimEdge[]
  kind: VehicleKind
  service?: TransitService
}

const point: TrackPoint = { x: 0, y: 0, z: 0, heading: 0 }
const other: TrackPoint = { x: 0, y: 0, z: 0, heading: 0 }

function pickKind(): VehicleKind {
  const roll = Math.random()
  let sum = 0
  for (const [kind, type] of Object.entries(VEHICLE_TYPES)) {
    sum += type.share
    if (roll < sum) return kind as VehicleKind
  }
  return 'car'
}

function parseRgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16)
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255]
}

export class MicroSim {
  time = 0
  cars: Car[] = []
  spawned = 0
  finished = 0
  teleported = 0
  busTrips = 0
  jams: JamInfo[] = []
  mix: DriverMix
  readonly violations: Record<ViolationKind, number> = { redLight: 0, solidLine: 0, wrongLane: 0, blockBox: 0, noYield: 0 }
  private sources: SpawnSource[] = []
  private serviceSources: ServiceSource[] = []
  private pending: PendingCar[] = []
  private nextId = 1
  private metricsTimer = 0
  private edgeSpeed = new Map<SimEdge, number>()
  private tracks: Track[] = []

  constructor(
    readonly net: SimNet,
    flows: OdFlow[],
    options: Partial<MicroOptions> = {},
  ) {
    this.mix = options.mix ?? DEFAULT_MIX
    this.tracks = [...net.edges.flatMap((edge) => edge.lanes), ...net.connectors]
    for (const edge of net.edges) {
      edge.speedRatio = 1
      edge.carCount = 0
      edge.queueCars = 0
      edge.jamFor = 0
      edge.queuePoint = null
      for (const lane of edge.lanes) lane.cars = []
      this.edgeSpeed.set(edge, parseSpeed(edge.tags.maxspeed, edge.tags.highway ?? 'road') / 3.6)
    }
    for (const connector of net.connectors) {
      connector.cars = []
      connector.reserved.clear()
    }
    this.setFlows(flows, options.scale ?? 1)
    this.setServices(options.services ?? [])
  }

  setFlows(flows: OdFlow[], scale: number): void {
    this.sources = flows.map((flow) => ({
      flow,
      ratePerSecond: (flow.trips * scale) / 3600,
      accumulator: Math.random(),
    }))
  }

  setServices(services: TransitService[]): void {
    // Автобусы разных линий выходят вразнобой, а не все разом в первую секунду
    this.serviceSources = services.map((service) => ({
      service,
      next: this.time + Math.random() * (3600 / Math.max(service.frequency, 0.1)),
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
    let buses = 0
    let speeding = 0
    const byStyle: Record<DriverStyle, number> = { calm: 0, normal: 0, aggressive: 0 }
    for (const car of this.cars) {
      speed += car.v
      if (car.v < STOPPED_MPS) stopped++
      byStyle[car.style]++
      if (car.lineId !== null) buses++
      const edge = car.route[car.routeIndex]
      if (edge && car.v > this.edgeSpeed.get(edge)! * 1.1) speeding++
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
      byStyle,
      violations: { ...this.violations },
      buses,
      busTrips: this.busTrips,
      speeding,
    }
  }

  private pickStyle(): DriverStyle {
    const roll = Math.random()
    if (roll < this.mix.aggressive) return 'aggressive'
    if (roll < this.mix.aggressive + this.mix.calm) return 'calm'
    return 'normal'
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
    for (const source of this.serviceSources) {
      if (this.time < source.next) continue
      source.next = this.time + 3600 / Math.max(source.service.frequency, 0.1)
      this.pending.push({ route: source.service.edges, kind: 'bus', service: source.service })
    }
    for (let i = this.pending.length - 1; i >= 0; i--) {
      if (this.cars.length >= MAX_ACTIVE_CARS) break
      if (this.tryPlace(this.pending[i]!)) this.pending.splice(i, 1)
    }
  }

  private tryPlace(request: PendingCar): boolean {
    const { route, kind, service } = request
    const edge = route[0]
    if (!edge) return true
    const type = VEHICLE_TYPES[kind]
    for (const lane of this.lanesToward(edge, route[1], kind === 'bus')) {
      const last = lane.cars[0]
      if (last && last.s - last.length < type.length + 4) continue
      // Нельзя появляться прямо перед машиной, которая уже въезжает на эту полосу
      if (lane.feeders.some((feeder) => feeder.cars.length > 0 || feeder.reserved.size > 0)) continue
      const color = service ? parseRgb(service.line.color) : undefined
      // Автобус водит профессионал: он не лихачит и почти не нарушает
      const car = new Car(this.nextId++, kind, service ? 'normal' : this.pickStyle(), route, lane, color)
      car.s = Math.min(type.length, lane.length)
      car.v = Math.min(this.edgeSpeed.get(edge)! * 0.5, 7)
      if (service) {
        car.stops = service.stops
        car.lineId = service.line.id
      }
      lane.insert(car)
      this.selectConnector(car, lane)
      this.cars.push(car)
      this.spawned++
      return true
    }
    return false
  }

  /** Полосы, с которых можно выполнить следующий манёвр: остальные приведут к перестроению. */
  private lanesToward(edge: SimEdge, next: SimEdge | undefined, keepRight: boolean): SimLane[] {
    const good = next ? edge.lanes.filter((lane) => lane.connectors.some((c) => c.toLane.edge === next)) : edge.lanes
    const pool = good.length > 0 ? good : edge.lanes
    return keepRight ? [...pool].reverse() : [...pool].sort(() => Math.random() - 0.5)
  }

  private selectConnector(car: Car, lane: SimLane): void {
    const next = car.route[car.routeIndex + 1]
    car.cleared = false
    car.waited = 0
    // Каждый подход к узлу водитель решает заново, но не меняет решение на ходу
    const profile = car.profile
    car.willRunRed = Math.random() < profile.runRed
    car.willCrossSolid = Math.random() < profile.crossSolid
    car.willTurnFromWrongLane = Math.random() < profile.wrongLaneTurn
    car.willBlockBox = Math.random() < profile.blockBox
    car.willIgnoreYield = Math.random() < profile.ignoreYield
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
    const track = car.track
    // Лихач проходит поворот быстрее, но физику не обманешь
    const nerve = Math.min(car.desireFactor, CURVE_NERVE_MAX)
    let speed = this.edgeSpeed.get(edge)! * car.desireFactor
    const brakeTo = (limit: number, distance: number) => {
      const allowed = limit * nerve
      if (allowed < speed) speed = Math.min(speed, Math.sqrt(allowed * allowed + 2 * COMFORT_DECEL * Math.max(0, distance)))
    }
    for (const curve of track.curves) {
      const distance = curve.s - car.s
      if (distance >= -car.length && distance < CURVE_LOOKAHEAD_M) brakeTo(curve.speed, distance)
    }
    if (track instanceof SimLane) {
      if (car.next) brakeTo(car.next.speedLimit, track.length - car.s)
    } else {
      brakeTo((track as SimConnector).speedLimit, 0)
    }
    return speed
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
    const profile = car.profile
    if (connector.signal) {
      const state = signalState(connector, this.time)
      const canStop = (car.v * car.v) / (2 * MAX_DECEL * 0.6) < distance
      if (state === 'red') {
        // Проскочить можно только сразу после смены сигнала, и не вслепую: пересекающие ещё не поехали
        if (!car.willRunRed || secondsSinceRed(connector, this.time) > RED_RUN_WINDOW_S) return false
      } else if (state === 'yellow' && canStop && !car.willRunRed) {
        return false
      }
    }
    const last = connector.toLane.cars[0]
    if (last) {
      const room = last.s - last.length
      if (room < car.length + profile.minGap && last.v < 3 && !car.willBlockBox) return false
      // Хвост длинной машины ещё в узле: она уже ушла с соединения, но место не освободила
      if (room < profile.minGap && connector.toLane.feeders.length > 1) return false
    }

    for (const conflict of connector.conflicts) {
      const rival = conflict.other
      for (const occupant of rival.cars) {
        if (occupant.s - occupant.length < conflict.atOther + CONFLICT_MARGIN_M) return false
      }
      for (const reserved of rival.reserved) {
        if (reserved !== car) return false
      }
      if (!conflict.otherHasPriority || car.waited > profile.patience || car.willIgnoreYield) continue
      if (rival.signal && signalState(rival, this.time) === 'red') continue
      const lane = rival.fromLane
      for (let i = lane.cars.length - 1; i >= 0; i--) {
        const candidate = lane.cars[i]!
        if (candidate.next !== rival) {
          if (candidate.cleared) continue
          break
        }
        const gap = lane.length - candidate.s
        if (gap < PRIORITY_NEAR_M || gap / Math.max(candidate.v, 0.5) < profile.yieldHorizon) return false
        break
      }
    }
    return true
  }

  private recordEntry(car: Car, connector: SimConnector): void {
    if (connector.signal && signalState(connector, this.time) === 'red') this.violations.redLight++
    const last = connector.toLane.cars[0]
    if (last && last.s - last.length < car.length + car.profile.minGap && last.v < 3) this.violations.blockBox++
    if (car.willIgnoreYield && connector.conflicts.some((c) => c.otherHasPriority)) {
      const hasRival = connector.conflicts.some(
        (c) => c.otherHasPriority && c.other.fromLane.cars.some((rival) => rival.next === c.other && c.other.fromLane.length - rival.s < 30),
      )
      if (hasRival) this.violations.noYield++
    }
  }

  private nextStop(car: Car): ServiceStop | null {
    if (car.lineId === null) return null
    const stop = car.stops[car.stopIndex]
    return stop && stop.edgeIndex === car.routeIndex && car.track instanceof SimLane ? stop : null
  }

  private acceleration(car: Car, dt: number): number {
    const profile = car.profile
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

      const stop = this.nextStop(car)
      if (stop) {
        const target = stop.share * track.length
        const toStop = target - car.s
        if (toStop < -STOP_ARRIVED_M) {
          car.stopIndex++
        } else if (car.dwell > 0) {
          car.dwell -= dt
          if (car.dwell <= 0) {
            car.dwell = 0
            car.stopIndex++
          } else {
            return -MAX_DECEL
          }
        } else if (toStop < STOP_ARRIVED_M && car.v < 0.6) {
          car.dwell = randomBetween(DWELL_MIN_S, DWELL_MAX_S)
          return -MAX_DECEL
        } else if (toStop < gap) {
          gap = Math.max(toStop, 0.1)
          leadSpeed = 0
        }
      }

      const isLast = car.routeIndex >= car.route.length - 1
      if (!isLast) {
        // С чужой полосы тоже можно уйти в манёвр, если водитель уже решил нарушить
        if (!car.next && car.willTurnFromWrongLane && distance < WRONG_LANE_DECISION_M) {
          const nextEdge = car.route[car.routeIndex + 1]
          const candidate = track.edge.lanes
            .filter((lane) => lane !== track)
            .sort((a, b) => Math.abs(a.index - track.index) - Math.abs(b.index - track.index))
            .flatMap((lane) => lane.connectors.filter((c) => c.toLane.edge === nextEdge))[0]
          if (candidate) {
            car.next = candidate
            this.violations.wrongLane++
          }
        }
        const connector = car.next
        let mayGo = false
        if (connector) {
          if (car.cleared) {
            // На красный можно передумать, пока есть место для торможения
            const red = connector.signal && signalState(connector, this.time) === 'red' && !car.willRunRed
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
              this.recordEntry(car, connector)
              mayGo = true
            }
          }
        }
        if (!mayGo) {
          car.waited += car.v < STOPPED_MPS ? dt : 0
          const stopGap = distance - STOP_LINE_GAP_M
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
    const braking = COMFORT_DECEL * profile.comfortDecel
    const desiredGap =
      profile.minGap + Math.max(0, car.v * profile.headway + (car.v * delta) / (2 * Math.sqrt(car.accel * braking)))
    const value = car.accel * (1 - (car.v / desired) ** 4 - (desiredGap / effectiveGap) ** 2)
    return Math.max(value, -MAX_DECEL)
  }

  private gapsInLane(lane: SimLane, s: number): { ahead: Car | null; behind: Car | null } {
    let behind: Car | null = null
    for (const item of lane.cars) {
      if (item.s <= s) behind = item
      else return { ahead: item, behind }
    }
    return { ahead: null, behind }
  }

  private changeRules(edge: SimEdge): string[] | null {
    const profile = edge.link.profile
    return edge.forward ? profile.changeForward : profile.changeBackward
  }

  private laneChange(car: Car, dt: number): void {
    const track = car.track
    car.laneCooldown = Math.max(0, car.laneCooldown - dt)
    if (!(track instanceof SimLane) || car.cleared || car.dwell > 0) return
    car.laneTimer -= dt
    if (car.laneTimer > 0) return
    car.laneTimer = LANE_CHECK_PERIOD_S
    const edge = track.edge
    if (edge.lanes.length < 2) return

    const next = car.route[car.routeIndex + 1]
    const hasMove = (lane: SimLane) => !next || lane.connectors.some((c) => c.toLane.edge === next)
    const distance = track.length - car.s
    let mandatory = !hasMove(track)
    // Автобус заранее прижимается вправо к своей остановке
    const stop = this.nextStop(car)
    const toStopLane = stop ? track.index < edge.lanes.length - 1 : false
    if (toStopLane && hasMove(edge.lanes[track.index + 1]!)) mandatory = true
    if (!mandatory && (distance < 25 || car.laneCooldown > 0)) return

    const candidates: SimLane[] = []
    if (toStopLane) {
      candidates.push(edge.lanes[track.index + 1]!)
    } else if (mandatory) {
      let bestDistance = Number.POSITIVE_INFINITY
      for (const lane of edge.lanes) {
        if (hasMove(lane)) bestDistance = Math.min(bestDistance, Math.abs(lane.index - track.index))
      }
      if (!Number.isFinite(bestDistance)) return
      for (const lane of edge.lanes) {
        if (Math.abs(lane.index - track.index) !== 1) continue
        if (edge.lanes.some((good) => hasMove(good) && Math.abs(good.index - lane.index) < bestDistance)) candidates.push(lane)
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

    const rules = this.changeRules(edge)
    const minGap = car.profile.minGap
    for (const lane of candidates) {
      const legal = canChangeLane(rules, track.index, lane.index)
      if (!legal && !car.willCrossSolid) continue
      const position = Math.min(car.s * (lane.length / track.length), lane.length - 0.5)
      const { ahead, behind } = this.gapsInLane(lane, position)
      const urgency = mandatory ? Math.max(0.25, Math.min(1, distance / 60)) : 1
      const factor = urgency * car.profile.gapFactor
      if (ahead) {
        const gap = ahead.s - ahead.length - position
        if (gap < Math.max(0.6, (minGap + car.v * 0.6) * factor)) continue
        if (!mandatory) {
          const currentAhead = track.cars[track.cars.indexOf(car) + 1]
          if (currentAhead && ahead.v <= currentAhead.v + 1) continue
        }
      }
      if (behind) {
        const gap = position - car.length - behind.s
        if (gap < Math.max(0.6, (minGap + Math.max(0, behind.v - car.v) * 1.5 + behind.v * 0.4) * factor)) continue
      }
      if (!legal) this.violations.solidLine++
      this.moveToLane(car, track, lane, position)
      return
    }
  }

  /** Новое смещение складывается с ещё не погашенным: две подряд идущие правки не дают рывка. */
  private addBlend(car: Car, dx: number, dy: number, length: number): void {
    const left = 1 - smoothstep(car.blendDone)
    car.blendX = car.blendX * left + dx
    car.blendY = car.blendY * left + dy
    car.blendDone = 0
    car.blendLength = length
  }

  private moveToLane(car: Car, from: SimLane, to: SimLane, position: number): void {
    from.sample(car.s, point)
    from.remove(car)
    car.track = to
    car.s = position
    to.insert(car)
    to.sample(position, other)
    const length = Math.max(LANE_CHANGE_MIN_M, car.v * LANE_CHANGE_TIME_S)
    this.addBlend(car, point.x - other.x, point.y - other.y, length)
    car.laneCooldown = car.profile.laneCooldown
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

  private jointBlend(car: Car, from: Track, atEnd: number, to: Track, atStart: number): void {
    from.sample(atEnd, point)
    to.sample(atStart, other)
    const dx = point.x - other.x
    const dy = point.y - other.y
    if (Math.abs(dx) + Math.abs(dy) > JOINT_MIN_OFFSET_M) this.addBlend(car, dx, dy, JOINT_BLEND_M)
  }

  private advance(car: Car, index: number, dt: number): void {
    car.stuck = car.v < 0.2 && car.dwell <= 0 ? car.stuck + dt : 0
    const moved = car.s - car.prevS
    if (car.blendDone < 1 && moved > 0) car.blendDone = Math.min(1, car.blendDone + moved / car.blendLength)

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
        this.jointBlend(car, track, track.length, connector, rest)
        track.remove(car)
        connector.reserved.delete(car)
        car.track = connector
        car.s = rest
        connector.insert(car)
        track = connector
      } else {
        const connector = track as SimConnector
        const rest = car.s - connector.length
        const lane = connector.toLane
        this.jointBlend(car, connector, connector.length, lane, rest)
        connector.remove(car)
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
    if (car.lineId !== null) this.busTrips++
    this.remove(car, index)
  }

  private remove(car: Car, index: number): void {
    car.track.remove(car)
    if (car.next) car.next.reserved.delete(car)
    const last = this.cars.pop()!
    if (last !== car) {
      this.cars[index] = last
    }
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
          if (car.v < STOPPED_MPS && queue === lane.cars.length - 1 - i && car.dwell <= 0) {
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

  /**
   * Положения машин для отрисовки. Перёд идёт точно по траектории, а задняя ось подтягивается
   * за ним, как у настоящей машины: и поворот, и перестроение становятся плавной кривой.
   */
  updatePoses(): void {
    for (const car of this.cars) {
      car.prevX = car.x
      car.prevY = car.y
      car.prevZ = car.z
      car.prevHeading = car.heading

      car.track.sample(car.s, point)
      const left = 1 - smoothstep(car.blendDone)
      const frontX = point.x + car.blendX * left
      const frontY = point.y + car.blendY * left
      const wheelbase = car.length * REAR_AXLE_SHARE

      if (!car.placed) {
        car.rearX = frontX - Math.sin(point.heading) * wheelbase
        car.rearY = frontY - Math.cos(point.heading) * wheelbase
      } else {
        const dx = frontX - car.rearX
        const dy = frontY - car.rearY
        const span = Math.hypot(dx, dy)
        if (span > 1e-3) {
          car.rearX = frontX - (dx / span) * wheelbase
          car.rearY = frontY - (dy / span) * wheelbase
        }
      }

      const dirX = frontX - car.rearX
      const dirY = frontY - car.rearY
      const span = Math.hypot(dirX, dirY) || 1
      car.frontX = frontX
      car.frontY = frontY
      car.heading = Math.atan2(dirX, dirY)
      // Центр кузова лежит на середине длины от переднего бампера
      car.x = frontX - (dirX / span) * (car.length / 2)
      car.y = frontY - (dirY / span) * (car.length / 2)
      car.z = point.z

      if (!car.placed) {
        car.prevX = car.x
        car.prevY = car.y
        car.prevZ = car.z
        car.prevHeading = car.heading
        car.placed = true
      }
    }
  }
}
