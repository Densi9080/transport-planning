import { AlertCircle, CheckCircle2, Download, FlaskConical, X } from 'lucide-vue-next';
import { computed, onMounted, ref } from 'vue';
import { exportOsm, runPreflight } from '@/api';
import { connectivityReport } from '@/core/validate';
import { useEditor } from '@/stores/editor';
const TEAM_KEY = 'osm-editor-team-file';
const editor = useEditor();
const dialog = ref(null);
const busy = ref(false);
const checking = ref(false);
const preflight = ref(null);
const error = ref(null);
function readStoredName() {
    try {
        return localStorage.getItem(TEAM_KEY);
    }
    catch {
        return null;
    }
}
const fileName = ref(readStoredName() ?? editor.projectName.replace(/\.osm$/i, '') + '_edited');
const connectivity = computed(() => {
    void editor.rev;
    return editor.doc ? connectivityReport(editor.doc) : null;
});
/** Сохранить файл с ошибками можно, но только осознанно: от этого зависит допуск. */
const acknowledged = ref(false);
const needsAcknowledge = computed(() => counts.value.error > 0 || (connectivity.value ? !connectivity.value.ok : false));
function showConnectivityProblems() {
    const report = connectivity.value;
    if (!report)
        return;
    const first = report.isolatedWays[0] ?? report.oneDirectionWays[0];
    if (first !== undefined) {
        editor.select([...report.isolatedWays, ...report.oneDirectionWays].slice(0, 12).map((id) => ({ kind: 'way', id })));
        editor.focusOn(editor.doc.node(editor.doc.way(first).nds[0]), 16.5);
        close();
    }
}
const counts = computed(() => {
    const result = { error: 0, warning: 0 };
    for (const issue of editor.issues) {
        if (issue.severity === 'error')
            result.error++;
        else if (issue.severity === 'warning')
            result.warning++;
    }
    return result;
});
const cleanName = computed(() => {
    const stem = fileName.value
        .trim()
        .replace(/\.osm$/i, '')
        .replace(/[\\/:*?"<>|]/g, '_');
    return stem ? `${stem}.osm` : 'graph.osm';
});
function close() {
    editor.exportOpen = false;
}
async function download() {
    if (!editor.doc || !editor.projectId)
        return;
    busy.value = true;
    error.value = null;
    try {
        editor.runValidation();
        const blob = await exportOsm(editor.projectId, editor.doc.changes());
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = cleanName.value;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        try {
            localStorage.setItem(TEAM_KEY, fileName.value);
        }
        catch {
            // Без браузерного хранилища имя просто не запомнится
        }
        editor.toast(`Файл ${cleanName.value} сохранён`, 'success');
        close();
    }
    catch (reason) {
        error.value = reason instanceof Error ? reason.message : String(reason);
    }
    finally {
        busy.value = false;
    }
}
async function check() {
    if (!editor.doc || !editor.projectId)
        return;
    checking.value = true;
    error.value = null;
    preflight.value = null;
    try {
        preflight.value = await runPreflight(editor.projectId, editor.doc.changes());
    }
    catch (reason) {
        error.value = reason instanceof Error ? reason.message : String(reason);
    }
    finally {
        checking.value = false;
    }
}
onMounted(() => dialog.value?.showModal());
const __VLS_ctx = {};
let __VLS_components;
let __VLS_intrinsics;
let __VLS_directives;
void __VLS_ctx, __VLS_components, __VLS_intrinsics, __VLS_directives;
const __VLS_template = () => {
    __VLS_withDotValue(counts, {});
    __VLS_withDotValue(editor, {});
    __VLS_withDotValue(connectivity, {});
    __VLS_withDotValue(checking, {});
    __VLS_withDotValue(preflight, {});
    __VLS_withDotValue(error, {});
    __VLS_withDotValue(needsAcknowledge, {});
    __VLS_withDotValue(busy, {});
    __VLS_withDotValue(acknowledged, {});
    void {};
    /** @type {__VLS_StyleScopedClasses['dialog']} */ ;
    /** @type {__VLS_StyleScopedClasses['dialog']} */ ;
    /** @type {__VLS_StyleScopedClasses['ack']} */ ;
    /** @type {__VLS_StyleScopedClasses['status']} */ ;
    /** @type {__VLS_StyleScopedClasses['status']} */ ;
    /** @type {__VLS_StyleScopedClasses['status']} */ ;
    /** @type {__VLS_StyleScopedClasses['preflight']} */ ;
    /** @type {__VLS_StyleScopedClasses['result']} */ ;
    /** @type {__VLS_StyleScopedClasses['fail']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.dialog, __VLS_intrinsics.dialog)({
        ...{ onClose: (close) },
        ref: "dialog",
        ...{ class: "dialog" },
        'aria-labelledby': "export-title",
    });
    /** @type {__VLS_StyleScopedClasses['dialog']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "head" },
    });
    /** @type {__VLS_StyleScopedClasses['head']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.h2, __VLS_intrinsics.h2)({
        id: "export-title",
    });
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
        size: (15),
    }));
    const __VLS_2 = __VLS_1({
        size: (15),
    }, ...__VLS_functionalComponentArgsRest(__VLS_1));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "field" },
    });
    /** @type {__VLS_StyleScopedClasses['field']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
        for: "export-name",
    });
    __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
        id: "export-name",
        ...{ class: "input" },
    });
    (__VLS_unwrap(fileName, {}));
    /** @type {__VLS_StyleScopedClasses['input']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({
        ...{ class: "faint small" },
    });
    /** @type {__VLS_StyleScopedClasses['faint']} */ ;
    /** @type {__VLS_StyleScopedClasses['small']} */ ;
    (__VLS_unwrap(cleanName, {}));
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "status" },
        ...{ class: (counts.value.error ? 'bad' : 'good') },
    });
    /** @type {__VLS_StyleScopedClasses['status']} */ ;
    if (counts.value.error) {
        let __VLS_5;
        /** @ts-ignore @type { | typeof AlertCircle} */
        AlertCircle;
        // @ts-ignore
        const __VLS_6 = __VLS_asFunctionalComponent1(__VLS_5, new __VLS_5({
            // @ts-ignore
            size: (15), 'aria-hidden': "true",
        }));
        const __VLS_7 = __VLS_6({
            size: (15),
            'aria-hidden': "true",
        }, ...__VLS_functionalComponentArgsRest(__VLS_6));
    }
    else {
        let __VLS_10;
        /** @ts-ignore @type { | typeof CheckCircle2} */
        CheckCircle2;
        // @ts-ignore
        const __VLS_11 = __VLS_asFunctionalComponent1(__VLS_10, new __VLS_10({
            // @ts-ignore
            size: (15), 'aria-hidden': "true",
        }));
        const __VLS_12 = __VLS_11({
            size: (15),
            'aria-hidden': "true",
        }, ...__VLS_functionalComponentArgsRest(__VLS_11));
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
    (editor.value.changeCount);
    (counts.value.error);
    (counts.value.warning);
    if (counts.value.error) {
    }
    if (connectivity.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
            ...{ class: "status" },
            ...{ class: (connectivity.value.ok ? 'good' : 'bad') },
        });
        /** @type {__VLS_StyleScopedClasses['status']} */ ;
        if (connectivity.value.ok) {
            let __VLS_15;
            /** @ts-ignore @type { | typeof CheckCircle2} */
            CheckCircle2;
            // @ts-ignore
            const __VLS_16 = __VLS_asFunctionalComponent1(__VLS_15, new __VLS_15({
                // @ts-ignore
                size: (15), 'aria-hidden': "true",
            }));
            const __VLS_17 = __VLS_16({
                size: (15),
                'aria-hidden': "true",
            }, ...__VLS_functionalComponentArgsRest(__VLS_16));
        }
        else {
            let __VLS_20;
            /** @ts-ignore @type { | typeof AlertCircle} */
            AlertCircle;
            // @ts-ignore
            const __VLS_21 = __VLS_asFunctionalComponent1(__VLS_20, new __VLS_20({
                // @ts-ignore
                size: (15), 'aria-hidden': "true",
            }));
            const __VLS_22 = __VLS_21({
                size: (15),
                'aria-hidden': "true",
            }, ...__VLS_functionalComponentArgsRest(__VLS_21));
        }
        __VLS_asFunctionalElement1(__VLS_intrinsics.span, __VLS_intrinsics.span)({});
        __VLS_asFunctionalElement1(__VLS_intrinsics.strong, __VLS_intrinsics.strong)({});
        (connectivity.value.totalWays);
        (connectivity.value.components);
        if (connectivity.value.ok) {
        }
        else {
            (connectivity.value.isolatedWays.length);
            (connectivity.value.oneDirectionWays.length);
            __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
                ...{ onClick: (showConnectivityProblems) },
                ...{ class: "link" },
            });
            /** @type {__VLS_StyleScopedClasses['link']} */ ;
        }
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "preflight" },
    });
    /** @type {__VLS_StyleScopedClasses['preflight']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (check) },
        ...{ class: "btn block" },
        disabled: (checking.value),
    });
    /** @type {__VLS_StyleScopedClasses['btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['block']} */ ;
    let __VLS_25;
    /** @ts-ignore @type { | typeof FlaskConical} */
    FlaskConical;
    // @ts-ignore
    const __VLS_26 = __VLS_asFunctionalComponent1(__VLS_25, new __VLS_25({
        // @ts-ignore
        size: (14), 'aria-hidden': "true",
    }));
    const __VLS_27 = __VLS_26({
        size: (14),
        'aria-hidden': "true",
    }, ...__VLS_functionalComponentArgsRest(__VLS_26));
    (checking.value ? 'Собираем сеть…' : 'Проверить сборкой в SUMO (netconvert)');
    if (preflight.value) {
        if (!preflight.value.available) {
            __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                ...{ class: "muted small" },
            });
            /** @type {__VLS_StyleScopedClasses['muted']} */ ;
            /** @type {__VLS_StyleScopedClasses['small']} */ ;
            (preflight.value.message);
        }
        else {
            __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                ...{ class: "result small" },
                ...{ class: (preflight.value.ok ? 'ok' : 'fail') },
            });
            /** @type {__VLS_StyleScopedClasses['result']} */ ;
            /** @type {__VLS_StyleScopedClasses['small']} */ ;
            (preflight.value.ok ? 'Сеть собралась' : 'Сеть не собралась');
            if (preflight.value.stats) {
                (preflight.value.stats.edges);
                (preflight.value.stats.lanes);
                (preflight.value.stats.junctions);
                (preflight.value.stats.tls);
            }
            (preflight.value.warningCount ?? 0);
            if (preflight.value.errors?.length) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.ul, __VLS_intrinsics.ul)({
                    ...{ class: "log small" },
                });
                /** @type {__VLS_StyleScopedClasses['log']} */ ;
                /** @type {__VLS_StyleScopedClasses['small']} */ ;
                const __VLS_30 = __VLS_tryAsConstant((preflight.value.errors.slice(0, 20)));
                for (const [line, index] of __VLS_vFor(__VLS_nonNull(__VLS_30))) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({
                        key: (index),
                        ...{ class: "fail" },
                    });
                    /** @type {__VLS_StyleScopedClasses['fail']} */ ;
                    (line);
                    // @ts-ignore
                    [fileName, cleanName, counts, counts, counts, counts, counts, editor, connectivity, connectivity, connectivity, connectivity, connectivity, connectivity, connectivity, connectivity, checking, checking, preflight, preflight, preflight, preflight, preflight, preflight, preflight, preflight, preflight, preflight, preflight, preflight, preflight,];
                }
            }
            if (preflight.value.warnings?.length) {
                __VLS_asFunctionalElement1(__VLS_intrinsics.details, __VLS_intrinsics.details)({
                    ...{ class: "small" },
                });
                /** @type {__VLS_StyleScopedClasses['small']} */ ;
                __VLS_asFunctionalElement1(__VLS_intrinsics.summary, __VLS_intrinsics.summary)({});
                __VLS_asFunctionalElement1(__VLS_intrinsics.ul, __VLS_intrinsics.ul)({
                    ...{ class: "log" },
                });
                /** @type {__VLS_StyleScopedClasses['log']} */ ;
                const __VLS_31 = __VLS_tryAsConstant((preflight.value.warnings.slice(0, 100)));
                for (const [line, index] of __VLS_vFor(__VLS_nonNull(__VLS_31))) {
                    __VLS_asFunctionalElement1(__VLS_intrinsics.li, __VLS_intrinsics.li)({
                        key: (index),
                    });
                    (line);
                    // @ts-ignore
                    [preflight, preflight,];
                }
            }
            __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
                ...{ class: "faint small" },
            });
            /** @type {__VLS_StyleScopedClasses['faint']} */ ;
            /** @type {__VLS_StyleScopedClasses['small']} */ ;
        }
    }
    if (error.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.p, __VLS_intrinsics.p)({
            ...{ class: "error" },
            role: "alert",
        });
        /** @type {__VLS_StyleScopedClasses['error']} */ ;
        (error.value);
    }
    if (needsAcknowledge.value) {
        __VLS_asFunctionalElement1(__VLS_intrinsics.label, __VLS_intrinsics.label)({
            ...{ class: "ack" },
        });
        /** @type {__VLS_StyleScopedClasses['ack']} */ ;
        __VLS_asFunctionalElement1(__VLS_intrinsics.input)({
            type: "checkbox",
        });
        (acknowledged.value);
    }
    __VLS_asFunctionalElement1(__VLS_intrinsics.div, __VLS_intrinsics.div)({
        ...{ class: "actions" },
    });
    /** @type {__VLS_StyleScopedClasses['actions']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (close) },
        ...{ class: "btn" },
    });
    /** @type {__VLS_StyleScopedClasses['btn']} */ ;
    __VLS_asFunctionalElement1(__VLS_intrinsics.button, __VLS_intrinsics.button)({
        ...{ onClick: (download) },
        ...{ class: "btn primary" },
        disabled: (busy.value || (needsAcknowledge.value && !acknowledged.value)),
    });
    /** @type {__VLS_StyleScopedClasses['btn']} */ ;
    /** @type {__VLS_StyleScopedClasses['primary']} */ ;
    let __VLS_32;
    /** @ts-ignore @type { | typeof Download} */
    Download;
    // @ts-ignore
    const __VLS_33 = __VLS_asFunctionalComponent1(__VLS_32, new __VLS_32({
        // @ts-ignore
        size: (14), 'aria-hidden': "true",
    }));
    const __VLS_34 = __VLS_33({
        size: (14),
        'aria-hidden': "true",
    }, ...__VLS_functionalComponentArgsRest(__VLS_33));
    (busy.value ? 'Готовим файл…' : 'Сохранить файл');
    // @ts-ignore
    [error, error, needsAcknowledge, needsAcknowledge, acknowledged, acknowledged, busy, busy,];
    return {};
};
void [__VLS_template];
const __VLS_export = (await import('vue')).defineComponent({});
export default {};
