import { parseProfile } from './lanes'
import type { Tags } from './types'

export interface RoadPreset {
  id: string
  group: string
  title: string
  summary: string
  /** Откуда взяты параметры: норматив, расчётная скорость и допустимое число полос. */
  norm?: string
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

const SP42 = 'СП 42.13330.2016, табл. 11.2'
const GOST = 'ГОСТ Р 52398-2005, табл. 1, скорость по ПДД п. 10.3'
const norm = (preset: RoadPreset, text: string): RoadPreset => ({ ...preset, norm: text })
const CITY_ROADS = 'Магистральные городские дороги'
const CITY_STREETS = 'Магистральные улицы общегородского значения'
const DISTRICT = 'Магистральные улицы и дороги районного значения'
const LOCAL = 'Улицы и дороги местного значения'
const OUTER = 'Внешние автомобильные дороги'
const OTHER = 'Съезды, жилые зоны и проезды'

// Разрешённая скорость по примечанию 2 к табл. 11.2: на 10 км/ч ниже расчётной
export const ROAD_PRESETS: RoadPreset[] = [
  norm(road('city-road-1', CITY_ROADS, 'Дорога 1-го класса, скоростное движение', 3, 3, 3.75, 120, 'motorway'), `Vрасч 130, полоса 3,50–3,75 м, 4–10 полос. ${SP42}`),
  norm(road('city-road-2', CITY_ROADS, 'Дорога 2-го класса, регулируемое движение', 2, 2, 3.75, 80, 'trunk'), `Vрасч 90, полоса 3,50–3,75 м, 4–8 полос. ${SP42}`),
  norm(road('city-street-1', CITY_STREETS, 'Улица 1-го класса, непрерывное движение', 3, 3, 3.75, 80, 'trunk'), `Vрасч 90, полоса 3,50–3,75 м, 4–10 полос. ${SP42}`),
  norm(road('primary-6', CITY_STREETS, 'Улица 2-го класса, 6 полос', 3, 3, 3.5, 70, 'primary'), `Vрасч 80, полоса 3,25–3,75 м, 4–10 полос. ${SP42}`),
  norm(road('primary-4', CITY_STREETS, 'Улица 2-го класса, 4 полосы', 2, 2, 3.5, 70, 'primary'), `Vрасч 80, полоса 3,25–3,75 м, 4–10 полос. ${SP42}`),
  norm(road('city-street-3', CITY_STREETS, 'Улица 3-го класса', 2, 2, 3.5, 60, 'primary'), `Vрасч 70, полоса 3,25–3,75 м, 4–6 полос. ${SP42}`),
  road('primary-oneway', CITY_STREETS, 'Улица, одна проезжая часть', 3, 0, 3.5, 60, 'primary'),
  norm(road('secondary-4', DISTRICT, 'Улица районного значения, 4 полосы', 2, 2, 3.5, 60, 'secondary'), `Vрасч 70, полоса 3,25–3,75 м, 2–4 полосы. ${SP42}`),
  norm(road('secondary-2', DISTRICT, 'Улица районного значения, 2 полосы', 1, 1, 3.5, 60, 'secondary'), `Vрасч 70, полоса 3,25–3,75 м, 2–4 полосы. ${SP42}`),
  norm(road('district-road', DISTRICT, 'Дорога районного значения', 1, 1, 3.5, 60, 'secondary'), `Vрасч 70, полоса 3,25–3,75 м, 2–4 полосы. ${SP42}`),
  norm(road('residential', LOCAL, 'Улица в жилой застройке', 1, 1, 3.25, 40, 'residential'), `Vрасч 50, полоса 3,0–3,5 м, 2–4 полосы. ${SP42}`),
  norm(road('tertiary', LOCAL, 'Улица в общественно-деловой зоне', 1, 1, 3.25, 40, 'tertiary'), `Vрасч 50, полоса 3,0–3,5 м, 2–4 полосы. ${SP42}`),
  norm(road('industrial', LOCAL, 'Улица или дорога в производственной зоне', 1, 1, 3.5, 40, 'unclassified'), `Vрасч 50, полоса 3,5 м, 2–4 полосы. ${SP42}`),
  norm(road('outer-1a', OUTER, 'Автомагистраль, категория IА', 2, 2, 3.75, 110, 'motorway'), `4 полосы и более, 3,75 м. ${GOST}`),
  norm(road('outer-1b', OUTER, 'Скоростная дорога, категория IБ', 2, 2, 3.75, 90, 'trunk'), `4 полосы и более, 3,75 м. ${GOST}`),
  norm(road('outer-1v', OUTER, 'Дорога обычного типа, категория IВ', 2, 2, 3.75, 90, 'trunk'), `4 полосы и более, 3,75 м. ${GOST}`),
  norm(road('outer-2', OUTER, 'Дорога категории II, 4 полосы', 2, 2, 3.5, 90, 'primary'), `4 полосы, 3,5 м. ${GOST}`),
  norm(road('outer-2-narrow', OUTER, 'Дорога категории II, 2 полосы', 1, 1, 3.75, 90, 'primary'), `2 полосы, 3,75 м. ${GOST}`),
  norm(road('outer-3', OUTER, 'Дорога категории III', 1, 1, 3.5, 90, 'secondary'), `2 полосы, 3,5 м. ${GOST}`),
  norm(road('outer-4', OUTER, 'Дорога категории IV', 1, 1, 3, 90, 'tertiary'), `2 полосы, 3,0 м. ${GOST}`),
  norm(road('outer-5', OUTER, 'Дорога категории V', 1, 0, 4.5, 90, 'unclassified', { oneway: 'no' }), `1 полоса, не менее 4,5 м. ${GOST}`),
  road('primary-link', OTHER, 'Съезд с магистрали', 1, 0, 4, 40, 'primary_link'),
  road('living', OTHER, 'Жилая зона', 1, 1, 2.75, 20, 'living_street'),
  road('service', OTHER, 'Проезд', 1, 1, 2.75, 20, 'service'),
  road('service-oneway', OTHER, 'Проезд односторонний', 1, 0, 3.5, 20, 'service'),
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
  { value: 'motorway', label: 'Автомагистраль, магистральная дорога 1-го класса' },
  { value: 'trunk', label: 'Скоростная дорога, магистральная дорога 2-го класса' },
  { value: 'primary', label: 'Магистральная улица общегородского значения' },
  { value: 'secondary', label: 'Магистральная улица районного значения' },
  { value: 'tertiary', label: 'Улица местного значения, общественно-деловая' },
  { value: 'unclassified', label: 'Улица или дорога в производственной зоне' },
  { value: 'residential', label: 'Улица в жилой застройке' },
  { value: 'living_street', label: 'Жилая зона' },
  { value: 'service', label: 'Проезд' },
  { value: 'pedestrian', label: 'Пешеходная улица' },
  { value: 'motorway_link', label: 'Съезд с автомагистрали' },
  { value: 'trunk_link', label: 'Съезд со скоростной дороги' },
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
