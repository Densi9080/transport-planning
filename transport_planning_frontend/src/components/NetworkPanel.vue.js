import { Bus, ChevronRight, Circle, CornerDownRight, Eye, EyeOff, Hexagon, MapPin, Search, Spline, TrafficCone, } from 'lucide-vue-next';
import { computed, reactive, ref } from 'vue';
import { isDrivable } from '@/core/lanes';
import { useEditor } from '@/stores/editor';
import { useSimulation } from '@/stores/simulation';
const editor = useEditor();
const sim = useSimulation();
const query = ref('');
const open = reactive({ roads: true, junctions: false, signals: false });
const roads = computed(() => {
    void editor.rev;
    const doc = editor.doc;
    if (!doc)
        return [];
    const groups = new Map();
    for (const way of doc.ways.values()) {
        if (!isDrivable(way.tags))
            continue;
        const name = way.tags?.name ?? 'Без названия';
        const list = groups.get(name);
        if (list)
            list.push(way.id);
        else
            groups.set(name, [way.id]);
    }
    const needle = query.value.trim().toLowerCase();
    return [...groups.entries()]
        .map(([name, wayIds]) => ({ name, wayIds }))
        .filter((group) => !needle || group.name.toLowerCase().includes(needle))
        .sort((a, b) => (a.name === 'Без названия' ? 1 : b.name === 'Без названия' ? -1 : a.name.localeCompare(b.name, 'ru')));
});
const signals = computed(() => {
    void editor.rev;
    const doc = editor.doc;
    return doc ? [...doc.nodes.values()].filter((node) => node.tags?.highway === 'traffic_signals') : [];
});
const junctions = computed(() => {
    const network = editor.network;
    const doc = editor.doc;
    if (!network || !doc)
        return [];
    const result = [];
    for (const [id, arms] of network.arms) {
        if (arms.length < 3)
            continue;
        const names = [...new Set(arms.map((arm) => doc.ways.get(arm.link.wayId)?.tags?.name).filter(Boolean))];
        result.push({ id, degree: arms.length, title: names.slice(0, 2).join(' / ') || `Узел ${id}` });
    }
    return result.sort((a, b) => b.degree - a.degree);
});
const objects = computed(() => {
    void editor.rev;
    const doc = editor.doc;
    const drivable = doc ? [...doc.ways.values()].filter((way) => isDrivable(way.tags)).length : 0;
    const stops = new Set(editor.lines.flatMap((line) => line.stops.map((stop) => stop.node)));
    const net = sim.net;
    return [
        { id: 'nodes', label: 'Узлы', count: junctions.value.length, icon: Circle, active: 'nodes', list: 'nodes' },
        { id: 'links', label: 'Отрезки', count: drivable, icon: Spline, active: 'links', list: 'links' },
        { id: 'turns', label: 'Повороты', count: net?.connectors.length ?? 0, icon: CornerDownRight, list: 'links', layers: ['turnPaths'] },
        { id: 'signals', label: 'Светофоры', count: signals.value.length, icon: TrafficCone, active: 'nodes', list: 'signals', layers: ['signals'] },
        { id: 'zones', label: 'Районы', count: sim.macro?.zones.length ?? 0, icon: Hexagon, list: 'zones' },
        { id: 'lines', label: 'Линии ОТ', count: editor.lines.length, icon: Bus, list: 'lines', layers: ['transit'] },
        { id: 'stops', label: 'Остановки', count: stops.size, icon: MapPin, list: 'stops', layers: ['transit'] },
    ];
});
const activeObject = ref('auto');
function activate(item) {
    activeObject.value = item.id;
    editor.activeType = item.active ?? 'auto';
    if (item.list) {
        editor.listOpen = true;
        editor.listTab = item.list;
    }
    if (item.id === 'lines' || item.id === 'stops')
        editor.leftTab = 'transit';
}
function isVisible(item) {
    return (item.layers ?? []).every((key) => editor.layers[key]);
}
function toggleVisible(item) {
    const next = !isVisible(item);
    for (const key of item.layers ?? [])
        editor.layers[key] = next;
}
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    __VLS_withDotValue(activeObject, {});
    __VLS_withDotValue(editor, {});
    __VLS_withDotValue(open, {});
    __VLS_withDotValue(roads, {});
    __VLS_withDotValue(junctions, {});
    __VLS_withDotValue(signals, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['object']} */ ;
    /** @type {__VLS_StyleScopedClasses['object']} */ ;
    /** @type {__VLS_StyleScopedClasses['reset']} */ ;
    /** @type {__VLS_StyleScopedClasses['search']} */ ;
    /** @type {__VLS_StyleScopedClasses['search']} */ ;
    /** @type {__VLS_StyleScopedClasses['group']} */ ;
    /** @type {__VLS_StyleScopedClasses['group']} */ ;
    /** @type {__VLS_StyleScopedClasses['group']} */ ;
    /** @type {__VLS_StyleScopedClasses['group']} */ ;
    /** @type {__VLS_StyleScopedClasses['item']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
        ...{ class: "objects" },
        'aria-label': "Сетевые объекты",
    });
    /** @type {__VLS_StyleScopedClasses['objects']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "eyebrow head" },
    });
    /** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
    /** @type {__VLS_StyleScopedClasses['head']} */ ;
    const __VLS_0 = __VLS_tryAsConstant((__VLS_unwrap(objects, {})));
    for (const [item] of __VLS_vFor(__VLS_nonNull(__VLS_0))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            key: (item.id),
            ...{ class: "object" },
            ...{ class: ({ active: activeObject.value === item.id }) },
        });
        /** @type {__VLS_StyleScopedClasses['object']} */ ;
        /** @type {__VLS_StyleScopedClasses['active']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    void $event;
                    return (activate(item));
                    // @ts-ignore
                    [objects, activeObject,];
                } },
            ...{ class: "main" },
            'aria-pressed': (activeObject.value === item.id),
        });
        /** @type {__VLS_StyleScopedClasses['main']} */ ;
        const __VLS_1 = (item.icon);
        // @ts-ignore
        const __VLS_2 = __VLS_asFunctionalComponent1(__VLS_1, new __VLS_1({
            // @ts-ignore
            size: (14), 'aria-hidden': "true",
        }));
        const __VLS_3 = __VLS_2({
            size: (14),
            'aria-hidden': "true",
        }, ...__VLS_functionalComponentArgsRest(__VLS_2));
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "ellipsis" },
        });
        /** @type {__VLS_StyleScopedClasses['ellipsis']} */ ;
        (item.label);
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "count" },
        });
        /** @type {__VLS_StyleScopedClasses['count']} */ ;
        (item.count);
        if (item.layers) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        void $event;
                        if (!(item.layers))
                            throw 0;
                        return (toggleVisible(item));
                        // @ts-ignore
                        [activeObject,];
                    } },
                ...{ class: "eye" },
                'aria-label': (`${isVisible(item) ? 'Скрыть' : 'Показать'}: ${item.label}`),
                title: (isVisible(item) ? 'Скрыть на карте' : 'Показать на карте'),
            });
            /** @type {__VLS_StyleScopedClasses['eye']} */ ;
            if (isVisible(item)) {
                let __VLS_6;
                /** @ts-ignore @type { | typeof Eye} */
                Eye;
                // @ts-ignore
                const __VLS_7 = __VLS_asFunctionalComponent1(__VLS_6, new __VLS_6({
                    // @ts-ignore
                    size: (13),
                }));
                const __VLS_8 = __VLS_7({
                    size: (13),
                }, ...__VLS_functionalComponentArgsRest(__VLS_7));
            }
            else {
                let __VLS_11;
                /** @ts-ignore @type { | typeof EyeOff} */
                EyeOff;
                // @ts-ignore
                const __VLS_12 = __VLS_asFunctionalComponent1(__VLS_11, new __VLS_11({
                    // @ts-ignore
                    size: (13), ...{ class: "faint" },
                }));
                const __VLS_13 = __VLS_12({
                    size: (13),
                    ...{ class: "faint" },
                }, ...__VLS_functionalComponentArgsRest(__VLS_12));
                /** @type {__VLS_StyleScopedClasses['faint']} */ ;
            }
        }
        // @ts-ignore
        [];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                void $event;
                return ((activeObject.value = 'auto'), (editor.value.activeType = 'auto'));
                // @ts-ignore
                [activeObject, editor,];
            } },
        ...{ class: "reset faint" },
        ...{ class: ({ on: editor.value.activeType === 'auto' }) },
    });
    /** @type {__VLS_StyleScopedClasses['reset']} */ ;
    /** @type {__VLS_StyleScopedClasses['faint']} */ ;
    /** @type {__VLS_StyleScopedClasses['on']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
        ...{ class: "section" },
    });
    /** @type {__VLS_StyleScopedClasses['section']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "search" },
    });
    /** @type {__VLS_StyleScopedClasses['search']} */ ;
    let __VLS_16;
    /** @ts-ignore @type { | typeof Search} */
    Search;
    // @ts-ignore
    const __VLS_17 = __VLS_asFunctionalComponent1(__VLS_16, new __VLS_16({
        // @ts-ignore
        size: (13), ...{ class: "faint" }, 'aria-hidden': "true",
    }));
    const __VLS_18 = __VLS_17({
        size: (13),
        ...{ class: "faint" },
        'aria-hidden': "true",
    }, ...__VLS_functionalComponentArgsRest(__VLS_17));
    /** @type {__VLS_StyleScopedClasses['faint']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        ...{ class: "input" },
        placeholder: "Поиск улицы",
        'aria-label': "Поиск улицы",
    });
    (__VLS_unwrap(query, {}));
    /** @type {__VLS_StyleScopedClasses['input']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                void $event;
                return (open.value.roads = !open.value.roads);
                // @ts-ignore
                [editor, query, open, open,];
            } },
        ...{ class: "group" },
        'aria-expanded': (open.value.roads),
    });
    /** @type {__VLS_StyleScopedClasses['group']} */ ;
    let __VLS_21;
    /** @ts-ignore @type { | typeof ChevronRight} */
    ChevronRight;
    // @ts-ignore
    const __VLS_22 = __VLS_asFunctionalComponent1(__VLS_21, new __VLS_21({
        // @ts-ignore
        size: (13), ...{ class: ({ turned: open.value.roads }) }, 'aria-hidden': "true",
    }));
    const __VLS_23 = __VLS_22({
        size: (13),
        ...{ class: ({ turned: open.value.roads }) },
        'aria-hidden': "true",
    }, ...__VLS_functionalComponentArgsRest(__VLS_22));
    /** @type {__VLS_StyleScopedClasses['turned']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "faint" },
    });
    /** @type {__VLS_StyleScopedClasses['faint']} */ ;
    (roads.value.length);
    if (open.value.roads) {
        const __VLS_26 = __VLS_tryAsConstant((roads.value));
        for (const [group] of __VLS_vFor(__VLS_nonNull(__VLS_26))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        void $event;
                        if (!(open.value.roads))
                            throw 0;
                        return (editor.value.focusWay(group.wayIds[0]));
                        // @ts-ignore
                        [editor, open, open, open, roads, roads,];
                    } },
                key: (group.name),
                ...{ class: "item" },
            });
            /** @type {__VLS_StyleScopedClasses['item']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "ellipsis" },
            });
            /** @type {__VLS_StyleScopedClasses['ellipsis']} */ ;
            (group.name);
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "faint" },
            });
            /** @type {__VLS_StyleScopedClasses['faint']} */ ;
            (group.wayIds.length);
            // @ts-ignore
            [];
        }
        if (roads.value.length === 0) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                ...{ class: "empty" },
            });
            /** @type {__VLS_StyleScopedClasses['empty']} */ ;
        }
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                void $event;
                return (open.value.junctions = !open.value.junctions);
                // @ts-ignore
                [open, open, roads,];
            } },
        ...{ class: "group" },
        'aria-expanded': (open.value.junctions),
    });
    /** @type {__VLS_StyleScopedClasses['group']} */ ;
    let __VLS_27;
    /** @ts-ignore @type { | typeof ChevronRight} */
    ChevronRight;
    // @ts-ignore
    const __VLS_28 = __VLS_asFunctionalComponent1(__VLS_27, new __VLS_27({
        // @ts-ignore
        size: (13), ...{ class: ({ turned: open.value.junctions }) }, 'aria-hidden': "true",
    }));
    const __VLS_29 = __VLS_28({
        size: (13),
        ...{ class: ({ turned: open.value.junctions }) },
        'aria-hidden': "true",
    }, ...__VLS_functionalComponentArgsRest(__VLS_28));
    /** @type {__VLS_StyleScopedClasses['turned']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "faint" },
    });
    /** @type {__VLS_StyleScopedClasses['faint']} */ ;
    (junctions.value.length);
    if (open.value.junctions) {
        const __VLS_32 = __VLS_tryAsConstant((junctions.value.slice(0, 100)));
        for (const [item] of __VLS_vFor(__VLS_nonNull(__VLS_32))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        void $event;
                        if (!(open.value.junctions))
                            throw 0;
                        return (editor.value.focusNode(item.id));
                        // @ts-ignore
                        [editor, open, open, open, junctions, junctions,];
                    } },
                key: (item.id),
                ...{ class: "item" },
            });
            /** @type {__VLS_StyleScopedClasses['item']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "ellipsis" },
            });
            /** @type {__VLS_StyleScopedClasses['ellipsis']} */ ;
            (item.title);
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "faint" },
            });
            /** @type {__VLS_StyleScopedClasses['faint']} */ ;
            (item.degree);
            // @ts-ignore
            [];
        }
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                void $event;
                return (open.value.signals = !open.value.signals);
                // @ts-ignore
                [open, open,];
            } },
        ...{ class: "group" },
        'aria-expanded': (open.value.signals),
    });
    /** @type {__VLS_StyleScopedClasses['group']} */ ;
    let __VLS_33;
    /** @ts-ignore @type { | typeof ChevronRight} */
    ChevronRight;
    // @ts-ignore
    const __VLS_34 = __VLS_asFunctionalComponent1(__VLS_33, new __VLS_33({
        // @ts-ignore
        size: (13), ...{ class: ({ turned: open.value.signals }) }, 'aria-hidden': "true",
    }));
    const __VLS_35 = __VLS_34({
        size: (13),
        ...{ class: ({ turned: open.value.signals }) },
        'aria-hidden': "true",
    }, ...__VLS_functionalComponentArgsRest(__VLS_34));
    /** @type {__VLS_StyleScopedClasses['turned']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "faint" },
    });
    /** @type {__VLS_StyleScopedClasses['faint']} */ ;
    (signals.value.length);
    if (open.value.signals) {
        const __VLS_38 = __VLS_tryAsConstant((signals.value));
        for (const [node] of __VLS_vFor(__VLS_nonNull(__VLS_38))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        void $event;
                        if (!(open.value.signals))
                            throw 0;
                        return (editor.value.focusNode(node.id));
                        // @ts-ignore
                        [editor, open, open, open, signals, signals,];
                    } },
                key: (node.id),
                ...{ class: "item" },
            });
            /** @type {__VLS_StyleScopedClasses['item']} */ ;
            (node.id);
            // @ts-ignore
            [];
        }
    }
    // @ts-ignore
    [];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
