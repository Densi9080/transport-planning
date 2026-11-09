import { FileUp, History, Map as MapIcon, Route } from 'lucide-vue-next';
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { createSampleProject, listProjects, uploadProject } from '@/api';
const router = useRouter();
const recent = ref([]);
const error = ref(null);
const busy = ref(false);
const dragOver = ref(false);
const input = ref(null);
onMounted(async () => {
    try {
        recent.value = await listProjects();
    }
    catch {
        error.value = 'Сервер недоступен. Запустите бэкенд: python manage.py runserver';
    }
});
async function run(action) {
    busy.value = true;
    error.value = null;
    try {
        const project = await action();
        await router.push({ name: 'editor', params: { id: project.id } });
    }
    catch (reason) {
        error.value = reason instanceof Error ? reason.message : String(reason);
    }
    finally {
        busy.value = false;
    }
}
function openFile(file) {
    if (file)
        void run(() => uploadProject(file));
}
function onDrop(event) {
    dragOver.value = false;
    openFile(event.dataTransfer?.files[0]);
}
function formatDate(value) {
    return new Date(value).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' });
}
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    __VLS_withDotValue(input, {});
    __VLS_withDotValue(dragOver, {});
    __VLS_withDotValue(busy, {});
    __VLS_withDotValue(error, {});
    __VLS_withDotValue(recent, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['drop']} */ ;
    /** @type {__VLS_StyleScopedClasses['drop']} */ ;
    /** @type {__VLS_StyleScopedClasses['drop']} */ ;
    /** @type {__VLS_StyleScopedClasses['recent']} */ ;
    /** @type {__VLS_StyleScopedClasses['recent-item']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.main, __VLS_intrinsics.main)({
        ...{ class: "start" },
    });
    /** @type {__VLS_StyleScopedClasses['start']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "start-card" },
    });
    /** @type {__VLS_StyleScopedClasses['start-card']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.header, __VLS_intrinsics.header)({});
    let __VLS_0;
    /** @ts-ignore @type { | typeof Route} */
    Route;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
        // @ts-ignore
        size: (26), ...{ class: "logo" }, 'aria-hidden': "true",
    }));
    const __VLS_2 = __VLS_1({
        size: (26),
        ...{ class: "logo" },
        'aria-hidden': "true",
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    /** @type {__VLS_StyleScopedClasses['logo']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.h1, __VLS_intrinsics.h1)({});
    __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
        ...{ class: "muted" },
    });
    /** @type {__VLS_StyleScopedClasses['muted']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                void $event;
                return (input.value?.click());
                // @ts-ignore
                [input,];
            } },
        ...{ onDragover: (...[$event]) => {
                void $event;
                return (dragOver.value = true);
                // @ts-ignore
                [dragOver,];
            } },
        ...{ onDragleave: (...[$event]) => {
                void $event;
                return (dragOver.value = false);
                // @ts-ignore
                [dragOver,];
            } },
        ...{ onDrop: (onDrop) },
        ...{ class: "drop" },
        ...{ class: ({ over: dragOver.value }) },
        disabled: (busy.value),
    });
    /** @type {__VLS_StyleScopedClasses['drop']} */ ;
    /** @type {__VLS_StyleScopedClasses['over']} */ ;
    let __VLS_5;
    /** @ts-ignore @type { | typeof FileUp} */
    FileUp;
    // @ts-ignore
    const __VLS_6 = __VLS_asFunctionalComponent1(__VLS_5, new __VLS_5({
        // @ts-ignore
        size: (28), 'aria-hidden': "true",
    }));
    const __VLS_7 = __VLS_6({
        size: (28),
        'aria-hidden': "true",
    }, ...__VLS_functionalComponentArgsRest(__VLS_6));
    __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
    (busy.value ? 'Открываем файл…' : 'Выберите .osm или перетащите его сюда');
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "faint" },
    });
    /** @type {__VLS_StyleScopedClasses['faint']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        ...{ onChange: (...[$event]) => {
                void $event;
                return (openFile($event.target.files?.[0]));
                // @ts-ignore
                [dragOver, busy, busy,];
            } },
        ref: "input",
        type: "file",
        accept: ".osm,.xml",
        hidden: true,
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                void $event;
                return (run(__VLS_unwrap(createSampleProject, {})));
                // @ts-ignore
                [createSampleProject,];
            } },
        ...{ class: "btn block" },
        disabled: (busy.value),
    });
    /** @type {__VLS_StyleScopedClasses['btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['block']} */ ;
    let __VLS_10;
    /** @ts-ignore @type { | typeof MapIcon} */
    MapIcon;
    // @ts-ignore
    const __VLS_11 = __VLS_asFunctionalComponent1(__VLS_10, new __VLS_10({
        // @ts-ignore
        size: (15), 'aria-hidden': "true",
    }));
    const __VLS_12 = __VLS_11({
        size: (15),
        'aria-hidden': "true",
    }, ...__VLS_functionalComponentArgsRest(__VLS_11));
    if (error.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "error" },
            role: "alert",
        });
        /** @type {__VLS_StyleScopedClasses['error']} */ ;
        (error.value);
    }
    if (recent.value.length) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.section, __VLS_intrinsics.section)({
            ...{ class: "recent" },
        });
        /** @type {__VLS_StyleScopedClasses['recent']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "eyebrow row" },
        });
        /** @type {__VLS_StyleScopedClasses['eyebrow']} */ ;
        /** @type {__VLS_StyleScopedClasses['row']} */ ;
        let __VLS_15;
        /** @ts-ignore @type { | typeof History} */
        History;
        // @ts-ignore
        const __VLS_16 = __VLS_asFunctionalComponent1(__VLS_15, new __VLS_15({
            // @ts-ignore
            size: (12), 'aria-hidden': "true",
        }));
        const __VLS_17 = __VLS_16({
            size: (12),
            'aria-hidden': "true",
        }, ...__VLS_functionalComponentArgsRest(__VLS_16));
        const __VLS_20 = __VLS_tryAsConstant((recent.value.slice(0, 6)));
        for (const [project] of __VLS_vFor(__VLS_nonNull(__VLS_20))) {
            let __VLS_21;
            /** @ts-ignore @type { | typeof __VLS_components.RouterLink | typeof __VLS_components.RouterLink} */
            RouterLink;
            // @ts-ignore
            const __VLS_22 = __VLS_asFunctionalComponent1(__VLS_21, new __VLS_21({
                // @ts-ignore
                key: (project.id), to: ({ name: 'editor', params: { id: project.id } }), ...{ class: "recent-item" },
            }));
            const __VLS_23 = __VLS_22({
                key: (project.id),
                to: ({ name: 'editor', params: { id: project.id } }),
                ...{ class: "recent-item" },
            }, ...__VLS_functionalComponentArgsRest(__VLS_22));
            /** @type {__VLS_StyleScopedClasses['recent-item']} */ ;
            var __VLS_24;
            const { default: __VLS_26 } = __VLS_nonNull(__VLS_24.slots);
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
            (project.name);
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "faint" },
            });
            /** @type {__VLS_StyleScopedClasses['faint']} */ ;
            (formatDate(project.updatedAt));
            // @ts-ignore
            [busy, error, error, recent, recent,];
            // @ts-ignore
            [];
        }
    }
    // @ts-ignore
    [];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
