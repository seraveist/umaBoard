"""Refresh the curated in-game icon snapshot; not part of nightly data sync."""
import argparse
import hashlib
import json
import re
import struct
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from pathlib import Path

from umaboard.common import DataError
from umaboard.portraits import (INGAME_MANIFEST, INGAME_PROVIDER, INGAME_URL,
    IngameImageClient, apply_ingame_catalog, validate_ingame_entry, write_json)
from umaboard.sync import git_blob_sha, load_active

API = 'https://wiki.biligame.com/umamusume/api.php'


def metadata_for(identifiers):
    found = {}
    for start in range(0, len(identifiers), 50):
        batch = identifiers[start:start + 50]
        query = urllib.parse.urlencode({'action': 'query', 'prop': 'imageinfo',
            'iiprop': 'url|size|sha1', 'format': 'json', 'formatversion': '2',
            'titles': '|'.join(f'File:Chr_icon_{int(i) // 100}_{i}_01.png' for i in batch)})
        request = urllib.request.Request(API + '?' + query, headers={'User-Agent': 'umaBoard-portraits/1.0'})
        with urllib.request.urlopen(request, timeout=30) as response:
            pages = json.load(response)['query']['pages']
        for page in pages:
            match = re.search(r'Chr[ _]icon[ _]\d+[ _](\d+)[ _]01\.png', page['title'])
            if match and page.get('imageinfo'):
                found[match[1]] = page['imageinfo'][0]
    return found


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument('--metadata-cache', type=Path, help='Previously checked API response (found/checkedAt)')
    args = parser.parse_args()
    root = args.root.resolve()
    _, data = load_active(root)
    identifiers = sorted(data['outfits'])
    cached = json.loads(args.metadata_cache.read_text()) if args.metadata_cache else None
    found = cached['found'] if cached else metadata_for(identifiers)
    missing = set(identifiers) - set(found)
    if missing:
        raise DataError('in-game icon metadata missing: ' + ', '.join(sorted(missing)))
    client = IngameImageClient()
    cache = root / '.cache/portrait-blobs'
    cache.mkdir(parents=True, exist_ok=True)

    def download(identifier):
        info = found[identifier]
        if (not re.fullmatch(INGAME_URL, info['url'])
                or not re.fullmatch(r'[a-f0-9]{40}', info['sha1'])
                or (info['width'], info['height']) != (256, 280)):
            raise DataError('invalid source metadata: ' + identifier)
        body = client.get(info['url'])
        if (len(body) != info['size'] or hashlib.sha1(body).hexdigest() != info['sha1']
                or not body.startswith(b'\x89PNG\r\n\x1a\n') or len(body) < 26
                or body[12:16] != b'IHDR' or struct.unpack('>II', body[16:24]) != (256, 280)
                or body[25] != 6):
            raise DataError('original icon verification failed: ' + identifier)
        entry = {'source_path': f'Chr_icon_{int(identifier) // 100}_{identifier}_01.png',
            'source_url': info['url'], 'sha1': info['sha1'], 'blob_sha': git_blob_sha(body),
            'bytes': len(body), 'width': 256, 'height': 280}
        validate_ingame_entry(identifier, entry)
        (cache / (entry['blob_sha'] + '.png')).write_bytes(body)
        return identifier, entry

    with ThreadPoolExecutor(max_workers=4) as pool:
        outfits = dict(pool.map(download, identifiers))
    snapshot = {'schema_version': 1, 'provider': INGAME_PROVIDER,
        'source': 'https://wiki.biligame.com/umamusume/',
        'checked_at': cached['checkedAt'] if cached else date.today().isoformat(), 'outfits': outfits}
    write_json(root / INGAME_MANIFEST, snapshot)
    catalog = json.loads((root / 'data/portraits.json').read_text())
    apply_ingame_catalog(root, catalog, data)
    write_json(root / 'data/portraits.json', catalog)
    print(json.dumps({'verified_outfits': len(outfits), 'original_format': '256x280 RGBA PNG'}))


if __name__ == '__main__':
    main()
