import type { Tags } from './types'

export interface RoadPreset {
  id: string
  group: string
  title: string
  summary: string
  /** Рисунок поперечного сечения: полосы по направлениям. */
  forward: number
  backward: number
  tags: Tags
}

const road = (
  id: string,
  group: string,
  title: string,
  forward: number,
  backward: number,
  speed: number,
  highway: string,
  extra: Tags = {},
): RoadPreset => ({
  id,
  group,
  title,
  forward,
  backward,
  summary: `${backward > 0 ? `${forward} + ${backward}` : `${forward} в одну сторону`} · ${speed} км/ч`,
  tags: {
    highway,
    lanes: String(forward + backward),
    maxspeed: String(speed),
    ...(backward > 0
      ? forward !== backward
        ? { 'lanes:forward': String(forward), 'lanes:backward': String(backward) }
        : {}
      : { oneway: 'yes' }),
    ...extra,
  },
})

export const ROAD_PRESETS: RoadPreset[] = [
  road('primary-4', 'Магистрали', 'Магистраль городская', 2, 2, 60, 'primary'),
  road('primary-6', 'Магистрали', 'Магистраль широкая', 3, 3, 60, 'primary'),
  road('primary-oneway', 'Магистрали', 'Магистраль одной стороны', 3, 0, 60, 'primary'),
  road('primary-link', 'Магистрали', 'Съезд с магистрали', 1, 0, 40, 'primary_link'),
  road('secondary-4', 'Улицы', 'Районная улица', 2, 2, 60, 'secondary'),
  road('secondary-2', 'Улицы', 'Районная, 2 полосы', 1, 1, 60, 'secondary'),
  road('tertiary', 'Улицы', 'Улица местного значения', 1, 1, 40, 'tertiary'),
  road('residential', 'Улицы', 'Жилая улица', 1, 1, 40, 'residential'),
  road('living', 'Проезды', 'Жилая зона', 1, 1, 20, 'living_street'),
  road('service', 'Проезды', 'Проезд', 1, 1, 20, 'service'),
  road('service-oneway', 'Проезды', 'Проезд односторонний', 1, 0, 20, 'service'),
]

export const DEFAULT_PRESET_ID = 'residential'

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
