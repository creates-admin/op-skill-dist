# review-contract.md — 作業冒頭の核

<!--
機能概要: review-expert が spawn 直後に黙読する動作スニペット。
作成意図: mode 判定 / review_mode 取得 / 入力取得 / 必須手順 / 出力契約までを 1 枚で完結させ、
         他 reference に飛び回らずに review を起動できるようにする。
注意点: 本ファイルは "起動時の核"。判定軸の本体は result-decision.md、観点本体は lens-catalog.md、
       schema 詳細は finding-schema.md、境界は handoff-boundaries.md、手順原則は evidence-policy.md。
       ここに 7 lens 表や判定マトリクスを書き戻さないこと (重複保持コストが上がる)。
-->

## 1. mode 判定 (最初に必ず行う)

`~/.claude/skills/_shared/invocation-mode.md` に従って Direct / OP-managed を判定する。

### OP-managed Mode と判定する条件 (一つでも該当)

- spawn prompt に `invocation_mode: op_managed` がある
- spawn prompt に `op-run` 由来であることが明記されている
- 入力に hidden marker (`<!-- op-domain: ... -->` / `<!-- op-source: op-run -->` /
  `<!-- op-review-meta -->` / `<!-- op-post-check-meta -->` 等) が含まれる
- PR 番号 / worktree path / branch / cluster id が OP から渡されている

判定が曖昧な場合は **OP-managed Mode 寄り**に倒す (= 対話せず構造化返却)。

### OP-managed Mode の不変条件

- 司令官・ユーザーに質問して停止しない
- Issue / PR コメントで質問して待たない
- 判定は 4 種 (approve / needs-fix / needs-specialist-review / blocked) のいずれかに必ず閉じる
- review_result / reviewed_head_sha を含む構造化 review 結果を **常に**返す
  (単一 `<!-- op-review-meta -->` の組立・PR 投稿は ClusterOrchestrator の責務 =
  `op-run/references/global-review-spawn.md` §4-2-b、ADR-0011 決定6。agent 自身は投稿しない)
- needs-fix / needs-specialist-review / blocked では各 finding を finding-schema.md の field で構造化返却する
  (連番 `<!-- op-review-finding -->` の組立・投稿も controller)
- 自由質問テキスト / "判断保留" は出さず判定 4 種 + 構造化返却に閉じる。finding は観測事実たる静的証拠 (コード引用・呼出経路) で裏付けて報告する (正本: `evidence-policy.md`)

---

## 2. review_mode 取得 (OP-managed Mode のみ)

op-run は spawn prompt 内で `review_mode` を必ず指定する。本 expert は冒頭で読む。

| review_mode | 適用条件 | Security/Abuse Lens の重み |
|-------------|---------|---------------------------|
| `full` | 3.5-A (UX/UI post-check) のみ通過、または post_check_expert == null | 通常通り、フル監査 |
| `light-after-security-postcheck` | 3.5-B (security post-check) で PASS / PASS_WITH_NOTES 取得済み | 「PR 全体として新たな攻撃面が増えていないか」のみ軽く。IPC / file IO / path / capability / shell の Issue 固有再監査は再実行しない |

`light-after-security-postcheck` を確認するための補助:
- PR コメントに `<!-- op-security-post-check -->` が存在し、`audit_result` が `PASS` または `PASS_WITH_NOTES`
- `gh pr view <N> --json comments` でコメントを取得して確認できる

review_mode が未指定の場合は **safe default = `full`** とする (Security/Abuse Lens を軽くしすぎない側に倒す)。

---

## 3. 入力取得 (OP-managed Mode の標準入力)

op-run から渡される入力。spawn prompt 内に明示される。

| 入力 | 取得元 | 用途 |
|------|--------|------|
| PR 番号 | spawn prompt | `gh pr view <N>` で本文取得 |
| PR ブランチ | spawn prompt | `git diff "origin/${BASE_REF}...HEAD"` |
| base ref | `gh pr view <N> --json baseRefName --jq '.baseRefName'` | `$BASE_REF` として固定し、`origin/main` ハードコードを禁止 |
| 作業 worktree | spawn prompt (op-run が事前に作成した review 用 worktree、apply とは別) | 独立性確保。review-expert 側で worktree を作成・削除しない |
| review_mode | spawn prompt | `full` / `light-after-security-postcheck` |
| 関連 Issue 番号 | PR 本文 / Issue 指示書 | acceptance criteria / scope_in / scope_out |
| Design Plan | Issue 本文の `## 🎨 Design Plan` 節 (op-architect 由来 Issue にあれば) | UX/UI 観点の前提 |
| post-check 結果 | PR コメントの `<!-- op-ux-ui-audit -->` / `<!-- op-security-post-check -->` | 重複監査回避 / review_mode 判定 |
| reviewed_head_sha 候補 | 判定確定時の `git rev-parse HEAD` | 出力の `<!-- op-review-meta -->` に記録 |
| review_round | spawn prompt または既存の `<!-- op-review-meta -->` から推定 (1 origin) | round 上限管理 |

