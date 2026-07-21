<!--
schema_version: 4
last_breaking_change: 2026-05-24
notes: v4 (2026-05-24) — apply 完了前に Static 検証 (cargo fmt --check / clippy 等) を必須ゲートとして追加。
       Section 2 の 4 段階順序に Static 検証ステップを挿入 (unit test の前)。
       Section 3 チェックリストに Static 検証 pass 確認項目を追加。
       Section 4 強警告に「PR 本文に Static: pass と書きながら fmt --check 未実行は contract violation」を
       PR #220 / #535 / #536 の再演事例として追記。
       コマンド本体は project-profile.md が正本 (Single Canonical Source Rule、本ファイルには複製しない)。Fixes #537。
       v3 (2026-05-21) — Claude Code v2.1.146 で `/simplify` skill が `/code-review` に rename された (廃止ではなく改名)。
       本ファイル全体の skill 名 / フィールド名 / 強警告本文を `simplify` → `code-review` に更新。
       新規 `code_review_effort` field の参照を Section 6 schema 対応表に追加。
       schema field の正本は _shared/expert-spawn.md v16 (`code_review_invoked` / `code_review_result` /
       `code_review_skip_reason` / `code_review_effort`)。v14 (`simplify_*`) は backward-compat
       (warning + auto-translate) で deprecation 期間 1 release。Fixes #367。
       v2 (2026-05-20) — Section 3 チェックリストに自己検証コマンド例 (git log / diff) を追加。
       Section 4 強警告に PR #307-#311 failure mode (5 件中 4 件 commits_added: [] silent skip 再演)
       を具体例として追加。Section 7 (新設) として expert-spawn.md の publish 前 validate 節への
       pointer を追加。Fixes #312。
       v1 (2026-05-17) — PR #160 (commit 2496ee8) で 8 expert SKILL.md に散布した
       「実装完了後の Simplify invoke」節を本ファイルに集約。チェックリスト + 強警告を追加し、
       agent が simplify 実行後に commit を忘れる failure mode を構造的に軽減する。
       各 expert SKILL.md は固有 skip 条件のみ残し、本ファイルへの pointer に置換する
       (Single Canonical Source Rule、_shared/issue-enrichment.md と同パターン)。Fixes #176。
-->

<!--
機能概要: 8 expert (debug / feature / refactor / test / optimize / security / design / ux-ui-audit)
         が apply Run Mode で実装完了後に必ず踏む完了手順 (5 段階順序 + チェックリスト + 強警告) の正本。
