# Visual Quality Rubric

UI の完成度を 100 点で自己採点する rubric。Apply 後に実 score を出し、85 未満または Hard blocker 残存なら再修正する。
Hard blocker 一覧の正本は本ファイル (motion 固有の Hard blocker は `motion-patterns.md`)。

## Score

| 評価軸 | 配点 | 合格ライン | 見るポイント |
|---|---:|---:|---|
| 情報の明快さと階層 | 25 | 18 | 主タスクが一目で分かるか、主要 / 二次情報が整理されているか |
| 操作導線とエラー予防 | 25 | 18 | 次アクション、状態、失敗時の復帰、危険操作の保護 |
| design system 準拠 | 20 | 14 | token / component / pattern が守られ、ad-hoc 値がないか |
| 密度と視認性 | 15 | 10 | 高密度でも読めるか、比較しやすいか、余白が意味を持つか |
| accessibility | 15 | 12 | contrast、focus、keyboard、状態表現、読み上げ配慮 |

## Decision

| Score | 判定 |
|---|---|
| 85–100 | ship candidate |
| 70–84 | revise (再修正して再採点) |
| 0–69 | redesign (モック / Issue 前提から見直す → `needs_human_decision`) |

## Hard blockers

1 つでもあれば score に関係なく完了扱いにしない。

- primary task が不明 (この画面で何を完了するか説明できない)
- 該当する状態が見えない (モック / Issue にある状態の不在。6 状態を機械的に全要求はしない)
- error / loading / empty が該当 UI で未実装
- token bypass が広範囲 (5 箇所以上、または theme 切替を物理的に阻害)
- common component bypass が広範囲 (同等 UI を複数箇所で自前実装)
- contrast 不足 (本文 4.5:1 未満 / 非テキスト UI 3:1 未満)
- focus が見えない (`:focus-visible` 未実装、装飾で消している)
- keyboard 到達不可 (`<div @click>` で `<button>` を使っていない 等)
- 危険操作が保護されていない (削除に確認なし / 不可逆操作に Undo なし)
- type scale の説明不能な中間値 (font-size 群が単一 modular ratio から説明できない。例: 16 / 20 / 24 の中の 19px)
- grid 単位を外れた spacing の広範囲逸脱 (op-config `grid_unit` の整数倍でない値の蔓延。1〜2 箇所の optical 補正は除く)
- accent 色種類数の閾値超過 (op-config `max_accent_colors` 超過)
- semantic 色の装飾流用 (success / warning / error / info を意味と無関係な装飾に使う)

### 降格項目 (Hard blocker にしない、Notes で確認を求める)

静的に違反と確定できないもの:

- intra-group gap < inter-group gap の崩れ — 何が同一 group かは意味的判断
- type scale の意図的逸脱 — editorial な特大見出し等は craft の一部

## 採点の運用

- 各軸ごとに「どこを見て何点減点したか」を観測事実 (ファイル / token / 状態) 付きで 1 行ずつ書く
- runtime で確認できない項目 (描画上の focus リング、SR 読み上げ順、sticky 挙動) は `N/A (static-only)` とし減点しない。
  末尾に「runtime 検証未実施項目: X / Y」を書く。手段と static 代理は `~/.claude/skills/_shared/runtime-verification.md`
- Hard blocker (focus 不可視 / contrast 不足 / keyboard 不可) は N/A に逃がさない。CSS 記述・要素種別・token 値の static 代理で判定する

```markdown
## Visual Quality Score
- 情報の明快さと階層: 22 / 25 — secondary action 2 つが同強度 → -3
- 操作導線とエラー予防: 23 / 25 — undo 未実装 → -2
- design system 準拠: 18 / 20 — 1 箇所だけ独自 padding → -2
- 密度と視認性: 13 / 15 — empty state の余白が広すぎ → -2
- accessibility: 14 / 15 (N/A: SR 読み上げ順) — icon-only button の aria-label 1 箇所欠 → -1
合計: 90 / 100 → ship candidate / Hard blockers: なし / runtime 検証未実施項目: 1 / 5
```