入力が不足している場合の扱い:

- OP-managed Mode: 質問せず `assumptions[]` に「入力 X が欠落、Y を仮定」と記録し、
  必要なら `needs_human_decision` (decision_type: "behavior") を完了報告に返す
- Direct Mode: target / mode / output が未指定なら初回確認テンプレで確認。PR コメント投稿はユーザー明示許可後、`templates/` の **「Direct Mode 投稿コマンド」節** (`<!-- op-review-report -->` マーカ) のみを使う。canonical `<!-- op-review-meta -->` は出さない (op-merge gate を不正に通すため)

---

## 4. 必須手順 (順序厳守、self-review バイアス防止)

### Read Economy 適用 (review 固有)

正本: `~/.claude/skills/_shared/read-economy.md` (R1〜R5)

review-expert は Read 比率が最も高い (全文 Read 60%、平均 2292 tok/spawn)。
以下の review 固有制約を R1〜R5 に上乗せして遵守する。

| 場面 | 制約 |
|------|------|
| base 側ファイルの取得 | `git show "origin/${BASE_REF}:<path>"` — 必要 hunk の行範囲のみ取得する。`--unified=<N>` で hunk 行数を絞ることを優先する |
| PR diff の確認 | `git diff "origin/${BASE_REF}...HEAD" -- <file>` — 変更ファイル単位で取得し、無関係ファイルを context に積まない |
| Step 8 以降の current tree Read | `offset` / `limit` パラメータを活用し、diff で参照した行番号の前後 N 行のみ Read する (R3 遵守) |
| 既読ファイルの再参照 | context から参照する (R1 / R5)。「念のため確認」目的の re-Read 禁止 |

**全文 Read は「全文が必要と分かっている」場合のみ許容する**。
まず `grep` で行番号を特定し、前後の必要範囲のみ Read するパターンを優先する。

**手順の正本は `evidence-policy.md`** (Step -1〜12、実行可能な git コマンド + status 別判定規則付き)。
ここでは要約のみを持つ (詳細をここに書き戻さない):

1. Step -1: `<REVIEW_WT>` へ cd し HEAD == `<PR_HEAD_SHA>` を verify (OP-managed 必須。不一致は blocked 返却)
2. Step 0: base ref を解決し `git fetch origin "$BASE_REF:refs/remotes/origin/$BASE_REF"` (refspec 明示。origin/main ハードコード禁止)
3. Step 1〜4: HEAD SHA 取得 → PR 本文 → 関連 Issue (acceptance criteria / scope / Design Plan) → post-check 結果コメント
4. Step 5: `git diff --name-status --find-renames` で変更一覧を取り、base 側を `git show "origin/${BASE_REF}:<path>"` で**先に**読む
   (M/A/D/R の status 別判定規則・worktree 作成禁止・mktemp 運用は evidence-policy.md Step 5 が正本)
5. Step 6〜8: 変更理由を自分で推論メモ → 初めて `git diff "origin/${BASE_REF}...HEAD"` (**triple-dot 必須**) → 推論と diff のズレ・見落としを探す
6. Step 9〜10: 7 lens で横断 review (review_mode 反映) → review_result を 4 種に確定 (3 条件 AND)
7. Step 11: 結果を**構造化返却**する。OP-managed では `<!-- op-review-meta -->` / `<!-- op-review-finding -->` の
   組立・PR コメント投稿・label 操作は **ClusterOrchestrator / op-run の責務**
   (`op-run/references/global-review-spawn.md` §4-2-b、ADR-0011 決定6)。Direct Mode はユーザー許可後に `<!-- op-review-report -->` のみ
8. Step 12: mktemp を作った場合は `rm -rf` で片付ける (`git worktree remove` は使わない)

**diff だけを先に見ない**ことが本 expert の独立性の核。current tree (Read / Grep / cat) の読み取り解禁は
Step 7 (PR diff 確認) の後に限る (詳細は `evidence-policy.md`)。

---

## 5. 出力契約 (4 種の review_result)

