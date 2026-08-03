<!--
schema_version: 4
last_breaking_change: 2026-07-31
notes: v4 (2026-07-31) — **commit 取りこぼし (UNCOMMITTED_CHANGES) の検出を gate に追加**。
       旧 gate は commits_added の「報告 SHA の正しさ」しか見ておらず、報告した以外の変更が
       worktree に残っているケースを全て素通りさせていた。push は controller が行うため、
       未 commit 分は push されず worktree cleanup で永久に失われる (commits_added は正当なので
       既存 gate は pass し、PR も CI も通る = silent loss)。
       実測事故 (2026-07-31, op-codev IU1 Step B 再実行): agent が実装 → 自己検証 → High 検出 →
       自己修正まで完遂しながら commit だけを落とし、完了報告として findings JSON 配列のみを返した。
       `op apply verify-commit` に `git status --porcelain` 検査を追加し、apply mode では
       UNCOMMITTED_CHANGES で block、exploration mode では warning に留める。
       あわせて primitive に `--base-sha` を新設 (origin 追跡 ref を持たない caller = op-codev /
       Direct apply が gate を配線できるようにする。従来 `--base-ref` は origin/<ref> 前置固定で、
       これが op-codev に gate が一つも無かった直接の原因)。
       §0 の caller 表に op-codev 行を追加、gate 3 分岐表に UNCOMMITTED_CHANGES 行を追加、
       §4 retry 文面テンプレに取りこぼし版を追加。
       v3 (2026-05-24 + 2026-05-30 整合) — gate 2 / gate 3 を `op apply verify-commit` primitive 呼び出しに置換 (Fixes #528)。
       2026-05-30 (ADR-0009 Phase C / C1) — verify の実 git 検証 (op apply verify-commit) の **実行主体**が
       op-run controller のインライン bash から op-run-fanout workflow の verify stage に移った (契約不変、実行主体の移動のみ)。
       commits_added minItems:1 / 空は contract violation の契約は不変のため schema_version は v3 据置 (bump しない)。
       op-run は workflow が返す verify.verdict (pass/fail/count_zero/partial) を受領し、gate3 recovery / PR open 可否は
       controller receipt 側に残す。本ファイル §2 の git log / primitive インライン手順は **op-run 以外の caller / レガシー経路用**として維持。詳細は §0。
       ADR-0016 (2026-06-15): op-run の apply 完了確認は ClusterOrchestrator
       (cluster-orchestrator-directives.md フェーズ2-3) が担う = commits_added 非空 (空は contract violation)
       + apply-expert の Skill(op-skill:op-code-review, ${code_review_effort}) 自己検証 (フェーズ3)。op-run-fanout workflow は ADR-0016 で削除済み。
       2026-07-29: 自己検証 skill の invoke 先は op-skill:op-code-review へ差し替え (正本 = apply-completion-checklist.md v5 /
       skills/op-code-review/SKILL.md。built-in code-review は disable-model-invocation で invoke 不可のため)。契約不変・据置。
       effort は固定 --high ではなく controller 由来の ${code_review_effort} を args として渡す
       (ADR-0030 CX-05、派生ルールの正本 = model-selection.md §5.5)。契約不変・据置。
       本ファイル §2 の `op apply verify-commit` primitive (SHA 実在 + membership) は
       op-run 以外の caller / レガシー経路用として引き続き維持。schema_version は据置 (executor 移動のみ・契約不変)。
       旧 gate は commits_added を件数照合 (ACTUAL_COUNT vs REPORTED_COUNT) のみで判定し、
       捏造 SHA / 範囲外 SHA を見逃す構造的 gap があった (2026-05-24 op-run で c1 が実在しない
       SHA を commits_added に捏造する事象を実証)。primitive が SHA 実在 (git cat-file -t) +
       membership (origin/<base>..HEAD への prefix-match) を検証し、報告 ⊄ 実 を block に倒す。
       SendMessage retry / worktrees-failed 隔離の分岐接続は維持 (挙動の本質は強化、緩和なし)。
       spec: op-tools/docs/specs/apply-verify-commit.md。
       v2 (2026-05-21) — Claude Code v2.1.146 で `/simplify` skill が `/code-review` に rename された
       (廃止ではなく改名)。本ファイル本文中 `simplify` / `/simplify` 言及を `code-review` /
       `/code-review` に更新。controller verify gate の動作 / SendMessage retry 文面 / 責務境界表は
       字面のみ更新で意味は変えない (rename のため挙動非変更)。Fixes #367。
       v1 (2026-05-21) — apply-completion-checklist.md (agent 側) の対となる
       controller 側 verify gate 正本として新設 (Fixes #286)。再演防止のため mandatory フローを確立。
-->

<!--
機能概要: op-run controller が apply spawn 完了直後に実施する commit 検証 gate の正本。
作成意図: apply agent の commits_added 未記載・捏造 SHA 事故が再演したため、controller 側で
         git log 実測による mandatory gate を確立する。
         apply-completion-checklist.md (agent 側責務) と対をなす controller 側責務の正本。
注意点: apply 検証は controller の責務であり、agent 自身は apply-completion-checklist.md を参照する。
        両ファイルの責務を混同しないこと (verify = controller, checklist = agent)。
        exploration-only spawn (investigation / post-check / review) は本 gate の対象外。
-->

# apply 完了 verify gate (apply-completion-verify)

## 0. verify 実行主体 (op-run C1 / その他 caller の分岐)

> **作成意図**: ADR-0009 Phase C / C1 で op-run の fan-out が Dynamic Workflows へ移行し、
> verify の実 git 検証 (`op apply verify-commit`) を **誰が実行するか**が caller により変わった。
> 検証の契約 (SHA 実在 + membership / commits_added minItems:1 / 空は contract violation) は
> どの caller でも不変 — 移動したのは「実行主体」のみ。

| caller | verify の実 git 検証 (`op apply verify-commit`) を誰が実行するか | controller が受領するもの |
|--------|--------------------------------------------------------------|--------------------------|
| **op-run (ADR-0016 以降)** | ClusterOrchestrator (directives.md フェーズ2-3) が commits_added 非空 + apply-expert の Skill(op-skill:op-code-review, ${code_review_effort}) 自己検証で apply 完了を確認する。§2 の `op apply verify-commit` インライン手順は op-run 以外の caller / レガシー経路用 | ClusterOrchestrator は ClusterSummary を controller に返す (`op-run-fanout` は ADR-0016 で削除済み) |
| **op-codev (v4 以降)** | op-codev controller が Step B-1 で `op apply verify-commit --base-sha "${IU_BASE_SHA}"` をインライン実行する (`skills/op-codev/SKILL.md` の Step B-1 が配線の正本) | primitive の `decision` / `blocking_reasons` / exit code を controller が直接読み、CHECKPOINT B に結果を出す |
| **op-run 以外の caller / レガシー経路** (本ファイルを参照する他 skill / インライン verify を行う経路) | **controller がインラインで** §2 の `op apply verify-commit` を実行する (従来どおり) | primitive の `decision` / `blocking_reasons` / exit code を controller が直接読む |

> **base 指定 flag の選び方**: `--base-ref <ref>` は `origin/<ref>..HEAD` として解決するため、
> worktree が origin 追跡 ref を共有する op-run 経路で使う。**main checkout 上のローカル branch で
> 作業する経路 (op-codev / Direct apply) は `origin/<ref>..HEAD` が成立しない**ため
> `--base-sha <rev>` を使う (`<rev>..HEAD` としてそのまま解決)。両者は排他かつどちらか必須。

**op-run 以外の caller / レガシー経路における verdict ↔ blocking_reasons の写像** (controller が §2 の手順をインライン実行する場合。`op-run-fanout.js` は ADR-0016 で削除済み):

| workflow verify.verdict | 対応する primitive 判定 |
|-------------------------|------------------------|
| `pass` | `decision: pass` (exit 0)。partial commit (報告 < 実、報告は全て real + member) も pass に含む |
| `fail` | `blocking_reasons` に `FABRICATED_SHA` / `NOT_IN_COMMIT_SET` (報告 SHA が捏造 / 範囲外) |
| `count_zero` | `blocking_reasons` に `COUNT_ZERO` かつ worktree 実 HEAD に commit が在る (`actual_head_commits` 非空) |
| `partial` | 報告 < 実かつ全 reported が real + member (under-report、silent cluster loss 防止用) |

**重要 — gate3 recovery / PR open 可否は controller receipt 側に残る**:

workflow は verify の **verdict を返すだけ**であり、PR open するか否かの最終判断は **controller の receipt gate** が行う
(不変則: audit と apply 可否判断の分離)。具体的には:

- `count_zero` で worktree に実 commit が在れば、controller が `verify.actual_head_commits` から実 SHA を inject し
  warning ログ出力 → PR open に proceed する (実コミットも 0 なら SendMessage retry → 失敗で隔離)。
- `partial` (reported ⊆ actual かつ全 reported が real + member) は許容し PR open に proceed する。
- `fail` (FABRICATED_SHA / NOT_IN_COMMIT_SET) は PR open に進まず SendMessage retry (§4) → 失敗で隔離。

すなわち op-run C1 では §2 の「primitive を controller がインライン実行する」記述を「workflow の verify stage が
実行し、controller は verdict を受領して §3 の分岐表に従う」と読み替える。§2 の分岐表 (gate 3) の **意味論は
そのまま controller receipt の recovery 判断として有効**。op-run 以外の caller は §2 をそのままインライン手順として使う。

## 1. 適用範囲

本ファイルは **op-run controller の Phase 2-E** (apply spawn 完了直後) にのみ適用する。

| spawn 種別 | 適用 |
|-----------|------|
| apply spawn (feature / debug / refactor / optimize / test / security / design / ux-ui-audit) | **適用する** |
| exploration-only spawn (investigation / post-check / review) | **適用しない** (`commits_added: []` が正解) |

agent 自身の完了手順は `skills/_shared/apply-completion-checklist.md` を参照。

## 2. 手順 (apply spawn 完了通知受信後に実行)

cluster apply 完了通知を受信したら、**PR open に進む前に** 以下の 4 ステップを必ず実行する。

> **実行主体 (§0 参照)**: op-run (ADR-0016 以降) は ClusterOrchestrator (directives.md フェーズ2-3) が
> commits_added 非空 + apply-expert 自己検証で apply 完了を確認する (`op-run-fanout` は ADR-0016 で削除済み)。
> op-run 以外の caller / レガシー経路では **controller が以下の手順をインラインで実行する** (従来どおり)。
> いずれの場合も検証の契約・分岐の意味論は同一。

### gate 1: completion_report の schema 確認

受け取った completion_report が canonical schema (v14 以降) に準拠しているか確認する。

```
- [ ] status フィールドが存在し、値が completed | blocked | partial のいずれか
- [ ] commits_added フィールドが存在する (undefined ではなく空配列でも存在が必要)
```

schema 違反 (フィールド自体が無い) の場合は `status: partial` とみなし gate 3 に進む。

### gate 2: `op apply verify-commit` で SHA 実在 + membership + 取りこぼし検証

旧 v2 までは `git log ... | wc -l` の **件数照合のみ** だったが、件数が一致しても報告 SHA が捏造
(object 不在) / 範囲外 (`origin/<base>..HEAD` に属さない) の場合を検出できなかった (Issue #528)。
v3 からは `op apply verify-commit` primitive で **SHA の実在と membership** を実測する。
**v4 からはさらに未 commit 変更の残置 (取りこぼし) も実測する** — 報告 SHA が全て正しくても、
報告した以外の変更が worktree に残っていれば push されずに失われるため。

```bash
# 報告 commits_added を worktree の実コミット集合に照合する
# completion_report.commits_added を JSON 配列文字列にして渡す (例: ["abc1234","def5678"])
op apply verify-commit \
  --worktree "${WT_PATH}" \
  --base-ref "${OP_RUN_BASE_REF}" \
  --reported-json "${COMMITS_ADDED_JSON}"
VERIFY_EXIT=$?
# exit 0 = pass (報告 SHA が全て実在 + 実コミット集合に属する + worktree が clean)
# exit 1 = block (decision:block。stdout JSON の blocking_reasons に理由)
# exit 99 = 内部エラー (parse / git 失敗。fail-closed)
```

> op-codev / Direct apply など origin 追跡 ref を持たない経路は
> `--base-ref "${OP_RUN_BASE_REF}"` の代わりに `--base-sha "${IU_BASE_SHA}"` を使う (§0 の注記)。

> **`commits_added` が object 配列で返ってきた場合も controller 側の事前変換は不要** (Issue #97)。
> 契約 (`expert-spawn.md`) は `string[]` が正だが、`op apply verify-commit` 側が
> `[{"sha": "...", ...}]` 形式も受理して `.sha` を抽出するため、**そのまま `--reported-json` に渡してよい**。
> `.sha` を持たない / `.sha` が string でない不正入力は exit 99 で fail-closed する
> (spec §2.3。捏造 SHA の検出能力は object 経由でも落ちない)。

primitive は decision-oriented envelope を stdout に出力する。`blocking_reasons` に
`FABRICATED_SHA` (捏造) / `NOT_IN_COMMIT_SET` (範囲外) / `COUNT_ZERO` (apply mode で報告 0 件) /
`UNCOMMITTED_CHANGES` (未 commit 変更の残置) が入る。
exploration-only spawn (investigation / review / post-check) は `--mode exploration` を付けて
`commits_added: []` を pass にする (この mode では未 commit 残置も block せず warning に留める)。
spec: `op-tools/docs/specs/apply-verify-commit.md`。

> **`UNCOMMITTED_CHANGES` は `commits_added` が正当でも立つ**。「報告 SHA が正しいか」と
> 「報告した以外の変更が残っていないか」は独立した検査であり、前者が pass でも後者で block しうる。
> `details.uncommitted_files` に `git status --porcelain` の生行 (untracked `??` を含む) が入るため、
> retry 文面にそのまま添付できる。

### gate 3: primitive 判定別分岐 (= controller receipt の recovery 判断)

> op-run C1 では primitive を実行するのは workflow の verify stage だが、**この分岐表の判断は
> controller receipt 側に残る** (§0)。controller は `verify.verdict` (pass→`decision: pass` /
> fail→FABRICATED_SHA・NOT_IN_COMMIT_SET / count_zero→COUNT_ZERO / partial→under-report) を
> 以下の表にマッピングして PR open 可否を最終判断する。

| primitive の判定 | 挙動 |
|------|------|
| `decision: pass` (exit 0) | 正常。count 不一致 (partial commit) は warnings に出るが許容。PR open に進む |
| `blocking_reasons` に `COUNT_ZERO` (報告 0 件) | controller が worktree の `git rev-list "origin/${OP_RUN_BASE_REF}..HEAD"` を確認。実コミットがあれば実 SHA を inject して warning ログ出力 → PR open。実コミットも 0 なら SendMessage retry (§4) → 失敗で `worktrees-failed/` 隔離 |
| `blocking_reasons` に `FABRICATED_SHA` (捏造 SHA) | report に実在しない SHA が混入。**PR open に進まない**。SendMessage retry (§4) を 1 回実施し、正しい実 SHA で再報告を要求。retry 失敗で `worktrees-failed/` 隔離 |
| `blocking_reasons` に `NOT_IN_COMMIT_SET` (範囲外 SHA) | report SHA は実在するが `origin/${OP_RUN_BASE_REF}..HEAD` に属さない。**PR open に進まない**。SendMessage retry (§4) を 1 回実施。retry 失敗で `worktrees-failed/` 隔離 |
| `blocking_reasons` に `UNCOMMITTED_CHANGES` (取りこぼし) | 未 commit の変更が worktree に残っている。このまま push すると **その変更は失われる**。**PR open に進まない**。`details.uncommitted_files` を添えて SendMessage retry (§4 取りこぼし版) を 1 回実施し、残りを commit させる。再検証して pass なら PR open に proceed。retry 失敗 (無応答 / 2 回目も dirty) で `worktrees-failed/` 隔離 |
| exit 99 (内部エラー) | parse / git 失敗で判定不能。fail-closed として PR open に進まず、入力 (worktree / base-ref / commits_added JSON) を確認して再実行する |

> **旧 v2 との差分**: 旧 gate は `ACTUAL>0 & REPORTED>0` を「正常」とし、件数一致なら捏造 SHA が混ざっても
> warning すら出さず通過した。v3 は report SHA が実コミットに属さなければ (`FABRICATED_SHA` /
> `NOT_IN_COMMIT_SET`) **block に倒す**。partial commit (報告 < 実、報告は全て実在 + membership 成立) は
> 従来どおり許容する。

### gate 4: 例外 (status: blocked / partial の扱い)

`completion_report.status` が `blocked` または `partial` の場合、`commits_added: []` でも
contract violation ではない。以下を確認してユーザー escalation に回す:

```
- [ ] needs_human_decision フィールドが存在し、decision_type / options / recommended_option が記載されているか
- [ ] blocked_actions[] が存在し、何が保留になっているか記述されているか
```

escalation 後は PR open しない。cluster の Status を `blocked` に更新してユーザーに提示する。

## 3. 隔離手順 (retry 失敗時)

SendMessage retry に応答がない / 2 回目の commits_added: [] が返った場合、worktree を隔離して
**op claim release を best-effort で実行**する (TTL 残存防止)。

隔離コマンド本体 (`FAIL_DIR` 算出 / `mv` / `git worktree prune`) は `worktree-ops.md (>=3)`
「cleanup コマンド」節の「失敗時の隔離」snippet が正本 (Single Canonical Source Rule)。本 gate は
それに **`op claim release` の呼び出しを追加**する差分のみ持つ:

```bash
# (worktree-ops.md「失敗時の隔離」snippet を実行した後に追加で実行する)
op claim release "${TASK_ID}" 2>/dev/null || true  # best-effort — 失敗は op claim sweep が回収
```

## 4. SendMessage retry 文面テンプレート

commit 漏れを検出した際の SendMessage 再活性化文面。以下の 4 ポイントを必ず含める。

```
worktree で `git log origin/${OP_RUN_BASE_REF}..HEAD` が空でした。
commit が 1 件も作られていない状態で完了報告が返却されています。

以下を確認してください:
1. apply-completion-checklist.md §3 の全項目を yes にしてから commit を打ってください
   (code-review による変更も含めて git add + git commit)
2. 真に no-op (修正不要) の場合は status: "blocked" または "partial" +
   needs_human_decision で返してください
3. commits_added: [] のまま apply 完了報告を返すことは contract violation です
   (_shared/expert-spawn.md v14 §controller 検証規約 / apply-completion-checklist.md §4 強警告)
4. push / PR open は司令官の責務です。commit まで完了したら canonical completion_report
   (v14 schema、commits_added: ["SHA"] 必須) を返してください

現在の worktree 状態 (参考):
- git log: 0 commits
- git status: [controller が現状を添付する]
```

### 4-A. 取りこぼし (UNCOMMITTED_CHANGES) 検出時の retry 文面

commit は打たれているが未 commit 変更が残っている場合の再活性化文面。
**「commit が 0 件」ではないため §4 の文面をそのまま使わないこと** (agent が
「commit は打った」と反論して膠着する)。事実は「打ち漏らしがある」である。

```
worktree に未 commit の変更が残ったまま完了報告が返却されています。
報告された commits_added の SHA 自体は正当ですが、それ以外に commit されていない
変更があります。

未 commit の変更 (git status --porcelain):
[controller が details.uncommitted_files をそのまま添付する]

push は司令官が行うため、**この未 commit 分は push されず失われます**。
以下を確認してください:
1. 残っている変更を確認し、意図した変更であれば git add + git commit してください
   (自己検証による修正を commit し忘れているケースが最も多い)
2. 意図しない生成物 (ビルド成果物等) であれば削除するか .gitignore に追加してください
3. 対応後、git status --porcelain が空になったことを確認してください
4. 追加 commit を含めた commits_added を canonical completion_report で再報告してください
   (apply-completion-checklist.md §3 / §4 強警告)
```

## 5. チェックリスト (controller が apply 完了通知ごとに確認)

```
- [ ] completion_report に commits_added フィールドが存在する
- [ ] op apply verify-commit を実行した (--worktree / --base-ref または --base-sha / --reported-json)
- [ ] primitive の decision / blocking_reasons / exit code を確認した
- [ ] block (FABRICATED_SHA / NOT_IN_COMMIT_SET / COUNT_ZERO / UNCOMMITTED_CHANGES) があれば
      gate 3 の分岐表に従って対処した
- [ ] status: blocked / partial の場合は needs_human_decision と blocked_actions を確認した

> **完了報告が canonical schema でない場合も gate を skip しない**。`commits_added` フィールド
> 自体が無い報告 (例: 自己検証 skill の findings JSON がそのまま返る) を受け取ったら、
> `--reported-json '[]'` として gate を実行する。worktree に変更が残っていれば
> `UNCOMMITTED_CHANGES`、残っていなければ `COUNT_ZERO` で確実に block される。
> schema 違反と commit 落ちは**同時に起きる** (2026-07-31 実測事故) ため、ここが最後の防波堤になる。
```

## 6. 強警告

> **`op apply verify-commit` が pass を返すまで PR open に進むことは禁止。**
>
> completion_report の `commits_added` は agent の自己申告であり、verify は必ず
> primitive で worktree の実コミット集合 (`origin/<base>..HEAD`) との照合を確認してから次フェーズに進む
> (op-run C1 では workflow の verify stage が primitive を実行し controller は `verify.verdict` を受領、
> op-run 以外の caller では controller がインライン実行する。§0)。
> 件数一致だけでは不十分 — 報告 SHA の **実在 (object) と membership (範囲)** を実測する。
>
> controller verify gate は **必須フロー** として扱う。
> `commits_added: []` のまま、あるいは捏造 / 範囲外 SHA を含んだまま受理して PR を open すると、
> empty commit / 実装抜け PR が repo に混入し、後続の op-merge / review-expert / CI が全て無意味になる。
>
> **v4 追加警告 (取りこぼし)**: `commits_added` が正当であることは
> 「全ての変更が commit された」ことを意味しない。未 commit 変更を残したまま push すると、
> **その変更は静かに失われる** — PR は open でき、CI も通り、review も通るため誰も気付かない。
> `UNCOMMITTED_CHANGES` を warning 扱いにして PR open に進めることは禁止。
> gate は必ず **push の前**に実行する (push 後の検出は手遅れ)。

## 7. agent 側との責務境界

| 責務 | 参照先 |
|------|--------|
| agent 側完了手順 (code-review → commit → commits_added 記入) | `skills/_shared/apply-completion-checklist.md` |
| controller 側 verify gate の契約・分岐・retry / 隔離 (canonical 正本) | **本ファイル** |
| verify の実行主体 (ADR-0016 以降、op-run) | ClusterOrchestrator (directives.md フェーズ2-3)。commits_added 非空 + apply-expert 自己検証。`op-run-fanout.js` は削除済み |
| canonical completion_report schema (v14) フィールド定義 | `skills/_shared/expert-spawn.md` |
| worktree ライフサイクル (パス規則 / 隔離先) | `skills/_shared/worktree-ops.md (>=2)` |
