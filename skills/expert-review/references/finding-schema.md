# finding-schema.md — review 結果の返却形式

field 一覧・enum・必須性の正本は CLI の self-describe:

```bash
op help payload review-finding --json
```

## 返却の形

spawn prompt が指定する形で返す。

- **op-run**: `{ review_round, session_id, reviews: [ ... ] }`。`reviews[]` の各要素は `verdict` (= review_result) / `pr_number` /
  `review_round` / `op_run_session_id` / `review_mode` / `reviewed_head_sha` / `review_worktree_head_sha` / `model_used` /
  `model_decision_reason` / `rationale` / `findings[]` を持つ (op-run skill の global-review-spawn §4-2-a)。
- **op-codev**: review-finding payload (`meta` + `findings`)。

どちらも controller がこれを `op review state push` (approve は `op review publish-approval`) で review state に記録する。
review-expert 自身は marker もコメントも書かない。

## finding の field

| field | 規則 |
|-------|------|
| `id` | `RVW-001` 形式 (3 桁ゼロ埋め、1 origin、重複なし) |
| `result` | `needs-fix` / `needs-specialist-review` / `blocked` |
| `severity` | `critical` / `high` / `medium` / `low` (`~/.claude/skills/_shared/severity-rubric.md`) |
| `lens` | `Security / Abuse` / `Workflow / UX` / `Test` / `Compatibility` / `Release` / `Spec` / `Refactor` (主担当 1 つ) |
| `scope` | `same-pr` / `new-issue` / `blocked` |
| `recommended_fix_expert` | needs-fix / needs-specialist-review で non-null 必須。blocked は null 可。`review-expert` / `ux-ui-audit-expert` 不可 |
| `requires_post_check` | `ux-ui-audit-expert` / `security-expert` / `null` (省略せず null を明示) |
| `summary` / `file` / `evidence` | 問題 1 行 / 主対象ファイル / 根拠 (base・Issue・diff の file:line)。op-run が PR コメントと state に転記する |
| `reclassified_from` / `reclassified_to` / `reclassification_reason` | 再分類したときだけ 3 つ揃えて入れる |

op-run では verify 結果として `detected_by_lenses` / `verify_verdict` も付ける。
推奨方針は `summary` / `evidence` に短く書き、具体コードは書かない。

## 集約ルール

全体 `review_result` は finding 単位 `result` の最重値:

```text
blocked > needs-specialist-review > needs-fix > approve
```

approve のとき blocking (Critical/High) な finding は 0 件。Medium/Low の非 blocking finding は follow-up 候補として含めてよい
(CO が `approve_with_followup` として follow-up Issue にする)。needs-fix / needs-specialist-review / blocked は 1 件以上。

## reclassification metadata

planned expert (特に `release-expert`) に誤分類された finding を active expert または `needs_human_decision` に再分類したときだけ
`reclassified_*` を記録する。fallback ではなく再分類の audit trail であり、`recommended_fix_expert` には再分類後の値を入れる。
