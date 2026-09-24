---
name: expert-ux-ui-audit
description: ux-ui-audit-expert に preload される方法論。
---

# expert-ux-ui-audit: ux-ui-audit-expert の知識ベース

ユーザーが迷わず・安全に・目的を達成できるかだけを見る。誰が何を完了する画面かを先に把握し、
観測事実だけを語る。`broken_invariant` (`references/usability-invariants.md` の 1〜10) を示せない「使いにくそう」は出さない。
「異常なし」を報告できる。何か言うために言わない。

## 判断優先順位

1. Issue / task 指示 / デザインモック
2. project 固有 design system (expert-design skill の `project-design-system-lookup.md` の Lookup order)
3. 実コード上の token / component / theme
4. 本 skill (`references/`)

WCAG は絶対基準として扱い、優先順位に関係なく severity を下げない (`references/a11y-checklist.md`「Severity 対応」)。
UX 心理学法則やガイドラインは判断材料であり、機械的に全適用しない。

---

## Scan Mode / Patrol Mode

1. 報告ルールは `~/.claude/skills/_shared/severity-rubric.md`「scan 報告ルール (共通)」節
2. spawn prompt の `scope_in` を Read する。project 固有 DS の所在を最初に Grep しておく
3. `references/usability-invariants.md` の 10 不変条件、`references/recovery-and-states.md`、`references/a11y-checklist.md` で audit
4. `references/scan-finding-policy.md` で起票範囲・severity・co-run 判定を確認
5. 出力は `~/.claude/skills/_shared/expert-spawn.md`「scan 出力 envelope 契約」節の envelope。0 件は `{"findings": []}`

### scan 出力 (ux-ui)

- `domain: "ux-ui"`
- `recommended_runner`: `designer-expert` (UI surface の修正) または `feature-expert` (業務ロジック・状態管理)。
  ux-ui-audit-expert 自身は指定しない
- `post_check_expert`: UI の再検証が要るなら `ux-ui-audit-expert`、不要なら `null` (security が絡む場合のみ `security-expert`)
- `blocking` / `blocking_reason`: 新規変更が既存 UX debt を悪化させる場合 `true`
- ux 固有フィールド (必須):

```json
{
  "user_goal": "求人を意図通りに整理する",
  "affected_user_flow": "求人詳細 → 削除",
  "broken_invariant": "4 (危険操作に確認または取り消し導線がある)",
  "ux_ui_failure_type": "missing_state | unclear_action | recovery_blocked | a11y_break | visual_ambiguity | workflow_mismatch"
}
```

`evidence_grade: requires_runtime` のときは `reproduction_hint` 必須。

## Post-check Mode

op-run の apply 後、PR 差分が Issue / デザインモックを満たし、使いやすさ・a11y を退化させていないかを判定する。
観点・BLOCK 条件・出力・security 起点の auxiliary post-check は `references/criteria.md`。

---

## references

| File | 内容 | 使う場面 |
|------|------|---------|
| `references/usability-invariants.md` | 10 不変条件 + bulk_group 命名 | scan / patrol / post-check |
| `references/recovery-and-states.md` | UI 種別ごとの必須状態、欠落時 severity、状態ごとの基準、危険操作の保護 | 全モード |
| `references/a11y-checklist.md` | WCAG severity 対応 / 静的に見る項目 / platform 別 / Grep パターン | 全モード |
| `references/criteria.md` | post-check の観点・BLOCK 条件・出力 | post-check |
| `references/scan-finding-policy.md` | scan / patrol の起票範囲・severity と co-run 判定 | scan / patrol |
