# apply 完了 verify gate (apply-completion-verify)

apply spawn 完了直後に controller が実施する commit 検証 gate の正本。agent 側の手順は `apply-completion-checklist.md`。
exploration-only spawn (investigation / post-check / review) は対象外 (`commits_added: []` が正解)。

## 1. verify 実行主体

| caller | 実行主体 | base 指定 |
|--------|---------|-----------|
| op-run | ClusterOrchestrator (`cluster-orchestrator-directives.md` フェーズ2-3 / フェーズ4 push 直前) | `--base-ref "${OP_RUN_BASE_REF}"` |
| op-codev | controller が Step B-1 でインライン実行 (配線の正本は op-codev skill) | `--base-sha "${IU_BASE_SHA}"` |
| その他 (Direct apply 等) | controller がインライン実行 | `--base-sha` |

`--base-ref` は `origin/<ref>..HEAD` として解決するため、origin 追跡 ref を共有する worktree (op-run) で使う。
main checkout 上のローカル branch で作業する経路は `--base-sha <rev>` (`<rev>..HEAD`) を使う。両者は排他でどちらか必須。

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
| `UNCOMMITTED_CHANGES` (取りこぼし) | PR open に進まない。`details.uncommitted_files` を添えて §4-A retry を 1 回 → 再検証 pass なら PR open、失敗 (無応答 / 再度 dirty) で §3 隔離。warning 扱いで push に進むことは禁止 |
| exit 99 | PR open に進まない。入力 (worktree / base / commits_added JSON) を確認して再実行 |

`UNCOMMITTED_CHANGES` は `commits_added` が正当でも立つ。本手順は必ず push の前に実行する。

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

## 4. SendMessage retry 文面 (commit 0 件)

```
worktree で `git log <base>..HEAD` が空でした。
commit が 1 件も作られていない状態で完了報告が返却されています。

以下を確認してください:
1. apply-completion-checklist.md §3 の全項目を yes にしてから commit を打ってください
   (code-review による変更も含めて git add + git commit)
2. 真に no-op (修正不要) の場合は status: "blocked" または "partial" +
   needs_human_decision で返してください
3. commits_added: [] のまま apply 完了報告を返すことは contract violation です
4. push / PR open は司令官の責務です。commit まで完了したら canonical completion_report
   (commits_added: ["SHA"] 必須) を返してください

現在の worktree 状態 (参考):
- git log: 0 commits
- git status: [controller が現状を添付する]
```

### 4-A. 取りこぼし (UNCOMMITTED_CHANGES) 検出時の retry 文面

§4 の文面は使わない (commit は打たれているため)。

```
worktree に未 commit の変更が残ったまま完了報告が返却されています。
報告された commits_added の SHA 自体は正当ですが、それ以外に commit されていない
変更があります。

未 commit の変更 (git status --porcelain):
[controller が details.uncommitted_files をそのまま添付する]

push は司令官が行うため、この未 commit 分は push されず失われます。
以下を確認してください:
1. 残っている変更を確認し、意図した変更であれば git add + git commit してください
   (自己検証による修正を commit し忘れているケースが最も多い)
2. 意図しない生成物 (ビルド成果物等) であれば削除するか .gitignore に追加してください
3. 対応後、git status --porcelain が空になったことを確認してください
4. 追加 commit を含めた commits_added を canonical completion_report で再報告してください
   (apply-completion-checklist.md §3 / §4)
```
