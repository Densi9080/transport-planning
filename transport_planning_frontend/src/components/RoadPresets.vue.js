import { computed } from 'vue';
import { ROAD_PRESETS } from '@/core/presets';
import { useEditor } from '@/stores/editor';
const editor = useEditor();
const modes = [
    { id: 'polyline', label: 'Ломаная' },
    { id: 'straight', label: 'Прямая' },
    { id: 'curve', label: 'Кривая' },
];
const groups = computed(() => {
    const result = new Map();
    for (const preset of ROAD_PRESETS) {
        const list = result.get(preset.group);
        if (list)
            list.push(preset);
        else
            result.set(preset.group, [preset]);
    }
    return [...result.entries()];
});
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    __VLS_withDotValue(editor, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['card']} */ ;
    /** @type {__VLS_StyleScopedClasses['card']} */ ;
    /** @type {__VLS_StyleScopedClasses['card']} */ ;
    /** @type {__VLS_StyleScopedClasses['cut']} */ ;
    /** @type {__VLS_StyleScopedClasses['cut']} */ ;
    /** @type {__VLS_StyleScopedClasses['cut']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "section" },
    });
    /** @type {__VLS_StyleScopedClasses['section']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "field" },
    });
    /** @type {__VLS_StyleScopedClasses['field']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "segmented" },
        role: "group",
        'aria-label': "Режим ведения",
    });
    /** @type {__VLS_StyleScopedClasses['segmented']} */ ;
    const __VLS_0 = __VLS_tryAsConstant((__VLS_unwrap(modes, {})));
    for (const [mode] of __VLS_vFor(__VLS_nonNull(__VLS_0))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    void $event;
                    return (editor.value.drawMode = mode.id);
                    // @ts-ignore
                    [modes, editor,];
                } },
            key: (mode.id),
            ...{ class: ({ active: editor.value.drawMode === mode.id }) },
            'aria-pressed': (editor.value.drawMode === mode.id),
        });
        /** @type {__VLS_StyleScopedClasses['active']} */ ;
        (mode.label);
        // @ts-ignore
        [editor, editor,];
    }
    if (editor.value.drawPoints.length) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "row muted drawing" },
        });
        /** @type {__VLS_StyleScopedClasses['row']} */ ;
        /** @type {__VLS_StyleScopedClasses['muted']} */ ;
        /** @type {__VLS_StyleScopedClasses['drawing']} */ ;
        (editor.value.drawPoints.length);
        __VLS_asFunctionalElement1(__VLS_intrinsics.span)({
            ...{ class: "spacer" },
        });
        /** @type {__VLS_StyleScopedClasses['spacer']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (editor.value.finishRoad) },
            ...{ class: "btn small" },
            disabled: (editor.value.drawPoints.length < 2),
        });
        /** @type {__VLS_StyleScopedClasses['btn']} */ ;
        /** @type {__VLS_StyleScopedClasses['small']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.kbd, __VLS_intrinsics.kbd)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    void $event;
                    if (!(editor.value.drawPoints.length))
                        throw 0;
                    return (editor.value.drawPoints = []);
                    // @ts-ignore
                    [editor, editor, editor, editor, editor,];
                } },
            ...{ class: "btn small" },
        });
        /** @type {__VLS_StyleScopedClasses['btn']} */ ;
        /** @type {__VLS_StyleScopedClasses['small']} */ ;
    }
    const __VLS_1 = __VLS_tryAsConstant((__VLS_unwrap(groups, {})));
    for (const [[group, presets]] of __VLS_vFor(__VLS_nonNull(__VLS_1))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            key: (group),
            ...{ class: "section" },
        });
        /** @type {__VLS_StyleScopedClasses['section']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "eyebrow" },
        });
        /** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
        (group);
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "cards" },
        });
        /** @type {__VLS_StyleScopedClasses['cards']} */ ;
        const __VLS_2 = __VLS_tryAsConstant((presets));
        for (const [preset] of __VLS_vFor(__VLS_nonNull(__VLS_2))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        void $event;
                        return (editor.value.presetId = preset.id);
                        // @ts-ignore
                        [editor, groups,];
                    } },
                key: (preset.id),
                ...{ class: "card" },
                ...{ class: ({ active: editor.value.presetId === preset.id }) },
                'aria-pressed': (editor.value.presetId === preset.id),
            });
            /** @type {__VLS_StyleScopedClasses['card']} */ ;
            /** @type {__VLS_StyleScopedClasses['active']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "cut" },
                'aria-hidden': "true",
            });
            /** @type {__VLS_StyleScopedClasses['cut']} */ ;
            const __VLS_3 = __VLS_tryAsConstant((preset.backward));
            for (const [n] of __VLS_vFor(__VLS_nonNull(__VLS_3))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.i)({
                    key: (`b${n}`),
                    ...{ class: "back" },
                });
                /** @type {__VLS_StyleScopedClasses['back']} */ ;
                // @ts-ignore
                [editor, editor,];
            }
            if (preset.backward) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.b)({});
            }
            const __VLS_4 = __VLS_tryAsConstant((preset.forward));
            for (const [n] of __VLS_vFor(__VLS_nonNull(__VLS_4))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.i)({
                    key: (`f${n}`),
                });
                // @ts-ignore
                [];
            }
            __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
            (preset.title);
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "faint" },
            });
            /** @type {__VLS_StyleScopedClasses['faint']} */ ;
            (preset.summary);
            // @ts-ignore
            [];
        }
        // @ts-ignore
        [];
    }
    // @ts-ignore
    [];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
