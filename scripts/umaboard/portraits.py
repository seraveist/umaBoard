"""Pinned in-game outfit icons and UmaTools SSR support thumbnails."""
import argparse
import hashlib
import json
import os
import re
import struct
import tempfile
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from .common import DataError, canonical_bytes
from .sync import HttpClient, git_blob_sha, load_active, raw_inputs

REPOSITORY = 'daftuyda/UmaTools'
KINDS = {'outfits': ('UmaId', 'UmaImage', 'character_thumbs'),
         'supports': ('SupportId', 'SupportImage', 'support_thumbs')}
INGAME_PROVIDER = 'bwiki-ingame'
INGAME_MANIFEST = 'curated/ingame-portraits.json'
INGAME_URL = r'https://patchwiki\.biligame\.com/images/umamusume/[a-f0-9]/[a-f0-9]{2}/[a-z0-9]+\.png'


class IngameImageClient:
    """Tokenless, host-restricted client, separate from GitHub credentials."""
    def get(self, url):
        if not re.fullmatch(INGAME_URL, url):
            raise DataError('unexpected in-game portrait URL')

        class Redirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, req, fp, code, msg, headers, newurl):
                if not re.fullmatch(INGAME_URL, newurl):
                    raise DataError('unexpected in-game portrait redirect')
                return super().redirect_request(req, fp, code, msg, headers, newurl)

        opener = urllib.request.build_opener(Redirect())
        request = urllib.request.Request(url, headers={'User-Agent': 'umaBoard-portraits/1.0'})
        for attempt in range(3):
            try:
                with opener.open(request, timeout=30) as response:
                    body = response.read(1024 * 1024 + 1)
                    if len(body) > 1024 * 1024:
                        raise DataError('portrait exceeded size limit')
                    return body
            except urllib.error.HTTPError as exc:
                if exc.code not in {429, 500, 502, 503, 504} or attempt == 2:
                    raise DataError(f'portrait HTTP {exc.code}') from exc
            except (urllib.error.URLError, TimeoutError) as exc:
                if attempt == 2:
                    raise DataError('portrait download failed') from exc
            time.sleep(2 ** attempt)


def validate_ingame_entry(identifier, entry):
    if (not re.fullmatch(r'\d{6}', identifier)
            or entry.get('source_path') != f'Chr_icon_{int(identifier) // 100}_{identifier}_01.png'
            or not re.fullmatch(INGAME_URL, entry.get('source_url', ''))
            or not re.fullmatch(r'[a-f0-9]{40}', entry.get('sha1', ''))
            or not re.fullmatch(r'[a-f0-9]{40}', entry.get('blob_sha', ''))
            or not isinstance(entry.get('bytes'), int) or not 0 < entry['bytes'] <= 1024 * 1024
            or (entry.get('width'), entry.get('height')) != (256, 280)):
        raise DataError('invalid in-game portrait provenance')


def apply_ingame_catalog(root, catalog, data):
    path = root / INGAME_MANIFEST
    if not path.is_file():
        return catalog
    pinned = json.loads(path.read_text(encoding='utf-8'))
    if pinned.get('provider') != INGAME_PROVIDER:
        raise DataError('unexpected in-game portrait source')
    catalog['ingame_source'] = {k: pinned[k] for k in ('provider', 'source', 'checked_at')}
    for identifier in sorted(data['outfits']):
        entry = pinned['outfits'].get(identifier)
        if not entry:
            continue
        validate_ingame_entry(identifier, entry)
        catalog['outfits'][identifier] = {**entry, 'provider': INGAME_PROVIDER,
            'path': f'assets/portraits/outfits/{identifier}-{entry["blob_sha"]}.png'}
    catalog['missing']['outfits'] = sorted(set(data['outfits']) - set(catalog['outfits']))
    return catalog


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
    # Image-only additions must be found even when the mechanics JSON is unchanged.
    commits = client.json(f'https://api.github.com/repos/{REPOSITORY}/commits?per_page=1')
    if not commits:
        raise DataError('portrait repository has no commits')
    image_source = {'repository': REPOSITORY, 'commit': commits[0]['sha']}
    tree = client.json(f'https://api.github.com/repos/{REPOSITORY}/git/trees/{image_source["commit"]}?recursive=1')
    selected = {**source, 'files': [f for f in source['files'] if f['key'] in KINDS]}
    raw, _ = raw_inputs(client, [selected], root / '.cache/raw')
    catalog = catalog_for(image_source, raw, data, tree)
    catalog['data_source_commit'] = source['commit']
    apply_ingame_catalog(root, catalog, data)
    changed = write_json(root / 'data/portraits.json', catalog)
    return catalog, changed


