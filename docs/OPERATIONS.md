# 運用

## デプロイ

- **本番へのデプロイは Cloudflare 側の Git 連携（Workers Builds）が行います。** `main` への push ごとに Cloudflare が
  リポジトリを取得し `npx wrangler deploy` を実行します。`wrangler.jsonc` の `build.command`（`npm run build`）が
  先に走って `dist/` を生成し、`dist/deploy-sha.txt` にコミット SHA を書きます。Node のバージョンは
  `.node-version`（22）で固定しています。
- GitHub Actions（`.github/workflows/validate.yml`）は `main` への push と Pull Request で validate と rules を実行し、
  `main` では加えて `verify-production` ジョブが「本番の `/deploy-sha.txt` がそのコミットになるまで最大 25 分待つ」
  検証を行います。Actions 自身はデプロイしません（以前は両方がデプロイしており、古いコミットのビルドが後から
  上書きする競合が実際に起きたため、デプロイ元を 1 つにしました）。
- Cloudflare の Git 連携を外す場合は、`validate.yml` の `verify-production` を `cloudflare/wrangler-action` による
  デプロイに戻してください（`CLOUDFLARE_API_TOKEN` と `CLOUDFLARE_ACCOUNT_ID` のシークレットは残っています）。
- `dist/_headers` でキャッシュ方針を配信します。ハッシュ付き `/js/* /css/* /vendor/*` は 1 年 immutable、
  `/index.html` と `/deploy-sha.txt` は no-cache、`/assets/*` は 1 日です。
- Pull Request ごとに Cloudflare がプレビュー URL を PR コメントに投稿します（本番と同じビルド手順）。

手元から配信物を確認する:

```bash
npm run build && npm run serve:dist   # http://127.0.0.1:8018
```

## Firebase Realtime Database ルール

ルールは `firebase/database.rules.json` にあり、`tests/firebase-rules.js` が 65 件のシナリオで契約を検証します。

### 自動反映（推奨）: GitHub Actions `Deploy Firebase Database Rules`

`.github/workflows/firebase-rules.yml` が、`firebase/` 配下の変更が `main` に入ったとき、または
Actions タブの「Run workflow」で、エミュレータ契約テスト → `firebase deploy --only database` →
本番ルールをダウンロードしてリポジトリのファイルと一致するか検証、の順に実行します。

必要な準備（1 回だけ、プロジェクト所有者が行う）:

