"""Fetch only pinned target files; publish immutable bundles through one pointer."""
import argparse
import hashlib
import json
import os
import re
import shutil
import sys
import tempfile
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from .common import DataError, canonical_bytes, digest
from .normalize import normalize
from .validate import validate_dataset


class HttpClient:
    def __init__(self,token=None):self.token=token
    def get(self,url):
        host=urllib.parse.urlparse(url).hostname
        if host not in {'api.github.com','raw.githubusercontent.com'}:raise DataError('unexpected source host')
        headers={'User-Agent':'umaBoard-data-sync/1','Accept':'application/vnd.github+json' if host=='api.github.com' else 'application/json'}
        if self.token and host=='api.github.com':headers['Authorization']='Bearer '+self.token
        for attempt in range(3):
            try:
                with urllib.request.urlopen(urllib.request.Request(url,headers=headers),timeout=30) as response:
                    body=response.read(32*1024*1024+1)
                    if len(body)>32*1024*1024:raise DataError('source file exceeded size limit')
                    return body
            except urllib.error.HTTPError as exc:
                if exc.code not in {429,500,502,503,504} or attempt==2:raise DataError(f'source HTTP {exc.code}: {url}') from exc
            except (urllib.error.URLError,TimeoutError) as exc:
                if attempt==2:raise DataError(f'source download failed: {url}') from exc
            time.sleep(2**attempt)
        raise DataError('unreachable retry state')
    def json(self,url):
        try:return json.loads(self.get(url))
        except (UnicodeDecodeError,json.JSONDecodeError) as exc:raise DataError('invalid source JSON: '+url) from exc


def git_blob_sha(content):
    return hashlib.sha1(f'blob {len(content)}\0'.encode()+content).hexdigest()


