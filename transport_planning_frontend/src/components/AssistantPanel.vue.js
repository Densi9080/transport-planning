import { Check, CircleAlert, LoaderCircle, RotateCcw, Send, Settings, Sparkles, Square, X } from 'lucide-vue-next';
import { nextTick, onMounted, ref, watch } from 'vue';
import { useAssistant } from '@/stores/assistant';
import AssistantText from './AssistantText.vue';
const assistant = useAssistant();
const input = ref('');
const scroller = ref(null);
const EXAMPLES = [
    'Где самые загруженные участки утром и почему?',
    'Какие ошибки сети исправить в первую очередь?',
    'Что будет, если добавить полосу на самом загруженном участке?',
    'У каких дорог нет числа полос и скорости?',
];
function submit() {
    const text = input.value;
    if (!text.trim() || assistant.busy)
        return;
    input.value = '';
    void assistant.send(text);
}
function ask(text) {
    void assistant.send(text);
}
function onKey(event) {
    if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        submit();
    }
}
function proposalOf(item) {
    return item.kind === 'proposal' ? assistant.findProposal(item.proposalId) : undefined;
}
const STATUS_LABELS = { applied: 'Применено', undone: 'Отменено', rejected: 'Отклонено', failed: 'Не применено', pending: '' };
onMounted(() => void assistant.loadSettings());
watch(() => [assistant.timeline.length, assistant.busy], async () => {
    await nextTick();
    if (scroller.value)
        scroller.value.scrollTop = scroller.value.scrollHeight;
});
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    __VLS_withDotValue(assistant, {});
    __VLS_withDotValue(STATUS_LABELS, {});
    __VLS_withDotValue(input, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['connection']} */ ;
    /** @type {__VLS_StyleScopedClasses['setup']} */ ;
    /** @type {__VLS_StyleScopedClasses['example']} */ ;
    /** @type {__VLS_StyleScopedClasses['bubble']} */ ;
    /** @type {__VLS_StyleScopedClasses['step']} */ ;
    /** @type {__VLS_StyleScopedClasses['step']} */ ;
    /** @type {__VLS_StyleScopedClasses['error']} */ ;
    /** @type {__VLS_StyleScopedClasses['proposal']} */ ;
    /** @type {__VLS_StyleScopedClasses['proposal']} */ ;
    /** @type {__VLS_StyleScopedClasses['proposal']} */ ;
    /** @type {__VLS_StyleScopedClasses['proposal']} */ ;
    /** @type {__VLS_StyleScopedClasses['failed']} */ ;
    /** @type {__VLS_StyleScopedClasses['proposal']} */ ;
    /** @type {__VLS_StyleScopedClasses['composer']} */ ;
    /** @type {__VLS_StyleScopedClasses['composer']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "assistant" },
    });
    /** @type {__VLS_StyleScopedClasses['assistant']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "bar" },
    });
    /** @type {__VLS_StyleScopedClasses['bar']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "connection ellipsis" },
        ...{ class: ({ ok: assistant.value.settings?.configured }) },
        title: (assistant.value.settings?.baseUrl),
    });
    /** @type {__VLS_StyleScopedClasses['connection']} */ ;
    /** @type {__VLS_StyleScopedClasses['ellipsis']} */ ;
    /** @type {__VLS_StyleScopedClasses['ok']} */ ;
    (assistant.value.settings?.configured ? assistant.value.settings.model : 'Не подключён');
    __VLS_asFunctionalElement1(__VLS_intrinsics.span)({
        ...{ class: "spacer" },
    });
    /** @type {__VLS_StyleScopedClasses['spacer']} */ ;
    if (assistant.value.tokens) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
            ...{ class: "faint nums" },
            title: "Токенов потрачено в этом разговоре",
        });
        /** @type {__VLS_StyleScopedClasses['faint']} */ ;
        /** @type {__VLS_StyleScopedClasses['nums']} */ ;
        (assistant.value.tokens.toLocaleString('ru-RU'));
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (assistant.value.reset) },
        ...{ class: "btn ghost small" },
        title: "Новый разговор",
        'aria-label': "Новый разговор",
        disabled: (assistant.value.timeline.length === 0),
    });
    /** @type {__VLS_StyleScopedClasses['btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['ghost']} */ ;
    /** @type {__VLS_StyleScopedClasses['small']} */ ;
    let __VLS_0;
    /** @ts-ignore @type { | typeof RotateCcw} */
    RotateCcw;
    // @ts-ignore
    const __VLS_1 = __VLS_asFunctionalComponent1(__VLS_0, new __VLS_0({
        // @ts-ignore
        size: (13),
    }));
    const __VLS_2 = __VLS_1({
        size: (13),
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (...[$event]) => {
                void $event;
                return (assistant.value.settingsOpen = true);
                // @ts-ignore
                [assistant, assistant, assistant, assistant, assistant, assistant, assistant, assistant, assistant,];
            } },
        ...{ class: "btn ghost small" },
        title: "Подключение к модели",
        'aria-label': "Подключение к модели",
    });
    /** @type {__VLS_StyleScopedClasses['btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['ghost']} */ ;
    /** @type {__VLS_StyleScopedClasses['small']} */ ;
    let __VLS_5;
    /** @ts-ignore @type { | typeof Settings} */
    Settings;
    // @ts-ignore
    const __VLS_6 = __VLS_asFunctionalComponent1(__VLS_5, new __VLS_5({
        // @ts-ignore
        size: (13),
    }));
    const __VLS_7 = __VLS_6({
        size: (13),
    }, ...__VLS_functionalComponentArgsRest(__VLS_6));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ref: "scroller",
        ...{ class: "messages" },
        'aria-live': "polite",
    });
    /** @type {__VLS_StyleScopedClasses['messages']} */ ;
    if (assistant.value.settings && !assistant.value.settings.configured) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "setup" },
        });
        /** @type {__VLS_StyleScopedClasses['setup']} */ ;
        let __VLS_10;
        /** @ts-ignore @type { | typeof Sparkles} */
        Sparkles;
        // @ts-ignore
        const __VLS_11 = __VLS_asFunctionalComponent1(__VLS_10, new __VLS_10({
            // @ts-ignore
            size: (20), ...{ class: "faint" }, 'aria-hidden': "true",
        }));
        const __VLS_12 = __VLS_11({
            size: (20),
            ...{ class: "faint" },
            'aria-hidden': "true",
        }, ...__VLS_functionalComponentArgsRest(__VLS_11));
        /** @type {__VLS_StyleScopedClasses['faint']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (...[$event]) => {
                    void $event;
                    if (!(assistant.value.settings && !assistant.value.settings.configured))
                        throw 0;
                    return (assistant.value.settingsOpen = true);
                    // @ts-ignore
                    [assistant, assistant, assistant,];
                } },
            ...{ class: "btn primary" },
        });
        /** @type {__VLS_StyleScopedClasses['btn']} */ ;
        /** @type {__VLS_StyleScopedClasses['primary']} */ ;
    }
    else if (assistant.value.timeline.length === 0) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "start" },
        });
        /** @type {__VLS_StyleScopedClasses['start']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "muted" },
        });
        /** @type {__VLS_StyleScopedClasses['muted']} */ ;
        const __VLS_15 = __VLS_tryAsConstant((__VLS_unwrap(EXAMPLES, {})));
        for (const [example] of __VLS_vFor(__VLS_nonNull(__VLS_15))) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (...[$event]) => {
                        void $event;
                        if (!!(assistant.value.settings && !assistant.value.settings.configured))
                            throw 0;
                        if (!(assistant.value.timeline.length === 0))
                            throw 0;
                        return (ask(example));
                        // @ts-ignore
                        [assistant, EXAMPLES,];
                    } },
                key: (example),
                ...{ class: "example" },
                disabled: (assistant.value.busy),
            });
            /** @type {__VLS_StyleScopedClasses['example']} */ ;
            (example);
            // @ts-ignore
            [assistant,];
        }
    }
    const __VLS_16 = __VLS_tryAsConstant((assistant.value.timeline));
    for (const [item] of __VLS_vFor(__VLS_nonNull(__VLS_16))) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.template)({
            key: (item.id),
        });
        if (item.kind === 'user') {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "bubble user" },
            });
            /** @type {__VLS_StyleScopedClasses['bubble']} */ ;
            /** @type {__VLS_StyleScopedClasses['user']} */ ;
            (item.text);
        }
        else if (item.kind === 'assistant') {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "bubble" },
            });
            /** @type {__VLS_StyleScopedClasses['bubble']} */ ;
            const __VLS_17 = AssistantText;
            // @ts-ignore
            const __VLS_18 = __VLS_asFunctionalComponent1(__VLS_17, new __VLS_17({
                // @ts-ignore
                text: (item.text),
            }));
            const __VLS_19 = __VLS_18({
                text: (item.text),
            }, ...__VLS_functionalComponentArgsRest(__VLS_18));
        }
        else if (item.kind === 'error') {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "error" },
                role: "alert",
            });
            /** @type {__VLS_StyleScopedClasses['error']} */ ;
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
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
            (item.text);
        }
        else if (item.kind === 'note') {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "note faint" },
            });
            /** @type {__VLS_StyleScopedClasses['note']} */ ;
            /** @type {__VLS_StyleScopedClasses['faint']} */ ;
            (item.text);
        }
        else if (item.kind === 'step') {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "step" },
                ...{ class: ({ failed: item.failed }) },
            });
            /** @type {__VLS_StyleScopedClasses['step']} */ ;
            /** @type {__VLS_StyleScopedClasses['failed']} */ ;
            if (item.failed) {
                let __VLS_27;
                /** @ts-ignore @type { | typeof X} */
                X;
                // @ts-ignore
                const __VLS_28 = __VLS_asFunctionalComponent1(__VLS_27, new __VLS_27({
                    // @ts-ignore
                    size: (12), 'aria-hidden': "true",
                }));
                const __VLS_29 = __VLS_28({
                    size: (12),
                    'aria-hidden': "true",
                }, ...__VLS_functionalComponentArgsRest(__VLS_28));
            }
            else if (item.done) {
                let __VLS_32;
                /** @ts-ignore @type { | typeof Check} */
                Check;
                // @ts-ignore
                const __VLS_33 = __VLS_asFunctionalComponent1(__VLS_32, new __VLS_32({
                    // @ts-ignore
                    size: (12), 'aria-hidden': "true",
                }));
                const __VLS_34 = __VLS_33({
                    size: (12),
                    'aria-hidden': "true",
                }, ...__VLS_functionalComponentArgsRest(__VLS_33));
            }
            else {
                let __VLS_37;
                /** @ts-ignore @type { | typeof LoaderCircle} */
                LoaderCircle;
                // @ts-ignore
                const __VLS_38 = __VLS_asFunctionalComponent1(__VLS_37, new __VLS_37({
                    // @ts-ignore
                    size: (12), ...{ class: "spin" }, 'aria-hidden': "true",
                }));
                const __VLS_39 = __VLS_38({
                    size: (12),
                    ...{ class: "spin" },
                    'aria-hidden': "true",
                }, ...__VLS_functionalComponentArgsRest(__VLS_38));
                /** @type {__VLS_StyleScopedClasses['spin']} */ ;
            }
            __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
                ...{ class: "ellipsis" },
                title: (item.detail),
            });
            /** @type {__VLS_StyleScopedClasses['ellipsis']} */ ;
            (item.title);
            (item.failed && item.detail ? `: ${item.detail}` : '');
        }
        else if (proposalOf(item)) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                ...{ class: "proposal" },
                ...{ class: (proposalOf(item).status) },
            });
            /** @type {__VLS_StyleScopedClasses['proposal']} */ ;
            __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
            (proposalOf(item).title);
            if (proposalOf(item).reason) {
                const __VLS_42 = AssistantText;
                // @ts-ignore
                const __VLS_43 = __VLS_asFunctionalComponent1(__VLS_42, new __VLS_42({
                    // @ts-ignore
                    ...{ class: "reason" }, text: (proposalOf(item).reason),
                }));
                const __VLS_44 = __VLS_43({
                    ...{ class: "reason" },
                    text: (proposalOf(item).reason),
                }, ...__VLS_functionalComponentArgsRest(__VLS_43));
                /** @type {__VLS_StyleScopedClasses['reason']} */ ;
            }
            __VLS_asFunctionalElement1(__VLS_intrinsics.ul, __VLS_intrinsics.ul)({});
            const __VLS_47 = __VLS_tryAsConstant((proposalOf(item).lines));
            for (const [line, index] of __VLS_vFor(__VLS_nonNull(__VLS_47))) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({
                    key: (index),
                });
                (line);
                // @ts-ignore
                [assistant,];
            }
            if (proposalOf(item).status === 'pending') {
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ class: "row" },
                });
                /** @type {__VLS_StyleScopedClasses['row']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                    ...{ onClick: (...[$event]) => {
                            void $event;
                            if (!!(item.kind === 'user'))
                                throw 0;
                            if (!!(item.kind === 'assistant'))
                                throw 0;
                            if (!!(item.kind === 'error'))
                                throw 0;
                            if (!!(item.kind === 'note'))
                                throw 0;
                            if (!!(item.kind === 'step'))
                                throw 0;
                            if (!(proposalOf(item)))
                                throw 0;
                            if (!(proposalOf(item).status === 'pending'))
                                throw 0;
                            return (assistant.value.applyProposal(proposalOf(item).id));
                            // @ts-ignore
                            [assistant,];
                        } },
                    ...{ class: "btn primary small grow" },
                });
                /** @type {__VLS_StyleScopedClasses['btn']} */ ;
                /** @type {__VLS_StyleScopedClasses['primary']} */ ;
                /** @type {__VLS_StyleScopedClasses['small']} */ ;
                /** @type {__VLS_StyleScopedClasses['grow']} */ ;
                let __VLS_48;
                /** @ts-ignore @type { | typeof Check} */
                Check;
                // @ts-ignore
                const __VLS_49 = __VLS_asFunctionalComponent1(__VLS_48, new __VLS_48({
                    // @ts-ignore
                    size: (12), 'aria-hidden': "true",
                }));
                const __VLS_50 = __VLS_49({
                    size: (12),
                    'aria-hidden': "true",
                }, ...__VLS_functionalComponentArgsRest(__VLS_49));
                __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                    ...{ onClick: (...[$event]) => {
                            void $event;
                            if (!!(item.kind === 'user'))
                                throw 0;
                            if (!!(item.kind === 'assistant'))
                                throw 0;
                            if (!!(item.kind === 'error'))
                                throw 0;
                            if (!!(item.kind === 'note'))
                                throw 0;
                            if (!!(item.kind === 'step'))
                                throw 0;
                            if (!(proposalOf(item)))
                                throw 0;
                            if (!(proposalOf(item).status === 'pending'))
                                throw 0;
                            return (assistant.value.rejectProposal(proposalOf(item).id));
                            // @ts-ignore
                            [assistant,];
                        } },
                    ...{ class: "btn small" },
                });
                /** @type {__VLS_StyleScopedClasses['btn']} */ ;
                /** @type {__VLS_StyleScopedClasses['small']} */ ;
            }
            else {
                __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
                    ...{ class: "status" },
                });
                /** @type {__VLS_StyleScopedClasses['status']} */ ;
                (STATUS_LABELS.value[proposalOf(item).status]);
                if (proposalOf(item).error) {
                    (proposalOf(item).error);
                }
                if (proposalOf(item).status === 'applied' && assistant.value.canUndoProposal(proposalOf(item).id)) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                        ...{ onClick: (...[$event]) => {
                                void $event;
                                if (!!(item.kind === 'user'))
                                    throw 0;
                                if (!!(item.kind === 'assistant'))
                                    throw 0;
                                if (!!(item.kind === 'error'))
                                    throw 0;
                                if (!!(item.kind === 'note'))
                                    throw 0;
                                if (!!(item.kind === 'step'))
                                    throw 0;
                                if (!(proposalOf(item)))
                                    throw 0;
                                if (!!(proposalOf(item).status === 'pending'))
                                    throw 0;
                                if (!(proposalOf(item).status === 'applied' && assistant.value.canUndoProposal(proposalOf(item).id)))
                                    throw 0;
                                return (assistant.value.undoProposal(proposalOf(item).id));
                                // @ts-ignore
                                [assistant, assistant, STATUS_LABELS,];
                            } },
                        ...{ class: "link" },
                    });
                    /** @type {__VLS_StyleScopedClasses['link']} */ ;
                }
            }
        }
        // @ts-ignore
        [];
    }
    if (assistant.value.busy) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "thinking faint" },
        });
        /** @type {__VLS_StyleScopedClasses['thinking']} */ ;
        /** @type {__VLS_StyleScopedClasses['faint']} */ ;
        let __VLS_53;
        /** @ts-ignore @type { | typeof LoaderCircle} */
        LoaderCircle;
        // @ts-ignore
        const __VLS_54 = __VLS_asFunctionalComponent1(__VLS_53, new __VLS_53({
            // @ts-ignore
            size: (12), ...{ class: "spin" }, 'aria-hidden': "true",
        }));
        const __VLS_55 = __VLS_54({
            size: (12),
            ...{ class: "spin" },
            'aria-hidden': "true",
        }, ...__VLS_functionalComponentArgsRest(__VLS_54));
        /** @type {__VLS_StyleScopedClasses['spin']} */ ;
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.form, __VLS_intrinsics.form)({
        ...{ onSubmit: (submit) },
        ...{ class: "composer" },
    });
    /** @type {__VLS_StyleScopedClasses['composer']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.textarea)({
        ...{ onKeydown: (onKey) },
        value: (input.value),
        ...{ class: "input" },
        rows: "2",
        placeholder: "Спросите о сети или попросите проверить вариант",
        'aria-label': "Сообщение помощнику",
        disabled: (assistant.value.settings?.configured === false),
    });
    /** @type {__VLS_StyleScopedClasses['input']} */ ;
    if (assistant.value.busy) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ onClick: (assistant.value.stop) },
            ...{ class: "btn" },
            type: "button",
            'aria-label': "Остановить",
            title: "Остановить",
        });
        /** @type {__VLS_StyleScopedClasses['btn']} */ ;
        let __VLS_58;
        /** @ts-ignore @type { | typeof Square} */
        Square;
        // @ts-ignore
        const __VLS_59 = __VLS_asFunctionalComponent1(__VLS_58, new __VLS_58({
            // @ts-ignore
            size: (14),
        }));
        const __VLS_60 = __VLS_59({
            size: (14),
        }, ...__VLS_functionalComponentArgsRest(__VLS_59));
    }
    else {
        __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
            ...{ class: "btn primary" },
            type: "submit",
            'aria-label': "Отправить",
            title: "Отправить (Enter)",
            disabled: (!input.value.trim()),
        });
        /** @type {__VLS_StyleScopedClasses['btn']} */ ;
        /** @type {__VLS_StyleScopedClasses['primary']} */ ;
        let __VLS_63;
        /** @ts-ignore @type { | typeof Send} */
        Send;
        // @ts-ignore
        const __VLS_64 = __VLS_asFunctionalComponent1(__VLS_63, new __VLS_63({
            // @ts-ignore
            size: (14),
        }));
        const __VLS_65 = __VLS_64({
            size: (14),
        }, ...__VLS_functionalComponentArgsRest(__VLS_64));
    }
    // @ts-ignore
    [assistant, assistant, assistant, assistant, input, input,];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