詳細判定は `result-decision.md`、schema は `finding-schema.md`。
下表の「必須出力」は **controller (ClusterOrchestrator) が構造化返却から組み立てて投稿する最終 PR コメント**
の構成を示す (§4-2-b)。review-expert 自身は verdict + findings の構造化返却までを担う。

| review_result | 必須出力 | label 提示 (op-run が付与) |
|--------------|---------|---------------------------|
| `approve` | `<!-- op-review-meta -->` のみ | `pro-reviewed` 付与 / `pro-review-needs-fix` / `pro-review-fix-in-progress` / `pro-review-blocked` 削除 |
| `needs-fix` | `<!-- op-review-meta -->` + finding(s) | `pro-review-needs-fix` 付与 / `pro-reviewed` 削除 |
| `needs-specialist-review` | `<!-- op-review-meta -->` + finding(s) | `pro-review-needs-fix` 付与 / `pro-reviewed` 削除 (specialist handoff 用) |
| `blocked` | `<!-- op-review-meta -->` + finding(s) | `pro-review-blocked` 付与 / `pro-reviewed` 削除 / `pro-review-fix-in-progress` 削除 |

**review-expert は label を直接付与しない**。コメント本文で「op-run が付与する想定の label」を提示するに留める。
canonical な label 操作は op-run フェーズ4 の 4-3 「レビュー結果の統合」が担当する。

---

## 6. 完了報告 (司令官への返却)

op-run への報告は以下を含む。

- review_result (approve / needs-fix / needs-specialist-review / blocked)
- reviewed_head_sha
- review_round (今回の round 番号)
- finding 一覧 (id / result / lens / scope / recommended_fix_expert / requires_post_check)
- review_mode (full / light-after-security-postcheck)
- assumptions / needs_human_decision / blocked_actions (OP-managed Mode で不足情報があった場合)

PR コメント URL は返さない (OP-managed では review-expert は投稿せず、marker 組立・投稿は
controller の責務 = §4-2-b。Direct Mode でユーザー許可後に自己投稿した場合のみ URL を報告する)。

### finding 一覧の簡潔化ルール

finding 一覧を完了報告に含める際は、**冗長な本文転記を禁止**する。
finding 本文の全文コピーは controller への report 転送量を増大させる
(subagent_report 取り込みが controller コストの 14.9% を占める実測値に基づく)。

| 項目 | 方針 |
|------|------|
| finding 内容の参照 | `id: RVW-001` + `lens` + `scope` + `recommended_fix_expert` のフィールドのみを列挙する |
| 根拠 / 問題詳細 | 構造化 finding の `summary` / `evidence` field (file:line 付きの短文) に収める。長文 prose の転記は禁止 |
| 全文テキスト | 構造化 finding field で代替する (controller が §4-2-b で marker 化して投稿する) |

例 (簡潔な finding 一覧):

```
findings:
  - id: RVW-001, lens: Test / Regression, scope: same-pr, recommended_fix_expert: test-expert
  - id: RVW-002, lens: Security / Abuse, scope: new-issue, recommended_fix_expert: security-expert
```

finding 本文 (問題 / 根拠 / 推奨方針) は controller が構造化返却から組み立てて投稿する
PR コメントの `<!-- op-review-finding -->` block が公開正本になる。

### v14 必須フィールド (review-expert は exploration-only)

review-expert は **コードを編集・commit しない** exploration-only 専任である (_shared/expert-spawn.md v14)。
そのため、以下の値が review 完了報告の正解となる:

- `commits_added: []` — commit を一切行わないため空配列が正解 (apply spawn とは異なり contract violation ではない)
- `code_review_invoked: false` — code-review skill (旧 simplify) は apply 専用、review では呼ばない
- `code_review_skip_reason: "review is read-only, no apply performed"` — code_review_invoked: false の場合必須
- `verification_executed: []` — review は diff/spec 読みのみ (build / test は実行しない)

これらを完了報告に明示することで、controller が review spawn と apply spawn を
機械的に区別できる (空 commits_added を contract violation 誤検知しない)。

---

## 7. 禁止事項 (起動時に必ず想起する)

禁止事項の**単一正本は `handoff-boundaries.md` §8「禁止事項完全版」** (ここに列挙を重複保持しない)。
起動時は特に次の 3 点を想起する:

- コード編集 / commit / push / merge / label 直接付与の禁止 (監査専任。修正は op-run が specialist に再委任)
- OP-managed Mode での対話質問 / 自由質問テキスト / "判断保留" の禁止 (判定 4 種 + 構造化返却に閉じる)
- finding は観測事実たる静的証拠 (コード引用・呼出経路) で裏付けて報告する (憶測 finding は出さない。正本: `evidence-policy.md`)
