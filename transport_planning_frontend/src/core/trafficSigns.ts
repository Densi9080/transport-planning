import type { OsmDoc } from './doc'
import { add, leftNormal, type Projector, scale } from './geo'
import { totalWidth } from './lanes'
import type { Network } from './topology'
import { restrictionsAt, restrictionVias } from './topology'
import type { Tags, XY } from './types'

/**
 * Знаки ПДД из файла OSM. Знак записывают по-разному:
 *  - явно: traffic_sign=RU:3.18.2, RU:3.24[40], BY:2.4, несколько через «;» или «,»,
 *    с направлением traffic_sign:forward / :backward;
 *  - словами: traffic_sign=maxspeed, stop, give_way, city_limit;
 *  - правилом, без самого знака: highway=stop (2.5), highway=give_way (2.4), запреты поворота
 *    restriction=no_left_turn (3.18.2) и т. п. Такие знаки восстанавливаем у подхода к узлу.
 * Номера в Беларуси совпадают с российскими для всех знаков, которые здесь различаются.
 */

export interface ParsedSign {
  country: string
  /** Номер по ПДД, например «3.18.2». Для нераспознанных — исходный текст. */
  code: string
  /** Значение в скобках: скорость, масса, время. */
  value?: string
}

export interface PlacedSign {
  code: string
  value?: string
  title: string
  point: XY
  /** Знак выведен из правила, а в файле его нет. */
  derived: boolean
  node?: number
}

export const SIGN_TITLES: Record<string, string> = {
  '1.17': 'Искусственная неровность',
  '2.1': 'Главная дорога',
  '2.4': 'Уступите дорогу',
  '2.5': 'Движение без остановки запрещено',
  '3.1': 'Въезд запрещён',
  '3.2': 'Движение запрещено',
  '3.18.1': 'Поворот направо запрещён',
  '3.18.2': 'Поворот налево запрещён',
  '3.19': 'Разворот запрещён',
  '3.20': 'Обгон запрещён',
  '3.24': 'Ограничение максимальной скорости',
  '3.27': 'Остановка запрещена',
  '3.28': 'Стоянка запрещена',
  '4.1.1': 'Движение прямо',
  '4.1.2': 'Движение направо',
  '4.1.3': 'Движение налево',
  '4.1.4': 'Движение прямо или направо',
  '4.1.5': 'Движение прямо или налево',
  '4.1.6': 'Движение направо или налево',
  '5.16': 'Место остановки автобуса и троллейбуса',
  '5.19.1': 'Пешеходный переход',
  '5.20': 'Искусственная неровность',
  '5.23.1': 'Начало населённого пункта',
  'no-straight': 'Движение прямо запрещено (запрет поворота в OSM)',
}

const WORDS: Record<string, string> = {
  stop: '2.5',
  give_way: '2.4',
  city_limit: '5.23.1',
  overtaking: '3.20',
  no_overtaking: '3.20',
  no_entry: '3.1',
  bus_stop: '5.16',
  crossing: '5.19.1',
  hump: '5.20',
  bump: '5.20',
  no_stopping: '3.27',
  no_parking: '3.28',
}

const RESTRICTION_SIGNS: Record<string, string> = {
  no_right_turn: '3.18.1',
  no_left_turn: '3.18.2',
  no_u_turn: '3.19',
  no_straight_on: 'no-straight',
  only_straight_on: '4.1.1',
  only_right_turn: '4.1.2',
  only_left_turn: '4.1.3',
}

/** Разбирает значение traffic_sign. Пустой результат — в значении нет знаков. */
export function parseTrafficSign(raw: string | undefined, tags: Tags = {}): ParsedSign[] {
  if (!raw) return []
  const result: ParsedSign[] = []
  for (const part of raw.split(';').map((item) => item.trim()).filter(Boolean)) {
    const prefixed = /^([A-Z]{2}):(.+)$/.exec(part)
    const country = prefixed?.[1] ?? ''
    const body = prefixed?.[2] ?? part
    for (const item of body.split(',').map((text) => text.trim()).filter(Boolean)) {
      const word = item.toLowerCase()
      if (word === 'maxspeed') {
        result.push({ country, code: '3.24', value: tags.maxspeed })
        continue
      }
      if (WORDS[word]) {
        result.push({ country, code: WORDS[word]! })
        continue
      }
      const match = /^(\d+(?:\.\d+)*)(?:\[([^\]]*)\])?$/.exec(item)
      if (match) result.push({ country, code: match[1]!, value: match[2] })
      else result.push({ country, code: item })
    }
  }
  return result
}

export function signTitle(code: string, value?: string): string {
  const title = SIGN_TITLES[code] ?? `Знак ${code}`
  return value ? `${code} ${title} (${value})` : `${code} ${title}`
}

const SIGN_SIDE_M = 1.5
const SIGN_BEFORE_M = 14

/**
 * Все знаки участка: явные из тегов и выведенные из запретов поворота. Явный знак ставится
 * у своего узла, выведенный — на правой обочине подхода в 14 м до узла, как его ставят на улице.
 */
export function placeSigns(doc: OsmDoc, network: Network, projector: Projector): PlacedSign[] {
  const signs: PlacedSign[] = []
  for (const node of doc.nodes.values()) {
    const tags = node.tags
    // Знаков в файле мало, а узлов тысячи: без тега traffic_sign узел пропускаем сразу
    if (!tags || !(tags.traffic_sign || tags['traffic_sign:forward'] || tags['traffic_sign:backward'])) continue
    const values = [tags.traffic_sign, tags['traffic_sign:forward'], tags['traffic_sign:backward']]
    const parsed = values.flatMap((value) => parseTrafficSign(value, tags))
    // Знак на самом узле highway=stop / give_way ставит редактор отдельно, здесь он лишний
    const own = parsed.filter((sign) => !(sign.code === '2.5' && tags.highway === 'stop') && !(sign.code === '2.4' && tags.highway === 'give_way'))
    own.forEach((sign, index) => {
      // Несколько знаков одного узла — столбиком, чтобы не лежали друг на друге
      const point = add(projector.toXY(node), { x: 0, y: -index * 3 })
      signs.push({ code: sign.code, value: sign.value, title: signTitle(sign.code, sign.value), point, derived: false, node: node.id })
    })
  }

  for (const via of restrictionVias(doc)) {
    const arms = network.arms.get(via)
    if (!arms || arms.length < 3) continue
    const restrictions = restrictionsAt(doc, via)
    if (!restrictions.length) continue
    const center = projector.toXY(doc.node(via))
    for (const arm of arms) {
      if (arm.lanesIn === 0) continue
      const codes = [...new Set(restrictions.filter((r) => r.from === arm.link.wayId).map((r) => RESTRICTION_SIGNS[r.value]).filter((code): code is string => !!code))]
      codes.forEach((code, index) => {
        // Справа по ходу движения к узлу: при движении к узлу направление -arm.dir, правая сторона — leftNormal(arm.dir)
        const side = totalWidth(arm.link.profile) / 2 + SIGN_SIDE_M
        const before = Math.min(SIGN_BEFORE_M, arm.link.length * 0.6) + index * 3
        const point = add(add(center, scale(arm.dir, before)), scale(leftNormal(arm.dir), side))
        signs.push({ code, title: signTitle(code), point, derived: true, node: via })
      })
    }
  }
  return signs
}
