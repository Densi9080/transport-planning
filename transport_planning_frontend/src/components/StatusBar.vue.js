import { computed } from 'vue';
import { useEditor } from '@/stores/editor';
const editor = useEditor();
const TOOL_HINTS = {
    select: 'Щелчок выбирает объект, Shift добавляет к выбору, двойной щелчок по узлу открывает редактор узла',
    road: 'Щелчки ставят точки и прилипают к дорогам. Enter или двойной щелчок завершает, Shift фиксирует угол, Alt отключает прилипание',
    node: 'Щелчок по дороге вставляет узел, по пустому месту создаёт отдельный',
    split: 'Щелчок по дороге или узлу разрезает дорогу на две',
    signal: 'Щелчок по узлу или дороге ставит или снимает светофор',
    crossing: 'Щелчок по узлу или дороге ставит или снимает пешеходный переход',
    bridge: 'Щелчок по дороге отмечает мост. Чтобы отметить часть, сначала разрежьте дорогу',
    tunnel: 'Щелчок по дороге отмечает тоннель. Чтобы отметить часть, сначала разрежьте дорогу',
    lineWay: 'Щёлкайте по дорогам по порядку следования маршрута',
    lineStop: 'Щелчок по дороге создаёт остановку, по существующему узлу добавляет её в маршрут',
};
const hint = computed(() => (editor.viewMode === 'sim' ? 'Режим расчёта: граф не редактируется. Пробел ставит микромодель на паузу' : (TOOL_HINTS[editor.tool] ?? '')));
const saveLabel = computed(() => {
    switch (editor.saveState) {
        case 'saving':
            return 'Сохранение…';
        case 'dirty':
            return 'Не сохранено';
        case 'error':
            return 'Ошибка сохранения';
        default:
            return 'Сохранено';
    }
});
const counts = computed(() => {
    void editor.rev;
    const doc = editor.doc;
    return doc ? `Узлов ${doc.nodes.size}  ·  Линий ${doc.ways.size}  ·  Отношений ${doc.relations.size}` : '';
});
const hiddenCount = computed(() => editor.hidden.ways.size + editor.hidden.nodes.size);
const position = computed(() => {
    const point = editor.cursor;
    return point ? `${point.lat.toFixed(6)}, ${point.lon.toFixed(6)}` : '';
});
/** Масштаб при экранном разрешении 96 точек на дюйм. */
const scale = computed(() => {
    const camera = editor.camera;
    if (!camera)
        return '';
    const metersPerPixel = (40_075_016.686 * Math.cos((camera.center[1] * Math.PI) / 180)) / (512 * 2 ** camera.zoom);
    const denominator = metersPerPixel * (96 / 0.0254);
    const rounded = denominator > 1000 ? Math.round(denominator / 100) * 100 : Math.round(denominator);
    return `1:${rounded.toLocaleString('ru-RU')}`;
});
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    __VLS_withDotValue(editor, {});
    __VLS_withDotValue(hiddenCount, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['cell']} */ ;
    /** @type {__VLS_StyleScopedClasses['cell']} */ ;
    /** @type {__VLS_StyleScopedClasses['cell']} */ ;
    /** @type {__VLS_StyleScopedClasses['cell']} */ ;
    /** @type {__VLS_StyleScopedClasses['cell']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.footer, __VLS_intrinsics.footer)({
        ...{ class: "statusbar" },
    });
    /** @type {__VLS_StyleScopedClasses['statusbar']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "hint ellipsis" },
    });
    /** @type {__VLS_StyleScopedClasses['hint']} */ ;
    /** @type {__VLS_StyleScopedClasses['ellipsis']} */ ;
    (__VLS_unwrap(hint, {}));
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "cell" },
        ...{ class: (editor.value.saveState) },
    });
    /** @type {__VLS_StyleScopedClasses['cell']} */ ;
    (__VLS_unwrap(saveLabel, {}));
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "cell" },
    });
    /** @type {__VLS_StyleScopedClasses['cell']} */ ;
    (editor.value.changeCount);
    if (hiddenCount.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "cell" },
        });
        /** @type {__VLS_StyleScopedClasses['cell']} */ ;
        (hiddenCount.value);
    }
    if (editor.value.errorCount) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    void $event;
                    if (!(editor.value.errorCount))
                        throw 0;
                    return ((editor.value.navigatorOpen = true), (editor.value.leftTab = 'issues'));
                    // @ts-ignore
                    [hint, editor, editor, editor, editor, editor, saveLabel, hiddenCount, hiddenCount,];
                } },
            ...{ class: "cell link" },
        });
        /** @type {__VLS_StyleScopedClasses['cell']} */ ;
        /** @type {__VLS_StyleScopedClasses['link']} */ ;
        (editor.value.errorCount);
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "cell wide" },
    });
    /** @type {__VLS_StyleScopedClasses['cell']} */ ;
    /** @type {__VLS_StyleScopedClasses['wide']} */ ;
    (__VLS_unwrap(counts, {}));
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "cell mono" },
    });
    /** @type {__VLS_StyleScopedClasses['cell']} */ ;
    /** @type {__VLS_StyleScopedClasses['mono']} */ ;
    (__VLS_unwrap(position, {}));
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "cell mono" },
    });
    /** @type {__VLS_StyleScopedClasses['cell']} */ ;
    /** @type {__VLS_StyleScopedClasses['mono']} */ ;
    (__VLS_unwrap(scale, {}));
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "cell mono" },
    });
    /** @type {__VLS_StyleScopedClasses['cell']} */ ;
    /** @type {__VLS_StyleScopedClasses['mono']} */ ;
    (editor.value.zoom.toFixed(1));
    // @ts-ignore
    [editor, editor, counts, position, scale,];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
