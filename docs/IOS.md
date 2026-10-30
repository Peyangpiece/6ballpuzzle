# iOS アプリ（App Store）

ウェブ版（`public/`、Cloudflare で公開）はそのまま続け、同じ中身を Capacitor で iOS アプリにします。
アプリはウェブ版のビルド（`dist/`）を同梱し、外部からコードを読み込みません（Firebase SDK も `public/lib/` に同梱）。

| 機能 | 実装 | 審査ガイドライン |
| --- | --- | --- |
| Game Center（レートのランキング・実績） | `ios/App/App/DropBallNative.swift`（GameCenter プラグイン）＋ `public/app-native-v1.js` | 4.2 最低限の機能 |
| Apple でサインイン | `@capacitor-firebase/authentication`（ネイティブのシート）→ Web の Firebase Auth | 4.8 ログインサービス |
| Google でログイン（ネイティブ） | 同上 | 4.8 |
| 触覚フィードバック | `@capacitor/haptics`（既存の「振動」設定がそのまま使えます） | 4.2 |
| BGM（音量スライダー対応） | `NativeBgm` プラグイン（AVAudioPlayer、`DropBallNative.swift`）＋ `public/app-native-v1.js` | — |
| アカウント削除 | プロフィール → 「アカウントを削除」（`public/app-account-delete-v1.js`、ウェブ版にもあり） | 5.1.1(v) |
| 広告（1.1 以降） | `@capacitor-community/admob`。結果画面を閉じたとき 3 試合に 1 回（2 分以上あけて）全画面広告。Google の同意画面（EU・英国など）→ ATT の順に尋ねる（`public/app-native-v1.js`） | 5.1.2（ATT） |
| 広告なしプラン（1.1 以降） | 月額の自動更新サブスクリプション `app.dropball.game.adfree.monthly`（StoreKit 2、`DropBallNative.swift` の Store プラグイン）。設定画面に購入・「購入を復元」・「サブスクリプションを管理」と、価格・期間・自動更新・解約方法・利用規約・プライバシーポリシーの表示。起動時とアプリに戻ったときに有効か確かめる | 3.1.1, 3.1.2 |
| プライバシーポリシー | `public/privacy.html`（設定画面からリンク） | 5.1.1 |

ここから先は **Mac での作業** です（この開発環境は Linux のため、ビルドと署名はできません）。

## 1. 準備
- Mac、正式版の Xcode 26 以降（2026 年 4 月 28 日から App Store Connect へのアップロードに必須。
  ベータ版の Xcode でビルドしたものは審査に提出できません）、Node.js 20 以降（CI は 22）
- Apple Developer Program（年会費）
- 実機で動かすには、iPhone をケーブルでつないで Xcode の実行先に選び、Signing & Capabilities の
  「Register Device」で開発者アカウントに登録し、iPhone の 設定 → プライバシーとセキュリティ →
  デベロッパモード をオンにします（この項目は一度 Xcode につないだあとに現れます）。

```bash
git clone https://github.com/Peyangpiece/6ballpuzzle.git && cd 6ballpuzzle
npm ci
npm run ios:sync      # ウェブ版をビルドして ios/ にコピー、Swift パッケージを更新
npm run ios:open      # Xcode で開く
```
ウェブ側を変更したら、毎回 `npm run ios:sync` を実行してからアプリをビルドします
（ターミナルはリポジトリのフォルダで実行すること。`git pull` だけではウェブ側の変更はアプリに入りません）。

## 2. Xcode の設定（ターゲット「App」）
1. **Signing & Capabilities** → Team を選択。Bundle Identifier は `app.dropball.game`
   （使用済みの場合は変更し、`capacitor.config.json` の `appId` と、下記 Firebase の登録も同じ値にする）。
2. Capabilities に **Game Center** と **Sign in with Apple** があることを確認（`App/App.entitlements` に記載済み。
   自動署名で App ID に反映されます。表示されない場合は「+ Capability」で追加）。
3. 初回は Swift パッケージ（Capacitor、Firebase、GoogleSignIn）の取得に数分かかります。
4. **アプリアイコン（リキッドグラス）**: `App/App/AppIcon.icon`（Icon Composer で作成）を Xcode のプロジェクトナビゲータの
   「App」フォルダへドラッグし、ターゲット App にチェックを入れて追加します。General → App Icons and Launch Screen の
   App Icon が `AppIcon` になっていることを確認します。従来の `Assets.xcassets/AppIcon.appiconset` も同じ名前で残っているため、
   ビルドした実機・シミュレータのホーム画面でリキッドグラスのアイコンが使われていることを確かめてください
   （使われない場合は `AppIcon.appiconset` を削除）。元のレイヤーは `brand/icon-composer/`。

