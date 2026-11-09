export const FILTER_OPS = [
    { id: 'exists', label: 'задан', needsValue: false },
    { id: 'missing', label: 'не задан', needsValue: false },
    { id: 'eq', label: '=', needsValue: true },
    { id: 'ne', label: '≠', needsValue: true },
    { id: 'contains', label: 'содержит', needsValue: true },
    { id: 'gt', label: '>', needsValue: true },
    { id: 'lt', label: '<', needsValue: true },
];
export function matchesRule(tags, rule) {
    const value = tags?.[rule.key];
    switch (rule.op) {
        case 'exists':
            return value !== undefined;
        case 'missing':
            return value === undefined;
        case 'eq':
            return value === rule.value;
        case 'ne':
            return value !== undefined && value !== rule.value;
        case 'contains':
            return value !== undefined && value.toLowerCase().includes(rule.value.toLowerCase());
        case 'gt':
        case 'lt': {
            const number = Number.parseFloat(value ?? '');
            const limit = Number.parseFloat(rule.value);
            if (!Number.isFinite(number) || !Number.isFinite(limit))
                return false;
            return rule.op === 'gt' ? number > limit : number < limit;
        }
    }
}
/** Правило работает, только если заполнено целиком: недописанное не должно ничего прятать. */
function isComplete(rule) {
    if (!rule.enabled || !rule.key.trim())
        return false;
    const op = FILTER_OPS.find((item) => item.id === rule.op);
    return !op?.needsValue || rule.value.trim() !== '';
}
export const NOTHING_HIDDEN = { ways: new Set(), nodes: new Set() };
export function computeHidden(doc, rules) {
    const active = rules.filter(isComplete);
    if (active.length === 0)
        return NOTHING_HIDDEN;
    const matches = (tags) => active.some((rule) => matchesRule(tags, rule));
    const ways = new Set();
    const nodes = new Set();
    for (const way of doc.ways.values())
        if (matches(way.tags))
            ways.add(way.id);
    // Узлы без атрибутов — это просто точки формы дорог, правилам про атрибуты они не подчиняются
    for (const node of doc.nodes.values())
        if (node.tags && matches(node.tags))
            nodes.add(node.id);
    return { ways, nodes };
}
/** Площадку перекрёстка прячем, только когда скрыты все дороги, которые в ней сходятся. */
export function hiddenJunctions(network, hidden) {
    const result = new Set(hidden.nodes);
    if (hidden.ways.size === 0)
        return result;
    for (const [node, arms] of network.arms) {
        if (arms.every((arm) => hidden.ways.has(arm.link.wayId)))
            result.add(node);
    }
    return result;
}
const MAX_VALUES = 40;
/** Служебные и адресные ключи только засоряют список подсказок. */
const NOISY_KEY = /^(source|note|fixme|check_date|addr:|wikidata|wikipedia|name:|ref:|contact:|website|phone|opening_hours)/;
/** Что есть в файле: подсказки для правил и быстрые кнопки с числом объектов. */
export function collectKeyStats(doc) {
    const stats = new Map();
    const add = (tags, field) => {
        for (const [key, value] of Object.entries(tags ?? {})) {
            if (NOISY_KEY.test(key))
                continue;
            let stat = stats.get(key);
            if (!stat) {
                stat = { ways: 0, nodes: 0, values: new Map() };
                stats.set(key, stat);
            }
            stat[field]++;
            stat.values.set(value, (stat.values.get(value) ?? 0) + 1);
        }
    };
    for (const way of doc.ways.values())
        add(way.tags, 'ways');
    for (const node of doc.nodes.values())
        add(node.tags, 'nodes');
    return [...stats.entries()]
        .map(([key, stat]) => ({
        key,
        ways: stat.ways,
        nodes: stat.nodes,
        values: [...stat.values.entries()]
            .map(([value, count]) => ({ value, count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, MAX_VALUES),
    }))
        .sort((a, b) => b.ways + b.nodes - a.ways - a.nodes);
}
/** Типовые слои карты: то, что чаще всего хочется убрать одним нажатием. */
export const QUICK_FILTERS = [
    { id: 'building', label: 'Здания', key: 'building', op: 'exists', value: '' },
    { id: 'footway', label: 'Тротуары', key: 'highway', op: 'eq', value: 'footway' },
    { id: 'steps', label: 'Лестницы', key: 'highway', op: 'eq', value: 'steps' },
    { id: 'path', label: 'Тропы', key: 'highway', op: 'eq', value: 'path' },
    { id: 'service', label: 'Проезды', key: 'highway', op: 'eq', value: 'service' },
    { id: 'residential', label: 'Жилые улицы', key: 'highway', op: 'eq', value: 'residential' },
    { id: 'landuse', label: 'Территории', key: 'landuse', op: 'exists', value: '' },
    { id: 'railway', label: 'Железная дорога', key: 'railway', op: 'exists', value: '' },
    { id: 'barrier', label: 'Ограждения', key: 'barrier', op: 'exists', value: '' },
    { id: 'amenity', label: 'Объекты инфраструктуры', key: 'amenity', op: 'exists', value: '' },
];
export function countMatches(doc, filter) {
    const rule = { id: 0, enabled: true, ...filter };
    let count = 0;
    for (const way of doc.ways.values())
        if (matchesRule(way.tags, rule))
            count++;
    for (const node of doc.nodes.values())
        if (node.tags && matchesRule(node.tags, rule))
            count++;
    return count;
}
