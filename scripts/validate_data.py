import argparse
import json
from pathlib import Path
from umaboard.common import DataError, digest
from umaboard.sync import load_active
from umaboard.validate import validate_dataset

parser=argparse.ArgumentParser()
parser.add_argument('--root',type=Path,default=Path(__file__).resolve().parents[1])
args=parser.parse_args()
manifest,data=load_active(args.root)
if data is None:raise SystemExit('No active dataset: run python scripts/sync_data.py first')
report=validate_dataset(data,json.loads((args.root/'sync-config.json').read_text()))
stored=json.loads((args.root/manifest['validation_path']).read_text())
if stored!=report:raise DataError('stored validation report differs from current validator')
print(json.dumps({'status':report['status'],'counts':report['counts'],'warnings':len(report['warnings'])},ensure_ascii=False))
