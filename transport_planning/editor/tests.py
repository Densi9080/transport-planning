import json
import os
import shutil
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch
from xml.etree import ElementTree as ET

from django.conf import settings
from django.core.files.base import ContentFile
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import SimpleTestCase, TestCase, override_settings

from .models import Project
from .osm_io import ChangesError, OsmFormatError, apply_changes, canonical_elements, parse_document

SMALL = b"""<?xml version="1.0" encoding="UTF-8"?>
<osm version="0.6" generator="test">
 <bounds minlat="52.0" minlon="104.0" maxlat="52.1" maxlon="104.1"/>
 <node id="1" visible="true" version="3" changeset="7" user="a" uid="9" lat="52.0100000" lon="104.0100000"/>
 <node id="2" visible="true" version="1" lat="52.0200000" lon="104.0200000">
  <tag k="highway" v="traffic_signals"/>
 </node>
 <node id="3" visible="true" version="1" lat="52.0300000" lon="104.0300000"/>
 <way id="10" visible="true" version="5" changeset="7">
  <nd ref="1"/>
  <nd ref="2"/>
  <nd ref="3"/>
  <tag k="highway" v="primary"/>
  <tag k="source:unknown" v="must survive"/>
 </way>
 <relation id="20" visible="true" version="1">
  <member type="way" ref="10" role="from"/>
  <member type="node" ref="2" role="via"/>
  <member type="way" ref="999" role="outside"/>
  <tag k="type" v="restriction"/>
 </relation>
</osm>
"""


def root_of(data: bytes) -> ET.Element:
    return ET.fromstring(data)


class ParseTests(SimpleTestCase):
    def test_reads_all_object_types(self):
        doc = parse_document(SMALL)
        self.assertEqual(len(doc['nodes']), 3)
        self.assertEqual(doc['ways'][0]['nds'], [1, 2, 3])
        self.assertEqual(doc['relations'][0]['members'][0], ['way', 10, 'from'])
        self.assertEqual(doc['bounds']['minlat'], 52.0)

    def test_rejects_broken_files(self):
        for bad in (b'not xml', b'<kml></kml>', b'<osm version="0.6"/>'):
            with self.assertRaises(OsmFormatError):
                parse_document(bad)

    def test_rejects_entity_expansion(self):
        evil = b'<!DOCTYPE osm [<!ENTITY a "aaaa">]><osm><node id="1" lat="1" lon="1"/>&a;</osm>'
        with self.assertRaises(OsmFormatError):
            parse_document(evil)


