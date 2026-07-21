<!--
duplicated_in: skills/expert-design/references/visual-quality-rubric.md
sync_policy: Hard blockers と Decision テーブルだけ両ファイルで完全一致させる。
             配点 (Score 表) は designer 側にのみ保持する (designer は self-score を出すため)。
             ux 側は score を出さず Hard blockers と Decision テーブルだけで判定するため、
             配点詳細を持たない。
             変更時の確認: Hard blockers 一覧の項目順 / Decision テーブルの 3 帯 (85+/70-84/0-69) が
             両ファイルで一致しているか diff で確認する。配点に変更がある場合は designer 側のみ更新。
-->

# Visual Quality Rubric (ux-ui-audit-expert 視点)

UI design 完成度の合格判定に使う rubric。
ux-ui-audit-expert は **第三者採点** として gate / post-check で判定するが、
**score より Hard blockers の有無を優先** する立場のため、本ファイルでは
配点詳細を持たず **Hard blockers + Decision テーブル** のみを保持する。

配点 (25/25/20/15/15、合格 72) は designer-expert (`expert-design/references/visual-quality-rubric.md`) に
存在する。designer の self-score 値が PR 等で参照されたときは、向こう側の rubric を読みに行く。

## ux-ui-audit-expert の使い方

- **gate** (op-architect): Design Plan が Hard blockers をすべて回避しているかを確認
- **post-check** (op-run): 実装が Hard blockers をすべて回避しているかを確認
- designer の self-score (85 未満なら redesign / 70 未満なら BLOCK) を参考にしつつも、
  **Hard blockers が 1 つでも残るなら score を問わず BLOCK**

---

## Decision (designer の self-score を参照する場合の対応)

| Score | 判定 | gate / post-check の対応 |
|---|---|---|
| 85–100 | ship candidate | PASS (Hard blockers が無いことを確認した上で) |
| 70–84 | revise | PASS_WITH_NOTES (修正 Notes 付与、Hard blockers が無いこと前提) |
| 0–69 | redesign | BLOCK (Design Plan 再作成 / 実装やり直し) |

> ux-ui-audit-expert は score を計算しない。designer の自己採点が PR に貼られていれば参考にし、
> 85 未満なら BLOCK 候補として精査する (post-check-criteria.md の自己点検参照)。

---

## Hard blockers (BLOCK 絶対条件)

以下が **1 つでもある場合**、score を上回っていても **BLOCK**。
ux-ui-audit-expert は score より Hard blockers を優先する。

### UX/UI Hard blockers (本エージェントが BLOCK してよい)

- primary task が不明 (この画面で何を完了するか説明できない)
- Applicable States が未定義 / 未実装 (UI 種別に該当する state が `recovery-and-states.md` 早見表に対し欠落、`not_applicable_reason` 説明もなし)
- error / loading / empty が該当 UI で未実装 (該当しない UI に強要しない)
- contrast 不足 (本文 4.5:1 未満 / 非テキスト UI 3:1 未満)
- focus が見えない (`:focus-visible` 未実装、装飾で消している)
- keyboard 到達不可 (`<div>` に `@click` を付けて `<button>` を使っていない 等)
- 危険操作が保護されていない (削除に確認なし / 不可逆操作に Undo なし)
- style / animation / layout 変更により UX または a11y が退化している (focus / contrast / keyboard / 状態可視性を直接破壊)

ux-ui-audit-expert が特に重視するのは以下 (Invariants との対応):

| Hard blocker | Invariant | severity |
|--------------|-----------|----------|
| Applicable State 未実装 | 2 | Critical (focus / failure 系) / High (empty / disabled 系) |
| error / loading / empty 未実装 | 2, 3 | Critical (復帰手段がないなら) |
| focus が見えない / keyboard 到達不可 | 7 | Critical (a11y A 違反) |
| contrast 不足 | 8 | High (a11y AA 違反) |
| 危険操作が保護されていない | 4 | Critical |

### Designer-only blockers (UX 側では BLOCK しない)

以下は designer-expert (`expert-design`) の Hard blockers。
ux-ui-audit-expert は **それらが UX / a11y を直接破壊している場合のみ** UX/UI Hard blockers 側で BLOCK する。

- token bypass が広範囲 (5 箇所以上、または theme 切替を物理的に阻害)
- common component bypass が広範囲 (同等 UI を複数箇所で自前実装)
- 視覚階層の崩壊 / design system 逸脱
- type scale の説明不能な中間値 (font-size 群が単一 modular ratio から説明できない中間値を含む / 例: 16 / 20 / 24 の中に唐突な 19px) — ADR-0013 決定I craft floor
- grid 単位を外れた spacing の広範囲逸脱 (spacing が op-config `grid_unit` の整数倍でない値を広範囲に散らす / 1〜2 箇所の optical 補正は除く) — ADR-0013 決定I craft floor
- accent 色種類数の閾値超過 (accent (装飾) 色の種類数が op-config `max_accent_colors` を超え画面が色で騒がしい) — ADR-0013 決定I craft floor
- semantic 色の装飾流用 (success / warning / error / info を意味と無関係な装飾用途に流用している) — ADR-0013 決定I craft floor

> 例: hard-coded color が contrast 不足を引き起こしている場合は、上の UX/UI Hard blockers 「contrast 不足」で BLOCK する。token bypass そのものは designer-expert の post-check で BLOCK される。
> 同様に craft floor 4 項目 (type scale / spacing grid / accent / semantic 流用、ADR-0013 決定I) も designer-expert の Hard blocker。ux-ui-audit-expert は **それらが UX / a11y を直接破壊している場合のみ** BLOCK し、craft 規律違反そのものの BLOCK 権は designer 側 post-check が持つ。
> craft floor の正本一覧 (4 項目 + 降格 2 項目) と craft 規律の方法論・Tier は `expert-design/references/visual-quality-rubric.md` Hard blockers 節 + `visual-craft-tiers.md` を参照。

---

## 採点テンプレート (gate / post-check 用)

ux-ui-audit-expert は **score を出さず Hard blockers の点呼** で判定する。
Markdown 出力例:

```markdown
## UX/UI Audit (ux-ui-audit-expert 第三者判定)

### Hard blockers 点呼

- [x] primary task が明確 (header の「求人を作成」CTA で確認 OK)
- [ ] **状態が網羅されている** — `features/job-board/JobList.vue` に empty state 未実装
- [x] error / loading 実装あり (skeleton + retry 確認 OK)
- [x] focus visible (`:focus-visible` 全 button に適用)
- [x] keyboard 到達 (`<button>` 使用、`<div @click>` 残存なし)
- [ ] **contrast** — `components/Tag.vue` の `#999` 文字色が白背景で 2.85:1 (AA 違反)
- [x] 危険操作保護 (削除に ConfirmDialog + Undo)

### designer self-score 参照
- designer 自己採点: 78 / 100 (revise 帯)

### 判定: BLOCK
- Hard blockers 2 件残存 (empty state 未実装、Tag.vue contrast 不足)
- score が revise 帯であることも合わせて再修正必須
```

---

## designer-expert との違い

- designer-expert は **自己採点** に使う (architect で目標宣言、run 後に実 score)
- ux-ui-audit-expert は **第三者判定** に使う (gate / post-check で BLOCK 判定)
- 両 agent が **同じ Hard blockers / 同じ Decision テーブル** を読むことで合格ラインがずれない
- 配点詳細は designer 側にのみ存在し、ux 側は score を作らない (sync コストを下げる)
