# App Store 掲載情報（下書き）

App Store Connect に入力する文面の下書きです。文字数は App Store Connect の上限内に収めています
（名前・サブタイトル各 30 文字、キーワード 100 バイト、プロモーション用テキスト 170 文字）。
本家作品の名前・用語・画面を連想させる表現は使いません。

## 共通
| 項目 | 値 |
| --- | --- |
| アプリ名 | Drop Ball（App Store 全体で一意である必要あり。使用中なら「Drop Ball: Color Clash」など） |
| バンドル ID | `app.dropball.game`（`capacitor.config.json` と一致させる） |
| カテゴリ | ゲーム（パズル）／サブ: ボード |
| プライバシーポリシー URL | https://dropball.hrk-6888.workers.dev/privacy |
| サポート URL | 同上（連絡先を記載） |
| 年齢区分 | 質問票の回答による（暴力・無制限の Web アクセスなし。プレイヤー名がランキングに表示される。1.1 以降は広告と、広告を消す月額サブスクリプションあり） |

## 日本語
**サブタイトル**: 色玉を落として消す 対戦パズル

**プロモーション用テキスト**: 落ちてくる 3 つの玉を回して積み、同じ色を 6 個つなげて消す。大きな形で消せば相手に玉を送り込める、スピード感のある 1 対 1 パズル。

**説明**:
```
落ちてくる 3 つの玉を左右に動かし、回して積み上げる対戦パズル。
同じ色の玉を 6 個以上つなげると消え、上の玉が一気に落ちてきます。

■ 技で攻める
直線・三角・六角形の形で消すと「技」。相手の盤面に灰色の玉を送り込みます。
連鎖を組めばさらに大きな攻撃に。盤面からあふれた方の負けです。

■ 遊び方いろいろ
・オンライン対戦：勝ってトロフィーを集め、リーグとランキングを上がる
・デイリーチャレンジ：毎日全員同じ 20 手のスコアアタック
・AI 対戦：とてもよわい〜超強いの 5 段階
・ルーム：6 桁のコードで友だちと対戦
・チュートリアル：実際に動かしながら覚える 5 つのレッスン

■ 快適な操作
タッチ・キーボード・ゲームコントローラーに対応。
色の記号表示で、色の見分けにくい方も遊べます。

■ Game Center 対応
トロフィーのランキングと実績に対応しています。

■ 広告なしプラン（月額・自動更新）
対戦のあとに表示される広告をなくします。期間終了の 24 時間前までに解約しない限り自動で更新されます。
利用規約: https://www.apple.com/legal/internet-services/itunes/dev/stdeula/
プライバシーポリシー: https://dropball.hrk-6888.workers.dev/privacy
```

**キーワード**: パズル,落ち物,対戦,オンライン,連鎖,色合わせ,玉,ボール,AI,ランキング

## English
**Subtitle**: Drop, match six, attack

**Promotional text**: Steer falling trios of glass balls, connect six of a colour to clear them, and clear in big shapes to bury your opponent. Fast one-on-one puzzle battles.

**Description**:
```
A head-to-head falling puzzle. Move and rotate trios of glass balls as they fall,
and connect six or more of one colour to clear them – the balls above come
tumbling down.

ATTACK WITH SHAPES
Clear in a line, a triangle or a hexagon to send grey balls to your opponent.
Chains hit even harder. Whoever overflows first loses.

WAYS TO PLAY
• Online: win trophies, climb the leagues and the global leaderboard
• Daily challenge: the same 20 pieces for everyone, every day
• Versus AI: five levels, from very easy to expert
• Rooms: play a friend with a six-digit code
• Tutorial: five hands-on lessons

COMFORTABLE CONTROLS
Touch, keyboard and game controllers. Optional colour symbols help colour-blind players.

GAME CENTER
Trophy leaderboard and achievements.

AD-FREE PLAN (MONTHLY, AUTO-RENEWING)
Removes the ads shown after matches. Renews automatically unless cancelled at least 24 hours before the period ends.
Terms of use: https://www.apple.com/legal/internet-services/itunes/dev/stdeula/
Privacy policy: https://dropball.hrk-6888.workers.dev/privacy
```

**Keywords**: puzzle,falling,versus,online,match,chain,colour,ball,ai,leaderboard

## スクリーンショット
iPhone 6.9"（1320×2868 横向きなら 2868×1320）と iPad 13"（2064×2752 / 2752×2064）が必要です。
タイトル画面・対戦中・技の発動・ランキング・チュートリアルの 5 枚を推奨します。

## 審査メモ（App Review Information）
- オンライン対戦は匿名ログインで、サインインなしでも遊べます（AI 対戦・チュートリアルはオフラインでも可）。
- アカウント削除: ホームのプレイヤー名 → プロフィール → 「アカウントを削除」。
- 審査用のデモアカウントは不要です。
- 1.1: 広告なしプラン（月額サブスクリプション）は 設定 → 「広告なしプラン」。同じ場所に「購入を復元」「サブスクリプションを管理」、
  利用規約とプライバシーポリシーへのリンクがあります。広告は対戦の結果画面を閉じたときに 3 試合に 1 回表示されます。
