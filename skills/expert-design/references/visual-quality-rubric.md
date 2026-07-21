<!--
duplicated_in: skills/expert-ux-ui-audit/references/visual-quality-rubric.md
sync_policy: Hard blockers と Decision テーブルだけ両ファイルで完全一致させる。
             配点 (Score 表) は本ファイル (designer 側) にのみ保持する。ux-ui-audit-expert は
             score を出さず Hard blockers と Decision テーブルだけで判定するため、ux 側に配点を
             重複保持しない (sync コスト削減)。
             変更時の確認:
               (a) Hard blockers 一覧の項目順 / Decision テーブルの 3 帯 (85+/70-84/0-69) が両ファイルで一致
               (b) 配点 (本ファイル固有) を変更した場合、ux 側の更新は不要だが、Decision テーブルの帯境界を
                   触ったなら ux 側も合わせる
             片方だけ Decision を変えると ux gate と designer self-score の合格ラインがずれて
             Run ↔ post-check ループが閉じなくなる。
-->

# Visual Quality Rubric

UI design 完成度を 100 点で評価する rubric。
designer-expert の architect / run、ux-ui-audit-expert の gate / post-check で
**両 agent が共通の合格ライン** を担保するために使う (この理由で expert-ux-ui-audit 側にも重複保持する)。

## designer-expert の使い方

- architect で **目標 score を宣言** する
- run 後に **実 score を自己採点** する
- 85 未満なら再修正、Hard blockers が残っていれば PASS しない

---

## Score

| 評価軸 | 配点 | 合格ライン | 見るポイント |
|---|---:|---:|---|
| 情報の明快さと階層 | 25 | 18 | 主タスクが一目で分かるか、主要 / 二次情報が整理されているか |
| 操作導線とエラー予防 | 25 | 18 | 次アクション、状態、失敗時の復帰、危険操作の保護があるか |
| design system 準拠 | 20 | 14 | token / component / pattern が守られ、ad-hoc 値がないか |
| 密度と視認性 | 15 | 10 | 高密度でも読めるか、比較しやすいか、余白が意味を持つか |
| accessibility | 15 | 12 | contrast、focus、keyboard、状態表現、読み上げ配慮があるか |

合計 100 点 / 合格ライン合算 72 点。

---

## Decision

| Score | 判定 |
|---|---|
| 85–100 | ship candidate (そのまま出荷候補) |
| 70–84 | revise (差し戻し / 修正後再評価) |
| 0–69 | redesign (Design Plan からやり直し) |

---

## Hard blockers

以下が **1 つでもある場合**、原則として PASS しない。
score を上回っていても、blocker は **必ず先に解消** する。

- primary task が不明 (この画面で何を完了するか説明できない)
- 該当する state が見えない (Design Plan の Applicable States に列挙された state — 例: 一覧画面の loading / failure / empty、フォームの disabled / focus — のいずれかが不在。6 状態を機械的に全要求するわけではない)
- error / loading / empty が未実装
- token bypass が広範囲 (5 箇所以上、または theme 切替を物理的に阻害)
- common component bypass が広範囲 (同等 UI を複数箇所で自前実装)
- contrast 不足 (本文 4.5:1 未満 / 非テキスト UI 3:1 未満)
- focus が見えない (`:focus-visible` 未実装、装飾で消している)
- keyboard 到達不可 (`<div>` に `@click` を付けて `<button>` を使っていない 等)
- 危険操作が保護されていない (削除に確認なし / 不可逆操作に Undo なし)
- type scale の説明不能な中間値 (font-size 群が単一 modular ratio から説明できない中間値を含む / 例: 16 / 20 / 24 の中に唐突な 19px)
- grid 単位を外れた spacing の広範囲逸脱 (spacing が op-config `grid_unit` の整数倍でない値を広範囲に散らす / 1〜2 箇所の optical 補正は除く)
- accent 色種類数の閾値超過 (accent (装飾) 色の種類数が op-config `max_accent_colors` を超え画面が色で騒がしい)
- semantic 色の装飾流用 (success / warning / error / info を意味と無関係な装飾用途に流用している)

