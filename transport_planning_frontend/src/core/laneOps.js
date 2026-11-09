import { isOneway, withTurns } from './lanes';
import { ensureEndsAtVia, setMovementAllowed } from './ops';
import { computeArmGeometries, junctionConnectors } from './scene';
import { SIGNAL_PLAN_TAG, serializeSignalPlan } from './signals';
import { buildNetwork, connectivityAt, formatConnectivity } from './topology';
/**
 * Соединения полос внутри узла. Их можно задать вручную, в том числе вопреки разметке:
 * например, разрешить поворот налево со второй полосы.
 */
export function nodeConnectors(doc, projector, node) {
    const network = buildNetwork(doc, projector);
    const arms = network.arms.get(node) ?? [];
    if (arms.length < 2)
        return { arms, connectors: [] };
    const geometries = computeArmGeometries(network);
    return { arms, connectors: junctionConnectors(doc, node, arms, geometries) };
}
const TURN_VALUE = {
    left: 'left',
    through: 'through',
    right: 'right',
    reverse: 'reverse',
};
/**
 * Манёвры полос записываются ещё и в turn:lanes: это основной тег, который читают симуляторы,
 * а отношение connectivity уточняет, на какую именно полосу приводит манёвр.
 */
function syncTurnLanes(doc, projector, node, fromNeighbor) {
    const { arms, connectors } = nodeConnectors(doc, projector, node);
    const arm = arms.find((item) => item.neighbor === fromNeighbor);
    if (!arm)
        return;
    const way = doc.ways.get(arm.link.wayId);
    if (!way)
        return;
    const turns = Array.from({ length: arm.lanesIn }, () => new Set());
    for (const connector of connectors) {
        if (connector.from.neighbor === fromNeighbor)
            turns[connector.fromLane]?.add(connector.kind);
    }
    const order = ['reverse', 'left', 'through', 'right'];
    const values = turns.map((set) => order.filter((kind) => set.has(kind)).map((kind) => TURN_VALUE[kind]).join(';'));
    const direction = arm.atStart ? 'backward' : 'forward';
    const tags = way.tags ?? {};
    doc.putWay({ ...way, tags: withTurns(tags, isOneway(tags) && !arm.atStart ? 'forward' : direction, values) });
}
export function setLaneConnection(doc, projector, node, fromNeighbor, fromLane, toNeighbor, toLane, enabled) {
    const current = nodeConnectors(doc, projector, node).connectors;
    const pairs = current
        .filter((c) => c.from.neighbor === fromNeighbor && c.to.neighbor === toNeighbor)
        .map((c) => [c.fromLane, c.toLane])
        .filter(([a, b]) => !(a === fromLane && b === toLane));
    if (enabled)
        pairs.push([fromLane, toLane]);
    const fromWay = ensureEndsAtVia(doc, node, fromNeighbor);
    const toWay = ensureEndsAtVia(doc, node, toNeighbor);
    for (const rule of connectivityAt(doc, node)) {
        if (rule.from === fromWay && rule.to === toWay)
            doc.removeRelation(rule.relationId);
    }
    if (pairs.length === 0) {
        // Без единого соединения манёвра больше нет: в OSM это записывается запретом поворота
        setMovementAllowed(doc, projector, node, fromNeighbor, toNeighbor, false);
    }
    else {
        setMovementAllowed(doc, projector, node, fromNeighbor, toNeighbor, true);
        doc.putRelation({
            id: doc.newId(),
            members: [
                ['way', fromWay, 'from'],
                ['node', node, 'via'],
                ['way', toWay, 'to'],
            ],
            tags: { type: 'connectivity', connectivity: formatConnectivity(pairs) },
        });
    }
    syncTurnLanes(doc, projector, node, fromNeighbor);
}
/** Возвращает узел к автоматическим соединениям. Запреты поворота остаются. */
export function resetLaneConnections(doc, node) {
    for (const rule of connectivityAt(doc, node))
        doc.removeRelation(rule.relationId);
}
export function setSignalPlan(doc, node, plan) {
    const current = doc.node(node);
    const tags = { ...current.tags };
    if (plan)
        tags[SIGNAL_PLAN_TAG] = serializeSignalPlan(plan);
    else
        delete tags[SIGNAL_PLAN_TAG];
    doc.putNode({ ...current, tags });
}