class ApplyChangesTests(SimpleTestCase):
    def test_no_changes_keeps_file_semantically_equal(self):
        self.assertEqual(canonical_elements(apply_changes(SMALL, {})), canonical_elements(SMALL))

    def test_moving_a_node_keeps_metadata_and_other_objects(self):
        out = apply_changes(SMALL, {
            'nodes': {'upsert': [{'id': 1, 'lat': 52.5, 'lon': 104.5}]},
        })
        root = root_of(out)
        node = root.find("node[@id='1']")
        self.assertEqual(node.get('lat'), '52.5000000')
        self.assertEqual(node.get('version'), '3')
        self.assertEqual(node.get('user'), 'a')
        self.assertEqual(root.find("node[@id='2']/tag").get('v'), 'traffic_signals')
        self.assertEqual(root.find("way[@id='10']/tag[@k='source:unknown']").get('v'), 'must survive')

    def test_new_objects_go_to_end_of_their_section(self):
        out = apply_changes(SMALL, {
            'nodes': {'upsert': [{'id': 100, 'lat': 52.04, 'lon': 104.04, 'tags': {'a': 'b'}}]},
            'ways': {'upsert': [{'id': 101, 'nds': [3, 100], 'tags': {'highway': 'service'}}]},
            'relations': {'upsert': [{'id': 102, 'members': [['way', 101, '']], 'tags': {'type': 'x'}}]},
        })
        tags = [(e.tag, e.get('id')) for e in root_of(out)]
        self.assertEqual(tags, [
            ('bounds', None), ('node', '1'), ('node', '2'), ('node', '3'), ('node', '100'),
            ('way', '10'), ('way', '101'), ('relation', '20'), ('relation', '102'),
        ])

    def test_deleting_way_cleans_relation_but_keeps_outside_refs(self):
        out = apply_changes(SMALL, {'ways': {'delete': [10]}})
        members = [m.get('ref') for m in root_of(out).find("relation[@id='20']")
                   if m.tag == 'member']
        self.assertEqual(members, ['2', '999'])

    def test_refuses_changes_that_break_references(self):
        cases = [
            {'nodes': {'delete': [2]}},
            {'nodes': {'delete': [555]}},
            {'ways': {'upsert': [{'id': 10, 'nds': [1]}]}},
            {'ways': {'upsert': [{'id': 11, 'nds': [1, 555]}]}},
            {'nodes': {'upsert': [{'id': 1, 'lat': 'x', 'lon': 1}]}},
            {'relations': {'upsert': [{'id': 21, 'members': [['bad', 1, '']]}]}},
        ]
        for changes in cases:
            with self.subTest(changes=changes), self.assertRaises(ChangesError):
                apply_changes(SMALL, changes)

    def test_can_delete_node_after_rewriting_the_way(self):
        out = apply_changes(SMALL, {
            'nodes': {'delete': [2]},
            'ways': {'upsert': [{'id': 10, 'nds': [1, 3], 'tags': {'highway': 'primary'}}]},
        })
        root = root_of(out)
        self.assertIsNone(root.find("node[@id='2']"))
        self.assertEqual([n.get('ref') for n in root.find("way[@id='10']").findall('nd')], ['1', '3'])


class ExampleFileTests(SimpleTestCase):
    def test_real_example_round_trips_without_loss(self):
        data = (Path(settings.BASE_DIR) / 'samples' / 'example.osm').read_bytes()
        self.assertEqual(canonical_elements(apply_changes(data, {})), canonical_elements(data))


class FrontendServingTests(SimpleTestCase):
    def test_serves_built_app_and_keeps_api_routes(self):
        with tempfile.TemporaryDirectory() as dist:
            root = Path(dist)
            (root / 'assets').mkdir()
            (root / 'index.html').write_text('<title>app</title>', encoding='utf-8')
            (root / 'assets' / 'worker.mjs').write_text('export {}', encoding='utf-8')
            with override_settings(FRONTEND_DIST=root):
                page = self.client.get('/p/some-project')
                self.addCleanup(page.close)
                self.assertEqual(page.status_code, 200)
                self.assertIn(b'app', b''.join(page.streaming_content))
                page.close()
                worker = self.client.get('/assets/worker.mjs')
                self.assertEqual(worker.status_code, 200)
                self.assertIn('javascript', worker['Content-Type'])
                worker.close()
                # Обход каталога закодирован, иначе клиент сам схлопнул бы путь и запрос не дошёл бы до проверки
                self.assertIn(self.client.get('/assets/%2e%2e/index.html').status_code, (400, 404))

    def test_missing_build_gives_404(self):
        with tempfile.TemporaryDirectory() as dist, override_settings(FRONTEND_DIST=Path(dist)):
            self.assertEqual(self.client.get('/').status_code, 404)


