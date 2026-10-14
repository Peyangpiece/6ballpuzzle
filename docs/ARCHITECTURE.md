# アーキテクチャ

## 1. 全体像

```
public/index.html
 ├─ /tailwind.css                 事前生成 CSS（Tailwind CLI）
 ├─ /vendor/react@18.3.1/…        React / ReactDOM UMD（同一オリジン）
 ├─ Firebase SDK 10.12.2          gstatic から動的 import（オンライン対戦時のみ使用）
 └─ var files=[ … 70 本 … ]       ランタイム。開発時は逐次 <script>、本番は 1 バンドル
```

- バンドラやモジュールは使っていません。70 本の classic script が **1 つのグローバルスコープ** を共有し、
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

### CPU AI

- `app-ai-core.js` が全レベル共通の予測と判断（`aiDecide`）を持ちます。予測は本番と同じ物理コードで行い、
  着地した 3 球を剛体として置き、球の id と転がり方向（同点時の向きの決定に使われる）も写して
  `settleAll()` と消去規則を回します。
- 判断は Web Worker（`public/ai-worker.js`）で時間予算内に行い、メインスレッドは結果を受け取って操作するだけです。
- 超強いは次のピースを、今のピースが着地・消去している間に予測盤面上で先読みします（盤面が予測と一致したときだけ使用）。
  候補手は軽量な近似モデルで並べ替えてから正確な予測にかけ、盤面が 7 段以上（届く予定のおじゃま込み）になったら消去を優先します。
- 物理側の安全装置 `app-settle-watchdog-v1.js`: 描画上の接触補正が収束せず SETTLE が終わらない盤面（実際に試合が固まる）では、
  論理盤面が変わらないまま補正の非収束が 24 回続くか 3 秒経つと、球を論理セルへ置いて CHECK へ進めます（`tests/settle-watchdog.js`）。
  Worker が使えない環境（テスト・旧ブラウザ）では同じ関数を短い予算で同期実行します。
- Worker が読む層は `ai-worker.js` の `AI_WORKER_FILES` に列挙し（index.html の物理層＋AI、同じ順）、
  本番では `tools/build.js` が `js/ai-worker.<hash>.min.js` に 1 本化します。物理層を足したら
  この配列にも足してください（`tests/ai-core.js` が一致を検査し、予測が実エンジンと 9 割以上一致することも確認します）。

## 3. 変更時の作法

1. 物理・タイミングの変更は必ず `npm test` を通す。`tests/reference-*` は本家映像のフレーム計測
   （`tests/fixtures/*.json`）との位置誤差を RMS/最大ピクセルで判定します。
2. 新しい層を足す場合は `var files=[...]` に追加し、`npm run docs:layers` で一覧を再生成する。
   既存層を削除する場合は、それを包む後続層が `typeof X==="function"` ガードで無効化されないか確認する。
3. UI の Tailwind クラスを変えたら `npm run build:css` を実行してコミットする（CI が鮮度を検証）。
4. 音声・画像を追加したら [ASSETS.md](ASSETS.md) に出所を書く。参照されない資産は配信しない。
5. オンライン対戦のデータ構造を変えたら `firebase/database.rules.json` と `tests/firebase-rules.js` を同時に更新する。

## 4. 既知の技術的負債

- **層の積層構造そのもの**。70 本中 50 本超が上書き層で、`window.__hex*` のグローバルが 100 以上あります。
  振る舞いの最終決定箇所はファイル名と読込順でしか追えません。コアへの統合は大規模な物理回帰のリスクを
  伴うため、本リポジトリでは「読込順を単一定義にし、生成ドキュメントと契約テストで固定する」方針を取っています。
- 通常消去後の支持喪失落下と着地直前の転がりは、本家映像 clip 3 の緑 2 球・14 点に対し RMS 2.25px / 最大 3.73px で
  基準（RMS 8px / 最大 17px）内です（`tests/reference-post-clear-capture-diagnostic.js`、CI ゲート）。
  落下は静止から加速して終端速度で頭打ち、落下中の球に乗る球は 1.9 フレーム遅れて開始（`app-07.js` の
  `CLEAR_SUPPORT_LOSS_*`、落下と転がりを合わせた 14 点の最小二乗当てはめ）。落下直後に静止球へ当たって転がる区間は、落下速度を保ったまま同じ重力で
  円弧上を加速します（`clearSupportLossRollProfile`）。いずれもこの 1 場面への当てはめで、他の消去場面での
  一致は未検証です。
