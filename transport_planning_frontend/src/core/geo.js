const METERS_PER_DEGREE = 111_319.49;
/** Локальная проекция в метрах: на участке города искажения пренебрежимо малы. */
export class Projector {
    lat0;
    lon0;
    kx;
    constructor(bounds) {
        this.lat0 = (bounds.minlat + bounds.maxlat) / 2;
        this.lon0 = (bounds.minlon + bounds.maxlon) / 2;
        this.kx = METERS_PER_DEGREE * Math.cos((this.lat0 * Math.PI) / 180);
    }
    toXY(p) {
        return { x: (p.lon - this.lon0) * this.kx, y: (p.lat - this.lat0) * METERS_PER_DEGREE };
    }
    toLatLon(p) {
        return { lat: this.lat0 + p.y / METERS_PER_DEGREE, lon: this.lon0 + p.x / this.kx };
    }
    toLngLat(p) {
        return [this.lon0 + p.x / this.kx, this.lat0 + p.y / METERS_PER_DEGREE];
    }
}
export const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
export const add = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
export const scale = (a, k) => ({ x: a.x * k, y: a.y * k });
export const dot = (a, b) => a.x * b.x + a.y * b.y;
export const cross = (a, b) => a.x * b.y - a.y * b.x;
export const length = (a) => Math.hypot(a.x, a.y);
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const leftNormal = (a) => ({ x: -a.y, y: a.x });
export function unit(a) {
    const len = length(a);
    return len > 1e-9 ? { x: a.x / len, y: a.y / len } : { x: 1, y: 0 };
}
export function polylineLength(points) {
    let total = 0;
    for (let i = 1; i < points.length; i++)
        total += dist(points[i - 1], points[i]);
    return total;
}
/** Точка и направление на расстоянии along от начала полилинии. */
export function pointAlong(points, along) {
    let remaining = Math.max(0, along);
    for (let i = 1; i < points.length; i++) {
        const a = points[i - 1];
        const b = points[i];
        const segment = dist(a, b);
        if (remaining <= segment || i === points.length - 1) {
            const t = segment > 1e-9 ? Math.min(1, remaining / segment) : 0;
            return { point: add(a, scale(sub(b, a), t)), dir: unit(sub(b, a)) };
        }
        remaining -= segment;
    }
    return { point: points[0], dir: { x: 1, y: 0 } };
}
/** Обрезает полилинию с обоих концов на заданное расстояние. */
export function trimPolyline(points, fromStart, fromEnd) {
    const total = polylineLength(points);
    const start = Math.max(0, fromStart);
    const end = total - Math.max(0, fromEnd);
    if (end - start < 1e-6) {
        const middle = pointAlong(points, (start + end) / 2).point;
        return [middle, middle];
    }
    const result = [pointAlong(points, start).point];
    let walked = 0;
    for (let i = 1; i < points.length; i++) {
        walked += dist(points[i - 1], points[i]);
        if (walked > start + 1e-6 && walked < end - 1e-6)
            result.push(points[i]);
    }
    result.push(pointAlong(points, end).point);
    return result;
}
/**
 * Параллельная линия: offset > 0 — слева по ходу полилинии.
 * Касательные на концах можно задать явно, чтобы стыковать соседние дороги без зазора.
 */
export function offsetPolyline(points, offset, startTangent, endTangent) {
    const clean = dedupe(points);
    if (clean.length < 2)
        return clean.map((p) => ({ ...p }));
    const result = [];
    for (let i = 0; i < clean.length; i++) {
        const point = clean[i];
        const dirIn = i > 0 ? unit(sub(point, clean[i - 1])) : null;
        const dirOut = i < clean.length - 1 ? unit(sub(clean[i + 1], point)) : null;
        let tangent;
        let reference;
        if (i === 0) {
            tangent = startTangent ?? dirOut;
            reference = dirOut;
        }
        else if (i === clean.length - 1) {
            tangent = endTangent ?? dirIn;
            reference = dirIn;
        }
        else {
            tangent = unit(add(dirIn, dirOut));
            reference = dirOut;
        }
        const cos = Math.max(0.35, dot(tangent, reference));
        result.push(add(point, scale(leftNormal(tangent), offset / cos)));
    }
    return result;
}
function dedupe(points) {
    const result = [];
    for (const point of points) {
        const last = result.at(-1);
        if (!last || dist(last, point) > 1e-3)
            result.push(point);
    }
    return result;
}
export function nearestOnSegment(p, a, b) {
    const ab = sub(b, a);
    const lenSq = dot(ab, ab);
    const t = lenSq > 1e-12 ? Math.max(0, Math.min(1, dot(sub(p, a), ab) / lenSq)) : 0;
    const point = add(a, scale(ab, t));
    return { point, distance: dist(p, point), t };
}
/** Пересечение прямых p + t·d. Возвращает null для почти параллельных. */
export function lineIntersection(p1, d1, p2, d2) {
    const denominator = cross(d1, d2);
    if (Math.abs(denominator) < 1e-3)
        return null;
    const t = cross(sub(p2, p1), d2) / denominator;
    return add(p1, scale(d1, t));
}
/** Пересечение отрезков без учёта касания в концах: параметры строго внутри. */
export function segmentsCross(a1, a2, b1, b2) {
    const r = sub(a2, a1);
    const s = sub(b2, b1);
    const denominator = cross(r, s);
    if (Math.abs(denominator) < 1e-9)
        return null;
    const diff = sub(b1, a1);
    const t = cross(diff, s) / denominator;
    const u = cross(diff, r) / denominator;
    const eps = 1e-6;
    if (t <= eps || t >= 1 - eps || u <= eps || u >= 1 - eps)
        return null;
    return add(a1, scale(r, t));
}
export function quadraticCurve(a, control, b, steps) {
    const points = [];
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const mt = 1 - t;
        points.push({
            x: mt * mt * a.x + 2 * mt * t * control.x + t * t * b.x,
            y: mt * mt * a.y + 2 * mt * t * control.y + t * t * b.y,
        });
    }
    return points;
}
/** Сглаживание Катмулла — Рома: кривая проходит через все заданные точки. */
export function smoothCurve(points, spacing = 8) {
    if (points.length < 3)
        return points;
    const result = [points[0]];
    for (let i = 0; i < points.length - 1; i++) {
        const p0 = points[Math.max(0, i - 1)];
        const p1 = points[i];
        const p2 = points[i + 1];
        const p3 = points[Math.min(points.length - 1, i + 2)];
        const steps = Math.max(1, Math.round(dist(p1, p2) / spacing));
        for (let step = 1; step <= steps; step++) {
            const t = step / steps;
            const t2 = t * t;
            const t3 = t2 * t;
            result.push({
                x: 0.5 *
                    (2 * p1.x +
                        (p2.x - p0.x) * t +
                        (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
                        (3 * p1.x - p0.x - 3 * p2.x + p3.x) * t3),
                y: 0.5 *
                    (2 * p1.y +
                        (p2.y - p0.y) * t +
                        (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
                        (3 * p1.y - p0.y - 3 * p2.y + p3.y) * t3),
            });
        }
    }
    return result;
}
/** Азимут от севера по часовой стрелке, в градусах. */
export function bearing(dir) {
    return ((Math.atan2(dir.x, dir.y) * 180) / Math.PI + 360) % 360;
}
