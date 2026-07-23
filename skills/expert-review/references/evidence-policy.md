# evidence-policy.md — 独立性確保の手順原則

<!--
機能概要: review-expert が PR を読む順序・証拠ベースの考え方・評価できない finding の扱いを規定する。
作成意図: self-review バイアス (= apply 担当の意図に引きずられて見落とす現象) を構造的に防ぐ。
         「diff だけ見て判定」を物理的に不可能にし、変更前ファイル → 仕様 → 推論 → diff の順を強制する。
注意点: 本ファイルは "手順原則"。観点や判定軸はここに書かない (lens-catalog / result-decision に分離)。
       手順を変える破壊的変更時は SKILL.md / agent.md の索引も同期する。
-->

## 1. 読む順序 (絶対)

review-expert は以下の順序で PR を読む。**diff だけを先に見ない**。

base ref は **PR の baseRefName を参照**する (`origin/main` 固定ではない。release / develop / hotfix
branch を base にする可能性があるため、ハードコードすると誤差分・誤検出の原因になる)。

### Step -1. 作業ディレクトリの強制 cd と HEAD SHA 一致 verify (OP-managed Mode 必須)

review-expert は op-run controller が事前に作成した review 用 worktree (`<REVIEW_WT>`) で動作する前提。
spawn prompt から `<REVIEW_WT>` と `<PR_HEAD_SHA>` を受け取り、最初に以下を実行する。

```bash
cd "$REVIEW_WT"
ACTUAL_HEAD=$(git rev-parse HEAD)
test "$ACTUAL_HEAD" = "$PR_HEAD_SHA" || {
  echo "❌ review worktree HEAD mismatch: expected=$PR_HEAD_SHA actual=$ACTUAL_HEAD" >&2
  # 判定 blocked (finding lens: Refactor / scope: blocked) を返し、worktree 取り違えを報告
  # 以降の評価は実施しない (reviewed_head_sha の根拠が崩れているため)
}
```

cd 強制の理由:
- agent 実行環境が想定とズレると、後続の `git diff origin/${BASE_REF}...HEAD` /
  `git rev-parse HEAD` / `git show origin/${BASE_REF}:<path>` が親 repo / 別 worktree で
  実行され、見ているファイルと記録される `reviewed_head_sha` がズレる
- op-merge の stale gate は `reviewed_head_sha == 現在 HEAD` を根拠にしているため、
  ズレが起きると stale 判定全体が無効化する
- 安全側に倒す場合はすべての git コマンドを `git -C "$REVIEW_WT" ...` 形式で書いてもよい