#### craft floor の降格項目 (BLOCK でなく PASS_WITH_NOTES の Notes 対象、ADR-0013 決定I)

以下は escape hatch がある (静的に違反と確定できない) ため Hard blocker に含めない。
craft 観察項目 / Notes 注釈要求に留める (escape hatch のある項目を floor と呼ばない)。
craft 規律の方法論・Tier は `visual-craft-tiers.md` を参照 (本節は floor の Hard blocker 正本)。

- intra-group gap < inter-group gap の崩れ — 何が同一 group かは意味的判断で静的確定不能。Notes で「この群構造で正しいか確認」と注釈要求する
- type scale の意図的逸脱 — editorial な特大見出し等は craft の一部で、逸脱が常に誤りとは言えない。Notes で「意図的逸脱か確認」と注釈要求する

---

## 採点の運用

- **agent が自己採点する** → architect で「目標 score」を宣言、run 後に「実 score」を出す
- 観測事実 (該当ファイル / 該当 token / 該当 state) を **根拠として書き添える**
- 数値は雰囲気で付けない。各軸ごとに「どこを見て何点減点したか」を 1 行ずつ説明する

### runtime 検証手段がない環境での採点 (CLI / agent 環境)

詳細な手段マトリクス (検証対象 → runtime 手段 → static 代理) は `~/.claude/skills/_shared/runtime-verification.md` に集約。
本節は採点運用に絞った要約。

agent によっては Playwright / dev server / browser を使えない場合がある (CLI のみ、CI 内など)。
このとき以下の項目は **runtime 検証必須** のため、静的観察だけでは採点不能:

- accessibility 軸の `focus 視認性` (実描画でのリング有無 / contrast 計算)
- accessibility 軸の `screen reader 読み上げ順序`
- 密度と視認性軸の `スクロール時の sticky 挙動`

採点フォーマット:

- 静的観察できる項目 (token / aria 属性 / `:focus-visible` の CSS 記述有無 / `<button>` 要素の使用) は通常採点
- 静的に判断できない項目は **`N/A (static-only)`** と書き、減点しない
- 採点末尾に「runtime 検証未実施項目: X / Y」を明示
- post-check 側 (ux-ui-audit-expert) は runtime 検証が可能なら本採点で再評価する

例:

```text
- accessibility: 13 / 15 (うち N/A: 2 項目 = focus 視認性 / SR 読み上げ順)
  - contrast: token 値で 4.5:1 以上を確認 OK
  - keyboard: `<button>` 要素使用 OK、`@click` on `<div>` なし
  - aria: 全 icon button に `aria-label` 確認 OK
  - focus 視認性: N/A (static-only) — `:focus-visible:ring-2` の CSS 記述ありを確認
  - SR 読み上げ順: N/A (static-only) — DOM 順序は宣言通り
```

注意: **Hard blockers (focus が見えない / contrast 不足 / keyboard 不可) を runtime 不可で N/A に逃げてはいけない**。
これらは静的に観測できる代理 (CSS 記述 / 要素種別 / token 値) で必ず判定する。runtime 不可だからといって blocker を素通りさせない。

---

## 採点テンプレート

```markdown
## Visual Quality Score

- 情報の明快さと階層: 22 / 25
  - 主タスクは header で明示、metadata は弱コントラスト分離 OK
  - secondary action 2 つが同強度 → -3
- 操作導線とエラー予防: 23 / 25
  - Applicable States (該当する state のみ。例: 一覧画面なら loading / failure / empty / focus) を実装
  - destructive action は danger token + 確認 dialog
  - undo 未実装 → -2
- design system 準拠: 18 / 20
  - token / component を再利用、hard-coded color なし
  - 1 箇所だけ独自 padding → -2
- 密度と視認性: 13 / 15
  - 行高 36px、column 右寄せ、固定ヘッダ OK
  - empty state の余白が広すぎ → -2
- accessibility: 14 / 15
  - contrast / focus / keyboard / aria すべて実装
  - icon-only button に `aria-label` 1 箇所欠 → -1

合計: 90 / 100 → ship candidate

Hard blockers: なし
```
