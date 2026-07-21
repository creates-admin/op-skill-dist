<!--
schema_version: 3
last_breaking_change: 2026-05-24
notes: v3 (2026-05-24 + 2026-05-30 整合) — gate 2 / gate 3 を `op apply verify-commit` primitive 呼び出しに置換 (Fixes #528)。
       2026-05-30 (ADR-0009 Phase C / C1) — verify の実 git 検証 (op apply verify-commit) の **実行主体**が
       op-run controller のインライン bash から op-run-fanout workflow の verify stage に移った (契約不変、実行主体の移動のみ)。
       commits_added minItems:1 / 空は contract violation の契約は不変のため schema_version は v3 据置 (bump しない)。
       op-run は workflow が返す verify.verdict (pass/fail/count_zero/partial) を受領し、gate3 recovery / PR open 可否は
       controller receipt 側に残す。本ファイル §2 の git log / primitive インライン手順は **op-run 以外の caller / レガシー経路用**として維持。詳細は §0。
       ADR-0016 (2026-06-15): op-run の apply 完了確認は ClusterOrchestrator
       (cluster-orchestrator-directives.md フェーズ2-3) が担う = commits_added 非空 (空は contract violation)
       + apply-expert の Skill(code-review,--high) 自己検証 (フェーズ3)。op-run-fanout workflow は ADR-0016 で削除済み。
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
| **op-run (ADR-0016 以降)** | ClusterOrchestrator (directives.md フェーズ2-3) が commits_added 非空 + apply-expert の Skill(code-review,--high) 自己検証で apply 完了を確認する。§2 の `op apply verify-commit` インライン手順は op-run 以外の caller / レガシー経路用 | ClusterOrchestrator は ClusterSummary を controller に返す (`op-run-fanout` は ADR-0016 で削除済み) |
| **op-run 以外の caller / レガシー経路** (本ファイルを参照する他 skill / インライン verify を行う経路) | **controller がインラインで** §2 の `op apply verify-commit` を実行する (従来どおり) | primitive の `decision` / `blocking_reasons` / exit code を controller が直接読む |

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

### gate 2: `op apply verify-commit` で SHA 実在 + membership 検証

旧 v2 までは `git log ... | wc -l` の **件数照合のみ** だったが、件数が一致しても報告 SHA が捏造
(object 不在) / 範囲外 (`origin/<base>..HEAD` に属さない) の場合を検出できなかった (Issue #528)。
v3 からは `op apply verify-commit` primitive で **SHA の実在と membership** を実測する。

```bash
# 報告 commits_added を worktree の実コミット集合に照合する
# completion_report.commits_added を JSON 配列文字列にして渡す (例: ["abc1234","def5678"])
op apply verify-commit \
  --worktree "${WT_PATH}" \
  --base-ref "${OP_RUN_BASE_REF}" \
  --reported-json "${COMMITS_ADDED_JSON}"
VERIFY_EXIT=$?
# exit 0 = pass (報告 SHA が全て実在 + 実コミット集合に属する)
# exit 1 = block (decision:block。stdout JSON の blocking_reasons に理由)
# exit 99 = 内部エラー (parse / git 失敗。fail-closed)
```

primitive は decision-oriented envelope を stdout に出力する。`blocking_reasons` に
`FABRICATED_SHA` (捏造) / `NOT_IN_COMMIT_SET` (範囲外) / `COUNT_ZERO` (apply mode で報告 0 件) が入る。
exploration-only spawn (investigation / review / post-check) は `--mode exploration` を付けて
`commits_added: []` を pass にする。spec: `op-tools/docs/specs/apply-verify-commit.md`。

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

```bash
# 失敗 worktree を隔離する
FAIL_DIR="${HOME}/cwork/worktrees-failed/${REPO_NAME}/${TASK_ID}-$(date +%s)"
mkdir -p "$(dirname "${FAIL_DIR}")"
mv "${WT_PATH}" "${FAIL_DIR}"
git worktree prune
echo "apply 完了 verify 失敗: worktree を ${FAIL_DIR} に隔離しました。手動確認してください。"

# claim release (best-effort — 失敗は op claim sweep が回収)
op claim release "${TASK_ID}" 2>/dev/null || true
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

## 5. チェックリスト (controller が apply 完了通知ごとに確認)

```
- [ ] completion_report に commits_added フィールドが存在する
- [ ] op apply verify-commit を実行した (--worktree / --base-ref / --reported-json で SHA 実在 + membership 照合)
- [ ] primitive の decision / blocking_reasons / exit code を確認した
- [ ] block (FABRICATED_SHA / NOT_IN_COMMIT_SET / COUNT_ZERO) があれば gate 3 の分岐表に従って対処した
- [ ] status: blocked / partial の場合は needs_human_decision と blocked_actions を確認した
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

## 7. agent 側との責務境界

| 責務 | 参照先 |
|------|--------|
| agent 側完了手順 (code-review → commit → commits_added 記入) | `skills/_shared/apply-completion-checklist.md` |
| controller 側 verify gate の契約・分岐・retry / 隔離 (canonical 正本) | **本ファイル** |
| verify の実行主体 (ADR-0016 以降、op-run) | ClusterOrchestrator (directives.md フェーズ2-3)。commits_added 非空 + apply-expert 自己検証。`op-run-fanout.js` は削除済み |
| canonical completion_report schema (v14) フィールド定義 | `skills/_shared/expert-spawn.md` |
| worktree ライフサイクル (パス規則 / 隔離先) | `skills/_shared/worktree-ops.md (>=2)` |