```text
Step 0. PR の base ref を解決し、$BASE_REF として固定する
        $ BASE_REF=$(gh pr view "$PR_NUMBER" --json baseRefName --jq '.baseRefName')
        # refspec を明示することで refs/remotes/origin/$BASE_REF を確実に更新する。
        # `git fetch origin "$BASE_REF"` のみだと環境 (custom refspec / shallow clone 等) によっては
        # FETCH_HEAD だけ更新され、後続で参照する origin/${BASE_REF} が古いまま残る事故が起きる。
        # op-run/SKILL.md の review worktree 作成側 (review-expert spawn 直前) と同一の形式に揃える。
        $ git fetch origin "$BASE_REF:refs/remotes/origin/$BASE_REF"
        以降の手順では origin/main をすべて origin/${BASE_REF} に置き換える

Step 1. 現在 head SHA を取得 (reviewed_head_sha 候補)
        $ git rev-parse HEAD
Step 2. PR 本文を読む (タイトル / 概要 / 検証記録 / verification_steps の充足)
        $ gh pr view "$PR_NUMBER" --json title,body,baseRefName
Step 3. 関連 Issue を読む (acceptance criteria / scope_in / scope_out / Design Plan)
        $ gh issue view "$ISSUE_NUMBER"
Step 4. required post-check 結果コメントを読む
        - <!-- op-ux-ui-audit -->     (3.5-A 通過の証跡)
        - <!-- op-security-post-check --> (3.5-B 通過の証跡 = light-after-security-postcheck の根拠)
        $ gh pr view "$PR_NUMBER" --json comments --jq '.comments[].body'
Step 5. **変更ファイル一覧を status 付きで取得し、base 側 (origin/${BASE_REF}) のファイルを先に読む** (PR diff も現在ツリーも見ない)
        $ git diff --name-status --find-renames "origin/${BASE_REF}...HEAD"
        # 判定規則 (status 別):
        # - `--name-only` は禁止 (A / D / R を見分けられず、A 行に git show して fatal になる)
        # - base 内容の取得は `git show "origin/${BASE_REF}:<path>"` のみ。worktree 作成は禁止
        #   (handoff-boundaries §8-1)。temp file が必要なら mktemp -d + mkdir -p の上で
        #   stdout を redirect し、終了時に rm -rf する (Step 12)
        # - R/C の similarity (R094 等) が低い rename は実質書き換えとして Step 7/8 で M に近い扱いで再評価
        #
        #  | status | base 側の読み方 / 評価観点 |
        #  |--------|--------------------------|
        #  | M      | base 側を git show で読む → 推論メモ → diff の順で 7 lens 検証 |
        #  | A      | base = /dev/null 扱い (git show しない)。「なぜ新規か」を Issue / PR 本文 / Design Plan から推論メモし、命名・配置は近傍 path (`git ls-tree origin/${BASE_REF} <dir>` / sibling の git show) で確認。silent fork / 重複実装に特に注意 |
        #  | D      | base 側を git show で読み、削除理由と callers / imports / re-exports / public API surface への影響を diff から横断確認 (Compatibility / Release lens) |
        #  | R (C)  | Step 5 時点では **old path のみ** base から git show で読む。new path は **ファイル名の記録だけ** に留める (内容確認は Step 7 の diff / Step 8 以降 = base-first / no current tree before diff)。rename の import path / public API / release artifact / docs への影響を Compatibility / Release / Spec lens で確認 |
Step 6. 変更が「なぜ必要か」を自分で推論しメモする (base のみを読んだ状態で、PR 本文と Issue から動機を再構成)
Step 7. 自分の推論を持ったうえで、初めて PR diff を見る (triple-dot で merge-base 差分を取る)
        $ git diff "origin/${BASE_REF}...HEAD"
        # double-dot (origin/${BASE_REF}..HEAD) は使わない (base 側の進行が混じり差分が乱れる)
Step 8. 推論と diff のズレ・見落としを探す
        - 「意図通りなら問題なし」ではなく「意図に対して不足はないか / 副作用はないか」を疑う
Step 9. 7 lens で横断 review (lens-catalog.md)
Step 10. review_result を決定 (result-decision.md)
Step 11. review 結果 (verdict + findings) を構造化返却する (field: finding-schema.md / review-markers.md)。
        OP-managed では <!-- op-review-meta --> / <!-- op-review-finding --> の組立・PR コメント投稿は
        ClusterOrchestrator の責務 (op-run/references/global-review-spawn.md §4-2-b、ADR-0011 決定6)。
        review-expert 自身は gh pr comment しない。Direct Mode はユーザー許可後に
        <!-- op-review-report --> のみ投稿可 (templates/ の Direct Mode 節)
Step 12. Step 5 で mktemp ベースの $TMP_BASE を作った場合は終了時に削除する
        $ rm -rf "${TMP_BASE}"
        ※ git worktree は作成・削除しない (handoff-boundaries §8-1 で禁止)。
```