class ApiTests(TestCase):
    def setUp(self):
        media = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, media, ignore_errors=True)
        override = override_settings(MEDIA_ROOT=media)
        override.enable()
        self.addCleanup(override.disable)

    def _upload(self) -> str:
        response = self.client.post('/api/projects/', {
            'file': SimpleUploadedFile('team.osm', SMALL, content_type='application/xml'),
        })
        self.assertEqual(response.status_code, 201)
        return response.json()['id']

    def test_full_cycle(self):
        pk = self._upload()
        doc = self.client.get(f'/api/projects/{pk}/').json()
        self.assertEqual(len(doc['document']['ways']), 1)
        self.assertEqual(doc['changes'], {})

        changes = {'nodes': {'upsert': [{'id': 1, 'lat': 52.5, 'lon': 104.5}]}}
        saved = self.client.put(
            f'/api/projects/{pk}/changes/', {'changes': changes}, content_type='application/json'
        )
        self.assertEqual(saved.status_code, 200)
        self.assertEqual(self.client.get(f'/api/projects/{pk}/').json()['changes'], changes)

        exported = self.client.post(
            f'/api/projects/{pk}/export/', {'changes': changes}, content_type='application/json'
        )
        self.assertEqual(exported.status_code, 200)
        self.assertEqual(root_of(exported.content).find("node[@id='1']").get('lat'), '52.5000000')

    def test_bad_upload_is_rejected(self):
        response = self.client.post('/api/projects/', {
            'file': SimpleUploadedFile('bad.osm', b'nope', content_type='application/xml'),
        })
        self.assertEqual(response.status_code, 400)

    def test_bad_changes_return_400(self):
        pk = self._upload()
        response = self.client.post(
            f'/api/projects/{pk}/export/',
            {'changes': {'nodes': {'delete': [2]}}},
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn('2', response.json()['detail'])


class FakeModelServer:
    """Настоящий HTTP-сервер вместо модели: проверяем всё, что реально уходит по сети."""

    def __enter__(self):
        outer = self
        self.requests = []
        self.status = 200
        self.reply = {
            'choices': [{'message': {'role': 'assistant', 'content': 'Привет'}, 'finish_reason': 'stop'}],
            'usage': {'total_tokens': 5},
        }
        self.redirect_hit = False

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args):
                pass

            def _send(self, status, body, headers=None):
                data = body if isinstance(body, bytes) else json.dumps(body).encode()
                self.send_response(status)
                for key, value in (headers or {}).items():
                    self.send_header(key, value)
                self.send_header('Content-Length', str(len(data)))
                self.end_headers()
                self.wfile.write(data)

            def _record(self, body):
                outer.requests.append({
                    'path': self.path,
                    'auth': self.headers.get('Authorization'),
                    'body': body,
                })

            def do_GET(self):
                self._record(None)
                if self.path == '/secret-target/models':
                    outer.redirect_hit = True
                self._send(outer.status, {'data': [{'id': 'model-b'}, {'id': 'model-a'}]})

            def do_POST(self):
                length = int(self.headers.get('Content-Length', 0))
                self._record(json.loads(self.rfile.read(length)))
                if outer.status == 302:
                    self._send(302, b'', {'Location': f'http://127.0.0.1:{outer.port}/secret-target/models'})
                    return
                self._send(outer.status, outer.reply)

        self.server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        self.port = self.server.server_address[1]
        self.url = f'http://127.0.0.1:{self.port}/v1'
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        return self

    def __exit__(self, *exc):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()


def post_json(client, url, body):
    return client.post(url, body, content_type='application/json')


