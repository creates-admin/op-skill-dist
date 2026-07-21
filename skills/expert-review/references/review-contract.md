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
- `<!-- op-review-meta -->` block を **常に**出す
- needs-fix / needs-specialist-review / blocked では各 finding に `<!-- op-review-finding -->` block を出す
- 自由質問テキスト / "判断保留" / 「テストすれば分かる」相当は禁句

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

`evidence-policy.md` の詳細手順 (実行可能な git コマンド付き) に従う。要約:

```text
-1. **作業ディレクトリの強制 cd と HEAD SHA 一致 verify (OP-managed Mode 必須)**
   spawn prompt の `<REVIEW_WT>` / `<PR_HEAD_SHA>` を使い、すべての git/gh/Read を
   review worktree 上で実行する状態を確定させる。
     cd "<REVIEW_WT>"
     test "$(git rev-parse HEAD)" = "<PR_HEAD_SHA>"
   不一致なら親 repo / 別 worktree で実行されている可能性があるため、判定 blocked を返し
   op-run controller に worktree 取り違えを報告する (finding lens: Refactor / scope: blocked)。
   reviewed_head_sha の根拠が崩れた状態でレビューを続けてはならない。
0. base ref を解決して固定: $BASE_REF=$(gh pr view <N> --json baseRefName --jq '.baseRefName')
   git fetch origin "$BASE_REF:refs/remotes/origin/$BASE_REF"
   (refspec 明示形式。bare 形式 `git fetch origin "$BASE_REF"` は環境差で
    refs/remotes/origin/$BASE_REF が更新されないことがあるため使わない。
    op-run/SKILL.md の review worktree 作成側と同一形式)
   以降の手順では origin/${BASE_REF} を使う (origin/main ハードコード禁止)
1. 現在 head SHA を取得 (reviewed_head_sha 候補): `git rev-parse HEAD`
2. PR 本文を読む (タイトル / 概要 / 検証記録): `gh pr view <N> --json title,body,baseRefName`
3. 関連 Issue / acceptance criteria / scope_in / scope_out / Design Plan を読む
4. required post-check 結果コメントを読む (<!-- op-ux-ui-audit --> / <!-- op-security-post-check -->)
5. **変更ファイル一覧を status 付きで取得し、base 側 (origin/${BASE_REF}) のファイルを先に読む** (PR diff も現在ツリーも見ない)
   - `git diff --name-status --find-renames "origin/${BASE_REF}...HEAD"` で対象ファイルを列挙する
     (`--name-only` は使わない。A / D / R が見分けられず、新規追加ファイルに対して
      `git show origin/${BASE_REF}:<path>` を実行して fatal error になる事故を防ぐ)
   - status 別の取り扱い (詳細は `evidence-policy.md` Step 5-b / 5-d):
     - `M`: base 側を `git show "origin/${BASE_REF}:<path>"` で読む
     - `A`: base に path がないため **base 内容を取得しない** (= /dev/null 扱い)。
            「なぜ新規ファイルが必要か」を Issue / Design Plan / 近傍ファイル (`git ls-tree` 等) から推論
     - `D`: base 側を読み、削除理由と callers / imports / public API surface への影響を検証
     - `R`: **Step 5 時点では old path のみ base から `git show "origin/${BASE_REF}:<old>"` で読む**。
            new path は **ファイル名として記録するだけ** にとどめ、内容の確認は Step 7 (`git diff`)
            または Step 8 以降の current tree 読みで行う (base-first / no current tree before diff の不変条件を守る)。
            similarity score で書き換え度合いを判断し、rename が import path / API / release artifact / docs に
            与える影響を Compatibility / Release lens で確認
   - **現在 worktree は PR ブランチに checkout されているので、Read tool で開くと「変更後」が返る**
   - base 内容の取得は **`git show "origin/${BASE_REF}:<path>"` のみ**を使う
     (review-expert は worktree を作成・削除しない契約 / handoff-boundaries §8-1)。
     temp file が必要なら mktemp -d + mkdir -p のうえ stdout を redirect する。
6. 変更が「なぜ必要か」を自分で推論しメモする
7. 自分の推論を持ったうえで、初めて PR diff を見る
   - `git diff "origin/${BASE_REF}...HEAD"` (**triple-dot 必須**)。double-dot は base 進行が混じるので禁止
8. 推論と diff のズレ・見落としを探す (「意図通りなら問題なし」ではなく「意図に対して不足はないか / 副作用はないか」を疑う)
9. 7 lens で横断 review (review_mode に応じて Security/Abuse Lens の重みを切り替え)
10. review_result を決定 (4 種に閉じる、3 条件 AND を機械的に確認)
11. <!-- op-review-meta --> + (必要なら) <!-- op-review-finding --> を出力
12. PR コメントとして投稿 (templates/ から該当テンプレを選ぶ)
13. label 操作は op-run の責務。本 expert はコメント本文で必要 label 種別を提示するに留める
14. Step 5 で mktemp ベースの一時ディレクトリを作った場合は `rm -rf` で片付ける (`git worktree remove` は使わない)
```

