import { Box, Check, Gauge, Pause, Play, RotateCcw, TrafficCone, TriangleAlert } from 'lucide-vue-next';
import { computed } from 'vue';
import { LOS_COLORS } from '@/map/style';
import { LOS_LABELS, LOS_TITLES } from '@/sim/macro';
import { DRIVER_STYLES, STYLE_LABELS, VIOLATION_LABELS } from '@/sim/micro';
import { signalGroupAt } from '@/sim/net';
import { useEditor } from '@/stores/editor';
import { useSimulation } from '@/stores/simulation';
import SignalSummary from './SignalSummary.vue';
const editor = useEditor();
const sim = useSimulation();
const periods = [
    { id: 'morning', label: 'Утро' },
    { id: 'midday', label: 'День' },
    { id: 'evening', label: 'Вечер' },
];
const speeds = [1, 2, 5, 10];
const totals = computed(() => sim.macro?.totals ?? null);
const worstLoads = computed(() => {
    const loads = sim.macro?.loads;
    if (!loads)
        return [];
    return [...loads.values()]
        .filter((load) => load.vc >= 0.75)
        .sort((a, b) => b.vc - a.vc)
        .slice(0, 8);
});
const losRows = computed(() => LOS_LABELS.map((label, index) => ({
    label,
    title: LOS_TITLES[index],
    color: LOS_COLORS[index],
    share: totals.value?.losShares[index] ?? 0,
})));
const selectedWay = computed(() => editor.selectedWays[0] ?? null);
const selectedSignalNode = computed(() => {
    const node = editor.selectedNodes[0];
    return node && sim.net && signalGroupAt(sim.net, node.id) ? node.id : null;
});
const selectedLoads = computed(() => (selectedWay.value ? sim.loadsOfWay(selectedWay.value.id) : []));
/** Участки одной дороги собираем по направлениям: нагружен обычно самый узкий кусок. */
const selectedDirections = computed(() => {
    const groups = new Map();
    for (const load of selectedLoads.value) {
        const list = groups.get(load.edge.forward);
        if (list)
            list.push(load);
        else
            groups.set(load.edge.forward, [load]);
    }
    return [...groups.entries()].map(([forward, loads]) => ({
        forward,
        worst: [...loads].sort((a, b) => b.vc - a.vc)[0],
    }));
});
const selectedMicroCars = computed(() => {
    void sim.loadRev;
    const way = selectedWay.value;
    return way ? sim.edgesOfWay(way.id).reduce((sum, edge) => sum + edge.carCount, 0) : 0;
});
const violations = computed(() => Object.keys(VIOLATION_LABELS).map((kind) => ({
    kind,
    label: VIOLATION_LABELS[kind],
    count: sim.stats?.violations[kind] ?? 0,
})));
const normalShare = computed(() => Math.max(0, 1 - sim.mix.aggressive - sim.mix.calm));
function edgeName(load) {
    return load.edge.tags.name ?? `Дорога ${load.edge.wayId}`;
}
function formatTime(seconds) {
    const total = Math.floor(seconds);
    const minutes = Math.floor(total / 60);
    return `${minutes}:${String(total % 60).padStart(2, '0')}`;
}
function setDemand(event) {
    sim.demand = Number(event.target.value);
}
/** Сумма долей не должна превышать 100%: вторая доля уступает той, которую двигают сейчас. */
function setMix(key, event) {
    const value = Number(event.target.value);
    const other = key === 'aggressive' ? 'calm' : 'aggressive';
    sim.mix[key] = value;
    if (value + sim.mix[other] > 1)
        sim.mix[other] = Math.max(0, 1 - value);
}
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    __VLS_withDotValue(sim, {});
    __VLS_withDotValue(selectedSignalNode, {});
    __VLS_withDotValue(STYLE_LABELS, {});
    __VLS_withDotValue(editor, {});
    __VLS_withDotValue(totals, {});
    __VLS_withDotValue(worstLoads, {});
    __VLS_withDotValue(selectedWay, {});
    __VLS_withDotValue(selectedDirections, {});
    __VLS_withDotValue(LOS_COLORS, {});
    __VLS_withDotValue(LOS_LABELS, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['procedure']} */ ;
    /** @type {__VLS_StyleScopedClasses['procedure']} */ ;
    /** @type {__VLS_StyleScopedClasses['grid']} */ ;
    /** @type {__VLS_StyleScopedClasses['grid']} */ ;
    /** @type {__VLS_StyleScopedClasses['grid']} */ ;
    /** @type {__VLS_StyleScopedClasses['grid']} */ ;
    /** @type {__VLS_StyleScopedClasses['warn']} */ ;
    /** @type {__VLS_StyleScopedClasses['swatch']} */ ;
    /** @type {__VLS_StyleScopedClasses['row-button']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "dock-title" },
    });
    /** @type {__VLS_StyleScopedClasses['dock-title']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "section" },
    });
    /** @type {__VLS_StyleScopedClasses['section']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "segmented" },
        role: "group",
        'aria-label': "Уровень модели",
    });
    /** @type {__VLS_StyleScopedClasses['segmented']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                void $event;
                return (sim.value.setLevel('macro'));
                // @ts-ignore
                [sim,];
            } },
        ...{ class: ({ active: sim.value.level === 'macro' }) },
        'aria-pressed': (sim.value.level === 'macro'),
    });
    /** @type {__VLS_StyleScopedClasses['active']} */ ;
    let __VLS_0;
    /** @ts-ignore @type { | typeof Gauge} */
    Gauge;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
        // @ts-ignore
        size: (13), 'aria-hidden': "true",
    }));
    const __VLS_2 = __VLS_1({
        size: (13),
        'aria-hidden': "true",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                void $event;
                return (sim.value.setLevel('micro'));
                // @ts-ignore
                [sim, sim, sim,];
            } },
        ...{ class: ({ active: sim.value.level === 'micro' }) },
        'aria-pressed': (sim.value.level === 'micro'),
    });
    /** @type {__VLS_StyleScopedClasses['active']} */ ;
    let __VLS_5;
    /** @ts-ignore @type { | typeof TrafficCone} */
    TrafficCone;
    // @ts-ignore
    const __VLS_6 = __VLS_asFunctionalComponent1(__VLS_5, new __VLS_5({
        // @ts-ignore
        size: (13), 'aria-hidden': "true",
    }));
    const __VLS_7 = __VLS_6({
        size: (13),
        'aria-hidden': "true",
    }, ...__VLS_functionalComponentArgsRest(__VLS_6));
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "hint muted" },
    });
    /** @type {__VLS_StyleScopedClasses['hint']} */ ;
    /** @type {__VLS_StyleScopedClasses['muted']} */ ;
    if (sim.value.level === 'macro') {
    }
    else {
    }
    if (selectedSignalNode.value !== null) {
        const __VLS_10 = SignalSummary;
        // @ts-ignore
        const __VLS_11 = __VLS_asFunctionalComponent1(__VLS_10, new __VLS_10({
            // @ts-ignore
            key: (selectedSignalNode.value), node: (selectedSignalNode.value),
        }));
        const __VLS_12 = __VLS_11({
            key: (selectedSignalNode.value),
            node: (selectedSignalNode.value),
        }, ...__VLS_functionalComponentArgsRest(__VLS_11));
    }
    else if (sim.value.net?.signals.length) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "section" },
        });
        /** @type {__VLS_StyleScopedClasses['section']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "hint muted" },
        });
        /** @type {__VLS_StyleScopedClasses['hint']} */ ;
        /** @type {__VLS_StyleScopedClasses['muted']} */ ;
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "section" },
    });
    /** @type {__VLS_StyleScopedClasses['section']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "eyebrow" },
    });
    /** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.ol, __VLS_intrinsics.ol)({
        ...{ class: "procedure" },
    });
    /** @type {__VLS_StyleScopedClasses['procedure']} */ ;
    const __VLS_15 = __VLS_tryAsConstant((sim.value.procedure));
    for (const [step] of __VLS_vFor(__VLS_nonNull(__VLS_15))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({
            key: (step.id),
        });
        let __VLS_16;
        /** @ts-ignore @type { | typeof Check} */
        Check;
        // @ts-ignore
        const __VLS_17 = __VLS_asFunctionalComponent1(__VLS_16, new __VLS_16({
            // @ts-ignore
            size: (12), ...{ class: "done" }, 'aria-hidden': "true",
        }));
        const __VLS_18 = __VLS_17({
            size: (12),
            ...{ class: "done" },
            'aria-hidden': "true",
        }, ...__VLS_functionalComponentArgsRest(__VLS_17));
        /** @type {__VLS_StyleScopedClasses['done']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
        (step.title);
        if (step.ms !== null) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "faint ms" },
            });
            /** @type {__VLS_StyleScopedClasses['faint']} */ ;
            /** @type {__VLS_StyleScopedClasses['ms']} */ ;
            (Math.max(1, Math.round(step.ms)));
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "muted detail" },
        });
        /** @type {__VLS_StyleScopedClasses['muted']} */ ;
        /** @type {__VLS_StyleScopedClasses['detail']} */ ;
        (step.detail);
        // @ts-ignore
        [sim, sim, sim, sim, sim, selectedSignalNode, selectedSignalNode, selectedSignalNode,];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "section" },
    });
    /** @type {__VLS_StyleScopedClasses['section']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "eyebrow" },
    });
    /** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "segmented" },
        role: "group",
        'aria-label': "Период",
    });
    /** @type {__VLS_StyleScopedClasses['segmented']} */ ;
    const __VLS_21 = __VLS_tryAsConstant((__VLS_unwrap(periods, {})));
    for (const [item] of __VLS_vFor(__VLS_nonNull(__VLS_21))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    void $event;
                    return (sim.value.period = item.id);
                    // @ts-ignore
                    [sim, periods,];
                } },
            key: (item.id),
            ...{ class: ({ active: sim.value.period === item.id }) },
            'aria-pressed': (sim.value.period === item.id),
        });
        /** @type {__VLS_StyleScopedClasses['active']} */ ;
        (item.label);
        // @ts-ignore
        [sim, sim,];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
        ...{ class: "slider" },
    });
    /** @type {__VLS_StyleScopedClasses['slider']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    (Math.round(sim.value.demand * 100));
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        ...{ onChange: (setDemand) },
        type: "range",
        min: "0.2",
        max: "2",
        step: "0.1",
        value: (sim.value.demand),
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
        ...{ class: "check" },
    });
    /** @type {__VLS_StyleScopedClasses['check']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        type: "checkbox",
    });
    (sim.value.transitOn);
    (sim.value.services.length);
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
        ...{ class: "check" },
    });
    /** @type {__VLS_StyleScopedClasses['check']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        type: "checkbox",
    });
    (sim.value.guessSignals);
    if (sim.value.level === 'micro') {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "section" },
        });
        /** @type {__VLS_StyleScopedClasses['section']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "row" },
        });
        /** @type {__VLS_StyleScopedClasses['row']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (sim.value.togglePlay) },
            ...{ class: "btn primary grow" },
        });
        /** @type {__VLS_StyleScopedClasses['btn']} */ ;
        /** @type {__VLS_StyleScopedClasses['primary']} */ ;
        /** @type {__VLS_StyleScopedClasses['grow']} */ ;
        if (sim.value.running) {
            let __VLS_22;
            /** @ts-ignore @type { | typeof Pause} */
            Pause;
            // @ts-ignore
            const __VLS_23 = __VLS_asFunctionalComponent1(__VLS_22, new __VLS_22({
                // @ts-ignore
                size: (13), 'aria-hidden': "true",
            }));
            const __VLS_24 = __VLS_23({
                size: (13),
                'aria-hidden': "true",
            }, ...__VLS_functionalComponentArgsRest(__VLS_23));
        }
        else {
            let __VLS_27;
            /** @ts-ignore @type { | typeof Play} */
            Play;
            // @ts-ignore
            const __VLS_28 = __VLS_asFunctionalComponent1(__VLS_27, new __VLS_27({
                // @ts-ignore
                size: (13), 'aria-hidden': "true",
            }));
            const __VLS_29 = __VLS_28({
                size: (13),
                'aria-hidden': "true",
            }, ...__VLS_functionalComponentArgsRest(__VLS_28));
        }
        (sim.value.running ? 'Пауза' : 'Запустить');
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (sim.value.reset) },
            ...{ class: "btn" },
            'aria-label': "Начать заново",
            title: "Начать заново",
        });
        /** @type {__VLS_StyleScopedClasses['btn']} */ ;
        let __VLS_32;
        /** @ts-ignore @type { | typeof RotateCcw} */
        RotateCcw;
        // @ts-ignore
        const __VLS_33 = __VLS_asFunctionalComponent1(__VLS_32, new __VLS_32({
            // @ts-ignore
            size: (13),
        }));
        const __VLS_34 = __VLS_33({
            size: (13),
        }, ...__VLS_functionalComponentArgsRest(__VLS_33));
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    void $event;
                    if (!(sim.value.level === 'micro'))
                        throw 0;
                    return (sim.value.camera3d = !sim.value.camera3d);
                    // @ts-ignore
                    [sim, sim, sim, sim, sim, sim, sim, sim, sim, sim, sim, sim,];
                } },
            ...{ class: "btn" },
            ...{ class: ({ on: sim.value.camera3d }) },
            'aria-pressed': (sim.value.camera3d),
            title: "3D-вид",
            'aria-label': "3D-вид",
        });
        /** @type {__VLS_StyleScopedClasses['btn']} */ ;
        /** @type {__VLS_StyleScopedClasses['on']} */ ;
        let __VLS_37;
        /** @ts-ignore @type { | typeof Box} */
        Box;
        // @ts-ignore
        const __VLS_38 = __VLS_asFunctionalComponent1(__VLS_37, new __VLS_37({
            // @ts-ignore
            size: (13),
        }));
        const __VLS_39 = __VLS_38({
            size: (13),
        }, ...__VLS_functionalComponentArgsRest(__VLS_38));
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "segmented" },
            role: "group",
            'aria-label': "Скорость симуляции",
        });
        /** @type {__VLS_StyleScopedClasses['segmented']} */ ;
        const __VLS_42 = __VLS_tryAsConstant((__VLS_unwrap(speeds, {})));
        for (const [value] of __VLS_vFor(__VLS_nonNull(__VLS_42))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        void $event;
                        if (!(sim.value.level === 'micro'))
                            throw 0;
                        return (sim.value.speed = value);
                        // @ts-ignore
                        [sim, sim, sim, speeds,];
                    } },
                key: (value),
                ...{ class: ({ active: sim.value.speed === value }) },
                'aria-pressed': (sim.value.speed === value),
            });
            /** @type {__VLS_StyleScopedClasses['active']} */ ;
            (value);
            // @ts-ignore
            [sim, sim,];
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "field" },
        });
        /** @type {__VLS_StyleScopedClasses['field']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
            for: "car-color",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
            id: "car-color",
            value: (sim.value.colorMode),
            ...{ class: "input" },
        });
        /** @type {__VLS_StyleScopedClasses['input']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
            value: "fleet",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
            value: "speed",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
            value: "style",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
            ...{ class: "check" },
        });
        /** @type {__VLS_StyleScopedClasses['check']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            type: "checkbox",
        });
        (sim.value.showLoad);
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "section" },
        });
        /** @type {__VLS_StyleScopedClasses['section']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "eyebrow" },
        });
        /** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
            ...{ class: "slider" },
        });
        /** @type {__VLS_StyleScopedClasses['slider']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        (Math.round(sim.value.mix.aggressive * 100));
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            ...{ onInput: (...[$event]) => {
                    void $event;
                    if (!(sim.value.level === 'micro'))
                        throw 0;
                    return (setMix('aggressive', $event));
                    // @ts-ignore
                    [sim, sim, sim,];
                } },
            type: "range",
            min: "0",
            max: "1",
            step: "0.05",
            value: (sim.value.mix.aggressive),
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
            ...{ class: "slider" },
        });
        /** @type {__VLS_StyleScopedClasses['slider']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        (Math.round(sim.value.mix.calm * 100));
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            ...{ onInput: (...[$event]) => {
                    void $event;
                    if (!(sim.value.level === 'micro'))
                        throw 0;
                    return (setMix('calm', $event));
                    // @ts-ignore
                    [sim, sim,];
                } },
            type: "range",
            min: "0",
            max: "1",
            step: "0.05",
            value: (sim.value.mix.calm),
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "hint faint" },
        });
        /** @type {__VLS_StyleScopedClasses['hint']} */ ;
        /** @type {__VLS_StyleScopedClasses['faint']} */ ;
        (Math.round(__VLS_unwrap(normalShare, {}) * 100));
        if (sim.value.stats) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "section" },
            });
            /** @type {__VLS_StyleScopedClasses['section']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.table, __VLS_intrinsics.table)({
                ...{ class: "grid" },
            });
            /** @type {__VLS_StyleScopedClasses['grid']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.tbody, __VLS_intrinsics.tbody)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (formatTime(sim.value.stats.time));
            __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (sim.value.stats.active);
            __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (Math.round(sim.value.stats.avgSpeedKmh));
            __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (sim.value.stats.stopped);
            __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (sim.value.stats.speeding);
            __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (sim.value.stats.finished);
            __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (sim.value.stats.waitingToEnter);
            __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (sim.value.stats.buses);
            const __VLS_43 = __VLS_tryAsConstant((__VLS_unwrap(DRIVER_STYLES, {})));
            for (const [style] of __VLS_vFor(__VLS_nonNull(__VLS_43))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
                    key: (style),
                });
                __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
                (STYLE_LABELS.value[style]);
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
                (sim.value.stats.byStyle[style]);
                // @ts-ignore
                [sim, sim, sim, sim, sim, sim, sim, sim, sim, sim, sim, normalShare, DRIVER_STYLES, STYLE_LABELS,];
            }
            if (sim.value.stats.teleported > 0) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                    ...{ class: "warn" },
                });
                /** @type {__VLS_StyleScopedClasses['warn']} */ ;
                let __VLS_44;
                /** @ts-ignore @type { | typeof TriangleAlert} */
                TriangleAlert;
                // @ts-ignore
                const __VLS_45 = __VLS_asFunctionalComponent1(__VLS_44, new __VLS_44({
                    // @ts-ignore
                    size: (12), 'aria-hidden': "true",
                }));
                const __VLS_46 = __VLS_45({
                    size: (12),
                    'aria-hidden': "true",
                }, ...__VLS_functionalComponentArgsRest(__VLS_45));
                (sim.value.stats.teleported);
            }
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "section" },
        });
        /** @type {__VLS_StyleScopedClasses['section']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "eyebrow" },
        });
        /** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.table, __VLS_intrinsics.table)({
            ...{ class: "grid" },
        });
        /** @type {__VLS_StyleScopedClasses['grid']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.tbody, __VLS_intrinsics.tbody)({});
        const __VLS_49 = __VLS_tryAsConstant((__VLS_unwrap(violations, {})));
        for (const [item] of __VLS_vFor(__VLS_nonNull(__VLS_49))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
                key: (item.kind),
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
            (item.label);
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (item.count);
            // @ts-ignore
            [sim, sim, violations,];
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "section" },
        });
        /** @type {__VLS_StyleScopedClasses['section']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "eyebrow" },
        });
        /** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
        (sim.value.stats?.jams.length ?? 0);
        if (!sim.value.stats?.jams.length) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                ...{ class: "hint muted" },
            });
            /** @type {__VLS_StyleScopedClasses['hint']} */ ;
            /** @type {__VLS_StyleScopedClasses['muted']} */ ;
        }
        const __VLS_50 = __VLS_tryAsConstant((sim.value.stats?.jams.slice(0, 8) ?? []));
        for (const [jam] of __VLS_vFor(__VLS_nonNull(__VLS_50))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        void $event;
                        if (!(sim.value.level === 'micro'))
                            throw 0;
                        return (editor.value.focusWay(jam.edge.wayId));
                        // @ts-ignore
                        [sim, sim, sim, editor,];
                    } },
                key: (jam.edge.id),
                ...{ class: "row-button" },
            });
            /** @type {__VLS_StyleScopedClasses['row-button']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "ellipsis" },
            });
            /** @type {__VLS_StyleScopedClasses['ellipsis']} */ ;
            (jam.edge.tags.name ?? `Дорога ${jam.edge.wayId}`);
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "faint nums" },
            });
            /** @type {__VLS_StyleScopedClasses['faint']} */ ;
            /** @type {__VLS_StyleScopedClasses['nums']} */ ;
            (Math.round(jam.lengthM));
            (jam.cars);
            // @ts-ignore
            [];
        }
    }
    else if (totals.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "section" },
        });
        /** @type {__VLS_StyleScopedClasses['section']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "eyebrow" },
        });
        /** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "segmented" },
            role: "group",
            'aria-label': "Вид результата",
        });
        /** @type {__VLS_StyleScopedClasses['segmented']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    void $event;
                    if (!!(sim.value.level === 'micro'))
                        throw 0;
                    if (!(totals.value))
                        throw 0;
                    return (sim.value.macroView = 'bars');
                    // @ts-ignore
                    [sim, totals,];
                } },
            ...{ class: ({ active: sim.value.macroView === 'bars' }) },
            'aria-pressed': (sim.value.macroView === 'bars'),
        });
        /** @type {__VLS_StyleScopedClasses['active']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    void $event;
                    if (!!(sim.value.level === 'micro'))
                        throw 0;
                    if (!(totals.value))
                        throw 0;
                    return (sim.value.macroView = 'fill');
                    // @ts-ignore
                    [sim, sim, sim,];
                } },
            ...{ class: ({ active: sim.value.macroView === 'fill' }) },
            'aria-pressed': (sim.value.macroView === 'fill'),
        });
        /** @type {__VLS_StyleScopedClasses['active']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
            ...{ class: "check" },
        });
        /** @type {__VLS_StyleScopedClasses['check']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            type: "checkbox",
        });
        (sim.value.showDesire);
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "section" },
        });
        /** @type {__VLS_StyleScopedClasses['section']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.table, __VLS_intrinsics.table)({
            ...{ class: "grid" },
        });
        /** @type {__VLS_StyleScopedClasses['grid']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.tbody, __VLS_intrinsics.tbody)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
        (Math.round(totals.value.trips));
        __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
        (Math.round(totals.value.avgSpeedKmh));
        __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
        (Math.round(totals.value.vehKm));
        __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
        (Math.round(totals.value.delayHours));
        __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
        (totals.value.congestedKm.toFixed(1));
        (totals.value.totalKm.toFixed(1));
        if (totals.value.unservedTrips >= 1) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                ...{ class: "warn" },
            });
            /** @type {__VLS_StyleScopedClasses['warn']} */ ;
            let __VLS_51;
            /** @ts-ignore @type { | typeof TriangleAlert} */
            TriangleAlert;
            // @ts-ignore
            const __VLS_52 = __VLS_asFunctionalComponent1(__VLS_51, new __VLS_51({
                // @ts-ignore
                size: (12), 'aria-hidden': "true",
            }));
            const __VLS_53 = __VLS_52({
                size: (12),
                'aria-hidden': "true",
            }, ...__VLS_functionalComponentArgsRest(__VLS_52));
            (Math.round(totals.value.unservedTrips));
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "section" },
        });
        /** @type {__VLS_StyleScopedClasses['section']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "eyebrow" },
        });
        /** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
        const __VLS_56 = __VLS_tryAsConstant((__VLS_unwrap(losRows, {})));
        for (const [row] of __VLS_vFor(__VLS_nonNull(__VLS_56))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                key: (row.label),
                ...{ class: "los-row" },
            });
            /** @type {__VLS_StyleScopedClasses['los-row']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span)({
                ...{ class: "swatch" },
                ...{ style: ({ background: row.color }) },
                'aria-hidden': "true",
            });
            /** @type {__VLS_StyleScopedClasses['swatch']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "los-label" },
            });
            /** @type {__VLS_StyleScopedClasses['los-label']} */ ;
            (row.label);
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "muted" },
            });
            /** @type {__VLS_StyleScopedClasses['muted']} */ ;
            (row.title);
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "nums" },
            });
            /** @type {__VLS_StyleScopedClasses['nums']} */ ;
            (Math.round(row.share * 100));
            // @ts-ignore
            [sim, sim, sim, totals, totals, totals, totals, totals, totals, totals, totals, losRows,];
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "section" },
        });
        /** @type {__VLS_StyleScopedClasses['section']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "eyebrow" },
        });
        /** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
        if (worstLoads.value.length === 0) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                ...{ class: "hint muted" },
            });
            /** @type {__VLS_StyleScopedClasses['hint']} */ ;
            /** @type {__VLS_StyleScopedClasses['muted']} */ ;
        }
        const __VLS_57 = __VLS_tryAsConstant((worstLoads.value));
        for (const [load] of __VLS_vFor(__VLS_nonNull(__VLS_57))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        void $event;
                        if (!!(sim.value.level === 'micro'))
                            throw 0;
                        if (!(totals.value))
                            throw 0;
                        return (editor.value.focusWay(load.edge.wayId));
                        // @ts-ignore
                        [editor, worstLoads, worstLoads,];
                    } },
                key: (load.edge.id),
                ...{ class: "row-button" },
            });
            /** @type {__VLS_StyleScopedClasses['row-button']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "ellipsis" },
            });
            /** @type {__VLS_StyleScopedClasses['ellipsis']} */ ;
            (edgeName(load));
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "faint nums" },
            });
            /** @type {__VLS_StyleScopedClasses['faint']} */ ;
            /** @type {__VLS_StyleScopedClasses['nums']} */ ;
            (Math.round(load.vc * 100));
            // @ts-ignore
            [];
        }
    }
    if (selectedWay.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "section" },
        });
        /** @type {__VLS_StyleScopedClasses['section']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "eyebrow" },
        });
        /** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
        (selectedWay.value.tags?.name ?? `дорога ${selectedWay.value.id}`);
        if (selectedDirections.value.length === 0) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                ...{ class: "hint muted" },
            });
            /** @type {__VLS_StyleScopedClasses['hint']} */ ;
            /** @type {__VLS_StyleScopedClasses['muted']} */ ;
        }
        const __VLS_58 = __VLS_tryAsConstant((selectedDirections.value));
        for (const [direction] of __VLS_vFor(__VLS_nonNull(__VLS_58))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                key: (String(direction.forward)),
                ...{ class: "card" },
            });
            /** @type {__VLS_StyleScopedClasses['card']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "row" },
            });
            /** @type {__VLS_StyleScopedClasses['row']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
            (direction.forward ? 'По ходу дороги' : 'Встречное направление');
            __VLS_asFunctionalElement1(__VLS_intrinsics.span)({
                ...{ class: "spacer" },
            });
            /** @type {__VLS_StyleScopedClasses['spacer']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "pill" },
            });
            /** @type {__VLS_StyleScopedClasses['pill']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span)({
                ...{ class: "swatch small" },
                ...{ style: ({ background: LOS_COLORS.value[direction.worst.los] }) },
                'aria-hidden': "true",
            });
            /** @type {__VLS_StyleScopedClasses['swatch']} */ ;
            /** @type {__VLS_StyleScopedClasses['small']} */ ;
            (LOS_LABELS.value[direction.worst.los]);
            __VLS_asFunctionalElement1(__VLS_intrinsics.table, __VLS_intrinsics.table)({
                ...{ class: "grid" },
            });
            /** @type {__VLS_StyleScopedClasses['grid']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.tbody, __VLS_intrinsics.tbody)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (Math.round(direction.worst.volume));
            if (direction.worst.busesPerHour > 0) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
                __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
                (direction.worst.busesPerHour.toFixed(1));
            }
            __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (Math.round(direction.worst.capacity));
            __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (Math.round(direction.worst.vc * 100));
            __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({});
            (Math.round(direction.worst.speedKmh));
            (Math.round(direction.worst.freeSpeedKmh));
            __VLS_asFunctionalElement1(__VLS_intrinsics.details, __VLS_intrinsics.details)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.summary, __VLS_intrinsics.summary)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.ul, __VLS_intrinsics.ul)({});
            const __VLS_59 = __VLS_tryAsConstant((direction.worst.factors));
            for (const [factor] of __VLS_vFor(__VLS_nonNull(__VLS_59))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({
                    key: (factor.label),
                });
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
                (factor.label);
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
                (factor.value);
                // @ts-ignore
                [selectedWay, selectedWay, selectedWay, selectedDirections, selectedDirections, LOS_COLORS, LOS_LABELS,];
            }
            // @ts-ignore
            [];
        }
        if (sim.value.level === 'micro') {
            __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                ...{ class: "hint muted" },
            });
            /** @type {__VLS_StyleScopedClasses['hint']} */ ;
            /** @type {__VLS_StyleScopedClasses['muted']} */ ;
            (__VLS_unwrap(selectedMicroCars, {}));
        }
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "section" },
    });
    /** @type {__VLS_StyleScopedClasses['section']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                void $event;
                return (editor.value.viewMode = 'engineering');
                // @ts-ignore
                [sim, editor, selectedMicroCars,];
            } },
        ...{ class: "btn block" },
    });
    /** @type {__VLS_StyleScopedClasses['btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['block']} */ ;
    // @ts-ignore
    [];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
