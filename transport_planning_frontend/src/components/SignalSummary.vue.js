import { TrafficCone } from 'lucide-vue-next';
import { editNumber, useSignalPlan } from '@/composables/useSignalPlan';
import { formatSeconds, SIGNAL_LABELS } from '@/sim/signalView';
import { useEditor } from '@/stores/editor';
import SignalBar from './SignalBar.vue';
const { defineProps, } = {};
const props = defineProps();
const editor = useEditor();
const signal = useSignalPlan(() => props.node);
function placeSignal() {
    const node = editor.doc?.nodes.get(props.node);
    if (node)
        editor.toggleOnNode('signal', { nodeId: props.node, position: node });
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
    __VLS_withDotValue(signal, {});
    __VLS_withDotValue(editor, {});
    __VLS_withDotValue(SIGNAL_LABELS, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['state']} */ ;
    /** @type {__VLS_StyleScopedClasses['state']} */ ;
    /** @type {__VLS_StyleScopedClasses['state']} */ ;
    /** @type {__VLS_StyleScopedClasses['time']} */ ;
    /** @type {__VLS_StyleScopedClasses['time']} */ ;
    /** @type {__VLS_StyleScopedClasses['dot']} */ ;
    /** @type {__VLS_StyleScopedClasses['green']} */ ;
    /** @type {__VLS_StyleScopedClasses['dot']} */ ;
    /** @type {__VLS_StyleScopedClasses['yellow']} */ ;
    /** @type {__VLS_StyleScopedClasses['dot']} */ ;
    /** @type {__VLS_StyleScopedClasses['red']} */ ;
    if (signal.value.group.value && signal.value.plan.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "section" },
        });
        /** @type {__VLS_StyleScopedClasses['section']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "row" },
        });
        /** @type {__VLS_StyleScopedClasses['row']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "eyebrow" },
        });
        /** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
        (__VLS_unwrap(formatSeconds, {})(signal.value.cycle.value));
        __VLS_asFunctionalElement1(__VLS_intrinsics.span)({
            ...{ class: "spacer" },
        });
        /** @type {__VLS_StyleScopedClasses['spacer']} */ ;
        if (!signal.value.guessed.value) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        void $event;
                        if (!(signal.value.group.value && signal.value.plan.value))
                            throw 0;
                        if (!(!signal.value.guessed.value))
                            throw 0;
                        return (editor.value.openJunction(signal.value.group.value.owner, 'signal'));
                        // @ts-ignore
                        [signal, signal, signal, signal, signal, formatSeconds, editor,];
                    } },
                ...{ class: "btn small" },
            });
            /** @type {__VLS_StyleScopedClasses['btn']} */ ;
            /** @type {__VLS_StyleScopedClasses['small']} */ ;
        }
        if (signal.value.guessed.value) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                ...{ class: "hint muted" },
            });
            /** @type {__VLS_StyleScopedClasses['hint']} */ ;
            /** @type {__VLS_StyleScopedClasses['muted']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (placeSignal) },
                ...{ class: "btn small block" },
            });
            /** @type {__VLS_StyleScopedClasses['btn']} */ ;
            /** @type {__VLS_StyleScopedClasses['small']} */ ;
            /** @type {__VLS_StyleScopedClasses['block']} */ ;
            let __VLS_0;
            /** @ts-ignore @type { | typeof TrafficCone} */
            TrafficCone;
            // @ts-ignore
            const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
                // @ts-ignore
                size: (13), 'aria-hidden': "true",
            }));
            const __VLS_2 = __VLS_1({
                size: (13),
                'aria-hidden': "true",
            }, ...__VLS_functionalComponentArgsRest(__VLS_1));
        }
        const __VLS_5 = __VLS_tryAsConstant((signal.value.directions.value));
        for (const [direction] of __VLS_vFor(__VLS_nonNull(__VLS_5))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                key: (direction.key),
                ...{ class: "direction" },
            });
            /** @type {__VLS_StyleScopedClasses['direction']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "title" },
            });
            /** @type {__VLS_StyleScopedClasses['title']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "ellipsis" },
                title: (`${direction.title}: ${direction.kinds}`),
            });
            /** @type {__VLS_StyleScopedClasses['ellipsis']} */ ;
            (direction.title);
            if (signal.value.liveState(direction)) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                    ...{ class: "state" },
                    ...{ class: (signal.value.liveState(direction).color) },
                });
                /** @type {__VLS_StyleScopedClasses['state']} */ ;
                (SIGNAL_LABELS.value[signal.value.liveState(direction).color]);
                if (Number.isFinite(signal.value.liveState(direction).left)) {
                    (Math.ceil(signal.value.liveState(direction).left));
                }
            }
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "faint kinds ellipsis" },
            });
            /** @type {__VLS_StyleScopedClasses['faint']} */ ;
            /** @type {__VLS_StyleScopedClasses['kinds']} */ ;
            /** @type {__VLS_StyleScopedClasses['ellipsis']} */ ;
            (direction.kinds);
            const __VLS_6 = SignalBar;
            // @ts-ignore
            const __VLS_7 = __VLS_asFunctionalComponent1(__VLS_6, new __VLS_6({
                // @ts-ignore
                segments: (direction.segments), cycle: (signal.value.cycle.value), marker: (signal.value.cycleTime.value), labels: (false),
            }));
            const __VLS_8 = __VLS_7({
                segments: (direction.segments),
                cycle: (signal.value.cycle.value),
                marker: (signal.value.cycleTime.value),
                labels: (false),
            }, ...__VLS_functionalComponentArgsRest(__VLS_7));
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "times" },
            });
            /** @type {__VLS_StyleScopedClasses['times']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
                ...{ class: "time" },
            });
            /** @type {__VLS_StyleScopedClasses['time']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span)({
                ...{ class: "dot green" },
                'aria-hidden': "true",
            });
            /** @type {__VLS_StyleScopedClasses['dot']} */ ;
            /** @type {__VLS_StyleScopedClasses['green']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "sr-label" },
            });
            /** @type {__VLS_StyleScopedClasses['sr-label']} */ ;
            (direction.title);
            __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                ...{ onChange: (...[$event]) => {
                        void $event;
                        if (!(signal.value.group.value && signal.value.plan.value))
                            throw 0;
                        return (__VLS_unwrap(editNumber, {})($event, direction.times.green, (value) => signal.value.setGreenTime(direction, value)));
                        // @ts-ignore
                        [signal, signal, signal, signal, signal, signal, signal, signal, signal, signal, SIGNAL_LABELS, editNumber,];
                    } },
                ...{ class: "input" },
                type: "number",
                min: "1",
                value: (direction.times.green),
                disabled: (signal.value.guessed.value || (direction.times.red === 0 && direction.times.yellow === 0)),
            });
            /** @type {__VLS_StyleScopedClasses['input']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "time fixed" },
                title: "Жёлтый задаётся для всего светофора в окне всех фаз",
            });
            /** @type {__VLS_StyleScopedClasses['time']} */ ;
            /** @type {__VLS_StyleScopedClasses['fixed']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span)({
                ...{ class: "dot yellow" },
                'aria-hidden': "true",
            });
            /** @type {__VLS_StyleScopedClasses['dot']} */ ;
            /** @type {__VLS_StyleScopedClasses['yellow']} */ ;
            (__VLS_unwrap(formatSeconds, {})(direction.times.yellow));
            __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
                ...{ class: "time" },
            });
            /** @type {__VLS_StyleScopedClasses['time']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span)({
                ...{ class: "dot red" },
                'aria-hidden': "true",
            });
            /** @type {__VLS_StyleScopedClasses['dot']} */ ;
            /** @type {__VLS_StyleScopedClasses['red']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "sr-label" },
            });
            /** @type {__VLS_StyleScopedClasses['sr-label']} */ ;
            (direction.title);
            __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
                ...{ onChange: (...[$event]) => {
                        void $event;
                        if (!(signal.value.group.value && signal.value.plan.value))
                            throw 0;
                        return (__VLS_unwrap(editNumber, {})($event, direction.times.red, (value) => signal.value.setRedTime(direction, value)));
                        // @ts-ignore
                        [signal, signal, formatSeconds, editNumber,];
                    } },
                ...{ class: "input" },
                type: "number",
                min: "0",
                value: (direction.times.red),
                disabled: (signal.value.guessed.value || direction.phases.length >= signal.value.plan.value.phases.length),
            });
            /** @type {__VLS_StyleScopedClasses['input']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "faint unit" },
            });
            /** @type {__VLS_StyleScopedClasses['faint']} */ ;
            /** @type {__VLS_StyleScopedClasses['unit']} */ ;
            // @ts-ignore
            [signal, signal,];
        }
        if (!signal.value.guessed.value) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                ...{ class: "hint faint" },
            });
            /** @type {__VLS_StyleScopedClasses['hint']} */ ;
            /** @type {__VLS_StyleScopedClasses['faint']} */ ;
        }
    }
    // @ts-ignore
    [signal,];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({
    __typeProps: {},
});
export default {};
