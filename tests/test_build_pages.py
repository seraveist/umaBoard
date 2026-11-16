import contextlib
import io
import json
import runpy
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

SCRIPTS = Path(__file__).resolve().parents[1] / 'scripts'
sys.path.insert(0, str(SCRIPTS))
import build_pages
from umaboard.common import canonical_bytes, digest


@contextlib.contextmanager
def cp949_text_defaults():
    """Model Korean Windows defaults even when tests run on a UTF-8 host."""
    read_text, write_text = Path.read_text, Path.write_text

    def read(path, encoding=None, errors=None, **kwargs):
        return read_text(path, encoding=encoding or 'cp949', errors=errors, **kwargs)

    def write(path, text, encoding=None, errors=None, **kwargs):
        return write_text(path, text, encoding=encoding or 'cp949', errors=errors, **kwargs)

    with patch.object(Path, 'read_text', read), patch.object(Path, 'write_text', write):
        yield


class BuildEncodingTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.label = '마신표 日本語 🐎'
        self.dataset = {'label': self.label}
        payload = canonical_bytes(self.dataset)
        version = digest(payload)
        self.manifest = {
            'active_version': version,
            'dataset_path': f'data/bundles/{version}/dataset.json',
            'dataset_sha256': version,
            'validation_path': f'data/bundles/{version}/validation.json',
            'label': self.label,
        }
        self.report = {'status': 'validated', 'counts': {'skills': 1}, 'warnings': [self.label]}
        self.config = {'label': self.label}
        self.write('scripts/build_pages.py', '# test root\n')
        self.write(self.manifest['dataset_path'], payload.decode('utf-8'))
        self.write_json('data/manifest.json', self.manifest)
        self.write_json(self.manifest['validation_path'], self.report)
        self.write_json('sync-config.json', self.config)
        self.write_json('data/portraits.json', {
            'source': {'label': self.label}, 'outfits': {}, 'supports': {},
            'missing': {'outfits': [], 'supports': []},
        })
        for name in ('cm-scenario-profiles.json', 'cm-skill-display.json'):
            self.write_json('curated/' + name, {'label': self.label})
        for name in ('index.html', 'legacy.html'):
            self.write(name, f'<html lang="ko"><title>{self.label}</title><script type="module" src="assets/app.mjs"></script></html>')
        self.write('assets/app.mjs', f"import './dep.mjs'; console.log('{self.label}');\n")
        self.write('assets/dep.mjs', f"export const label = '{self.label}';\n")
        self.write('assets/app.css', f'/* {self.label} */\n')
        self.write('prototype/index.html', self.label)
        self.write('LICENSE', self.label)
        self.write('NOTICE.md', self.label)

    def write(self, name, text):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding='utf-8')

    def write_json(self, name, value):
        self.write(name, json.dumps(value, ensure_ascii=False))

    def test_full_build_preserves_utf8_under_cp949_defaults(self):
        output = io.StringIO()
        with cp949_text_defaults(), contextlib.redirect_stdout(output), \
                patch.object(build_pages, '__file__', str(self.root / 'scripts/build_pages.py')), \
                patch.object(sys, 'argv', ['build_pages.py', '--output', 'dist']), \
                patch.object(build_pages, 'validate_dataset', return_value=self.report) as validate:
            build_pages.main()
        validate.assert_called_once_with(self.dataset, self.config)
        result = json.loads(output.getvalue())
        version = result['assets_version']
        for name in ('index.html', 'legacy.html'):
            html = (self.root / 'dist' / name).read_text(encoding='utf-8')
            self.assertIn(self.label, html)
            self.assertIn(f'assets/app.mjs?v={version}', html)
        module = (self.root / 'dist/assets/app.mjs').read_text(encoding='utf-8')
        self.assertIn(self.label, module)
        self.assertIn(f'./dep.mjs?v={version}', module)
        portraits = json.loads((self.root / 'dist/data/portraits.json').read_text(encoding='utf-8'))
        self.assertEqual(portraits['source']['label'], self.label)
        self.assertEqual((self.root / 'dist' / self.manifest['dataset_path']).read_bytes(),
                         (self.root / self.manifest['dataset_path']).read_bytes())

    def test_validation_cli_reads_utf8_under_cp949_defaults(self):
        output = io.StringIO()
        with cp949_text_defaults(), contextlib.redirect_stdout(output), \
                patch.object(sys, 'argv', ['validate_data.py', '--root', str(self.root)]), \
                patch('umaboard.validate.validate_dataset', return_value=self.report) as validate:
            runpy.run_path(str(SCRIPTS / 'validate_data.py'), run_name='__main__')
        validate.assert_called_once_with(self.dataset, self.config)
        self.assertEqual(json.loads(output.getvalue()), {
            'status': 'validated', 'counts': {'skills': 1}, 'warnings': 1,
        })
