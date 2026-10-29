# Drop Ball ブランドガイド

ロゴ・アイコンはすべて `tools/make-brand.py` が生成します（`brand/` と `public/icons/`、ホーム画面用の `public/assets/drop-ball-logo.svg`）。
文字は Inter Display Black（SIL Open Font License）をアウトライン化したもので、SVG はフォントに依存しません。
一覧は `brand/drop-ball-brand-sheet.png` を参照してください。

## コンセプト
「DROP BALL」の **O が、落ちてきたガラス玉** になって行の下へはみ出し、その上にゲームの色の 3 本のスピードラインが残る。
名前（落とす・玉）とゲーム体験（色玉が落ちてくる）を一目で伝えるワードマークです。アイコンはこの玉とラインだけを取り出したもの。

## ファイル
| ファイル | 用途 |
| --- | --- |
| `drop-ball-logo-on-dark.svg` | 標準。暗い背景（ゲーム画面・ストア画像） |
| `drop-ball-logo-on-light.svg` | 明るい背景（白・淡色） |
| `drop-ball-logo-flat-on-dark.svg` / `-flat-on-light.svg` | グラデーションを使わない版。小さい表示（高さ 24px 未満）・印刷 |
| `drop-ball-logo-mono-white.svg` / `-mono-navy.svg` | 1 色版。写真の上、刻印、単色印刷 |
| `drop-ball-symbol.svg` / `drop-ball-app-icon-1024.png` | アプリアイコン（App Store 用は 1024px PNG） |
| `drop-ball-symbol-transparent.svg` | 背景なしのシンボル（SNS アバターの重ね合わせ等） |
| `icon-composer/*.svg` | iOS 26 以降のリキッドグラス用アイコンのレイヤー（玉・ライン 3 本。光沢と影はシステムが付けるので描かない）。Icon Composer で組んだものが `ios/App/App/AppIcon.icon` |

## 色
| 名前 | HEX | 役割 |
| --- | --- | --- |
| Drop Cyan | `#2FE3F5` | ブランドの主色（玉） |
| Night Navy | `#12102E` | 文字（明るい背景）・背景 |
| Amber / Signal Red / Violet | `#FFB020` / `#FF3B4D` / `#B255F0` | スピードライン |
| Blue / Green | `#2E86FF` / `#2FD36E` | 補助色（ゲームの玉の色） |

## 使い方
- 余白: ロゴの周囲に、玉の直径以上の空きを取る。
- 最小サイズ: 文字の高さ 12px（画面）/ 4mm（印刷）。それより小さい場合はシンボルだけを使う。
- 玉の位置・大きさ、ラインの本数と色、文字の間隔を変えない。ロゴを変形・回転・縁取りしない。
- 玉の上に文字や別の図形を重ねない。背景との明度差が小さい場合は 1 色版を使う。
