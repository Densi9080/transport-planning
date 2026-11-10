import type { Feature, Polygon } from 'geojson'
import { describe, expect, it } from 'vitest'

import { OsmDoc } from '../doc'
import { Projector } from '../geo'
import { totalWidth } from '../lanes'
import { buildScene } from '../scene'
import type { RawDocument } from '../types'

const LAT = 52
const LON = 104
const STEP = 0.001
/** Около 7 м по долготе и 11 м по широте: тротуар за кромкой дороги. */
const SIDE_LAT = 0.0001
const SIDE_LON = 0.0001

function road(crossing: RawDocument['ways'], extraNodes: RawDocument['nodes'], centerTags: Record<string, string> = {}): RawDocument {
  return {
    bounds: { minlat: 51, minlon: 103, maxlat: 53, maxlon: 105 },
    nodes: [
      { id: 1, lat: LAT, lon: LON - STEP },
      { id: 2, lat: LAT, lon: LON, tags: { highway: 'crossing', crossing: 'marked', ...centerTags } },
      { id: 3, lat: LAT, lon: LON + STEP },
      ...extraNodes,
    ],
    ways: [{ id: 10, nds: [1, 2, 3], tags: { highway: 'secondary', lanes: '4' } }, ...crossing],
    relations: [],
  }
}

function crossingFeatures(raw: RawDocument, node: number) {
  const doc = new OsmDoc(raw)
  const projector = new Projector(raw.bounds)
  const { scene, network } = buildScene(doc, projector)
  const features = scene.crossings.features.filter((feature) => feature.properties?.node === node)
  const link = network.links.find((item) => item.wayId === 10)!
  const center = projector.toXY(doc.node(node))
  /** Смещения вершин поперёк дороги (дорога идёт строго на восток, поэтому это просто y). */
  const across = (kind: string) =>
    features
      .filter((feature) => feature.properties?.kind === kind)
      .flatMap((feature) => (feature as Feature<Polygon>).geometry.coordinates[0]!)
      .map(([lon, lat]) => projector.toXY({ lat: lat!, lon: lon! }).y - center.y)
  return { features, width: totalWidth(link.profile), across, projector, center }
}

describe('пешеходные переходы на карте', () => {
  it('переход точкой: зебра поперёк дороги от кромки до кромки', () => {
    const { features, width, across } = crossingFeatures(road([], []), 2)
    const band = across('band')
    expect(Math.max(...band)).toBeCloseTo(width / 2, 2)
    expect(Math.min(...band)).toBeCloseTo(-width / 2, 2)
    const stripes = features.filter((feature) => feature.properties?.kind === 'stripe')
    expect(stripes.length).toBe(Math.floor((width - 0.65) / 1.2))
    expect(Math.max(...across('stripe'))).toBeLessThanOrEqual(width / 2)
    expect(features.some((feature) => feature.properties?.kind === 'axis')).toBe(true)
  })

  it('диагональный переход не выходит за кромки и идёт под своим углом', () => {
    const raw = road(
      [{ id: 30, nds: [31, 2, 33], tags: { highway: 'footway', footway: 'crossing', crossing: 'marked' } }],
      [
        { id: 31, lat: LAT - SIDE_LAT, lon: LON - SIDE_LON * 1.6 },
        { id: 33, lat: LAT + SIDE_LAT, lon: LON + SIDE_LON * 1.6 },
      ],
    )
    const { features, width, across, projector, center } = crossingFeatures(raw, 2)
    // Раньше полосы шли по всей линии перехода, через тротуары: на 22 м вместо ширины дороги
    for (const kind of ['band', 'stripe']) {
      for (const offset of across(kind)) expect(Math.abs(offset)).toBeLessThanOrEqual(width / 2 + 1e-6)
    }
    // Ось перехода наклонена так же, как его линия
    const axis = features.find((feature) => feature.properties?.kind === 'axis')!
    const [from, to] = (axis.geometry as GeoJSON.LineString).coordinates.map(([lon, lat]) => projector.toXY({ lat: lat!, lon: lon! }))
    const end = projector.toXY({ lat: LAT + SIDE_LAT, lon: LON + SIDE_LON * 1.6 })
    const expected = Math.atan2(end.y - center.y, end.x - center.x)
    const actual = Math.atan2(to!.y - from!.y, to!.x - from!.x)
    expect(Math.abs(Math.sin(actual - expected))).toBeLessThan(1e-6)
    // Полоса зебры по-прежнему шириной 0,55 м поперёк дороги
    const stripe = features.find((feature) => feature.properties?.kind === 'stripe') as Feature<Polygon>
    const ys = stripe.geometry.coordinates[0]!.map(([lon, lat]) => projector.toXY({ lat: lat!, lon: lon! }).y)
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(0.55, 2)
  })

  it('переход через разделённую дорогу размечен на каждой проезжей части', () => {
    const raw: RawDocument = {
      bounds: { minlat: 51, minlon: 103, maxlat: 53, maxlon: 105 },
      nodes: [
        { id: 1, lat: LAT, lon: LON - STEP },
        { id: 2, lat: LAT, lon: LON },
        { id: 3, lat: LAT, lon: LON + STEP },
        { id: 4, lat: LAT + 0.0002, lon: LON + STEP },
        { id: 5, lat: LAT + 0.0002, lon: LON + 0.00005 },
        { id: 6, lat: LAT + 0.0002, lon: LON - STEP },
        { id: 31, lat: LAT - SIDE_LAT, lon: LON - 0.0001 },
        { id: 33, lat: LAT + 0.0003, lon: LON + 0.0002 },
      ],
      ways: [
        { id: 10, nds: [1, 2, 3], tags: { highway: 'primary', oneway: 'yes', lanes: '2' } },
        { id: 11, nds: [4, 5, 6], tags: { highway: 'primary', oneway: 'yes', lanes: '2' } },
        { id: 30, nds: [31, 2, 5, 33], tags: { highway: 'footway', footway: 'crossing', crossing: 'marked' } },
      ],
      relations: [],
    }
    const { scene } = buildScene(new OsmDoc(raw), new Projector(raw.bounds))
    const bands = scene.crossings.features.filter((feature) => feature.properties?.kind === 'band')
    expect(bands.map((feature) => feature.properties?.node).sort()).toEqual([2, 5])
  })

  it('нерегулируемый переход без разметки: подложка есть, белых полос нет', () => {
    const { features } = crossingFeatures(road([], [], { crossing: 'unmarked' }), 2)
    expect(features.some((feature) => feature.properties?.kind === 'band')).toBe(true)
    expect(features.some((feature) => feature.properties?.kind === 'stripe')).toBe(false)
  })
})
