"""Чтение .osm и запись правок обратно без потерь.

Файл на сервере не пересобирается из модели: правки накладываются на исходное
XML-дерево, поэтому всё, чего они не коснулись, остаётся как было.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any
from xml.etree import ElementTree as ET

from defusedxml import ElementTree as SafeET
from defusedxml.common import DefusedXmlException

XML_DECLARATION = b'<?xml version="1.0" encoding="UTF-8"?>\n'
MIN_WAY_NODES = 2


class OsmFormatError(ValueError):
    """Файл не является корректным OSM XML."""


class ChangesError(ValueError):
    """Правки нельзя применить, не сломав файл."""


def _parse_root(data: bytes) -> ET.Element:
    try:
        root = SafeET.fromstring(data)
    except (ET.ParseError, DefusedXmlException, ValueError) as exc:
        raise OsmFormatError(f'Не удалось прочитать XML: {exc}') from exc
    if root.tag != 'osm':
        raise OsmFormatError(f'Ожидался корневой элемент <osm>, найден <{root.tag}>')
    return root


def _tags(element: ET.Element) -> dict[str, str]:
    return {t.get('k', ''): t.get('v', '') for t in element.findall('tag')}


def _with_tags(payload: dict[str, Any], element: ET.Element) -> dict[str, Any]:
    tags = _tags(element)
    if tags:
        payload['tags'] = tags
    return payload


def parse_document(data: bytes) -> dict[str, Any]:
    """Преобразует .osm в JSON-модель для редактора."""
    root = _parse_root(data)
    nodes, ways, relations = [], [], []

    for element in root:
        if element.get('visible') == 'false':
            continue
        try:
            if element.tag == 'node':
                nodes.append(_with_tags({
                    'id': int(element.get('id', '')),
                    'lat': float(element.get('lat', '')),
                    'lon': float(element.get('lon', '')),
                }, element))
            elif element.tag == 'way':
                ways.append(_with_tags({
                    'id': int(element.get('id', '')),
                    'nds': [int(nd.get('ref', '')) for nd in element.findall('nd')],
                }, element))
            elif element.tag == 'relation':
                relations.append(_with_tags({
                    'id': int(element.get('id', '')),
                    'members': [
                        [m.get('type', ''), int(m.get('ref', '')), m.get('role', '')]
                        for m in element.findall('member')
                    ],
                }, element))
        except ValueError as exc:
            raise OsmFormatError(
                f'Некорректный элемент <{element.tag} id="{element.get("id")}">: {exc}'
            ) from exc

    if not nodes:
        raise OsmFormatError('В файле нет ни одного узла')

    bounds = root.find('bounds')
    if bounds is not None and bounds.get('minlat') is not None:
        box = {k: float(bounds.get(k, '0')) for k in ('minlat', 'minlon', 'maxlat', 'maxlon')}
    else:
        lats = [n['lat'] for n in nodes]
        lons = [n['lon'] for n in nodes]
        box = {'minlat': min(lats), 'minlon': min(lons), 'maxlat': max(lats), 'maxlon': max(lons)}

    return {'bounds': box, 'nodes': nodes, 'ways': ways, 'relations': relations}


def _finish_children(parent: ET.Element) -> None:
    """Приводит отступы и схлопывает пустой элемент в <node .../>."""
    children = list(parent)
    if not children:
        parent.text = None
        return
    parent.text = '\n  '
    for child in children:
        child.tail = '\n  '
    children[-1].tail = '\n '


def _write_tags(element: ET.Element, tags: dict[str, str]) -> None:
    for key, value in tags.items():
        ET.SubElement(element, 'tag', {'k': str(key), 'v': str(value)})


def _clear_children(element: ET.Element) -> None:
    for child in list(element):
        element.remove(child)


def _new_attrs(item_id: int, timestamp: str) -> dict[str, str]:
    return {'id': str(item_id), 'visible': 'true', 'version': '1', 'timestamp': timestamp}


def _section(changes: dict[str, Any], name: str) -> tuple[list[dict], set[int]]:
    section = changes.get(name) or {}
    upsert = section.get('upsert') or []
    try:
        delete = {int(i) for i in section.get('delete') or []}
    except (TypeError, ValueError) as exc:
        raise ChangesError(f'Некорректный список удаления в разделе {name}') from exc
    return upsert, delete


def _item_id(item: dict[str, Any], name: str) -> int:
    try:
        return int(item['id'])
    except (KeyError, TypeError, ValueError) as exc:
        raise ChangesError(f'Объект без корректного id в разделе {name}') from exc


def _member_triplet(member: Any) -> tuple[str, int, str]:
    try:
        kind, ref, role = member
        return str(kind), int(ref), str(role)
    except (TypeError, ValueError) as exc:
        raise ChangesError(f'Некорректный участник отношения: {member!r}') from exc


def apply_changes(data: bytes, changes: dict[str, Any] | None) -> bytes:
    """Накладывает правки на исходный .osm и возвращает новый файл.

    Участники отношений, указывающие на удалённые объекты, убираются здесь же.
    Ссылки на объекты вне файла не трогаем: в выгрузках OSM это норма.
    """
    root = _parse_root(data)
    changes = changes or {}
    timestamp = datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')

    node_upsert, node_delete = _section(changes, 'nodes')
    way_upsert, way_delete = _section(changes, 'ways')
    rel_upsert, rel_delete = _section(changes, 'relations')

    elements: dict[str, dict[int, ET.Element]] = {'node': {}, 'way': {}, 'relation': {}}
    for element in root:
        if element.tag in elements and element.get('id') is not None:
            elements[element.tag][int(element.get('id', '0'))] = element

    for kind, delete in (('node', node_delete), ('way', way_delete), ('relation', rel_delete)):
        missing = delete - elements[kind].keys()
        if missing:
            raise ChangesError(f'Удаляемого объекта {kind} {min(missing)} нет в файле')

    new_nodes = _apply_nodes(elements['node'], node_upsert, timestamp)
    new_ways = _apply_ways(elements, way_upsert, node_delete, timestamp)
    _check_kept_ways(elements['way'], node_delete, way_delete, way_upsert)
    new_relations = _apply_relations(elements['relation'], rel_upsert, timestamp)

    removed = {'node': node_delete, 'way': way_delete, 'relation': rel_delete}
    for element in elements['relation'].values():
        dropped = False
        for member in element.findall('member'):
            if int(member.get('ref', '0')) in removed.get(member.get('type', ''), ()):
                element.remove(member)
                dropped = True
        if dropped:
            _finish_children(element)

    _rebuild_root(root, removed, new_nodes, new_ways, new_relations)
    # ElementTree пишет "<nd ... />": убираем пробел, чтобы формат совпадал с выгрузкой OSM
    body = ET.tostring(root, encoding='unicode', short_empty_elements=True).replace(' />', '/>')
    return XML_DECLARATION + body.encode('utf-8')


def _apply_nodes(
    index: dict[int, ET.Element], upsert: list[dict], timestamp: str
) -> list[ET.Element]:
    created = []
    for item in upsert:
        item_id = _item_id(item, 'nodes')
        element = index.get(item_id)
        if element is None:
            element = ET.Element('node', _new_attrs(item_id, timestamp))
            index[item_id] = element
            created.append(element)
        try:
            element.set('lat', f'{float(item["lat"]):.7f}')
            element.set('lon', f'{float(item["lon"]):.7f}')
        except (KeyError, TypeError, ValueError) as exc:
            raise ChangesError(f'Узел {item_id}: некорректные координаты') from exc
        _clear_children(element)
        _write_tags(element, item.get('tags') or {})
        _finish_children(element)
    return created


def _apply_ways(
    elements: dict[str, dict[int, ET.Element]],
    upsert: list[dict],
    node_delete: set[int],
    timestamp: str,
) -> list[ET.Element]:
    created = []
    for item in upsert:
        item_id = _item_id(item, 'ways')
        element = elements['way'].get(item_id)
        if element is None:
            element = ET.Element('way', _new_attrs(item_id, timestamp))
            elements['way'][item_id] = element
            created.append(element)
        refs = item.get('nds') or []
        if len(refs) < MIN_WAY_NODES:
            raise ChangesError(f'Дорога {item_id}: меньше двух узлов')
        _clear_children(element)
        for ref in refs:
            ref = int(ref)
            if ref not in elements['node'] or ref in node_delete:
                raise ChangesError(f'Дорога {item_id} ссылается на отсутствующий узел {ref}')
            ET.SubElement(element, 'nd', {'ref': str(ref)})
        _write_tags(element, item.get('tags') or {})
        _finish_children(element)
    return created


def _check_kept_ways(
    ways: dict[int, ET.Element],
    node_delete: set[int],
    way_delete: set[int],
    upsert: list[dict],
) -> None:
    if not node_delete:
        return
    upserted = {_item_id(item, 'ways') for item in upsert}
    for way_id, element in ways.items():
        if way_id in way_delete or way_id in upserted:
            continue
        for nd in element.findall('nd'):
            if int(nd.get('ref', '0')) in node_delete:
                raise ChangesError(
                    f'Узел {nd.get("ref")} удалён, но на него ссылается дорога {way_id}'
                )


def _apply_relations(
    index: dict[int, ET.Element], upsert: list[dict], timestamp: str
) -> list[ET.Element]:
    created = []
    for item in upsert:
        item_id = _item_id(item, 'relations')
        element = index.get(item_id)
        if element is None:
            element = ET.Element('relation', _new_attrs(item_id, timestamp))
            index[item_id] = element
            created.append(element)
        _clear_children(element)
        for member in item.get('members') or []:
            kind, ref, role = _member_triplet(member)
            if kind not in ('node', 'way', 'relation'):
                raise ChangesError(f'Отношение {item_id}: неизвестный тип участника {kind}')
            ET.SubElement(element, 'member', {'type': kind, 'ref': str(ref), 'role': role})
        _write_tags(element, item.get('tags') or {})
        _finish_children(element)
    return created


def _rebuild_root(
    root: ET.Element,
    removed: dict[str, set[int]],
    new_nodes: list[ET.Element],
    new_ways: list[ET.Element],
    new_relations: list[ET.Element],
) -> None:
    """Сохраняет порядок разделов OSM: узлы, дороги, отношения. Новое идёт в конец раздела."""
    head, nodes, ways, relations = [], [], [], []
    buckets = {'node': nodes, 'way': ways, 'relation': relations}
    for element in list(root):
        bucket = buckets.get(element.tag)
        if bucket is None:
            head.append(element)
        elif int(element.get('id', '0')) not in removed[element.tag]:
            bucket.append(element)

    ordered = head + nodes + new_nodes + ways + new_ways + relations + new_relations
    for element in list(root):
        root.remove(element)
    for element in ordered:
        element.tail = '\n '
        root.append(element)
    root.text = '\n '
    if ordered:
        ordered[-1].tail = '\n'


def canonical_elements(data: bytes) -> list[tuple]:
    """Смысловой слепок файла: нужен, чтобы сравнивать файлы без учёта отступов."""
    root = _parse_root(data)

    def snapshot(element: ET.Element) -> tuple:
        return (
            element.tag,
            tuple(sorted(element.attrib.items())),
            tuple(snapshot(child) for child in element),
        )

    return [snapshot(element) for element in root]
