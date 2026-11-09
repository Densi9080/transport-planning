import { X } from 'lucide-vue-next';
import { computed, onMounted, ref } from 'vue';
import { useEditor } from '@/stores/editor';
import JunctionSchematic from './JunctionSchematic.vue';
import SignalPlanEditor from './SignalPlanEditor.vue';
const editor = useEditor();
const dialog = ref(null);
const tab = ref(editor.junctionTab);
const nodeId = computed(() => editor.junctionNode);
const title = computed(() => {
    void editor.rev;
    const doc = editor.doc;
    if (!doc)
        return '';
    const names = [...new Set(doc.waysOfNode(nodeId.value).map((id) => doc.ways.get(id)?.tags?.name).filter(Boolean))];
    return names.slice(0, 3).join(' / ') || `Узел ${nodeId.value}`;
});
function close() {
    editor.junctionNode = null;
}
onMounted(() => dialog.value?.showModal());
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    __VLS_withDotValue(tab, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['dialog']} */ ;
    /** @type {__VLS_StyleScopedClasses['dialog']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.dialog, __VLS_intrinsics.dialog)({
        ...{ onClose: (close) },
        ref: "dialog",
        ...{ class: "dialog" },
        'aria-labelledby': "junction-title",
    });
    /** @type {__VLS_StyleScopedClasses['dialog']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "dock-title" },
    });
    /** @type {__VLS_StyleScopedClasses['dock-title']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        id: "junction-title",
        ...{ class: "ellipsis" },
    });
    /** @type {__VLS_StyleScopedClasses['ellipsis']} */ ;
    (__VLS_unwrap(title, {}));
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "faint id" },
    });
    /** @type {__VLS_StyleScopedClasses['faint']} */ ;
    /** @type {__VLS_StyleScopedClasses['id']} */ ;
    (__VLS_unwrap(nodeId, {}));
    __VLS_asFunctionalElement1(__VLS_intrinsics.span)({
        ...{ class: "spacer" },
    });
    /** @type {__VLS_StyleScopedClasses['spacer']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (close) },
        ...{ class: "btn ghost small" },
        'aria-label': "Закрыть",
    });
    /** @type {__VLS_StyleScopedClasses['btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['ghost']} */ ;
    /** @type {__VLS_StyleScopedClasses['small']} */ ;
    let __VLS_0;
    /** @ts-ignore @type { | typeof X} */
    X;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
        // @ts-ignore
        size: (14),
    }));
    const __VLS_2 = __VLS_1({
        size: (14),
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "dock-tabs" },
        role: "tablist",
    });
    /** @type {__VLS_StyleScopedClasses['dock-tabs']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                void $event;
                return (tab.value = 'lanes');
                // @ts-ignore
                [title, nodeId, tab,];
            } },
        role: "tab",
        ...{ class: ({ active: tab.value === 'lanes' }) },
        'aria-selected': (tab.value === 'lanes'),
    });
    /** @type {__VLS_StyleScopedClasses['active']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                void $event;
                return (tab.value = 'signal');
                // @ts-ignore
                [tab, tab, tab,];
            } },
        role: "tab",
        ...{ class: ({ active: tab.value === 'signal' }) },
        'aria-selected': (tab.value === 'signal'),
    });
    /** @type {__VLS_StyleScopedClasses['active']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "content" },
    });
    /** @type {__VLS_StyleScopedClasses['content']} */ ;
    if (tab.value === 'lanes') {
        const __VLS_5 = JunctionSchematic;
        // @ts-ignore
        const __VLS_6 = __VLS_asFunctionalComponent1(__VLS_5, new __VLS_5({
            // @ts-ignore
            node: (__VLS_unwrap(nodeId, {})),
        }));
        const __VLS_7 = __VLS_6({
            node: (__VLS_unwrap(nodeId, {})),
        }, ...__VLS_functionalComponentArgsRest(__VLS_6));
    }
    else {
        const __VLS_10 = SignalPlanEditor;
        // @ts-ignore
        const __VLS_11 = __VLS_asFunctionalComponent1(__VLS_10, new __VLS_10({
            // @ts-ignore
            node: (__VLS_unwrap(nodeId, {})),
        }));
        const __VLS_12 = __VLS_11({
            node: (__VLS_unwrap(nodeId, {})),
        }, ...__VLS_functionalComponentArgsRest(__VLS_11));
    }
    // @ts-ignore
    [nodeId, nodeId, tab, tab, tab,];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
