from pathlib import Path

base = Path(__file__).parent
css = (base / 'styles.css').read_text()
body = (base / 'body.html').read_text()
scripts = '\n'.join('<script>' + (base / name).read_text() + '</script>' for name in ['model.js', 'app.js'])
html = f'''<!doctype html>
<html lang="ko"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; connect-src 'none'; base-uri 'none'; form-action 'none'">
<title>UMA PLAN · 일본 서버 육성 준비</title>
<style>{css}</style></head><body>{body}{scripts}</body></html>
'''
(base / 'index.html').write_text(html)
print('Built index.html:', len(html.encode('utf-8')), 'bytes')
