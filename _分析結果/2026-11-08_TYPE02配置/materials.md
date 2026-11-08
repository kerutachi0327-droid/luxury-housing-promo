# 材料：luxury-housing-promo の URL・配置構成（TYPE02 をどこに置くか）

## ユーザーの問い
「https://kerutachi0327-droid.github.io/luxury-housing-promo/ 配下に TYPE2 を配置する構成はどう考える？」
解釈：現在 TYPE02 はサイト直下（ルート）、TYPE06 は /type06/。TYPE02 も /type02/ のようなサブパスに置き、ルートを別の役割（物件トップ/タイプ選択）にする構成の是非。

## 事業の文脈
- 物件：高円寺の新築戸建て（販売元 リーベンエステート系「レクシアテラス高円寺」、公式LP https://www.leben-establish.jp/search/lp-koenji-lexsia-terrace/ ）。複数の住戸タイプ（TYPE02, TYPE06 …）がある。
- サイトは作成者 Atlink による「非公式の参考イメージ」3D体験（歩く／ドールハウス／間取り／外観／計測／自動ツアー）。販促用途。販売元の図面を利用しているため公開範囲は「小野」が判断する。
- GitHub Pages（プロジェクトサイト、公開リポジトリ）。サーバ側リダイレクト不可（_redirects等なし）。HTMLのmeta refresh / JS リダイレクトのみ可能。

## 現状の構成（2026-11-08 時点、main 43875c1）
公開URL：
- / → TYPE02 ビューア（index.html、title等 "TYPE 02"）
- /type06/ → TYPE06 ビューア（今日追加）
- /type02/ → 404
- ルートと /type06/ の間に相互リンクなし（各ページは CREDITS.md と公式LPへのリンクのみ）

リポジトリ：
- ルート: index.html, style.css, src/(build, furniture, geo, main, materials, plan).js, assets/(*.bin 約23MB, *.png 約4MB, lib/ 15MB = CC0 3D素材・HDRI), tools/check-plan.mjs, dist/(ビルド成果物, gitignore)
- type06/: index.html, src/(build, furniture, main, materials, plan).js, assets/*.jpg(424KB), tools/(check-plan, flicker-check).mjs
- type06/src は src/ のフォーク。差分行数: build 298/427, furniture 106/370, main 59/725, plan 全面別物, materials 34/116。geo.js だけは ../../src/geo.js を共有 import。
- style.css は共有（デプロイ時に type06 へコピー）。
- package.json scripts: check, build, check:type06, build:type06, assets
- アセット参照はすべて相対パス（'assets/lib/...', 'dist/app.js', 'style.css'）。→ どのディレクトリに置いても動くが、配置ごとにコピーが必要。
- デプロイ（.github/workflows/pages.yml）: ルートに TYPE02 を組み、_site/type06/ に TYPE06 を組む。assets/lib (15MB) は _site/assets/lib と _site/type06/assets/lib に二重コピー。タイプが増えるたびにコピーが増える（Pages サイト上限 1GB、推奨）。キャッシュバスト ?v=<sha8>。
- README は「高円寺 TYPE02 の住まい体験サイト」と記載（単一タイプ前提）。

## 選択肢の候補（論点出しのたたき台）
A. 現状維持：/ = TYPE02、/type06/ = TYPE06（非対称）
B. /type02/ を新設、/ はタイプ選択（物件トップ）ページ。旧 / の共有リンクは選択ページ経由 or ?自動転送
C. /type02/ を新設、/ は /type02/ へ JS/meta リダイレクト（当面）
D. B に加え、ビルド/リポジトリも types/<id>/ に揃え、assets/lib を /shared/ 等に一本化して二重コピーをやめる、エンジン共通化（中長期）

## 未確認事項
- ルートURLがすでにQR・チラシ・LINE等で配布されているか（不明）
- 今後のタイプ追加数（不明。TYPE02, 06 以外もある可能性）
- 公開範囲の判断（小野）

## Step2 論点（イシュー構造）
主論点：TYPE02 を /type02/ に移し、ルートを物件トップ（タイプ選択）にすべきか。するならいつ・どの深さで。
- 論点1 体験・導線：購入検討者が複数タイプを比較・行き来できるか。ルートURLの意味（物件の入口 vs 特定タイプ）。
- 論点2 既存リンク互換：ルートURLが配布済みの場合の影響。GitHub Pagesでの転送手段（meta refresh/JS、canonical、SEO影響）。
- 論点3 運用・拡張性：タイプ追加時の手順、デプロイ時の素材二重コピー（15MB×タイプ数）、ソースのフォーク（src と type06/src の乖離）。
- 論点4 リスク・ガバナンス：非公式サイトである旨の表示、公開範囲（小野判断）、販売元ブランドとの誤認。
- 論点5 実施コスト・順序：今すぐ URL だけ揃えるか、エンジン共通化と同時にやるか。