## 3. Firebase（プロジェクト ballpuzzle-8cc87）
1. Firebase コンソール → プロジェクトの設定 → **iOS アプリを追加**（バンドル ID は上と同じ）。
2. `GoogleService-Info.plist` をダウンロードし、Xcode で `App/App/` にドラッグ（ターゲット App にチェック）。
   このファイルは秘密情報ではありませんが、リポジトリにはコミットしない運用にしています。
3. Authentication → Sign-in method → **Apple** を有効化（iOS のネイティブサインインだけなら、
   Services ID や秘密鍵の入力は不要です）。Google は有効化済み。
4. Xcode → ターゲット App → **Info** → URL Types に、`GoogleService-Info.plist` の `REVERSED_CLIENT_ID`
   の値を URL Schemes として追加（Google ログインのシートから戻るために必要）。

## 4. App Store Connect
1. 「マイ App」→ 新規 App（プラットフォーム iOS、バンドル ID は上と同じ、SKU は任意）。
2. **Game Center** を有効にし、次の ID で作成（`public/app-native-v1.js` と一致させる）。

**リーダーボード**（クラシック）

| ID | 名前 | スコアの種類 | 並び順 | 送信 |
| --- | --- | --- | --- | --- |
| `dropball.rating` | レート / Rating | 整数 | 高い順 | 最新のスコア（Most Recent Score） |

**実績**（ポイントは合計 1000 以下で任意。例）。画像は `brand/achievements/<ID>.png`（1024×1024、`tools/make-achievement-images.py` で生成。文字はラテン文字だけなので全言語で共通）

| ID | 日本語 | English | ポイント |
| --- | --- | --- | --- |
| `dropball.first_win` | はじめての勝利 | First Win | 10 |
| `dropball.ai_1` 〜 `dropball.ai_5` | AI「とてもよわい」〜「とてもつよい」に勝つ | Beat AI level 1–5 | 10 / 20 / 30 / 50 / 100 |
| `dropball.waza_first` | はじめての技 | First Technique | 10 |
| `dropball.hexagon` | ヘキサゴン | Hexagon | 30 |
| `dropball.chain_3` | 3 連鎖 | 3-Chain | 20 |
| `dropball.chain_5` | 5 連鎖 | 5-Chain | 50 |
| `dropball.online_win` | オンラインで勝利 | Online Win | 20 |
| `dropball.rating_1200` | レート 1200 | Rating 1200 | 50 |

3. 掲載文・キーワード・スクリーンショットは `docs/APPSTORE.md`。
4. **App のプライバシー**（栄養ラベル）: 「トラッキングに使用」はすべて「いいえ」。収集するデータ:
   - 識別子 → ユーザ ID（App の機能、ユーザに関連付け）
   - 連絡先情報 → メールアドレス（Apple / Google でサインインした場合のみ、App の機能、ユーザに関連付け）
   - ユーザコンテンツ → その他（ニックネーム、ランキング表示）、ゲームプレイ（戦績・レート）
5. プライバシーポリシー URL: `https://dropball.hrk-6888.workers.dev/privacy`

## 5. テストと提出
1. 実機をつないで Xcode で実行（Game Center は Sandbox アカウントで確認できます）。
   確認項目: 横画面固定、オンライン対戦、Apple / Google でログイン、ゲーム中の振動、
   ランキング画面の「Game Center のランキング」、実績の通知、プロフィールからのアカウント削除。
2. Product → Archive → Distribute App → App Store Connect（まず TestFlight で確認）。
3. 審査提出時のメモは `docs/APPSTORE.md` の「審査メモ」を使用。

## 6. 広告と「広告なしプラン」（バージョン 1.1）
コードは入っています。リリース前に、次の値と設定をそろえます。それまでは Google のテスト広告（「Test Ad」と表示）が出ます。
テスト広告のまま審査に出さないこと。

1. **AdMob**（https://admob.google.com）でアカウントを作り、「アプリを追加」→ iOS → App Store に公開済みのアプリとして Drop Ball を選ぶ。
   - **アプリ ID**（`ca-app-pub-…~…`）→ `ios/App/App/Info.plist` の `GADApplicationIdentifier`（今は Google のテスト用 ID）。
   - 「広告ユニット」→「インタースティシャル」を作り、**広告ユニット ID**（`ca-app-pub-…/…`）→ `public/app-native-v1.js` の `ADMOB_INTERSTITIAL`。
