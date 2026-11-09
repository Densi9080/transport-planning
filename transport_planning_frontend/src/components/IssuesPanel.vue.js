import { AlertCircle, AlertTriangle, ChevronRight, Info, Wrench } from 'lucide-vue-next';
import { computed, reactive } from 'vue';
import { ISSUE_TITLES } from '@/core/validate';
import { useEditor } from '@/stores/editor';
const editor = useEditor();
const open = reactive({});
const groups = computed(() => {
    const result = new Map();
    for (const issue of editor.issues) {
        const list = result.get(issue.code);
        if (list)
            list.push(issue);
        else
            result.set(issue.code, [issue]);
    }
    return [...result.entries()].map(([code, issues]) => ({ code, issues }));
});
const counts = computed(() => {
    const result = { error: 0, warning: 0, info: 0 };
    for (const issue of editor.issues)
        result[issue.severity]++;
    return result;
});
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    __VLS_withDotValue(counts, {});
    __VLS_withDotValue(editor, {});
    __VLS_withDotValue(open, {});
    __VLS_withDotValue(ISSUE_TITLES, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['count']} */ ;
    /** @type {__VLS_StyleScopedClasses['count']} */ ;
    /** @type {__VLS_StyleScopedClasses['count']} */ ;
    /** @type {__VLS_StyleScopedClasses['group']} */ ;
    /** @type {__VLS_StyleScopedClasses['group']} */ ;
    /** @type {__VLS_StyleScopedClasses['group']} */ ;
    /** @type {__VLS_StyleScopedClasses['group']} */ ;
    /** @type {__VLS_StyleScopedClasses['dot']} */ ;
    /** @type {__VLS_StyleScopedClasses['error']} */ ;
    /** @type {__VLS_StyleScopedClasses['dot']} */ ;
    /** @type {__VLS_StyleScopedClasses['warning']} */ ;
    /** @type {__VLS_StyleScopedClasses['dot']} */ ;
    /** @type {__VLS_StyleScopedClasses['info']} */ ;
    /** @type {__VLS_StyleScopedClasses['issue']} */ ;
    /** @type {__VLS_StyleScopedClasses['issue']} */ ;
    /** @type {__VLS_StyleScopedClasses['text']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
        ...{ class: "section" },
    });
    /** @type {__VLS_StyleScopedClasses['section']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "summary" },
    });
    /** @type {__VLS_StyleScopedClasses['summary']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "count error" },
    });
    /** @type {__VLS_StyleScopedClasses['count']} */ ;
    /** @type {__VLS_StyleScopedClasses['error']} */ ;
    let __VLS_0;
    /** @ts-ignore @type { | typeof AlertCircle} */
    AlertCircle;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
        // @ts-ignore
        size: (13), 'aria-hidden': "true",
    }));
    const __VLS_2 = __VLS_1({
        size: (13),
        'aria-hidden': "true",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    (counts.value.error);
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "count warning" },
    });
    /** @type {__VLS_StyleScopedClasses['count']} */ ;
    /** @type {__VLS_StyleScopedClasses['warning']} */ ;
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
    (counts.value.warning);
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "count info" },
    });
    /** @type {__VLS_StyleScopedClasses['count']} */ ;
    /** @type {__VLS_StyleScopedClasses['info']} */ ;
    let __VLS_10;
    /** @ts-ignore @type { | typeof Info} */
    Info;
    // @ts-ignore
    const __VLS_11 = __VLS_asFunctionalComponent1(__VLS_10, new __VLS_10({
        // @ts-ignore
        size: (13), 'aria-hidden': "true",
    }));
    const __VLS_12 = __VLS_11({
        size: (13),
        'aria-hidden': "true",
    }, ...__VLS_functionalComponentArgsRest(__VLS_11));
    (counts.value.info);
    if (editor.value.issues.length === 0) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "empty" },
        });
        /** @type {__VLS_StyleScopedClasses['empty']} */ ;
    }
    const __VLS_15 = __VLS_tryAsConstant((__VLS_unwrap(groups, {})));
    for (const [group] of __VLS_vFor(__VLS_nonNull(__VLS_15))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.template)({
            key: (group.code),
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    void $event;
                    return (open.value[group.code] = !open.value[group.code]);
                    // @ts-ignore
                    [counts, counts, counts, editor, groups, open, open,];
                } },
            ...{ class: "group" },
            'aria-expanded': (open.value[group.code] ?? false),
        });
        /** @type {__VLS_StyleScopedClasses['group']} */ ;
        let __VLS_16;
        /** @ts-ignore @type { | typeof ChevronRight} */
        ChevronRight;
        // @ts-ignore
        const __VLS_17 = __VLS_asFunctionalComponent1(__VLS_16, new __VLS_16({
            // @ts-ignore
            size: (13), ...{ class: ({ turned: open.value[group.code] }) }, 'aria-hidden': "true",
        }));
        const __VLS_18 = __VLS_17({
            size: (13),
            ...{ class: ({ turned: open.value[group.code] }) },
            'aria-hidden': "true",
        }, ...__VLS_functionalComponentArgsRest(__VLS_17));
        /** @type {__VLS_StyleScopedClasses['turned']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span)({
            ...{ class: "dot" },
            ...{ class: (group.issues[0].severity) },
            'aria-hidden': "true",
        });
        /** @type {__VLS_StyleScopedClasses['dot']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "ellipsis" },
        });
        /** @type {__VLS_StyleScopedClasses['ellipsis']} */ ;
        (ISSUE_TITLES.value[group.code]);
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "faint" },
        });
        /** @type {__VLS_StyleScopedClasses['faint']} */ ;
        (group.issues.length);
        if (open.value[group.code]) {
            const __VLS_21 = __VLS_tryAsConstant((group.issues.slice(0, 80)));
            for (const [issue] of __VLS_vFor(__VLS_nonNull(__VLS_21))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    key: (issue.id),
                    ...{ class: "issue" },
                    ...{ class: ({ focused: editor.value.focusedIssue === issue.id }) },
                });
                /** @type {__VLS_StyleScopedClasses['issue']} */ ;
                /** @type {__VLS_StyleScopedClasses['focused']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                    ...{ onClick: (...[$event]) => {
                            void $event;
                            if (!(open.value[group.code]))
                                throw 0;
                            return (editor.value.focusIssue(issue));
                            // @ts-ignore
                            [editor, editor, open, open, open, ISSUE_TITLES,];
                        } },
                    ...{ class: "text" },
                });
                /** @type {__VLS_StyleScopedClasses['text']} */ ;
                (issue.message);
                if (issue.fix) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                        ...{ onClick: (...[$event]) => {
                                void $event;
                                if (!(open.value[group.code]))
                                    throw 0;
                                if (!(issue.fix))
                                    throw 0;
                                return (editor.value.applyFix(issue));
                                // @ts-ignore
                                [editor,];
                            } },
                        ...{ class: "btn small" },
                    });
                    /** @type {__VLS_StyleScopedClasses['btn']} */ ;
                    /** @type {__VLS_StyleScopedClasses['small']} */ ;
                    let __VLS_22;
                    /** @ts-ignore @type { | typeof Wrench} */
                    Wrench;
                    // @ts-ignore
                    const __VLS_23 = __VLS_asFunctionalComponent1(__VLS_22, new __VLS_22({
                        // @ts-ignore
                        size: (11), 'aria-hidden': "true",
                    }));
                    const __VLS_24 = __VLS_23({
                        size: (11),
                        'aria-hidden': "true",
                    }, ...__VLS_functionalComponentArgsRest(__VLS_23));
                    (issue.fixLabel);
                }
                // @ts-ignore
                [];
            }
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
