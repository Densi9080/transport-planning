import { parseProfile } from './lanes'
import type { Tags } from './types'

/** Значения по полосам хранятся в стандартных тегах OSM вида maxspeed:lanes, слева направо по ходу движения. */
function laneKey(tags: Tags, base: string, forward: boolean): string {
  return parseProfile(tags).oneway ? `${base}:lanes` : `${base}:lanes:${forward ? 'forward' : 'backward'}`
}

function laneCount(tags: Tags, forward: boolean): number {
  const profile = parseProfile(tags)
  if (profile.oneway) return Math.max(profile.forward, profile.backward)
  return forward ? profile.forward : profile.backward
}

export function readLaneValue(tags: Tags, base: string, forward: boolean, lane: number): string {
  const parts = tags[laneKey(tags, base, forward)]?.split('|')
  return parts && parts.length === laneCount(tags, forward) ? (parts[lane] ?? '') : ''
}

export function writeLaneValue(tags: Tags, base: string, forward: boolean, lane: number, value: string): Tags {
  const key = laneKey(tags, base, forward)
  const count = laneCount(tags, forward)
  const current = tags[key]?.split('|')
  const parts = current && current.length === count ? [...current] : Array.from({ length: count }, () => tags[base] ?? '')
  parts[lane] = value.trim()
  const next = { ...tags }
  if (parts.every((part) => part === '')) delete next[key]
  else next[key] = parts.join('|')
  return next
}