**Step 5 の重要点 — 「現在ツリーの Read = 変更後」問題**:
op-run のレビュー用 worktree は PR ブランチに checkout 済みのため、Read tool で path を開くと **変更後ファイル**
が返ってくる。「base を読む」契約を実行可能にするには、`git show "origin/${BASE_REF}:<path>"` で base 内容を
取り出して context に取り込む。git worktree を新たに作って Read で開く方法は **review-expert には禁止**
(handoff-boundaries §8-1 「worktree の作成・削除」禁止条項に該当)。worktree が必要な場合は op-run 側で
事前に作成し、review-expert には read-only path として spawn prompt 経由で渡す。

**Step 7 で triple-dot を使う理由**:
`git diff "origin/${BASE_REF}..HEAD"` (double-dot) は「現在ツリーと base の差分」を直接取るため、base 側に
別の commit が積まれているとそれも差分に紛れ込む。`"origin/${BASE_REF}...HEAD"` (triple-dot) は merge-base
からの PR 固有差分のみを返すため、PR の touch 範囲を正確に切り出せる。

Step 5 〜 7 は **self-review バイアス防止の核**。spawn prompt を読んだ瞬間に
diff に飛びたくなるが、それをすると「apply 担当の意図に引きずられて見落とす」現象が起きる。

### current tree (Read tool) を読んでよいタイミング

current tree (= PR head に checkout 済みの review worktree。Read tool / Grep / cat 等で開く) の
**読み取り禁止は Step 7 (PR diff の確認) の前まで** に限る。

| timing | current tree (変更後) を Read してよいか |
|--------|------------------------------------|
| Step 0 〜 Step 6 (base / PR 本文 / Issue / 推論メモまで) | **禁止**。base-first procedure を物理的に守る |
| Step 7 (`git diff` で初めて変更を見る瞬間) | **禁止**。diff の出力だけを情報源にする |
| Step 8 以降 (推論と diff のズレ確認 / 7 lens 検証 / finding 起票) | **可**。変更後の周辺文脈確認に Read / Grep / cat を使ってよい |

「diff 確認後の Read 解禁」の趣旨:
- diff 単独では呼び出し関係 / 周辺ガード句 / 隣接定義の文脈が読みにくい場合がある
- そのような周辺文脈の補足参照には current tree の Read が必要
- ただし **base-first evidence procedure を置き換えてはならない**:
  - 「変更前を読んでから推論」は Step 5〜6 で必ず完了させる
  - 「diff を見る前に current tree を読んで意図を補強」は禁止 (self-review バイアスが発動する)
  - finding の根拠は base + diff (+ 仕様 / Issue) で組み立てる。current tree の Read は補助に留め、finding 本文の「根拠」フィールドの主役にしない

current tree を Read するときは「すでに base / 推論 / diff を見終えた後の文脈確認である」ことを
自分で意識する。Step 5 で base を読まずに current tree を Read するのは禁止行為。

---

## 2. 証拠ベースの考え方

review-expert は **観測事実に基づく断定的 finding** のみを出す。

### 出してよい finding

- 静的に確認できる: 変更前ファイル + diff + Issue 本文で証拠が揃う
- 検証コマンド実行で確認できる: 必要なら apply の verification_steps を再実行して確認できる
- 既知パターン: 本 expert / 他 expert の reference に明確な根拠がある

### 出してはいけない finding (禁句)

| 禁句 | なぜ禁止 |
|------|---------|
| 「可能性がある」「〜かもしれない」 | 観測ではなく憶測。これを許すと finding がノイズ化する |
| 「テストすれば分かる」 | 自分が確認できないなら finding に出さず、検証不能なら needs-specialist-review |
| 「念のため」「将来のために」 | scope_in を超える指摘は scope_out なので別 Issue 化 |
| 「この方が綺麗」「個人的には」 | 個人嗜好は finding ではない (Refactor lens でも避ける) |
| 「他の expert が見るべき」 | それは needs-specialist-review として明示的に判定する |

「可能性がある」と書きそうになったら、そもそも観測できているのかを再確認する。

---

## 3. evidence_grade の対応関係

domain expert の canonical schema に倣い、本 expert の finding にも evidence の確度を意識する。