def resolve_sources(client,config,previous,refresh_courses=False):
    result=[]
    old_sources={x['source_id']:x for x in (previous or {}).get('sources',[])}
    for source in config['sources']:
        repo=source['repository'];sid=source['id']
        if not re.fullmatch(r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+',repo):raise DataError('invalid repository name')
        previous_source=old_sources.get(sid)
        fixed=source.get('pinned_commit')
        if fixed and not refresh_courses:
            commit=previous_source['commit'] if previous_source else fixed
            # Existing fixed-course metadata needs no nightly API call.
            if previous_source and set(source['files'].values())=={x['path'] for x in previous_source['files']}:
                result.append(previous_source);continue
            info=client.json(f'https://api.github.com/repos/{repo}/commits/{commit}')
        else:
            commits=client.json(f'https://api.github.com/repos/{repo}/commits?per_page=1')
            if not commits:raise DataError('source repository has no commits')
            info=commits[0];commit=info['sha']
        if not re.fullmatch(r'[0-9a-f]{40}',commit):raise DataError('invalid source commit SHA')
        tree=client.json(f'https://api.github.com/repos/{repo}/git/trees/{info["commit"]["tree"]["sha"]}?recursive=1')
        if tree.get('truncated'):raise DataError('source tree truncated')
        entries={x['path']:x for x in tree['tree'] if x['type']=='blob'}
        files=[]
        for key,path in source['files'].items():
            if path not in entries:raise DataError(f'{repo}: target file missing {path}')
            entry=entries[path]
            files.append({'key':key,'path':path,'blob_sha':entry['sha'],'bytes':entry['size']})
        result.append({'source_id':sid,'repository':repo,'commit':commit,
                       'source_commit_at':info['commit']['committer']['date'],'files':files,
                       'mode':'fixed' if fixed and not refresh_courses else 'latest'})
    return result


def raw_inputs(client,sources,cache):
    cache.mkdir(parents=True,exist_ok=True);raw={};metadata=[]
    for source in sources:
        for f in source['files']:
            path=cache/(f['blob_sha']+'.raw')
            content=path.read_bytes() if path.is_file() else None
            if content is None or git_blob_sha(content)!=f['blob_sha']:
                url=f'https://raw.githubusercontent.com/{source["repository"]}/{source["commit"]}/{f["path"]}'
                content=client.get(url)
                if git_blob_sha(content)!=f['blob_sha'] or len(content)!=f['bytes']:raise DataError('raw file differs from pinned Git blob')
                path.write_bytes(content)
            if len(content)!=f['bytes']:raise DataError('cached blob length differs from source metadata')
            metadata.append({'key':f['key'],'sha256':digest(content)})
            try:raw[f['key']]=content.decode() if f['key']=='scenario_memo' else json.loads(content)
            except (UnicodeDecodeError,json.JSONDecodeError) as exc:raise DataError(f'{f["key"]}: invalid UTF-8/JSON') from exc
    return raw,metadata


def load_active(root):
    path=root/'data/manifest.json'
    if not path.exists():return None,None
    manifest=json.loads(path.read_text())
    relative=manifest['dataset_path']
    if not re.fullmatch(r'data/bundles/[a-f0-9]{64}/dataset.json',relative):raise DataError('invalid active bundle path')
    content=(root/relative).read_bytes()
    if digest(content)!=manifest['dataset_sha256']:raise DataError('active bundle checksum mismatch')
    return manifest,json.loads(content)


def adapter_fingerprint(root,config,curated):
    h=hashlib.sha256(canonical_bytes(config)+canonical_bytes(curated))
    for p in sorted((root/'scripts/umaboard').glob('*.py')):
        h.update(p.name.encode());h.update(p.read_bytes())
    return h.hexdigest()


def target_signature(sources):
    return {f'{s["source_id"]}:{f["key"]}':f['blob_sha'] for s in sources for f in s['files']}


def publish(root,data,validation,sources,input_hashes,fingerprint):
    """Only manifest.json activation is atomic. Bundle files exist before activation."""
    content=canonical_bytes(data);version=digest(content)
    parent=root/'data/bundles';parent.mkdir(parents=True,exist_ok=True)
    dest=parent/version
    if not dest.exists():
        stage=Path(tempfile.mkdtemp(prefix='.bundle-',dir=parent))
        try:
            (stage/'dataset.json').write_bytes(content)
            (stage/'validation.json').write_bytes(canonical_bytes(validation))
            os.replace(stage,dest)
        finally:
            if stage.exists():shutil.rmtree(stage)
    else:
        if (dest/'dataset.json').read_bytes()!=content:raise DataError('immutable bundle content conflict')
        if (dest/'validation.json').read_bytes()!=canonical_bytes(validation):
            # Validation report is reproducible for a given payload/config. Keep bundles immutable.
            raise DataError('immutable validation report conflict')
    manifest={'schema_version':1,'server':'JP','active_version':version,
              'dataset_path':f'data/bundles/{version}/dataset.json','dataset_sha256':version,
              'validation_path':f'data/bundles/{version}/validation.json',
              'counts':validation['counts'],'sources':sources,'input_hashes':input_hashes,
              'adapter_fingerprint':fingerprint,'game_build':None,
              'calculation_status':'unvalidated','curation_status':data['curation']['status']}
    pointer=root/'data/manifest.json';new=canonical_bytes(manifest)
    if pointer.exists() and pointer.read_bytes()==new:return False,version
    fd,tmp=tempfile.mkstemp(prefix='.manifest-',dir=pointer.parent)
    try:
        with os.fdopen(fd,'wb') as stream:stream.write(new);stream.flush();os.fsync(stream.fileno())
        os.replace(tmp,pointer)
    finally:
        if os.path.exists(tmp):os.unlink(tmp)
    return True,version


def synchronize(root,client=None,refresh_courses=False,allow_count_decrease=False):
    client=client or HttpClient(os.environ.get('GITHUB_TOKEN'))
    config=json.loads((root/'sync-config.json').read_text())
    curated=json.loads((root/'curated/rules.json').read_text())
    labels_path=root/'curated/names-ko.json'
    if labels_path.exists():curated['korean_names']=json.loads(labels_path.read_text())
    previous_manifest,previous_data=load_active(root)
    fingerprint=adapter_fingerprint(root,config,curated)
    sources=resolve_sources(client,config,previous_manifest,refresh_courses)
    unchanged=previous_manifest and target_signature(sources)==target_signature(previous_manifest['sources']) and fingerprint==previous_manifest['adapter_fingerprint']
    if unchanged:
        validation=validate_dataset(previous_data,config)
        return {'status':'unchanged','version':previous_manifest['active_version'],'counts':validation['counts']}
    raw,input_hashes=raw_inputs(client,sources,root/'.cache/raw')
    data=normalize(raw,curated)
    data['curation']['scenario_memo_sha256']=digest(raw['scenario_memo'].encode())
    validation=validate_dataset(data,config,previous_data,allow_count_decrease)
    changed,version=publish(root,data,validation,sources,input_hashes,fingerprint)
    return {'status':'updated' if changed else 'unchanged','version':version,'counts':validation['counts'],
            'warnings':validation['warnings']}


def main(argv=None):
    parser=argparse.ArgumentParser(description='Synchronize and normalize Japanese Uma Musume data')
    parser.add_argument('--root',type=Path,default=Path(__file__).resolve().parents[2])
    parser.add_argument('--refresh-courses',action='store_true',help='Check the latest alpha course file instead of retaining its fixed snapshot')
    parser.add_argument('--allow-count-decrease',action='store_true',help='Only after reviewing a legitimate bulk deletion')
    args=parser.parse_args(argv);root=args.root.resolve()
    status_path=root/'.cache/sync-status.json';status_path.parent.mkdir(parents=True,exist_ok=True)
    try:
        result=synchronize(root,refresh_courses=args.refresh_courses,allow_count_decrease=args.allow_count_decrease)
        result['checked_at']=datetime.now(timezone.utc).isoformat()
        status_path.write_bytes(canonical_bytes(result))
        print(json.dumps(result,ensure_ascii=False))
        summary=os.environ.get('GITHUB_STEP_SUMMARY')
        if summary:
            with open(summary,'a') as stream:stream.write(f'## JP data sync: {result["status"]}\n\nVersion: `{result["version"]}`\n\nCounts: `{result["counts"]}`\n\nRace calculation: unvalidated.\n')
        return 0
    except (DataError,OSError,KeyError,TypeError,ValueError) as exc:
        result={'status':'failed','checked_at':datetime.now(timezone.utc).isoformat(),'error':str(exc),'previous_bundle_retained':True}
        status_path.write_bytes(canonical_bytes(result));print(json.dumps(result,ensure_ascii=False),file=sys.stderr)
        return 1
