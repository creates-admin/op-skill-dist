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
- **push しない**。push と PR open は op-run では ClusterOrchestrator、Direct apply では司令官が行う。

## 3. `Fixes` と `Refs` の使い分け

既定は `Fixes #N`。`Refs #N` は staged 運用に限る。

| PR 本文の状態 | 可否 | 備考 |
|---|---|---|
| `Fixes` / `Closes` / `Resolves #N` が 1 件以上ある | **OK** | 既定経路。各 Issue が実在すること |
| `Fixes` 系が無く `Refs #N` のみ、かつ参照先 Issue が **open** で `op:staged-refactor` または `op:architecture-debt` ラベルを持つ | **OK** | staged PR のみ許容 |
| `Fixes` 系が無く `Refs #N` のみ、参照先にそのラベルが無い | **NG** | staged でない通常 PR は `Fixes #N` が必須 |
| `Fixes` 系も `Refs` も無い | **NG** | |
| `Refs` 先の Issue が closed / 存在しない | **NG** | staged 参照先は open であること |

### 3-1. 「レビュー待ちだから Refs」は誤り

`Refs` を「未検証項目が残っている」「レビュー待ち」の意味で使わない。auto-close は merge 時にしか起きず、
merge は人間が行うので、人間 gate は merge そのもので確保されている。

### 3-2. 未検証項目 / 委譲がある場合

委譲先を別 Issue として起票し、当該 PR は `Fixes` で完了させる。

- Verification Ladder Level 4-5 未実行 → dedicated Issue を起票し、本 PR は `Fixes`
- 異常系 / 境界値テストを test-expert へ委譲 → 委譲 Issue を起票し、本 PR は `Fixes`
- 親 Issue が `op:staged-refactor` / `op:architecture-debt` を持つ段階作業 → `Refs #親`

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
| ux-ui-audit-expert | (apply 派生の修正 commit のみ) 破壊されていた invariant と復旧内容 |

各 expert の agent.md / SKILL.md には自 expert の必須節名 + 1 行だけを残す。
