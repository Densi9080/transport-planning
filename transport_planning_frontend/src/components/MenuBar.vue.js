import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { BASEMAP_OPTIONS } from '@/map/style';
import { useAssistant } from '@/stores/assistant';
import { useEditor } from '@/stores/editor';
import { useSimulation } from '@/stores/simulation';
const editor = useEditor();
const sim = useSimulation();
const router = useRouter();
const assistant = useAssistant();
const openMenu = ref(null);
const root = ref(null);
const separator = { separator: true };
function openLeft(tab) {
    editor.navigatorOpen = true;
    editor.leftTab = tab;
}
function openList(tab) {
    editor.listOpen = true;
    editor.listTab = tab;
}
function openAssistant() {
    editor.inspectorOpen = true;
    editor.rightTab = 'assistant';
}
function runSim(level) {
    editor.viewMode = 'sim';
    sim.setLevel(level);
}
const menus = computed(() => [
    {
        title: 'Файл',
        items: [
            { label: 'Открыть другой проект', action: () => void router.push('/') },
            { label: 'Экспорт .osm', hint: 'с проверкой сети', action: () => (editor.exportOpen = true) },
        ],
    },
    {
        title: 'Правка',
        items: [
            { label: 'Отменить', hint: 'Ctrl+Z', disabled: !editor.canUndo, action: editor.undo },
            { label: 'Повторить', hint: 'Ctrl+Y', disabled: !editor.canRedo, action: editor.redo },
            separator,
            { label: 'Удалить выбранное', hint: 'Del', disabled: editor.selection.length === 0, action: editor.deleteSelection },
            { label: 'Развернуть направление', hint: 'F', disabled: editor.selectedWays.length === 0, action: editor.reverseSelected },
            { label: 'Склеить выбранные узлы', hint: 'M', disabled: editor.selectedNodes.length < 2, action: editor.mergeSelected },
            { label: 'Расклеить перекрёсток', hint: 'U', disabled: editor.selectedNodes.length === 0, action: editor.unglueSelected },
            { label: 'Объединить две дороги', hint: 'J', disabled: editor.selectedWays.length !== 2, action: editor.joinSelected },
            { label: 'Дублировать дорогу', hint: 'Ctrl+D', disabled: editor.selectedWays.length === 0, action: editor.duplicateSelected },
            { label: 'Сгладить дорогу', disabled: editor.selectedWays.length === 0, action: editor.smoothSelected },
        ],
    },
    {
        title: 'Вид',
        items: [
            { label: 'Инженерный вид', checked: editor.viewMode === 'engineering', action: () => (editor.viewMode = 'engineering') },
            { label: 'Граф сети', checked: editor.viewMode === 'graph', action: () => (editor.viewMode = 'graph') },
            { label: '3D', checked: editor.viewMode === '3d', action: () => (editor.viewMode = '3d') },
            separator,
            { label: 'Окно «Сеть»', checked: editor.navigatorOpen, action: () => (editor.navigatorOpen = !editor.navigatorOpen) },
            { label: 'Быстрый просмотр', checked: editor.inspectorOpen, action: () => (editor.inspectorOpen = !editor.inspectorOpen) },
            { label: 'Списки', checked: editor.listOpen, action: () => (editor.listOpen = !editor.listOpen) },
            separator,
            { label: 'Подложка рядом с графом', checked: editor.compareOpen, action: () => (editor.compareOpen = !editor.compareOpen) },
            { label: 'Показать весь участок', hint: 'H', action: () => editor.fitRev++ },
            separator,
            { label: 'Светлая тема', checked: editor.theme === 'light', action: () => (editor.theme = 'light') },
            { label: 'Тёмная тема', checked: editor.theme === 'dark', action: () => (editor.theme = 'dark') },
        ],
    },
    {
        title: 'Сеть',
        items: [
            { label: 'Выбор', hint: 'V', checked: editor.tool === 'select', action: () => editor.setTool('select') },
            { label: 'Новая дорога', hint: 'D', checked: editor.tool === 'road', action: () => editor.setTool('road') },
            { label: 'Новый узел', hint: 'N', checked: editor.tool === 'node', action: () => editor.setTool('node') },
            { label: 'Разрезать дорогу', hint: 'X', checked: editor.tool === 'split', action: () => editor.setTool('split') },
            { label: 'Светофор', hint: 'T', checked: editor.tool === 'signal', action: () => editor.setTool('signal') },
            { label: 'Переход', hint: 'C', checked: editor.tool === 'crossing', action: () => editor.setTool('crossing') },
            { label: 'Участок скорости', hint: 'S', checked: editor.tool === 'speed', action: () => editor.setTool('speed') },
            { label: 'Лежачий полицейский', hint: 'L', checked: editor.tool === 'bump', action: () => editor.setTool('bump') },
            { label: 'Знак приоритета', hint: 'P', checked: editor.tool === 'sign', action: () => editor.setTool('sign') },
            { label: 'Мост', hint: 'B', checked: editor.tool === 'bridge', action: () => editor.setTool('bridge') },
            { label: 'Тоннель', hint: 'G', checked: editor.tool === 'tunnel', action: () => editor.setTool('tunnel') },
            separator,
            {
                label: 'Редактор узла',
                hint: 'E',
                disabled: editor.selectedNodes.length !== 1,
                action: () => {
                    const node = editor.selectedNodes[0];
                    if (node)
                        editor.openJunction(node.id);
                },
            },
            { label: 'Скрыть объекты по атрибутам', action: () => openLeft('filter') },
            { label: 'Проверка сети', action: () => openLeft('issues') },
        ],
    },
    {
        title: 'ОТ',
        items: [
            { label: 'Линии и маршруты', action: () => openLeft('transit') },
            { label: 'Показать все линии на карте', checked: editor.layers.transit, action: () => (editor.layers.transit = !editor.layers.transit) },
            separator,
            { label: 'Список линий', action: () => openList('lines') },
            { label: 'Список остановок', action: () => openList('stops') },
        ],
    },
    {
        title: 'Расчёты',
        items: [
            { label: 'Макромодель: загрузка сети', action: () => runSim('macro') },
            { label: 'Микромодель: движение машин', action: () => runSim('micro') },
            separator,
            { label: 'Список отрезков с результатами', action: () => openList('links') },
            { label: 'Районы', action: () => openList('zones') },
            { label: 'Матрица корреспонденций', action: () => openList('matrix') },
        ],
    },
    {
        title: 'Помощник',
        items: [
            { label: 'Открыть помощника', action: () => openAssistant() },
            { label: 'Подключение к модели', action: () => (assistant.settingsOpen = true) },
        ],
    },
    {
        title: 'Подложка',
        items: BASEMAP_OPTIONS.map((option) => ({
            label: option.label,
            checked: editor.basemap === option.id,
            action: () => (editor.basemap = option.id),
        })),
    },
    {
        title: 'Справка',
        items: [{ label: 'Горячие клавиши', hint: 'F1', action: () => (editor.helpOpen = true) }],
    },
]);
function choose(item) {
    if (item.disabled || !item.action)
        return;
    openMenu.value = null;
    item.action();
}
function onDocumentPointer(event) {
    if (openMenu.value && !root.value?.contains(event.target))
        openMenu.value = null;
}
function onKey(event) {
    if (event.key === 'Escape' && openMenu.value) {
        event.stopPropagation();
        openMenu.value = null;
    }
}
onMounted(() => {
    document.addEventListener('pointerdown', onDocumentPointer);
    document.addEventListener('keydown', onKey, true);
});
onBeforeUnmount(() => {
    document.removeEventListener('pointerdown', onDocumentPointer);
    document.removeEventListener('keydown', onKey, true);
});
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    __VLS_withDotValue(openMenu, {});
    __VLS_withDotValue(editor, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['title']} */ ;
    /** @type {__VLS_StyleScopedClasses['title']} */ ;
    /** @type {__VLS_StyleScopedClasses['item']} */ ;
    /** @type {__VLS_StyleScopedClasses['item']} */ ;
    /** @type {__VLS_StyleScopedClasses['hint']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.nav, __VLS_intrinsics.nav)({
        ref: "root",
        ...{ class: "menubar" },
        role: "menubar",
        'aria-label': "Главное меню",
    });
    /** @type {__VLS_StyleScopedClasses['menubar']} */ ;
    const __VLS_0 = __VLS_tryAsConstant((__VLS_unwrap(menus, {})));
    for (const [menu] of __VLS_vFor(__VLS_nonNull(__VLS_0))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            key: (menu.title),
            ...{ class: "menu" },
        });
        /** @type {__VLS_StyleScopedClasses['menu']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    void $event;
                    return (openMenu.value = openMenu.value === menu.title ? null : menu.title);
                    // @ts-ignore
                    [menus, openMenu, openMenu,];
                } },
            ...{ onMouseenter: (...[$event]) => {
                    void $event;
                    return (openMenu.value && (openMenu.value = menu.title));
                    // @ts-ignore
                    [openMenu, openMenu,];
                } },
            ...{ class: "title" },
            ...{ class: ({ open: openMenu.value === menu.title }) },
            role: "menuitem",
            'aria-haspopup': "true",
            'aria-expanded': (openMenu.value === menu.title),
        });
        /** @type {__VLS_StyleScopedClasses['title']} */ ;
        /** @type {__VLS_StyleScopedClasses['open']} */ ;
        (menu.title);
        if (openMenu.value === menu.title) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "dropdown" },
                role: "menu",
            });
            /** @type {__VLS_StyleScopedClasses['dropdown']} */ ;
            const __VLS_1 = __VLS_tryAsConstant((menu.items));
            for (const [item, index] of __VLS_vFor(__VLS_nonNull(__VLS_1))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.template)({
                    key: (index),
                });
                if (item.separator) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.hr)({});
                }
                else {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                        ...{ onClick: (...[$event]) => {
                                void $event;
                                if (!(openMenu.value === menu.title))
                                    throw 0;
                                if (!!(item.separator))
                                    throw 0;
                                return (choose(item));
                                // @ts-ignore
                                [openMenu, openMenu, openMenu,];
                            } },
                        ...{ class: "item" },
                        role: "menuitem",
                        disabled: (item.disabled),
                    });
                    /** @type {__VLS_StyleScopedClasses['item']} */ ;
                    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                        ...{ class: "mark" },
                    });
                    /** @type {__VLS_StyleScopedClasses['mark']} */ ;
                    (item.checked ? '✓' : '');
                    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                        ...{ class: "label" },
                    });
                    /** @type {__VLS_StyleScopedClasses['label']} */ ;
                    (item.label);
                    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                        ...{ class: "hint" },
                    });
                    /** @type {__VLS_StyleScopedClasses['hint']} */ ;
                    (item.hint);
                }
                // @ts-ignore
                [];
            }
        }
        // @ts-ignore
        [];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.span)({
        ...{ class: "spacer" },
    });
    /** @type {__VLS_StyleScopedClasses['spacer']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "project ellipsis" },
        title: (editor.value.projectName),
    });
    /** @type {__VLS_StyleScopedClasses['project']} */ ;
    /** @type {__VLS_StyleScopedClasses['ellipsis']} */ ;
    (editor.value.projectName);
    // @ts-ignore
    [editor, editor,];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