- 2026-10-13 の本家映像（自分側盤面の青 6 球の通常消去）では、消去後に動く 4 球の最終セルが本家と一致し、
  144 点の位置誤差は RMS 3.71px / 最大 12.03px で基準内です（`tests/reference-clear-20261013-collapse.js`、
  CI ゲート）。基準フレームは青が縮み始めて見える最初のフレーム（n=47）で、1 フレーム前後にずらすと最大誤差は
  21〜23px になります。この場面に合わせて入れた規則:
  - 左右どちらにも落ちられる球は、同じ行の隣の球が転がり込む唯一のセルを譲る（`app-gravity-priority-v1.js`）
  - 同じイベント内で、先に却下された移動を他の球の受理後に再判定し、同じ行で接して同じ向きに動く 2 球を
    連動扱いにする（`app-03.js`）
  - 隣の球の予定がまだ無いために安全と判定できない区間は、一度だけ後回しにして再スケジュールする
    （`app-mass-motion-safety.js`）
  - 消去後の転がりはすべて重力で加速（静止からも可）。支えの球と同じ向きに動く球は、支えの時計に 1.9 フレーム
    遅れで乗り、自分の「落ちてから横へ」の経路を支えに食い込まない位置（接触距離）で進む。転がる相手の無い
    斜め落下は「落ちてから横へ」（`app-07.js`）
- 2026-10-13 の技 3 場面（HEXAGON / STRAIGHT / PYRAMID）: 光ってから落ち始めるまでは本家と 2 フレーム以内
  （`tests/reference-clear-timing-parity.js`）。最初の崩れが止まった時点の盤面は PYRAMID が全セル一致、
  STRAIGHT が 2 セル、HEXAGON が 5 セル違います（`tests/reference-technique-collapse-20261013.js`、この差は
  減らす方向にしか変えられない上限）。本家は消去の瞬間の盤面で各球の向きを決めるため、消去直後に各球の
  「先に空く側」を推定して左右が同条件のときに使います（`app-gravity-priority-v1.js`
  `__sixBallMarkClearReleaseIntents`、`app-09.js` から呼び出し）。残る差は、崩れの途中で両側から同時に
  入って穴の上で止まる 2 球（HEXAGON の [15,10]）と、壁際の紫の向き（STRAIGHT の [17,6]）です。
- 同じ 2 本の映像の連鎖（HEXAGON 後の赤・黄・紫 20 球、PYRAMID 後の青 7 球）: 最初の崩れが止まった盤面から
  再生すると、消える色と数が本家と一致し、縮み始めから落ち始めまでは 11 フレーム（本家 13）、止まった盤面は
  HEXAGON 側が全セル一致、PYRAMID 側が 2 セル違いです（`tests/reference-chain-collapse-20261013.js`）。
  このために消去直後の向きの推定へ 2 つの効果を足しました（`app-gravity-priority-v1.js`）:
  - 荷重: 下の 2 セルが両方空いた球は、自分だけにもたれる上の球と反対側へ押される
  - 引きずり: 支えの球が自分の下へ潜るように転がると同じ向きへ運ばれる（支えが壁際の球のとき、または
    上に何も載っておらず左右が同時に空き、もう一方の支えが真下へ落ちるとき）
  あわせて、向きの決まった球は消去の瞬間に動き出すものとして、この崩れで先に落とした球を経路判定の障害物から
  外します（`app-clear-gap-collapse.js`）。残る差は PYRAMID 側の [4,9] で、本家では両側の 2 球がもたれ合って
  穴を残しますが、ランタイムは埋めます（HEXAGON の [15,10] と同じ種類）。崩れが止まるまでの時間は HEXAGON
  側 20 フレーム（本家 18）、PYRAMID 側 22 フレーム（本家 14）で、本家では一体で滑る 3 球の三角形を
  ランタイムが 1 球ずつ順に動かすため長くなっています（ゲートなし）。
- レーティングはクライアントが計算して書き込みますが、ルールが Elo の区間テーブル（`tools/elo-rules-table.js`
  が生成、`tests/rules-elo-table.js` が同期を検証）で値を厳密に検証します。`config/ratingAuthority = "server"`
  に切り替えると `firebase/functions/` の Cloud Function が裁定します（[OPERATIONS.md](OPERATIONS.md) 参照）。
- 旧おじゃまランタイムの関数 `materializeGarbagePack` は削除済みで、app-09 の監視タイマー経路は
  `typeof` ガード付きで残っています。`npm run lint` が連結ランタイムの未定義参照を検出します。