1. [Google Cloud Console → IAM → サービスアカウント](https://console.cloud.google.com/iam-admin/serviceaccounts?project=ballpuzzle-8cc87)
   でサービスアカウントを作成し、ロール **Firebase Realtime Database 管理者**（`roles/firebasedatabase.admin`）を付与する。
2. そのサービスアカウントの JSON キーを作成する。
3. GitHub → リポジトリ → Settings → Secrets and variables → Actions → New repository secret で
   名前 `FIREBASE_SERVICE_ACCOUNT`、値に JSON の中身全体を登録する。
4. Actions → Deploy Firebase Database Rules → Run workflow（`main`）を実行する。
   `contract` → `deploy` の 2 ジョブが緑になれば反映完了です。`deploy` の最終ステップが
   「Live rules verified」を出力します。

シークレットが未登録の場合、`deploy` ジョブは最初のステップで明示的に失敗します（ルールには触れません）。

### 手動反映

```bash
# firebase-tools でデプロイ（プロジェクト ballpuzzle-8cc87 のオーナー権限が必要）
npx firebase login
npx firebase deploy --only database --config firebase/firebase.json --project ballpuzzle-8cc87
```

または Firebase コンソール → Realtime Database → ルール に `database.rules.json` の内容を貼り付けます。

Claude Code のクラウド環境から反映させたい場合は、環境設定（セッション画面のクラウド環境メニュー → Edit）の
Network secrets / 環境変数に `FIREBASE_SERVICE_ACCOUNT`（上記 JSON）を登録してください。新しいセッションで
`GOOGLE_APPLICATION_CREDENTIALS` に書き出して同じコマンドを実行できます。チャットにキーを貼らないでください。

ローカルで契約テストを走らせる（Java 11+ が必要）:

```bash
npm install --no-save --legacy-peer-deps firebase-tools@14.19.0 @firebase/rules-unit-testing@4.0.1 firebase@11.10.0
npx firebase emulators:exec --config firebase/firebase.json --only database --project demo-6ball "node tests/firebase-rules.js"
```

ルールが保証すること:

| パス | 保証 |
| --- | --- |
| `users/$uid` | 本人のみ書込。初期レート 1000。レート変更は `lastMatch` が新しい終了済み試合（本人が参加、両者の `joinedAt` あり）を指すときだけ。`lastResult`（win / loss）は試合の `result` から導いた勝敗と一致しなければならず、新しいレートは **試合に記録された相手レートと現在の自分のレートから Elo（K=32）で計算した値と完全一致** が必要（ルール内に区間テーブルを埋め込み、`tools/elo-rules-table.js` で生成）。未ランク戦はレート不変。勝敗数は結果どおりに +1 |
| `leaderboard/$uid` | 本人のみ。レートは `users/$uid/rating` と一致 |
| `matches/$id` | 参加者のみ読取。作成は参加者本人のみ、上書き不可。`players/$i/rating` は作成時点の `users/<uid>/rating` と一致必須。`players/$i/joinedAt` は本人が 1 回だけ書ける参加証明。`result/$i` は両者の `joinedAt` が揃ってから該当プレイヤーのみ。`state/$i` `players/$i/connected` は該当プレイヤーのみ。`attacks/$i` は相手だけが追加でき、n は 0〜120、shapes は既知の技名のみ |
| `lobby` `pairings` `rooms` | なりすまし不可。ルームの参加は実在する試合（ホスト=players/0、参加者=players/1）に限る |

これにより Cloud Functions なしでも、レートは「両者が実際に参加した試合の結果から機械的に決まる値」以外に書けません。
残る理論上の抜け道は、攻撃者が自分で 2 つのアカウントを用意して実際に対戦する多重アカウントだけで、これは
サーバー裁定でも防げない種類のものです。両者が矛盾する結果（双方が勝利を主張）を書いた試合はどちらのレートも
確定しません（不正な利得は不可能、嫌がらせとしての確定妨害は可能）。

### レート裁定をサーバー権威にする（任意、Blaze プランが必要）

既定のクライアント裁定はルールで Elo 値まで厳密に検証されるため、通常は不要です。将来 Blaze プランに
移行して Functions を使う場合の構成を `firebase/functions/` に用意しています。

1. Firebase プロジェクトを Blaze プランにし、Functions を有効化する。
2. デプロイ: `cd firebase/functions && npm install && npx firebase deploy --only functions --config ../firebase.json --project ballpuzzle-8cc87`
3. データベースに `config/ratingAuthority = "server"` を書く（コンソールまたは admin SDK。クライアントからは書けません）。

この瞬間から:

- ルールがクライアントによる `rating` / `wins` / `losses` / `lastMatch` の変更を拒否します（ニックネーム変更は可）。
- 関数 `settleMatchResult` が `matches/{mid}/result/{i}` の作成をトリガーに、両者のレートをトランザクションで更新し、
  `leaderboard` を書き、`matches/{mid}/settlement/{uid}` に結果（delta, rating, wins, losses）を残します。
  `settlement/state` の claim により 2 件目の result や再試行で二重計上されません。
- クライアント（`Net.awaitServerRating`）は自分の settlement を最大 10 秒待ってプロフィールを反映し、
  来なければ `users/{uid}` を再読込します。

`config/ratingAuthority` を削除すれば即座にクライアント裁定へ戻ります（ロールバック手順）。
裁定ロジックの純粋部分は `firebase/functions/settle.js` にあり、`tests/rating-settlement.js` が
クライアントの Elo 式との一致と境界条件を検証します。

## ブランチ保護（推奨設定）

GitHub → Settings → Branches → `main`:

- Require a pull request before merging
- Require status checks: `validate`, `rules`
- Do not allow bypassing the above settings

これにより「CI を通らない変更が本番へ出る」経路がなくなります。設定はリポジトリ管理者のみ行えます。

## 障害時

- 直前のデプロイへ戻す: 対象コミットで `workflow_dispatch` を実行するか、`git revert` を `main` に push します。
- 本番が動いているかの確認: `curl https://6ballpuzzle.hrk-6888.workers.dev/deploy-sha.txt` と
  `npm run test:browser`（`DIST_DIR` を使わず本番 URL を見るには `tests/quality-browser-review.js` を `REVIEW_URL` 付きで実行）。
- Firebase 側の障害はオンライン対戦のみに影響し、AI 対戦は動き続けます。
