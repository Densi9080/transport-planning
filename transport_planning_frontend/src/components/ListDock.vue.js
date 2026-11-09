import { ArrowDown, ArrowUp, Download, Search, X } from 'lucide-vue-next';
import { computed, ref, watch } from 'vue';
import { isDrivable, isOneway, parseProfile, withLanes } from '@/core/lanes';
import { parseSignalPlan } from '@/core/signals';
import { TRANSIT_MODE_LABELS } from '@/core/transit';
import { LOS_LABELS, parseSpeed } from '@/sim/macro';
import { useEditor } from '@/stores/editor';
import { useSimulation } from '@/stores/simulation';
const editor = useEditor();
const sim = useSimulation();
const MAX_ROWS = 400;
const tabs = [
    { id: 'links', label: 'Отрезки' },
    { id: 'nodes', label: 'Узлы' },
    { id: 'signals', label: 'Светофоры' },
    { id: 'lines', label: 'Линии ОТ' },
    { id: 'stops', label: 'Остановки' },
    { id: 'zones', label: 'Районы' },
    { id: 'matrix', label: 'Корреспонденции' },
];
const columnsByTab = {
    links: [
        { key: '_id', label: 'Номер', numeric: true, width: '96px' },
        { key: 'name', label: 'Название', editable: true },
        { key: 'type', label: 'Тип', width: '110px' },
        { key: 'dir', label: 'Напр.', width: '52px' },
        { key: 'lanes', label: 'Полос', numeric: true, editable: true, width: '56px' },
        { key: 'maxspeed', label: 'V доп.', editable: true, numeric: true, width: '62px' },
        { key: 'length', label: 'Длина, м', numeric: true, width: '66px' },
        { key: 'volume', label: 'Поток, авт/ч', numeric: true, width: '84px' },
        { key: 'capacity', label: 'Пропуск., авт/ч', numeric: true, width: '96px' },
        { key: 'vc', label: 'Загрузка, %', numeric: true, width: '80px' },
        { key: 'speed', label: 'V тек., км/ч', numeric: true, width: '78px' },
        { key: 'los', label: 'Уровень', width: '56px' },
    ],
    nodes: [
        { key: '_id', label: 'Номер', numeric: true, width: '110px' },
        { key: 'name', label: 'Улицы' },
        { key: 'arms', label: 'Подходов', numeric: true, width: '70px' },
        { key: 'control', label: 'Управление', width: '110px' },
        { key: 'restrictions', label: 'Запретов', numeric: true, width: '70px' },
    ],
    signals: [
        { key: '_id', label: 'Узел', numeric: true, width: '110px' },
        { key: 'name', label: 'Улицы' },
        { key: 'plan', label: 'План', width: '110px' },
        { key: 'phases', label: 'Фаз', numeric: true, width: '50px' },
        { key: 'cycle', label: 'Цикл, с', numeric: true, width: '64px' },
    ],
    lines: [
        { key: 'ref', label: 'Номер', width: '60px' },
        { key: 'mode', label: 'Вид', width: '90px' },
        { key: 'name', label: 'Название' },
        { key: 'interval', label: 'Интервал, мин', numeric: true, width: '90px' },
        { key: 'stops', label: 'Остановок', numeric: true, width: '70px' },
        { key: 'length', label: 'На участке, км', numeric: true, width: '96px' },
        { key: 'time', label: 'Время, мин', numeric: true, width: '76px' },
        { key: 'speed', label: 'Скорость, км/ч', numeric: true, width: '96px' },
    ],
    stops: [
        { key: '_id', label: 'Узел', numeric: true, width: '110px' },
        { key: 'name', label: 'Название' },
        { key: 'lines', label: 'Линий', numeric: true, width: '60px' },
        { key: 'refs', label: 'Маршруты' },
    ],
    zones: [
        { key: '_id', label: 'Номер', numeric: true, width: '60px' },
        { key: 'name', label: 'Название' },
        { key: 'kind', label: 'Тип', width: '110px' },
        { key: 'production', label: 'Отправление, авт/ч', numeric: true, width: '120px' },
        { key: 'attraction', label: 'Прибытие, авт/ч', numeric: true, width: '110px' },
    ],
    matrix: [
        { key: 'from', label: 'Откуда' },
        { key: 'to', label: 'Куда' },
        { key: 'trips', label: 'Поездок в час', numeric: true, width: '100px' },
        { key: 'routes', label: 'Маршрутов', numeric: true, width: '76px' },
    ],
};
const search = ref('');
const sortKey = ref(null);
const sortDown = ref(true);
watch(() => editor.listTab, () => {
    sortKey.value = null;
    search.value = '';
});
const columns = computed(() => columnsByTab[editor.listTab]);
function nodeNames(id) {
    const doc = editor.doc;
    if (!doc)
        return '';
    const names = [...new Set(doc.waysOfNode(id).map((wayId) => doc.ways.get(wayId)?.tags?.name).filter(Boolean))];
    return names.join(' / ');
}
function linkRows() {
    const doc = editor.doc;
    if (!doc)
        return [];
    const worst = new Map();
    for (const load of sim.macro?.loads.values() ?? []) {
        const id = load.edge.wayId;
        const current = worst.get(id);
        if (!current || load.vc > current.vc) {
            worst.set(id, { volume: load.volume + load.transitPcu, capacity: load.capacity, vc: load.vc, speed: load.speedKmh, los: load.los });
        }
    }
    const projector = editor.projector;
    const rows = [];
    for (const way of doc.ways.values()) {
        if (!isDrivable(way.tags) || editor.hidden.ways.has(way.id))
            continue;
        const tags = way.tags ?? {};
        const profile = parseProfile(tags);
        let length = 0;
        for (let i = 1; i < way.nds.length; i++) {
            const a = doc.nodes.get(way.nds[i - 1]);
            const b = doc.nodes.get(way.nds[i]);
            if (a && b) {
                const pa = projector.toXY(a);
                const pb = projector.toXY(b);
                length += Math.hypot(pa.x - pb.x, pa.y - pb.y);
            }
        }
        const result = worst.get(way.id);
        rows.push({
            _id: way.id,
            name: tags.name ?? '',
            type: tags.highway ?? '',
            dir: isOneway(tags) ? '→' : '↔',
            lanes: profile.forward + profile.backward,
            maxspeed: tags.maxspeed ?? parseSpeed(undefined, tags.highway ?? 'road'),
            length: Math.round(length),
            volume: result ? Math.round(result.volume) : null,
            capacity: result ? Math.round(result.capacity) : null,
            vc: result ? Math.round(result.vc * 100) : null,
            speed: result ? Math.round(result.speed) : null,
            los: result ? (LOS_LABELS[result.los] ?? null) : null,
        });
    }
    return rows;
}
const rows = computed(() => {
    void editor.rev;
    void sim.macro;
    const doc = editor.doc;
    if (!doc)
        return [];
    switch (editor.listTab) {
        case 'links':
            return linkRows();
        case 'nodes': {
            const network = editor.network;
            if (!network)
                return [];
            const result = [];
            for (const [id, arms] of network.arms) {
                if (arms.length < 2)
                    continue;
                const restrictions = [...doc.relations.values()].filter((relation) => relation.tags?.type === 'restriction' && relation.members.some(([type, ref, role]) => type === 'node' && ref === id && role === 'via')).length;
                result.push({
                    _id: id,
                    name: nodeNames(id),
                    arms: arms.length,
                    control: doc.nodes.get(id)?.tags?.highway === 'traffic_signals' ? 'Светофор' : arms.length >= 3 ? 'Без светофора' : 'Стык',
                    restrictions,
                });
            }
            return result;
        }
        case 'signals':
            return [...doc.nodes.values()]
                .filter((node) => node.tags?.highway === 'traffic_signals')
                .map((node) => {
                const plan = parseSignalPlan(node.tags);
                const cycle = plan ? plan.phases.reduce((sum, phase) => sum + phase.green + plan.yellow + plan.allRed, 0) : null;
                return {
                    _id: node.id,
                    name: nodeNames(node.id),
                    plan: plan ? 'Свой' : 'Автоматический',
                    phases: plan?.phases.length ?? null,
                    cycle,
                };
            });
        case 'lines':
            return editor.lines.map((line) => {
                const result = sim.macro?.lines.find((item) => item.service.line.id === line.id);
                return {
                    _id: line.id,
                    ref: line.ref,
                    mode: TRANSIT_MODE_LABELS[line.mode],
                    name: line.name,
                    interval: line.interval,
                    stops: line.stops.length,
                    length: Number((line.lengthM / 1000).toFixed(2)),
                    time: result ? Math.round(result.timeS / 60) : null,
                    speed: result ? Math.round(result.speedKmh) : null,
                };
            });
        case 'stops': {
            const byNode = new Map();
            for (const line of editor.lines) {
                for (const stop of line.stops) {
                    const entry = byNode.get(stop.node) ?? { name: stop.name, refs: new Set() };
                    entry.refs.add(line.ref);
                    byNode.set(stop.node, entry);
                }
            }
            return [...byNode.entries()].map(([id, entry]) => ({
                _id: id,
                name: entry.name,
                lines: entry.refs.size,
                refs: [...entry.refs].sort((a, b) => a.localeCompare(b, 'ru', { numeric: true })).join(', '),
            }));
        }
        case 'zones':
            return (sim.macro?.zones ?? []).map((zone) => ({
                _id: zone.id,
                name: zone.label,
                kind: zone.kind === 'gateway' ? 'Въезд на границе' : 'Район',
                production: Math.round(zone.production),
                attraction: Math.round(zone.attraction),
            }));
        default:
            return (sim.macro?.flows ?? []).map((flow, index) => ({
                _id: index,
                from: flow.from.label,
                to: flow.to.label,
                trips: Math.round(flow.trips),
                routes: flow.routes.length,
            }));
    }
});
const needsCalculation = computed(() => !sim.macro && (editor.listTab === 'zones' || editor.listTab === 'matrix'));
const filtered = computed(() => {
    const needle = search.value.trim().toLowerCase();
    let result = rows.value;
    if (needle) {
        result = result.filter((row) => columns.value.some((column) => String(row[column.key] ?? '').toLowerCase().includes(needle)));
    }
    const key = sortKey.value;
    if (key) {
        const direction = sortDown.value ? -1 : 1;
        result = [...result].sort((a, b) => {
            const x = a[key] ?? null;
            const y = b[key] ?? null;
            if (x === null)
                return 1;
            if (y === null)
                return -1;
            if (typeof x === 'number' && typeof y === 'number')
                return (x - y) * direction;
            return String(x).localeCompare(String(y), 'ru', { numeric: true }) * direction;
        });
    }
    return result;
});
const shown = computed(() => filtered.value.slice(0, MAX_ROWS));
function sortBy(key) {
    if (sortKey.value === key)
        sortDown.value = !sortDown.value;
    else {
        sortKey.value = key;
        sortDown.value = true;
    }
}
function isSelected(row) {
    if (editor.listTab === 'links')
        return editor.selection.some((item) => item.kind === 'way' && item.id === row._id);
    if (editor.listTab === 'lines')
        return editor.selectedLineId === row._id;
    if (editor.listTab === 'nodes' || editor.listTab === 'signals' || editor.listTab === 'stops') {
        return editor.selection.some((item) => item.kind === 'node' && item.id === row._id);
    }
    return false;
}
function activate(row) {
    switch (editor.listTab) {
        case 'links':
            editor.focusWay(row._id);
            break;
        case 'nodes':
        case 'signals':
        case 'stops':
            editor.focusNode(row._id);
            break;
        case 'lines':
            editor.focusLine(row._id);
            editor.leftTab = 'transit';
            editor.navigatorOpen = true;
            break;
        case 'zones': {
            const zone = sim.macro?.zones[row._id];
            const node = zone && editor.doc?.nodes.get(zone.node);
            if (node)
                editor.focusOn(node, 16.5);
            break;
        }
    }
}
function openJunction(row) {
    if (editor.listTab === 'nodes' || editor.listTab === 'signals')
        editor.openJunction(row._id);
}
function editCell(row, key, event) {
    const way = editor.doc?.ways.get(row._id);
    if (!way)
        return;
    const raw = event.target.value.trim();
    const tags = { ...way.tags };
    if (key === 'name') {
        if (raw)
            tags.name = raw;
        else
            delete tags.name;
        editor.updateWayTags(way.id, tags, 'Название дороги');
    }
    else if (key === 'maxspeed') {
        if (raw)
            tags.maxspeed = raw;
        else
            delete tags.maxspeed;
        editor.updateWayTags(way.id, tags, 'Скорость');
    }
    else if (key === 'lanes') {
        const lanes = Number.parseInt(raw, 10);
        if (!Number.isFinite(lanes) || lanes < 1) {
            editor.toast('Число полос должно быть целым и больше нуля', 'error');
            return;
        }
        const profile = parseProfile(tags);
        if (profile.oneway) {
            const reversed = profile.forward === 0;
            editor.updateWayTags(way.id, withLanes(tags, reversed ? 0 : lanes, reversed ? lanes : 0), 'Число полос');
        }
        else {
            const forward = Math.max(1, Math.ceil(lanes / 2));
            editor.updateWayTags(way.id, withLanes(tags, forward, Math.max(1, lanes - forward)), 'Число полос');
        }
    }
}
function csvCell(value) {
    const text = String(value ?? '');
    return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
/** Таблица для Excel: разделитель и метка кодировки, которые он понимает без настройки. */
function exportCsv() {
    const header = columns.value.map((column) => csvCell(column.label)).join(';');
    const body = filtered.value.map((row) => columns.value.map((column) => csvCell(row[column.key] ?? null)).join(';'));
    const blob = new Blob(['﻿', [header, ...body].join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${editor.listTab}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    __VLS_withDotValue(editor, {});
    __VLS_withDotValue(filtered, {});
    __VLS_withDotValue(needsCalculation, {});
    __VLS_withDotValue(sortKey, {});
    __VLS_withDotValue(sortDown, {});
    __VLS_withDotValue(shown, {});
    __VLS_withDotValue(columns, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['head']} */ ;
    /** @type {__VLS_StyleScopedClasses['search']} */ ;
    /** @type {__VLS_StyleScopedClasses['search']} */ ;
    /** @type {__VLS_StyleScopedClasses['numeric']} */ ;
    /** @type {__VLS_StyleScopedClasses['cell-input']} */ ;
    /** @type {__VLS_StyleScopedClasses['numeric']} */ ;
    /** @type {__VLS_StyleScopedClasses['cell-input']} */ ;
    /** @type {__VLS_StyleScopedClasses['cell-input']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
        ...{ class: "lists" },
        'aria-label': "Списки",
    });
    /** @type {__VLS_StyleScopedClasses['lists']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "head" },
    });
    /** @type {__VLS_StyleScopedClasses['head']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "dock-tabs" },
        role: "tablist",
    });
    /** @type {__VLS_StyleScopedClasses['dock-tabs']} */ ;
    const __VLS_0 = __VLS_tryAsConstant((__VLS_unwrap(tabs, {})));
    for (const [tab] of __VLS_vFor(__VLS_nonNull(__VLS_0))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    void $event;
                    return (editor.value.listTab = tab.id);
                    // @ts-ignore
                    [tabs, editor,];
                } },
            key: (tab.id),
            role: "tab",
            ...{ class: ({ active: editor.value.listTab === tab.id }) },
            'aria-selected': (editor.value.listTab === tab.id),
        });
        /** @type {__VLS_StyleScopedClasses['active']} */ ;
        (tab.label);
        // @ts-ignore
        [editor, editor,];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "tools" },
    });
    /** @type {__VLS_StyleScopedClasses['tools']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "faint count" },
    });
    /** @type {__VLS_StyleScopedClasses['faint']} */ ;
    /** @type {__VLS_StyleScopedClasses['count']} */ ;
    (filtered.value.length);
    if (filtered.value.length > __VLS_unwrap(MAX_ROWS, {})) {
        (__VLS_unwrap(MAX_ROWS, {}));
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "search" },
    });
    /** @type {__VLS_StyleScopedClasses['search']} */ ;
    let __VLS_1;
    /** @ts-ignore @type { | typeof Search} */
    Search;
    // @ts-ignore
    const __VLS_2 = __VLS_asFunctionalComponent1(__VLS_1, new __VLS_1({
        // @ts-ignore
        size: (12), ...{ class: "faint" }, 'aria-hidden': "true",
    }));
    const __VLS_3 = __VLS_2({
        size: (12),
        ...{ class: "faint" },
        'aria-hidden': "true",
    }, ...__VLS_functionalComponentArgsRest(__VLS_2));
    /** @type {__VLS_StyleScopedClasses['faint']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        ...{ class: "input" },
        placeholder: "Поиск в списке",
        'aria-label': "Поиск в списке",
    });
    (__VLS_unwrap(search, {}));
    /** @type {__VLS_StyleScopedClasses['input']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (exportCsv) },
        ...{ class: "btn ghost small" },
        title: "Сохранить таблицу в CSV",
        'aria-label': "Сохранить таблицу в CSV",
    });
    /** @type {__VLS_StyleScopedClasses['btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['ghost']} */ ;
    /** @type {__VLS_StyleScopedClasses['small']} */ ;
    let __VLS_6;
    /** @ts-ignore @type { | typeof Download} */
    Download;
    // @ts-ignore
    const __VLS_7 = __VLS_asFunctionalComponent1(__VLS_6, new __VLS_6({
        // @ts-ignore
        size: (13),
    }));
    const __VLS_8 = __VLS_7({
        size: (13),
    }, ...__VLS_functionalComponentArgsRest(__VLS_7));
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                void $event;
                return (editor.value.listOpen = false);
                // @ts-ignore
                [editor, filtered, filtered, MAX_ROWS, MAX_ROWS, search,];
            } },
        ...{ class: "btn ghost small" },
        title: "Закрыть списки",
        'aria-label': "Закрыть списки",
    });
    /** @type {__VLS_StyleScopedClasses['btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['ghost']} */ ;
    /** @type {__VLS_StyleScopedClasses['small']} */ ;
    let __VLS_11;
    /** @ts-ignore @type { | typeof X} */
    X;
    // @ts-ignore
    const __VLS_12 = __VLS_asFunctionalComponent1(__VLS_11, new __VLS_11({
        // @ts-ignore
        size: (13),
    }));
    const __VLS_13 = __VLS_12({
        size: (13),
    }, ...__VLS_functionalComponentArgsRest(__VLS_12));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "table-wrap" },
    });
    /** @type {__VLS_StyleScopedClasses['table-wrap']} */ ;
    if (needsCalculation.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "empty muted" },
        });
        /** @type {__VLS_StyleScopedClasses['empty']} */ ;
        /** @type {__VLS_StyleScopedClasses['muted']} */ ;
    }
    else {
        __VLS_asFunctionalElement1(__VLS_intrinsics.table, __VLS_intrinsics.table)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.thead, __VLS_intrinsics.thead)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
        const __VLS_16 = __VLS_tryAsConstant((columns.value));
        for (const [column] of __VLS_vFor(__VLS_nonNull(__VLS_16))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                key: (column.key),
                ...{ class: ({ numeric: column.numeric }) },
                ...{ style: ({ width: column.width }) },
                'aria-sort': (sortKey.value === column.key ? (sortDown.value ? 'descending' : 'ascending') : 'none'),
            });
            /** @type {__VLS_StyleScopedClasses['numeric']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        void $event;
                        if (!!(needsCalculation.value))
                            throw 0;
                        return (sortBy(column.key));
                        // @ts-ignore
                        [needsCalculation, columns, sortKey, sortDown,];
                    } },
            });
            (column.label);
            if (sortKey.value === column.key && sortDown.value) {
                let __VLS_17;
                /** @ts-ignore @type { | typeof ArrowDown} */
                ArrowDown;
                // @ts-ignore
                const __VLS_18 = __VLS_asFunctionalComponent1(__VLS_17, new __VLS_17({
                    // @ts-ignore
                    size: (11), 'aria-hidden': "true",
                }));
                const __VLS_19 = __VLS_18({
                    size: (11),
                    'aria-hidden': "true",
                }, ...__VLS_functionalComponentArgsRest(__VLS_18));
            }
            else if (sortKey.value === column.key) {
                let __VLS_22;
                /** @ts-ignore @type { | typeof ArrowUp} */
                ArrowUp;
                // @ts-ignore
                const __VLS_23 = __VLS_asFunctionalComponent1(__VLS_22, new __VLS_22({
                    // @ts-ignore
                    size: (11), 'aria-hidden': "true",
                }));
                const __VLS_24 = __VLS_23({
                    size: (11),
                    'aria-hidden': "true",
                }, ...__VLS_functionalComponentArgsRest(__VLS_23));
            }
            // @ts-ignore
            [sortKey, sortKey, sortDown,];
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.tbody, __VLS_intrinsics.tbody)({});
        const __VLS_27 = __VLS_tryAsConstant((shown.value));
        for (const [row] of __VLS_vFor(__VLS_nonNull(__VLS_27))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
                ...{ onClick: (...[$event]) => {
                        void $event;
                        if (!!(needsCalculation.value))
                            throw 0;
                        return (activate(row));
                        // @ts-ignore
                        [shown,];
                    } },
                ...{ onDblclick: (...[$event]) => {
                        void $event;
                        if (!!(needsCalculation.value))
                            throw 0;
                        return (openJunction(row));
                        // @ts-ignore
                        [];
                    } },
                key: (`${editor.value.listTab}-${row._id}`),
                ...{ class: ({ selected: isSelected(row) }) },
            });
            /** @type {__VLS_StyleScopedClasses['selected']} */ ;
            const __VLS_28 = __VLS_tryAsConstant((columns.value));
            for (const [column] of __VLS_vFor(__VLS_nonNull(__VLS_28))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                    key: (column.key),
                    ...{ class: ({ numeric: column.numeric, los: column.key === 'los' }) },
                });
                /** @type {__VLS_StyleScopedClasses['numeric']} */ ;
                /** @type {__VLS_StyleScopedClasses['los']} */ ;
                if (column.editable) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                        ...{ onClick: () => { } },
                        ...{ onChange: (...[$event]) => {
                                void $event;
                                if (!!(needsCalculation.value))
                                    throw 0;
                                if (!(column.editable))
                                    throw 0;
                                return (editCell(row, column.key, $event));
                                // @ts-ignore
                                [editor, columns,];
                            } },
                        ...{ onKeydown: (...[$event]) => {
                                void $event;
                                if (!!(needsCalculation.value))
                                    throw 0;
                                if (!(column.editable))
                                    throw 0;
                                return ($event.target.blur());
                                // @ts-ignore
                                [];
                            } },
                        ...{ class: "cell-input" },
                        ...{ class: ({ numeric: column.numeric }) },
                        value: (row[column.key] ?? ''),
                        'aria-label': (`${column.label} для ${row._id}`),
                    });
                    /** @type {__VLS_StyleScopedClasses['cell-input']} */ ;
                    /** @type {__VLS_StyleScopedClasses['numeric']} */ ;
                }
                else {
                    (row[column.key] ?? '—');
                }
                // @ts-ignore
                [];
            }
            // @ts-ignore
            [];
        }
        if (shown.value.length === 0) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                colspan: (columns.value.length),
                ...{ class: "empty muted" },
            });
            /** @type {__VLS_StyleScopedClasses['empty']} */ ;
            /** @type {__VLS_StyleScopedClasses['muted']} */ ;
        }
    }
    // @ts-ignore
    [columns, shown,];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
