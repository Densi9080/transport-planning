import { parseProfile } from './lanes'
import type { Tags } from './types'

export interface RoadPreset {
  id: string
  group: string
  title: string
  summary: string
  /** Поперечное сечение: число полос по направлениям и их ширина в метрах. */
  forward: number
  backward: number
  laneWidth: number
  tags: Tags
}

const road = (
  id: string,
  group: string,
  title: string,
  forward: number,
  backward: number,
  laneWidth: number,
  speed: number,
  highway: string,
  extra: Tags = {},
): RoadPreset => {
  const total = (forward + backward) * laneWidth
  return {
    id,
    group,
    title,
    forward,
    backward,
    laneWidth,
    summary: `${backward > 0 ? `${forward} + ${backward}` : `${forward}, в одну сторону`} · ПЧ ${String(Math.round(total * 100) / 100)} м · ${speed} км/ч`,
    tags: {
      highway,
      lanes: String(forward + backward),
      maxspeed: String(speed),
      width: String(total),
      ...(backward > 0
        ? forward !== backward
          ? { 'lanes:forward': String(forward), 'lanes:backward': String(backward) }
          : {}
        : { oneway: 'yes' }),
      ...extra,
    },
  }
}

export const ROAD_PRESETS: RoadPreset[] = [
  road('primary-8', 'Магистрали', 'Магистраль, 8 полос', 4, 4, 3.75, 80, 'primary'),
  road('primary-6', 'Магистрали', 'Магистраль, 6 полос', 3, 3, 3.5, 60, 'primary'),
  road('primary-4', 'Магистрали', 'Магистраль, 4 полосы', 2, 2, 3.5, 60, 'primary'),
  road('primary-oneway', 'Магистрали', 'Магистраль, одна сторона', 3, 0, 3.5, 60, 'primary'),
  road('primary-link', 'Магистрали', 'Съезд с магистрали', 1, 0, 4, 40, 'primary_link'),
  road('secondary-4', 'Улицы', 'Районная, 4 полосы', 2, 2, 3.5, 60, 'secondary'),
  road('secondary-2', 'Улицы', 'Районная, 2 полосы', 1, 1, 3.5, 60, 'secondary'),
  road('tertiary', 'Улицы', 'Местная улица', 1, 1, 3.25, 40, 'tertiary'),
  road('residential', 'Улицы', 'Жилая улица', 1, 1, 3, 40, 'residential'),
  road('living', 'Проезды', 'Жилая зона', 1, 1, 2.75, 20, 'living_street'),
  road('service', 'Проезды', 'Проезд', 1, 1, 2.75, 20, 'service'),
  road('service-oneway', 'Проезды', 'Проезд односторонний', 1, 0, 3.5, 20, 'service'),
]

export const DEFAULT_PRESET_ID = 'residential'

const PROFILE_KEYS = [
  'highway',
  'lanes',
  'lanes:forward',
  'lanes:backward',
  'oneway',
  'maxspeed',
  'width',
  'width:lanes',
  'width:lanes:forward',
  'width:lanes:backward',
]
const LANE_DETAIL_KEYS = [
  'turn:lanes',
  'turn:lanes:forward',
  'turn:lanes:backward',
  'change:lanes',
  'change:lanes:forward',
  'change:lanes:backward',
]

/** Применяет типовой профиль к дороге. Название и всё, что к профилю не относится, остаются. */
export function withPreset(tags: Tags, preset: RoadPreset): Tags {
  const before = parseProfile(tags)
  const next: Tags = { ...tags }
  for (const key of PROFILE_KEYS) delete next[key]
  Object.assign(next, preset.tags)
  const after = parseProfile(next)
  // Манёвры привязаны к полосам: при другом числе полос они теряют смысл
  if (before.forward !== after.forward || before.backward !== after.backward) {
    for (const key of LANE_DETAIL_KEYS) delete next[key]
  }
  return next
}

/** Какому типовому профилю соответствует дорога, если соответствует. */
export function matchingPreset(tags: Tags): RoadPreset | undefined {
  const profile = parseProfile(tags)
  return ROAD_PRESETS.find(
    (preset) =>
      preset.tags.highway === tags.highway &&
      preset.forward === profile.forward &&
      preset.backward === profile.backward &&
      Math.abs(preset.laneWidth - profile.laneWidth) < 0.01,
  )
}

export const ROAD_TYPES: { value: string; label: string }[] = [
  { value: 'motorway', label: 'Автомагистраль' },
  { value: 'trunk', label: 'Скоростная' },
  { value: 'primary', label: 'Магистраль' },
  { value: 'secondary', label: 'Районная' },
  { value: 'tertiary', label: 'Местная' },
  { value: 'unclassified', label: 'Без категории' },
  { value: 'residential', label: 'Жилая' },
  { value: 'living_street', label: 'Жилая зона' },
  { value: 'service', label: 'Проезд' },
  { value: 'primary_link', label: 'Съезд с магистрали' },
  { value: 'secondary_link', label: 'Съезд с районной' },
  { value: 'tertiary_link', label: 'Съезд с местной' },
  { value: 'footway', label: 'Тротуар' },
  { value: 'path', label: 'Тропа' },
  { value: 'steps', label: 'Лестница' },
]

/** Значения по умолчанию для автозаполнения при смене типа дороги. */
export const TYPE_DEFAULTS: Record<string, { maxspeed: string; lanes: string }> = {
  motorway: { maxspeed: '110', lanes: '6' },
  trunk: { maxspeed: '90', lanes: '4' },
  primary: { maxspeed: '60', lanes: '4' },
  secondary: { maxspeed: '60', lanes: '4' },
  tertiary: { maxspeed: '40', lanes: '2' },
  unclassified: { maxspeed: '40', lanes: '2' },
  residential: { maxspeed: '40', lanes: '2' },
  living_street: { maxspeed: '20', lanes: '2' },
  service: { maxspeed: '20', lanes: '2' },
  primary_link: { maxspeed: '40', lanes: '1' },
  secondary_link: { maxspeed: '40', lanes: '1' },
  tertiary_link: { maxspeed: '40', lanes: '1' },
}

/** Подсказки ключей в таблице тегов. */
export const COMMON_KEYS = [
  'name',
  'highway',
  'lanes',
  'lanes:forward',
  'lanes:backward',
  'oneway',
  'maxspeed',
  'turn:lanes',
  'turn:lanes:forward',
  'turn:lanes:backward',
  'bridge',
  'tunnel',
  'layer',
  'ele',
  'width',
  'surface',
  'junction',
  'access',
  'motor_vehicle',
  'psv',
  'lit',
  'sidewalk',
  'crossing',
  'traffic_signals',
]
