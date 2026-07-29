<!--
schema_version: 1
last_breaking_change: 2026-07-29
notes: v1 (2026-07-29) — ADR-0030 決定2 CX-04 / 決定3 (B) により新設。
       commit header 形式 / 日本語本文 / push 禁止 / `Fixes` と `Refs` の使い分け /
       expert 別の必須節を 1 ファイルに集約した唯一正本。
       `Fixes` / `Refs` 判定は `op merge verify` gate 19 の Rust 実装
       (op-tools/crates/op-core/src/merge/verify.rs::eval_issue_link_gates、案 A) を prose 転記したもの。
       機械正本は Rust 側であり、本ファイルはその prose ミラーである (乖離時は Rust が正)。
-->

<!--
機能概要: apply expert (debug / feature / refactor / test / optimize / security / design / ux-ui-audit)
         が commit を打つときの共通規約 (header 形式・本文言語・push 禁止・Fixes/Refs 使い分け) と、
         expert ごとに commit message へ必ず書く節の一覧を定める正本。
作成意図: commit 規約が L1 (agents/*.md) / L2 (expert-*/SKILL.md) / L3 (op-run/references/apply-prompt-directives.md)
         の 3 層 9 箇所に重複し、しかも feature-expert だけが「初期実装 PR は原則 Refs #N」という
         gate 19 と衝突する規約を持っていた (ADR-0030 CX-04)。更新点を 1 箇所に畳み、
         L1/L2/L3 は「自 expert の必須節名 + 1 行」だけ残す。
注意点: `Fixes` / `Refs` の可否は op-merge の gate 19 が機械判定する。本ファイルの記述と
        gate 19 の実装が食い違った場合は **Rust 実装 (verify.rs) が正**であり、本ファイルを修正する。
        push / PR open は apply expert の責務ではない (op-run では ClusterOrchestrator、
        Direct apply では司令官が行う)。
        完了報告 schema (commits_added 等) の正本は _shared/expert-spawn.md、
        完了手順 (5 段階順序 / op-run 例外分岐) の正本は _shared/apply-completion-checklist.md。
-->

# commit 規約 (commit-convention)

## 1. 適用範囲

apply Run Mode で commit を打つ全 expert に適用する (Direct apply / op-run 経由の両方)。
scan / patrol / review / gate / post-check モードは commit を打たないため対象外。

## 2. 共通形式

```
<type>(<scope>): <要約> (Fixes #N)

<変更の goal を 1〜2 文、日本語>

<expert 別の必須節 (§4)>

実装内容:
- <ファイル>: <変更>
```

- **header** は 1 行。`<type>` は `fix` / `feat` / `refactor` / `perf` / `test` / `style` / `docs` / `chore` から選ぶ。
- **本文は日本語**。判定根拠 (なぜその修正が正しいか) を必ず残す。
- **複数 Issue を閉じる場合は列挙する** (`(Fixes #12 #15)` または本文に `Fixes #12` / `Fixes #15` を各行)。
- **push しない**。push と PR open は op-run では ClusterOrchestrator (フェーズ4)、
  Direct apply では司令官が行う。apply expert は commit までで止まる。

## 3. `Fixes` と `Refs` の使い分け (op-merge gate 19 = 機械判定)

**既定は `Fixes #N`**。`Refs #N` は staged 運用に限る。
以下は `op merge verify` gate 19 (`verify.rs::eval_issue_link_gates`、案 A) の評価をそのまま転記したものである。

