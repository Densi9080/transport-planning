import { AlertTriangle, Plus, RotateCcw, TrafficCone, X } from 'lucide-vue-next';
import { computed, ref } from 'vue';
import { editNumber, useSignalPlan } from '@/composables/useSignalPlan';
import { MAX_ALL_RED_S, MAX_GREEN_S, MAX_YELLOW_S, MIN_GREEN_S, phaseWindows, withGreenMoved, } from '@/core/signals';
import { approachName, formatSeconds, KIND_LABELS } from '@/sim/signalView';
import { useEditor } from '@/stores/editor';
import SignalBar from './SignalBar.vue';
const { defineProps, } = {};
const props = defineProps();
const editor = useEditor();
const signal = useSignalPlan(() => props.node);
const group = signal.group;
const plan = signal.plan;
const cycle = signal.cycle;
const directions = signal.directions;
const guessed = signal.guessed;
const rows = computed(() => {
    const current = plan.value;
    if (!group.value || !current)
        return [];
    const byKey = new Map();
    for (const connector of group.value.connectors) {
        if (byKey.has(connector.movement))
            continue;
        const toName = connector.toLane.edge.tags.name;
        byKey.set(connector.movement, {
            key: connector.movement,
            title: approachName(connector),
            detail: `${KIND_LABELS[connector.kind] ?? connector.kind}${toName ? `, на ${toName}` : ''}`,
            kind: connector.kind,
            phases: current.phases.flatMap((phase, index) => (phase.movements.includes(connector.movement) ? [index] : [])),
        });
    }
    return [...byKey.values()].sort((a, b) => a.title.localeCompare(b.title, 'ru') || a.detail.localeCompare(b.detail, 'ru'));
});
const unassigned = computed(() => rows.value.filter((row) => row.phases.length === 0));
/** Два потока, пересекающиеся на одном зелёном. Левый поворот уступает встречным, это допустимо. */
const conflicts = computed(() => {
    const current = plan.value;
    if (!group.value || !current)
        return [];
    const found = new Map();
    for (const connector of group.value.connectors) {
        if (connector.kind === 'left')
            continue;
        for (const conflict of connector.conflicts) {
            const other = conflict.other;
            if (other.kind === 'left' || other.fromLane.edge === connector.fromLane.edge)
                continue;
            const shared = current.phases.some((phase) => phase.movements.includes(connector.movement) && phase.movements.includes(other.movement));
            if (!shared)
                continue;
            const pair = [connector.movement, other.movement].sort().join('|');
            if (!found.has(pair)) {
                found.set(pair, `${approachName(connector)} ${KIND_LABELS[connector.kind]} и ${approachName(other)} ${KIND_LABELS[other.kind]}`);
            }
        }
    }
    return [...found.values()];
});
function clonePlan() {
    const current = plan.value;
    return { ...current, phases: current.phases.map((phase) => ({ green: phase.green, movements: [...phase.movements] })) };
}
function toggle(row, index) {
    const next = clonePlan();
    const phase = next.phases[index];
    if (phase.movements.includes(row.key))
        phase.movements = phase.movements.filter((key) => key !== row.key);
    else
        phase.movements.push(row.key);
    signal.commit(next, 'Состав фазы');
}
function addPhase() {
    const next = clonePlan();
    next.phases.push({ green: 15, movements: [] });
    signal.commit(next, 'Новая фаза');
}
function removePhase(index) {
    const next = clonePlan();
    if (next.phases.length <= 1)
        return;
    next.phases.splice(index, 1);
    signal.commit(next, 'Удаление фазы');
}
function placeSignal() {
    const node = editor.doc?.nodes.get(props.node);
    if (node)
        editor.toggleOnNode('signal', { nodeId: props.node, position: node });
}
const windows = computed(() => (plan.value ? phaseWindows(plan.value) : []));
const ticks = computed(() => {
    const step = cycle.value > 160 ? 20 : 10;
    const list = [];
    for (let t = 0; t < cycle.value; t += step)
        list.push(t);
    return list;
});
const strip = ref(null);
let drag = null;
/** Граница передаёт секунды от следующей фазы к предыдущей: шкала не плывёт, а цикл остаётся прежним. */
function startDrag(index, event) {
    if (!strip.value || !plan.value || guessed.value)
        return;
    drag = { index, startX: event.clientX, width: strip.value.clientWidth, cycle: cycle.value, base: plan.value };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
}
function moveDrag(event) {
    if (!drag)
        return;
    const seconds = ((event.clientX - drag.startX) / drag.width) * drag.cycle;
    signal.preview.value = withGreenMoved(drag.base, drag.index + 1, drag.index, seconds);
}
function endDrag() {
    if (!drag)
        return;
    drag = null;
    const next = signal.preview.value;
    if (next)
        signal.commit(next, 'Граница фаз');
}
function cancelDrag() {
    drag = null;
    signal.preview.value = null;
}
function nudge(index, event) {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (step === 0 || !plan.value || guessed.value)
        return;
    event.preventDefault();
    signal.commit(withGreenMoved(plan.value, index + 1, index, step), 'Граница фаз');
}
const __VLS_ctx = {
    ...{},
    ...{},
    ...{},
};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    __VLS_withDotValue(group, {});
    __VLS_withDotValue(plan, {});
    __VLS_withDotValue(guessed, {});
    __VLS_withDotValue(signal, {});
    __VLS_withDotValue(windows, {});
    __VLS_withDotValue(unassigned, {});
    __VLS_withDotValue(conflicts, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['empty']} */ ;
    /** @type {__VLS_StyleScopedClasses['bare']} */ ;
    /** @type {__VLS_StyleScopedClasses['common']} */ ;
    /** @type {__VLS_StyleScopedClasses['legend']} */ ;
    /** @type {__VLS_StyleScopedClasses['legend']} */ ;
    /** @type {__VLS_StyleScopedClasses['legend']} */ ;
    /** @type {__VLS_StyleScopedClasses['legend']} */ ;
    /** @type {__VLS_StyleScopedClasses['left']} */ ;
    /** @type {__VLS_StyleScopedClasses['num']} */ ;
    /** @type {__VLS_StyleScopedClasses['name']} */ ;
    /** @type {__VLS_StyleScopedClasses['kinds']} */ ;
    /** @type {__VLS_StyleScopedClasses['handle']} */ ;
    /** @type {__VLS_StyleScopedClasses['handle']} */ ;
    /** @type {__VLS_StyleScopedClasses['handle']} */ ;
    /** @type {__VLS_StyleScopedClasses['handle']} */ ;
    /** @type {__VLS_StyleScopedClasses['bare']} */ ;
    /** @type {__VLS_StyleScopedClasses['handle']} */ ;
    /** @type {__VLS_StyleScopedClasses['ruler']} */ ;
    /** @type {__VLS_StyleScopedClasses['ruler']} */ ;
    /** @type {__VLS_StyleScopedClasses['remove']} */ ;
    /** @type {__VLS_StyleScopedClasses['green']} */ ;
    /** @type {__VLS_StyleScopedClasses['axis']} */ ;
    /** @type {__VLS_StyleScopedClasses['left']} */ ;
    /** @type {__VLS_StyleScopedClasses['title']} */ ;
    /** @type {__VLS_StyleScopedClasses['warn']} */ ;
    if (!group.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "empty" },
        });
        /** @type {__VLS_StyleScopedClasses['empty']} */ ;
        let __VLS_0;
        /** @ts-ignore @type { | typeof TrafficCone} */
        TrafficCone;
        // @ts-ignore
        const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
            // @ts-ignore
            size: (24), ...{ class: "faint" }, 'aria-hidden': "true",
        }));
        const __VLS_2 = __VLS_1({
            size: (24),
            ...{ class: "faint" },
            'aria-hidden': "true",
        }, ...__VLS_functionalComponentArgsRest(__VLS_1));
        /** @type {__VLS_StyleScopedClasses['faint']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "muted" },
        });
        /** @type {__VLS_StyleScopedClasses['muted']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (placeSignal) },
            ...{ class: "btn primary" },
        });
        /** @type {__VLS_StyleScopedClasses['btn']} */ ;
        /** @type {__VLS_StyleScopedClasses['primary']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "faint note" },
        });
        /** @type {__VLS_StyleScopedClasses['faint']} */ ;
        /** @type {__VLS_StyleScopedClasses['note']} */ ;
    }
    else if (plan.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "plan" },
        });
        /** @type {__VLS_StyleScopedClasses['plan']} */ ;
        if (guessed.value) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "warn" },
            });
            /** @type {__VLS_StyleScopedClasses['warn']} */ ;
            let __VLS_5;
            /** @ts-ignore @type { | typeof AlertTriangle} */
            AlertTriangle;
            // @ts-ignore
            const __VLS_6 = __VLS_asFunctionalComponent1(__VLS_5, new __VLS_5({
                // @ts-ignore
                size: (13), 'aria-hidden': "true",
            }));
            const __VLS_7 = __VLS_6({
                size: (13),
                'aria-hidden': "true",
            }, ...__VLS_functionalComponentArgsRest(__VLS_6));
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
            __VLS_asFunctionalElement1(__VLS_intrinsics.span)({
                ...{ class: "spacer" },
            });
            /** @type {__VLS_StyleScopedClasses['spacer']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (placeSignal) },
                ...{ class: "btn small" },
            });
            /** @type {__VLS_StyleScopedClasses['btn']} */ ;
            /** @type {__VLS_StyleScopedClasses['small']} */ ;
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.fieldset, __VLS_intrinsics.fieldset)({
            ...{ class: "bare" },
            disabled: (guessed.value),
        });
        /** @type {__VLS_StyleScopedClasses['bare']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "common" },
        });
        /** @type {__VLS_StyleScopedClasses['common']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "field" },
        });
        /** @type {__VLS_StyleScopedClasses['field']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
            for: "sig-cycle",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            ...{ onChange: (...[$event]) => {
                    void $event;
                    if (!!(!group.value))
                        throw 0;
                    if (!(plan.value))
                        throw 0;
                    return (__VLS_unwrap(editNumber, {})($event, __VLS_unwrap(cycle, {}), signal.value.setCycle));
                    // @ts-ignore
                    [group, plan, guessed, guessed, editNumber, cycle, signal,];
                } },
            id: "sig-cycle",
            ...{ class: "input" },
            type: "number",
            min: "1",
            value: (__VLS_unwrap(cycle, {})),
        });
        /** @type {__VLS_StyleScopedClasses['input']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "field" },
        });
        /** @type {__VLS_StyleScopedClasses['field']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
            for: "sig-offset",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            ...{ onChange: (...[$event]) => {
                    void $event;
                    if (!!(!group.value))
                        throw 0;
                    if (!(plan.value))
                        throw 0;
                    return (__VLS_unwrap(editNumber, {})($event, plan.value.offset, (value) => signal.value.setCommon('offset', value)));
                    // @ts-ignore
                    [plan, editNumber, cycle, signal,];
                } },
            id: "sig-offset",
            ...{ class: "input" },
            type: "number",
            min: "0",
            value: (plan.value.offset),
        });
        /** @type {__VLS_StyleScopedClasses['input']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "field" },
        });
        /** @type {__VLS_StyleScopedClasses['field']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
            for: "sig-yellow",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            ...{ onChange: (...[$event]) => {
                    void $event;
                    if (!!(!group.value))
                        throw 0;
                    if (!(plan.value))
                        throw 0;
                    return (__VLS_unwrap(editNumber, {})($event, plan.value.yellow, (value) => signal.value.setCommon('yellow', value)));
                    // @ts-ignore
                    [plan, plan, editNumber, signal,];
                } },
            id: "sig-yellow",
            ...{ class: "input" },
            type: "number",
            min: "0",
            max: (__VLS_unwrap(MAX_YELLOW_S, {})),
            step: "0.5",
            value: (plan.value.yellow),
        });
        /** @type {__VLS_StyleScopedClasses['input']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "field" },
        });
        /** @type {__VLS_StyleScopedClasses['field']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
            for: "sig-allred",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            ...{ onChange: (...[$event]) => {
                    void $event;
                    if (!!(!group.value))
                        throw 0;
                    if (!(plan.value))
                        throw 0;
                    return (__VLS_unwrap(editNumber, {})($event, plan.value.allRed, (value) => signal.value.setCommon('allRed', value)));
                    // @ts-ignore
                    [plan, plan, editNumber, signal, MAX_YELLOW_S,];
                } },
            id: "sig-allred",
            ...{ class: "input" },
            type: "number",
            min: "0",
            max: (__VLS_unwrap(MAX_ALL_RED_S, {})),
            step: "0.5",
            value: (plan.value.allRed),
        });
        /** @type {__VLS_StyleScopedClasses['input']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span)({
            ...{ class: "spacer" },
        });
        /** @type {__VLS_StyleScopedClasses['spacer']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (addPhase) },
            ...{ class: "btn" },
        });
        /** @type {__VLS_StyleScopedClasses['btn']} */ ;
        let __VLS_10;
        /** @ts-ignore @type { | typeof Plus} */
        Plus;
        // @ts-ignore
        const __VLS_11 = __VLS_asFunctionalComponent1(__VLS_10, new __VLS_10({
            // @ts-ignore
            size: (13), 'aria-hidden': "true",
        }));
        const __VLS_12 = __VLS_11({
            size: (13),
            'aria-hidden': "true",
        }, ...__VLS_functionalComponentArgsRest(__VLS_11));
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (signal.value.resetToAuto) },
            ...{ class: "btn" },
            disabled: (!group.value.custom),
        });
        /** @type {__VLS_StyleScopedClasses['btn']} */ ;
        let __VLS_15;
        /** @ts-ignore @type { | typeof RotateCcw} */
        RotateCcw;
        // @ts-ignore
        const __VLS_16 = __VLS_asFunctionalComponent1(__VLS_15, new __VLS_15({
            // @ts-ignore
            size: (13), 'aria-hidden': "true",
        }));
        const __VLS_17 = __VLS_16({
            size: (13),
            'aria-hidden': "true",
        }, ...__VLS_functionalComponentArgsRest(__VLS_16));
        if (signal.value.notice.value) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                ...{ class: "note limit" },
                role: "status",
            });
            /** @type {__VLS_StyleScopedClasses['note']} */ ;
            /** @type {__VLS_StyleScopedClasses['limit']} */ ;
            (signal.value.notice.value);
        }
        else if (!guessed.value) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                ...{ class: "muted note" },
            });
            /** @type {__VLS_StyleScopedClasses['muted']} */ ;
            /** @type {__VLS_StyleScopedClasses['note']} */ ;
            (group.value.custom ? 'Действует ваш план. Вернуть автоматический можно кнопкой «Автоплан».' : 'Сейчас действует автоматический план. Любая правка сохранит его как ваш.');
        }
        if (group.value.nodes.length > 1) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                ...{ class: "muted note" },
            });
            /** @type {__VLS_StyleScopedClasses['muted']} */ ;
            /** @type {__VLS_StyleScopedClasses['note']} */ ;
            (group.value.nodes.length);
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
            'aria-labelledby': "sig-times",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "section-head" },
        });
        /** @type {__VLS_StyleScopedClasses['section-head']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.h3, __VLS_intrinsics.h3)({
            id: "sig-times",
            ...{ class: "eyebrow" },
        });
        /** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span)({
            ...{ class: "spacer" },
        });
        /** @type {__VLS_StyleScopedClasses['spacer']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "legend" },
        });
        /** @type {__VLS_StyleScopedClasses['legend']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.i)({
            ...{ class: "green" },
        });
        /** @type {__VLS_StyleScopedClasses['green']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "legend" },
        });
        /** @type {__VLS_StyleScopedClasses['legend']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.i)({
            ...{ class: "yellow" },
        });
        /** @type {__VLS_StyleScopedClasses['yellow']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "legend" },
        });
        /** @type {__VLS_StyleScopedClasses['legend']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.i)({
            ...{ class: "red" },
        });
        /** @type {__VLS_StyleScopedClasses['red']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "table-wrap" },
        });
        /** @type {__VLS_StyleScopedClasses['table-wrap']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.table, __VLS_intrinsics.table)({
            ...{ class: "times" },
        });
        /** @type {__VLS_StyleScopedClasses['times']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.thead, __VLS_intrinsics.thead)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
            ...{ class: "left" },
        });
        /** @type {__VLS_StyleScopedClasses['left']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
            ...{ class: "left" },
        });
        /** @type {__VLS_StyleScopedClasses['left']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
            ...{ class: "num" },
        });
        /** @type {__VLS_StyleScopedClasses['num']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
            ...{ class: "num" },
        });
        /** @type {__VLS_StyleScopedClasses['num']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
            ...{ class: "num" },
        });
        /** @type {__VLS_StyleScopedClasses['num']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
            ...{ class: "num" },
            title: "Доля зелёного в цикле",
        });
        /** @type {__VLS_StyleScopedClasses['num']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
            ...{ class: "left graph-head" },
        });
        /** @type {__VLS_StyleScopedClasses['left']} */ ;
        /** @type {__VLS_StyleScopedClasses['graph-head']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ref: "strip",
            ...{ class: "strip" },
            'aria-label': "Фазы светофора",
        });
        /** @type {__VLS_StyleScopedClasses['strip']} */ ;
        const __VLS_20 = __VLS_tryAsConstant((windows.value));
        for (const [window, index] of __VLS_vFor(__VLS_nonNull(__VLS_20))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.template)({
                key: (index),
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "phase" },
                ...{ style: ({ left: `${(window.start / __VLS_unwrap(cycle, {})) * 100}%`, width: `${(window.length / __VLS_unwrap(cycle, {})) * 100}%` }) },
                title: (`Фаза ${index + 1}: зелёный ${window.green} с`),
            });
            /** @type {__VLS_StyleScopedClasses['phase']} */ ;
            (index + 1);
            (window.green);
            if (index < windows.value.length - 1) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.span)({
                    ...{ onPointerdown: (...[$event]) => {
                            void $event;
                            if (!!(!group.value))
                                throw 0;
                            if (!(plan.value))
                                throw 0;
                            if (!(index < windows.value.length - 1))
                                throw 0;
                            return (startDrag(index, $event));
                            // @ts-ignore
                            [group, group, group, group, plan, guessed, cycle, cycle, signal, signal, signal, MAX_ALL_RED_S, windows, windows,];
                        } },
                    ...{ onPointermove: (moveDrag) },
                    ...{ onPointerup: (endDrag) },
                    ...{ onPointercancel: (cancelDrag) },
                    ...{ onKeydown: (...[$event]) => {
                            void $event;
                            if (!!(!group.value))
                                throw 0;
                            if (!(plan.value))
                                throw 0;
                            if (!(index < windows.value.length - 1))
                                throw 0;
                            return (nudge(index, $event));
                            // @ts-ignore
                            [];
                        } },
                    ...{ class: "handle" },
                    role: "slider",
                    tabindex: "0",
                    'aria-label': (`Граница фаз ${index + 1} и ${index + 2}`),
                    'aria-valuenow': (window.green),
                    'aria-valuemin': (__VLS_unwrap(MIN_GREEN_S, {})),
                    'aria-valuemax': (__VLS_unwrap(MAX_GREEN_S, {})),
                    title: "Тяните, чтобы передать секунды зелёного соседней фазе. Цикл не изменится",
                    ...{ style: ({ left: `${((window.start + window.length) / __VLS_unwrap(cycle, {})) * 100}%` }) },
                });
                /** @type {__VLS_StyleScopedClasses['handle']} */ ;
            }
            // @ts-ignore
            [cycle, MIN_GREEN_S, MAX_GREEN_S,];
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.tbody, __VLS_intrinsics.tbody)({});
        const __VLS_21 = __VLS_tryAsConstant((__VLS_unwrap(directions, {})));
        for (const [direction] of __VLS_vFor(__VLS_nonNull(__VLS_21))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
                key: (direction.key),
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                ...{ class: "left name" },
            });
            /** @type {__VLS_StyleScopedClasses['left']} */ ;
            /** @type {__VLS_StyleScopedClasses['name']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "ellipsis" },
                title: (direction.title),
            });
            /** @type {__VLS_StyleScopedClasses['ellipsis']} */ ;
            (direction.title);
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                ...{ class: "left kinds" },
            });
            /** @type {__VLS_StyleScopedClasses['left']} */ ;
            /** @type {__VLS_StyleScopedClasses['kinds']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "ellipsis" },
                title: (direction.kinds),
            });
            /** @type {__VLS_StyleScopedClasses['ellipsis']} */ ;
            (direction.kinds);
            if (direction.unassigned) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    ...{ class: "lost-note" },
                    title: "Манёвра нет ни в одной фазе: зелёный ему назначила модель",
                });
                /** @type {__VLS_StyleScopedClasses['lost-note']} */ ;
            }
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                ...{ class: "num" },
            });
            /** @type {__VLS_StyleScopedClasses['num']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                ...{ onChange: (...[$event]) => {
                        void $event;
                        if (!!(!group.value))
                            throw 0;
                        if (!(plan.value))
                            throw 0;
                        return (__VLS_unwrap(editNumber, {})($event, direction.times.green, (value) => signal.value.setGreenTime(direction, value)));
                        // @ts-ignore
                        [editNumber, signal, directions,];
                    } },
                ...{ class: "input time" },
                type: "number",
                min: "1",
                'aria-label': (`Зелёный, секунд: ${direction.title}, ${direction.kinds}`),
                value: (direction.times.green),
                disabled: (direction.times.red === 0 && direction.times.yellow === 0),
            });
            /** @type {__VLS_StyleScopedClasses['input']} */ ;
            /** @type {__VLS_StyleScopedClasses['time']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                ...{ class: "num value" },
            });
            /** @type {__VLS_StyleScopedClasses['num']} */ ;
            /** @type {__VLS_StyleScopedClasses['value']} */ ;
            (__VLS_unwrap(formatSeconds, {})(direction.times.yellow));
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                ...{ class: "num" },
            });
            /** @type {__VLS_StyleScopedClasses['num']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                ...{ onChange: (...[$event]) => {
                        void $event;
                        if (!!(!group.value))
                            throw 0;
                        if (!(plan.value))
                            throw 0;
                        return (__VLS_unwrap(editNumber, {})($event, direction.times.red, (value) => signal.value.setRedTime(direction, value)));
                        // @ts-ignore
                        [editNumber, signal, formatSeconds,];
                    } },
                ...{ class: "input time" },
                type: "number",
                min: "0",
                'aria-label': (`Красный, секунд: ${direction.title}, ${direction.kinds}`),
                value: (direction.times.red),
                disabled: (direction.phases.length >= plan.value.phases.length),
            });
            /** @type {__VLS_StyleScopedClasses['input']} */ ;
            /** @type {__VLS_StyleScopedClasses['time']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                ...{ class: "num value" },
            });
            /** @type {__VLS_StyleScopedClasses['num']} */ ;
            /** @type {__VLS_StyleScopedClasses['value']} */ ;
            (Math.round((direction.times.green / __VLS_unwrap(cycle, {})) * 100));
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                ...{ class: "graph" },
            });
            /** @type {__VLS_StyleScopedClasses['graph']} */ ;
            const __VLS_22 = SignalBar;
            // @ts-ignore
            const __VLS_23 = __VLS_asFunctionalComponent1(__VLS_22, new __VLS_22({
                // @ts-ignore
                segments: (direction.segments), cycle: (__VLS_unwrap(cycle, {})), marker: (signal.value.cycleTime.value),
            }));
            const __VLS_24 = __VLS_23({
                segments: (direction.segments),
                cycle: (__VLS_unwrap(cycle, {})),
                marker: (signal.value.cycleTime.value),
            }, ...__VLS_functionalComponentArgsRest(__VLS_23));
            // @ts-ignore
            [plan, cycle, cycle, signal,];
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
            ...{ class: "axis" },
        });
        /** @type {__VLS_StyleScopedClasses['axis']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
            colspan: "6",
            ...{ class: "faint left axis-note" },
        });
        /** @type {__VLS_StyleScopedClasses['faint']} */ ;
        /** @type {__VLS_StyleScopedClasses['left']} */ ;
        /** @type {__VLS_StyleScopedClasses['axis-note']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
            ...{ class: "graph" },
        });
        /** @type {__VLS_StyleScopedClasses['graph']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "ruler" },
            'aria-hidden': "true",
        });
        /** @type {__VLS_StyleScopedClasses['ruler']} */ ;
        const __VLS_27 = __VLS_tryAsConstant((__VLS_unwrap(ticks, {})));
        for (const [tick] of __VLS_vFor(__VLS_nonNull(__VLS_27))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                key: (tick),
                ...{ style: ({ left: `${(tick / __VLS_unwrap(cycle, {})) * 100}%` }) },
            });
            (tick);
            // @ts-ignore
            [cycle, ticks,];
        }
        if (unassigned.value.length) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "warn" },
            });
            /** @type {__VLS_StyleScopedClasses['warn']} */ ;
            let __VLS_28;
            /** @ts-ignore @type { | typeof AlertTriangle} */
            AlertTriangle;
            // @ts-ignore
            const __VLS_29 = __VLS_asFunctionalComponent1(__VLS_28, new __VLS_28({
                // @ts-ignore
                size: (13), 'aria-hidden': "true",
            }));
            const __VLS_30 = __VLS_29({
                size: (13),
                'aria-hidden': "true",
            }, ...__VLS_functionalComponentArgsRest(__VLS_29));
            (unassigned.value.length);
        }
        if (conflicts.value.length) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "warn" },
            });
            /** @type {__VLS_StyleScopedClasses['warn']} */ ;
            let __VLS_33;
            /** @ts-ignore @type { | typeof AlertTriangle} */
            AlertTriangle;
            // @ts-ignore
            const __VLS_34 = __VLS_asFunctionalComponent1(__VLS_33, new __VLS_33({
                // @ts-ignore
                size: (13), 'aria-hidden': "true",
            }));
            const __VLS_35 = __VLS_34({
                size: (13),
                'aria-hidden': "true",
            }, ...__VLS_functionalComponentArgsRest(__VLS_34));
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
            (conflicts.value.length);
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "faint" },
            });
            /** @type {__VLS_StyleScopedClasses['faint']} */ ;
            (conflicts.value.slice(0, 2).join('; '));
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
            'aria-labelledby': "sig-phases",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.h3, __VLS_intrinsics.h3)({
            id: "sig-phases",
            ...{ class: "eyebrow" },
        });
        /** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "table-wrap matrix" },
        });
        /** @type {__VLS_StyleScopedClasses['table-wrap']} */ ;
        /** @type {__VLS_StyleScopedClasses['matrix']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.table, __VLS_intrinsics.table)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.thead, __VLS_intrinsics.thead)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
            ...{ class: "left" },
        });
        /** @type {__VLS_StyleScopedClasses['left']} */ ;
        const __VLS_38 = __VLS_tryAsConstant((plan.value.phases));
        for (const [phase, index] of __VLS_vFor(__VLS_nonNull(__VLS_38))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.th, __VLS_intrinsics.th)({
                key: (index),
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "phase-head" },
            });
            /** @type {__VLS_StyleScopedClasses['phase-head']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
            (index + 1);
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        void $event;
                        if (!!(!group.value))
                            throw 0;
                        if (!(plan.value))
                            throw 0;
                        return (removePhase(index));
                        // @ts-ignore
                        [plan, unassigned, unassigned, conflicts, conflicts, conflicts,];
                    } },
                ...{ class: "remove" },
                disabled: (plan.value.phases.length <= 1),
                'aria-label': (`Удалить фазу ${index + 1}`),
            });
            /** @type {__VLS_StyleScopedClasses['remove']} */ ;
            let __VLS_39;
            /** @ts-ignore @type { | typeof X} */
            X;
            // @ts-ignore
            const __VLS_40 = __VLS_asFunctionalComponent1(__VLS_39, new __VLS_39({
                // @ts-ignore
                size: (11),
            }));
            const __VLS_41 = __VLS_40({
                size: (11),
            }, ...__VLS_functionalComponentArgsRest(__VLS_40));
            __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                ...{ onChange: (...[$event]) => {
                        void $event;
                        if (!!(!group.value))
                            throw 0;
                        if (!(plan.value))
                            throw 0;
                        return (__VLS_unwrap(editNumber, {})($event, phase.green, (value) => signal.value.setPhaseGreen(index, value)));
                        // @ts-ignore
                        [plan, editNumber, signal,];
                    } },
                ...{ class: "input green" },
                type: "number",
                min: (__VLS_unwrap(MIN_GREEN_S, {})),
                max: (__VLS_unwrap(MAX_GREEN_S, {})),
                value: (phase.green),
                'aria-label': (`Зелёный фазы ${index + 1}, секунд`),
            });
            /** @type {__VLS_StyleScopedClasses['input']} */ ;
            /** @type {__VLS_StyleScopedClasses['green']} */ ;
            // @ts-ignore
            [MIN_GREEN_S, MAX_GREEN_S,];
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.tbody, __VLS_intrinsics.tbody)({});
        const __VLS_44 = __VLS_tryAsConstant((__VLS_unwrap(rows, {})));
        for (const [row] of __VLS_vFor(__VLS_nonNull(__VLS_44))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.tr, __VLS_intrinsics.tr)({
                key: (row.key),
                ...{ class: ({ lost: row.phases.length === 0 }) },
            });
            /** @type {__VLS_StyleScopedClasses['lost']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                ...{ class: "left" },
            });
            /** @type {__VLS_StyleScopedClasses['left']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "movement" },
            });
            /** @type {__VLS_StyleScopedClasses['movement']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "ellipsis title" },
            });
            /** @type {__VLS_StyleScopedClasses['ellipsis']} */ ;
            /** @type {__VLS_StyleScopedClasses['title']} */ ;
            (row.title);
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "faint ellipsis detail" },
            });
            /** @type {__VLS_StyleScopedClasses['faint']} */ ;
            /** @type {__VLS_StyleScopedClasses['ellipsis']} */ ;
            /** @type {__VLS_StyleScopedClasses['detail']} */ ;
            (row.detail);
            const __VLS_45 = __VLS_tryAsConstant((plan.value.phases));
            for (const [_, index] of __VLS_vFor(__VLS_nonNull(__VLS_45))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.td, __VLS_intrinsics.td)({
                    key: (index),
                    ...{ class: "cell" },
                });
                /** @type {__VLS_StyleScopedClasses['cell']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                    ...{ onChange: (...[$event]) => {
                            void $event;
                            if (!!(!group.value))
                                throw 0;
                            if (!(plan.value))
                                throw 0;
                            return (toggle(row, index));
                            // @ts-ignore
                            [plan, rows,];
                        } },
                    type: "checkbox",
                    checked: (row.phases.includes(index)),
                    'aria-label': (`${row.title}, ${row.detail}, фаза ${index + 1}`),
                });
                // @ts-ignore
                [];
            }
            // @ts-ignore
            [];
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "faint note" },
        });
        /** @type {__VLS_StyleScopedClasses['faint']} */ ;
        /** @type {__VLS_StyleScopedClasses['note']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.code, __VLS_intrinsics.code)({});
    }
    // @ts-ignore
    [];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({
    __typeProps: {},
});
export default {};
