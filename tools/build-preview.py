#!/usr/bin/env python3
"""Bundle the table-mode game into one self-contained HTML file using an
import map of data: URLs — no source rewriting beyond import specifiers."""
import base64, os, re, sys

FILES = [
  'src/data/map.js', 'src/data/factions.js', 'src/data/setup.js',
    'src/data/leaderCards.js',
  'src/themes/core.js', 'src/themes/asoiaf.js',
  'src/engine/types.js', 'src/engine/rng.js', 'src/engine/state.js',
  'src/engine/planning.js', 'src/engine/actionPhase.js', 'src/engine/cards.js',
    'src/engine/combat.js',
  'src/engine/engine.js', 'src/engine/views.js',
  'src/map-view.js', 'src/game/app.js',
]
def mid(path):  # module id
    return 'h/' + os.path.relpath(path, 'src')[:-3].replace(os.sep, '/')

ids = {f: mid(f) for f in FILES}
mods = {}
for f in FILES:
    src = open(f).read()
    d = os.path.dirname(f)
    def rew(m):
        target = os.path.normpath(os.path.join(d, m.group(1)))
        assert target in ids, f'{f} imports unknown {target}'
        return f"from '{ids[target]}'"
    src = re.sub(r"from '([^']+)'", rew, src)
    mods[ids[f]] = 'data:text/javascript;base64,' + base64.b64encode(src.encode()).decode()

imap = '{ "imports": {' + ','.join(f'"{k}": "{v}"' for k, v in mods.items()) + '} }'
css = open('styles.css').read()
body = re.search(r'<body[^>]*>(.*)</body>', open('game.html').read(), re.S).group(1)
body = re.sub(r'<script[^>]*></script>', '', body)

html = f"""<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>HEGEMON — Table Mode (preview build)</title>
<link href="https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@500;700&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>{css}</style>
<script type="importmap">{imap}</script>
</head><body class="game-body">{body}
<script type="module">import 'h/game/app';</script>
</body></html>"""
open('preview-game.html', 'w').write(html)
print(f'preview-game.html written ({len(html)//1024}KB, {len(mods)} modules)')
