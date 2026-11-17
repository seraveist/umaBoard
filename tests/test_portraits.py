import json
import hashlib
import struct
import sys
import tempfile
import unittest
import zlib
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from umaboard.common import DataError
from umaboard.portraits import (INGAME_PROVIDER, IngameImageClient, apply_ingame_catalog,
    catalog_for, portrait_bytes, stage_portraits, synchronize_catalog, write_json)
from umaboard.sync import git_blob_sha


class PortraitTests(unittest.TestCase):
    def ingame_fixture(self):
        def chunk(kind, body):
            return struct.pack('>I', len(body)) + kind + body + struct.pack('>I', zlib.crc32(kind + body))
        body = (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', 256, 280, 8, 6, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(b'\0' * (280 * (1 + 256 * 4)))) + chunk(b'IEND', b''))
        entry = {'source_path': 'Chr_icon_1001_100102_01.png',
            'source_url': 'https://patchwiki.biligame.com/images/umamusume/1/12/test.png',
            'bytes': len(body), 'width': 256, 'height': 280,
            'sha1': hashlib.sha1(body).hexdigest(), 'blob_sha': git_blob_sha(body)}
        snapshot = {'provider': INGAME_PROVIDER, 'source': 'https://wiki.biligame.com/umamusume/',
            'checked_at': '2026-11-17', 'outfits': {'100102': entry}}
        return body, snapshot

    def fixture(self):
        body = b'RIFF' + b'\x00' * 4 + b'WEBP' + b'pinned test image'
        path = 'public/assets/character_thumbs/100101-special-week.webp'
        source = {'repository': 'daftuyda/UmaTools', 'commit': 'a' * 40}
        raw = {'outfits': [{'UmaId': '100101', 'UmaImage': '/assets/character_thumbs/100101-special-week.png'}],
               'supports': [{'SupportId': '30001', 'SupportImage': '/assets/support_thumbs/30001-special-week.png'}]}
        data = {'outfits': {'100101': {}, '100102': {}}, 'supports': {'30001': {'rarity': 'SSR'}, '10001': {'rarity': 'R'}}}
        tree = {'tree': [{'type': 'blob', 'path': path, 'sha': git_blob_sha(body), 'size': len(body)}]}
        return body, source, raw, data, tree

    def test_missing_images_keep_records_and_exclude_non_ssr_assets(self):
        _, source, raw, data, tree = self.fixture()
        before = json.dumps(data)
        catalog = catalog_for(source, raw, data, tree)
        self.assertEqual(list(catalog['outfits']), ['100101'])
        self.assertEqual(catalog['missing'], {'outfits': ['100102'], 'supports': ['30001']})
        self.assertEqual(json.dumps(data), before)
        self.assertTrue(catalog['outfits']['100101']['path'].endswith('.webp'))

    def test_png_fallback_and_untrusted_image_urls_are_not_followed(self):
        _, source, raw, data, tree = self.fixture()
        tree['tree'][0]['path'] = tree['tree'][0]['path'].replace('.webp', '.png')
        catalog = catalog_for(source, raw, data, tree)
        self.assertTrue(catalog['outfits']['100101']['path'].endswith('.png'))
        for image in ['https://gametora.com/image.png', '/assets/character_thumbs/../../image.png', '/assets/character_thumbs/100102-other.png']:
            raw['outfits'][0]['UmaImage'] = image
            self.assertEqual(catalog_for(source, raw, data, tree)['outfits'], {})

    def test_pinned_download_and_cache_reuse(self):
        body, source, raw, data, tree = self.fixture()
        catalog = catalog_for(source, raw, data, tree)
        class Client:
            urls = []
            def get(self, url):
                self.urls.append(url)
                return body
        client = Client()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.assertEqual(portrait_bytes(root, catalog, 'outfits', '100101', client, True), body)
            self.assertEqual(portrait_bytes(root, catalog, 'outfits', '100101', client, True), body)
            self.assertEqual(len(client.urls), 1)
            self.assertTrue(client.urls[0].startswith('https://raw.githubusercontent.com/daftuyda/UmaTools/' + 'a' * 40))

    def test_corrupt_download_is_not_cached_or_published(self):
        _, source, raw, data, tree = self.fixture()
        catalog = catalog_for(source, raw, data, tree)
        class Client:
            def get(self, url): return b'<html>not an image</html>'
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with self.assertRaisesRegex(DataError, 'pinned image blob'):
                portrait_bytes(root, catalog, 'outfits', '100101', Client(), True)
            self.assertFalse((root / '.cache/portrait-blobs').exists())
            write_json(root / 'data/portraits.json', catalog)
            report = stage_portraits(root, root / 'public', fetch=True, client=Client())
            self.assertEqual(report['unavailable_downloads'], 1)
            staged = json.loads((root / 'public/data/portraits.json').read_text())
            self.assertEqual(staged['outfits'], {})

    def test_image_change_updates_path_and_unchanged_catalog_does_not_rewrite(self):
        _, source, raw, data, tree = self.fixture()
        first = catalog_for(source, raw, data, tree)
        tree['tree'][0]['sha'] = 'b' * 40
        second = catalog_for(source, raw, data, tree)
        self.assertNotEqual(first['outfits']['100101']['path'], second['outfits']['100101']['path'])
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'portraits.json'
            self.assertTrue(write_json(path, second))
            modified = path.stat().st_mtime_ns
            self.assertFalse(write_json(path, second))
            self.assertEqual(path.stat().st_mtime_ns, modified)

    def test_image_only_upstream_addition_is_found_without_a_mechanics_change(self):
        _, source, raw, data, tree = self.fixture()
        raw['outfits'].append({'UmaId': '100102', 'UmaImage': '/assets/character_thumbs/100102-special-week.png'})
        manifest = {'sources': [{**source, 'source_id': 'umatools', 'files': []}]}
        class Client:
            commit = 'a' * 40
            def json(self, url):
                return [{'sha': self.commit}] if '/commits?' in url else tree
        client = Client()
        with tempfile.TemporaryDirectory() as directory, patch('umaboard.portraits.load_active', return_value=(manifest, data)), patch('umaboard.portraits.raw_inputs', return_value=(raw, [])):
            root = Path(directory)
            first, _ = synchronize_catalog(root, client)
            self.assertIn('100102', first['missing']['outfits'])
            client.commit = 'b' * 40
            tree['tree'].append({**tree['tree'][0], 'path': 'public/assets/character_thumbs/100102-special-week.webp'})
            second, changed = synchronize_catalog(root, client)
            self.assertTrue(changed)
            self.assertIn('100102', second['outfits'])
            self.assertEqual(second['source']['commit'], 'b' * 40)
            self.assertEqual(second['data_source_commit'], source['commit'])
            self.assertEqual(manifest['sources'][0]['commit'], 'a' * 40)

    def test_ingame_override_survives_sync_without_changing_supports_or_mechanics(self):
        _, source, raw, data, tree = self.fixture()
        _, snapshot = self.ingame_fixture()
        manifest = {'sources': [{**source, 'source_id': 'umatools', 'files': []}]}
        class Client:
            def json(self, url): return [{'sha': 'b' * 40}] if '/commits?' in url else tree
        with tempfile.TemporaryDirectory() as directory, patch('umaboard.portraits.load_active', return_value=(manifest, data)), patch('umaboard.portraits.raw_inputs', return_value=(raw, [])):
            root = Path(directory)
            write_json(root / 'curated/ingame-portraits.json', snapshot)
            catalog, _ = synchronize_catalog(root, Client())
            self.assertEqual(catalog['outfits']['100102']['provider'], INGAME_PROVIDER)
            self.assertEqual(catalog['outfits']['100102']['source_path'], 'Chr_icon_1001_100102_01.png')
            self.assertEqual(catalog['missing']['outfits'], [])
            self.assertEqual(catalog['supports'], catalog_for(source, raw, data, tree)['supports'])
            self.assertEqual(catalog['data_source_commit'], source['commit'])

    def test_ingame_download_is_pinned_cached_and_never_uses_the_github_client(self):
        _, source, raw, data, tree = self.fixture()
        body, snapshot = self.ingame_fixture()
        class GithubClient:
            def get(self, url): raise AssertionError('GitHub credential client used for external image')
        class ImageClient:
            urls = []
            def get(self, url):
                self.urls.append(url)
                return body
        client = ImageClient()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            write_json(root / 'curated/ingame-portraits.json', snapshot)
            catalog = apply_ingame_catalog(root, catalog_for(source, raw, data, tree), data)
            for _ in range(2):
                self.assertEqual(portrait_bytes(root, catalog, 'outfits', '100102', GithubClient(), True, client), body)
            self.assertEqual(client.urls, [snapshot['outfits']['100102']['source_url']])
            catalog['outfits'].pop('100101')
            write_json(root / 'data/portraits.json', catalog)
            report = stage_portraits(root, root / 'public', fetch=True, client=GithubClient(), ingame_client=client)
            self.assertEqual(report['available']['outfits'], 1)
            self.assertEqual(len(client.urls), 1)
            catalog['outfits']['100102']['sha1'] = '0' * 40
            with self.assertRaisesRegex(DataError, 'original RGBA'):
                portrait_bytes(root, catalog, 'outfits', '100102', GithubClient(), False, client)

    def test_ingame_identity_host_and_local_paths_are_checked_before_download(self):
        _, source, raw, data, tree = self.fixture()
        _, snapshot = self.ingame_fixture()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            write_json(root / 'curated/ingame-portraits.json', snapshot)
            catalog = apply_ingame_catalog(root, catalog_for(source, raw, data, tree), data)
            entry = catalog['outfits']['100102']
            for field, invalid in [('source_url', 'https://example.com/image.png'),
                    ('source_path', 'Chr_icon_1001_100101_01.png'), ('path', '../../image.png')]:
                old = entry[field]
                entry[field] = invalid
                with self.assertRaises(DataError):
                    portrait_bytes(root, catalog, 'outfits', '100102', None, True)
                entry[field] = old
            with self.assertRaises(DataError):
                IngameImageClient().get('https://example.com/image.png')


if __name__ == '__main__':
    unittest.main()
