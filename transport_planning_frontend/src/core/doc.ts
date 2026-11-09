import type { Bounds, ChangeSection, Changes, ONode, ORelation, OWay, RawDocument } from './types'

type Entity = ONode | OWay | ORelation
type EntityKind = 'n' | 'w' | 'r'

interface Patch {
  label: string
  entries: Map<string, { before: Entity | null; after: Entity | null }>
}

/**
 * Рабочая копия графа. Объекты неизменяемы: правка заменяет объект целиком,
 * поэтому отмена хранит только ссылки «до» и «после», а изменившиеся объекты
 * находятся сравнением ссылок с оригиналом.
 */
export class OsmDoc {
  readonly nodes = new Map<number, ONode>()
  readonly ways = new Map<number, OWay>()
  readonly relations = new Map<number, ORelation>()
  readonly bounds: Bounds

  private readonly originalNodes: Map<number, ONode>
  private readonly originalWays: Map<number, OWay>
  private readonly originalRelations: Map<number, ORelation>
  private readonly nodeIndex = new Map<number, Set<number>>()

  private undoStack: Patch[] = []
  private redoStack: Patch[] = []
  private active: Patch | null = null
  private depth = 0
  private lastId = 0

  constructor(raw: RawDocument) {
    this.bounds = raw.bounds
    for (const node of raw.nodes) this.nodes.set(node.id, node)
    for (const way of raw.ways) {
      this.ways.set(way.id, way)
      this.indexWay(way)
    }
    for (const relation of raw.relations) this.relations.set(relation.id, relation)
    this.originalNodes = new Map(this.nodes)
    this.originalWays = new Map(this.ways)
    this.originalRelations = new Map(this.relations)
    this.lastId = Math.max(
      0,
      ...this.nodes.keys(),
      ...this.ways.keys(),
      ...this.relations.keys(),
    )
  }

  /** Новые id идут выше всех существующих: отрицательные могут не пройти чужие адаптеры. */
  newId(): number {
    return ++this.lastId
  }

  node(id: number): ONode {
    const node = this.nodes.get(id)
    if (!node) throw new Error(`Узел ${id} не найден`)
    return node
  }

  way(id: number): OWay {
    const way = this.ways.get(id)
    if (!way) throw new Error(`Дорога ${id} не найдена`)
    return way
  }

  waysOfNode(id: number): number[] {
    return [...(this.nodeIndex.get(id) ?? [])]
  }

  putNode(node: ONode): void {
    this.record(`n${node.id}`, this.nodes.get(node.id) ?? null)
    this.nodes.set(node.id, node)
  }

  putWay(way: OWay): void {
    const before = this.ways.get(way.id) ?? null
    this.record(`w${way.id}`, before)
    if (before) this.unindexWay(before)
    this.ways.set(way.id, way)
    this.indexWay(way)
  }

  putRelation(relation: ORelation): void {
    this.record(`r${relation.id}`, this.relations.get(relation.id) ?? null)
    this.relations.set(relation.id, relation)
  }

  removeNode(id: number): void {
    const before = this.nodes.get(id)
    if (!before) return
    this.record(`n${id}`, before)
    this.nodes.delete(id)
  }

  removeWay(id: number): void {
    const before = this.ways.get(id)
    if (!before) return
    this.record(`w${id}`, before)
    this.unindexWay(before)
    this.ways.delete(id)
  }

  removeRelation(id: number): void {
    const before = this.relations.get(id)
    if (!before) return
    this.record(`r${id}`, before)
    this.relations.delete(id)
  }

  get inTransaction(): boolean {
    return this.active !== null
  }

  begin(label: string): void {
    if (this.depth === 0) this.active = { label, entries: new Map() }
    this.depth++
  }

  commit(): boolean {
    if (this.depth === 0) throw new Error('Нет открытой транзакции')
    this.depth--
    if (this.depth > 0) return false
    const patch = this.active!
    this.active = null
    for (const [key, entry] of patch.entries) {
      entry.after = this.read(key)
      if (entry.before === entry.after) patch.entries.delete(key)
    }
    if (patch.entries.size === 0) return false
    this.undoStack.push(patch)
    this.redoStack = []
    return true
  }

  rollback(): void {
    if (!this.active) return
    const patch = this.active
    this.active = null
    this.depth = 0
    for (const [key, entry] of patch.entries) this.write(key, entry.before)
  }

  transact<T>(label: string, action: () => T): T {
    this.begin(label)
    try {
      const result = action()
      this.commit()
      return result
    } catch (error) {
      this.rollback()
      throw error
    }
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0
  }

