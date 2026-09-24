# commit 規約 (commit-convention)

## 1. 適用範囲

apply Run Mode で commit を打つ全 expert (Direct apply / op-run 経由の両方)。
scan / patrol / review / gate / post-check モードは対象外。
完了報告 schema は `_shared/expert-spawn.md`、完了手順は `_shared/apply-completion-checklist.md`。

## 2. 共通形式

```
<type>(<scope>): <要約> (Fixes #N)

<変更の goal を 1〜2 文、日本語>

<expert 別の必須節 (§4)>

実装内容:
- <ファイル>: <変更>
```

- header は 1 行。`<type>` は `fix` / `feat` / `refactor` / `perf` / `test` / `style` / `docs` / `chore`。
- 本文は日本語。判定根拠 (なぜその修正が正しいか) を残す。
- 複数 Issue は列挙する (`(Fixes #12 #15)` または本文に `Fixes #12` / `Fixes #15` を各行)。
- push しない。push と PR open は op-run では ClusterOrchestrator、Direct apply では司令官が行う。

## 3. `Fixes` と `Refs` の使い分け

- 既定は `Fixes #N` (`Closes` / `Resolves` も可)。参照先 Issue は実在すること。
- `Refs #N` だけの PR は、参照先が open かつ `op:staged-refactor` または `op:architecture-debt` ラベルを持つ段階作業に限る。
- `Refs` を「未検証項目が残っている」「レビュー待ち」の意味で使わない (人間 gate は merge そのもの)。

### 3-2. 未検証項目 / 委譲がある場合

委譲先を別 Issue として起票要求し、当該 PR は `Fixes` で完了させる。

- Verification Ladder Level 4-5 未実行 → dedicated Issue を要求し、本 PR は `Fixes`
- 異常系 / 境界値テストを test-expert へ委譲 → 委譲 Issue を要求し、本 PR は `Fixes`
- 親 Issue が `op:staged-refactor` / `op:architecture-debt` を持つ段階作業 → `Refs #親`

起票要求は完了報告で返し、controller が `filing-gate.md` を通して起票する (apply 中の expert は起票しない)。

## 4. expert 別の必須節

commit message に必ず含める節。空欄のまま完了報告するのは contract violation。

| expert | 必須節 |
|---|---|
| feature-expert | `手本:` (参考にした既存ファイル:LINE と要素) / `再利用した既存資産:` (crate / module / wrapper / component / type) |
| debug-expert | 根本原因 / Repro Lock 要点 / 残したテストの判定根拠 |
| optimize-expert | Before/After 数値 + 改善率 / statistical significance / decision (applied・reverted・deferred・escalated) |
| designer-expert | `Components Used` / `Tokens Used` / `States Covered` / `Skipped States` / `States Preserved` / `Motion Applied` (使用時) |
| refactor-expert | `Refactor Type` / `Behavior Change Claim` (挙動非変更の宣言) / `Contract Preservation` |
| test-expert | 追加 / 削除したテストと、削除の場合はゴミテスト判定根拠 |
| security-expert | 到達経路の遮断内容 / 維持した正当な user capability / post-check 観点との対応 |
