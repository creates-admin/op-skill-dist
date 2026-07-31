<!--
schema_version: 6
last_breaking_change: 2026-07-31
notes: v6 (2026-07-31) — **commit 取りこぼし対策**。①Section 2-A (commit 先行) の適用範囲を
       op-run に加えて **op-codev** へ拡大 (節名を「op-run 経路の例外分岐」→「commit 先行経路」に改称)。
       実測事故 (2026-07-31, op-codev IU1 Step B 再実行) で、agent が実装 → 自己検証 → High 検出 →
       自己修正まで完遂しながら commit だけを落とし、完了報告として op-code-review の findings JSON
       配列のみを返した (commits_added フィールド自体が無い)。これは §2-A が op-run 向けに塞いだ
       failure mode そのものであり、Section 2 の 5 段階順序 (自己検証 → commit) を使い続けていた
       op-codev が同じ穴を踏んだ形。Direct apply (op-run / op-codev 以外) は Section 2 のまま不変。
       ②Section 3 に「完了報告 schema の乗っ取り禁止」項目を追加 — 自己検証 skill の出力形式を
       完了報告として返さない。③Section 4 に取りこぼしが機械検証されること
       (`op apply verify-commit` の `UNCOMMITTED_CHANGES`) を明記。自己申告は検証される。
       schema_version bump (op-codev の実行順序という既存 contract を変更するため)。
       v5 (2026-07-29, additive) — ADR-0030 CX-03: Section 2-A「op-run 経路の例外分岐 (commit 先行)」を新設。
       ADR-0016 決定3 / cluster-orchestrator-directives.md / apply-prompt-directives.md の 3 面一致に prose を合わせ、
       op-run 経路のみ commit → Skill(op-skill:op-code-review) → (Critical/High 時のみ) 追加 commit とする。
       追加 commit 必須 / uncommitted 残置 = contract violation を Section 3・4 にも反映。
       Direct apply の 5 段階順序 (Section 2) は不変 (節追加のみ・既存項目の削除なし)。
       v5 (2026-07-29) — code-review invoke 先を built-in `/code-review` から plugin 同梱の
       `op-skill:op-code-review` (skills/op-code-review/SKILL.md) に差し替え。built-in は
       disable-model-invocation のため model (subagent 含む) から Skill invoke できないことが
       実測で確定した (headless 実測 2026-07-29)。旧 `simplify` fallback は廃止し、fallback は
       新 skill の Angle A〜E + 3 値 verify の手動一巡に変更 (checklist の手順正本は新 skill)。
       effort-level は新 skill の args (`effort: <level>`) として渡す。完了報告 field 名
       (`code_review_*`) と v16 schema は不変 (正本 = expert-spawn.md、field rename なし)。
       v4 (2026-05-24) — apply 完了前に Static 検証 (cargo fmt --check / clippy 等) を必須ゲートとして追加。
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
| apply Run Mode (`op-run` / `op-codev` 経由 または Direct apply) | 適用する (`op-run` / `op-codev` 経由は Section 2-A の commit 先行順序を使う) |
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
>
> **例外**: `op-run` (ClusterOrchestrator) 経由 および `op-codev` (Step B) 経由の apply は
> commit を先に打つ (Section 2-A)。本 5 段階順序は **それ以外の Direct apply** の正本として不変。

### code-review skill 名と effort-level (v5 改訂: invoke 先 = op-skill:op-code-review)

- **invoke 先は plugin 同梱の `op-skill:op-code-review`** (手順・angle・verify 判定・出力形式の正本は
  `skills/op-code-review/SKILL.md`)。agent は `Skill({skill: "op-skill:op-code-review"})` で呼ぶ
  (plugin 未経由の直配置 repo では `Skill({skill: "op-code-review"})`)。
- built-in `/code-review` (旧 `/simplify`) は **disable-model-invocation のため model から
  Skill invoke できない** (2026-07-29 実測確定)。built-in および旧 `simplify` への fallback は廃止。
  skill 解決に失敗した場合の fallback は、`skills/op-code-review/SKILL.md` の Angle A〜E +
  3 値 verify を同一 context で **手動一巡** すること (本ファイルには手順を複製しない)。
