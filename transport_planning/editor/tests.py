import shutil
import tempfile
from pathlib import Path
from xml.etree import ElementTree as ET

from django.conf import settings
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import SimpleTestCase, TestCase, override_settings

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
