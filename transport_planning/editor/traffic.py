"""Расчёт загрузки сети настоящим SUMO.

Поездки создаются по тем же правилам, что randomTrips.py на сервере организаторов.
Сам скрипт в пакете SUMO есть не всегда, поэтому правила повторены здесь.
К ним добавляются входящие потоки, поставленные в редакторе. Результат отдаётся по полосам.
"""

from __future__ import annotations

import os
import random
import subprocess
import tempfile
from pathlib import Path
from typing import Any
from xml.etree import ElementTree as ET

from .preflight import find_netconvert

STEP_TIMEOUT_SECONDS = 240
BEGIN_SECONDS = 28800
DRAIN_SECONDS = 900
MIN_TRIPS = 1
MAX_TRIPS = 5000
MIN_PERIOD = 60
MAX_PERIOD = 7200
LOG_TAIL_CHARS = 1500
FRINGE_FACTOR = 5
MIN_TRIP_DISTANCE_M = 500
TRIP_ATTEMPTS = 100
TRIP_RESERVE = 3


class TrafficError(RuntimeError):
    """SUMO не смог выполнить расчёт."""


def _sumo_home(netconvert: str) -> Path:
    home = os.environ.get('SUMO_HOME')
    if home:
        return Path(home)
    return Path(netconvert).resolve().parent.parent


def _run(command: list[str], env: dict[str, str], name: str, log: list[str]) -> None:
    try:
        done = subprocess.run(
            command, capture_output=True, text=True, encoding='utf-8', errors='replace',
            timeout=STEP_TIMEOUT_SECONDS, env=env,
        )
    except subprocess.TimeoutExpired as exc:
        raise TrafficError(f'{name}: превышено время ожидания') from exc
    output = f'{done.stdout}\n{done.stderr}'.strip()
    if done.returncode != 0:
        raise TrafficError(f'{name}: код {done.returncode}. {output[-LOG_TAIL_CHARS:]}')
    log.append(f'{name}: готово')


def _inflows(osm: ET.Element) -> list[tuple[str, float]]:
    """Входящие потоки редактора: номер дороги и интенсивность, авт/ч."""
    result = []
    for node in osm.findall('node'):
        tags = {t.get('k'): t.get('v') for t in node.findall('tag')}
        if tags.get('tp:type') != 'inflow':
            continue
        try:
            result.append((tags['tp:way'], float(tags.get('tp:volume', '0'))))
        except (KeyError, ValueError):
            continue
    return result


def _solve3(matrix: list[list[float]], values: list[float]) -> list[float]:
    """Метод Гаусса для нормальных уравнений подбора преобразования."""
    a = [row[:] + [value] for row, value in zip(matrix, values)]
    for i in range(3):
        pivot = max(range(i, 3), key=lambda r: abs(a[r][i]))
        a[i], a[pivot] = a[pivot], a[i]
        if abs(a[i][i]) < 1e-12:
            raise TrafficError('Не удалось привязать сеть SUMO к координатам')
        for r in range(3):
            if r != i:
                factor = a[r][i] / a[i][i]
                a[r] = [x - factor * y for x, y in zip(a[r], a[i])]
    return [a[i][3] / a[i][i] for i in range(3)]


def _fit_affine(pairs: list[tuple[float, float, float]]) -> list[float]:
    """Коэффициенты c0 + c1*x + c2*y. На участке в пару километров UTM практически аффинна."""
    if len(pairs) < 3:
        raise TrafficError('Не удалось привязать сеть SUMO к координатам')
    # Сдвиг к началу координат не нужен: метры дают обусловленную матрицу после нормировки ниже
    n = len(pairs)
    mx = sum(p[0] for p in pairs) / n
    my = sum(p[1] for p in pairs) / n
    m = [[0.0] * 3 for _ in range(3)]
    v = [0.0] * 3
    for x, y, target in pairs:
        row = [1.0, x - mx, y - my]
        for i in range(3):
            v[i] += row[i] * target
            for j in range(3):
                m[i][j] += row[i] * row[j]
    c = _solve3(m, v)
    return [c[0] - c[1] * mx - c[2] * my, c[1], c[2]]


