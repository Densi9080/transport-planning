import type { Tags } from './types'

/**
 * Светофор в узле. Кроме highway=traffic_signals светофором считается и регулируемый пешеходный
 * переход: highway=crossing + crossing=traffic_signals (так его рисуют в OSM) или crossing:signals=yes.
 * Такой узел останавливает машины даже посреди перегона, без всякого перекрёстка.
 */
export function isSignalNode(tags: Tags | undefined): boolean {
  if (!tags) return false
  return tags.highway === 'traffic_signals' || tags.crossing === 'traffic_signals' || tags['crossing:signals'] === 'yes'
}

/** Пешеходный переход в узле, регулируемый или нет. */
export function isCrossingNode(tags: Tags | undefined): boolean {
  if (!tags) return false
  return tags.highway === 'crossing' || (!!tags.crossing && tags.crossing !== 'no')
}

/**
 * Ставит или снимает светофор. На переходе светофор не затирает его, а делает регулируемым:
 * highway=traffic_signals + crossing=traffic_signals + crossing:signals=yes, как принято в OSM.
 * Снятие возвращает нерегулируемый переход. Возвращает true, если светофор теперь есть.
 */
export function toggledSignalTags(tags: Tags): { tags: Tags; enabled: boolean } {
  const next: Tags = { ...tags }
  const crossing = isCrossingNode(tags)
  const enabled = !isSignalNode(tags)
  if (enabled) {
    next.highway = 'traffic_signals'
    if (crossing) {
      next.crossing = 'traffic_signals'
      next['crossing:signals'] = 'yes'
    }
  } else if (crossing) {
    next.highway = 'crossing'
    next.crossing = 'uncontrolled'
    delete next['crossing:signals']
  } else {
    delete next.highway
  }
  return { tags: next, enabled }
}

/** Ставит или снимает переход. На светофоре переход становится регулируемым, светофор остаётся. */
export function toggledCrossingTags(tags: Tags): { tags: Tags; enabled: boolean } {
  const next: Tags = { ...tags }
  const signal = isSignalNode(tags)
  const enabled = !isCrossingNode(tags)
  if (enabled) {
    if (signal) {
      next.highway = 'traffic_signals'
      next.crossing = 'traffic_signals'
      next['crossing:signals'] = 'yes'
    } else {
      next.highway = 'crossing'
      next.crossing = next.crossing ?? 'uncontrolled'
    }
  } else {
    delete next.crossing
    delete next['crossing:signals']
    if (next.highway === 'crossing') {
      if (signal) next.highway = 'traffic_signals'
      else delete next.highway
    }
  }
  return { tags: next, enabled }
}
