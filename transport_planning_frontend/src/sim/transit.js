import { nearestOnSegment } from '@/core/geo';
import { lineSegments, ROAD_MODES } from '@/core/transit';
const STOP_SEARCH_M = 40;
const MIN_SERVICE_M = 120;
function edgeNodes(edge) {
    return edge.forward ? edge.link.nodes : [...edge.link.nodes].reverse();
}
function edgeIndexByStep(net) {
    const map = new Map();
    for (const edge of net.edges) {
        const nodes = edgeNodes(edge);
        map.set(`${nodes[0]}:${nodes[1]}`, edge);
    }
    return map;
}
/** Цепочка узлов маршрута превращается в цепочки участков. Обрыв там, где проехать нельзя. */
function walkSegment(segment, index) {
    const pieces = [];
    let current = [];
    let position = 0;
    while (position < segment.length - 1) {
        const edge = index.get(`${segment[position]}:${segment[position + 1]}`);
        if (!edge) {
            if (current.length > 0)
                pieces.push(current);
            current = [];
            position++;
            continue;
        }
        const previous = current.at(-1);
        if (previous && !previous.moves.has(edge)) {
            pieces.push(current);
            current = [];
        }
        current.push(edge);
        const nodes = edgeNodes(edge);
        position += nodes.length - 1;
    }
    if (current.length > 0)
        pieces.push(current);
    return pieces;
}
function nearestOnEdge(edge, point) {
    const lane = edge.lanes.at(-1);
    let best = Number.POSITIVE_INFINITY;
    let along = 0;
    for (let i = 1; i < lane.points.length; i++) {
        const hit = nearestOnSegment(point, lane.points[i - 1], lane.points[i]);
        if (hit.distance < best) {
            best = hit.distance;
            along = lane.cum[i - 1] + hit.t * (lane.cum[i] - lane.cum[i - 1]);
        }
    }
    return { distance: best, share: lane.length > 0 ? along / lane.length : 0 };
}
function placeStops(doc, net, line, edges) {
    const stops = [];
    const seen = new Set();
    for (const stop of line.stops) {
        const node = doc.nodes.get(stop.node);
        if (!node)
            continue;
        const point = net.projector.toXY(node);
        let bestIndex = -1;
        let bestDistance = STOP_SEARCH_M;
        let bestShare = 0;
        edges.forEach((edge, index) => {
            const hit = nearestOnEdge(edge, point);
            if (hit.distance < bestDistance) {
                bestDistance = hit.distance;
                bestIndex = index;
                bestShare = hit.share;
            }
        });
        if (bestIndex < 0)
            continue;
        // Платформа и точка остановки одного места часто записаны обе: автобус встаёт один раз
        const key = `${bestIndex}:${stop.name}`;
        if (seen.has(key))
            continue;
        seen.add(key);
        stops.push({ edgeIndex: bestIndex, share: Math.min(0.95, Math.max(0.05, bestShare)), name: stop.name, node: stop.node });
    }
    return stops.sort((a, b) => a.edgeIndex - b.edgeIndex || a.share - b.share);
}
export function buildServices(doc, net, lines) {
    const index = edgeIndexByStep(net);
    const services = [];
    for (const line of lines) {
        if (!ROAD_MODES.has(line.mode))
            continue;
        const pieces = lineSegments(doc, line.wayIds).flatMap((segment) => walkSegment(segment, index));
        if (pieces.length === 0)
            continue;
        const longest = pieces.reduce((best, piece) => (length(piece) > length(best) ? piece : best));
        if (length(longest) < MIN_SERVICE_M)
            continue;
        services.push({
            line,
            edges: longest,
            stops: placeStops(doc, net, line, longest),
            brokenLinks: pieces.length - 1,
            frequency: 60 / line.interval,
            lengthM: length(longest),
        });
    }
    return services;
}
function length(edges) {
    return edges.reduce((sum, edge) => sum + edge.length, 0);
}
