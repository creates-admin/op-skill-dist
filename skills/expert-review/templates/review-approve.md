# review-approve.md — approve 時の PR コメント雛形

> **本テンプレの OP-managed 節は controller (ClusterOrchestrator、`op-run/references/global-review-spawn.md` §4-2-b) が投稿する際の本文雛形** — OP-managed の review-expert は構造化返却のみを行い、自身では `gh pr comment` しない (ADR-0011 決定6 / ADR-0016)。

<!--
機能概要: approve 判定時に PR へ投稿されるコメントの雛形。
作成意図: ~/.claude/skills/_shared/pr-templates.md の canonical テンプレに追従しつつ、
         controller (ClusterOrchestrator) が marker 組立・投稿するときに参照する本文雛形。
         Direct Mode のユーザー許可後の参考投稿 (op-review-report) にも使う。
注意点: canonical schema は pr-templates.md を正とする。本ファイルは作業用の写し。
       label 操作は op-run の責務。コメント本文は "op-run が pro-reviewed を付与する想定" と
       読める表現にする (review-expert が gh pr edit を直接実行することは禁止)。
-->

## 投稿モード (必読)

- **OP-managed Mode (op-run フェーズ4)**: 「OP-managed 投稿本文の雛形」節は **ClusterOrchestrator が §4-2-b で組み立てて投稿する**。review-expert は verdict + findings を構造化返却するだけで、本節のコマンドを自身で実行しない。canonical `<!-- op-review-meta -->` は controller が Marker Publish Validate (`op core marker-lint --strict`) を通して 1 回だけ投稿し、op-merge gate の対象になる。approve は通常 `op review publish-approval` (Issue #756) が marker 組立 + 投稿 + label 付与を atomic に行うため、本雛形は本文構造の参照用
- **Direct Mode (review-expert を skill 直接実行)**: 「OP-managed 投稿本文の雛形」節を **絶対に使わない**。`<!-- op-review-meta -->` を出すと provenance を偽装したことになり、op-merge gate を不正に通す可能性がある。ユーザーが PR コメント投稿を明示許可した場合のみ「Direct Mode 投稿コマンド」節 (`<!-- op-review-report -->` マーカ) を使う。許可前は判定結果と finding を会話に提示するだけに留める

## OP-managed 投稿本文の雛形 (ClusterOrchestrator §4-2-b が投稿 — review-expert は実行しない)

```bash
# REVIEW_ROUND は op-run が spawn 前に必ずセットして渡す。未指定なら fail-fast
# (default で 1 に倒すと Review Fix Loop の round 管理が壊れるため。詳細は op-run/SKILL.md フェーズ4-2-pre 参照)
: "${REVIEW_ROUND:?REVIEW_ROUND is required. op-run must export computed review_round before invoking this template.}"
# provenance: op-run controller が必ず実 session id をセットする。未指定 / unknown は fail-fast
# (op-merge gate 3i で同等チェックがあるため、ここで止めないと無効コメントが PR に残る)
: "${OP_RUN_SESSION_ID:?OP_RUN_SESSION_ID is required in OP-managed mode. op-run controller must export a real session id (not 'unknown').}"
if [ "$OP_RUN_SESSION_ID" = "unknown" ]; then
  echo "❌ OP-managed mode で OP_RUN_SESSION_ID=unknown は許可されません。op-run controller が払い出した値を export してください。" >&2
  exit 1
fi
# review worktree HEAD SHA も OP-managed では fail-fast (op-run が 4-2 で必ず export する)
: "${REVIEW_WT_HEAD_SHA:?REVIEW_WT_HEAD_SHA is required in OP-managed mode. op-run must export review worktree HEAD SHA.}"

REVIEWED_SHA=$(git rev-parse HEAD)

gh pr comment <pr-number> --body "$(cat <<EOF
<!-- op-review-meta -->
review_result: approve
reviewed_head_sha: ${REVIEWED_SHA}
reviewed_at: $(date -Iseconds)
reviewer: review-expert
review_round: ${REVIEW_ROUND}
max_review_fix_rounds: 2
global_review_expert: review-expert
review_comment_origin: op-run
op_run_session_id: ${OP_RUN_SESSION_ID}
review_worktree_head_sha: ${REVIEW_WT_HEAD_SHA}

## ✅ レビュー結果: 問題なし

review-expert の 7 lens (Security/Abuse, Workflow/UX, Test, Compatibility, Release, Spec, Refactor) で確認済み。
独立 reviewer として PR 全体を監査し、merge blocker は検出されませんでした。

### この変更でどうなるか
<技術用語を避けた 1〜3 文の説明>

### チェック内容
- [x] Security / Abuse: 入力検証・認可・IPC・file IO・shell の攻撃面
- [x] Workflow / UX: 画面遷移・状態復帰・操作破壊・a11y 波及
- [x] Test / Regression: 変更に対する回帰検証
- [x] Compatibility: 保存データ・migration・rollback
- [x] Release: 配布・updater・installer・artifact
- [x] Spec: Issue 要求・acceptance criteria・scope
- [x] Refactor: 構造劣化・命名・配置

### マージ後の確認ポイント
<具体的に動作確認すべき項目があれば記載。なければこの節は省略可>

op-run がこの PR に \`pro-reviewed\` ラベルを付与する想定です。

---
🤖 review-expert による独立 global review (op-run)
EOF
)"
```

## Direct Mode 投稿コマンド (ユーザー明示許可時のみ)

Direct Mode では `<!-- op-review-report -->` マーカで投稿する。canonical `<!-- op-review-meta -->`
は出さない (op-merge gate を不正に通さないため)。`review_round` / `op_run_session_id` /
`review_comment_origin` 等の OP 管理メタは記録しない。

```bash
REVIEWED_SHA=$(git rev-parse HEAD)

gh pr comment <pr-number> --body "$(cat <<EOF
<!-- op-review-report -->
report_result: approve
reviewed_head_sha: ${REVIEWED_SHA}
reviewed_at: $(date -Iseconds)
reviewer: review-expert
report_origin: direct

## ✅ レビュー結果 (Direct Mode / 参考意見)

review-expert を Direct Mode で実行した参考レビューです。
**op-run / op-merge の自動継続には使用されません** (canonical op-review-meta を出さない設計)。

### この変更でどうなるか
<技術用語を避けた 1〜3 文の説明>

### チェック内容
- [x] Security / Abuse: 入力検証・認可・IPC・file IO・shell の攻撃面
- [x] Workflow / UX: 画面遷移・状態復帰・操作破壊・a11y 波及
- [x] Test / Regression: 変更に対する回帰検証
- [x] Compatibility: 保存データ・migration・rollback
- [x] Release: 配布・updater・installer・artifact
- [x] Spec: Issue 要求・acceptance criteria・scope
- [x] Refactor: 構造劣化・命名・配置

正式な merge 判定が必要な場合は op-run フェーズ4 で再 review してください。

---
🤖 review-expert による Direct Mode review (参考意見)
EOF
)"
```

## 注意

- HEREDOC は `<<EOF` (`<<'EOF'` ではなく) を使い、`${REVIEWED_SHA}` を展開する
- 他の `$` リテラル (例: bash パス展開) が必要な場合は `\$` でエスケープ
- `reviewed_head_sha` は判定確定の直前に取得する (op-merge の stale gate の根拠)
- `REVIEW_ROUND` は op-run が確定させる (1 origin)。未指定だと `:?` で即 fail させる
  (default で 1 に倒すと Review Fix Loop の round 管理が壊れる)
- `OP_RUN_SESSION_ID` は OP-managed Mode では必須・`unknown` 不可 (op-merge gate 3i 対応)
- `REVIEW_WT_HEAD_SHA` は OP-managed Mode では必須 (provenance 監査ログ)
- Direct Mode は `<!-- op-review-report -->` のみ。`<!-- op-review-meta -->` を絶対に出さない
- `pro-reviewed` ラベルの付与は **op-run の責務**。コメント本文は
  「op-run が付与する想定」と読める表現にする

## review_mode == light-after-security-postcheck の場合

Security/Abuse Lens は「PR 全体として新たな攻撃面が増えていないか」のみ軽く確認したことを明記する:

```diff
- [x] Security / Abuse: 入力検証・認可・IPC・file IO・shell の攻撃面
+ [x] Security / Abuse: PR 全体として新たな攻撃面が増えていないかを軽量モードで確認 (3.5-B で security-expert が深掘り再監査済み)
```
