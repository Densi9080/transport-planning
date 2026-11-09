import { computed } from 'vue';
import { COLORS, LOS_COLORS } from '@/map/style';
import { LOS_LABELS, LOS_TITLES } from '@/sim/macro';
import { LOS_SPEED_THRESHOLDS } from '@/sim/micro';
import { DRIVER_STYLES, STYLE_LABELS } from '@/sim/micro';
import { useEditor } from '@/stores/editor';
import { useSimulation } from '@/stores/simulation';
const editor = useEditor();
const sim = useSimulation();
const isSim = computed(() => editor.viewMode === 'sim');
const VC_HINT = ['< 35%', '35–55%', '55–75%', '75–90%', '90–100%', '> 100%'];
const rows = computed(() => LOS_LABELS.map((label, index) => {
    const low = LOS_SPEED_THRESHOLDS[index];
    const hint = sim.level === 'macro' ? VC_HINT[index] : low !== undefined ? `≥ ${Math.round(low * 100)}%` : `< ${Math.round(LOS_SPEED_THRESHOLDS.at(-1) * 100)}%`;
    return { label, title: LOS_TITLES[index], color: LOS_COLORS[index], hint };
}));
const STYLE_COLORS = { calm: '#4aa3c7', normal: '#9ea3ad', aggressive: '#db332e' };
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    __VLS_withDotValue(isSim, {});
    __VLS_withDotValue(sim, {});
    __VLS_withDotValue(STYLE_COLORS, {});
    __VLS_withDotValue(STYLE_LABELS, {});
    __VLS_withDotValue(editor, {});
    __VLS_withDotValue(COLORS, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['legend']} */ ;
    /** @type {__VLS_StyleScopedClasses['row']} */ ;
    /** @type {__VLS_StyleScopedClasses['short']} */ ;
    if (isSim.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "legend" },
            'aria-label': "Легенда",
        });
        /** @type {__VLS_StyleScopedClasses['legend']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "eyebrow" },
        });
        /** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
        (sim.value.level === 'macro' ? 'Загрузка: поток / пропускная способность' : 'Скорость от разрешённой');
        const __VLS_0 = __VLS_tryAsConstant((__VLS_unwrap(rows, {})));
        for (const [row] of __VLS_vFor(__VLS_nonNull(__VLS_0))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                key: (row.label),
                ...{ class: "row" },
            });
            /** @type {__VLS_StyleScopedClasses['row']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.i)({
                ...{ style: ({ background: row.color }) },
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.b, __VLS_intrinsics.b)({});
            (row.label);
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
            (row.title);
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "faint hint" },
            });
            /** @type {__VLS_StyleScopedClasses['faint']} */ ;
            /** @type {__VLS_StyleScopedClasses['hint']} */ ;
            (row.hint);
            // @ts-ignore
            [isSim, sim, rows,];
        }
        if (sim.value.level === 'macro' && sim.value.macroView === 'bars') {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "faint note" },
            });
            /** @type {__VLS_StyleScopedClasses['faint']} */ ;
            /** @type {__VLS_StyleScopedClasses['note']} */ ;
        }
        if (sim.value.level === 'micro' && sim.value.colorMode === 'style') {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "eyebrow gap" },
            });
            /** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
            /** @type {__VLS_StyleScopedClasses['gap']} */ ;
            const __VLS_1 = __VLS_tryAsConstant((__VLS_unwrap(DRIVER_STYLES, {})));
            for (const [style] of __VLS_vFor(__VLS_nonNull(__VLS_1))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    key: (style),
                    ...{ class: "row short" },
                });
                /** @type {__VLS_StyleScopedClasses['row']} */ ;
                /** @type {__VLS_StyleScopedClasses['short']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.i)({
                    ...{ style: ({ background: STYLE_COLORS.value[style] }) },
                });
                __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
                (STYLE_LABELS.value[style]);
                // @ts-ignore
                [sim, sim, sim, sim, DRIVER_STYLES, STYLE_COLORS, STYLE_LABELS,];
            }
        }
    }
    else if (editor.value.viewMode === 'engineering' && editor.value.layers.turnPaths) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "legend compact" },
            'aria-label': "Легенда",
        });
        /** @type {__VLS_StyleScopedClasses['legend']} */ ;
        /** @type {__VLS_StyleScopedClasses['compact']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "short" },
        });
        /** @type {__VLS_StyleScopedClasses['short']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.i)({
            ...{ style: ({ background: COLORS.value.through }) },
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "short" },
        });
        /** @type {__VLS_StyleScopedClasses['short']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.i)({
            ...{ style: ({ background: COLORS.value.left }) },
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "short" },
        });
        /** @type {__VLS_StyleScopedClasses['short']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.i)({
            ...{ style: ({ background: COLORS.value.right }) },
        });
    }
    // @ts-ignore
    [editor, editor, COLORS, COLORS, COLORS,];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
