import { computed } from 'vue';
const { defineProps, } = {};
const props = defineProps();
function parseInline(line) {
    const spans = [];
    const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g;
    let last = 0;
    for (const match of line.matchAll(pattern)) {
        const index = match.index ?? 0;
        if (index > last)
            spans.push({ text: line.slice(last, index) });
        const token = match[0];
        if (token.startsWith('**'))
            spans.push({ text: token.slice(2, -2), bold: true });
        else
            spans.push({ text: token.slice(1, -1), code: true });
        last = index + token.length;
    }
    if (last < line.length)
        spans.push({ text: line.slice(last) });
    return spans;
}
const blocks = computed(() => {
    const result = [];
    for (const raw of props.text.split('\n')) {
        const line = raw.trim();
        if (!line)
            continue;
        const bullet = /^[-*•]\s+(.*)$/.exec(line);
        const numbered = /^\d+[.)]\s+(.*)$/.exec(line);
        const heading = /^#{1,6}\s+(.*)$/.exec(line);
        const content = bullet?.[1] ?? numbered?.[1] ?? heading?.[1] ?? line;
        const list = Boolean(bullet || numbered);
        const last = result.at(-1);
        if (list && last?.list && last.ordered === Boolean(numbered))
            last.items.push(parseInline(content));
        else
            result.push({ list, ordered: Boolean(numbered), heading: Boolean(heading), items: [parseInline(content)] });
    }
    return result;
});
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
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "text" },
    });
    /** @type {__VLS_StyleScopedClasses['text']} */ ;
    const __VLS_0 = __VLS_tryAsConstant((__VLS_unwrap(blocks, {})));
    for (const [block, index] of __VLS_vFor(__VLS_nonNull(__VLS_0))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.template)({
            key: (index),
        });
        if (block.list) {
            const __VLS_1 = (block.ordered ? 'ol' : 'ul');
            // @ts-ignore
            const __VLS_2 = __VLS_asFunctionalComponent1(__VLS_1, new __VLS_1({
            // @ts-ignore
            }));
            const __VLS_3 = __VLS_2({}, ...__VLS_functionalComponentArgsRest(__VLS_2));
            var __VLS_4;
            const { default: __VLS_6 } = __VLS_nonNull(__VLS_4.slots);
            const __VLS_7 = __VLS_tryAsConstant((block.items));
            for (const [item, itemIndex] of __VLS_vFor(__VLS_nonNull(__VLS_7))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({
                    key: (itemIndex),
                });
                const __VLS_8 = __VLS_tryAsConstant((item));
                for (const [span, spanIndex] of __VLS_vFor(__VLS_nonNull(__VLS_8))) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.template)({
                        key: (spanIndex),
                    });
                    if (span.bold) {
                        __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
                        (span.text);
                    }
                    else if (span.code) {
                        __VLS_asFunctionalElement1(__VLS_intrinsics.code, __VLS_intrinsics.code)({});
                        (span.text);
                    }
                    else {
                        (span.text);
                    }
                    // @ts-ignore
                    [blocks,];
                }
                // @ts-ignore
                [];
            }
            // @ts-ignore
            [];
        }
        else {
            __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                ...{ class: ({ heading: block.heading }) },
            });
            /** @type {__VLS_StyleScopedClasses['heading']} */ ;
            const __VLS_9 = __VLS_tryAsConstant((block.items[0]));
            for (const [span, spanIndex] of __VLS_vFor(__VLS_nonNull(__VLS_9))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.template)({
                    key: (spanIndex),
                });
                if (span.bold) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
                    (span.text);
                }
                else if (span.code) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.code, __VLS_intrinsics.code)({});
                    (span.text);
                }
                else {
                    (span.text);
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
const __VLS_export = (await import('vue')).defineComponent({
    __typeProps: {},
});
export default {};
