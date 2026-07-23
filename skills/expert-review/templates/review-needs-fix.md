# review-needs-fix.md — needs-fix 時の PR コメント雛形

> **本テンプレの OP-managed 節は controller (ClusterOrchestrator、`op-run/references/global-review-spawn.md` §4-2-b) が投稿する際の本文雛形** — OP-managed の review-expert は構造化返却のみを行い、自身では `gh pr comment` しない (ADR-0011 決定6 / ADR-0016)。

<!--
機能概要: needs-fix 判定時に PR へ投稿されるコメントの雛形。
作成意図: 3 条件 AND チェックリストと finding block を必ず含むようにし、
         同 PR / 単一 expert / 既知パターンが満たされるケースに限定する。
注意点: 1 条件でも欠ける場合は needs-specialist-review に倒す。本テンプレは 3 条件 AND が
       全部満たされる場合のみ使用する。
-->

## 投稿モード (必読)

- **OP-managed Mode (op-run フェーズ4)**: 「OP-managed 投稿本文の雛形」節は **ClusterOrchestrator が §4-2-b で構造化返却 (verdict + findings) から組み立て、Marker Publish Validate を通して 1 回だけ投稿する**。review-expert は本節のコマンドを自身で実行しない。canonical `<!-- op-review-meta -->` が op-run の Review Fix Loop の起点になる
- **Direct Mode (review-expert を skill 直接実行)**: 「OP-managed 投稿本文の雛形」節を **絶対に使わない**。`<!-- op-review-meta -->` を出すと provenance 偽装になり、op-run / op-merge を不正に動かす可能性がある。ユーザーが PR コメント投稿を明示許可した場合のみ「Direct Mode 投稿コマンド」節 (`<!-- op-review-report -->` マーカ) を使う。許可前は判定結果と finding を会話に提示するだけに留める

## OP-managed 投稿本文の雛形 (ClusterOrchestrator §4-2-b が投稿 — review-expert は実行しない)

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
review_result: needs-fix
reviewed_head_sha: ${REVIEWED_SHA}
reviewed_at: $(date -Iseconds)
reviewer: review-expert
review_round: ${REVIEW_ROUND}
max_review_fix_rounds: 2
global_review_expert: review-expert
review_comment_origin: op-run
op_run_session_id: ${OP_RUN_SESSION_ID}
review_worktree_head_sha: ${REVIEW_WT_HEAD_SHA}

## 🔧 レビュー結果: 修正必要 (needs-fix)

3 条件 AND で needs-fix と判定:
- [x] same-pr 内で修正できる
- [x] 単一 expert で完結する
- [x] 既知パターンの修正である

### Findings

<!-- op-review-finding
id: RVW-<3 桁連番。例: RVW-001, RVW-002, RVW-003>
result: needs-fix
severity: critical | high | medium | low
lens: Security / Abuse | Workflow / UX | Test | Compatibility | Release | Spec | Refactor
scope: same-pr
recommended_fix_expert: <apply expert 名 (non-null 必須。review-expert / ux-ui-audit-expert は不可)>
requires_post_check: <ux-ui-audit-expert | security-expert | null>
reclassified_from: <元の誤分類 expert 名 | null。通常 finding では省略可>
reclassified_to: <再分類後の active expert 名 | needs_human_decision | null。通常 finding では省略可>
reclassification_reason: <再分類理由 1 行 | null。通常 finding では省略可>
-->

【問題】
<観測した事実を 1 行で>

【根拠】
<変更前ファイル / Issue / diff のどこに証拠があるか。file path:line を含める>

【推奨方針】
<op-run / apply expert が次にとるべき action を 1-3 行で。具体コードは書かない>

(複数 finding を出す場合は、上記 `<!-- op-review-finding ... -->` block を実 finding 数だけ繰り返す。
 連番は **3 桁ゼロ埋めの `RVW-001`, `RVW-002`, `RVW-003`, ...** 形式で 1 origin で重複なく付番すること。
 `RVW-1` のような 1 桁形式は使わない (canonical schema は finding-schema.md / pr-templates.md と完全一致))

---

op-run がこの PR に \`pro-review-needs-fix\` ラベルを付与し、
判定優先順位 1-8 に従って specialist expert に再委任する想定です (op-merge 対象外)。

---
🤖 review-expert による独立 global review (op-run)
EOF
)"
```