- controller が `code_review_effort` field として effort を渡してくる場合、agent は
  `Skill({skill: "op-skill:op-code-review", args: "effort: <effort>"})` で呼ぶ。
  `auto` または未指定の場合は effort 引数なしで呼ぶ (skill 既定 = high)。
- effort-level の自動派生ルールは `~/.claude/skills/_shared/model-selection.md (>=2)` §5.5 を参照。

## 2-A. commit 先行経路 (op-run / op-codev、ADR-0016 決定3 / ADR-0030 CX-03)

> **本節は Section 2 に対する順序の差分**。Section 2 の 5 段階順序は
> **op-run / op-codev 以外の Direct apply の正本のまま不変**である。

以下の経路で spawn された apply-expert は、**commit を先に打ってから**
`Skill(op-skill:op-code-review)` を自己検証として実行する。

| 経路 | spawn 元 | controller 側 verify gate |
|---|---|---|
| `op-run` | ClusterOrchestrator (`cluster-orchestrator-directives.md` フェーズ2-3 / `op-run/references/apply-prompt-directives.md`) | フェーズ4 の push 直前 (`--base-ref`) |
| `op-codev` | Step B (`skills/op-codev/SKILL.md`) | Step B-1 (`--base-sha`) |

```
1. 実装完了 (スコープ内ファイルの変更 + 単体確認)
2. Static 検証 pass 確認 (project-profile.md のスタック別コマンドを参照)
3. unit test pass 確認 (該当する Level のみ)
4. commit                          ← commit 先行経路ではここが先
5. Skill(op-skill:op-code-review) 自己検証 (effort は controller 由来の code_review_effort、§2「code-review skill 名と effort-level」)
6. Critical / High が出た場合のみ: 自己修正 → **追加 commit** → 自己検証を 1 回だけ再実行
   (2 回目も Critical/High が残るなら self_check_blocked: true を付けて controller に返す)
   Medium / Low は自己修正せず formal review 工程に委ねる
```

**この経路でのみ守るべき追加契約 (commit 先行に固有のリスクを塞ぐ)**:

- 自己検証で Critical / High を修正した場合、**追加 commit は必須**。修正を commit せずに完了報告を返してはならない。
- **worktree に uncommitted 変更を残したまま完了報告することは contract violation**。
  push は controller が行うため、未 commit の変更は **失われる**。
  完了報告の直前に `git status --porcelain` が空であることを必ず確認する。
- `commits_added` には初回 commit と自己修正 commit の **両方**の SHA を含める (Section 3 の取得手順は共通)。
- **完了報告は canonical completion_report の形式で返す**。`Skill(op-skill:op-code-review)` が返す
  findings JSON 配列を、そのまま完了報告として返してはならない (実測事故 2026-07-31)。
  findings は `code_review_result` 等に要約して載せるものであり、完了報告そのものではない。

**理由 (順序が逆でも checklist の目的が損なわれない根拠)**:

1. checklist の導入意図は「code-review 実行後に commit を忘れる」= `commits_added: []` silent skip の防止である。
   commit を先に打てば、code-review の可否に関わらず `commits_added` が空にならない。
   残る窓は「自己修正後の追加 commit 忘れ」だけで、上記 2 契約がそれを塞ぐ。
2. `Skill(op-skill:op-code-review)` は Cloud subagent で使用できない実測がある (ADR-0027 5a dogfood)。
   commit 先行なら、code-review が使えなくても手動セルフレビュー fallback で apply を完走できる。
3. **v6 追記 — 順序を戻してはならない根拠**: op-codev は Section 2 の順序 (自己検証 → commit) を
   使い続けており、2026-07-31 に実際に commit を落とした (実装 → 自己検証 → High 検出 →
   自己修正まで完遂し、commit だけ落として findings JSON を返した)。
   「自己検証で見つかった問題を直す」作業に意識が移った時点が最も commit を落としやすく、
   commit 先行はその窓自体を無くす。op-codev も本節の順序へ移行した。

