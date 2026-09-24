# review-contract.md — 作業冒頭の核

判定軸は `result-decision.md`、観点は `lens-catalog.md`、返却 field は `finding-schema.md`、境界は `handoff-boundaries.md`、
手順の詳細は `evidence-policy.md`、禁止事項は `agents/review-expert.md`。

## 1. mode 判定

`~/.claude/skills/_shared/invocation-mode.md` に従う。OP-managed では:

- 判定を 4 種 (approve / needs-fix / needs-specialist-review / blocked) のいずれかに閉じ、`review_result` と `reviewed_head_sha` を含む構造化結果を常に返す。
- 入力欠落は `assumptions[]` に「X が欠落、Y を仮定」と記録し、必要なら `needs_human_decision` (decision_type: "behavior") を返す。

## 2. review_mode

spawn prompt の `review_mode` を冒頭で読む。未指定は `full`。

| review_mode | 条件 (op-run が決定) | 扱い |
|-------------|---------------------|------|
| `full` | 下記以外 | 7 lens をフル監査 |
| `light-after-security-postcheck` | review state の `post_checks["security-expert"]` が PASS / PASS_WITH_NOTES | Security/Abuse lens は「PR 全体として新たな露出面が増えていないか」のみ。IPC / file IO / path / capability / shell の Issue 固有再監査はしない。他 lens はフル |
| `fix_diff_only` | Round 2+ | 渡された `fix_diff` (前 round の `reviewed_head_sha` からの差分) と `carryover_findings` を対象に、`active_lens_keys` の lens で監査 |

post-check 結果は `op review state pull --pr <N>` の `post_checks` で確認できる。

## 3. 入力 (OP-managed)

op-run の spawn 値 (op-run skill の global-review-spawn §4-2-a「spawn 値の契約」) から受け取る:

| 入力 | 用途 |
|------|------|
| `number` / `review_wt` / `review_wt_head_sha` | 対象 PR・review 用 worktree (apply とは別、controller が作成) ・`reviewed_head_sha` の根拠 |
| `review_mode` / `active_lens_keys` / `lens_bundles` | 監査範囲。`active_lens_keys: []` = 7 lens 全部 |
| `carryover_findings` / `round_base_sha` / `fix_diff` | Round 2+ のみ |
| `issues` | 関連 Issue (acceptance criteria / scope_in / scope_out / デザインモック URL) |
| `review_round` / `session_id` / `models` | round・provenance・phase 別 model |

base ref は PR の baseRef から解決する (`origin/main` をハードコードしない)。Issue に `デザインモック: <URL>` があれば
`Artifact({action:"read", url})` で見た目の目標を確認する。

## 4. 手順

正本は `evidence-policy.md` §1 (base-first evidence procedure)。HEAD が `review_wt_head_sha` と一致しなければ blocked を返し評価しない。

Read Economy (`~/.claude/skills/_shared/read-economy.md`) に加えて:

- base 側は `git show "origin/${BASE_REF}:<path>"` で必要範囲だけ取る。diff はファイル単位で取る。
- diff 確認後の current tree Read は `grep` で行番号を特定し、`offset` / `limit` で前後だけ読む。

## 5. 返却

形式は `finding-schema.md`。label 操作・PR コメント・state push は controller が行う (approve → `op review publish-approval`、
それ以外 → 自然文コメント + `op review state push` + label 遷移)。PR コメント URL は返さない。

完了報告には次も含める (read-only spawn の正解値):

- `commits_added: []` / `verification_executed: []` (実行した検証コマンドがあれば列挙)
- `code_review_invoked: false` / `code_review_skip_reason: "review is read-only, no apply performed"`
- `assumptions` / `needs_human_decision` / `blocked_actions` (該当時)

finding は field で返し、本文を長文で重ねない (`summary` / `evidence` は file:line 付きの短文)。
