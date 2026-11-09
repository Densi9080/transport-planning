import { bearing, sub, unit } from '@/core/geo'
import { type SignalColor, type SignalPlan, type SignalSegment, signalSegments, type SignalTimes, signalTimes } from '@/core/signals'

import type { SignalGroup, SimConnector, SimLane } from './net'

/** Как светофор выглядит для человека: подходы с понятными названиями и секундами сигналов. */

const COMPASS = ['С', 'СВ', 'В', 'ЮВ', 'Ю', 'ЮЗ', 'З', 'СЗ']

export const KIND_LABELS: Record<string, string> = { left: 'налево', through: 'прямо', right: 'направо', reverse: 'разворот' }

export const SIGNAL_LABELS: Record<SignalColor, string> = { green: 'зелёный', yellow: 'жёлтый', red: 'красный' }

function sideOf(lane: SimLane): string {
  const end = lane.points.at(-1)!
  const before = lane.points.at(-2) ?? lane.points[0]!
  // Направление движения к узлу: подход лежит с противоположной стороны
  const direction = unit(sub(before, end))
  return COMPASS[Math.round(bearing(direction) / 45) % 8]!
}

export function approachName(connector: SimConnector): string {
  const name = connector.fromLane.edge.tags.name
  const side = sideOf(connector.fromLane)
  return name ? `${name} (${side})` : `Подход ${side}`
}

/** Манёвры одного подхода с одинаковым сигналом: для водителя это одно направление. */
export interface SignalDirection {
  key: string
  title: string
  kinds: string
  phases: number[]
  connector: SimConnector
  /** Манёвра нет в плане: зелёный ему назначила модель. */
  unassigned: boolean
  times: SignalTimes
  segments: SignalSegment[]
}

const KIND_ORDER = ['left', 'through', 'right', 'reverse']

export function signalDirections(group: SignalGroup, plan: SignalPlan = group.plan): SignalDirection[] {
  const collected = new Map<string, { connector: SimConnector; kinds: Set<string>; unassigned: boolean }>()
  for (const connector of group.connectors) {
    // Дорога могла быть разрезана рядом с узлом: для водителя это всё тот же подход
    const key = `${approachName(connector)}|${connector.phases.join(',')}`
    const unassigned = !plan.phases.some((phase) => phase.movements.includes(connector.movement))
    const entry = collected.get(key)
    if (entry) {
      entry.kinds.add(connector.kind)
      entry.unassigned ||= unassigned
    } else {
      collected.set(key, { connector, kinds: new Set([connector.kind]), unassigned })
    }
  }
  const directions = [...collected.entries()].map(([key, { connector, kinds, unassigned }]) => ({
    key,
    title: approachName(connector),
    kinds: KIND_ORDER.filter((kind) => kinds.has(kind)).map((kind) => KIND_LABELS[kind]).join(', '),
    phases: connector.phases,
    connector,
    unassigned,
    times: signalTimes(plan, connector.phases),
    segments: signalSegments(plan, connector.phases),
  }))
  return directions.sort((a, b) => a.title.localeCompare(b.title, 'ru') || a.kinds.localeCompare(b.kinds, 'ru'))
}

export function formatSeconds(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace('.', ',')
}