def _read_net(path: Path, osm: ET.Element) -> tuple[dict[str, dict[str, Any]], list[str]]:
    coords = {n.get('id'): (float(n.get('lon')), float(n.get('lat'))) for n in osm.findall('node')}
    root = ET.parse(path).getroot()
    lon_pairs, lat_pairs = [], []
    for junction in root.findall('junction'):
        known = coords.get(junction.get('id'))
        if known and junction.get('type') != 'internal':
            x, y = float(junction.get('x')), float(junction.get('y'))
            lon_pairs.append((x, y, known[0]))
            lat_pairs.append((x, y, known[1]))
    lon, lat = _fit_affine(lon_pairs), _fit_affine(lat_pairs)

    def convert(shape: str) -> list[list[float]]:
        points = []
        for item in shape.split():
            x, y = (float(v) for v in item.split(',')[:2])
            points.append([round(lon[0] + lon[1] * x + lon[2] * y, 7), round(lat[0] + lat[1] * x + lat[2] * y, 7)])
        return points

    lanes: dict[str, dict[str, Any]] = {}
    drivable: dict[str, dict[str, Any]] = {}
    for edge in root.findall('edge'):
        if edge.get('function') == 'internal':
            continue
        passenger = False
        length = 0.0
        first_point: tuple[float, float] | None = None
        last_point: tuple[float, float] | None = None
        for lane in edge.findall('lane'):
            shape = lane.get('shape', '')
            lanes[lane.get('id')] = {
                'edge': edge.get('id'),
                'index': int(lane.get('index', '0')),
                'speedLimit': float(lane.get('speed', '0')) * 3.6,
                'shape': convert(shape),
            }
            disallow = lane.get('disallow', '').split()
            allow = lane.get('allow', '').split()
            if 'passenger' not in disallow and (not allow or 'passenger' in allow):
                passenger = True
                length = max(length, float(lane.get('length', '0')))
                points = shape.split()
                first_point = tuple(float(v) for v in points[0].split(',')[:2])  # type: ignore[assignment]
                last_point = tuple(float(v) for v in points[-1].split(',')[:2])  # type: ignore[assignment]
        if passenger and first_point and last_point:
            drivable[edge.get('id')] = {'length': length, 'start': first_point, 'end': last_point, 'in': False, 'out': False}

    for connection in root.findall('connection'):
        source, target = connection.get('from'), connection.get('to')
        if source in drivable and target in drivable:
            drivable[source]['out'] = True
            drivable[target]['in'] = True
    return lanes, drivable


def _write_random_trips(path: Path, edges: dict[str, dict[str, Any]], trips: int, begin: int, period: int, seed: int) -> int:
    """Случайные поездки по правилам randomTrips.py: вес ребра равен длине, на краях сети он впятеро больше."""
    rng = random.Random(seed)
    ids = list(edges)
    start_weights = [edges[e]['length'] * (FRINGE_FACTOR if not edges[e]['in'] else 1) for e in ids]
    end_weights = [edges[e]['length'] * (FRINGE_FACTOR if not edges[e]['out'] else 1) for e in ids]
    root = ET.Element('routes')
    written = 0
    for index in range(trips):
        for _ in range(TRIP_ATTEMPTS):
            source = rng.choices(ids, start_weights)[0]
            target = rng.choices(ids, end_weights)[0]
            ax, ay = edges[source]['start']
            bx, by = edges[target]['end']
            if source != target and ((ax - bx) ** 2 + (ay - by) ** 2) ** 0.5 >= MIN_TRIP_DISTANCE_M:
                ET.SubElement(root, 'trip', {'id': str(index), 'depart': f'{begin + index * period / trips:.2f}', 'from': source, 'to': target})
                written += 1
                break
    ET.ElementTree(root).write(path, encoding='unicode')
    return written


def _merge_inflows(trips_file: Path, target: Path, inflows: list[tuple[str, float]], drivable: list[str], begin: int, period: int, seed: int) -> int:
    """Дописывает к случайным поездкам поездки из входящих потоков и сортирует их по времени."""
    trips = list(ET.parse(trips_file).getroot().findall('trip'))
    rng = random.Random(seed)
    added = 0
    by_way: dict[str, list[str]] = {}
    for edge in drivable:
        by_way.setdefault(edge.lstrip('-').split('#')[0], []).append(edge)
    for number, (way, volume) in enumerate(inflows):
        edges = by_way.get(way)
        count = round(volume * period / 3600)
        if not edges or count <= 0:
            continue
        for index in range(count):
            element = ET.Element('trip', {
                'id': f'inflow{number}_{index}',
                'depart': f'{begin + (index + 0.5) * period / count:.2f}',
                'from': edges[0],
                'to': rng.choice(drivable),
            })
            trips.append(element)
            added += 1
    trips.sort(key=lambda trip: float(trip.get('depart', '0')))
    root = ET.Element('routes')
    root.extend(trips)
    ET.ElementTree(root).write(target, encoding='unicode')
    return added


