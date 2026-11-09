import { dist, Projector } from './geo';
import { isDrivable } from './lanes';
import { setNodeTags } from './ops';
import { wayLevel } from './topology';
const LAYER_HEIGHT_M = 5.5;
const AUTO_RAMP_M = 30;
const MAX_RAMP_SHARE = 0.45;
function parseEle(tags) {
    const value = Number.parseFloat(tags?.ele ?? '');
    return Number.isFinite(value) ? value : null;
}
function smoothstep(t) {
    const x = Math.min(1, Math.max(0, t));
    return x * x * (3 - 2 * x);
}
function wayAlong(doc, way, projector) {
    const along = [0];
    for (let i = 1; i < way.nds.length; i++) {
        const a = doc.nodes.get(way.nds[i - 1]);
        const b = doc.nodes.get(way.nds[i]);
        let step = 0;
        if (a && b) {
            const p = projector ?? new Projector(doc.bounds);
            step = dist(p.toXY(a), p.toXY(b));
        }
        along.push(along[i - 1] + step);
    }
    return along;
}
/** Дорога уходит на землю в этом конце: соседняя проезжая дорога лежит ниже. */
function touchesGround(doc, nodeId, way) {
    return doc.waysOfNode(nodeId).some((id) => {
        if (id === way.id)
            return false;
        const other = doc.ways.get(id);
        return !!other && isDrivable(other.tags) && wayLevel(other.tags ?? {}) < wayLevel(way.tags ?? {});
    });
}
/**
 * Высоты узлов дороги. Теги ele важнее всего: их задаёт инструмент плавного перехода.
 * Без них мост поднимается на высоту своего уровня, а у съезда на землю плавно опускается.
 */
export function wayHeights(doc, way) {
    const result = new Map();
    const values = way.nds.map((id) => parseEle(doc.nodes.get(id)?.tags));
    const along = wayAlong(doc, way, null);
    const total = along.at(-1) ?? 0;
    if (values.some((value) => value !== null)) {
        way.nds.forEach((id, index) => {
            const own = values[index];
            if (own !== null && own !== undefined) {
                result.set(id, own);
                return;
            }
            let previous = index - 1;
            while (previous >= 0 && values[previous] === null)
                previous--;
            let next = index + 1;
            while (next < values.length && values[next] === null)
                next++;
            const low = previous >= 0 ? values[previous] : 0;
            const high = next < values.length ? values[next] : 0;
            const lowAt = previous >= 0 ? along[previous] : 0;
            const highAt = next < values.length ? along[next] : total;
            const t = highAt > lowAt ? (along[index] - lowAt) / (highAt - lowAt) : 0;
            result.set(id, low + (high - low) * t);
        });
        return result;
    }
    const level = wayLevel(way.tags ?? {});
    if (level <= 0) {
        for (const id of way.nds)
            result.set(id, 0);
        return result;
    }
    const plateau = level * LAYER_HEIGHT_M;
    const ramp = Math.min(AUTO_RAMP_M, total * MAX_RAMP_SHARE);
    const startGround = touchesGround(doc, way.nds[0], way);
    const endGround = touchesGround(doc, way.nds.at(-1), way);
    way.nds.forEach((id, index) => {
        const position = along[index];
        const fromStart = startGround && ramp > 0 ? smoothstep(position / ramp) : 1;
        const fromEnd = endGround && ramp > 0 ? smoothstep((total - position) / ramp) : 1;
        result.set(id, plateau * Math.min(fromStart, fromEnd));
    });
    return result;
}
export function linkHeights(doc, link) {
    const way = doc.ways.get(link.wayId);
    const map = way ? wayHeights(doc, way) : new Map();
    const along = [0];
    for (let i = 1; i < link.points.length; i++) {
        along.push(along[i - 1] + dist(link.points[i - 1], link.points[i]));
    }
    return { along, heights: link.nodes.map((id) => map.get(id) ?? 0) };
}
export function heightAlong(profile, position) {
    const { along, heights } = profile;
    if (position <= 0)
        return heights[0] ?? 0;
    for (let i = 1; i < along.length; i++) {
        if (position <= along[i]) {
            const span = along[i] - along[i - 1];
            const t = span > 1e-6 ? (position - along[i - 1]) / span : 0;
            return heights[i - 1] + (heights[i] - heights[i - 1]) * t;
        }
    }
    return heights.at(-1) ?? 0;
}
/** Плавный переход по Z: записывает ele в узлы дороги по кривой без резких изломов. */
export function applyElevationRamp(doc, projector, wayId, from, to) {
    const way = doc.way(wayId);
    const along = wayAlong(doc, way, projector);
    const total = along.at(-1) ?? 0;
    way.nds.forEach((id, index) => {
        const t = total > 0 ? along[index] / total : 0;
        const height = from + (to - from) * smoothstep(t);
        setNodeTags(doc, id, { ...doc.node(id).tags, ele: height.toFixed(2) });
    });
}
export function clearElevation(doc, wayId) {
    for (const id of new Set(doc.way(wayId).nds)) {
        const tags = { ...doc.node(id).tags };
        if (tags.ele === undefined)
            continue;
        delete tags.ele;
        setNodeTags(doc, id, tags);
    }
}
/** Наибольший уклон дороги в процентах. */
export function maxSlopePercent(doc, way, projector) {
    const heights = wayHeights(doc, way);
    let worst = 0;
    for (let i = 1; i < way.nds.length; i++) {
        const a = doc.nodes.get(way.nds[i - 1]);
        const b = doc.nodes.get(way.nds[i]);
        if (!a || !b)
            continue;
        const run = dist(projector.toXY(a), projector.toXY(b));
        if (run < 1)
            continue;
        const rise = Math.abs((heights.get(b.id) ?? 0) - (heights.get(a.id) ?? 0));
        worst = Math.max(worst, (rise / run) * 100);
    }
    return worst;
}
