# デザインモック (/design Artifact)

UI の見た目は文章で指示せず、`/design` Artifact のモックで人間と合意する。op-component (部品単体) / op-plan・op-architect
(画面) / op-explore が使う。見た目の正本は repo のカタログ (`design-system.md`)。Design System の同期はしない。
画面のモックは登録済みの部品で組み、表現できないものは部品 issue (`design-system.md`「部品 issue」) に回す。

## 作成 (司令官 = main session が行う)

1. 既存 UI がある repo では、必要に応じて designer-expert に read-only で既存の design token / component / layout パターンの
   要約を依頼し、モックに反映する (新しい見た目を発明しない)。作成前に `design-ng.md` を読む。
2. `Artifact({action:"quickstart", intent:"design"})` を呼び、返る Design type の `type_url` で
   `Artifact({type_url, title, auto_open:"after_first_write"})` を作成する。以降は作成結果に含まれる type の指示に従って
   artboard を埋める。対象 repo の Design System Artifact があれば使う。
3. 画面・状態ごとに artboard を分ける (通常 / 空 / 読み込み中 / エラー など、実装で必要な状態)。
   複数案を比較したいときは案ごとに artboard を並べる。**どの案を採るかは人間が決める。**
4. 人間に見せる前に `design-ng.md` の NG に 1 つも該当しないことを確認する (該当したら直してから見せる)。
5. 人間のフィードバックで更新し、合意したら URL を確定する。

## 利用

- Issue 本文: `デザインモック: <artifact URL>` の 1 行 (採用 artboard 名があれば併記)。
- op-run の apply / ux-ui post-check: spawn prompt にモック URL を渡し、`Artifact({action:"read", url})` で参照させる。
  モックは見た目の目標であり、実装は対象 repo の既存 design system / component を使う。
- モックと既存 design system が両立しない等、実装前に判断が要るものは apply 担当が needs_human_decision で返す。
  post-check ではモックとの差分のうち判断が要るもの (モックに無い状態など) を BLOCK にせず notes に記載する。
