"""Фазы светофоров редактора в виде программы SUMO: один файл .add.xml с блоками tlLogic.

Программа SUMO привязана к сети, которую строит netconvert: id светофора и номер каждого соединения
(linkIndex) появляются только там. Поэтому сеть собирается здесь из того же .osm, а соединения SUMO
сопоставляются с манёврами редактора по узлу и соседним узлам дорог OSM.

Файл подключается так: sumo -n сеть.net.xml -a фазы.add.xml. Программа из файла получает свой
programID и включается сама. Если сеть собрана с другими настройками netconvert, число соединений может
не совпасть, и SUMO откажется загружать такую программу, а не применит её молча.
"""

from __future__ import annotations

import subprocess
import tempfile
from collections import Counter
from math import atan2, degrees, sin, radians
from pathlib import Path
from typing import Any
from xml.etree import ElementTree as ET

from .preflight import find_netconvert

TIMEOUT_SECONDS = 120
PROGRAM_ID = 'editor'
# Как в расчёте загрузки редактора: на сервере организаторов сеть совпадает с собранной по умолчанию
NETCONVERT_OPTIONS = ['--no-warnings']
MAX_GROUPS = 2000
MAX_PHASES = 16
MAX_DURATION_S = 600
# Подходы с разницей направлений меньше этого угла считаются одной осью движения
SAME_AXIS_DEG = 45


class SignalExportError(ValueError):
    """Данные о светофорах из редактора нельзя использовать."""


class SignalNetError(RuntimeError):
    """netconvert не смог собрать сеть."""


def _number(value: Any, name: str, low: float, high: float) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError) as exc:
        raise SignalExportError(f'{name}: ожидалось число') from exc
    if not low <= number <= high:
        raise SignalExportError(f'{name}: значение {number} вне пределов {low}–{high}')
    return number


def parse_groups(raw: Any) -> list[dict[str, Any]]:
    """Проверяет светофорные объекты из редактора: план и фазы каждого манёвра."""
    if not isinstance(raw, list) or len(raw) > MAX_GROUPS:
        raise SignalExportError('Поле groups должно быть списком светофорных объектов')
    groups = []
    for index, item in enumerate(raw):
        if not isinstance(item, dict):
            raise SignalExportError(f'Объект {index}: ожидался словарь')
        plan = item.get('plan')
        if not isinstance(plan, dict) or not isinstance(plan.get('phases'), list) or not plan['phases']:
            raise SignalExportError(f'Объект {index}: нет фаз')
        if len(plan['phases']) > MAX_PHASES:
            raise SignalExportError(f'Объект {index}: слишком много фаз')
        nodes = item.get('nodes')
        movements = item.get('movements')
        if not isinstance(nodes, list) or not nodes or not isinstance(movements, dict):
            raise SignalExportError(f'Объект {index}: нет узлов или манёвров')
        greens = [_number(phase.get('green') if isinstance(phase, dict) else None, f'Объект {index}: зелёный', 0, MAX_DURATION_S)
                  for phase in plan['phases']]
        count = len(greens)
        parsed_movements: dict[str, list[int]] = {}
        for key, phases in movements.items():
            if not isinstance(phases, list) or not all(isinstance(p, int) and 0 <= p < count for p in phases):
                raise SignalExportError(f'Объект {index}: некорректные фазы манёвра {key}')
            parsed_movements[str(key)] = sorted(set(phases))
        groups.append({
            'nodes': [str(int(node)) for node in nodes],
            'offset': _number(plan.get('offset', 0), f'Объект {index}: сдвиг', -100000, 100000),
            'yellow': _number(plan.get('yellow', 0), f'Объект {index}: жёлтый', 0, MAX_DURATION_S),
            'allRed': _number(plan.get('allRed', 0), f'Объект {index}: общий красный', 0, MAX_DURATION_S),
            'greens': greens,
            'movements': parsed_movements,
        })
    return groups


