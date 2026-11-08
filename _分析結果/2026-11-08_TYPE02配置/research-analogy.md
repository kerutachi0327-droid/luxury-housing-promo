(アナロジー担当レポート：GitHub Pages サブパス複数配信)
- 旧URL互換：サーバ301が最善、不可なら即時meta refreshが恒久扱い（developers.google.com/search/docs/crawling-indexing/301-redirects）。JSは最終手段。canonicalも強いシグナル。GitHub Pagesの定石は meta refresh+canonical+JS のスタブ（jekyll-redirect-from）。#は引き継がれない→JS location.replace で query/hash 引継ぎ。
- B（/を選択ページ化）は旧URLの内容が変わるがリンク切れなし、1クリック増。非公式なのでnoindex要判断。
- Pages制限：サイト1GB、帯域100GB/月ソフト、デプロイ10分（docs.github.com/.../github-pages-limits）。Cache-Control max-age=600固定（古い情報、現行未確認）。
- assets/lib 15MB 二重コピー：容量は余裕（~60タイプ）だが、URLが違うとブラウザキャッシュが効かず比較者は15MBを2回DL。比較導線を作るほど /shared/lib 一本化の価値↑。
- フォーク共通化：一次資料での定石裏付けは未確認。main/materials は差分小で統合容易、build/furniture が主コスト。3タイプ目の前が分岐点。URL移設とエンジン共通化は独立に分割実施可。
- 注：docs.github.com と developers.google.com は WebFetch がネットワーク許可外で失敗、WebSearch要約経由（逐語未確認）。