**op-run / op-codev 以外の Direct apply** は Cloud degrade 前提がなく、単一 commit にまとまる方が
読みやすいため **Section 2 の 5 段階順序 (code-review → commit) を維持する**。

## 3. 完了前チェックリスト

commit を打つ前に以下を **全項目 yes** にしてから進む。

```
- [ ] Static 検証 (project-profile.md のスタック別コマンド) を全て pass 確認済
      (Rust: cargo fmt --check / cargo clippy / cargo test、
       TypeScript/Vue: tsc --noEmit / lint 等、Flutter: dart format --set-exit-if-changed . / flutter analyze)
- [ ] code-review skill invoke 完了、code_review_result 取得済
      (skip 時は code_review_skip_reason 確定済)
- [ ] code-review による修正を含めて git add -A 実行済
      (commit 先行経路 = Section 2-A では、自己検証の修正を **追加 commit** として打ち済)
- [ ] git commit 実行済
- [ ] git status --porcelain が空 (uncommitted 変更を残していない)
      ← **untracked な新規ファイルも含む**。作ったが git add していないファイルが
        残っていれば、それは commit されず失われる
- [ ] 完了報告を canonical completion_report の形式で組み立て済
      (code-review の findings JSON 配列をそのまま完了報告として返していない)
- [ ] git log --format='%H' "${OP_RUN_BASE_SHA}..HEAD" で commits_added の SHA 配列を取得済、
      完了報告の commits_added フィールドに記入済 (1 件以上であること)
- [ ] git rev-list "${OP_RUN_BASE_SHA}..HEAD" --count が 1 以上であることを確認済
```

> **Static 検証コマンドの正本は `skills/_shared/project-profile.md`**。
> スタック別の正確なコマンド (Rust / Flutter / Vue / TypeScript) は同ファイルの
> 「検証コマンド (スタック別)」節を参照すること。

### 自己検証コマンド例

commit 直後、完了報告を返す前に以下のコマンドで commits_added の正確性を self-check する:

```bash
# worktree 作成時 (worktree-ops.md) に op-run controller が export した値であること
: "${OP_RUN_BASE_SHA:?OP_RUN_BASE_SHA must be set by op-run controller (phase 0-base)}"

# 新規 commit 数を確認 (1 以上であること)
git log --format='%H' "${OP_RUN_BASE_SHA}..HEAD" | wc -l

# 変更ファイル数を確認
git diff --name-only "${OP_RUN_BASE_SHA}..HEAD" | wc -l

# commits_added 配列要素数 == git log 出力行数 となること
git log --format='%H' "${OP_RUN_BASE_SHA}..HEAD"
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
> **commit 先行経路の追加警告 (Section 2-A)**: `Skill(op-skill:op-code-review)` の
> Critical / High を自己修正したのに **追加 commit を打たない**、あるいは worktree に
> uncommitted 変更を残したまま完了報告することが **contract violation** である
> (push は controller が行うため、未 commit の変更は失われる)。
>
> **v6 追加警告 (取りこぼしは機械検証される)**: controller は `op apply verify-commit` で
> worktree の実コミット集合と **dirty 状態**を実測する。未 commit の変更が残っていれば
> `UNCOMMITTED_CHANGES` で block され、completion_report は差し戻される。
> `commits_added` が正当でも、報告した以外の変更が残っていれば block される —
> 「commit は打ったから完了」ではなく「`git status --porcelain` が空になって完了」である。
>
> **v6 追加警告 (完了報告の乗っ取り禁止)**: 自己検証 skill の出力形式 (findings JSON 配列) を
> そのまま完了報告として返すことは contract violation である。2026-07-31 の実測事故では
> この乗っ取りと commit 落ちが **同時に**発生した (findings JSON を返した結果、
> `commits_added` フィールド自体が報告に存在しなかった)。
> 完了報告を書き始める前に、必ず canonical schema のフィールドを埋める形で組み立てること。
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
