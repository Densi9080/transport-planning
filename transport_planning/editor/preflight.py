"""Необязательная предпроверка файла настоящим netconvert из SUMO.

Настройки сервера организаторов нам неизвестны, поэтому результат показывает,
собирается ли сеть в принципе, но не гарантирует прохождение их пайплайна.
"""

from __future__ import annotations

import os
import re
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Any
from xml.etree import ElementTree as ET

TIMEOUT_SECONDS = 120
MAX_MESSAGES = 200


def find_netconvert() -> str | None:
    found = shutil.which('netconvert')
    if found:
        return found
    sumo_home = os.environ.get('SUMO_HOME')
    if not sumo_home:
        try:
            import sumo  # пакет eclipse-sumo

            sumo_home = sumo.SUMO_HOME
        except ImportError:
            return None
    for name in ('netconvert.exe', 'netconvert'):
        candidate = Path(sumo_home) / 'bin' / name
        if candidate.exists():
            return str(candidate)
    return None


def _net_stats(path: Path) -> dict[str, int]:
    edges = lanes = junctions = tls = 0
    for _, element in ET.iterparse(path):
        if element.tag == 'edge' and element.get('function') != 'internal':
            edges += 1
            lanes += len(element.findall('lane'))
        elif element.tag == 'junction' and element.get('type') != 'internal':
            junctions += 1
        elif element.tag == 'tlLogic':
            tls += 1
    return {'edges': edges, 'lanes': lanes, 'junctions': junctions, 'tls': tls}


def run_preflight(osm_bytes: bytes) -> dict[str, Any]:
    binary = find_netconvert()
    if binary is None:
        return {
            'available': False,
            'message': 'netconvert не найден. Установите пакет eclipse-sumo или задайте SUMO_HOME.',
        }

    with tempfile.TemporaryDirectory() as tmp:
        source = Path(tmp) / 'input.osm'
        target = Path(tmp) / 'output.net.xml'
        source.write_bytes(osm_bytes)
        try:
            result = subprocess.run(
                [
                    binary,
                    '--osm-files', str(source),
                    '--output-file', str(target),
                    '--osm.turn-lanes',
                ],
                capture_output=True,
                text=True,
                encoding='utf-8',
                errors='replace',
                timeout=TIMEOUT_SECONDS,
                check=False,
            )
        except subprocess.TimeoutExpired:
            return {
                'available': True,
                'ok': False,
                'errors': [f'netconvert не уложился в {TIMEOUT_SECONDS} с'],
                'warnings': [],
                'warningCount': 0,
                'stats': None,
            }

        output = f'{result.stdout}\n{result.stderr}'
        warnings = re.findall(r'^Warning: (.+)$', output, flags=re.M)
        errors = re.findall(r'^Error: (.+)$', output, flags=re.M)
        ok = result.returncode == 0 and target.exists()
        if not ok and not errors:
            errors = [f'netconvert завершился с кодом {result.returncode}']

        return {
            'available': True,
            'ok': ok,
            'errors': errors[:MAX_MESSAGES],
            'warnings': warnings[:MAX_MESSAGES],
            'warningCount': len(warnings),
            'stats': _net_stats(target) if ok else None,
        }
