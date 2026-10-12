# セキュリティ

## 脅威モデル

| 資産 | 脅威 | 対策 |
| --- | --- | --- |
| オンライン対戦の公平性 | 改造クライアントによる過大なおじゃま送信、勝敗の自己申告、レートの直接書換 | Realtime Database ルール（`firebase/database.rules.json`）で所有権・値域・1 試合 1 更新を強制。クライアント側でも受信おじゃまを 120 球・既知の技名に制限（`tests/online-attack-sanitize.js`） |
| ユーザーデータ | 他人のプロフィール・試合データの閲覧 | `users/*` と `leaderboard` はログイン済みのみ読取、`matches/*` は参加者のみ、`pairings/*` は本人のみ |
| 配信物の改ざん | CDN 経由のスクリプト差し替え | React / Tailwind を同一オリジンで配信。外部スクリプトは Firebase SDK（gstatic）のみ |
| 機密情報 | API キーの露出 | Firebase Web API キーは公開前提の識別子であり秘密ではありません。Cloudflare のトークンは GitHub Secrets のみに保存 |

## 既知の限界

- 既定ではレート計算をクライアントが行います。ルールで振れ幅と回数を制限していますが、完全なサーバー権威では
  ありません。`firebase/functions/` をデプロイして `config/ratingAuthority = "server"` にすると
  サーバー裁定に切り替わります（[docs/OPERATIONS.md](docs/OPERATIONS.md)）。
- 匿名ログインが有効なため、アカウントの使い捨てによるリーダーボードの汚染は防げません。
  必要なら `leaderboard/$uid` の書込を `auth.token.firebase.sign_in_provider != 'anonymous'` に限定してください。

## 報告

脆弱性はリポジトリ所有者 [@Peyangpiece](https://github.com/Peyangpiece) へ非公開で連絡してください。