**diff だけを先に見ない**ことが本 expert の独立性の核。
**base ファイルは現在ツリーから読めない** (PR ブランチに checkout 済みのため) ので
`git show "origin/${BASE_REF}:<path>"` を必ず使う。worktree 作成は禁止 (handoff-boundaries §8-1)。

**current tree (Read / Grep / cat) の読み取り禁止は Step 7 (PR diff の確認) の前まで**に限る。
Step 8 以降は周辺文脈確認のため current tree を Read してよいが、base-first evidence procedure を
置き換えてはならない (finding 根拠の主役は base + diff + 仕様 / Issue)。詳細は `evidence-policy.md`。

---

## 5. 出力契約 (4 種の review_result)

詳細判定は `result-decision.md`、schema は `finding-schema.md`。

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
- 投稿した PR コメント URL (gh pr comment の出力から)

### finding 一覧の簡潔化ルール

finding 一覧を完了報告に含める際は、**冗長な本文転記を禁止**する。
finding 本文の全文コピーは controller への report 転送量を増大させる
(subagent_report 取り込みが controller コストの 14.9% を占める実測値に基づく)。

| 項目 | 方針 |
|------|------|
| finding 内容の参照 | `id: RVW-001` + `lens` + `scope` + `recommended_fix_expert` のフィールドのみを列挙する |
| 根拠 / 問題詳細 | PR コメントの `<!-- op-review-finding -->` block に書かれているため、完了報告への転記は禁止 |
| 全文テキスト | 「PR コメント URL を参照」で代替する |

例 (簡潔な finding 一覧):

```
findings:
  - id: RVW-001, lens: Test / Regression, scope: same-pr, recommended_fix_expert: test-expert
  - id: RVW-002, lens: Security / Abuse, scope: new-issue, recommended_fix_expert: security-expert
pr_comment_url: https://github.com/owner/repo/pull/N#issuecomment-XXXXXX
```

finding 本文 (問題 / 根拠 / 推奨方針) は PR コメントの `<!-- op-review-finding -->` block が正本。

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

- コード編集 / commit / push / merge / label 直接付与
- `needs-fix-applied` 判定の使用 (本判定は廃止)
- post-check expert としての振る舞い (`<!-- op-post-check-expert: review-expert -->` 指定は禁止)
- `op-domain: review` の Issue routing 出力 (review 状態は label で表現)
- PR 本文の typo 修正 / push (typo は finding (Spec / Refactor) で残す)
- security 深掘り再監査の代替 (security-expert の責務)
- UX/UI 専門 a11y / Applicable States 監査の代替 (ux-ui-audit-expert の責務)
- 「可能性がある」「テストすれば分かる」「〜かもしれない」相当
- ガイドラインの機械的全適用 (7 lens は判断材料、絶対ではない)
- OP-managed Mode で対話質問 / 自由質問テキスト

完全版は `handoff-boundaries.md` の禁止事項節を参照。
