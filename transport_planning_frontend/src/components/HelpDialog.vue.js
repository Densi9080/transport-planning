import { X } from 'lucide-vue-next';
import { onMounted, ref } from 'vue';
import { useEditor } from '@/stores/editor';
const editor = useEditor();
const dialog = ref(null);
const groups = [
    {
        title: 'Инструменты',
        items: [
            ['V', 'Выбор'],
            ['D', 'Новая дорога'],
            ['N', 'Новый узел'],
            ['X', 'Разрезать дорогу'],
            ['T', 'Светофор'],
            ['C', 'Пешеходный переход'],
            ['S', 'Участок сниженной скорости'],
            ['L', 'Лежачий полицейский'],
            ['P', 'Знак приоритета'],
            ['B', 'Мост'],
            ['G', 'Тоннель'],
        ],
    },
    {
        title: 'Правка',
        items: [
            ['Ctrl+Z', 'Отменить'],
            ['Ctrl+Y', 'Повторить'],
            ['Del', 'Удалить выбранное'],
            ['Ctrl+D', 'Дублировать дорогу'],
            ['F', 'Развернуть направление'],
            ['M', 'Склеить выбранные узлы'],
            ['U', 'Расклеить перекрёсток'],
            ['J', 'Объединить две дороги'],
            ['E', 'Редактор выбранного узла'],
            ['[ ]', 'Меньше или больше полос'],
        ],
    },
    {
        title: 'Мышь и рисование',
        items: [
            ['Shift+клик', 'Добавить к выбору'],
            ['Перетащить узел', 'Подвести к другому, чтобы склеить'],
            ['Alt', 'Отключить прилипание'],
            ['Shift', 'Рисовать под углом с шагом 15°'],
            ['Enter', 'Закончить дорогу'],
            ['Backspace', 'Убрать последнюю точку'],
            ['Esc', 'Отмена и возврат к выбору'],
            ['H', 'Показать весь участок'],
            ['Пробел', 'Пауза в симуляции'],
        ],
    },
];
onMounted(() => dialog.value?.showModal());
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    __VLS_withDotValue(editor, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['dialog']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.dialog, __VLS_intrinsics.dialog)({
        ...{ onClose: (...[$event]) => {
                void $event;
                return (editor.value.helpOpen = false);
                // @ts-ignore
                [editor,];
            } },
        ref: "dialog",
        ...{ class: "dialog" },
        'aria-labelledby': "help-title",
    });
    /** @type {__VLS_StyleScopedClasses['dialog']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "head" },
    });
    /** @type {__VLS_StyleScopedClasses['head']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({
        id: "help-title",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                void $event;
                return (editor.value.helpOpen = false);
                // @ts-ignore
                [editor,];
            } },
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
        size: (15),
    }));
    const __VLS_2 = __VLS_1({
        size: (15),
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "groups" },
    });
    /** @type {__VLS_StyleScopedClasses['groups']} */ ;
    const __VLS_5 = __VLS_tryAsConstant((__VLS_unwrap(groups, {})));
    for (const [group] of __VLS_vFor(__VLS_nonNull(__VLS_5))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
            key: (group.title),
        });
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "eyebrow" },
        });
        /** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
        (group.title);
        const __VLS_6 = __VLS_tryAsConstant((group.items));
        for (const [[key, label]] of __VLS_vFor(__VLS_nonNull(__VLS_6))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                key: (key),
                ...{ class: "line" },
            });
            /** @type {__VLS_StyleScopedClasses['line']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.kbd, __VLS_intrinsics.kbd)({});
            (key);
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
            (label);
            // @ts-ignore
            [groups,];
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
