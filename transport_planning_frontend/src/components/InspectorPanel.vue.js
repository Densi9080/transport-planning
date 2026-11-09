import { Combine, Merge, Sparkles, Spline, Trash2 } from 'lucide-vue-next';
import { computed } from 'vue';
import { useAssistant } from '@/stores/assistant';
import { useEditor } from '@/stores/editor';
import AssistantPanel from './AssistantPanel.vue';
import NodeInspector from './NodeInspector.vue';
import RoadPresets from './RoadPresets.vue';
import SimPanel from './SimPanel.vue';
import WayInspector from './WayInspector.vue';
const editor = useEditor();
const assistant = useAssistant();
const pendingProposals = computed(() => assistant.proposals.filter((item) => item.status === 'pending').length);
const ways = computed(() => editor.selectedWays);
const nodes = computed(() => editor.selectedNodes);
const isSingleWay = computed(() => ways.value.length === 1 && nodes.value.length === 0);
const isSingleNode = computed(() => nodes.value.length === 1 && ways.value.length === 0);
const isMulti = computed(() => ways.value.length + nodes.value.length > 1);
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    __VLS_withDotValue(editor, {});
    __VLS_withDotValue(pendingProposals, {});
    __VLS_withDotValue(isSingleWay, {});
    __VLS_withDotValue(ways, {});
    __VLS_withDotValue(isSingleNode, {});
    __VLS_withDotValue(nodes, {});
    __VLS_withDotValue(isMulti, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['empty']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.aside, __VLS_intrinsics.aside)({
        ...{ class: "inspector" },
        'aria-label': "Быстрый просмотр и помощник",
    });
    /** @type {__VLS_StyleScopedClasses['inspector']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "dock-tabs" },
        role: "tablist",
    });
    /** @type {__VLS_StyleScopedClasses['dock-tabs']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                void $event;
                return (editor.value.rightTab = 'quick');
                // @ts-ignore
                [editor,];
            } },
        role: "tab",
        ...{ class: ({ active: editor.value.rightTab === 'quick' }) },
        'aria-selected': (editor.value.rightTab === 'quick'),
    });
    /** @type {__VLS_StyleScopedClasses['active']} */ ;
    (editor.value.viewMode === 'sim' ? 'Расчёт' : 'Быстрый просмотр');
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                void $event;
                return (editor.value.rightTab = 'assistant');
                // @ts-ignore
                [editor, editor, editor, editor,];
            } },
        role: "tab",
        ...{ class: ({ active: editor.value.rightTab === 'assistant' }) },
        'aria-selected': (editor.value.rightTab === 'assistant'),
    });
    /** @type {__VLS_StyleScopedClasses['active']} */ ;
    let __VLS_0;
    /** @ts-ignore @type { | typeof Sparkles} */
    Sparkles;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
        // @ts-ignore
        size: (12), 'aria-hidden': "true",
    }));
    const __VLS_2 = __VLS_1({
        size: (12),
        'aria-hidden': "true",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    if (pendingProposals.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "badge" },
        });
        /** @type {__VLS_StyleScopedClasses['badge']} */ ;
        (pendingProposals.value);
    }
    const __VLS_5 = AssistantPanel;
    // @ts-ignore
    const __VLS_6 = __VLS_asFunctionalComponent1(__VLS_5, new __VLS_5({
    // @ts-ignore
    }));
    const __VLS_7 = __VLS_6({}, ...__VLS_functionalComponentArgsRest(__VLS_6));
    const __VLS_10 = __VLS_asFunctionalDirective(__VLS_directives.vShow, {});
    __VLS_10(__VLS_nonNull(null), { ...__VLS_directiveBindingRestFields, value: (editor.value.rightTab === 'assistant'), }, ...__VLS_directiveHookArgsRest(__VLS_10));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "quick" },
    });
    const __VLS_11 = __VLS_asFunctionalDirective(__VLS_directives.vShow, {});
    __VLS_11(__VLS_nonNull(null), { ...__VLS_directiveBindingRestFields, value: (editor.value.rightTab === 'quick'), }, ...__VLS_directiveHookArgsRest(__VLS_11));
    /** @type {__VLS_StyleScopedClasses['quick']} */ ;
    if (editor.value.viewMode === 'sim') {
        const __VLS_12 = SimPanel;
        // @ts-ignore
        const __VLS_13 = __VLS_asFunctionalComponent1(__VLS_12, new __VLS_12({
        // @ts-ignore
        }));
        const __VLS_14 = __VLS_13({}, ...__VLS_functionalComponentArgsRest(__VLS_13));
    }
    else if (editor.value.tool === 'road') {
        const __VLS_17 = RoadPresets;
        // @ts-ignore
        const __VLS_18 = __VLS_asFunctionalComponent1(__VLS_17, new __VLS_17({
        // @ts-ignore
        }));
        const __VLS_19 = __VLS_18({}, ...__VLS_functionalComponentArgsRest(__VLS_18));
    }
    else if (isSingleWay.value) {
        const __VLS_22 = WayInspector;
        // @ts-ignore
        const __VLS_23 = __VLS_asFunctionalComponent1(__VLS_22, new __VLS_22({
            // @ts-ignore
            key: (ways.value[0].id), way: (ways.value[0]),
        }));
        const __VLS_24 = __VLS_23({
            key: (ways.value[0].id),
            way: (ways.value[0]),
        }, ...__VLS_functionalComponentArgsRest(__VLS_23));
    }
    else if (isSingleNode.value) {
        const __VLS_27 = NodeInspector;
        // @ts-ignore
        const __VLS_28 = __VLS_asFunctionalComponent1(__VLS_27, new __VLS_27({
            // @ts-ignore
            key: (nodes.value[0].id), node: (nodes.value[0]),
        }));
        const __VLS_29 = __VLS_28({
            key: (nodes.value[0].id),
            node: (nodes.value[0]),
        }, ...__VLS_functionalComponentArgsRest(__VLS_28));
    }
    else if (isMulti.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "section" },
        });
        /** @type {__VLS_StyleScopedClasses['section']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({});
        (ways.value.length + nodes.value.length);
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "muted" },
        });
        /** @type {__VLS_StyleScopedClasses['muted']} */ ;
        (ways.value.length);
        (nodes.value.length);
        if (nodes.value.length >= 2) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (editor.value.mergeSelected) },
                ...{ class: "btn block" },
            });
            /** @type {__VLS_StyleScopedClasses['btn']} */ ;
            /** @type {__VLS_StyleScopedClasses['block']} */ ;
            let __VLS_32;
            /** @ts-ignore @type { | typeof Merge} */
            Merge;
            // @ts-ignore
            const __VLS_33 = __VLS_asFunctionalComponent1(__VLS_32, new __VLS_32({
                // @ts-ignore
                size: (14), 'aria-hidden': "true",
            }));
            const __VLS_34 = __VLS_33({
                size: (14),
                'aria-hidden': "true",
            }, ...__VLS_functionalComponentArgsRest(__VLS_33));
            __VLS_asFunctionalElement1(__VLS_intrinsics.kbd, __VLS_intrinsics.kbd)({});
        }
        if (ways.value.length === 2) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (editor.value.joinSelected) },
                ...{ class: "btn block" },
            });
            /** @type {__VLS_StyleScopedClasses['btn']} */ ;
            /** @type {__VLS_StyleScopedClasses['block']} */ ;
            let __VLS_37;
            /** @ts-ignore @type { | typeof Combine} */
            Combine;
            // @ts-ignore
            const __VLS_38 = __VLS_asFunctionalComponent1(__VLS_37, new __VLS_37({
                // @ts-ignore
                size: (14), 'aria-hidden': "true",
            }));
            const __VLS_39 = __VLS_38({
                size: (14),
                'aria-hidden': "true",
            }, ...__VLS_functionalComponentArgsRest(__VLS_38));
            __VLS_asFunctionalElement1(__VLS_intrinsics.kbd, __VLS_intrinsics.kbd)({});
        }
        if (ways.value.length >= 1) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (editor.value.reverseSelected) },
                ...{ class: "btn block" },
            });
            /** @type {__VLS_StyleScopedClasses['btn']} */ ;
            /** @type {__VLS_StyleScopedClasses['block']} */ ;
            let __VLS_42;
            /** @ts-ignore @type { | typeof Spline} */
            Spline;
            // @ts-ignore
            const __VLS_43 = __VLS_asFunctionalComponent1(__VLS_42, new __VLS_42({
                // @ts-ignore
                size: (14), 'aria-hidden': "true",
            }));
            const __VLS_44 = __VLS_43({
                size: (14),
                'aria-hidden': "true",
            }, ...__VLS_functionalComponentArgsRest(__VLS_43));
            __VLS_asFunctionalElement1(__VLS_intrinsics.kbd, __VLS_intrinsics.kbd)({});
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (editor.value.deleteSelection) },
            ...{ class: "btn block danger" },
        });
        /** @type {__VLS_StyleScopedClasses['btn']} */ ;
        /** @type {__VLS_StyleScopedClasses['block']} */ ;
        /** @type {__VLS_StyleScopedClasses['danger']} */ ;
        let __VLS_47;
        /** @ts-ignore @type { | typeof Trash2} */
        Trash2;
        // @ts-ignore
        const __VLS_48 = __VLS_asFunctionalComponent1(__VLS_47, new __VLS_47({
            // @ts-ignore
            size: (14), 'aria-hidden': "true",
        }));
        const __VLS_49 = __VLS_48({
            size: (14),
            'aria-hidden': "true",
        }, ...__VLS_functionalComponentArgsRest(__VLS_48));
        __VLS_asFunctionalElement1(__VLS_intrinsics.kbd, __VLS_intrinsics.kbd)({});
    }
    else {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "empty" },
        });
        /** @type {__VLS_StyleScopedClasses['empty']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "muted" },
        });
        /** @type {__VLS_StyleScopedClasses['muted']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "muted" },
        });
        /** @type {__VLS_StyleScopedClasses['muted']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "muted" },
        });
        /** @type {__VLS_StyleScopedClasses['muted']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.kbd, __VLS_intrinsics.kbd)({});
    }
    // @ts-ignore
    [editor, editor, editor, editor, editor, editor, editor, editor, editor, editor, pendingProposals, pendingProposals, isSingleWay, ways, ways, ways, ways, ways, ways, isSingleNode, nodes, nodes, nodes, nodes, nodes, isMulti,];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