| 確度 | 説明 | review-expert の扱い |
|------|------|---------------------|
| direct | 静的に確認可能 (変更前ファイル + diff + 仕様で証拠が揃う) | needs-fix / needs-specialist-review / blocked のいずれにも使える |
| inferred | 周辺コードからの推論 (証拠は間接的) | High が上限。needs-specialist-review に倒す |
| requires_runtime | 実行時検証が必要 (静的では不確実) | review-expert は実行時検証を持たない場合が多い → needs-specialist-review に倒す |

review-expert は通常 `direct` を主軸にする。`inferred` / `requires_runtime` は specialist 判断が望ましい。

---

## 4. 評価できない finding の扱い

review-expert が「気になるが断定できない」場合の動作。

### Direct Mode

- ユーザーに「この観点は専門 expert (security-expert / ux-ui-audit-expert / debug-expert / spec-expert) に確認を依頼することを推奨」と伝える
- finding として出す場合は明確に「needs-specialist-review」とラベルする

### OP-managed Mode

- `needs-specialist-review` 判定で `recommended_fix_expert` に該当 specialist を提案する
- `requires_post_check` に必要な post-check expert を記録する
- 質問テキストは出さない。判定 block で意思を示す

---

## 5. self-review バイアス防止の工夫

### 5-1. 別 worktree

op-run フェーズ4 は **review 用の別 worktree** を用意する。apply の worktree とは物理的に分離。
review-expert は apply 中の状態を見ず、**最終 commit 後の clean な branch だけを見る**。

### 5-2. 別 context

review-expert は別 Agent として spawn される。apply 担当の expert の context は引き継がない。
spawn prompt に渡される情報だけを source of truth とする。

### 5-3. 「書いていない第三者を演じる」

spawn prompt に「あなたはこの PR を書いていない独立 reviewer」と明記される。
本 expert は **apply 担当の意図を擁護しない**。

「自分が apply 担当ならこう書いた」を考えると self-review に陥る。
代わりに「外部監査人として、この PR が production に出る前に塞ぐべき穴は何か」を問う。

### 5-4. PR 本文を **疑う**

PR 本文に「○○を実装しました」と書いてあっても、**diff が本当に ○○ を実装しているか**は別問題。
PR 本文と diff を照合し、ズレがあれば finding (Spec / Refactor lens) として残す。

### 5-5. Issue を **疑う**

Issue 指示書に scope_in / scope_out が定義されていても、**diff がそれに収まっているか**は別問題。
scope_out 違反 / 過剰実装 / acceptance criteria 未達は finding として残す。

---

## 6. PR 本文の品質レビュー

review-expert はコードだけでなく PR 本文も独立に lens 7 (Spec / Refactor) で監査する。
完全な品質要件 (必須項目 / 禁止事項 / 判断基準) は
`~/.claude/skills/_shared/pr-templates.md` の「PR 本文の品質要件」セクションを参照。

要件未充足 (二層構造の崩れ / 自動検証と回帰テストの混在 / 業務視点欠落 / タイトル規則違反など) は
**needs-fix の finding (Spec / Refactor lens)** として残す。

---

## 7. 検証コマンドの追検証

review-expert は diff の内容に応じて `~/.claude/skills/_shared/project-profile.md` の検証コマンドを実行し、
apply が記載した検証レベルが正しいか追検証してよい。

| 状況 | 動作 |
|------|------|
| apply が verification_steps を記載しており、それが diff の変更範囲と一致 | 追検証は基本不要 (信頼) |
| apply の記載に矛盾がある (Rust 変更なのに `cargo check` 未実行など) | finding (Test / Regression Lens) として残す |
| 検証コマンドが本 expert の権限で実行不能 | `needs-specialist-review` に倒し、`recommended_fix_expert: test-expert` / `requires_post_check: null` とする (test-expert は post-check expert ではなく specialist / apply 側 expert として扱う。`requires_post_check` の enum は `ux-ui-audit-expert` / `security-expert` / `null` のみ) |

