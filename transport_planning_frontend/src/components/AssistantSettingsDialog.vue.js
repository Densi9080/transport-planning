import { Check, CircleAlert, Cloud, HardDrive, X } from 'lucide-vue-next';
import { computed, onMounted, ref } from 'vue';
import { useAssistant } from '@/stores/assistant';
const assistant = useAssistant();
const dialog = ref(null);
const PRESETS = [
    { id: 'openai', label: 'OpenAI', url: 'https://api.openai.com/v1', local: false },
    { id: 'ollama', label: 'Ollama', url: 'http://localhost:11434/v1', local: true },
    { id: 'lmstudio', label: 'LM Studio', url: 'http://localhost:1234/v1', local: true },
];
const baseUrl = ref(assistant.settings?.baseUrl ?? '');
const model = ref(assistant.settings?.model ?? '');
const apiKey = ref('');
const models = ref([]);
const testing = ref(false);
const saving = ref(false);
const result = ref(null);
const locked = computed(() => assistant.settings?.locked ?? false);
const hasKey = computed(() => assistant.settings?.hasKey ?? false);
/** Адрес на этом же компьютере: ключ обычно не нужен, а данные никуда не уходят. */
const isLocal = computed(() => {
    try {
        const host = new URL(baseUrl.value).hostname;
        return ['localhost', '127.0.0.1', '::1', '[::1]', 'host.docker.internal'].includes(host) || host.endsWith('.local');
    }
    catch {
        return false;
    }
});
function choose(preset) {
    baseUrl.value = preset.url;
    result.value = null;
    models.value = [];
}
function close() {
    assistant.settingsOpen = false;
}
async function test() {
    testing.value = true;
    result.value = null;
    try {
        const answer = await assistant.testConnection({ baseUrl: baseUrl.value, apiKey: apiKey.value });
        models.value = answer.models;
        result.value = {
            ok: true,
            text: answer.models.length > 0 ? `Подключение работает. Доступно моделей: ${answer.models.length}` : 'Подключение работает, но сервис не вернул список моделей',
        };
        if (!model.value && answer.models.length === 1)
            model.value = answer.models[0];
    }
    catch (error) {
        result.value = { ok: false, text: error instanceof Error ? error.message : String(error) };
    }
    finally {
        testing.value = false;
    }
}
async function save() {
    saving.value = true;
    result.value = null;
    try {
        await assistant.saveSettings({ baseUrl: baseUrl.value, model: model.value, ...(apiKey.value ? { apiKey: apiKey.value } : {}) });
        close();
    }
    catch (error) {
        result.value = { ok: false, text: error instanceof Error ? error.message : String(error) };
    }
    finally {
        saving.value = false;
    }
}
async function clearKey() {
    try {
        await assistant.saveSettings({ clearKey: true });
        apiKey.value = '';
        result.value = { ok: true, text: 'Ключ удалён с сервера' };
    }
    catch (error) {
        result.value = { ok: false, text: error instanceof Error ? error.message : String(error) };
    }
}
onMounted(() => dialog.value?.showModal());
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    __VLS_withDotValue(locked, {});
    __VLS_withDotValue(baseUrl, {});
    __VLS_withDotValue(isLocal, {});
    __VLS_withDotValue(hasKey, {});
    __VLS_withDotValue(testing, {});
    __VLS_withDotValue(result, {});
    __VLS_withDotValue(saving, {});
    __VLS_withDotValue(model, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['dialog']} */ ;
    /** @type {__VLS_StyleScopedClasses['hint']} */ ;
    /** @type {__VLS_StyleScopedClasses['result']} */ ;
    /** @type {__VLS_StyleScopedClasses['result']} */ ;
    /** @type {__VLS_StyleScopedClasses['result']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.dialog, __VLS_intrinsics.dialog)({
        ...{ onClose: (close) },
        ref: "dialog",
        ...{ class: "dialog" },
        'aria-labelledby': "assistant-settings-title",
    });
    /** @type {__VLS_StyleScopedClasses['dialog']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "dock-title" },
    });
    /** @type {__VLS_StyleScopedClasses['dock-title']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        id: "assistant-settings-title",
    });
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
    __VLS_asFunctionalElement1(__VLS_intrinsics.form, __VLS_intrinsics.form)({
        ...{ onSubmit: (save) },
        ...{ class: "content" },
    });
    /** @type {__VLS_StyleScopedClasses['content']} */ ;
    if (locked.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "muted" },
        });
        /** @type {__VLS_StyleScopedClasses['muted']} */ ;
    }
    if (!locked.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "field" },
        });
        /** @type {__VLS_StyleScopedClasses['field']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "presets" },
        });
        /** @type {__VLS_StyleScopedClasses['presets']} */ ;
        const __VLS_5 = __VLS_tryAsConstant((__VLS_unwrap(PRESETS, {})));
        for (const [preset] of __VLS_vFor(__VLS_nonNull(__VLS_5))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        void $event;
                        if (!(!locked.value))
                            throw 0;
                        return (choose(preset));
                        // @ts-ignore
                        [locked, locked, PRESETS,];
                    } },
                key: (preset.id),
                type: "button",
                ...{ class: "btn" },
                ...{ class: ({ on: baseUrl.value === preset.url }) },
            });
            /** @type {__VLS_StyleScopedClasses['btn']} */ ;
            /** @type {__VLS_StyleScopedClasses['on']} */ ;
            if (preset.local) {
                let __VLS_6;
                /** @ts-ignore @type { | typeof HardDrive} */
                HardDrive;
                // @ts-ignore
                const __VLS_7 = __VLS_asFunctionalComponent1(__VLS_6, new __VLS_6({
                    // @ts-ignore
                    size: (13), 'aria-hidden': "true",
                }));
                const __VLS_8 = __VLS_7({
                    size: (13),
                    'aria-hidden': "true",
                }, ...__VLS_functionalComponentArgsRest(__VLS_7));
            }
            else {
                let __VLS_11;
                /** @ts-ignore @type { | typeof Cloud} */
                Cloud;
                // @ts-ignore
                const __VLS_12 = __VLS_asFunctionalComponent1(__VLS_11, new __VLS_11({
                    // @ts-ignore
                    size: (13), 'aria-hidden': "true",
                }));
                const __VLS_13 = __VLS_12({
                    size: (13),
                    'aria-hidden': "true",
                }, ...__VLS_functionalComponentArgsRest(__VLS_12));
            }
            (preset.label);
            // @ts-ignore
            [baseUrl,];
        }
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "field" },
    });
    /** @type {__VLS_StyleScopedClasses['field']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
        for: "llm-url",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        id: "llm-url",
        ...{ class: "input" },
        disabled: (locked.value),
        placeholder: "https://…/v1",
        autocomplete: "off",
        spellcheck: "false",
    });
    (baseUrl.value);
    /** @type {__VLS_StyleScopedClasses['input']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "hint" },
        ...{ class: (isLocal.value ? 'local' : '') },
    });
    /** @type {__VLS_StyleScopedClasses['hint']} */ ;
    if (isLocal.value) {
    }
    else if (baseUrl.value) {
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "field" },
    });
    /** @type {__VLS_StyleScopedClasses['field']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
        for: "llm-key",
    });
    if (isLocal.value) {
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "row" },
    });
    /** @type {__VLS_StyleScopedClasses['row']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        id: "llm-key",
        ...{ class: "input" },
        type: "password",
        disabled: (locked.value),
        placeholder: (hasKey.value ? 'Ключ сохранён на сервере. Оставьте пустым, чтобы не менять' : 'Не задан'),
        autocomplete: "new-password",
    });
    (__VLS_unwrap(apiKey, {}));
    /** @type {__VLS_StyleScopedClasses['input']} */ ;
    if (hasKey.value && !locked.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (clearKey) },
            type: "button",
            ...{ class: "btn" },
        });
        /** @type {__VLS_StyleScopedClasses['btn']} */ ;
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "hint" },
    });
    /** @type {__VLS_StyleScopedClasses['hint']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "field" },
    });
    /** @type {__VLS_StyleScopedClasses['field']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
        for: "llm-model",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "row" },
    });
    /** @type {__VLS_StyleScopedClasses['row']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        id: "llm-model",
        ...{ class: "input" },
        list: "llm-models",
        disabled: (locked.value),
        placeholder: "Название модели",
        autocomplete: "off",
        spellcheck: "false",
    });
    (model.value);
    /** @type {__VLS_StyleScopedClasses['input']} */ ;
    if (!locked.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (test) },
            type: "button",
            ...{ class: "btn" },
            disabled: (testing.value || !baseUrl.value.trim()),
        });
        /** @type {__VLS_StyleScopedClasses['btn']} */ ;
        (testing.value ? 'Проверка…' : 'Проверить');
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.datalist, __VLS_intrinsics.datalist)({
        id: "llm-models",
    });
    const __VLS_16 = __VLS_tryAsConstant((__VLS_unwrap(models, {})));
    for (const [item] of __VLS_vFor(__VLS_nonNull(__VLS_16))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.option)({
            key: (item),
            value: (item),
        });
        // @ts-ignore
        [locked, locked, locked, locked, locked, baseUrl, baseUrl, baseUrl, isLocal, isLocal, isLocal, hasKey, hasKey, apiKey, model, testing, testing, models,];
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "hint" },
    });
    /** @type {__VLS_StyleScopedClasses['hint']} */ ;
    if (result.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "result" },
            ...{ class: (result.value.ok ? 'ok' : 'fail') },
            role: "status",
        });
        /** @type {__VLS_StyleScopedClasses['result']} */ ;
        if (result.value.ok) {
            let __VLS_17;
            /** @ts-ignore @type { | typeof Check} */
            Check;
            // @ts-ignore
            const __VLS_18 = __VLS_asFunctionalComponent1(__VLS_17, new __VLS_17({
                // @ts-ignore
                size: (13), 'aria-hidden': "true",
            }));
            const __VLS_19 = __VLS_18({
                size: (13),
                'aria-hidden': "true",
            }, ...__VLS_functionalComponentArgsRest(__VLS_18));
        }
        else {
            let __VLS_22;
            /** @ts-ignore @type { | typeof CircleAlert} */
            CircleAlert;
            // @ts-ignore
            const __VLS_23 = __VLS_asFunctionalComponent1(__VLS_22, new __VLS_22({
                // @ts-ignore
                size: (13), 'aria-hidden': "true",
            }));
            const __VLS_24 = __VLS_23({
                size: (13),
                'aria-hidden': "true",
            }, ...__VLS_functionalComponentArgsRest(__VLS_23));
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        (result.value.text);
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "actions" },
    });
    /** @type {__VLS_StyleScopedClasses['actions']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (close) },
        type: "button",
        ...{ class: "btn" },
    });
    /** @type {__VLS_StyleScopedClasses['btn']} */ ;
    if (!locked.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            type: "submit",
            ...{ class: "btn primary" },
            disabled: (saving.value || !baseUrl.value.trim() || !model.value.trim()),
        });
        /** @type {__VLS_StyleScopedClasses['btn']} */ ;
        /** @type {__VLS_StyleScopedClasses['primary']} */ ;
    }
    // @ts-ignore
    [locked, baseUrl, model, result, result, result, result, saving,];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
