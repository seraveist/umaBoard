"""One-time asset preparation from installed OFL fonts; not a build dependency.

Run after changing the authored UI if its glyph repertoire grows substantially.
The generated subsets are committed and self-hosted, with original licenses.
"""
import json
from pathlib import Path
from fontTools import subset
from fontTools.ttLib import TTFont

root = Path(__file__).resolve().parents[1]
target = root / 'assets/fonts'
target.mkdir(parents=True, exist_ok=True)
texts = []
for pattern in ('assets/*.mjs', 'index.html', 'curated/*.json'):
    texts.extend(p.read_text(encoding='utf-8') for p in root.glob(pattern))
manifest = json.loads((root / 'data/manifest.json').read_text(encoding='utf-8'))
texts.append((root / manifest['dataset_path']).read_text(encoding='utf-8'))
repertoire = ''.join(texts) + ''.join(chr(i) for i in range(32, 127))
font = TTFont('/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc', fontNumber=1)
options = subset.Options()
options.flavor = 'woff'
options.desubroutinize = True
subsetter = subset.Subsetter(options=options)
subsetter.populate(text=repertoire)
subsetter.subset(font)
font.flavor = 'woff'
font.save(target / 'board-sans.woff')
font = TTFont('/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc', fontNumber=1)
subsetter = subset.Subsetter(options=options)
subsetter.populate(text=repertoire)
subsetter.subset(font)
font.flavor = 'woff'
font.save(target / 'board-sans-bold.woff')
font = TTFont('/usr/share/fonts/opentype/urw-base35/NimbusSansNarrow-Bold.otf')
subsetter = subset.Subsetter(options=options)
subsetter.populate(unicodes=range(32, 127))
subsetter.subset(font)
font.flavor = 'woff'
font.save(target / 'race-sans.woff')
for source, name in [('/usr/share/doc/fonts-noto-cjk/copyright', 'Noto-CJK-LICENSE.txt'),
                     ('/usr/share/doc/fonts-urw-base35/copyright', 'Nimbus-LICENSE.txt')]:
    (target / name).write_text(Path(source).read_text(encoding='utf-8'), encoding='utf-8')
print({p.name: p.stat().st_size for p in target.iterdir()})
