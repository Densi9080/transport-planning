export const DRIVABLE = new Set([
    'motorway',
    'trunk',
    'primary',
    'secondary',
    'tertiary',
    'unclassified',
    'residential',
    'living_street',
    'service',
    'road',
    'busway',
    'motorway_link',
    'trunk_link',
    'primary_link',
    'secondary_link',
    'tertiary_link',
]);
const DEFAULT_LANES_PER_DIRECTION = {
    motorway: 3,
    trunk: 2,
    primary: 2,
};
const DEFAULT_LANE_WIDTH = {
    motorway: 3.75,
    trunk: 3.75,
    primary: 3.5,
    secondary: 3.5,
    tertiary: 3.25,
    unclassified: 3,
    residential: 3,
    living_street: 2.75,
    service: 2.75,
};
export function isDrivable(tags) {
    if (!tags?.highway || tags.area === 'yes')
        return false;
    return DRIVABLE.has(tags.highway);
}
function positiveInt(value) {
    if (value === undefined)
        return null;
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}
export function isOneway(tags) {
    const value = tags.oneway;
    if (value === 'no' || value === 'false' || value === '0')
        return false;
    if (value === 'yes' || value === 'true' || value === '1' || value === '-1' || value === 'reverse') {
        return true;
    }
    return (tags.junction === 'roundabout' ||
        tags.highway === 'motorway' ||
        tags.highway === 'motorway_link');
}
export function isReversedOneway(tags) {
    return tags.oneway === '-1' || tags.oneway === 'reverse';
}
export function parseTurnLanes(value) {
    return value === undefined ? null : value.split('|').map((lane) => lane.trim());
}
export function parseProfile(tags) {
    const oneway = isOneway(tags);
    const reversed = isReversedOneway(tags);
    const highway = tags.highway ?? 'road';
    const total = positiveInt(tags.lanes);
    const taggedForward = positiveInt(tags['lanes:forward']);
    const taggedBackward = positiveInt(tags['lanes:backward']);
    const fallback = DEFAULT_LANES_PER_DIRECTION[highway] ?? 1;
    let forward;
    let backward;
    let inferred = false;
    if (oneway) {
        const lanes = total || taggedForward || fallback;
        inferred = !total && !taggedForward;
        forward = reversed ? 0 : lanes;
        backward = reversed ? lanes : 0;
    }
    else if (taggedForward !== null || taggedBackward !== null) {
        forward = taggedForward ?? Math.max(1, (total ?? 0) - (taggedBackward ?? 0));
        backward = taggedBackward ?? Math.max(1, (total ?? 0) - forward);
    }
    else if (total) {
        forward = Math.ceil(total / 2);
        backward = Math.max(total - forward, 0);
    }
    else {
        forward = fallback;
        backward = fallback;
        inferred = true;
    }
    forward = Math.max(forward, 0);
    backward = Math.max(backward, 0);
    if (forward + backward === 0)
        forward = 1;
    const widthTag = Number.parseFloat(tags.width ?? '');
    const laneWidth = Number.isFinite(widthTag) && widthTag > 0
        ? clamp(widthTag / (forward + backward), 2.25, 5)
        : (DEFAULT_LANE_WIDTH[highway.replace('_link', '')] ?? 3);
    const allDirections = parseTurnLanes(tags['turn:lanes']);
    let turnsForward = parseTurnLanes(tags['turn:lanes:forward']);
    let turnsBackward = parseTurnLanes(tags['turn:lanes:backward']);
    if (oneway && allDirections) {
        if (reversed)
            turnsBackward = allDirections;
        else
            turnsForward = allDirections;
    }
    if (oneway && reversed && !turnsBackward)
        turnsBackward = turnsForward;
    const allChanges = parseTurnLanes(tags['change:lanes']);
    let changeForward = parseTurnLanes(tags['change:lanes:forward']);
    let changeBackward = parseTurnLanes(tags['change:lanes:backward']);
    if (allChanges) {
        if (oneway && reversed)
            changeBackward = allChanges;
        else if (oneway)
            changeForward = allChanges;
        else {
            changeForward ??= allChanges;
            changeBackward ??= allChanges;
        }
    }
    return { forward, backward, oneway, laneWidth, turnsForward, turnsBackward, changeForward, changeBackward, inferred };
}
function mayCross(rule, toLeft) {
    if (rule === 'no')
        return false;
    return rule !== (toLeft ? 'not_left' : 'not_right');
}
/** Можно ли перестроиться между соседними полосами. Полосы нумеруются слева по ходу движения. */
export function canChangeLane(rules, from, to) {
    if (!rules || Math.abs(from - to) !== 1)
        return true;
    return mayCross(rules[from], to < from);
}
export function dividerMode(rules, boundary) {
    const toRight = canChangeLane(rules, boundary, boundary + 1);
    const toLeft = canChangeLane(rules, boundary + 1, boundary);
    if (toRight && toLeft)
        return 'both';
    if (toRight)
        return 'to_right';
    return toLeft ? 'to_left' : 'none';
}
function ruleValue(left, right) {
    if (left && right)
        return 'yes';
    if (left)
        return 'not_right';
    return right ? 'not_left' : 'no';
}
/** Записывает тип линии между полосами boundary и boundary + 1 в тег change:lanes. */
export function withDivider(tags, direction, boundary, mode) {
    const profile = parseProfile(tags);
    const count = direction === 'forward' ? profile.forward : profile.backward;
    const rules = direction === 'forward' ? profile.changeForward : profile.changeBackward;
    const allowed = Array.from({ length: count }, (_, lane) => ({
        left: canChangeLane(rules, lane, lane - 1),
        right: canChangeLane(rules, lane, lane + 1),
    }));
    const upper = allowed[boundary];
    const lower = allowed[boundary + 1];
    if (!upper || !lower)
        return tags;
    upper.right = mode === 'both' || mode === 'to_right';
    lower.left = mode === 'both' || mode === 'to_left';
    const next = { ...tags };
    const values = allowed.map((lane) => ruleValue(lane.left, lane.right));
    const key = profile.oneway ? 'change:lanes' : `change:lanes:${direction}`;
    if (profile.oneway)
        delete next['change:lanes:forward'];
    if (values.every((value) => value === 'yes'))
        delete next[key];
    else
        next[key] = values.join('|');
    return next;
}
function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}
export function totalWidth(profile) {
    return (profile.forward + profile.backward) * profile.laneWidth;
}
/** Смещения в поперечном сечении: положительные — слева от оси дороги. Правостороннее движение. */
export function laneOffsets(profile) {
    const width = totalWidth(profile);
    const divider = width / 2 - profile.backward * profile.laneWidth;
    const forward = [];
    const backward = [];
    for (let i = 0; i < profile.forward; i++)
        forward.push(divider - (i + 0.5) * profile.laneWidth);
    for (let i = 0; i < profile.backward; i++)
        backward.push(divider + (i + 0.5) * profile.laneWidth);
    return { forward, backward, divider, left: width / 2, right: -width / 2 };
}
/** Записывает число полос. Лишние манёвры обрезаются, недостающие дополняются пустыми. */
export function withLanes(tags, forward, backward) {
    const next = { ...tags };
    const oneway = isOneway(tags);
    delete next['lanes:forward'];
    delete next['lanes:backward'];
    if (oneway) {
        const lanes = isReversedOneway(tags) ? backward : forward;
        next.lanes = String(Math.max(1, lanes));
        fitTurns(next, 'turn:lanes', Math.max(1, lanes));
        fitTurns(next, 'turn:lanes:forward', Math.max(1, lanes));
        fitChanges(next, 'change:lanes', Math.max(1, lanes));
    }
    else {
        next.lanes = String(forward + backward);
        next['lanes:forward'] = String(forward);
        next['lanes:backward'] = String(backward);
        fitTurns(next, 'turn:lanes:forward', forward);
        fitTurns(next, 'turn:lanes:backward', backward);
        fitChanges(next, 'change:lanes:forward', forward);
        fitChanges(next, 'change:lanes:backward', backward);
    }
    return next;
}
function fitChanges(tags, key, count) {
    const rules = parseTurnLanes(tags[key]);
    if (!rules)
        return;
    const fitted = rules.slice(0, count);
    while (fitted.length < count)
        fitted.push('yes');
    if (fitted.every((value) => value === 'yes') || count <= 0)
        delete tags[key];
    else
        tags[key] = fitted.join('|');
}
function fitTurns(tags, key, count) {
    const turns = parseTurnLanes(tags[key]);
    if (!turns)
        return;
    if (count <= 0) {
        delete tags[key];
        return;
    }
    const fitted = turns.slice(0, count);
    while (fitted.length < count)
        fitted.push('');
    tags[key] = fitted.join('|');
}
/** Записывает манёвры полос одного направления. */
export function withTurns(tags, direction, turns) {
    const next = { ...tags };
    const empty = turns.every((turn) => !turn || turn === 'none');
    const oneway = isOneway(tags);
    const key = oneway ? 'turn:lanes' : `turn:lanes:${direction}`;
    if (oneway)
        delete next['turn:lanes:forward'];
    if (empty)
        delete next[key];
    else
        next[key] = turns.join('|');
    return next;
}
/** Переключает один манёвр в значении полосы вида left;through. */
export function toggleTurn(value, turn) {
    const parts = value
        .split(';')
        .map((part) => part.trim())
        .filter((part) => part && part !== 'none');
    const index = parts.indexOf(turn);
    if (index >= 0)
        parts.splice(index, 1);
    else
        parts.push(turn);
    const order = ['reverse', 'sharp_left', 'left', 'slight_left', 'through', 'slight_right', 'right', 'sharp_right'];
    parts.sort((a, b) => order.indexOf(a) - order.indexOf(b));
    return parts.join(';');
}
export function turnAllows(value, kind) {
    const parts = value.split(';').map((part) => part.trim());
    switch (kind) {
        case 'left':
            return parts.some((p) => p === 'left' || p === 'slight_left' || p === 'sharp_left');
        case 'right':
            return parts.some((p) => p === 'right' || p === 'slight_right' || p === 'sharp_right');
        case 'through':
            return parts.includes('through');
        default:
            return parts.includes('reverse');
    }
}