class AssistantTests(TestCase):
    def setUp(self):
        patcher = patch.dict('os.environ')
        patcher.start()
        self.addCleanup(patcher.stop)
        for name in ('LLM_BASE_URL', 'LLM_MODEL', 'LLM_API_KEY', 'LLM_SETTINGS_LOCKED'):
            os.environ.pop(name, None)

    def configure(self, url, key='secret-key-123', model='test-model'):
        response = self.client.put(
            '/api/assistant/settings/',
            {'baseUrl': url, 'model': model, 'apiKey': key},
            content_type='application/json',
        )
        self.assertEqual(response.status_code, 200)
        return response

    def test_key_never_reaches_the_browser(self):
        response = self.configure('http://localhost:11434/v1')
        self.assertTrue(response.json()['hasKey'])
        self.assertNotIn('secret-key-123', response.content.decode())
        self.assertNotIn('secret-key-123', self.client.get('/api/assistant/settings/').content.decode())

    def test_empty_key_keeps_previous_and_clear_removes_it(self):
        self.configure('http://localhost:1/v1')
        self.client.put('/api/assistant/settings/', {'apiKey': ''}, content_type='application/json')
        self.assertTrue(self.client.get('/api/assistant/settings/').json()['hasKey'])
        self.client.put('/api/assistant/settings/', {'clearKey': True}, content_type='application/json')
        self.assertFalse(self.client.get('/api/assistant/settings/').json()['hasKey'])

    def test_local_server_works_without_key(self):
        with FakeModelServer() as server:
            self.client.put(
                '/api/assistant/settings/',
                {'baseUrl': server.url, 'model': 'llama'},
                content_type='application/json',
            )
            response = post_json(self.client, '/api/assistant/chat/', {'messages': [{'role': 'user', 'content': 'Привет'}]})
            self.assertEqual(response.status_code, 200)
            self.assertIsNone(server.requests[0]['auth'])

    def test_url_is_normalized(self):
        response = self.configure('http://localhost:11434/v1/chat/completions/')
        self.assertEqual(response.json()['baseUrl'], 'http://localhost:11434/v1')

    def test_rejects_non_http_url(self):
        for bad in ('file:///etc/passwd', 'ftp://x/y', 'просто текст'):
            response = self.client.put('/api/assistant/settings/', {'baseUrl': bad}, content_type='application/json')
            self.assertEqual(response.status_code, 400, bad)

    def test_chat_goes_to_configured_address_with_key_and_tools(self):
        with FakeModelServer() as server:
            self.configure(server.url)
            tools = [{'type': 'function', 'function': {'name': 'x', 'parameters': {'type': 'object', 'properties': {}}}}]
            response = post_json(
                self.client,
                '/api/assistant/chat/',
                {'messages': [{'role': 'user', 'content': 'Привет'}], 'tools': tools, 'model': 'подмена'},
            )
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()['message']['content'], 'Привет')
            sent = server.requests[0]
            self.assertEqual(sent['path'], '/v1/chat/completions')
            self.assertEqual(sent['auth'], 'Bearer secret-key-123')
            # Модель задаёт сервер: браузер не может её подменить
            self.assertEqual(sent['body']['model'], 'test-model')
            self.assertEqual(sent['body']['tools'], tools)

    def test_passes_tool_calls_back(self):
        with FakeModelServer() as server:
            self.configure(server.url)
            calls = [{'id': 'c1', 'type': 'function', 'function': {'name': 'find_roads', 'arguments': '{}'}}]
            server.reply = {'choices': [{'message': {'role': 'assistant', 'content': None, 'tool_calls': calls}}]}
            data = post_json(self.client, '/api/assistant/chat/', {'messages': [{'role': 'user', 'content': 'х'}]}).json()
            self.assertEqual(data['message']['tool_calls'], calls)
            self.assertEqual(data['message']['content'], '')

    def test_lists_models_for_unsaved_form_values(self):
        with FakeModelServer() as server:
            response = post_json(self.client, '/api/assistant/test/', {'baseUrl': server.url, 'apiKey': 'typed-key'})
            self.assertEqual(response.json()['models'], ['model-a', 'model-b'])
            self.assertEqual(server.requests[0]['auth'], 'Bearer typed-key')

    def test_clear_errors_without_leaking_key(self):
        with FakeModelServer() as server:
            self.configure(server.url)
            server.status = 401
            server.reply = {'error': {'message': 'Incorrect key secret-key-123 provided'}}
            response = post_json(self.client, '/api/assistant/chat/', {'messages': [{'role': 'user', 'content': 'х'}]})
            self.assertEqual(response.status_code, 502)
            self.assertIn('отклонил ключ', response.json()['detail'])
            self.assertNotIn('secret-key-123', response.json()['detail'])

    def test_explains_model_without_tool_support(self):
        with FakeModelServer() as server:
            self.configure(server.url)
            server.status = 400
            server.reply = {'error': {'message': 'model does not support tools'}}
            response = post_json(self.client, '/api/assistant/chat/', {'messages': [{'role': 'user', 'content': 'х'}]})
            self.assertIn('не поддерживает вызов функций', response.json()['detail'])

    def test_unreachable_server_gives_clear_error(self):
        self.configure('http://127.0.0.1:9/v1')
        response = post_json(self.client, '/api/assistant/chat/', {'messages': [{'role': 'user', 'content': 'х'}]})
        self.assertEqual(response.status_code, 502)
        self.assertIn('Не удалось подключиться', response.json()['detail'])

    def test_redirect_does_not_carry_the_key_away(self):
        with FakeModelServer() as server:
            self.configure(server.url)
            server.status = 302
            response = post_json(self.client, '/api/assistant/chat/', {'messages': [{'role': 'user', 'content': 'х'}]})
            self.assertEqual(response.status_code, 502)
            self.assertFalse(server.redirect_hit)

    def test_not_configured(self):
        response = post_json(self.client, '/api/assistant/chat/', {'messages': [{'role': 'user', 'content': 'х'}]})
        self.assertEqual(response.status_code, 400)
        self.assertIn('не настроен', response.json()['detail'])

    def test_rejects_bad_history(self):
        self.configure('http://127.0.0.1:9/v1')
        for bad in ({'messages': []}, {'messages': 'текст'}, {}):
            self.assertEqual(post_json(self.client, '/api/assistant/chat/', bad).status_code, 400)

    def test_environment_configuration_and_lock(self):
        with patch.dict('os.environ', {
            'LLM_BASE_URL': 'http://env-host/v1',
            'LLM_MODEL': 'env-model',
            'LLM_API_KEY': 'env-key',
            'LLM_SETTINGS_LOCKED': '1',
        }):
            data = self.client.get('/api/assistant/settings/').json()
            self.assertEqual(data['baseUrl'], 'http://env-host/v1')
            self.assertTrue(data['locked'])
            self.assertTrue(data['hasKey'])
            self.assertNotIn('env-key', json.dumps(data))
            response = self.client.put('/api/assistant/settings/', {'baseUrl': 'http://evil/v1'}, content_type='application/json')
            self.assertEqual(response.status_code, 403)


