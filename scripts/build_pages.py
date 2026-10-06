"""Stage the static app and only its active, validated data bundle for Pages."""
import argparse
import hashlib
import json
import re
import shutil
from pathlib import Path

from umaboard.common import DataError
from umaboard.sync import load_active
from umaboard.validate import validate_dataset
from umaboard.portraits import stage_portraits


def version_app_assets(output):
    files = sorted([*output.glob('assets/*.mjs'), *output.glob('assets/*.css'), output / 'index.html'])
    digest = hashlib.sha256()
    for path in files:
        digest.update(path.relative_to(output).as_posix().encode())
        digest.update(b'\0' + path.read_bytes())
    version = digest.hexdigest()[:16]
    # Version the complete module graph, including the worker entry, so cached
    # modules from an earlier deployment cannot mix with a changed result schema.
    for path in output.glob('assets/*.mjs'):
        source = re.sub(r'''(['"])(\./[\w.-]+\.mjs)\1''',
                        lambda match: f'{match[1]}{match[2]}?v={version}{match[1]}', path.read_text())
        path.write_text(source)
    index = output / 'index.html'
    index.write_text(re.sub(r'((?:src|href)="assets/[^"?]+\.(?:mjs|css))"',
                            lambda match: f'{match[1]}?v={version}"', index.read_text()))
    return version


def main():
    parser = argparse.ArgumentParser(description='Stage the static app for GitHub Pages')
    parser.add_argument('--fetch-portraits', action='store_true', help='Download missing pinned UmaTools images into the build cache')
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    manifest, data = load_active(root)
    if data is None:
        raise DataError('No active dataset: run python scripts/sync_data.py first')
    report = validate_dataset(data, json.loads((root / 'sync-config.json').read_text()))
    stored = json.loads((root / manifest['validation_path']).read_text())
    if stored != report:
        raise DataError('Stored validation report differs from current validator')

    output = root / '.cache' / 'pages'
    if output.exists():
        shutil.rmtree(output)
    output.mkdir(parents=True)
    for name in ('index.html', 'LICENSE', 'NOTICE.md', 'data/manifest.json',
                 manifest['dataset_path'], manifest['validation_path']):
        source = root / name
        target = output / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)
    shutil.copytree(root / 'assets', output / 'assets')
    assets_version = version_app_assets(output)
    portraits = stage_portraits(root, output, fetch=args.fetch_portraits)
    # The prototype is self-contained; its authoring sources are unnecessary.
    (output / 'prototype').mkdir()
    shutil.copyfile(root / 'prototype/index.html', output / 'prototype/index.html')
    (output / '.nojekyll').touch()
    print(json.dumps({'output': str(output.relative_to(root)),
                      'data_version': manifest['active_version'],
                      'assets_version': assets_version,
                      'portraits': portraits,
                      'files': sum(p.is_file() for p in output.rglob('*'))}))


if __name__ == '__main__':
    main()
