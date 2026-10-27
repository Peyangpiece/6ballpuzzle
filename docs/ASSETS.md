# アセットの出所

配信される資産は `public/assets/`、`public/icons/`、`public/vendor/`、`public/lib/` のみです。参照されないファイルは置きません
（`tests/build-output.js` がバンドルから参照される資産の存在を検証します）。

| ファイル | 用途 | 出所 / ライセンス |
| --- | --- | --- |
| `assets/6ball-battle-bgm.ogg` (Opus 96kbps) / `.m4a` (AAC 128kbps) | 対戦中 BGM（3 分・継ぎ目なしループ） | `tools/make-bgm.py` がコードで作曲・合成したオリジナル曲「Glass Cascade」（旋律・和声進行の配置・音色・ドラム・残響はすべて本作用に作成、外部の音源やサンプルは不使用）。テンポ 160 BPM・4/4・ハ長調という一般的な性質だけを旧曲に合わせた。2026-10 に、出所不明だった旧 15 分曲から置き換え |
| `assets/menu-confirm-42.mp3` | メニュー決定音 | 所有者アップロードの「決定ボタンを押す42.mp3」。出所サイト・ライセンスは所有者が確認して記載すること |
| `assets/normal-ball-rotate-v14.mp3`, `normal-ball-rotate-v15-clear.wav` | 回転音 | 所有者作成 |
| `assets/instant-drop-land-v10.wav` | ハードドロップ着地音 | 所有者作成 |
| `assets/ball-position-lock-v6-buin.wav` | 位置確定音 | 所有者作成 |
| `assets/ball-glass-{red,blue,green,yellow,purple}.png` | 球（盤面・メニュー共通、192px） | `tools/make-balls.py` がコードで描画したオリジナル作品（ガラス玉の陰影・映り込みと、色ごとの内部模様: 赤＝キャッツアイ、青＝水面の光の網目、緑＝クラックル、黄＝サンバースト、紫＝星雲）。2026-10 に、原作の球に似ていた旧画像から置き換え |
| `assets/drop-ball-logo.svg` | ホーム画面のロゴ | `tools/make-brand.py` が生成（`brand/drop-ball-logo-on-dark.svg` と同じ）。ブランド一式とガイドは `brand/`・`docs/BRAND.md` |
| `icons/icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon.png`, `favicon-32.png` | アプリのアイコン（ホーム画面・インストール） | `tools/make-brand.py` がシンボル（落ちるガラス玉と 3 本のスピードライン）から生成 |
| `vendor/react@18.3.1/*.min.js` | React / ReactDOM | MIT License (Meta Platforms, Inc.) |
| `lib/firebase/10.12.2/*.js` | Firebase JS SDK（app / auth / database） | Apache License 2.0 (Google LLC)。gstatic 配布版の import 先を同梱ファイルへ書き換えたもの（アプリが外部からコードを読まないため） |
| `tailwind.css` | 生成 CSS | Tailwind CSS v3.4.17, MIT License |

2026-10 に名称を「Drop Ball」へ変更し、「6」の旧ロゴ `6ball-logo-transparent.png`・`6ball-logo-source.jpg` を削除。

2026-10 の整理で削除したもの: `6ball-battle-bgm.mp3`（21.6 MB の旧曲。その再エンコード版も 2026-10 に新曲へ置き換え）、`maou_bgm_cyber44.mp3`、
`maou_se_sound_footstep02.wav`、`6ball-rotate.mp3`、`normal-ball-rotat.mp3`、`normal-ball-rotate.mp3`、`回転.mp3`
（いずれもコードから参照されていませんでした）。魔王魂（maou.audio）由来の素材は配信物に含まれていません。

## 本家映像について

`tests/fixtures/*.json` は、所有者が撮影した『世界のアソビ大全51』「6ボールパズル」のプレイ映像から
`tools/reference-*.py` で抽出した球中心座標（数値）です。映像そのものはリポジトリに含めていません。
本作は非公式の個人制作物で、任天堂とは無関係です。名称・画面デザイン・音源は本家のものを使用していません。
