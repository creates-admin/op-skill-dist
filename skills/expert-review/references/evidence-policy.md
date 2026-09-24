# evidence-policy.md — 独立性確保の手順原則

apply 担当の意図に引きずられて見落とす self-review バイアスを防ぐため、「変更前 → 仕様 → 自分の推論 → diff」の順を守る。

## 1. 読む順序 (base-first evidence procedure)

**diff だけを先に見ない。** base ref は PR の baseRef を使う (`origin/main` をハードコードしない)。

### Step -1. review worktree と HEAD の確認 (OP-managed)

```bash
cd "$REVIEW_WT"
test "$(git rev-parse HEAD)" = "$PR_HEAD_SHA" || echo "review worktree HEAD mismatch" >&2
```

不一致なら blocked (lens: Refactor / scope: blocked、worktree 取り違え) を返し、以降の評価はしない。
cd が不確実な環境ではすべて `git -C "$REVIEW_WT" ...` で書いてよい。

```text
Step 0.  BASE_REF を PR の baseRef (op pr view <N> の meta) で固定し、refspec 明示で fetch
         $ git fetch origin "$BASE_REF:refs/remotes/origin/$BASE_REF"
Step 1.  git rev-parse HEAD (reviewed_head_sha 候補)
Step 2.  PR 本文 (タイトル / 概要 / 検証記録)                    $ op pr view <N> --include both
Step 3.  関連 Issue (acceptance criteria / scope_in / scope_out / デザインモック)   $ op issue view <ISSUE>
Step 4.  review state の post-check 結果                           $ op review state pull --pr <N>
Step 5.  変更一覧を status 付きで取り、base 側を先に読む (PR diff も current tree も見ない)
         $ git diff --name-status --find-renames "origin/${BASE_REF}...HEAD"
Step 6.  base だけを読んだ状態で、PR 本文と Issue から「なぜ必要か」を推論しメモする
Step 7.  初めて PR diff を見る (triple-dot。double-dot は base 側の進行が混ざるので使わない)
         $ git diff "origin/${BASE_REF}...HEAD"
Step 8.  推論と diff のズレ・不足・副作用を探す (「意図通りか」ではなく「意図に対して不足・副作用はないか」)
Step 9.  7 lens で監査 (lens-catalog.md)
Step 10. review_result を確定 (result-decision.md)
Step 11. 構造化結果を返す (finding-schema.md)。OP-managed では投稿しない
Step 12. Step 5 で mktemp を作った場合は rm -rf で片付ける (git worktree は作らない・消さない)
```

Step 5 の status 別の読み方 (`--name-only` は A / D / R を区別できないので使わない):

| status | base 側の読み方 / 観点 |
|--------|----------------------|
| M | `git show "origin/${BASE_REF}:<path>"` → 推論メモ → diff |
| A | base は無し (git show しない)。「なぜ新規か」を Issue / PR 本文から推論し、命名・配置は近傍 (`git ls-tree origin/${BASE_REF} <dir>` / sibling の git show) で確認。silent fork・重複実装に注意 |
| D | base 側を読み、callers / imports / re-exports / public API への影響を確認 (Compatibility / Release) |
| R / C | old path のみ base から読む。new path は名前の記録だけ。import path / public API / artifact / docs への影響を確認。similarity が低い rename は M として再評価 |

review worktree は PR head に checkout 済みなので、Read tool で開くと変更後が返る。base 内容は必ず `git show` で取る。

### current tree を読んでよいタイミング

| timing | current tree (Read / Grep / cat) |
|--------|--------------------------------|
| Step 0〜7 | 禁止 (Step 7 は diff 出力だけを情報源にする) |
| Step 8 以降 | 可。呼出関係・ガード句・隣接定義などの周辺文脈確認に使う |

finding の根拠は base + diff + 仕様で組み立てる。current tree の Read は補助。

## 2. 証拠ベース