2. AdMob の「プライバシーとメッセージ」で、**GDPR（EU・英国）のメッセージ**を作成して公開する（作らないと EU では広告が出ません）。
   「IDFA の説明メッセージ」は任意（作ると ATT の前に説明画面が出ます）。
3. **app-ads.txt**: `public/app-ads.txt` に置き済み（AdMob の「アプリ」→「app-ads.txt」の 1 行と同じ）。App Store のマーケティング URL を
   `https://dropball.hrk-6888.workers.dev` にする（AdMob は掲載情報の開発者サイトのルートで確認します）。
4. **App Store Connect → サブスクリプション** → サブスクリプショングループ「広告なしプラン」を作り、その中に
   自動更新サブスクリプション：製品 ID `app.dropball.game.adfree.monthly`、参照名「広告なしプラン 月額」、期間 **1か月**、
   価格 **300 円**、表示名・説明（例: 広告なしプラン / 対戦後の広告を表示しません）、審査用スクリーンショット（設定画面の購入ボタン）。
   グループのローカリゼーション（表示名「広告なしプラン」）も入れる。バージョン 1.1 のページの「アプリ内課金とサブスクリプション」に追加して一緒に提出する。
   App の説明文の末尾に、利用規約（Apple 標準 EULA: https://www.apple.com/legal/internet-services/itunes/dev/stdeula/ ）と
   プライバシーポリシーへのリンクを書く（3.1.2: サブスクがあるアプリは掲載情報にも必要）。
5. **年齢制限**: 「広告」を「はい」に変える。
6. **App のプライバシー**: Google の「AdMob のデータ開示」（https://developers.google.com/admob/ios/privacy/data-disclosure）に従って追加する。
   目安: 識別子 → デバイス ID、位置情報 → おおよその位置、使用状況データ → 製品の操作・広告データ、診断 → クラッシュ・パフォーマンス。
   目的は「サードパーティ広告」（と「分析」）、デバイス ID などは「トラッキングに使用」＝はい。
7. Xcode の General で Version を 1.1、Build を 2 以上にして Archive。
8. テスト: 実機で ATT のダイアログ、3 試合目の結果画面を閉じたときの広告、設定画面の「広告なしプラン」（App Store のサンドボックスアカウント。サンドボックスでは 1 か月が数分で更新・期限切れになる、
   または Xcode の StoreKit テスト）と「購入を復元」を確かめる。

## 構成メモ
- ルームの招待リンク（`https://dropball.hrk-6888.workers.dev/?room=NNNNNN`）はユニバーサルリンクでアプリが開きます：
  `public/.well-known/apple-app-site-association`（`appIDs` は「Team ID.app.dropball.game」、`?room=` 付きのリンクだけが対象）、
  `App.entitlements` の Associated Domains（`applinks:dropball.hrk-6888.workers.dev`）、`@capacitor/app` の `appUrlOpen` /
  `getLaunchUrl`（`public/app-native-v1.js`）。Bundle ID や Team を変えたら `appIDs` も直します。
- `capacitor.config.json`: `webDir` は `dist`。`experimental.ios.spm` で Firebase プラグインの Facebook SDK を除外。
- `ios/App/App/DropBallNative.swift`: 全画面・横画面の `MainViewController`（`Main.storyboard` の初期画面）、
  Game Center プラグイン、BGM の `NativeBgm` プラグイン。ホームインジケータとステータスバーは
  `capacitor.config.json` の `plugins.SystemBars.hidden` で隠します（Capacitor 8 では
  `prefersHomeIndicatorAutoHidden` を上書きできないため）。
- アプリ内の Web 表示での音: `capacitor://` のファイルは fetch の status が 0 で返る（中身は正常）ため、効果音の
  読み込みは 0 も成功として扱います。`<audio>` の volume は効かず、Web Audio に通すと無音になるため、BGM は
  `NativeBgm`（AVAudioSession は ambient。Web 表示の音と互いに止め合わない）、メニューのタップ音は Web Audio で鳴らします。
- 横向きの安全領域（左右 62pt）: ページ全体（`#root`）には余白を付けず、メニューと HUD が各自で
  `env(safe-area-inset-*)` を避けます。16:9 より横長の画面では、背景を左右に広げた画像（`app-10.js`）を全面に敷きます。
- `public/app-native-v1.js`: アプリ内でだけ動く橋渡し（ブラウザでは何もしません。`tests/native-bridge.js`）。
- Service Worker は `http(s)` でだけ登録されるため、アプリ（`capacitor://`）では使われません。
