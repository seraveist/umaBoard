"""Optional display assets, exclusively from the pinned UmaTools repository."""
import argparse
import json
import os
import re
import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from .common import DataError, canonical_bytes
from .sync import HttpClient, git_blob_sha, load_active, raw_inputs

REPOSITORY = 'daftuyda/UmaTools'
KINDS = {'outfits': ('UmaId', 'UmaImage', 'character_thumbs'),
         'supports': ('SupportId', 'SupportImage', 'support_thumbs')}


def write_json(path, value):
    content = canonical_bytes(value)
    if path.is_file() and path.read_bytes() == content:
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(dir=path.parent, prefix='.portraits-')
    try:
        with os.fdopen(fd, 'wb') as stream:
            stream.write(content)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    return True


def catalog_for(source, raw, data, tree):
    if source['repository'] != REPOSITORY or not re.fullmatch(r'[a-f0-9]{40}', source['commit']):
        raise DataError('portraits must use the pinned UmaTools source')
    if tree.get('truncated'):
        raise DataError('portrait source tree truncated')
    files = {entry['path']: entry for entry in tree['tree'] if entry['type'] == 'blob'}
    catalog = {'schema_version': 1, 'source': {'repository': REPOSITORY, 'commit': source['commit']},
               'outfits': {}, 'supports': {}, 'missing': {'outfits': [], 'supports': []}}
    for kind, (id_key, image_key, folder) in KINDS.items():
        images = {str(row[id_key]): row.get(image_key) for row in raw[kind]}
        for identifier, record in sorted(data[kind].items()):
            if kind == 'supports' and record['rarity'] != 'SSR':
                continue
            image = images.get(identifier)
            # Use source metadata, never construct a filename from a translated name.
            pattern = rf'/assets/{folder}/{identifier}-[A-Za-z0-9_-]+\.(png|webp)'
            candidates = []
            if isinstance(image, str) and re.fullmatch(pattern, image):
                path = 'public' + image
                candidates = [re.sub(r'\.(png|webp)$', '.webp', path), path]
            path = next((p for p in candidates if p in files), None)
            if path is None:
                catalog['missing'][kind].append(identifier)
                continue
            entry = files[path]
            if not re.fullmatch(r'[a-f0-9]{40}', entry['sha']) or not 0 < entry['size'] <= 1024 * 1024:
                raise DataError('invalid portrait blob metadata')
            extension = Path(path).suffix
            catalog[kind][identifier] = {
                'path': f'assets/portraits/{kind}/{identifier}-{entry["sha"]}{extension}',
                'source_path': path, 'blob_sha': entry['sha'], 'bytes': entry['size']}
    return catalog


def synchronize_catalog(root, client=None):
    client = client or HttpClient(os.environ.get('GITHUB_TOKEN'))
    manifest, data = load_active(root)
    source = next(s for s in manifest['sources'] if s['source_id'] == 'umatools')
    # The same commit as the active mechanics data; no GameTora or other fallback.
    tree = client.json(f'https://api.github.com/repos/{REPOSITORY}/git/trees/{source["commit"]}?recursive=1')
    selected = {**source, 'files': [f for f in source['files'] if f['key'] in KINDS]}
    raw, _ = raw_inputs(client, [selected], root / '.cache/raw')
    catalog = catalog_for(source, raw, data, tree)
    changed = write_json(root / 'data/portraits.json', catalog)
    return catalog, changed


def portrait_bytes(root, catalog, kind, identifier, client, fetch):
    entry = catalog[kind][identifier]
    folder = KINDS[kind][2]
    if (catalog['source']['repository'] != REPOSITORY
            or not re.fullmatch(r'[a-f0-9]{40}', catalog['source']['commit'])
            or not re.fullmatch(rf'public/assets/{folder}/{identifier}-[A-Za-z0-9_-]+\.(png|webp)', entry['source_path'])
            or not re.fullmatch(r'[a-f0-9]{40}', entry['blob_sha'])
            or entry['path'] != f'assets/portraits/{kind}/{identifier}-{entry["blob_sha"]}{Path(entry["source_path"]).suffix}'):
        raise DataError('invalid portrait path or provenance')
    cache = root / '.cache/portrait-blobs' / (entry['blob_sha'] + Path(entry['path']).suffix)
    body = cache.read_bytes() if cache.is_file() else None
    if body is None or git_blob_sha(body) != entry['blob_sha']:
        if not fetch:
            return None
        url = f'https://raw.githubusercontent.com/{REPOSITORY}/{catalog["source"]["commit"]}/{entry["source_path"]}'
        body = client.get(url)
    webp = body[:4] == b'RIFF' and body[8:12] == b'WEBP'
    png = body.startswith(b'\x89PNG\r\n\x1a\n')
    if (len(body) != entry['bytes'] or git_blob_sha(body) != entry['blob_sha']
            or not (webp if entry['path'].endswith('.webp') else png)):
        raise DataError('portrait differs from pinned image blob')
    if not cache.is_file() or cache.read_bytes() != body:
        cache.parent.mkdir(parents=True, exist_ok=True)
        cache.write_bytes(body)
    return body


def stage_portraits(root, output, fetch=False, client=None):
    client = client or HttpClient(os.environ.get('GITHUB_TOKEN'))
    catalog = json.loads((root / 'data/portraits.json').read_text())
    staged = {**catalog, 'outfits': {}, 'supports': {}}
    jobs = [(kind, identifier) for kind in KINDS for identifier in catalog[kind]]

    def copy_one(job):
        kind, identifier = job
        try:
            body = portrait_bytes(root, catalog, kind, identifier, client, fetch)
            if body is None:
                return job, False
            destination = output / catalog[kind][identifier]['path']
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(body)
            return job, True
        except (DataError, OSError):
            # An optional image failure must not break skill calculations or expose a broken URL.
            return job, False

    with ThreadPoolExecutor(max_workers=8) as pool:
        for (kind, identifier), available in pool.map(copy_one, jobs):
            if available:
                staged[kind][identifier] = catalog[kind][identifier]
    write_json(output / 'data/portraits.json', staged)
    return {'available': {kind: len(staged[kind]) for kind in KINDS},
            'source_missing': {kind: len(catalog['missing'][kind]) for kind in KINDS},
            'unavailable_downloads': len(jobs) - sum(len(staged[kind]) for kind in KINDS)}


def main(argv=None):
    parser = argparse.ArgumentParser(description='Synchronize the UmaTools-only portrait catalog')
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[2])
    args = parser.parse_args(argv)
    catalog, changed = synchronize_catalog(args.root.resolve())
    print(json.dumps({'status': 'updated' if changed else 'unchanged',
                      'available': {kind: len(catalog[kind]) for kind in KINDS},
                      'missing': {kind: len(catalog['missing'][kind]) for kind in KINDS}}))


if __name__ == '__main__':
    main()
