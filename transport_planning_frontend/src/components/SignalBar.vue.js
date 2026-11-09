import { computed } from 'vue';
import { formatSeconds, SIGNAL_LABELS } from '@/sim/signalView';
const { defineProps, withDefaults, } = {};
const props = withDefaults(defineProps(), { marker: null, labels: true });
/** Подпись на отрезке, в который она не помещается, только мешала бы. */
const MIN_LABEL_SHARE = 0.06;
const description = computed(() => {
    const totals = new Map();
    for (const segment of props.segments)
        totals.set(segment.color, (totals.get(segment.color) ?? 0) + segment.length);
    return [...totals.entries()].map(([color, seconds]) => `${SIGNAL_LABELS[color]} ${formatSeconds(seconds)} с`).join(', ');
});
const __VLS_defaults = { marker: null, labels: true };
void __VLS_defaults;
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
    void {};
    /** @type {__VLS_StyleScopedClasses['bar']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "bar" },
        ...{ class: ({ thin: !__VLS_ctx.labels }) },
        role: "img",
        'aria-label': (__VLS_unwrap(description, {})),
        title: (__VLS_unwrap(description, {})),
    });
    /** @type {__VLS_StyleScopedClasses['bar']} */ ;
    /** @type {__VLS_StyleScopedClasses['thin']} */ ;
    const __VLS_0 = __VLS_tryAsConstant((__VLS_ctx.segments));
    for (const [segment] of __VLS_vFor(__VLS_nonNull(__VLS_0))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            key: (segment.start),
            ...{ class: "segment" },
            ...{ class: (segment.color) },
            ...{ style: ({ left: `${(segment.start / __VLS_ctx.cycle) * 100}%`, width: `${(segment.length / __VLS_ctx.cycle) * 100}%` }) },
        });
        /** @type {__VLS_StyleScopedClasses['segment']} */ ;
        if (__VLS_ctx.labels && segment.length / __VLS_ctx.cycle >= __VLS_unwrap(MIN_LABEL_SHARE, {})) {
            (__VLS_unwrap(formatSeconds, {})(segment.length));
        }
        // @ts-ignore
        [labels, labels, description, description, segments, cycle, cycle, cycle, MIN_LABEL_SHARE, formatSeconds,];
    }
    if (__VLS_ctx.marker !== null) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.span)({
            ...{ class: "marker" },
            ...{ style: ({ left: `${(__VLS_ctx.marker / __VLS_ctx.cycle) * 100}%` }) },
        });
        /** @type {__VLS_StyleScopedClasses['marker']} */ ;
    }
    // @ts-ignore
    [cycle, marker, marker,];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({
    __defaults: __VLS_defaults,
    __typeProps: {},
});
export default {};