作成意図: PR #160 で確立した 4 段階順序 (実装完了 → unit test → code-review → commit) を v4 で
         5 段階 (実装完了 → Static 検証 → unit test → code-review → commit) に改訂。
         Static 検証 (cargo fmt --check 等) を unit test の前に必須ゲートとして追加し、
         fmt skip 再発 (PR #220 / #535 / #536) を構造的に封じる。
         code-review 実行後に commit を忘れる failure mode が発生したため、
         チェックリストと強警告を正本に組み込み、agent の commit 忘れを軽減する (v1 から継続)。
注意点: 完了報告 v16 schema (code_review_invoked / code_review_result / code_review_skip_reason /
        code_review_effort) の正本は _shared/expert-spawn.md。本ファイルはチェックリストと手順の
        正本であり、schema フィールド定義は行わない (二重定義禁止)。
        v14 schema (旧 simplify_* フィールド) は warning + auto-translate で受理する backward-compat
        を 1 release 提供する (詳細は expert-spawn.md v16 の deprecation 節)。
        Static 検証コマンドの正本は project-profile.md (Single Canonical Source Rule、本ファイルは pointer のみ)。
        expert 固有 skip 条件は各 expert SKILL.md 側に残す (本ファイルには集約しない)。
-->

# apply 完了手順 (apply-completion-checklist)

## 1. 適用範囲

本チェックリストは **apply Run Mode のみ** に適用する。

| モード | 適用 |
|--------|------|
| apply Run Mode (`op-run` 経由 または Direct apply) | 適用する |
| scan / detect モード | 適用しない (skip) |
| review / post-check モード | 適用しない (skip) |
| gate 判定モード | 適用しない (skip) |
| patrol 巡回モード | 適用しない (skip) |

scan / review / gate / patrol モードで invoked になった場合は
`code_review_invoked: false`、`code_review_skip_reason: "<mode名>, no apply performed"` を完了報告に記載する。

## 2. 5 段階順序 (v4 改訂: Static 検証ステップ追加)

commit までの 5 ステップを **この順序で** 実行する。

```
1. 実装完了 (スコープ内ファイルの変更 + 単体確認)
2. Static 検証 pass 確認 (project-profile.md のスタック別コマンドを参照)
3. unit test pass 確認 (該当する Level のみ)
4. code-review skill invoke
5. commit
```

> **Static 検証 (Step 2) は unit test より前**。fmt --check と clippy は line-width / import 整形を見るため、
> clippy pass と fmt fail は両立する。`cargo fmt --check` を独立して必ず実行する。
> 具体的なコマンドは `skills/_shared/project-profile.md` の「検証コマンド (スタック別)」節が正本。
> 本ファイルにはコマンドを複製しない (Single Canonical Source Rule)。
>
> commit は必ず code-review invoke **後** に行う。
> code-review が修正を提案し実際に変更が発生した場合、その変更も含めて commit する。

### code-review skill 名と effort-level

- Claude Code v2.1.146 (2026-05-21) で `/simplify` は `/code-review` に **rename** された (廃止ではなく改名)。
  agent は `Skill({skill: "code-review"})` で呼ぶ。skill 名 transition で兼用が成立している間は
  `Skill({skill: "simplify"})` への fallback も許容する。
- optional な `effort-level` 引数を取れる (`/code-review high` 等)。controller が `code_review_effort` field
  として spawn 時に渡してくる場合、agent は `Skill({skill: "code-review", args: "<effort>"})` で呼ぶ。
  `auto` または未指定の場合は引数なしで `Skill({skill: "code-review"})`。
- effort-level の自動派生ルールは `~/.claude/skills/_shared/model-selection.md (>=2)` §5.5 を参照。

## 3. 完了前チェックリスト

commit を打つ前に以下を **全項目 yes** にしてから進む。

```
- [ ] Static 検証 (project-profile.md のスタック別コマンド) を全て pass 確認済
      (Rust: cargo fmt --check / cargo clippy / cargo test、
       TypeScript/Vue: tsc --noEmit / lint 等、Flutter: dart format --set-exit-if-changed . / flutter analyze)
- [ ] code-review skill invoke 完了、code_review_result 取得済
      (skip 時は code_review_skip_reason 確定済)
- [ ] code-review による修正を含めて git add -A 実行済
- [ ] git commit 実行済
- [ ] git log --format='%H' "${BASE_SHA}..HEAD" で commits_added の SHA 配列を取得済、
      完了報告の commits_added フィールドに記入済 (1 件以上であること)
- [ ] git rev-list "${BASE_SHA}..HEAD" --count が 1 以上であることを確認済
```

> **Static 検証コマンドの正本は `skills/_shared/project-profile.md`**。
> スタック別の正確なコマンド (Rust / Flutter / Vue / TypeScript) は同ファイルの
> 「検証コマンド (スタック別)」節を参照すること。

### 自己検証コマンド例

commit 直後、完了報告を返す前に以下のコマンドで commits_added の正確性を self-check する:

```bash
# 新規 commit 数を確認 (1 以上であること)
git log --format='%H' "${BASE_SHA}..HEAD" | wc -l

# 変更ファイル数を確認
git diff --name-only "${BASE_SHA}..HEAD" | wc -l

# commits_added 配列要素数 == git log 出力行数 となること
git log --format='%H' "${BASE_SHA}..HEAD"
```

`commits_added` 配列の要素数が `git log` の出力行数と一致することを確認してから完了報告を返す。

## 4. 強警告

> **重要**: code-review invoke 完了 ≠ 実装完了。commit を打って初めて agent の責務が完結する。
>
> commit を打たないまま完了報告を返すと、司令官が事後補完することになり、これは
> **完了報告の contract violation**。
>
> 自分が「終わった」と感じた瞬間に、必ず上の全項目を確認すること。
> 「commit を忘れ」が起きた場合は完了報告は invalid 扱いとなる。
>
> **v14 追加警告**: `commits_added: []` のまま apply 完了報告を返すことも contract violation。
> apply spawn では必ず `commits_added: [SHA, ...]` (1 件以上) を完了報告に含めること。
> exploration-only spawn (investigation / post-check / review) では `commits_added: []` が正解 (commit しないため)。
>
> **v4 追加警告 (Static 検証 contract violation)**: PR 本文に `Static: pass` と記録しながら
> `cargo fmt --check` を実際には実行していない場合、これは **contract violation** として扱う。
> `cargo clippy` pass と `cargo fmt --check` pass は独立して評価する (clippy は line-width /
> import 整形を見ないため clippy pass と fmt fail は両立する)。
> Static 検証は Section 2 の Step 2 で unit test より前に必ず実行すること。
> 具体的なコマンドは `skills/_shared/project-profile.md` が正本。

## 5. expert 固有 skip 条件

各 expert の固有 skip 条件は **各 expert の SKILL.md に残す**。
本節はそのサマリ (参照用) であり、詳細は各 SKILL.md 側が正本。

| expert | skip 条件のあり/なし | 詳細参照先 |
|--------|---------------------|-----------|
| debug-expert | skip 条件なし、apply 後は必ず invoke | `~/.claude/skills/expert-debug/SKILL.md` |
| feature-expert | skip 条件なし、apply 後は必ず invoke | `~/.claude/skills/expert-feature/SKILL.md` |
| refactor-expert | skip 条件なし、apply 後は必ず invoke | `~/.claude/skills/expert-refactor/SKILL.md` |
| test-expert | skip 条件なし、apply 後は必ず invoke | `~/.claude/skills/expert-test/SKILL.md` |
| optimize-expert | **あり**: benchmark 前は invoke 禁止、revert/deferred 時は skip | `~/.claude/skills/expert-optimize/SKILL.md` |
| security-expert | **あり**: finding 残置時 / scan / review モードは invoke なし | `~/.claude/skills/expert-security/SKILL.md` |
| designer-expert | **あり**: Scan / Gate / Patrol モードは invoke なし | `~/.claude/skills/expert-design/SKILL.md` |
| ux-ui-audit-expert | **あり**: apply 派生 (修正コミット発生) かつ修正ありの場合のみ invoke | `~/.claude/skills/expert-ux-ui-audit/SKILL.md` |

## 6. 完了報告 v16 schema との対応

完了報告 v16 schema の正本は `~/.claude/skills/_shared/expert-spawn.md` (schema 定義は変更しない)。

本チェックリストと v16 schema の対応:

| チェックリスト項目 | 対応する schema フィールド |
|------------------|--------------------------|
| code-review invoke 完了 | `code_review_invoked: true` |
| skip 時の理由確定 | `code_review_skip_reason: "<理由>"` |
| code-review 結果 | `code_review_result: "pass" | "warning" | "skip"` |
| controller から渡された effort | `code_review_effort: "low" | "medium" | "high" | "xhigh" | "max" | "auto" | null` |
| commits_added SHA 配列取得 | `commits_added: ["<SHA1>", "<SHA2>", ...]` |
| commit_sha (deprecated) | `commit_sha: "<SHA>"` (v13 以前との互換のみ、新規実装では commits_added を使う) |

> **v14 → v16 backward-compat**: v14 完了報告 (旧 `simplify_invoked` / `simplify_result` /
> `simplify_skip_reason`) を controller に返した場合、controller は warning を出しつつ
> v16 フィールド (`code_review_*`) に auto-translate して受理する。deprecation 期間 = 1 release。
> 詳細は `~/.claude/skills/_shared/expert-spawn.md` の v14 backward-compat 節を参照。

**チェックリスト全項目 yes でない状態で完了報告を返すことは contract violation**。
apply spawn で `commits_added` が空配列 `[]` の完了報告は invalid 扱い。
exploration-only spawn (investigation / post-check / review) では `commits_added: []` が正解。

## 7. Marker Publish が発生する場合の追加契約

apply 中に hidden marker / completion report block を publish する場合は、
`skills/_shared/expert-spawn.md` の marker publish 前 validate 節
(`op help marker <name>` + `op core marker-lint --body - --source-hint <kind> --strict`) を実行する。

publish 前 validate は apply-completion-checklist の 5 段階順序 (Section 2) の
「1. 実装完了」ステップに含まれる。publish してから validate するのは順序違反。