def build_net(osm_bytes: bytes, work: Path) -> tuple[ET.Element, str]:
    netconvert = find_netconvert()
    if netconvert is None:
        raise SignalNetError('netconvert не найден. Установите пакет eclipse-sumo или задайте SUMO_HOME.')
    source, net = work / 'map.osm', work / 'map.net.xml'
    source.write_bytes(osm_bytes)
    try:
        done = subprocess.run(
            [netconvert, '--osm-files', str(source), '--output-file', str(net), *NETCONVERT_OPTIONS],
            capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=TIMEOUT_SECONDS, check=False,
        )
        version = subprocess.run(
            [netconvert, '--version'], capture_output=True, text=True, encoding='utf-8', errors='replace',
            timeout=TIMEOUT_SECONDS, check=False,
        ).stdout.splitlines()
    except subprocess.TimeoutExpired as exc:
        raise SignalNetError(f'netconvert не уложился в {TIMEOUT_SECONDS} с') from exc
    if done.returncode != 0 or not net.exists():
        raise SignalNetError(f'netconvert завершился с кодом {done.returncode}: {(done.stderr or done.stdout)[-400:]}')
    return ET.parse(net).getroot(), (version[0] if version else 'netconvert')


def _edge_way(edge_id: str) -> tuple[str, bool]:
    """Рёбра SUMO из OSM называются <дорога>#<часть>, минус означает ход против порядка узлов."""
    return edge_id.lstrip('-').split('#')[0], edge_id.startswith('-')


def _neighbor(nds: list[str], junction: str, reverse: bool, incoming: bool) -> str | None:
    """Соседний узел дороги по эту сторону перекрёстка: так редактор задаёт манёвр."""
    step = -1 if incoming != reverse else 1
    for index, node in enumerate(nds):
        if node != junction:
            continue
        other = index + step
        if 0 <= other < len(nds):
            return nds[other]
    return None


def _heading(shape: str) -> float | None:
    points = [tuple(float(v) for v in item.split(',')[:2]) for item in shape.split()]
    if len(points) < 2:
        return None
    (ax, ay), (bx, by) = points[-2], points[-1]
    return degrees(atan2(bx - ax, by - ay))


def _same_axis(a: float, b: float) -> float:
    """Насколько подходы далеки от одной оси: встречные потоки идут вместе, поэтому направление не важно."""
    return abs(sin(radians(a - b)))


def _fmt(value: float) -> str:
    return f'{value:g}'


class _Link:
    def __init__(self, connection: ET.Element):
        self.index = int(connection.get('linkIndex', '-1'))
        self.from_edge = connection.get('from', '')
        self.to_edge = connection.get('to', '')
        self.from_lane = int(connection.get('fromLane', '0'))
        self.direction = connection.get('dir', '')
        self.junction: str | None = None
        self.movement: str | None = None
        self.phases: list[int] | None = None
        self.mapped = False
        self.heading: float | None = None


