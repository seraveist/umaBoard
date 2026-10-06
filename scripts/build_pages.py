"""Stage the static app and only its active, validated data bundle for Pages."""
import argparse
import json
import shutil
from pathlib import Path

from umaboard.common import DataError
from umaboard.sync import load_active
from umaboard.validate import validate_dataset
from umaboard.portraits import stage_portraits


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
    portraits = stage_portraits(root, output, fetch=args.fetch_portraits)
    # The prototype is self-contained; its authoring sources are unnecessary.
    (output / 'prototype').mkdir()
    shutil.copyfile(root / 'prototype/index.html', output / 'prototype/index.html')
    (output / '.nojekyll').touch()
    print(json.dumps({'output': str(output.relative_to(root)),
                      'data_version': manifest['active_version'],
                      'portraits': portraits,
                      'files': sum(p.is_file() for p in output.rglob('*'))}))


if __name__ == '__main__':
    main()
