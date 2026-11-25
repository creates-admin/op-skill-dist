# 指示書の形式

## 骨格

| 入口 | 骨格 (`_shared/pr-templates.md`) |
|---|---|
| 監査の finding・人の Issue の正規化・scout の報告 | 「Issue 本文 (指示書フル版)」(バッチは「バッチ版」) |
| 要望から (計画 Issue) | 「Issue 本文 (指示書フル版)」を次のとおり読み替える |

計画 Issue の読み替え:

- `## 検出根拠` と `## 観測された挙動 / Evidence` の代わりに `## 背景` (なぜ要るか) を書く。
- `### scan が立てた仮説` と `### 除外した仮説` の代わりに `### 方針` (どう作るか。採らなかった案があれば理由を 1 行) を書く。op-architect 由来は ADR を方針に書く (op-architect フェーズ5-1)。
- それ以外の節は見出しを変えずに書く。

節の順: marker → `## 概要` → (`デザインモック:` 行) → `## 背景` か `## 検出根拠`・`## 観測された挙動 / Evidence` → `## 振り分けの材料` → `---` → `## 🤖 apply agent への指示書` の各節 → (`## 依存`) → `## 関連` → `---` と footer。
footer は `🤖 op-intake による自動起票`。

## 振り分けの材料

見出しと 4 項目の形は `pr-templates.md`「振り分けの材料」。埋め方:

- 触るファイル: 「触ってよいファイル」を短くまとめる。呼び出し元の数など、大きさの根拠になる数を添える。
- 画面: モックがあればその surface の名前。
- 依存: この run の下書きは `#issue[<key>]` で書き、手順 5 で番号に置き換える。

## marker とラベル

- marker は `pr-templates.md`「Issue 本文 hidden marker」、`op-run-expert` / `op-post-check-expert` とラベルは同「domain → marker / ラベル表」。
- `severity:*` は finding (Critical / High) に付ける。計画 Issue には付けない。scout の報告と正規化は `pr-templates.md` の表の下の決まりと op-scan skill の `references/from-issue-mode.md` §5。
- 振り分けの材料・鎖・スレッドを表す marker は足さない (marker は `labels-and-markers.md` の 11 種だけ)。

## 必須検証項目

対象リポジトリの検証コマンド (`_shared/project-profile.md`) を入れる。リポジトリや Project の決まりが足す項目 (例: 「ローカルで 1 回通す (人の作業)」) があれば入れる。
