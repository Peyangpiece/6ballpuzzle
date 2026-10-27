# iOS アプリ（App Store）

ウェブ版（`public/`、Cloudflare で公開）はそのまま続け、同じ中身を Capacitor で iOS アプリにします。
アプリはウェブ版のビルド（`dist/`）を同梱し、外部からコードを読み込みません（Firebase SDK も `public/lib/` に同梱）。

| 機能 | 実装 | 審査ガイドライン |
| --- | --- | --- |
| Game Center（レートのランキング・実績） | `ios/App/App/DropBallNative.swift`（GameCenter プラグイン）＋ `public/app-native-v1.js` | 4.2 最低限の機能 |
| Apple でサインイン | `@capacitor-firebase/authentication`（ネイティブのシート）→ Web の Firebase Auth | 4.8 ログインサービス |
| Google でログイン（ネイティブ） | 同上 | 4.8 |
| 触覚フィードバック | `@capacitor/haptics`（既存の「振動」設定がそのまま使えます） | 4.2 |
| アカウント削除 | プロフィール → 「アカウントを削除」（`public/app-account-delete-v1.js`、ウェブ版にもあり） | 5.1.1(v) |
| プライバシーポリシー | `public/privacy.html`（設定画面からリンク） | 5.1.1 |

ここから先は **Mac での作業** です（この開発環境は Linux のため、ビルドと署名はできません）。

## 1. 準備
- Mac、Xcode 16.3 以降（Swift 6.1。Firebase プラグインの SPM トレイトに必要）、Node.js 20 以降
- Apple Developer Program（年会費）

```bash
git clone https://github.com/Peyangpiece/6ballpuzzle.git && cd 6ballpuzzle
npm ci
npm run ios:sync      # ウェブ版をビルドして ios/ にコピー、Swift パッケージを更新
npm run ios:open      # Xcode で開く
```
ウェブ側を変更したら、毎回 `npm run ios:sync` を実行してからアプリをビルドします。

## 2. Xcode の設定（ターゲット「App」）
1. **Signing & Capabilities** → Team を選択。Bundle Identifier は `app.dropball.game`
   （使用済みの場合は変更し、`capacitor.config.json` の `appId` と、下記 Firebase の登録も同じ値にする）。
2. Capabilities に **Game Center** と **Sign in with Apple** があることを確認（`App/App.entitlements` に記載済み。
   自動署名で App ID に反映されます。表示されない場合は「+ Capability」で追加）。
3. 初回は Swift パッケージ（Capacitor、Firebase、GoogleSignIn）の取得に数分かかります。

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

**実績**（ポイントは合計 1000 以下で任意。例）

| ID | 日本語 | English | ポイント |
| --- | --- | --- | --- |
| `dropball.first_win` | はじめての勝利 | First Win | 10 |
| `dropball.ai_1` 〜 `dropball.ai_5` | AI「とてもよわい」〜「超強い」に勝つ | Beat AI level 1–5 | 10 / 20 / 30 / 50 / 100 |
| `dropball.waza_first` | はじめての技 | First Technique | 10 |
| `dropball.hexagon` | 六角形の技 | Hexagon | 30 |
| `dropball.chain_3` | 3 連鎖 | 3-Chain | 20 |
| `dropball.chain_5` | 5 連鎖 | 5-Chain | 50 |
| `dropball.online_win` | オンラインで勝利 | Online Win | 20 |
| `dropball.rating_1200` | レート 1200 | Rating 1200 | 50 |

3. 掲載文・キーワード・スクリーンショットは `docs/APPSTORE.md`。
4. **App のプライバシー**（栄養ラベル）: 「トラッキングに使用」はすべて「いいえ」。収集するデータ:
   - 識別子 → ユーザ ID（App の機能、ユーザに関連付け）
   - 連絡先情報 → メールアドレス（Apple / Google でサインインした場合のみ、App の機能、ユーザに関連付け）
   - ユーザコンテンツ → その他（ニックネーム、ランキング表示）、ゲームプレイ（戦績・レート）
5. プライバシーポリシー URL: `https://6ballpuzzle.hrk-6888.workers.dev/privacy.html`

## 5. テストと提出
1. 実機をつないで Xcode で実行（Game Center は Sandbox アカウントで確認できます）。
   確認項目: 横画面固定、オンライン対戦、Apple / Google でログイン、ゲーム中の振動、
   ランキング画面の「Game Center のランキング」、実績の通知、プロフィールからのアカウント削除。
2. Product → Archive → Distribute App → App Store Connect（まず TestFlight で確認）。
3. 審査提出時のメモは `docs/APPSTORE.md` の「審査メモ」を使用。

## 構成メモ
- `capacitor.config.json`: `webDir` は `dist`。`experimental.ios.spm` で Firebase プラグインの Facebook SDK を除外。
- `ios/App/App/DropBallNative.swift`: 全画面・横画面の `MainViewController` と、Game Center プラグイン。
- `public/app-native-v1.js`: アプリ内でだけ動く橋渡し（ブラウザでは何もしません。`tests/native-bridge.js`）。
- Service Worker は `http(s)` でだけ登録されるため、アプリ（`capacitor://`）では使われません。
