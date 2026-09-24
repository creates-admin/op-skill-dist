# デザインシステム (カタログ正本 + 部品の登録制)

UI の見た目の正本は **対象 repo が持つコンポーネントカタログ**。部品は 1 つずつ作り込み、人間が OK したものだけを
カタログに「登録 (確定)」する。アプリ側は登録済みの部品を組むだけで、見た目を独自に作らない。

## 層

| 層 | 中身 | 正本 |
|---|---|---|
| カタログ | 全部品のバリアント × 状態を並べた、実際に描画されるページ (例: `/catalog` ルート) | repo |
| トークン | primitive (文字・余白・影など) → semantic (`text-primary` 等) → 部品単位 (`{component}-{property}-{value}`) | repo |
| 部品の契約 | props / variant / size / 状態の型 (例: zod スキーマ、TypeScript 型)。部品の props と 1:1 | repo |
| 部品 | 契約とトークンだけで作った部品本体。冒頭に `status: draft` / `status: 確定` を持つ | repo |

Claude Design (`/design` Artifact) は作り込み中の作業台であり、正本ではない (`design-mock.md`)。

## 規則

- アプリ (画面・ページ) は **登録済み (確定) の部品だけ** を組む。生の値 (色・px・フォント) や独自スタイルを書かない。
- 登録済みの部品で表現できない見た目が要るときは、画面側で作らず `op-component` で部品を作る / 変える。
  画面の Issue はその部品の Issue に `op-depends-on` でつなぐ。
- 部品の色は部品単位トークンを経由する。部品単位トークンは semantic → primitive を参照する。
- 部品の見た目は `design-ng.md` に従う。
- 登録 (`status: 確定` への変更) は人間がカタログ上の実物を OK した後だけ。expert は登録しない。

## repo ごとの設定

`op-config.yaml` の `design_system` (`op-config-schema.md` §12)。導入は新規・既存 repo とも `/op-skill:op-component --init`
(唯一の導入手順。既存 UI の見た目は変えずに整理・登録する)。

未導入の repo では、各 skill は既存 UI を踏襲して進めてよい。UI を含む計画・起票・実装の提示時に
「デザインシステム未導入: `/op-skill:op-component --init` を推奨」と 1 行添える。登録制 (確定部品だけを使う) は導入済みの repo でだけ強制する。