def _keep_requested_trips(routes: Path, trips: int) -> int:
    """Оставляет заданное число случайных поездок, равномерно по времени. Входящие потоки не трогает."""
    tree = ET.parse(routes)
    root = tree.getroot()
    vehicles = root.findall('vehicle')
    random_ones = [v for v in vehicles if not v.get('id', '').startswith('inflow')]
    if len(random_ones) > trips:
        keep = {id(random_ones[index * len(random_ones) // trips]) for index in range(trips)}
        for vehicle in random_ones:
            if id(vehicle) not in keep:
                root.remove(vehicle)
        tree.write(routes, encoding='unicode')
    return min(len(random_ones), trips)


def run_traffic(osm_bytes: bytes, trips: int = 1000, period: int = 3600, seed: int = 42) -> dict[str, Any]:
    netconvert = find_netconvert()
    if netconvert is None:
        return {'available': False, 'message': 'SUMO не установлен на сервере редактора'}
    trips = max(MIN_TRIPS, min(MAX_TRIPS, int(trips)))
    period = max(MIN_PERIOD, min(MAX_PERIOD, int(period)))

    home = _sumo_home(netconvert)
    bin_dir = Path(netconvert).parent
    sumo = str(bin_dir / ('sumo.exe' if os.name == 'nt' else 'sumo'))
    duarouter = str(bin_dir / ('duarouter.exe' if os.name == 'nt' else 'duarouter'))

    env = {**os.environ, 'SUMO_HOME': str(home)}
    log: list[str] = []
    end = BEGIN_SECONDS + period
    osm = ET.fromstring(osm_bytes)

    with tempfile.TemporaryDirectory(prefix='sumo-load-') as tmp:
        work = Path(tmp)
        source, net = work / 'map.osm', work / 'map.net.xml'
        source.write_bytes(osm_bytes)
        _run([netconvert, '--osm-files', str(source), '--output-file', str(net), '--no-warnings'], env, 'netconvert', log)
        lanes, drivable = _read_net(net, osm)

        raw_trips, all_trips, routes = work / 'trips.xml', work / 'all.trips.xml', work / 'routes.rou.xml'
        # Часть случайных пар рёбер не связана дорогами, поэтому кандидатов берём с запасом
        _write_random_trips(raw_trips, drivable, trips * TRIP_RESERVE, BEGIN_SECONDS, period, seed)
        added = _merge_inflows(raw_trips, all_trips, _inflows(osm), list(drivable), BEGIN_SECONDS, period, seed)
        if added:
            log.append(f'Входящие потоки: добавлено поездок {added}')
        _run([duarouter, '-n', str(net), '--route-files', str(all_trips), '-o', str(routes), '--ignore-errors', '--no-warnings', '--no-step-log', '--seed', str(seed)], env, 'duarouter', log)
        routed = _keep_requested_trips(routes, trips)
        log.append(f'Случайные поездки с маршрутом: {routed} из {trips}')
        if routed < trips:
            log.append('Связанных пар рёбер не хватило: поездок меньше заданного числа')

        lane_file, stats_file, additional = work / 'lanes.xml', work / 'stats.xml', work / 'add.xml'
        additional.write_text(
            f'<additional><laneData id="load" file="{lane_file.name}" begin="{BEGIN_SECONDS}" end="{end}"/></additional>',
            encoding='utf-8',
        )
        _run([
            sumo, '-n', str(net), '-r', str(routes), '-a', str(additional),
            '-b', str(BEGIN_SECONDS), '-e', str(end + DRAIN_SECONDS),
            '--statistic-output', str(stats_file), '--duration-log.statistics', '--no-step-log', '--no-warnings', '--seed', str(seed),
        ], env, 'sumo', log)

        result_lanes = []
        hour_factor = 3600 / period
        for lane in ET.parse(lane_file).getroot().iter('lane'):
            meta = lanes.get(lane.get('id'))
            entered = float(lane.get('entered', '0'))
            if not meta or entered <= 0:
                continue
            result_lanes.append({
                'edge': meta['edge'],
                'way': meta['edge'].lstrip('-').split('#')[0],
                'lane': meta['index'],
                'flow': round(entered * hour_factor),
                'speed': round(float(lane.get('speed', '0')) * 3.6, 1),
                'speedLimit': round(meta['speedLimit'], 1),
                'shape': meta['shape'],
            })

        stats_root = ET.parse(stats_file).getroot()
        vehicles = stats_root.find('vehicles')
        teleports = stats_root.find('teleports')
        trip_stats = stats_root.find('vehicleTripStatistics')
        stats = {
            'loaded': int(vehicles.get('loaded', '0')) if vehicles is not None else 0,
            'inserted': int(vehicles.get('inserted', '0')) if vehicles is not None else 0,
            'teleports': int(teleports.get('total', '0')) if teleports is not None else 0,
            'meanSpeed': round(float(trip_stats.get('speed', '0')) * 3.6, 1) if trip_stats is not None else None,
            'meanDuration': round(float(trip_stats.get('duration', '0'))) if trip_stats is not None else None,
        }

    return {'available': True, 'ok': True, 'trips': trips, 'period': period, 'added': added, 'stats': stats, 'lanes': result_lanes, 'log': log}