出してよい finding: 変更前ファイル + diff + Issue で証拠が揃う / 検証コマンドの再実行で確認できる / 既知パターンに明確な根拠がある。

| 禁句 | 代わりに |
|------|---------|
| 「可能性がある」「〜かもしれない」 | 観測できているか再確認。できなければ出さない |
| 「テストすれば分かる」 | 自分で確認できないなら needs-specialist-review |
| 「念のため」「将来のために」 | scope 外。別 Issue 候補として扱う |
| 「この方が綺麗」「個人的には」 | 出さない |
| 「他の expert が見るべき」 | needs-specialist-review として判定する |

## 3. evidence_grade

| 確度 | 扱い |
|------|------|
| direct (base + diff + 仕様で証拠が揃う) | 全判定に使える |
| inferred (周辺コードからの推論) | High が上限。needs-specialist-review に倒す |
| requires_runtime (実行時検証が必要) | needs-specialist-review に倒す |

## 4. 評価できない finding

- OP-managed: needs-specialist-review とし、`recommended_fix_expert` に specialist、`requires_post_check` に必要な post-check expert を入れる。質問しない。
- Direct: 専門 expert (security / ux-ui-audit / debug / test) への確認を推奨として伝え、finding に出すなら needs-specialist-review と明記する。

## 5. self-review バイアス防止

- 別 worktree・別 context で、最終 commit 後の branch だけを見る。apply 担当の context は引き継がない。
- 「自分が apply 担当ならこう書いた」ではなく「production に出る前に塞ぐべき穴は何か」を問う。
- PR 本文を疑う: 「○○を実装」と書いてあっても diff が実装しているかを照合する。
- Issue を疑う: diff が scope_in / scope_out に収まっているか、acceptance criteria を満たすかを照合する。
- post-check が PASS でも、post-check 結果と PR 本文・diff の整合を疑う。

## 6. PR 本文の品質

PR 本文も Spec / Refactor lens で監査する。品質要件は `~/.claude/skills/_shared/pr-templates.md` の「PR 本文の品質要件」。
未充足 (業務視点の欠落 / 自動検証と回帰テストの混在 / タイトル規則違反 等) は needs-fix の finding にする。

## 7. 検証コマンドの追検証

`~/.claude/skills/_shared/project-profile.md` の検証コマンドを実行して、apply の申告を追検証してよい。

| 状況 | 動作 |
|------|------|
| verification_steps が diff の範囲と一致 | 追検証は基本不要 |
| 申告に矛盾 (Rust 変更なのに `cargo check` 未実行、「Static: pass」なのに fmt 未実行 等) | Test lens の finding |
| 権限上実行できない | needs-specialist-review、`recommended_fix_expert: test-expert` / `requires_post_check: null` |

依存追加・新規ツールインストール等の破壊的操作はしない (Direct Mode でもユーザー許可必須)。

### 検証コマンド実行時の副作用確認

build / test / lint / typecheck は実行してよいが、source 編集・lockfile / snapshot / generated file の更新・formatter の一括整形・commit / push はしない。
実行後は必ず `git status --short` を確認する。tracked file に差分が出たら:

- `git restore` / `git checkout -- .` / `git stash` で戻さない。commit / push もしない。
- 副作用を finding にする (lockfile 更新 → Compatibility / 一括整形 → Refactor / generated file 更新 → Release)。
- tracked diff が残った状態では approve しない。needs-fix または needs-specialist-review にし、副作用源と再発防止策を書く。
- review worktree は controller が破棄する。修正は元の apply worktree か専用 fix worktree で行われる。

## 8. 完了条件

- active lens すべてを観測した (review_mode を反映)
- `review_result` を 4 種のいずれかに確定し、`reviewed_head_sha` を記録した
- needs-fix / needs-specialist-review / blocked では finding を field で構造化した
- 構造化結果を caller に返した (OP-managed は投稿しない。Direct はユーザー許可後のみ投稿)
