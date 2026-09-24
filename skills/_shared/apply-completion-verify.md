# apply 完了 verify gate (apply-completion-verify)

apply spawn 完了直後に controller が実施する commit 検証 gate の正本。agent 側の手順は `apply-completion-checklist.md`。
exploration-only spawn (investigation / post-check / review) は対象外 (`commits_added: []` が正解)。

## 1. verify 実行主体

| caller | 実行主体 | base 指定 |
|--------|---------|-----------|
| op-run | ClusterOrchestrator (`cluster-orchestrator-directives.md` フェーズ2-3 / フェーズ4 push 直前) | `--base-ref "${OP_RUN_BASE_REF}"` |
| op-codev | controller が Step B-1 でインライン実行 (配線の正本は op-codev skill) | `--base-sha "${IU_BASE_SHA}"` |
| その他 (Direct apply 等) | controller がインライン実行 | `--base-sha` |

## 2. 手順 (PR open / push の前に実行)

### 2-1. completion_report の schema 確認

```
- [ ] status が completed | blocked | partial のいずれか
- [ ] commits_added フィールドが存在する (空配列でも存在が必要)
```

フィールドが無い報告 (例: 自己検証の findings JSON がそのまま返った) も skip せず、`--reported-json '[]'` として 2-2 を実行する。

### 2-2. `op apply verify-commit`

```bash
op apply verify-commit --worktree "${WT_PATH}" --base-ref "${OP_RUN_BASE_REF}" \
  --reported-json "${COMMITS_ADDED_JSON}"
# exit 0 = pass / 1 = block (blocking_reasons) / 99 = 内部エラー (fail-closed)
```

`commits_added` が object 配列 (`[{"sha": ...}]`) でもそのまま渡してよい。

### 2-3. primitive 判定別分岐

| 判定 | 挙動 |
|------|------|
| `decision: pass` (exit 0) | PR open に進む。partial commit (報告 < 実、報告は全て実在 + member) は warning のみで許容 |
| `COUNT_ZERO` (報告 0 件) | worktree の `<base>..HEAD` を確認。実コミットがあれば実 SHA を inject して warning ログ → PR open。実コミットも 0 なら §4 retry → 失敗で §3 隔離 |
| `FABRICATED_SHA` (捏造 SHA) | PR open に進まない。§4 retry を 1 回 → 失敗で §3 隔離 |
| `NOT_IN_COMMIT_SET` (範囲外 SHA) | PR open に進まない。§4 retry を 1 回 → 失敗で §3 隔離 |
| `UNCOMMITTED_CHANGES` (取りこぼし) | PR open に進まない。§4-A retry を 1 回 → 再検証 pass なら PR open、失敗 (無応答 / 再度 dirty) で §3 隔離。warning 扱いで push に進むことは禁止 |
| exit 99 | PR open に進まない。入力 (worktree / base / commits_added JSON) を確認して再実行 |

`UNCOMMITTED_CHANGES` は `commits_added` が正当でも立つので、本手順は push の前に実行する。

### 2-4. 例外 (status: blocked / partial)

`status` が `blocked` / `partial` なら `commits_added: []` でも violation ではない。以下を確認してユーザー escalation に回し、PR open しない (cluster Status を `blocked` に更新)。

```
- [ ] needs_human_decision に decision_type / options / recommended_option がある
- [ ] blocked_actions[] に保留内容が記述されている
```

## 3. 隔離手順 (retry 失敗時)

`worktree-ops.md`「cleanup コマンド」節の「失敗時の隔離」snippet を実行した後、claim を best-effort で解放する。

```bash
op claim release --repo "${REPO}" --issue "${ISSUE_NUMBER}" --task-id "${TASK_ID}" 2>/dev/null || true
```

cluster が複数 Issue を claim している場合は Issue ごとに実行する。失敗は `op claim sweep` が回収する。

## 4. SendMessage retry (commit 0 件 / 捏造 / 範囲外)

retry メッセージに含めるもの:

- 観測事実: `git log <base>..HEAD` の件数 (または一致しなかった SHA) と `git status --porcelain` の現状
- `apply-completion-checklist.md` §3 を全項目 yes にしてから commit し、`commits_added: ["SHA", ...]` を canonical completion_report で返すこと
- 真に no-op (修正不要) なら `status: "blocked"` または `"partial"` + `needs_human_decision` で返すこと
- push / PR open は司令官が行うこと

### 4-A. 取りこぼし (UNCOMMITTED_CHANGES) 検出時の retry

§4 に加えて `details.uncommitted_files` をそのまま添付し、次を求める:
意図した変更なら commit (自己検証による修正の commit 漏れが最も多い)、意図しない生成物なら削除か `.gitignore` 追加、
`git status --porcelain` が空になったことを確認して追加 commit を含む `commits_added` を再報告。
