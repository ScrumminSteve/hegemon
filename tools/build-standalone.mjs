// Build ONE self-contained hegemon.html: every module bundled, styles
// inlined, map art embedded as data URIs. Opens from file://, a USB stick,
// or an AirDropped file — no server, no network, no installation.
// Owner request (Jul 2026): "encapsulate this game so I can play it offline."
//   node tools/build-standalone.mjs   →  dist/hegemon.html
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const b64 = p => `data:image/webp;base64,${readFileSync(p).toString('base64')}`;
const ASSETS = {
  'assets/map-asoiaf.webp': b64('assets/map-asoiaf.webp'),
  'assets/map-2026.webp': b64('assets/map-2026.webp'),
};

const bundle = await build({
  entryPoints: ['src/game/app.js'],
  bundle: true, format: 'iife', write: false,
  define: {}, logLevel: 'silent',
});
let js = bundle.outputFiles[0].text;
for (const [path, uri] of Object.entries(ASSETS)) js = js.split(path).join(uri);

let html = readFileSync('game.html', 'utf8');
const css = readFileSync('styles.css', 'utf8');
html = html.replace(/<link[^>]*styles\.css[^>]*>/, `<style>\n${css}\n</style>`);
html = html.replace(/<script type="module"[^>]*src=[^>]*><\/script>/,
  () => `<script>\n${js.replace(/<\/script>/g, '<\\/script>')}\n</script>`);
for (const [path, uri] of Object.entries(ASSETS)) html = html.split(path).join(uri);

mkdirSync('dist', { recursive: true });
writeFileSync('dist/hegemon.html', html);
console.log(`dist/hegemon.html — ${(html.length / 1048576).toFixed(1)} MB, fully self-contained`);
