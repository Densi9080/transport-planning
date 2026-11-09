import { computed, ref, shallowRef } from 'vue';
import { setSignalPlan } from '@/core/laneOps';
import { cycleLength, MAX_ALL_RED_S, MAX_GREEN_S, MAX_YELLOW_S, MIN_GREEN_S, signalRemaining, signalTimes, withCycleLength, withGreenTime, withRedTime, } from '@/core/signals';
import { buildSimNet, signalCycleTime, signalGroupAt } from '@/sim/net';
import { signalDirections } from '@/sim/signalView';
import { useEditor } from '@/stores/editor';
import { useSimulation } from '@/stores/simulation';
/** План светофора узла: что горит и сколько, и как это поменять. Общий для редактора фаз и панелей. */
export function useSignalPlan(node) {
    const editor = useEditor();
    const sim = useSimulation();
    /** План во время перетаскивания: показывается сразу, а в граф попадает только в конце. */
    const preview = shallowRef(null);
    /** Почему записалось не то, что просили. */
    const notice = ref('');
    const group = computed(() => {
        void editor.rev;
        const doc = editor.doc;
        const projector = editor.projector;
        if (!doc || !projector)
            return null;
        // В симуляции берём её сеть: там могут быть и светофоры, которые предположила модель
        const net = editor.viewMode === 'sim' && sim.net && !sim.isStale() ? sim.net : buildSimNet(doc, projector, false);
        return signalGroupAt(net, node());
    });
    const plan = computed(() => {
        void editor.rev;
        return preview.value ?? group.value?.plan ?? null;
    });
    const cycle = computed(() => (plan.value ? cycleLength(plan.value) : 0));
    const directions = computed(() => {
        void editor.rev;
        return group.value && plan.value ? signalDirections(group.value, plan.value) : [];
    });
    /** Настоящего светофора в данных нет: план придуман моделью и записывать его некуда. */
    const guessed = computed(() => {
        void editor.rev;
        const doc = editor.doc;
        const current = group.value;
        return !!current && !!doc && !current.nodes.some((id) => doc.nodes.get(id)?.tags?.highway === 'traffic_signals');
    });
    /** Время модели, пока идёт микросимуляция. В остальное время сигнал не горит, а только запланирован. */
    const liveTime = computed(() => (editor.viewMode === 'sim' && sim.level === 'micro' ? (sim.stats?.time ?? null) : null));
    const cycleTime = computed(() => {
        const current = group.value;
        return current && liveTime.value !== null ? signalCycleTime(current, liveTime.value) : null;
    });
    function liveState(direction) {
        return plan.value && cycleTime.value !== null ? signalRemaining(plan.value, direction.phases, cycleTime.value) : null;
    }
    function commit(next, label = 'План светофора') {
        preview.value = null;
        const current = group.value;
        if (!current || guessed.value)
            return;
        // Пустая правка не должна ни занимать шаг отмены, ни превращать автоплан в ручной
        if (JSON.stringify(current.plan) === JSON.stringify(next))
            return;
        editor.mutate(label, (doc) => setSignalPlan(doc, current.owner, next));
        sim.refreshSignals();
    }
    function resetToAuto() {
        preview.value = null;
        const current = group.value;
        if (!current)
            return;
        editor.mutate('Автоматический план', (doc) => setSignalPlan(doc, current.owner, null));
        sim.refreshSignals();
    }
    /** Просили то, чего нельзя: сообщаем, что записалось на самом деле. */
    function reportLimit(requested, actual) {
        notice.value = '';
        if (Math.abs(requested - actual) < 1)
            return;
        const text = `Ближайшее возможное значение: ${actual} с. Зелёный каждой фазы от ${MIN_GREEN_S} до ${MAX_GREEN_S} с`;
        // Всплывающее сообщение оказалось бы под открытым окном узла
        if (editor.junctionNode !== null)
            notice.value = text;
        else
            editor.toast(text);
    }
    function setGreenTime(direction, seconds) {
        const current = plan.value;
        const next = withGreenTime(current, direction.phases, seconds);
        commit(next, 'Зелёный направления');
        const actual = signalTimes(next, direction.phases).green;
        reportLimit(seconds, actual);
        return actual;
    }
    function setRedTime(direction, seconds) {
        const current = plan.value;
        const next = withRedTime(current, direction.phases, seconds);
        commit(next, 'Красный направления');
        const actual = signalTimes(next, direction.phases).red;
        reportLimit(seconds, actual);
        return actual;
    }
    function setCycle(seconds) {
        const next = withCycleLength(plan.value, seconds);
        commit(next, 'Длина цикла');
        const actual = cycleLength(next);
        reportLimit(seconds, actual);
        return actual;
    }
    function setPhaseGreen(index, seconds) {
        const next = { ...plan.value, phases: plan.value.phases.map((phase) => ({ ...phase })) };
        const actual = Math.min(MAX_GREEN_S, Math.max(MIN_GREEN_S, Math.round(seconds)));
        next.phases[index].green = actual;
        commit(next, 'Длительность фазы');
        reportLimit(seconds, actual);
        return actual;
    }
    function setCommon(key, seconds) {
        const limits = { offset: Number.POSITIVE_INFINITY, yellow: MAX_YELLOW_S, allRed: MAX_ALL_RED_S };
        const actual = Math.min(limits[key], Math.max(0, key === 'offset' ? Math.round(seconds) : seconds));
        commit({ ...plan.value, [key]: actual });
        return actual;
    }
    return {
        group,
        plan,
        cycle,
        directions,
        guessed,
        cycleTime,
        preview,
        notice,
        liveState,
        commit,
        resetToAuto,
        setGreenTime,
        setRedTime,
        setCycle,
        setPhaseGreen,
        setCommon,
    };
}
/**
 * Значение из числового поля. Записанное могло быть ограничено пределами,
 * поэтому поле всегда показывает то, что действует на самом деле.
 */
export function editNumber(event, current, apply) {
    const input = event.target;
    const value = Number(input.value);
    const actual = input.value.trim() !== '' && Number.isFinite(value) ? apply(value) : current;
    input.value = String(actual);
}
