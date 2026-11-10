import { describe, expect, it } from 'vitest'

import { OsmDoc } from '../doc'
import { Projector } from '../geo'
import { applyRuleTurnLanes, changesWithRuleTurns } from '../laneOps'
import { computeArmGeometries, junctionConnectors } from '../scene'
import { buildNetwork } from '../topology'
import { validate } from '../validate'
import { parseSample } from './sample'

function connectorKeys(doc: OsmDoc, projector: Projector): Set<string> {
  const network = buildNetwork(doc, projector)
  const geometries = computeArmGeometries(network)
  const keys = new Set<string>()
  for (const [node, arms] of network.arms) {
    if (arms.length < 3) continue
    for (const c of junctionConnectors(doc, node, arms, geometries)) keys.add(`${node}:${c.from.neighbor}:${c.fromLane}>${c.to.neighbor}:${c.toLane}`)
  }
  return keys
}

describe('turn:lanes по правилам ПДД при экспорте', () => {
  it('проект в редакторе не меняется, в правки экспорта попадают дороги с turn:lanes', () => {
    const raw = parseSample()
    const doc = new OsmDoc(raw)
    const projector = new Projector(raw.bounds)
    const before = JSON.stringify(doc.changes())
    const { changes, report } = changesWithRuleTurns(doc, projector)
    expect(JSON.stringify(doc.changes())).toBe(before)
    expect(doc.canUndo).toBe(false)
    expect(report.written).toBeGreaterThan(0)
    const ways = changes.ways?.upsert ?? []
    expect(ways.length).toBe(report.written > 0 ? ways.length : 0)
    expect(ways.every((way) => Object.keys(way.tags ?? {}).some((key) => key.startsWith('turn:lanes')))).toBe(true)
  })

  it('записанные turn:lanes дают ровно те же соединения полос и не добавляют ошибок разметки', () => {
    const raw = parseSample()
    const doc = new OsmDoc(raw)
    const projector = new Projector(raw.bounds)
    const keysBefore = connectorKeys(doc, projector)
    const mismatchBefore = validate(doc, projector).filter((issue) => issue.code === 'lanes_turn_mismatch').length
    doc.begin('тест')
    applyRuleTurnLanes(doc, projector)
    doc.commit()
    expect(connectorKeys(doc, projector)).toEqual(keysBefore)
    expect(validate(doc, projector).filter((issue) => issue.code === 'lanes_turn_mismatch').length).toBe(mismatchBefore)
  })
})
