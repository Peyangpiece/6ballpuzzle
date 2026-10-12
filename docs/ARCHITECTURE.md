# アーキテクチャ

## 1. 全体像

```
public/index.html
 ├─ /tailwind.css                 事前生成 CSS（Tailwind CLI）
 ├─ /vendor/react@18.3.1/…        React / ReactDOM UMD（同一オリジン）
 ├─ Firebase SDK 10.12.2          gstatic から動的 import（オンライン対戦時のみ使用）
 └─ var files=[ … 69 本 … ]       ランタイム。開発時は逐次 <script>、本番は 1 バンドル
```

- バンドラやモジュールは使っていません。69 本の classic script が **1 つのグローバルスコープ** を共有し、
  後から読まれた層が前の層の関数を包んで（wrap）振る舞いを上書きします。
- `tools/build.js` は同じ配列を同じ順で連結し esbuild で最小化します。別々の `<script>` と連結は
  意味論が同じです（別スクリプト間の `const` 重複は元々 SyntaxError になるため、連結でも問題になりません）。
  唯一の差は「ある層が読込時に例外を投げると後続が止まる」ことで、ブラウザ煙テストがそれを検出します。

## 2. レイヤーの優先順位

読込順は `public/index.html` の `var files=[...]` が唯一の定義です。
生成物 [ARCHITECTURE.generated.md](ARCHITECTURE.generated.md) に各ファイルの行数・ヘッダ・どのフックを包むかを一覧しています（`npm run docs:layers`）。

主要なフック:

| フック | 定義 | 包んでいる層の数 | 意味 |
| --- | --- | ---: | --- |
| `createEngine` | app-09 | 6 | ゲームエンジン生成。層はここでボードや状態を観測 |
| `hexPhysPlanGroup` | app-02 | 11〜13 | 球グループの移動計画（分裂、剛体、斜面） |
| `hexPhysResolveEvent` | app-03 | 7 | 接触イベントの解決 |

原則: **後に読まれた層が勝つ**。たとえば `app-rigidity-nintendo-authority-v1.js` は
`app-rigidity-resolver-authoritative-v3.js` より後に読まれ、剛体の最終判断を持ちます。
ファイル名の `authority` / `authoritative` は「その責務の最終決定層」を意図しています。

性能層は `app-runtime-performance.js` → `-v3.js` → `-v4.js` の順に積層しており、v4 のヘッダに
あるとおり v4 は v3 の上で動作する前提です（v3 を外すと v4 のパリティテストが失敗します）。

## 3. 変更時の作法

1. 物理・タイミングの変更は必ず `npm test` を通す。`tests/reference-*` は本家映像のフレーム計測
   （`tests/fixtures/*.json`）との位置誤差を RMS/最大ピクセルで判定します。
2. 新しい層を足す場合は `var files=[...]` に追加し、`npm run docs:layers` で一覧を再生成する。
   既存層を削除する場合は、それを包む後続層が `typeof X==="function"` ガードで無効化されないか確認する。
3. UI の Tailwind クラスを変えたら `npm run build:css` を実行してコミットする（CI が鮮度を検証）。
4. 音声・画像を追加したら [ASSETS.md](ASSETS.md) に出所を書く。参照されない資産は配信しない。
5. オンライン対戦のデータ構造を変えたら `firebase/database.rules.json` と `tests/firebase-rules.js` を同時に更新する。

## 4. 既知の技術的負債

- **層の積層構造そのもの**。69 本中 50 本超が上書き層で、`window.__hex*` のグローバルが 100 以上あります。
  振る舞いの最終決定箇所はファイル名と読込順でしか追えません。コアへの統合は大規模な物理回帰のリスクを
  伴うため、本リポジトリでは「読込順を単一定義にし、生成ドキュメントと契約テストで固定する」方針を取っています。
- 通常消去後の崩落シーンは本家映像との誤差が基準（RMS 8px / 最大 17px）を満たしていません
  （`audit-results/reference-clear-2026-10-04/CAUSAL-COLLAPSE.md`）。CI ゲートからは意図的に外されています。
- レーティングは既定でクライアントが計算して書き込みます。ルールで「1 試合につき 1 回、±32 以内、
  実在する終了済み試合に限る」まで制約し、`config/ratingAuthority = "server"` に切り替えると
  `firebase/functions/` の Cloud Function が裁定します（[OPERATIONS.md](OPERATIONS.md) 参照）。
- 旧おじゃまランタイムの関数 `materializeGarbagePack` は削除済みで、app-09 の監視タイマー経路は
  `typeof` ガード付きで残っています。`npm run lint` が連結ランタイムの未定義参照を検出します。