| PR 本文の状態 | gate 19 | 備考 |
|---|---|---|
| `Fixes` / `Closes` / `Resolves #N` が 1 件以上ある | **pass** | 既定経路。gate 20 で各 Issue の実在を確認する |
| `Fixes` 系が無く `Refs #N` のみ、かつ参照先 Issue が **open** で `op:staged-refactor` または `op:architecture-debt` ラベルを持つ | **pass** | staged PR (段階リファクタ / architecture debt の親 Issue を参照) のみ許容 |
| `Fixes` 系が無く `Refs #N` のみ、参照先にそのラベルが無い | **block** (`GATE_19_REFS_NOT_STAGED`) | 「staged でない通常 PR は `Fixes #N` が必須」 |
| `Fixes` 系も `Refs` も無い | **block** (`GATE_19_NO_FIXES`) | Issue 自動 close ができない |
| `Refs` 先の Issue が closed / 存在しない | **block** (gate 20: `GATE_20_REF_NOT_OPEN` / `GATE_20_REF_NOT_FOUND`) | staged 参照先は open であること |

### 3-1. 「レビュー待ちだから Refs」は誤り

`Refs` を「未検証項目が残っている」「レビュー待ち」の意味で使ってはならない。
op-run の PR は定義上すべてレビュー待ちであり、その解釈では **全 PR が gate 19 で block され op-merge に到達できない**。

「auto-close で Issue が早期に閉じる」懸念も現行の op-merge 設計では成立しない:

- `Fixes` による auto-close は **PR が merge された瞬間にしか起きない**。
- merge には `op merge verify` の 21 gate 通過 + **ユーザー承認**が必須 (`op-merge/SKILL.md` 3.5-2)。
- op-merge は merge 後に「`Fixes #N` の Issue が close されたか」を確認する後処理を持つ。

つまり人間 gate は「auto-close を避けること」ではなく **merge 承認そのもの**で確保されている。

### 3-2. 未検証項目 / 委譲がある場合

`Refs` にして Issue を開いたままにするのではなく、
**委譲先を別 Issue として起票し、当該 PR は `Fixes` で完了させる**を既定とする
(Issue が閉じないまま滞留する failure mode を避けるため)。

- Verification Ladder Level 4-5 未実行 → dedicated Issue を起票し、本 PR は `Fixes`
- 異常系 / 境界値テストを test-expert へ委譲 → 委譲 Issue を起票し、本 PR は `Fixes`
- 親 Issue が `op:staged-refactor` / `op:architecture-debt` を持つ段階作業 → `Refs #親` (staged 運用)

## 4. expert 別の必須節

commit message に **必ず**含める節。空欄のまま完了報告することは contract violation。

| expert | 必須節 |
|---|---|
| feature-expert | `手本:` (参考にした既存ファイル:LINE と要素) / `再利用した既存資産:` (crate / module / wrapper / component / type) — **silent fork 防止の構造的担保** |
| debug-expert | 根本原因 / Repro Lock 要点 / 残したテストの判定根拠 |
| optimize-expert | Before/After 数値 + 改善率 / statistical significance / decision (applied・reverted・deferred・escalated) |
| designer-expert | Design Plan の `Components to Use` / `Tokens to Use` / `States` の転記 |
| refactor-expert | `Refactor Type` / `Behavior Change Claim` (挙動非変更の宣言) / `Contract Preservation` |
| test-expert | 追加 / 削除したテストと、削除の場合はゴミテスト判定根拠 |
| security-expert | 攻撃経路の封鎖内容 / 維持した正当な user capability / post-check 観点との対応 |
| ux-ui-audit-expert | (apply 派生の修正 commit のみ) 破壊されていた invariant と復旧内容 |

各 expert の agent.md / SKILL.md には **自 expert の必須節名 + 1 行** だけを残し、
形式・使い分けの詳細は本ファイルを参照する (Single Canonical Source Rule)。

## 5. 関連正本

- `_shared/apply-completion-checklist.md` — 完了手順 (5 段階順序 / op-run の commit 先行分岐)
- `_shared/expert-spawn.md` — 完了報告 schema (`commits_added` 等)
- `_shared/pr-templates.md` — PR 本文 / Issue 本文テンプレ
- `op-tools/crates/op-core/src/merge/verify.rs` — gate 19 / 20 の機械正本
- `skills/op-merge/SKILL.md` — merge gate と人間承認 gate
