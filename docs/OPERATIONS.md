# 運用

## デプロイ

- `main` への push で `.github/workflows/validate.yml` が validate → rules → deploy を実行します。
  Pull Request では validate と rules のみ走り、デプロイしません。
- deploy ジョブは `npm ci` の後に `wrangler deploy` を実行します。`wrangler.jsonc` の `build.command`
  （`npm run build`）が先に走って `dist/` を生成し、`dist/deploy-sha.txt` にコミット SHA を書きます。
  配信された `/deploy-sha.txt` が一致するまで最大 60 秒待って検証します。
- このリポジトリには Cloudflare 側の Git 連携（Workers Builds）も接続されており、push ごとに Cloudflare が
  `npx wrangler deploy` を実行します。同じ `build.command` が走るため、GitHub Actions と Workers Builds の
  どちらが後に完了しても配信内容は同一です（`deploy-sha.txt` は `GITHUB_SHA` / `WORKERS_CI_COMMIT_SHA` /
  `git rev-parse HEAD` の順で決まります）。Node のバージョンは `.node-version`（22）で固定しています。
  二重デプロイを避けたい場合は Cloudflare ダッシュボードで Git 連携を外すか、Actions の deploy ジョブを削除してください。
- 必要なシークレット: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`（GitHub リポジトリの Secrets）。
- `dist/_headers` でキャッシュ方針を配信します。ハッシュ付き `/js/* /css/* /vendor/*` は 1 年 immutable、
  `/index.html` と `/deploy-sha.txt` は no-cache、`/assets/*` は 1 日です。

手元から配信物を確認する:

```bash
npm run build && npm run serve:dist   # http://127.0.0.1:8018
```

## Firebase Realtime Database ルール

ルールは `firebase/database.rules.json` にあり、`tests/firebase-rules.js` が 54 件のシナリオで契約を検証します。
**ルールはリポジトリから自動反映されません。** 変更後は次のいずれかで本番へ反映してください。

```bash
# firebase-tools でデプロイ（プロジェクト ballpuzzle-8cc87 のオーナー権限が必要）
npx firebase login
npx firebase deploy --only database --config firebase/firebase.json --project ballpuzzle-8cc87
```

または Firebase コンソール → Realtime Database → ルール に `database.rules.json` の内容を貼り付けます。

ローカルで契約テストを走らせる（Java 11+ が必要）:

```bash
npm install --no-save --legacy-peer-deps firebase-tools@14.19.0 @firebase/rules-unit-testing@4.0.1 firebase@11.10.0
npx firebase emulators:exec --config firebase/firebase.json --only database --project demo-6ball "node tests/firebase-rules.js"
```

ルールが保証すること:

| パス | 保証 |
| --- | --- |
| `users/$uid` | 本人のみ書込。初期レート 1000。レート変更は `lastMatch` が新しい終了済み試合（本人が参加）を指すときだけ、±32 以内。勝敗は +1 ずつ |
| `leaderboard/$uid` | 本人のみ。レートは `users/$uid/rating` と一致 |
| `matches/$id` | 参加者のみ読取。作成は参加者本人のみ、上書き不可。`state/$i` `result/$i` `players/$i/connected` は該当プレイヤーのみ。`attacks/$i` は相手だけが追加でき、n は 0〜120、shapes は既知の技名のみ |
| `lobby` `pairings` `rooms` | なりすまし不可。ルームの参加は実在する試合（ホスト=players/0、参加者=players/1）に限る |

### レート裁定をサーバー権威にする（推奨）

既定ではクライアントがレートを計算し、ルールがその振れ幅と回数を制限します（偽の試合を自作して
+32 ずつ稼ぐ経路は残ります）。これを塞ぐ Cloud Function を `firebase/functions/` に用意しています。

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
