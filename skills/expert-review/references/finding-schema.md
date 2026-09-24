# finding-schema.md — review 結果の返却形式

field 一覧・enum・必須性・集約ルールの正本は CLI の self-describe:

```bash
op help payload review-finding --json
```

## 返却の形

spawn prompt が指定する形で返す。

- **op-run**: `{ review_round, session_id, reviews: [ ... ] }`。`reviews[]` の各要素は `verdict` (= review_result) / `pr_number` /
  `review_round` / `op_run_session_id` / `review_mode` / `reviewed_head_sha` / `review_worktree_head_sha` / `model_used` /
  `model_decision_reason` / `rationale` / `findings[]` を持つ (op-run skill の global-review-spawn §4-2-a)。
- **op-codev**: review-finding payload (`meta` + `findings`)。

どちらも controller が `op review state push` (approve は `op review publish-approval`) で review state に記録する。
review-expert 自身は marker もコメントも書かない。

## finding の field (CLI に無い規則だけ)

| field | 規則 |
|-------|------|
| `recommended_fix_expert` | needs-fix / needs-specialist-review で non-null 必須。blocked は null 可。選び方は `lens-catalog.md`「recommended_fix_expert の提案」 |
| `requires_post_check` | 省略せず null を明示する |
| `summary` / `file` / `evidence` | 問題 1 行 / 主対象ファイル / 根拠 (base・Issue・diff の file:line)。op-run が PR コメントと state に転記する |
| `detected_by_lenses` / `verify_verdict` | op-run の reviews[] のみ。adversarial-verify の結果 |

推奨方針は `summary` / `evidence` に短く書き、具体コードは書かない。

approve に含めた Medium / Low の非 blocking finding は follow-up 候補として PR コメントと ClusterSummary の `followup_findings` に載る。
起票はしない (人間判断)。

再分類 (`reclassified_from` / `reclassified_to` / `reclassification_reason`) の条件は `handoff-boundaries.md` §7-2。
