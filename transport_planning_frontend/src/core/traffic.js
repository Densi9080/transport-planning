import { dist, nearestOnSegment, offsetPolyline, pointAlong, polylineLength, smoothCurve } from './geo';
import { DRIVABLE, isOneway } from './lanes';
import { addNode, addWay, insertNodeOnWay, joinWays, setNodeTags, setWayTags, splitWay } from './ops';
export const BUMP_KINDS = [
    { value: 'hump', label: 'Искусственная неровность' },
    { value: 'bump', label: 'Короткая неровность' },
    { value: 'table', label: 'Приподнятый переход' },
    { value: 'cushion', label: 'Подушка' },
    { value: 'rumble_strip', label: 'Шумовая полоса' },
];
export const SECTION_SPEEDS = [5, 10, 20, 30, 40, 50, 60];
const NODE_SNAP_M = 1.5;
const MIN_SECTION_M = 3;
const BUMP_SECTION_M = 20;
const MAX_RESTORED_SECTION_M = 60;
const MAX_MARKED_SECTION_M = 300;
const SMOOTH_SPACING_M = 10;
const MAX_SPEED_WITHOUT_NEIGHBOUR = 40;
export function wayPoints(doc, projector, way) {
    return way.nds.map((id) => projector.toXY(doc.node(id)));
}
function isClosed(way) {
    return way.nds.length > 2 && way.nds[0] === way.nds.at(-1);
}
function requireOpen(way) {
    if (isClosed(way))
        throw new Error('Кольцевую дорогу сначала разрежьте');
}
function numericSpeed(value) {
    return value !== undefined && /^\d+$/.test(value) ? Number(value) : null;
}
/** Расстояние от начала дороги до ближайшей к точке позиции на ней. */
function alongOf(points, target) {
    let walked = 0;
    let best = Number.POSITIVE_INFINITY;
    let result = 0;
    for (let i = 1; i < points.length; i++) {
        const a = points[i - 1];
        const b = points[i];
        const hit = nearestOnSegment(target, a, b);
        const segment = dist(a, b);
        if (hit.distance < best) {
            best = hit.distance;
            result = walked + hit.t * segment;
        }
        walked += segment;
    }
    return result;
}
function nodeAlong(doc, projector, wayId, along) {
    const way = doc.way(wayId);
    const points = wayPoints(doc, projector, way);
    let walked = 0;
    for (let i = 0; i < points.length; i++) {
        if (i > 0)
            walked += dist(points[i - 1], points[i]);
        if (Math.abs(walked - along) <= NODE_SNAP_M)
            return way.nds[i];
    }
    return insertNodeOnWay(doc, projector, wayId, projector.toLatLon(pointAlong(points, along).point));
}
function removeKeys(doc, wayId, keys) {
    const tags = doc.way(wayId).tags;
    if (!tags || !keys.some((key) => key in tags))
        return;
    const next = { ...tags };
    for (const key of keys)
        delete next[key];
    setWayTags(doc, wayId, next);
}
/** Манёвры полос относятся к перекрёстку на конце дороги, поэтому остаются только у крайних частей. */
function turnKeys(tags) {
    const reversed = tags.oneway === '-1' || tags.oneway === 'reverse';
    return {
        atEnd: reversed ? ['turn:lanes:forward'] : ['turn:lanes', 'turn:lanes:forward'],
        atStart: reversed ? ['turn:lanes', 'turn:lanes:backward'] : ['turn:lanes:backward'],
    };
}
/** Вырезает из дороги участок между двумя её узлами и возвращает его id. */
function isolateSection(doc, wayId, startNode, endNode) {
    const { atEnd, atStart } = turnKeys(doc.way(wayId).tags ?? {});
    let section = wayId;
    let before = null;
    let after = null;
    const head = splitWay(doc, section, startNode);
    if (head !== null) {
        if (doc.way(section).nds.includes(endNode)) {
            before = head;
        }
        else {
            before = section;
            section = head;
        }
    }
    const tail = splitWay(doc, section, endNode);
    if (tail !== null) {
        if (doc.way(section).nds.includes(startNode)) {
            after = tail;
        }
        else {
            after = section;
            section = tail;
        }
    }
    if (before !== null) {
        removeKeys(doc, before, atEnd);
        removeKeys(doc, section, atStart);
    }
    if (after !== null) {
        removeKeys(doc, section, atEnd);
        removeKeys(doc, after, atStart);
    }
    return section;
}
function setSectionSpeed(doc, wayId, speed) {
    const next = { ...doc.way(wayId).tags, maxspeed: String(speed) };
    // Значения по направлениям важнее общего и перебили бы новую скорость
    delete next['maxspeed:forward'];
    delete next['maxspeed:backward'];
    setWayTags(doc, wayId, next);
}
/** Участок сниженной скорости между двумя точками дороги. Возвращает id участка. */
export function applySpeedSection(doc, projector, wayId, from, to, speed) {
    const way = doc.way(wayId);
    requireOpen(way);
    const points = wayPoints(doc, projector, way);
    const a = alongOf(points, projector.toXY(from));
    const b = alongOf(points, projector.toXY(to));
    const start = Math.min(a, b);
    const end = Math.max(a, b);
    if (end - start < MIN_SECTION_M)
        throw new Error(`Участок должен быть длиннее ${MIN_SECTION_M} м`);
    const startNode = nodeAlong(doc, projector, wayId, start);
    const endNode = nodeAlong(doc, projector, wayId, end);
    const section = isolateSection(doc, wayId, startNode, endNode);
    setSectionSpeed(doc, section, speed);
    return section;
}
/** Ближайшие к точке перекрёстки на дороге: участок не должен заходить за них. */
function junctionLimits(doc, way, points, along) {
    const total = polylineLength(points);
    let low = 0;
    let high = total;
    let walked = 0;
    for (let i = 1; i < points.length - 1; i++) {
        walked += dist(points[i - 1], points[i]);
        if (doc.waysOfNode(way.nds[i]).length < 2)
            continue;
        if (walked <= along)
            low = Math.max(low, walked);
        else
            high = Math.min(high, walked);
    }
    return [low, high];
}
/** Ставит лежачего полицейского и вокруг него участок низкой скорости. */
export function addSpeedBump(doc, projector, wayId, position, options) {
    const way = doc.way(wayId);
    requireOpen(way);
    const points = wayPoints(doc, projector, way);
    const center = alongOf(points, projector.toXY(position));
    const [low, high] = junctionLimits(doc, way, points, center);
    const nodeId = nodeAlong(doc, projector, wayId, center);
    const shared = doc.waysOfNode(nodeId).length > 1;
    if (shared)
        throw new Error('Лежачего полицейского ставят на дороге, а не на перекрёстке');
    setNodeTags(doc, nodeId, { ...doc.node(nodeId).tags, traffic_calming: options.kind });
    const current = numericSpeed(way.tags?.maxspeed);
    if (current !== null && current <= options.speed)
        return { nodeId, sectionId: wayId };
    const start = Math.max(low, center - BUMP_SECTION_M / 2);
    const end = Math.min(high, center + BUMP_SECTION_M / 2);
    if (end - start < MIN_SECTION_M) {
        throw new Error('Рядом перекрёсток: лежачему полицейскому не хватает места');
    }
    const startNode = nodeAlong(doc, projector, wayId, start);
    const endNode = nodeAlong(doc, projector, wayId, end);
    const sectionId = isolateSection(doc, wayId, startNode, endNode);
    setSectionSpeed(doc, sectionId, options.speed);
    return { nodeId, sectionId };
}
function isDrivable(way) {
    return !!way && DRIVABLE.has(way.tags?.highway ?? '');
}
/** Часть той же дороги за концом участка: только она могла появиться при вырезании. */
function continuation(doc, section, atStart) {
    const end = atStart ? section.nds[0] : section.nds.at(-1);
    const others = doc.waysOfNode(end).filter((id) => id !== section.id);
    if (others.length !== 1)
        return null;
    const other = doc.way(others[0]);
    if (isClosed(other))
        return null;
    if ((atStart ? other.nds.at(-1) : other.nds[0]) !== end)
        return null;
    const a = section.tags ?? {};
    const b = other.tags ?? {};
    if (a.highway !== b.highway || a.name !== b.name || a.oneway !== b.oneway)
        return null;
    const own = numericSpeed(a.maxspeed);
    const theirs = numericSpeed(b.maxspeed);
    if (own === null || (theirs !== null && theirs <= own))
        return null;
    return other;
}
/** Снимает лежачего полицейского и возвращает дороге прежний вид. */
export function removeSpeedBump(doc, projector, nodeId) {
    const { traffic_calming: _removed, ...rest } = doc.node(nodeId).tags ?? {};
    setNodeTags(doc, nodeId, rest);
    const sectionId = doc.waysOfNode(nodeId).find((id) => isDrivable(doc.ways.get(id)));
    if (sectionId === undefined)
        return;
    const section = doc.way(sectionId);
    if (isClosed(section))
        return;
    if (polylineLength(wayPoints(doc, projector, section)) > MAX_RESTORED_SECTION_M)
        return;
    const before = continuation(doc, section, true);
    const after = continuation(doc, section, false);
    if (!before && !after)
        return;
    const first = before ?? section;
    const last = after ?? section;
    const merged = { ...first.tags };
    const restored = before?.tags?.maxspeed ?? after?.tags?.maxspeed;
    if (restored === undefined)
        delete merged.maxspeed;
    else
        merged.maxspeed = restored;
    const lastTags = last.tags ?? {};
    for (const key of turnKeys(merged).atEnd) {
        if (lastTags[key] !== undefined)
            merged[key] = lastTags[key];
    }
    setWayTags(doc, first.id, merged);
    if (before)
        joinWays(doc, before.id, section.id);
    if (after)
        joinWays(doc, first.id, after.id);
}
/** Ставит или снимает знак приоритета на подходе к перекрёстку. */
export function toggleSign(doc, projector, target, kind) {
    const wayId = target.wayId ?? (target.nodeId !== undefined ? doc.waysOfNode(target.nodeId)[0] : undefined);
    if (wayId === undefined)
        throw new Error('Знак ставится на дорогу');
    const way = doc.way(wayId);
    const points = wayPoints(doc, projector, way);
    const along = alongOf(points, projector.toXY(target.position));
    const nodeId = target.nodeId ?? nodeAlong(doc, projector, wayId, along);
    if (doc.waysOfNode(nodeId).length > 1)
        throw new Error('Знак ставят на подходе к перекрёстку, а не на нём');
    const tags = { ...doc.node(nodeId).tags };
    if (tags.highway === kind) {
        delete tags.highway;
        delete tags.direction;
        setNodeTags(doc, nodeId, tags);
        return { nodeId, enabled: false };
    }
    if (tags.highway && tags.highway !== 'stop' && tags.highway !== 'give_way') {
        throw new Error('Этот узел уже занят светофором или переходом');
    }
    tags.highway = kind;
    if (isOneway(way.tags ?? {}))
        delete tags.direction;
    else
        tags.direction = along >= polylineLength(points) / 2 ? 'forward' : 'backward';
    setNodeTags(doc, nodeId, tags);
    return { nodeId, enabled: true };
}
/** Сглаживает дорогу: все её узлы остаются на месте, между ними появляются новые. */
export function smoothWay(doc, projector, wayId, spacing = SMOOTH_SPACING_M) {
    const way = doc.way(wayId);
    const points = wayPoints(doc, projector, way);
    if (points.length < 3)
        return 0;
    const curve = smoothCurve(points, spacing);
    const nds = [way.nds[0]];
    let index = 0;
    let added = 0;
    for (let i = 0; i < points.length - 1; i++) {
        const steps = Math.max(1, Math.round(dist(points[i], points[i + 1]) / spacing));
        for (let step = 1; step < steps; step++) {
            nds.push(addNode(doc, projector.toLatLon(curve[index + step])));
            added++;
        }
        nds.push(way.nds[i + 1]);
        index += steps;
    }
    if (added > 0)
        doc.putWay({ ...way, nds });
    return added;
}
/** Копия дороги на заданном расстоянии: положительное смещение — слева по ходу узлов. */
export function createParallelWay(doc, projector, wayId, offset) {
    const way = doc.way(wayId);
    const shifted = offsetPolyline(wayPoints(doc, projector, way), offset);
    if (shifted.length < 2)
        throw new Error('У дороги слишком мало точек');
    const nds = shifted.map((point) => addNode(doc, projector.toLatLon(point)));
    if (isClosed(way))
        nds[nds.length - 1] = nds[0];
    return addWay(doc, nds, { ...way.tags });
}
/** Короткие участки, где скорость ниже, чем на продолжении дороги: их показываем знаком на карте. */
export function reducedSections(doc, projector) {
    const result = [];
    for (const way of doc.ways.values()) {
        if (!isDrivable(way) || isClosed(way))
            continue;
        const speed = numericSpeed(way.tags?.maxspeed);
        if (speed === null)
            continue;
        // У лежачего полицейского свой значок: скорость на том же месте закрыла бы его
        if (way.nds.some((id) => doc.nodes.get(id)?.tags?.traffic_calming))
            continue;
        const slower = [way.nds[0], way.nds.at(-1)].some((end) => doc.waysOfNode(end).some((id) => {
            const other = doc.ways.get(id);
            if (id === way.id || other?.tags?.highway !== way.tags?.highway)
                return false;
            const theirs = numericSpeed(other?.tags?.maxspeed);
            // Без явной скорости в городе действует общее ограничение, поэтому низкий участок всё равно заметен
            return theirs !== null ? theirs > speed : speed <= MAX_SPEED_WITHOUT_NEIGHBOUR;
        }));
        if (!slower)
            continue;
        const points = wayPoints(doc, projector, way);
        const total = polylineLength(points);
        if (total <= MAX_MARKED_SECTION_M)
            result.push({ point: pointAlong(points, total / 2).point, speed });
    }
    return result;
}
/** Действует ли знак приоритета на движение по дороге в указанную сторону. */
export function signApplies(tags, forward) {
    if (tags?.highway !== 'stop' && tags?.highway !== 'give_way')
        return false;
    if (tags.direction === 'forward')
        return forward;
    if (tags.direction === 'backward')
        return !forward;
    return true;
}
