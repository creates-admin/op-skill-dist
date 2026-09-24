# Visual Quality Rubric

Apply 後に 100 点で自己採点する rubric。85 未満または Hard blocker 残存なら再修正する。
Hard blocker 一覧の正本は本ファイル (motion 固有は `motion-patterns.md`)。

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

- ux-ui-audit-expert の post-check BLOCK 条件 (expert-ux-ui-audit skill の `criteria.md`「BLOCK 条件」) に該当するもの
- token bypass が広範囲 (5 箇所以上、または theme 切替を物理的に阻害)
- common component bypass が広範囲 (同等 UI を複数箇所で自前実装)
- type scale の説明不能な中間値 (font-size 群が単一 modular ratio から説明できない。例: 16 / 20 / 24 の中の 19px)
- grid 単位を外れた spacing の広範囲逸脱 (op-config `grid_unit` の整数倍でない値の蔓延。1〜2 箇所の optical 補正は除く)
- accent 色種類数の閾値超過 (op-config `max_accent_colors` 超過)
- semantic 色の装飾流用 (success / warning / error / info を意味と無関係な装飾に使う)

### 降格項目 (Hard blocker にしない、Notes で確認を求める)

- intra-group gap < inter-group gap の崩れ — 何が同一 group かは意味的判断
- type scale の意図的逸脱 — editorial な特大見出し等は craft の一部

## craft の到達ライン

- 機械で担保するのは floor (上記の一貫性) だけ。色の調和・タイポの呼吸・構成のリズムなど描画しないと判定できない質は
  BLOCK せず、完了報告で human 確認項目として挙げる。
- taste (洗練) はモックで合意した見た目を目標にし、自分で作り込まない。AI 単独の self-refine loop で仕上げない。判断が要る差分は `needs_human_decision` で返す。

## 採点の運用

- 各軸ごとに「どこを見て何点減点したか」を観測事実 (ファイル / token / 状態) 付きで 1 行ずつ書く
  (例: `情報の明快さと階層: 22 / 25 — secondary action 2 つが同強度 → -3`)。末尾に合計・判定・Hard blockers の有無を書く
- runtime で確認できない項目は `N/A (static-only)` とし減点しない。末尾に「runtime 検証未実施項目: X / Y」を書く。
  Hard blocker は N/A に逃がさず static 代理で判定する (`~/.claude/skills/_shared/runtime-verification.md`)