def export_signal_programs(osm_bytes: bytes, groups: list[dict[str, Any]]) -> dict[str, Any]:
    osm = ET.fromstring(osm_bytes)
    nds = {way.get('id'): [nd.get('ref') for nd in way.findall('nd')] for way in osm.findall('way')}
    with tempfile.TemporaryDirectory(prefix='sumo-signals-') as tmp:
        net, version = build_net(osm_bytes, Path(tmp))

    edges = {edge.get('id'): edge for edge in net.findall('edge') if edge.get('function') != 'internal'}
    lane_shapes = {lane.get('id'): lane.get('shape', '') for edge in edges.values() for lane in edge.findall('lane')}
    requests = {
        junction.get('id'): [(r.get('response', ''), r.get('foes', '')) for r in junction.findall('request')]
        for junction in net.findall('junction')
    }
    links_by_tls: dict[str, list[_Link]] = {}
    for connection in net.findall('connection'):
        tls = connection.get('tl')
        if tls and connection.get('from') in edges:
            links_by_tls.setdefault(tls, []).append(_Link(connection))

    root = ET.Element('additional')
    root.append(ET.Comment(
        f' Фазы светофоров из редактора. Сеть: {version}, настройки по умолчанию. '
        f'Запуск: sumo -n сеть.net.xml -a этот_файл.add.xml '
    ))
    written: list[dict[str, Any]] = []
    skipped: list[dict[str, str]] = []

    for tls_id in sorted(links_by_tls, key=lambda value: (len(value), value)):
        links = sorted(links_by_tls[tls_id], key=lambda link: link.index)
        for link in links:
            edge = edges[link.from_edge]
            link.junction = edge.get('to')
            link.heading = _heading(lane_shapes.get(f'{link.from_edge}_{link.from_lane}', ''))
            from_way, from_reverse = _edge_way(link.from_edge)
            to_way, to_reverse = _edge_way(link.to_edge)
            before = _neighbor(nds.get(from_way, []), link.junction, from_reverse, incoming=True)
            after = _neighbor(nds.get(to_way, []), link.junction, to_reverse, incoming=False)
            if before and after:
                link.movement = f'{link.junction}:{before}>{after}'

        junctions = {link.junction for link in links}
        group = next((g for g in groups if junctions & set(g['nodes'])), None)
        if group is None:
            skipped.append({'id': tls_id, 'reason': 'В редакторе нет плана этого светофора: SUMO оставит свою программу'})
            continue
        for link in links:
            phases = group['movements'].get(link.movement or '')
            if phases is not None:
                link.phases, link.mapped = phases, True

        mapped = [link for link in links if link.mapped]
        if not mapped:
            skipped.append({'id': tls_id, 'reason': 'Ни одно соединение SUMO не совпало с манёврами редактора'})
            continue
        for link in links:
            if link.mapped:
                continue
            # Как и в модели редактора: манёвр без плана едет вместе со своим подходом или со своей осью
            same_edge = [tuple(other.phases) for other in mapped if other.from_edge == link.from_edge]
            if same_edge:
                link.phases = list(Counter(same_edge).most_common(1)[0][0])
            elif link.heading is not None:
                nearest = min(
                    (other for other in mapped if other.heading is not None),
                    key=lambda other: _same_axis(link.heading, other.heading),
                    default=mapped[0],
                )
                link.phases = list(nearest.phases or [])
            else:
                link.phases = list(mapped[0].phases or [])

        size = links[-1].index + 1
        if [link.index for link in links] != list(range(size)):
            skipped.append({'id': tls_id, 'reason': 'Номера соединений SUMO идут с пропусками'})
            continue

        # Кто кому уступает, известно из запросов узла. Их номера совпадают с linkIndex, когда светофор управляет одним узлом
        junction_requests = requests.get(next(iter(junctions)), []) if len(junctions) == 1 else []
        use_requests = len(junction_requests) == size

        def yields(i: int, j: int) -> bool:
            return use_requests and junction_requests[i][0][size - 1 - j] == '1'

        def foes(i: int, j: int) -> bool:
            return use_requests and junction_requests[i][1][size - 1 - j] == '1'

        conflicts: set[tuple[int, int]] = set()

        def green_state(active: set[int]) -> list[str]:
            state = []
            for i in range(size):
                if i not in active:
                    state.append('r')
                    continue
                minor = any(yields(i, j) for j in active if j != i)
                state.append('g' if minor else 'G')
                for j in active:
                    if j > i and foes(i, j) and not yields(i, j) and not yields(j, i):
                        conflicts.add((i, j))
            return state

        count = len(group['greens'])
        greens_by_phase = [{link.index for link in links if p in (link.phases or [])} for p in range(count)]
        phases: list[tuple[float, str]] = []
        for p in range(count):
            active = greens_by_phase[p]
            following = greens_by_phase[(p + 1) % count] if count > 1 else set()
            green = green_state(active)
            keep = active & following
            yellow = [green[i] if i in keep else ('y' if i in active else 'r') for i in range(size)]
            red = [green[i] if i in keep else 'r' for i in range(size)]
            for duration, state in ((group['greens'][p], green), (group['yellow'], yellow), (group['allRed'], red)):
                if duration > 0:
                    phases.append((duration, ''.join(state)))

        cycle = sum(duration for duration, _ in phases)
        if cycle <= 0:
            skipped.append({'id': tls_id, 'reason': 'Цикл нулевой длины'})
            continue
        # В редакторе момент цикла равен (t + сдвиг), в SUMO — (t − offset): знак меняется
        offset = (-group['offset']) % cycle
        logic = ET.SubElement(root, 'tlLogic', {
            'id': tls_id, 'type': 'static', 'programID': PROGRAM_ID, 'offset': _fmt(round(offset, 2)),
        })
        for duration, state in phases:
            ET.SubElement(logic, 'phase', {'duration': _fmt(duration), 'state': state})
        written.append({
            'id': tls_id,
            'cycle': round(cycle, 2),
            'phases': len(phases),
            'links': size,
            'mapped': len(mapped),
            'conflicts': len(conflicts),
        })

    ET.indent(root, space='  ')
    xml = '<?xml version="1.0" encoding="UTF-8"?>\n' + ET.tostring(root, encoding='unicode') + '\n'
    return {
        'available': True,
        'ok': bool(written),
        'xml': xml,
        'netconvert': version,
        'written': written,
        'skipped': skipped,
    }