class TrafficTests(TestCase):
    def test_sample_network_gets_requested_trips_and_lane_flows(self):
        from .preflight import find_netconvert
        from .traffic import run_traffic

        if find_netconvert() is None:
            self.skipTest('SUMO не установлен')
        data = (Path(settings.BASE_DIR) / 'samples' / 'example.osm').read_bytes()
        result = run_traffic(data, trips=50, period=600)
        self.assertTrue(result['ok'])
        self.assertEqual(result['stats']['loaded'], 50)
        self.assertGreater(len(result['lanes']), 0)
        self.assertGreaterEqual(len(result['lanes'][0]['shape']), 2)


def _neighbors(data: bytes) -> dict[str, list[str]]:
    return {way.get('id'): [nd.get('ref') for nd in way.findall('nd')] for way in ET.fromstring(data).findall('way')}


class SumoSignalsTests(TestCase):
    """Экспорт фаз в SUMO проверяется настоящими netconvert и sumo: только они знают номера соединений."""

    def setUp(self):
        from .preflight import find_netconvert

        self.netconvert = find_netconvert()
        if self.netconvert is None:
            self.skipTest('SUMO не установлен')
        self.data = (Path(settings.BASE_DIR) / 'samples' / 'example.osm').read_bytes()

    def _group(self):
        ways = _neighbors(self.data)
        via = '1872643965'
        main = f"{via}:{ways['1473925806'][-2]}>{ways['1228977331'][1]}"
        pocket = f"{via}:{ways['863833210'][-2]}>{ways['1228977331'][1]}"
        return {
            'nodes': [int(via)],
            'plan': {'offset': 10, 'yellow': 3, 'allRed': 2, 'phases': [{'green': 30}, {'green': 20}]},
            'movements': {main: [0], pocket: [1]},
        }

    def test_plan_becomes_sumo_program_and_sumo_loads_it(self):
        import subprocess

        from .sumo_signals import export_signal_programs, parse_groups

        result = export_signal_programs(self.data, parse_groups([self._group()]))
        self.assertTrue(result['ok'])
        self.assertEqual([item['id'] for item in result['written']], ['1872643965'])
        # Остальные светофоры сети не входят в план редактора и остаются на программе SUMO
        self.assertTrue(result['skipped'])
        logic = ET.fromstring(result['xml'].encode()).find("tlLogic[@id='1872643965']")
        phases = [(p.get('duration'), p.get('state')) for p in logic.findall('phase')]
        # Соединения 0 и 1 идут из кармана, 2 и 3 — по главной; съезд из кармана без плана идёт со своим подходом
        self.assertEqual(phases, [('30', 'rrGG'), ('3', 'rryy'), ('2', 'rrrr'), ('20', 'GGrr'), ('3', 'yyrr'), ('2', 'rrrr')])
        # В редакторе момент цикла t + 10, в SUMO t − offset
        self.assertEqual(logic.get('offset'), '50')

        with tempfile.TemporaryDirectory() as tmp:
            work = Path(tmp)
            (work / 'map.osm').write_bytes(self.data)
            subprocess.run([self.netconvert, '--osm-files', str(work / 'map.osm'), '-o', str(work / 'map.net.xml'), '--no-warnings'],
                           check=True, capture_output=True)
            (work / 'signals.add.xml').write_text(result['xml'], encoding='utf-8')
            sumo = Path(self.netconvert).parent / ('sumo.exe' if os.name == 'nt' else 'sumo')
            done = subprocess.run([str(sumo), '-n', str(work / 'map.net.xml'), '-a', str(work / 'signals.add.xml'), '-e', '120', '--no-step-log'],
                                  capture_output=True, text=True)
            self.assertEqual(done.returncode, 0, done.stderr[-500:])

    def test_conflicting_greens_yield(self):
        from .sumo_signals import export_signal_programs, parse_groups

        group = self._group()
        group['movements'] = {key: [0] for key in group['movements']}
        result = export_signal_programs(self.data, parse_groups([group]))
        state = ET.fromstring(result['xml'].encode()).find("tlLogic[@id='1872643965']/phase").get('state')
        # Выезд из кармана уступает главной дороге, как в программе SUMO по умолчанию
        self.assertEqual(state, 'ggGG')

    def test_bad_groups_are_rejected_by_api(self):
        project = Project(name='t.osm')
        media = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, media, ignore_errors=True)
        with override_settings(MEDIA_ROOT=media):
            project.original.save('t.osm', ContentFile(SMALL), save=True)
            url = f'/api/projects/{project.id}/sumo-signals/'
            bad = self.client.post(url, {'changes': {}, 'groups': [{'nodes': [2], 'plan': {'phases': []}, 'movements': {}}]},
                                   content_type='application/json')
            self.assertEqual(bad.status_code, 400)
            good = self.client.post(url, {'changes': {}, 'groups': [{
                'nodes': [2], 'plan': {'offset': 0, 'yellow': 3, 'allRed': 2, 'phases': [{'green': 30}]},
                'movements': {'2:1>3': [0], '2:3>1': [0]},
            }]}, content_type='application/json')
            self.assertEqual(good.status_code, 200)
            self.assertIn('<tlLogic id="2"', good.json()['xml'])
