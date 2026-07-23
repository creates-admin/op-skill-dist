# review-blocked.md — blocked 時の PR コメント雛形

> **本テンプレの OP-managed 節は controller (ClusterOrchestrator、`op-run/references/global-review-spawn.md` §4-2-b) が投稿する際の本文雛形** — OP-managed の review-expert は構造化返却のみを行い、自身では `gh pr comment` しない (ADR-0011 決定6 / ADR-0016)。

<!--
機能概要: blocked 判定時に PR へ投稿されるコメントの雛形。
作成意図: scope_out / 人間判断必要 / loop 上限超過 / Issue 再設計必要のいずれかに該当する場合に使う。
         op-run の自動継続を停止させ、人間判断待ちにする。
注意点: blocked は scope creep / 設計問題のサイン。具体的な解除手段 (Issue 分割 / scope 再定義 / 人間判断点) を
       finding 本文で必ず提示する。
-->

## 投稿モード (必読)

- **OP-managed Mode (op-run フェーズ4)**: 「OP-managed 投稿本文の雛形」節は **ClusterOrchestrator が §4-2-b で構造化返却 (verdict + findings) から組み立て、Marker Publish Validate を通して 1 回だけ投稿する**。review-expert は本節のコマンドを自身で実行しない。canonical `<!-- op-review-meta -->` が op-run の自動継続停止のトリガになる
- **Direct Mode (review-expert を skill 直接実行)**: 「OP-managed 投稿本文の雛形」節を **絶対に使わない**。`<!-- op-review-meta -->` を出すと provenance 偽装になる。ユーザーが PR コメント投稿を明示許可した場合のみ「Direct Mode 投稿コマンド」節 (`<!-- op-review-report -->` マーカ) を使う

## OP-managed 投稿本文の雛形 (ClusterOrchestrator §4-2-b が投稿 — review-expert は実行しない)

```bash
# REVIEW_ROUND は op-run が spawn 前に必ずセットして渡す。未指定なら fail-fast
# (loop 上限超過時は通常 3。default で 3 に倒すと初回 review が誤って 3 扱いになるため、必ず spawn 側で指定する)
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
review_result: blocked
reviewed_head_sha: ${REVIEWED_SHA}
reviewed_at: $(date -Iseconds)
reviewer: review-expert
review_round: ${REVIEW_ROUND}
max_review_fix_rounds: 2
global_review_expert: review-expert
review_comment_origin: op-run
op_run_session_id: ${OP_RUN_SESSION_ID}
review_worktree_head_sha: ${REVIEW_WT_HEAD_SHA}

## ⛔ レビュー結果: blocked (自動継続不能)

理由: <scope_out 違反 / 人間判断必要 / loop 上限超過 / Issue 再設計必要 のいずれか>

### Findings

<!-- op-review-finding
id: RVW-<3 桁連番。例: RVW-001, RVW-002, RVW-003>
result: blocked
severity: critical | high
lens: Security / Abuse | Workflow / UX | Test | Compatibility | Release | Spec | Refactor
scope: blocked | new-issue
recommended_fix_expert: <expert 名 | null (blocked のみ null 許容。review-expert / ux-ui-audit-expert は不可)>
requires_post_check: <ux-ui-audit-expert | security-expert | null>
reclassified_from: <元の誤分類 expert 名 | null。通常 finding では省略可>
reclassified_to: <再分類後の active expert 名 | needs_human_decision | null。通常 finding では省略可>
reclassification_reason: <再分類理由 1 行 | null。通常 finding では省略可>
-->

【問題】
<観測した事実を 1 行で>

【なぜ blocked か】
<scope_out / 人間判断必要 / loop 上限超過 / Issue 再設計必要 のどれか、その根拠>

【根拠】
<file path:line / Issue scope_out 該当箇所 / loop round 数 など>

【推奨対応 (人間判断点)】
<Issue 分割 / scope 再定義 / 別 Issue 化 / 設計再判断 / business decision のいずれか>

(複数 finding を出す場合は、上記 block を実 finding 数だけ繰り返す。連番は
 **3 桁ゼロ埋めの `RVW-001`, `RVW-002`, `RVW-003`, ...** 形式で 1 origin で重複なく付番すること。
 `RVW-1` のような 1 桁形式は使わない (canonical schema は finding-schema.md / pr-templates.md と完全一致)。)

---

op-run がこの PR に \`pro-review-blocked\` ラベルを付与し、自動継続を停止する想定です。
人間判断待ちのため、Issue 分割 / scope 再定義 / 設計判断のいずれかが必要です。

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
report_result: blocked
reviewed_head_sha: ${REVIEWED_SHA}
reviewed_at: $(date -Iseconds)
reviewer: review-expert
report_origin: direct

## ⛔ レビュー結果 (Direct Mode / 参考意見): blocked

review-expert を Direct Mode で実行した参考レビューです。
**op-run / op-merge の自動継続には使用されません**。

理由: <scope_out / 人間判断必要 / Issue 再設計 等>

### Findings (参考)

<!-- op-review-finding-direct
id: RVW-<3 桁連番>
result: blocked
severity: critical | high
lens: <7 lens のいずれか>
scope: blocked | new-issue
recommended_fix_expert: <expert 名 | null>
requires_post_check: <ux-ui-audit-expert | security-expert | null>
-->

【問題】<...>
【なぜ blocked か】<...>
【根拠】<file path:line>
【推奨対応 (人間判断点)】<...>

---
🤖 review-expert による Direct Mode review (参考意見)
EOF
)"
```

