// Downloads the CC0 textures, models and sky used by the 3D viewer from
// Poly Haven, converts them to web-friendly sizes and records their origin.
// Run by .github/workflows/vendor-assets.yml; results are committed to
// assets/lib so the site never depends on a third-party server at runtime.
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import sharp from 'sharp';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const cfg = JSON.parse(await readFile(path.join(root, 'tools/assets.json'), 'utf8'));
const out = path.join(root, 'assets/lib');
const UA = { 'User-Agent': 'luxury-housing-promo/1.0 (asset vendoring; github.com/kerutachi0327-droid/luxury-housing-promo)' };
const MAPKEY = { diff: 'Diffuse', nor: 'nor_gl', arm: 'arm' };

async function get(url, as = 'json') {
  for (let i = 0; i < 4; i++) {
    const r = await fetch(url, { headers: UA });
    if (r.ok) return as === 'json' ? r.json() : Buffer.from(await r.arrayBuffer());
    if (r.status < 500) throw new Error(`${r.status} ${url}`);
    await new Promise(res => setTimeout(res, 2000 * (i + 1)));
  }
  throw new Error(`failed ${url}`);
}
const sha = b => createHash('sha256').update(b).digest('hex');

await rm(out, { recursive: true, force: true });
for (const d of ['tex', 'models', 'hdri']) await mkdir(path.join(out, d), { recursive: true });
const manifest = { generated: new Date().toISOString(), license: 'CC0-1.0', source: 'https://polyhaven.com', textures: {}, models: {}, hdri: null };

for (const t of cfg.textures) {
  const files = await get(`https://api.polyhaven.com/files/${t.id}`);
  const info = await get(`https://api.polyhaven.com/info/${t.id}`);
  const entry = { name: info.name, size: (info.dimensions || [2000, 2000]).map(v => +(v / 1000).toFixed(3)), authors: Object.keys(info.authors || {}), maps: {}, use: t.use, page: `https://polyhaven.com/a/${t.id}` };
  for (const m of t.maps) {
    const node = files[MAPKEY[m]];
    const src = node?.['1k']?.jpg || node?.['2k']?.jpg;
    if (!src) throw new Error(`${t.id}: map ${m} not available`);
    const raw = await get(src.url, 'buf');
    const img = await sharp(raw).resize(cfg.textureSize, cfg.textureSize, { fit: 'fill' }).webp({ quality: m === 'diff' ? cfg.webpQuality : 90 }).toBuffer();
    const file = `tex/${t.id}_${m}.webp`;
    await writeFile(path.join(out, file), img);
    entry.maps[m] = { file, bytes: img.length, sha256: sha(img), from: src.url };
  }
  manifest.textures[t.id] = entry;
  console.log('texture', t.id, Object.keys(entry.maps).join(','));
}

const tmp = path.join(root, '.tmp-models');
for (const m of cfg.models) {
  const files = await get(`https://api.polyhaven.com/files/${m.id}`);
  const info = await get(`https://api.polyhaven.com/info/${m.id}`);
  const g = files.gltf?.['1k']?.gltf;
  if (!g) throw new Error(`${m.id}: no glTF`);
  const dir = path.join(tmp, m.id);
  await mkdir(dir, { recursive: true });
  const main = path.join(dir, path.basename(new URL(g.url).pathname));
  await writeFile(main, await get(g.url, 'buf'));
  for (const [rel, inc] of Object.entries(g.include || {})) {
    const p = path.join(dir, rel);
    await mkdir(path.dirname(p), { recursive: true });
    await writeFile(p, await get(inc.url, 'buf'));
  }
  const glb = path.join(out, 'models', `${m.id}.glb`);
  const cli = path.join(root, 'node_modules/.bin/gltf-transform');
  execFileSync(cli, ['copy', main, glb], { stdio: 'inherit' });
  execFileSync(cli, ['resize', glb, glb, '--width', '1024', '--height', '1024'], { stdio: 'inherit' });
  execFileSync(cli, ['webp', glb, glb, '--quality', '82'], { stdio: 'inherit' });
  const buf = await readFile(glb);
  manifest.models[m.id] = { name: info.name, file: `models/${m.id}.glb`, bytes: buf.length, sha256: sha(buf), authors: Object.keys(info.authors || {}), use: m.use, page: `https://polyhaven.com/a/${m.id}` };
  console.log('model', m.id, (buf.length / 1e6).toFixed(2), 'MB');
}
await rm(tmp, { recursive: true, force: true });

{
  const h = cfg.hdri;
  const files = await get(`https://api.polyhaven.com/files/${h.id}`);
  const info = await get(`https://api.polyhaven.com/info/${h.id}`);
  const buf = await get(files.hdri[h.res].hdr.url, 'buf');
  const file = `hdri/${h.id}_${h.res}.hdr`;
  await writeFile(path.join(out, file), buf);
  manifest.hdri = { id: h.id, name: info.name, file, bytes: buf.length, sha256: sha(buf), authors: Object.keys(info.authors || {}), use: h.use, page: `https://polyhaven.com/a/${h.id}` };
}

await writeFile(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 1));

const line = (id, e) => `| ${e.use} | [${e.name}](${e.page}) | ${e.authors.join(', ')} | CC0 1.0 |`;
const credits = [
  '# 素材クレジット（3D表示）',
  '',
  '3D表示に使っている素材はすべて Poly Haven（https://polyhaven.com）の CC0 1.0（パブリックドメイン）素材です。',
  'メーカー製品の画像・データは使っていません。実際の仕様（品番・色柄）とは異なります。',
  '`tools/fetch-assets.mjs` が取得・変換し、`assets/lib/manifest.json` に取得元URLとハッシュを記録しています。',
  '',
  '| 用途 | 素材 | 作者 | ライセンス |', '|---|---|---|---|',
  ...Object.entries(manifest.textures).map(([id, e]) => line(id, e)),
  ...Object.entries(manifest.models).map(([id, e]) => line(id, e)),
  line(manifest.hdri.id, manifest.hdri),
  '',
  'ソフトウェア: three.js（MIT License）',
  '',
].join('\n');
await writeFile(path.join(root, 'CREDITS.md'), credits);
const total = [...Object.values(manifest.textures).flatMap(t => Object.values(t.maps)), ...Object.values(manifest.models), manifest.hdri].reduce((s, e) => s + e.bytes, 0);
console.log('total', (total / 1e6).toFixed(1), 'MB');
