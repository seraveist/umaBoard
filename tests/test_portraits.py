import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from umaboard.common import DataError
from umaboard.portraits import catalog_for, portrait_bytes, stage_portraits, synchronize_catalog, write_json
from umaboard.sync import git_blob_sha


class PortraitTests(unittest.TestCase):
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


if __name__ == '__main__':
    unittest.main()
