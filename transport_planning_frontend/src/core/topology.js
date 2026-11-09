import { dot, cross, pointAlong, polylineLength, sub, unit } from './geo';
import { isDrivable, parseProfile } from './lanes';
const DIRECTION_SAMPLE_M = 8;
export function wayLevel(tags) {
    const layer = Number.parseInt(tags.layer ?? '', 10);
    if (Number.isFinite(layer))
        return layer;
    if (tags.bridge && tags.bridge !== 'no')
        return 1;
    if (tags.tunnel && tags.tunnel !== 'no')
        return -1;
    return 0;
}
export function buildNetwork(doc, projector) {
    const visits = new Map();
    const drivable = [...doc.ways.values()].filter((way) => isDrivable(way.tags));
    for (const way of drivable) {
        way.nds.forEach((nd, index) => {
            const isEnd = index === 0 || index === way.nds.length - 1;
            visits.set(nd, (visits.get(nd) ?? 0) + (isEnd ? 1 : 2));
        });
    }
    const links = [];
    const arms = new Map();
    for (const way of drivable) {
        const tags = way.tags ?? {};
        const profile = parseProfile(tags);
        const level = wayLevel(tags);
        const bridge = !!tags.bridge && tags.bridge !== 'no';
        const tunnel = !!tags.tunnel && tags.tunnel !== 'no';
        let piece = [];
        const flush = () => {
            if (piece.length < 2)
                return;
            const points = piece.map((id) => projector.toXY(doc.node(id)));
            const link = {
                wayId: way.id,
                nodes: piece,
                points,
                length: polylineLength(points),
                profile,
                level,
                bridge,
                tunnel,
            };
            links.push(link);
            pushArm(arms, makeArm(link, true));
            pushArm(arms, makeArm(link, false));
        };
        way.nds.forEach((nd, index) => {
            if (!doc.nodes.has(nd))
                return;
            piece.push(nd);
            const isLast = index === way.nds.length - 1;
            // Конец дороги весит 1, проход через узел — 2: больше двух значит, что сходятся дороги
            const isGraphNode = (visits.get(nd) ?? 0) > 2;
            if (piece.length > 1 && (isLast || isGraphNode)) {
                flush();
                piece = [nd];
            }
        });
    }
    return { projector, links, arms };
}
function pushArm(arms, arm) {
    const list = arms.get(arm.node);
    if (list)
        list.push(arm);
    else
        arms.set(arm.node, [arm]);
}
function makeArm(link, atStart) {
    const node = atStart ? link.nodes[0] : link.nodes.at(-1);
    const neighbor = atStart ? link.nodes[1] : link.nodes.at(-2);
    const along = Math.min(DIRECTION_SAMPLE_M, link.length * 0.5);
    const origin = atStart ? link.points[0] : link.points.at(-1);
    const target = pointAlong(link.points, atStart ? along : link.length - along).point;
    return {
        node,
        link,
        atStart,
        neighbor,
        dir: unit(sub(target, origin)),
        lanesIn: atStart ? link.profile.backward : link.profile.forward,
        lanesOut: atStart ? link.profile.forward : link.profile.backward,
    };
}
export function turnKind(inArm, outArm) {
    if (inArm === outArm || inArm.neighbor === outArm.neighbor)
        return 'reverse';
    const travelIn = { x: -inArm.dir.x, y: -inArm.dir.y };
    const angle = Math.atan2(cross(travelIn, outArm.dir), dot(travelIn, outArm.dir));
    const degrees = (angle * 180) / Math.PI;
    if (Math.abs(degrees) < 35)
        return 'through';
    if (Math.abs(degrees) > 155)
        return 'reverse';
    return degrees > 0 ? 'left' : 'right';
}
export function restrictionsAt(doc, via) {
    const found = [];
    for (const relation of doc.relations.values()) {
        const value = relation.tags?.restriction;
        if (relation.tags?.type !== 'restriction' || !value)
            continue;
        let from = null;
        let to = null;
        let viaNode = null;
        for (const [type, ref, role] of relation.members) {
            if (type === 'way' && role === 'from')
                from = ref;
            else if (type === 'way' && role === 'to')
                to = ref;
            else if (type === 'node' && role === 'via')
                viaNode = ref;
        }
        if (viaNode !== via || from === null || to === null)
            continue;
        found.push({
            relationId: relation.id,
            kind: value.startsWith('only_') ? 'only' : 'no',
            value,
            from,
            to,
            via,
        });
    }
    return found;
}
/** Разрешён ли манёвр по отношениям type=restriction. Проверяется только запрет, не наличие полос. */
export function isMovementAllowed(inArm, outArm, restrictions) {
    const uTurn = inArm.neighbor === outArm.neighbor;
    const fromWay = inArm.link.wayId;
    const toWay = outArm.link.wayId;
    const relevant = restrictions.filter((r) => r.from === fromWay);
    const applies = (r) => {
        if (r.to !== toWay)
            return false;
        // Запрет с from == to описывает только разворот, а не проезд прямо по той же дороге
        return r.from !== r.to || uTurn;
    };
    const only = relevant.filter((r) => r.kind === 'only');
    if (only.length > 0 && !only.some(applies))
        return false;
    return !relevant.some((r) => r.kind === 'no' && applies(r));
}
/** Разбирает значение тега: 1:1,2|2:3. В OSM полосы нумеруются с единицы, необязательные — в скобках. */
export function parseConnectivity(value) {
    const pairs = [];
    for (const part of (value ?? '').split('|')) {
        const [from, targets] = part.split(':');
        const fromLane = Number.parseInt(from ?? '', 10);
        if (!Number.isFinite(fromLane) || !targets)
            continue;
        for (const target of targets.split(',')) {
            const toLane = Number.parseInt(target.replace(/[()]/g, ''), 10);
            if (Number.isFinite(toLane))
                pairs.push([fromLane - 1, toLane - 1]);
        }
    }
    return pairs;
}
export function formatConnectivity(pairs) {
    const byLane = new Map();
    for (const [from, to] of pairs) {
        const list = byLane.get(from);
        if (list)
            list.push(to);
        else
            byLane.set(from, [to]);
    }
    return [...byLane.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([from, targets]) => `${from + 1}:${[...new Set(targets)].sort((a, b) => a - b).map((to) => to + 1).join(',')}`)
        .join('|');
}
export function connectivityAt(doc, via) {
    const found = [];
    for (const relation of doc.relations.values()) {
        if (relation.tags?.type !== 'connectivity')
            continue;
        let from = null;
        let to = null;
        let viaNode = null;
        for (const [type, ref, role] of relation.members) {
            if (type === 'way' && role === 'from')
                from = ref;
            else if (type === 'way' && role === 'to')
                to = ref;
            else if (type === 'node' && role === 'via')
                viaNode = ref;
        }
        if (viaNode !== via || from === null || to === null)
            continue;
        found.push({ relationId: relation.id, from, to, via, pairs: parseConnectivity(relation.tags.connectivity) });
    }
    return found;
}
export function junctionMovements(doc, network, node) {
    const arms = network.arms.get(node) ?? [];
    const restrictions = restrictionsAt(doc, node);
    const movements = [];
    for (const from of arms) {
        if (from.lanesIn === 0)
            continue;
        for (const to of arms) {
            if (to.lanesOut === 0)
                continue;
            movements.push({
                from,
                to,
                kind: turnKind(from, to),
                allowed: isMovementAllowed(from, to, restrictions),
            });
        }
    }
    return movements;
}
/** Угол манёвра в тег restriction. */
export function restrictionValue(kind) {
    switch (kind) {
        case 'left':
            return 'no_left_turn';
        case 'right':
            return 'no_right_turn';
        case 'through':
            return 'no_straight_on';
        default:
            return 'no_u_turn';
    }
}
