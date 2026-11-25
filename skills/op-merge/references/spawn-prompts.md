# op-merge の spawn prompt

## コンフリクト解消の expert

4-2。`<expert>` は `op run expert-resolve` で解決した apply expert。

```
Agent({
  subagent_type: "op-skill:<expert>",
  model: "opus",
  description: "merge-conflict: PR #<N>",
  prompt: """
    invocation_mode: op_managed
    <`_shared/spawn-prompt-common.md` §2 (apply) / §4 を全文>

    あなたは <expert> です。op-merge から呼ばれました。PR #<N> に base を取り込み、コンフリクトを解消してください。
    - 作業ディレクトリ: <worktree_path> (PR head <headRefOid> から作成済み)
    - 取り込む base: origin/<base> (<base sha>)。`git merge --no-ff origin/<base>` で取り込む
    - PR の意図: <PR 本文の要約 / Issue #<M> の成功条件>
    - base 側で入った変更: <この run でマージした PR 番号と要約>
    - 両側の意図を保って解消する。一方の変更を捨てる・仕様判断が要る衝突は解消せず needs_human_decision で返す
    - 解消後に検証コマンド (対象 repo の CLAUDE.md、無ければ `_shared/project-profile.md`) を実行し、pass したら merge commit を作る
    - rebase / reset / force-push / push はしない。衝突の解消に必要な箇所以外は編集しない
    返却: 修正完了報告 schema (`_shared/expert-report-schemas.md`) + resolved_files[] + 衝突ごとの解消方針 1 行
  """
})
```

## 解消 commit の軽量レビュー

4-2-r。解消した expert とは別 context で、解消 commit だけを見る。`op-skill:*` の expert は使わない。

```
Agent({
  subagent_type: "general-purpose",
  model: "opus",
  description: "merge-resolution review: PR #<N>",
  prompt: """
    あなたはこのコードを書いていません。op-merge のコンフリクト解消 commit を軽くレビューしてください。read-only (編集・commit・push 禁止)。
    - 作業ディレクトリ: <worktree_path>、対象: merge commit <sha> (`git show --cc <sha>` と `git diff <headRefOid> <sha>`)
    - PR の意図: <PR 本文の要約 / Issue #<M> の成功条件>、base 側の変更: <この run でマージした PR と要約>
    - 確認するのは次の 3 点だけ:
      1. 両側の変更が失われていない (片側の hunk の取りこぼし・巻き戻しがない)
      2. 解消に不要な変更が混ざっていない
      3. expert の検証結果が妥当 (該当テストが実行されている)
    返却: { verdict: "pass" | "fail", findings: [ { file, line, problem } ] }  (fail は具体的な根拠がある場合のみ)
  """
})
```
