# review-needs-specialist-review.md — needs-specialist-review 時の PR コメント雛形

<!--
機能概要: review-expert が needs-specialist-review 判定時に投稿する PR コメントの雛形。
作成意図: needs-fix 3 条件 AND のいずれかが欠ける場合や、修正方針判断に専門観点が必要な場合に使う。
         即修正ではなく specialist 判断 handoff であることを明示する。
注意点: specialist は finding の妥当性 / 影響範囲 / 修正方針 / same-pr 可否を判断するだけ。
       実際の修正は specialist の判断後に op-run が apply expert に再委任する。
-->

## 投稿モード (必読)

- **OP-managed Mode (op-run フェーズ4 から spawn)**: 「OP-managed 投稿コマンド」節を使う。canonical `<!-- op-review-meta -->` を投稿し、op-run の specialist handoff の起点になる
- **Direct Mode (review-expert を skill 直接実行)**: 「OP-managed 投稿コマンド」節を **絶対に使わない**。`<!-- op-review-meta -->` を出すと provenance 偽装になる。ユーザーが PR コメント投稿を明示許可した場合のみ「Direct Mode 投稿コマンド」節 (`<!-- op-review-report -->` マーカ) を使う

## OP-managed 投稿コマンド (gh CLI、op-run フェーズ4 専用)

```bash
# REVIEW_ROUND は op-run が spawn 前に必ずセットして渡す。未指定なら fail-fast
# (default で 1 に倒すと Review Fix Loop の round 管理が壊れるため。詳細は op-run/SKILL.md フェーズ4-2-pre 参照)
: "${REVIEW_ROUND:?REVIEW_ROUND is required. op-run must export computed review_round before invoking this template.}"
# provenance: op-run controller が必ず実 session id をセットする。未指定 / unknown は fail-fast (op-merge gate 3i 対応)
: "${OP_RUN_SESSION_ID:?OP_RUN_SESSION_ID is required in OP-managed mode. op-run controller must export a real session id (not 'unknown').}"
if [ "$OP_RUN_SESSION_ID" = "unknown" ]; then
  echo "❌ OP-managed mode で OP_RUN_SESSION_ID=unknown は許可されません。op-run controller が払い出した値を export してください。" >&2
  exit 1
fi
: "${REVIEW_WT_HEAD_SHA:?REVIEW_WT_HEAD_SHA is required in OP-managed mode. op-run must export review worktree HEAD SHA.}"

REVIEWED_SHA=$(git rev-parse HEAD)

gh pr comment <pr-number> --body "$(cat <<EOF
<!-- op-review-meta -->
review_result: needs-specialist-review
reviewed_head_sha: ${REVIEWED_SHA}
reviewed_at: $(date -Iseconds)
reviewer: review-expert
review_round: ${REVIEW_ROUND}
max_review_fix_rounds: 2
global_review_expert: review-expert
review_comment_origin: op-run
op_run_session_id: ${OP_RUN_SESSION_ID}
review_worktree_head_sha: ${REVIEW_WT_HEAD_SHA}

## 🧐 レビュー結果: 専門判断が必要 (needs-specialist-review)

needs-fix 3 条件のいずれかが欠けるため specialist にエスカレートします:
- same-pr 可否が不明 / 担当 expert が一意に決まらない / 修正パターンが未知 / 専門判断後でないと修正方針を決められない

### Findings

<!-- op-review-finding
id: RVW-<3 桁連番。例: RVW-001, RVW-002, RVW-003>
result: needs-specialist-review
severity: critical | high | medium | low
lens: Security / Abuse | Workflow / UX | Test | Compatibility | Release | Spec | Refactor
scope: same-pr | new-issue | blocked
recommended_fix_expert: <specialist reviewer 候補 (non-null 必須。review-expert / ux-ui-audit-expert は不可)>
requires_post_check: <ux-ui-audit-expert | security-expert | null>
reclassified_from: <元の誤分類 expert 名 | null。通常 finding では省略可>
reclassified_to: <再分類後の active expert 名 | needs_human_decision | null。通常 finding では省略可>
reclassification_reason: <再分類理由 1 行 | null。通常 finding では省略可>
-->

【問題】
<観測した事実を 1 行で>

【なぜ specialist 判断が必要か】
<same-pr 可否不明 / 担当 expert 不明 / 修正パターン未知 / 設計判断必要 のいずれか>

【根拠】
<file path:line と diff の参照>

【推奨 handoff 先】
<recommended_fix_expert に提案した specialist と、何を判断してほしいか>

(複数 finding を出す場合は、上記 block を実 finding 数だけ繰り返す。連番は
 **3 桁ゼロ埋めの `RVW-001`, `RVW-002`, `RVW-003`, ...** 形式で 1 origin で重複なく付番すること。
 `RVW-1` のような 1 桁形式は使わない (canonical schema は finding-schema.md / pr-templates.md と完全一致)。)

---

op-run がこの PR に \`pro-review-needs-fix\` ラベルを付与し、
specialist expert に finding の妥当性 / 影響範囲 / 修正方針 / same-pr 可否を判断させる想定です。
specialist の判断結果に応じて、op-run が apply expert に再委任します。

---
🤖 review-expert による独立 global review (op-run)
EOF
)"
```

## Direct Mode 投稿コマンド (ユーザー明示許可時のみ)

Direct Mode では `<!-- op-review-report -->` マーカで投稿する。

```bash
REVIEWED_SHA=$(git rev-parse HEAD)

gh pr comment <pr-number> --body "$(cat <<EOF
<!-- op-review-report -->
report_result: needs-specialist-review
reviewed_head_sha: ${REVIEWED_SHA}
reviewed_at: $(date -Iseconds)
reviewer: review-expert
report_origin: direct

## 🧐 レビュー結果 (Direct Mode / 参考意見): 専門判断が必要

review-expert を Direct Mode で実行した参考レビューです。
**op-run / op-merge の自動継続には使用されません**。
正式な specialist handoff が必要な場合は op-run フェーズ4 で再 review してください。

### Findings (参考)

<!-- op-review-finding-direct
id: RVW-<3 桁連番>
result: needs-specialist-review
severity: critical | high | medium | low
lens: <7 lens のいずれか>
scope: same-pr | new-issue | blocked
recommended_fix_expert: <specialist 候補>
requires_post_check: <ux-ui-audit-expert | security-expert | null>
-->

【問題】<...>
【なぜ specialist 判断が必要か】<...>
【根拠】<file path:line>
【推奨 handoff 先】<...>

---
🤖 review-expert による Direct Mode review (参考意見)
EOF
)"
```

## 使い分け (needs-fix との境界)

| 状況 | 判定 |
|------|------|
| 修正方針が「明らか」(典型 finding 例に該当) で 3 条件 AND 満たす | **needs-fix** |
| 同 PR で直せるか不明 | needs-specialist-review |
| 担当 expert が複数候補 (例: security-expert か debug-expert か曖昧) | needs-specialist-review |
| 修正パターンが未知 (lens-catalog の典型に該当しない) | needs-specialist-review |
| 設計判断 / 仕様解釈 / business decision が必要 | needs-specialist-review |
| scope_out / 人間判断必要 / loop 上限超過 | **blocked** |

迷ったら needs-specialist-review に倒す。これが本 expert の安全側 default。

## specialist が判断した後の流れ (op-run 側)

specialist の判断結果に応じて op-run が分岐する:

- specialist が「same-pr で修正可能」と判断 → op-run が apply expert に再委任 (needs-fix と同等扱い)
- specialist が「scope 外」と判断 → 別 Issue 化、当該 finding は blocked
- specialist が「人間判断必要」と判断 → blocked