def portrait_bytes(root, catalog, kind, identifier, client, fetch, ingame_client=None):
    entry = catalog[kind][identifier]
    folder = KINDS[kind][2]
    ingame = entry.get('provider') == INGAME_PROVIDER
    if ingame:
        if kind != 'outfits':
            raise DataError('in-game icons must identify an outfit')
        validate_ingame_entry(identifier, entry)
        extension = '.png'
        url = entry['source_url']
    elif (entry.get('provider') is not None or catalog['source']['repository'] != REPOSITORY
            or not re.fullmatch(r'[a-f0-9]{40}', catalog['source']['commit'])
            or not re.fullmatch(rf'public/assets/{folder}/{identifier}-[A-Za-z0-9_-]+\.(png|webp)', entry['source_path'])
            or not re.fullmatch(r'[a-f0-9]{40}', entry['blob_sha'])):
        raise DataError('invalid portrait path or provenance')
    else:
        extension = Path(entry['source_path']).suffix
        url = f'https://raw.githubusercontent.com/{REPOSITORY}/{catalog["source"]["commit"]}/{entry["source_path"]}'
    if entry['path'] != f'assets/portraits/{kind}/{identifier}-{entry["blob_sha"]}{extension}':
        raise DataError('invalid portrait path or provenance')
    cache = root / '.cache/portrait-blobs' / (entry['blob_sha'] + Path(entry['path']).suffix)
    body = cache.read_bytes() if cache.is_file() else None
    if body is None or git_blob_sha(body) != entry['blob_sha']:
        if not fetch:
            return None
        body = (ingame_client or IngameImageClient()).get(url) if ingame else client.get(url)
    webp = body[:4] == b'RIFF' and body[8:12] == b'WEBP'
    png = body.startswith(b'\x89PNG\r\n\x1a\n')
    if (len(body) != entry['bytes'] or git_blob_sha(body) != entry['blob_sha']
            or not (webp if entry['path'].endswith('.webp') else png)):
        raise DataError('portrait differs from pinned image blob')
    if ingame and (hashlib.sha1(body).hexdigest() != entry['sha1']
            or len(body) < 26 or body[12:16] != b'IHDR'
            or struct.unpack('>II', body[16:24]) != (256, 280) or body[25] != 6):
        raise DataError('in-game portrait must retain its original RGBA dimensions')
    if not cache.is_file() or cache.read_bytes() != body:
        cache.parent.mkdir(parents=True, exist_ok=True)
        cache.write_bytes(body)
    return body


def stage_portraits(root, output, fetch=False, client=None, ingame_client=None):
    client = client or HttpClient(os.environ.get('GITHUB_TOKEN'))
    catalog = json.loads((root / 'data/portraits.json').read_text(encoding='utf-8'))
    staged = {**catalog, 'outfits': {}, 'supports': {}}
    jobs = [(kind, identifier) for kind in KINDS for identifier in catalog[kind]]

    def copy_one(job):
        kind, identifier = job
        try:
            body = portrait_bytes(root, catalog, kind, identifier, client, fetch, ingame_client)
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
    parser = argparse.ArgumentParser(description='Synchronize pinned in-game and UmaTools portrait catalogs')
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[2])
    args = parser.parse_args(argv)
    catalog, changed = synchronize_catalog(args.root.resolve())
    print(json.dumps({'status': 'updated' if changed else 'unchanged',
                      'available': {kind: len(catalog[kind]) for kind in KINDS},
                      'missing': {kind: len(catalog['missing'][kind]) for kind in KINDS}}))


if __name__ == '__main__':
    main()
