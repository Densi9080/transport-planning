export type Tags = Record<string, string>

export interface ONode {
  id: number
  lat: number
  lon: number
  tags?: Tags
}

export interface OWay {
  id: number
  nds: number[]
  tags?: Tags
}

export type MemberType = 'node' | 'way' | 'relation'
export type Member = [type: MemberType, ref: number, role: string]

export interface ORelation {
  id: number
  members: Member[]
  tags?: Tags
}

export interface Bounds {
  minlat: number
  minlon: number
  maxlat: number
  maxlon: number
}

export interface RawDocument {
  bounds: Bounds
  nodes: ONode[]
  ways: OWay[]
  relations: ORelation[]
}

export interface ChangeSection<T> {
  upsert: T[]
  delete: number[]
}

export interface Changes {
  nodes?: ChangeSection<ONode>
  ways?: ChangeSection<OWay>
  relations?: ChangeSection<ORelation>
}

export interface XY {
  x: number
  y: number
}

export interface LatLon {
  lat: number
  lon: number
}