## Direct Mode 投稿コマンド (ユーザー明示許可時のみ)

Direct Mode では `<!-- op-review-report -->` マーカで投稿する。canonical `<!-- op-review-meta -->`
は出さない。**op-run の Review Fix Loop には組み込まれない参考意見** であることを本文で明記する。

```bash
REVIEWED_SHA=$(git rev-parse HEAD)

gh pr comment <pr-number> --body "$(cat <<EOF
<!-- op-review-report -->
report_result: needs-fix
reviewed_head_sha: ${REVIEWED_SHA}
reviewed_at: $(date -Iseconds)
reviewer: review-expert
report_origin: direct

## 🔧 レビュー結果 (Direct Mode / 参考意見): 修正必要

review-expert を Direct Mode で実行した参考レビューです。
**op-run / op-merge の自動継続には使用されません** (canonical op-review-meta を出さない設計)。
正式な Review Fix Loop に組み込みたい場合は op-run フェーズ4 で再 review してください。

### Findings (参考)

<!-- op-review-finding-direct
id: RVW-<3 桁連番>
result: needs-fix
severity: critical | high | medium | low
lens: <7 lens のいずれか>
scope: same-pr
recommended_fix_expert: <expert 名>
requires_post_check: <ux-ui-audit-expert | security-expert | null>
-->

【問題】
<観測した事実>

【根拠】
<file path:line>

【推奨方針】
<次の action>

---
🤖 review-expert による Direct Mode review (参考意見)
EOF
)"
```

Direct Mode では finding マーカも `<!-- op-review-finding-direct -->` にすることで、
op-run の finding 抽出 (4.5-2-pre が `<!-- op-review-finding -->` を対象にする) に
混入しないようにする。

## 投稿前のチェック (必須)

needs-fix を出す前に以下をすべて満たすことを確認:

- [ ] **same-pr 内で修正できる**: 元 Issue の scope_in に含まれ、PR の touch 範囲で完結
- [ ] **単一 expert で完結する**: 修正 expert が一意に決まる (複数 expert の協調が不要)
- [ ] **既知パターンの修正である**: lens-catalog.md の典型 finding 例に該当 / pattern catalog に根拠あり

1 つでも欠けるなら `review-needs-specialist-review.md` を使う。

## severity の指針 (重要)

review-expert の finding は原則 **High / Critical に寄せる**。Medium 以下は通常出さない
(merge blocker 性が薄い指摘で needs-fix を増やすと Review Fix Loop が消耗するため)。

例外として **Medium が許容されるのは Spec / Refactor lens の "PR の品質要件未充足"** のみ:

| lens | severity = medium が許容されるケース |
|------|----------------------------------|
| **Spec** | PR 本文の二層構造崩れ / acceptance criteria の記述漏れ / scope_in の業務視点欠落 等、`pr-templates.md` の「PR 本文の品質要件」に直接違反するもの |
| **Refactor** | PR 本文の検証記録に自動検証と回帰テストが混在する等、可読性・追跡性の品質規約違反 |

Spec / Refactor 以外で Medium 相当の指摘がある場合は finding に出さず、
コードコメントレビュー (PR 本文の "今後の課題" 節 / 別 Issue 化) として切り出す。
通常コード変更そのものへの Medium severity finding は出さない (typo / スタイル / 命名の好み等は merge blocker 化しない)。

## 投稿前のチェック (finding 単位)

各 finding が以下を満たすことを確認:

- [ ] `id` が `RVW-` + 連番で重複なし
- [ ] `severity` が canonical (critical / high / medium / low)
- [ ] `lens` が 7 lens のいずれか正式名
- [ ] `scope` が `same-pr` (needs-fix では原則 same-pr)
- [ ] `recommended_fix_expert` が active expert または planned expert (**non-null 必須**。review-expert / ux-ui-audit-expert を指定しない)
- [ ] `requires_post_check` が `ux-ui-audit-expert` / `security-expert` / `null` のいずれか
- [ ] 本文に「観測事実」「根拠 (file path:line)」「推奨方針」が含まれる
- [ ] 「可能性がある」「テストすれば分かる」等の禁句が**ない**