  /** Шаг, который отменится следующим. По нему можно узнать, в силе ли ещё конкретная правка. */
  get lastStep(): object | null {
    return this.undoStack.at(-1) ?? null
  }

  isStepApplied(step: object): boolean {
    return this.undoStack.includes(step as Patch)
  }

  get undoLabel(): string | null {
    return this.undoStack.at(-1)?.label ?? null
  }

  get redoLabel(): string | null {
    return this.redoStack.at(-1)?.label ?? null
  }

  undo(): boolean {
    const patch = this.undoStack.pop()
    if (!patch) return false
    for (const [key, entry] of patch.entries) this.write(key, entry.before)
    this.redoStack.push(patch)
    return true
  }

  redo(): boolean {
    const patch = this.redoStack.pop()
    if (!patch) return false
    for (const [key, entry] of patch.entries) this.write(key, entry.after)
    this.undoStack.push(patch)
    return true
  }

  /** Отличия от исходного файла. Правка, возвращённая к оригиналу, сюда не попадает. */
  changes(): Changes {
    return {
      nodes: diffSection(this.nodes, this.originalNodes),
      ways: diffSection(this.ways, this.originalWays),
      relations: diffSection(this.relations, this.originalRelations),
    }
  }

  get changeCount(): number {
    const { nodes, ways, relations } = this.changes()
    return [nodes, ways, relations].reduce(
      (sum, section) => sum + (section?.upsert.length ?? 0) + (section?.delete.length ?? 0),
      0,
    )
  }

  /** Восстанавливает сохранённые правки без записи в историю отмены. */
  applySaved(changes: Changes | null | undefined): void {
    if (!changes) return
    for (const node of changes.nodes?.upsert ?? []) this.write(`n${node.id}`, node)
    for (const way of changes.ways?.upsert ?? []) this.write(`w${way.id}`, way)
    for (const relation of changes.relations?.upsert ?? []) this.write(`r${relation.id}`, relation)
    for (const id of changes.relations?.delete ?? []) this.write(`r${id}`, null)
    for (const id of changes.ways?.delete ?? []) this.write(`w${id}`, null)
    for (const id of changes.nodes?.delete ?? []) this.write(`n${id}`, null)
    this.lastId = Math.max(
      this.lastId,
      ...this.nodes.keys(),
      ...this.ways.keys(),
      ...this.relations.keys(),
    )
  }

  private record(key: string, before: Entity | null): void {
    if (!this.active) throw new Error('Правка вне транзакции')
    if (!this.active.entries.has(key)) this.active.entries.set(key, { before, after: null })
  }

  private read(key: string): Entity | null {
    const id = Number(key.slice(1))
    switch (key[0] as EntityKind) {
      case 'n':
        return this.nodes.get(id) ?? null
      case 'w':
        return this.ways.get(id) ?? null
      default:
        return this.relations.get(id) ?? null
    }
  }

  private write(key: string, value: Entity | null): void {
    const id = Number(key.slice(1))
    switch (key[0] as EntityKind) {
      case 'n':
        if (value) this.nodes.set(id, value as ONode)
        else this.nodes.delete(id)
        break
      case 'w': {
        const before = this.ways.get(id)
        if (before) this.unindexWay(before)
        if (value) {
          this.ways.set(id, value as OWay)
          this.indexWay(value as OWay)
        } else {
          this.ways.delete(id)
        }
        break
      }
      default:
        if (value) this.relations.set(id, value as ORelation)
        else this.relations.delete(id)
    }
  }

  private indexWay(way: OWay): void {
    for (const nd of way.nds) {
      let set = this.nodeIndex.get(nd)
      if (!set) {
        set = new Set()
        this.nodeIndex.set(nd, set)
      }
      set.add(way.id)
    }
  }

  private unindexWay(way: OWay): void {
    for (const nd of way.nds) {
      const set = this.nodeIndex.get(nd)
      if (!set) continue
      set.delete(way.id)
      if (set.size === 0) this.nodeIndex.delete(nd)
    }
  }
}

function diffSection<T extends Entity>(
  current: Map<number, T>,
  original: Map<number, T>,
): ChangeSection<T> {
  const section: ChangeSection<T> = { upsert: [], delete: [] }
  for (const [id, item] of current) {
    const base = original.get(id)
    if (item !== base && (!base || JSON.stringify(item) !== JSON.stringify(base))) {
      section.upsert.push(item)
    }
  }
  for (const id of original.keys()) {
    if (!current.has(id)) section.delete.push(id)
  }
  return section
}