## blocked の典型ケース

| ケース | 例 |
|--------|---|
| **scope_out** | 元 Issue の scope_out に明確に入る修正が必要 / scope_out として除外されたファイルに侵入が必要 |
| **人間判断必要** | 仕様変更 / 設計再判断 / business decision が必要 / acceptance criteria の解釈が複数候補 |
| **規定外 spawn** | review_round > max_review_fix_rounds + 1 (= 4 以上) で起動された (本来 op-run 4-2-pre の bash gate で停止しているはず) |
| **Issue 再設計必要** | 元 Issue の scope を分割 / 再定義しないと修正できない / Issue 自体が ambiguity を含む |
| **修正不能** | 既存設計の制約で修正できない (技術的制約 / 互換性制約) |
| **別 Issue 化必要** | 修正範囲が PR の scope を完全に超えている (post-check / specialist が「別 Issue 化」と判断) |

> **review-expert の責務外**: 「最終許可 round (= 3) で needs-fix / needs-specialist-review が残った」
> ケースは review-expert 側で blocked にしてはいけない。round 3 でも通常通り判定を返し、
> Review Fix Loop 上限超過の自動継続停止は **op-run controller (フェーズ4.5-1)** が処理する。
> review-expert が勝手に blocked に倒すと、op-run の集約ロジックと重複し state が破綻する。

## review_round と loop 上限の扱い

review-expert は spawn 時に `review_round` を受け取る。許可される review_round は
`1..(max_review_fix_rounds + 1) = 1..3`。

- round 1: 初回 review
- round 2: 1 回目の Review Fix Loop 後の re-review
- round 3: 2 回目の Review Fix Loop 後の **final re-review** (最終許可 round。通常通り判定する)
- round 4 以上: 規定外 spawn、**即 blocked**

最終許可 round (= 3) で `needs-fix` / `needs-specialist-review` が残った場合に自動継続を停止し
blocked に倒すのは **op-run (フェーズ4.5-1)** の責務。review-expert 自身は通常通り判定を返す。

3 回目以降の fix loop は scope creep / 設計問題のサイン。Issue 分割や scope 再定義を人間判断で行う。

## 投稿前のチェック

- [ ] 理由が「scope_out / 人間判断必要 / 規定外 spawn / Issue 再設計必要 / 修正不能 / 別 Issue 化必要」のいずれか
- [ ] 各 finding に「なぜ blocked か」の明示根拠が含まれる
- [ ] 「推奨対応 (人間判断点)」が具体的 (Issue 分割 / scope 再定義 / 業務判断ポイント等)
- [ ] **round 3 で needs-fix / needs-specialist-review が残ったケースは review-expert が blocked にしない** (op-run controller の責務)
- [ ] 規定外 spawn (review_round > 3) のときは理由欄にその旨を明記
- [ ] 「可能性がある」「テストすれば分かる」等の禁句がない
