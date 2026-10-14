# 6ball

ブラウザで遊べる 2 人対戦の落ち物パズルです。3 球の三角ピースを落とし、同色を 6 個以上つなげて消し、
STRAIGHT / PYRAMID / HEXAGON の「技」でおじゃま球を相手に送ります。
横画面専用の PWA で、Cloudflare Workers の静的配信と Firebase Realtime Database（オンライン対戦）で動きます。

公開先: https://6ballpuzzle.hrk-6888.workers.dev

## モード

| モード | 内容 |
| --- | --- |
| オンライン対戦 | レート（Elo, K=32）をかけたマッチメイキング。匿名ログインのほか Google アカウント連携 |
| AI 対戦 | 5 段階（とてもよわい〜超強い） |
| ルームでプレイ | ホストがサーバー発行の 6 桁コードを共有し、相手が入力して対戦（レート変動なし） |

操作（ゲーム内の「遊び方」画面と、対戦開始時の操作ガイドにも表示）:

| 入力 | 移動 | 回転 | 速く落とす | すぐ落とす | ポーズ |
| --- | --- | --- | --- | --- | --- |
| キーボード | ← → | Z（左回り）/ X（右回り） | ↓ 長押し | Space / ↑ | Esc / P |
| タッチ | 横スワイプ | タップ（自分の盤面の左側＝左回り、右側＝右回り） | 2 本指長押し | 2 本指タップ | 中央上のボタン |
| ゲームパッド | 十字キー / スティック | A（左回り）/ X（右回り） | ↓ 長押し | Y / ↑ | ＋ |

メニューはゲームパッドの十字キーで移動、A で決定、B で戻れます。オンライン対戦は一時停止できないため、
ポーズメニューから抜けると降参（敗北）になります。設定の「色の記号表示」で、球に色ごとの記号を重ねられます。

## 開発

```bash
npm ci                 # esbuild / tailwindcss / playwright
npm run check          # 全ランタイムスクリプトの構文チェック
npm run lint           # 読込順に連結したランタイム全体へ ESLint（未定義参照・重複キー等）
npm run build:css      # Tailwind を public/tailwind.css に事前生成（クラスを変えたら実行してコミット）
npm run serve          # public/ を http://127.0.0.1:8018 で配信（開発用: 個別スクリプトをそのまま読込）
npm test               # 配信ゲート: 構造・物理・本家映像比較・ビルド契約の全回帰（並列実行）
npm run build          # 本番ビルド: dist/ に 1 本のハッシュ付きバンドル + CSS + 静的ファイル
npx playwright install chromium
npm run test:browser   # dist/ を実ブラウザで起動し AI 対戦まで操作する煙テスト
npm run test:rules     # Firebase ルールの契約テスト（要 Java + firebase-tools、docs/OPERATIONS.md 参照）
npm run docs:layers    # docs/ARCHITECTURE.generated.md を再生成
```

`public/` が開発用ソースツリー、`dist/` が配信物です。`public/index.html` の `var files=[...]` が
ランタイムの読込順の唯一の定義で、開発時はその順に個別スクリプトを読み、本番ビルドは同じ配列を
連結・最小化して 1 ファイルにします。

## ディレクトリ

| パス | 役割 |
| --- | --- |
| `public/app-*.js`, `public/controls-*.js` | ゲーム本体。順序付きのレイヤー構成（[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)） |
| `public/assets/` | 画像・音声 |
| `public/vendor/` | React 18.3.1 UMD（CDN 依存を排除） |
| `public/tailwind.css` | 事前生成された Tailwind（生成物。CI が最新かを検証） |
| `tools/` | ビルド・配信サーバー・レイヤーマップ生成・本家映像解析スクリプト |
| `tests/` | 回帰テスト。`tests/run-ci.js` の `GATE` が配信ゲートの定義 |
| `tests/fixtures/` | 本家映像から抽出した球中心座標（フレーム比較用） |
| `firebase/` | Realtime Database のセキュリティルール、エミュレータ設定、レート裁定の Cloud Functions |
| `audit-results/` | 過去の監査ログ・レポート（配信物ではない） |
| `docs/` | 設計・運用・アセット出所・履歴 |

## 品質ゲート

`main` への push と Pull Request で `.github/workflows/validate.yml` が走ります。

1. 構文チェック、連結ランタイムの静的検査、事前生成 CSS の鮮度、配信シェルの不変条件
2. `npm test`（Node 回帰 47 本 + FPS 掃引 20 本。本家映像との位置誤差、ビルド契約、オンライン入力・レート裁定の検証を含む）
3. 本番ビルドと Playwright による実ブラウザ煙テスト
4. Firebase ルールの契約テスト（エミュレータ）
5. `main` のみ: Cloudflare Workers Builds（Git 連携）がデプロイした本番の `deploy-sha.txt` がコミット SHA と一致するまで待って確認

## ドキュメント

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): ランタイム構成、レイヤーの優先順位、変更時の作法
- [docs/OPERATIONS.md](docs/OPERATIONS.md): デプロイ、Firebase ルール反映、ブランチ保護、障害時の手順
- [docs/ASSETS.md](docs/ASSETS.md): 画像・音声の出所とライセンス
- [SECURITY.md](SECURITY.md): 脅威モデルと報告先
- [docs/history/](docs/history/): 過去のテストレポート

## ライセンス

ソースコードのライセンスは未設定です（著作権者 [@Peyangpiece](https://github.com/Peyangpiece) が決定します）。
本作は任天堂『世界のアソビ大全51』収録「6ボールパズル」の挙動を参考にした非公式の個人制作物であり、任天堂とは無関係です。
