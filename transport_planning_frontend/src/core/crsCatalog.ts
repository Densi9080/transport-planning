/** Каталог систем координат: коды EPSG и параметры PROJ. Сам граф всегда хранится в WGS 84. */

export interface CrsEntry {
  id: string
  name: string
  group: string
  /** Строка PROJ или WKT. У форматов показа её нет. */
  def?: string
  custom?: boolean
}

export const WGS84_ID = 'EPSG:4326'
export const DMS_ID = 'WGS84:DMS'
export const LOCAL_ID = 'LOCAL:METERS'

const GROUP_GEO = 'Географические'
const GROUP_PROJ = 'Проекции'
const GROUP_UTM = 'UTM, WGS 84'
const GROUP_GK42 = 'Пулково-42, Гаусс — Крюгер'
const GROUP_GK95 = 'Пулково-95, Гаусс — Крюгер'
const GROUP_FORMAT = 'Формат показа'

const TOWGS_42 = '23.57,-140.95,-79.8,0,0.35,0.79,-0.22'
const TOWGS_95 = '24.47,-130.89,-81.56,0,0,0.13,-0.22'
const GK_MIN_ZONE = 4
const GK_MAX_ZONE = 32
const UTM_ZONES = 60

function gaussKruger(zone: number, towgs: string): string {
  return `+proj=tmerc +lat_0=0 +lon_0=${zone * 6 - 3} +k=1 +x_0=${zone * 1_000_000 + 500_000} +y_0=0 +ellps=krass +towgs84=${towgs} +units=m +no_defs`
}

function build(): CrsEntry[] {
  const list: CrsEntry[] = [
    { id: WGS84_ID, name: 'WGS 84', group: GROUP_GEO, def: '+proj=longlat +datum=WGS84 +no_defs' },
    { id: 'EPSG:4284', name: 'Pulkovo 1942 (СК-42)', group: GROUP_GEO, def: `+proj=longlat +ellps=krass +towgs84=${TOWGS_42} +no_defs` },
    { id: 'EPSG:4200', name: 'Pulkovo 1995 (СК-95)', group: GROUP_GEO, def: `+proj=longlat +ellps=krass +towgs84=${TOWGS_95} +no_defs` },
    { id: 'EPSG:7683', name: 'ГСК-2011', group: GROUP_GEO, def: '+proj=longlat +a=6378136.5 +rf=298.2564151 +towgs84=0,0,0,0,0,0,0 +no_defs' },
    { id: 'EPSG:3857', name: 'WGS 84 / Pseudo-Mercator', group: GROUP_PROJ, def: '+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +no_defs' },
    // Меркатор на эллипсоиде WGS 84: в нём нарезаны тайлы Яндекс Карт. Северная координата тут меньше, чем в 3857
    { id: 'EPSG:3395', name: 'WGS 84 / World Mercator (Яндекс Карты)', group: GROUP_PROJ, def: '+proj=merc +lon_0=0 +k=1 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs' },
    { id: DMS_ID, name: 'WGS 84, градусы, минуты, секунды', group: GROUP_FORMAT },
    { id: LOCAL_ID, name: 'Локальные метры от центра участка', group: GROUP_FORMAT },
  ]
  for (let zone = 1; zone <= UTM_ZONES; zone++) {
    list.push({ id: `EPSG:${32600 + zone}`, name: `WGS 84 / UTM zone ${zone}N`, group: GROUP_UTM, def: `+proj=utm +zone=${zone} +datum=WGS84 +units=m +no_defs` })
  }
  for (let zone = GK_MIN_ZONE; zone <= GK_MAX_ZONE; zone++) {
    list.push({ id: `EPSG:${28400 + zone}`, name: `Pulkovo 1942 / Gauss-Kruger zone ${zone}`, group: GROUP_GK42, def: gaussKruger(zone, TOWGS_42) })
    list.push({ id: `EPSG:${20000 + zone}`, name: `Pulkovo 1995 / Gauss-Kruger zone ${zone}`, group: GROUP_GK95, def: gaussKruger(zone, TOWGS_95) })
  }
  return list
}

export const CRS_CATALOG: CrsEntry[] = build()
export const CRS_GROUPS = [GROUP_GEO, GROUP_PROJ, GROUP_UTM, GROUP_GK42, GROUP_GK95, GROUP_FORMAT]

/** Значения прежнего выпадающего списка: они могли остаться в настройках браузера и в старых вызовах. */
export const LEGACY_CRS: Record<string, string> = {
  wgs84: WGS84_ID,
  dms: DMS_ID,
  utm: 'EPSG:32648',
  gk42: 'EPSG:28418',
  mercator: 'EPSG:3857',
  yandex: 'EPSG:3395',
  local: LOCAL_ID,
}
