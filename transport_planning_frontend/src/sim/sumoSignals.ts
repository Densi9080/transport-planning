import type { OsmDoc } from '@/core/doc'
import type { Projector } from '@/core/geo'

import { buildSimNet } from './net'

/**
 * Светофорные объекты для экспорта в SUMO: план и фазы каждого манёвра так, как их видит модель редактора.
 * Сервер привяжет их к соединениям сети, которую соберёт netconvert.
 */
export interface SumoSignalGroup {
  nodes: number[]
  plan: { offset: number; yellow: number; allRed: number; phases: { green: number }[] }
  /** Ключ манёвра «узел:откуда>куда» и номера фаз, в которых у него зелёный. */
  movements: Record<string, number[]>
}

/** Только настоящие светофоры: предположенные моделью есть лишь в редакторе, в сети SUMO их нет. */
export function sumoSignalGroups(doc: OsmDoc, projector: Projector): SumoSignalGroup[] {
  const net = buildSimNet(doc, projector, false)
  return net.signals.map((group) => {
    const movements: Record<string, number[]> = {}
    for (const connector of group.connectors) {
      // Манёвр без плана модель пускает по оси: в SUMO он поедет так же
      movements[connector.movement] = [...new Set([...(movements[connector.movement] ?? []), ...connector.phases])].sort((a, b) => a - b)
    }
    return {
      nodes: [...group.nodes],
      plan: {
        offset: group.plan.offset,
        yellow: group.plan.yellow,
        allRed: group.plan.allRed,
        phases: group.plan.phases.map((phase) => ({ green: phase.green })),
      },
      movements,
    }
  })
}
