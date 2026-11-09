import { Columns2, ImageUp, Trash2 } from 'lucide-vue-next';
import { ref } from 'vue';
import { BASEMAP_OPTIONS } from '@/map/style';
import { useEditor } from '@/stores/editor';
const editor = useEditor();
const fileInput = ref(null);
const layerList = [
    { key: 'buildings', label: 'Здания' },
    { key: 'landuse', label: 'Территории и вода' },
    { key: 'minor', label: 'Тротуары и тропы' },
    { key: 'rail', label: 'Железная дорога' },
    { key: 'other', label: 'Прочие линии' },
    { key: 'points', label: 'Точечные объекты' },
    { key: 'turnPaths', label: 'Траектории на перекрёстках' },
    { key: 'arrows', label: 'Стрелки на полосах' },
    { key: 'crossings', label: 'Пешеходные переходы' },
    { key: 'signals', label: 'Светофоры' },
    { key: 'labels', label: 'Названия улиц' },
    { key: 'transit', label: 'Линии ОТ и остановки' },
    { key: 'issues', label: 'Ошибки на карте' },
];
function onImage(event) {
    const input = event.target;
    const file = input.files?.[0];
    input.value = '';
    if (!file)
        return;
    if (!file.type.startsWith('image/')) {
        editor.toast('Выберите файл с картинкой', 'error');
        return;
    }
    const reader = new FileReader();
    reader.onload = () => editor.setImageUnderlay(String(reader.result));
    reader.onerror = () => editor.toast('Не удалось прочитать файл', 'error');
    reader.readAsDataURL(file);
}
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    __VLS_withDotValue(editor, {});
    __VLS_withDotValue(fileInput, {});
    void {};
    __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
        ...{ class: "section" },
    });
    /** @type {__VLS_StyleScopedClasses['section']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "eyebrow" },
    });
    /** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.select, __VLS_intrinsics.select)({
        value: (editor.value.basemap),
        ...{ class: "input" },
        'aria-label': "Источник подложки",
    });
    /** @type {__VLS_StyleScopedClasses['input']} */ ;
    const __VLS_0 = __VLS_tryAsConstant((__VLS_unwrap(BASEMAP_OPTIONS, {})));
    for (const [option] of __VLS_vFor(__VLS_nonNull(__VLS_0))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
            key: (option.id),
            value: (option.id),
        });
        (option.label);
        // @ts-ignore
        [editor, BASEMAP_OPTIONS,];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.option, __VLS_intrinsics.option)({
        value: "custom",
    });
    if (editor.value.basemap === 'custom') {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "field" },
        });
        /** @type {__VLS_StyleScopedClasses['field']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
            for: "tile-url",
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            id: "tile-url",
            ...{ class: "input" },
            placeholder: "https://…/{z}/{x}/{y}.png?key=…",
        });
        (editor.value.customTileUrl);
        /** @type {__VLS_StyleScopedClasses['input']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "faint note" },
        });
        /** @type {__VLS_StyleScopedClasses['faint']} */ ;
        /** @type {__VLS_StyleScopedClasses['note']} */ ;
    }
    if (editor.value.basemap !== 'none') {
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
            ...{ class: "slider" },
        });
        /** @type {__VLS_StyleScopedClasses['slider']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        (Math.round(editor.value.basemapOpacity * 100));
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            type: "range",
            min: "0.1",
            max: "1",
            step: "0.05",
        });
        (editor.value.basemapOpacity);
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
        ...{ class: "slider" },
    });
    /** @type {__VLS_StyleScopedClasses['slider']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    (Math.round(editor.value.modelOpacity * 100));
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        type: "range",
        min: "0",
        max: "1",
        step: "0.05",
    });
    (editor.value.modelOpacity);
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                void $event;
                return (editor.value.compareOpen = !editor.value.compareOpen);
                // @ts-ignore
                [editor, editor, editor, editor, editor, editor, editor, editor, editor,];
            } },
        ...{ class: "btn block" },
        ...{ class: ({ on: editor.value.compareOpen }) },
        'aria-pressed': (editor.value.compareOpen),
    });
    /** @type {__VLS_StyleScopedClasses['btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['block']} */ ;
    /** @type {__VLS_StyleScopedClasses['on']} */ ;
    let __VLS_1;
    /** @ts-ignore @type { | typeof Columns2} */
    Columns2;
    // @ts-ignore
    const __VLS_2 = __VLS_asFunctionalComponent1(__VLS_1, new __VLS_1({
        // @ts-ignore
        size: (13), 'aria-hidden': "true",
    }));
    const __VLS_3 = __VLS_2({
        size: (13),
        'aria-hidden': "true",
    }, ...__VLS_functionalComponentArgsRest(__VLS_2));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "row" },
    });
    /** @type {__VLS_StyleScopedClasses['row']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                void $event;
                return (fileInput.value?.click());
                // @ts-ignore
                [editor, editor, fileInput,];
            } },
        ...{ class: "btn grow" },
    });
    /** @type {__VLS_StyleScopedClasses['btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['grow']} */ ;
    let __VLS_6;
    /** @ts-ignore @type { | typeof ImageUp} */
    ImageUp;
    // @ts-ignore
    const __VLS_7 = __VLS_asFunctionalComponent1(__VLS_6, new __VLS_6({
        // @ts-ignore
        size: (13), 'aria-hidden': "true",
    }));
    const __VLS_8 = __VLS_7({
        size: (13),
        'aria-hidden': "true",
    }, ...__VLS_functionalComponentArgsRest(__VLS_7));
    (editor.value.imageUnderlay ? 'Заменить снимок' : 'Загрузить свой снимок');
    if (editor.value.imageUnderlay) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (editor.value.clearImageUnderlay) },
            ...{ class: "btn" },
            'aria-label': "Убрать снимок",
        });
        /** @type {__VLS_StyleScopedClasses['btn']} */ ;
        let __VLS_11;
        /** @ts-ignore @type { | typeof Trash2} */
        Trash2;
        // @ts-ignore
        const __VLS_12 = __VLS_asFunctionalComponent1(__VLS_11, new __VLS_11({
            // @ts-ignore
            size: (13),
        }));
        const __VLS_13 = __VLS_12({
            size: (13),
        }, ...__VLS_functionalComponentArgsRest(__VLS_12));
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        ...{ onChange: (onImage) },
        ref: "fileInput",
        type: "file",
        accept: "image/*",
        hidden: true,
    });
    if (editor.value.imageUnderlay) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "faint note" },
        });
        /** @type {__VLS_StyleScopedClasses['faint']} */ ;
        /** @type {__VLS_StyleScopedClasses['note']} */ ;
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
        ...{ class: "section" },
    });
    /** @type {__VLS_StyleScopedClasses['section']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "eyebrow" },
    });
    /** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
    const __VLS_16 = __VLS_tryAsConstant((__VLS_unwrap(layerList, {})));
    for (const [layer] of __VLS_vFor(__VLS_nonNull(__VLS_16))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
            key: (layer.key),
            ...{ class: "check" },
        });
        /** @type {__VLS_StyleScopedClasses['check']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            type: "checkbox",
        });
        (editor.value.layers[layer.key]);
        (layer.label);
        // @ts-ignore
        [editor, editor, editor, editor, editor, layerList,];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
        ...{ class: "section" },
    });
    /** @type {__VLS_StyleScopedClasses['section']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "eyebrow" },
    });
    /** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "segmented" },
        role: "group",
        'aria-label': "Тема",
    });
    /** @type {__VLS_StyleScopedClasses['segmented']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                void $event;
                return (editor.value.theme = 'light');
                // @ts-ignore
                [editor,];
            } },
        ...{ class: ({ active: editor.value.theme === 'light' }) },
        'aria-pressed': (editor.value.theme === 'light'),
    });
    /** @type {__VLS_StyleScopedClasses['active']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                void $event;
                return (editor.value.theme = 'dark');
                // @ts-ignore
                [editor, editor, editor,];
            } },
        ...{ class: ({ active: editor.value.theme === 'dark' }) },
        'aria-pressed': (editor.value.theme === 'dark'),
    });
    /** @type {__VLS_StyleScopedClasses['active']} */ ;
    // @ts-ignore
    [editor, editor,];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