破壊的変更や新規ツールインストールは禁止 (Direct Mode でもユーザー許可必須)。

### 検証コマンド実行時の副作用確認 (必須)

review-expert は検証コマンドを実行してよいが、**編集者ではない**。
build / test / lint / typecheck などはツールが副作用として cache / coverage / snapshot /
generated file / lockfile / dist / formatter output を書き換える可能性がある。

許可:
- build / test / lint / typecheck などの検証コマンド実行
- disposable な cache / temporary artifact の生成

禁止:
- source file の意図的編集
- lockfile の更新
- snapshot の更新
- generated committed file の更新
- formatter による一括整形
- commit / push

検証コマンド実行後は必ず以下を確認する。

```bash
git status --short
```

tracked file に差分が出た場合の **canonical 動作** (review-expert は触らず報告して worktree 破棄):

| 動作 | 説明 |
|------|------|
| **触らない** | review-expert は差分を `git restore` / `git checkout -- .` / `git stash` などで復元しない。`git restore` を許すと「編集禁止」契約が濁り、状況によっては未 push の手作業を巻き込んで上書きする事故が起きる |
| **commit / push しない** | 副作用差分を commit / push してはならない |
| **finding 化して報告する** | 検証コマンドの副作用であることを finding として記録する (例: lockfile 自動更新 → Compatibility lens / formatter による一括整形 → Refactor lens / generated file 更新 → Release lens) |
| **approve しない** | tracked diff が残った状態では `review_result = approve` を返さない (clean working tree が approve の前提)。`needs-fix` または `needs-specialist-review` に倒し、副作用源と再発防止策を finding に書く |
| **修正は委任する** | 修正は op-run / apply expert 側に委任する (review-expert は監査専任) |
| **worktree は op-run が破棄する** | review 用 worktree は **disposable** であり、review-expert 終了後に op-run controller が `git worktree remove` で破棄する。review-expert 側で副作用を巻き戻す必要はない (worktree ごと捨てるため) |

review-expert がこの手順を守るべき理由:

- 副作用を残したまま review を完了させると、後続の `git status` 検証や op-merge stale gate を
  誤動作させる原因になる
- review-expert に `git restore` を許すと「編集禁止」「監査専任」の境界が崩れ、何が「review-expert が
  書き換えて消したもの」で何が「apply 側が残した副作用」だったかが追跡不能になる
- 「触らず報告して worktree 破棄」が一番きれいな責務分離

実装ガイド (op-run controller 側):
- review worktree は 4-1 で disposable 前提で作成する (`auto/review-${TASK_ID}-pr-${PR_NUMBER}-<unix-ts>`)
- review-expert の判定確定後、controller は review worktree を `git worktree remove --force` で破棄する
- 副作用 finding が残った場合、修正の apply は **元の apply worktree** か **専用の fix worktree** で行う
  (副作用が残った review worktree を fix に流用しない)

---

## 8. 完了条件 (どうなったら終わり)

review-expert は以下をすべて満たすまで終わらない。

- 7 lens すべての観点で観測 (review_mode に応じて Security/Abuse Lens の重みを調整)
- review_result を 4 種のいずれかに確定
- reviewed_head_sha を確定し、構造化 review 結果 (verdict + meta field) に含める
- needs-fix / needs-specialist-review / blocked の場合は各 finding を finding-schema.md の field で構造化記録
- 構造化 review 結果を caller (ClusterOrchestrator / op-run) に返却。
  `<!-- op-review-meta -->` / `<!-- op-review-finding -->` の組立・PR コメント投稿は
  **controller の責務** (`op-run/references/global-review-spawn.md` §4-2-b、ADR-0011 決定6)。
  Direct Mode のみ、ユーザー許可後に `<!-- op-review-report -->` で参考投稿してよい
- caller への完了報告 (review_result + reviewed_head_sha + finding 一覧)
