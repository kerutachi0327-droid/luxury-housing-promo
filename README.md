# luxury-housing-promo

高円寺 TYPE02 の住まい体験サイト（GitHub Pages で公開）。

- 3D表示は公式間取り図をトレースした `src/plan.js` から生成します（1px = 11.6mm）。
- `npm run check` で各部屋の面積を図面の帖数と照合します（CIで自動実行、許容±6%）。
- 質感素材は Poly Haven の CC0 素材のみ。`tools/assets.json` に一覧、取得は Actions の「Vendor 3D assets」を手動実行（`assets/lib` にコミット）。出典は `CREDITS.md`。
- `main` への push で `npm run build`（esbuild）→ Pages へデプロイします。

## 構成

| ファイル | 役割 |
|---|---|
| `src/plan.js` | 間取りデータ（壁・開口・部屋・設備・家具配置・見学地点） |
| `src/build.js` | 壁・床・天井・階段・外観の生成 |
| `src/furniture.js` | 造作（キッチン・浴室・収納）と家具 |
| `src/materials.js` | 質感（実寸スケールのテクスチャ） |
| `src/main.js` | 表示（歩く／ドールハウス／間取り／外観）、計測、自動ツアー |
| `tools/check-plan.mjs` | 帖数・上下階の整合チェック |
| `tools/fetch-assets.mjs` | CC0素材の取得・変換 |
