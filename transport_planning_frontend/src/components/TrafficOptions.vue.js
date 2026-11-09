import { BUMP_KINDS, SECTION_SPEEDS } from '@/core/traffic';
import { useEditor } from '@/stores/editor';
const editor = useEditor();
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    __VLS_withDotValue(editor, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['options']} */ ;
    /** @type {__VLS_StyleScopedClasses['options']} */ ;
    if (editor.value.tool === 'speed' || editor.value.tool === 'bump' || editor.value.tool === 'sign') {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "options panel" },
        });
        /** @type {__VLS_StyleScopedClasses['options']} */ ;
        /** @type {__VLS_StyleScopedClasses['panel']} */ ;
        if (editor.value.tool === 'speed') {
            __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
                for: "section-speed",
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
                id: "section-speed",
                value: (editor.value.trafficOptions.sectionSpeed),
                ...{ class: "input" },
            });
            /** @type {__VLS_StyleScopedClasses['input']} */ ;
            const __VLS_0 = __VLS_tryAsConstant((__VLS_unwrap(SECTION_SPEEDS, {})));
            for (const [speed] of __VLS_vFor(__VLS_nonNull(__VLS_0))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
                    key: (speed),
                    value: (speed),
                });
                (speed);
                // @ts-ignore
                [editor, editor, editor, editor, editor, SECTION_SPEEDS,];
            }
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "state" },
            });
            /** @type {__VLS_StyleScopedClasses['state']} */ ;
            (editor.value.speedStart ? 'Теперь конец участка' : 'Клик: начало участка');
        }
        else if (editor.value.tool === 'bump') {
            __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
                for: "bump-kind",
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
                id: "bump-kind",
                value: (editor.value.trafficOptions.bumpKind),
                ...{ class: "input" },
            });
            /** @type {__VLS_StyleScopedClasses['input']} */ ;
            const __VLS_1 = __VLS_tryAsConstant((__VLS_unwrap(BUMP_KINDS, {})));
            for (const [kind] of __VLS_vFor(__VLS_nonNull(__VLS_1))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
                    key: (kind.value),
                    value: (kind.value),
                });
                (kind.label);
                // @ts-ignore
                [editor, editor, editor, BUMP_KINDS,];
            }
            __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
                for: "bump-speed",
            });
            __VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
                id: "bump-speed",
                value: (editor.value.trafficOptions.bumpSpeed),
                ...{ class: "input" },
            });
            /** @type {__VLS_StyleScopedClasses['input']} */ ;
            const __VLS_2 = __VLS_tryAsConstant((__VLS_unwrap(SECTION_SPEEDS, {})));
            for (const [speed] of __VLS_vFor(__VLS_nonNull(__VLS_2))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
                    key: (speed),
                    value: (speed),
                });
                (speed);
                // @ts-ignore
                [editor, SECTION_SPEEDS,];
            }
        }
        else {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "segmented" },
                role: "group",
                'aria-label': "Знак приоритета",
            });
            /** @type {__VLS_StyleScopedClasses['segmented']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        void $event;
                        if (!(editor.value.tool === 'speed' || editor.value.tool === 'bump' || editor.value.tool === 'sign'))
                            throw 0;
                        if (!!(editor.value.tool === 'speed'))
                            throw 0;
                        if (!!(editor.value.tool === 'bump'))
                            throw 0;
                        return (editor.value.trafficOptions.signKind = 'give_way');
                        // @ts-ignore
                        [editor,];
                    } },
                ...{ class: ({ active: editor.value.trafficOptions.signKind === 'give_way' }) },
                'aria-pressed': (editor.value.trafficOptions.signKind === 'give_way'),
            });
            /** @type {__VLS_StyleScopedClasses['active']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        void $event;
                        if (!(editor.value.tool === 'speed' || editor.value.tool === 'bump' || editor.value.tool === 'sign'))
                            throw 0;
                        if (!!(editor.value.tool === 'speed'))
                            throw 0;
                        if (!!(editor.value.tool === 'bump'))
                            throw 0;
                        return (editor.value.trafficOptions.signKind = 'stop');
                        // @ts-ignore
                        [editor, editor, editor,];
                    } },
                ...{ class: ({ active: editor.value.trafficOptions.signKind === 'stop' }) },
                'aria-pressed': (editor.value.trafficOptions.signKind === 'stop'),
            });
            /** @type {__VLS_StyleScopedClasses['active']} */ ;
        }
    }
    // @ts-ignore
    [editor, editor,];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
