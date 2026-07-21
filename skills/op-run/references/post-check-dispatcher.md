<!--
機能概要: op-run フェーズ3.5 の Post-check Dispatcher 全体 (dispatch 判定 / spawn 手順 /
         判定後処理 / skip 分岐 / error 分岐) を SKILL.md 本体から物理切り出した参照ファイル。
作成意図: SKILL.md の god file 化解消 (Issue #407)。Phase 3.5 の dispatcher 全体をここに集約し、
         SKILL.md 本体は ~15 行の pointer に圧縮する。
         2026-05-30 ADR-0009 Phase C C1: post-check expert の spawn 機構を single-message
         ADR-0016 (2026-06-15): post-check dispatch / spawn は ClusterOrchestrator
         (cluster-orchestrator-directives.md フェーズ5.5) が担う。dispatch 判定ロジック
         (routing / null-skip / active / planned / error 分岐) はここが正本。
         executor が Workflow → ClusterOrchestrator に移行 (機構差替であり契約不変)。
注意点: Agent prompt 文字列は `references/post-check-prompts.md` に分離済み。
        controller は dispatch 判定後に各 PR の prompt_text を post-check-prompts.md から注入する。
        本ファイルはそれ以外のすべての dispatcher ロジック (routing / 判定後処理 / 失敗 gate) を保持する。
        dispatcher の動作 / label helper 呼び出し名 / result enum を変更すると
        op-merge gate との整合が崩れる。変更前に labels-and-markers.md を確認する。
-->

<!-- op-domain: refactor -->
<!-- op-source: op-run -->

# op-run: Post-check Dispatcher (Phase 3.5)

op-run フェーズ3.5 の dispatcher 全体。
SKILL.md 本体から物理切り出し (Issue #407)。
Agent prompt 文字列は `references/post-check-prompts.md` 参照。

post-check expert の spawn は **ClusterOrchestrator** (cluster-orchestrator-directives.md フェーズ5.5) が担う (ADR-0016)。
dispatch 判定 (routing) / label transition / 失敗 gate のロジック正本は本ファイル。
spawn 自体は ClusterOrchestrator が担い、controller は ClusterSummary のみ受け取る。
`op-run-postcheck` workflow は ADR-0016 で削除済み。

---

## フェーズ3.5: Post-check Dispatcher (post_check 解決済みクラスタのみ)

フェーズ1-2-c で **post-check 担当** が解決されたクラスタについて、review-expert による global review (フェーズ4) の **前に**
issue 固有の post-check を expert 別に dispatch する。canonical schema の `post_check_expert` 値に応じて分岐する:

```
match post_check_expert:
  "ux-ui-audit-expert"  → 3.5-A. UX/UI Post-check (使いやすさ・a11y・状態網羅 の再監査)
  "security-expert"     → 3.5-B. Security Post-check (深掘り security 専門再監査の 8 観点を実行)
  "env-expert"          → 3.5-D. Planned Env Post-check Skip (planned のため spawn しない)
  null                  → 3.5-C. Skip (フェーズ4 へ直接進む)
  default               → 3.5-E. Default Branch (unknown / unregistered / 他 planned を弾く)
```

> **dispatch 判定は controller 保持 (workflow に委譲しない)**:
> 下記の判定優先 (null skip / active post-check / planned skip / unregistered error) は
> すべて controller がフェーズ3.5 冒頭で実施する。ClusterOrchestrator に渡るのは
> **3.5-A / 3.5-B (+ 3.5-B-4 aux) に振り分けられた active post-check 対象 PR のみ**。
> null skip (3.5-C) / planned skip (3.5-D) / unregistered error (3.5-E) は controller 内で
> 完結し、ClusterOrchestrator を呼ばない。

dispatcher の判定優先 (上から順):

```text
if post_check_expert is null:
    → 3.5-C (skip)。フェーズ4 へ直接進む。
elif post_check_expert is active and post-check capable
     (= active-expert-registry.md の Post-check 列が yes / conditional / specialist):
    → 3.5-A (ux-ui-audit-expert) / 3.5-B (security-expert) / 該当節 (将来 active 化された expert)
elif post_check_expert == "env-expert":
    → 3.5-D (planned env post-check skip marker を残してフェーズ4 へ進む)
elif post_check_expert in {"release-expert", "compatibility-expert", "spec-expert"}:
    # release-expert / compatibility-expert は planned (3.5-D のような documented skip 経路を持たない)。
    # spec-expert は active だが op-spec 専用 Utility Worker で post-check capability を持たない
    # (active-expert-registry.md の Post-check 列に該当しない)。いずれも post-check として spawn 不可。
    # runtime-contract.md §6 (Planned Expert Rule) / Utility Worker 規約に従って spawn 不可。
    return needs_human_decision  # 内部 enum (snake_case)
    abort_dispatch()              # post-check expert を再決定させる (controller が再 routing)
elif post_check_expert is unregistered (active-expert-registry / planned-experts どちらにも無い):
    # runtime-contract.md §7 (Unregistered Expert Rule) に従って contract error
    abort_dispatch_with_contract_error()
else:
    # 想定外。clear contract error として停止
    abort_dispatch_with_contract_error()
```

> **planned post-check expert の取り扱い**:
> `op-post-check-expert: env-expert` が marker / label / domain から解決された場合、
> `env-expert` は planned expert のため **直接 spawn しない**。3.5-D の planned skip
> branch に倒し、PR 本文 / コメントに `<!-- op-planned-post-check-skipped: env-expert -->`
> marker を残す。`security-expert` は active expert のため通常通り 3.5-B で spawn する。
>
> `release-expert` / `compatibility-expert` / `spec-expert` を post_check_expert に
> 指定された場合、3.5-D のような documented planned-skip 経路を持たないため、
> dispatcher は `needs_human_decision` (内部 enum) を返して post-check expert resolution の
> やり直しを controller に要求する。`active-expert-registry.md` / `planned-experts.md` の
> どちらにも無い expert を指定された場合は contract error として停止する
> (`runtime-contract.md` §7 の Unregistered Expert Rule に整合)。

post-check は **issue 固有の domain-specific 再監査** であり、フェーズ4 の **全 PR 対象 global review (review-expert)** とは役割が分かれる:

- **post-check (3.5)**: 元 Issue の success_criteria を満たしたか / 元 finding が解消されたか / 修正が新たな攻撃面を生んでいないか (domain 専門観点)
- **global review (4)**: PR 全体の副作用 / PR 本文の整合 / 検証記録の充足 / 横断的観点 (review-expert の Security/Abuse/UX/Test/Compatibility/Release/Spec/Refactor の各 lens)

review-expert は post-check expert ではない。`<!-- op-post-check-expert: review-expert -->` 指定は禁止。

post-check が `null` のクラスタ (バックエンドのみの修正 / DB / CLI 等) は本フェーズをスキップしてフェーズ4 へ直接進む。

---

## 3.5-W. Active Post-check の spawn 機構 (ClusterOrchestrator / 共通)

3.5-A (ux-ui) / 3.5-B (security) / 3.5-B-4 (aux ux-ui) の active post-check spawn は、
すべて **ClusterOrchestrator (cluster-orchestrator-directives.md フェーズ5.5)** が担う。
ClusterOrchestrator は dispatch 判定 (本ファイルの 3.5-A / 3.5-B / 3.5-C / 3.5-D / 3.5-E 分岐) に従って
post-check expert を Agent tool で spawn する。

### 渡す値の契約 (ClusterOrchestrator → post-check expert)

| フィールド | 値 |
|-----------|---|
| `expert` | `"ux-ui-audit-expert"` または `"security-expert"` (dispatch 判定の結果) |
| `model` | `"opus"` (model-selection.md §5.1) |
| `worktree_path` | フェーズ2-A で確定した apply worktree path を reuse 注入 (read-only 監査) |
| `issues` | 元 Issue 番号配列 |
| `prompt_text` | `post-check-prompts.md` 該当節の本文を ClusterOrchestrator が注入 |
| `base_ref` | `OP_RUN_BASE_REF` (フェーズ0-base で確定済み) |

- **apply worktree 再利用**: post-check は read-only 監査のため新規 worktree を作らない。
- **post-check expert は監査専任**: コードを修正・push しない (exploration-only)。`commits_added: []` が正解。

### prompt_text の注入 (ClusterOrchestrator の責務、正本は post-check-prompts.md)

各 PR の `prompt_text` の **正本は `references/post-check-prompts.md`**。ClusterOrchestrator は dispatch 判定後、
対象 expert に応じて以下の節の本文を読み、spawn prompt に注入する:

| dispatch 先 | post-check-prompts.md の節 |
|------------|---------------------------|
| 3.5-A (ux-ui-audit-expert) | 「ux-ui-audit-post-check (3.5-A)」節 |
| 3.5-B (security-expert) | 「security-post-check (3.5-B-1)」節 |
| 3.5-B-4 (aux ux-ui-audit-expert) | 「ux-ui-aux-post-check (3.5-B-4)」節 |

---

## 3.5-A. UX/UI Post-check (post_check_expert == "ux-ui-audit-expert")

ux-ui-audit-expert を post-check モードで監査させる (本フェーズの完了後にフェーズ4 の review-expert global review に進む)。
PR ごとに別 worktree を作る必要はない (read-only 監査のため、apply の worktree を再利用)。

spawn は ClusterOrchestrator が担う (cluster-orchestrator-directives.md フェーズ5.5)。ClusterOrchestrator は dispatch 判定で
本クラスタを ux-ui post-check に振り分け、ux-ui-audit-expert を Agent tool で spawn する
(`op-run-postcheck` workflow は ADR-0016 で削除済み)。

### 3.5-A-2. 判定に応じた処理 (controller 主語)

op-run controller は、ClusterOrchestrator が post-check expert から受け取る結果から当該 PR の判定結果を確認した後、
必ず `apply_ux_post_check_labels "<PR>" "<result>"` (4-3-2 で定義) を呼んで
ラベルを排他制御する。post-check expert が直接 `gh pr edit` / label helper を呼ぶことは禁止。

workflow 戻り値の `verdict` (PASS / BLOCK / NEEDS_HUMAN_DECISION) と post-check meta block
(`PASS_WITH_NOTES` を含む) を controller が label helper 引数へ正規化する。

| 判定 | 司令官の動作 | label helper 呼び出し |
|------|------------|----------------------|
| PASS | フェーズ4 (review-expert global review) に進める | `apply_ux_post_check_labels $PR pass` |
| PASS_WITH_NOTES | Notes は post-check コメントに既に残っているので、review-expert global review にそのまま進める | `apply_ux_post_check_labels $PR pass_with_notes` |
| BLOCK | review-expert global review を呼ばず、designer-expert (または feature-expert) を再 spawn して Required Changes を実装させる (フェーズ2-C を当該クラスタのみ再実行)。最大 2 回まで再実装、3 回目は `blocked` のまま human escalation report (PR / クラスタ ID / Required Changes / 再実行履歴を含む構造化サマリ) を commander に返し、人間への提示は commander / OP skill が行う | `apply_ux_post_check_labels $PR block` |

```bash
# 3.5-A-2: controller が UX post-check result を受け取った後に呼ぶ実装例
# op pr label-transition が内部で label fetch + delta + apply + verify を完結させるため pre-fetch 不要
# UX_POST_CHECK_RESULT は ClusterOrchestrator が post-check expert から受け取る結果の verdict を正規化した結果 (pass/pass_with_notes/block/skipped)
apply_ux_post_check_labels "$PR_NUMBER" "$UX_POST_CHECK_RESULT"
```

`pro-ux-ui-audit-needs-fix` ラベルが付いた PR は、designer-expert の再実装が完了して
ux-ui-audit-expert が再 audit で PASS / PASS_WITH_NOTES を出すまで review-expert global review に進まない。
再 audit で PASS / PASS_WITH_NOTES を取得した瞬間に helper が `pro-ux-ui-audit-needs-fix` を剥がすため、
gate stuck は発生しない。

### 3.5-A-3. 失敗時の扱い (UI 影響有無で gate を変える)

ClusterOrchestrator が post-check expert から当該 PR の判定材料を受け取れなかった場合 (spawn timeout / agent error /
判定欠落) の扱いは **UI 影響あり / なしで分岐**する。

#### UI 影響なし (バックエンドのみの修正 / DB / CLI 等)

- post-check スキップとして扱い、`apply_ux_post_check_labels $PR skipped` で `pro-ux-ui-audit-skipped` を付与
- フェーズ4 (review-expert global review) に進める (BLOCK しない)
- op-merge の対象になる (post-check が必須でない PR のため)
- 完了報告に warning を出す

#### UI 影響あり (designer-expert apply / frontend ファイル変更を含む PR)

- post-check スキップとして扱い、`apply_ux_post_check_labels $PR skipped` で `pro-ux-ui-audit-skipped` を付与
- フェーズ4 (review-expert global review) には進めてよい
- ただし **op-merge gate は不可**: `pro-ux-ui-audit-skipped` が残ったままの UI 影響 PR は op-merge から自動的に除外される
- 解除には以下のいずれかが必要:
  1. ux-ui-audit-expert を手動で再 spawn し PASS / PASS_WITH_NOTES を得る (推奨)
  2. 人間が `pro-ux-ui-audit-manual-override` ラベルを付与し明示承認する (例外運用)
- 完了報告に warning を出し、人間に再実行 / 承認を促す

これにより post-check の不安定さが pipeline を止めない (review-expert global review は通る) が、
**UI 影響 PR は ux-ui-audit-expert post-check の signal を経ずにマージされない**。
silent な UX 退化を構造的に防ぐ。

UI 影響判定は以下のいずれか満たす場合 (path 判定は `~/.claude/skills/_shared/project-profile.md`
の「UI 影響判定 path パターン」節に集約。`src` / `lib` / `app` 単体マッチは禁止):
- apply 担当が `designer-expert`
- 変更ファイルが project-profile.md の **UI 影響あり path パターン** にマッチ
  (除外パス `src-tauri/**` / `crates/**` / `**/*.rs` 等は UI 影響なし扱い)
- post-check 担当が `ux-ui-audit-expert` として解決されている (フェーズ1-2-c の結果)

---

## 3.5-B. Security Post-check (post_check_expert == "security-expert")

security domain Issue (canonical schema 上で `post_check_expert: "security-expert"` が指定されたクラスタ) に対して、
security-expert を post-check モードで監査させ **Issue 固有の深掘り再監査** を実行する。
PR ごとに別 worktree を作る必要はない (read-only 監査のため、apply の worktree を再利用)。

**フェーズ4 (global review by review-expert) との役割分離**:
- **3.5-B (本フェーズ)**: security 領域を深掘りする専門鑑識 (元 finding の解消 / 別の攻撃面増加 / IO・IPC・shell・path・capability の Issue 固有再監査)
- **フェーズ4 (global review)**: review-expert が PR 全体を 7 lens (Security/Abuse, Workflow/UX, Test, Compatibility, Release, Spec, Refactor) で横断確認。3.5-B 通過後は Security/Abuse Lens を「PR 全体として新たな攻撃面が増えていないかのみ軽く」に切り替え (重複回避)

攻撃者視点・悪用可能性は review-expert の Security/Abuse Lens で扱い、
深掘り専門鑑識 (IPC / file IO / path / capability / shell / token / updater 等) は security-expert に集約する。

### 3.5-B-0. Legacy guard: security-expert installed 確認 (sanity check)

**Phase 2 で security-expert が active 化** されたため、本 step は通常 `true` に倒れる。
本ガードは「agent 実体が万一削除された場合の安全装置 (legacy guard)」として残す。
通常運用では skip 動作には倒れない。

```bash
# security-expert agent の installed 判定 (Phase 2 以降は true が期待値)
SECURITY_EXPERT_INSTALLED=false
if [ -f "$HOME/.claude/agents/security-expert.md" ]; then
  SECURITY_EXPERT_INSTALLED=true
fi
```

判定結果に応じた動作:

| installed | 動作 |
|-----------|------|
| `true` (Phase 2 以降の通常状態) | 3.5-B-1 の通り ClusterOrchestrator が security-expert を spawn し、深掘り再監査を回す |
| `false` (agent 削除 / 設定不整合の異常状態) | **ClusterOrchestrator が security-expert を spawn しない**。下記「legacy skip 動作」に倒れる |

#### Legacy skip 動作 (security-expert 不在時、通常発生しない)

agent 実体が削除されている等の異常状態では、Phase 1 と同等の安全策に倒れる。

1. **ClusterOrchestrator が security-expert を spawn しない** (subagent_type: security-expert の spawn 失敗を構造的に防ぐ)
2. PR コメントとして `<!-- op-security-post-check -->` 付きの skipped メモを残す
3. **`pro-security-post-check-skipped` ラベルを PR に付与**
4. フェーズ4 (review-expert global review) は **`review_mode = full`** で実行する
5. 完了報告に `security_post_check_skipped: agent_missing` warning を出す
6. ユーザーに「security-expert agent が見つかりません。`agents/security-expert.md` の整合を確認してください」を提示

silent な攻撃面復活を防ぐため、security 影響 PR は op-merge gate 14〜16 でマージ対象外になる。
解除には agent 実体の復元または `pro-security-post-check-manual-override` (例外運用) が必要。

### 3.5-B-1. security-expert を post-check モードで spawn (active)

> **本ステップは `SECURITY_EXPERT_INSTALLED == true` のときのみ実行する**。
> Phase 2 以降は通常 true なので、3.5-B-0 の legacy skip 動作には倒れない。

ClusterOrchestrator が本クラスタを security post-check に振り分け、security-expert を Agent tool で spawn する
(`op-run-postcheck` workflow は ADR-0016 で削除済み)。

### 3.5-B-2. 判定に応じた処理 (controller 主語)

op-run controller は、ClusterOrchestrator が post-check expert から受け取る結果から当該 PR の判定結果を確認した後、
必ず `apply_security_post_check_labels "<PR>" "<result>"` (4-3-2 で定義) を呼んで
ラベルを排他制御する。post-check expert が直接 `gh pr edit` / label helper を呼ぶことは禁止。

workflow 戻り値の `verdict` (PASS / BLOCK / NEEDS_HUMAN_DECISION) と post-check meta block
(`PASS_WITH_NOTES` / `requires_aux_post_check` を含む) を controller が label helper 引数へ正規化する。

| 判定 | 司令官の動作 | label helper 呼び出し |
|------|------------|----------------------|
| PASS | `requires_aux_post_check: false` ならフェーズ4 (review-expert global review) に **軽量モード**で進める (Security/Abuse Lens は新たな攻撃面のみ軽く)。`requires_aux_post_check: true` なら 3.5-B-4 (aux UX post-check) を先に実行 | `apply_security_post_check_labels $PR pass` |
| PASS_WITH_NOTES | Notes は post-check コメントに既に残っているので、PASS と同じフロー。`requires_aux_post_check: true` なら 3.5-B-4 へ | `apply_security_post_check_labels $PR pass_with_notes` |
| BLOCK | フェーズ4 を呼ばず、op-run の判定優先順位に従って apply 担当 expert (security-expert または debug-expert) を再 spawn し Required Changes を実装させる (フェーズ2-C を当該クラスタのみ再実行)。最大 2 回まで再実装、3 回目は `blocked` とし `needs_human_decision` を含む report を返す。人間への提示は commander / OP skill が行う | `apply_security_post_check_labels $PR block` |
| NEEDS_HUMAN_DECISION | フェーズ4 を呼ばず、人間判断待ち。op-run は自動継続しない。`needs_human_decision` block (decision_type / options / safest_default / blocked_actions) を完了報告に転載し、commander / OP skill がユーザーに提示する | `apply_security_post_check_labels $PR needs_human_decision` |

```bash
# 3.5-B-2: controller が security post-check result を受け取った後に呼ぶ実装例
# op pr label-transition が内部で label fetch + delta + apply + verify を完結させるため pre-fetch 不要
# SECURITY_POST_CHECK_RESULT は ClusterOrchestrator が post-check expert から受け取る結果の verdict を正規化した結果 (pass/pass_with_notes/block/needs_human_decision)
apply_security_post_check_labels "$PR_NUMBER" "$SECURITY_POST_CHECK_RESULT"
# requires_aux_post_check: true の場合: 3.5-B-4 で aux UX post-check 完了後に同じ PR_NUMBER で呼ぶ
# apply_ux_post_check_labels "$PR_NUMBER" "$AUX_UX_RESULT"
```

`pro-security-needs-fix` ラベルが付いた PR は、apply 担当 expert の再実装が完了して
security-expert が再 audit で PASS / PASS_WITH_NOTES を出すまでフェーズ4 へ進まない。
再 audit で PASS / PASS_WITH_NOTES を取得した瞬間に controller helper が
`pro-security-needs-fix` / `pro-security-post-check-skipped` を剥がすため、
op-merge gate 14〜16 の stuck は発生しない。

generic な `needs:human-decision` は複数 domain で共有されるため、
security post-check helper だけでは自動 remove しない。
未解決の human decision がないことを controller が別途証明できる場合のみ、
controller が明示的に remove してよい。

#### NEEDS_HUMAN_DECISION の典型ケース

```text
- security risk が high だが、修正案が UX impact: high になる (capability 縮小が必要)
- legitimate_workflow_preserved == false が検出された (apply で UI 削除 / 出力先固定が混入)
- 修正方針に複数の選択肢があり (validation 強化 vs capability 制限)、自動判断不能
- 認証 model / token storage / updater 設計の再設計が必要
- 大規模 capability 再設計が必要
```

このとき op-run は apply 担当の再 spawn を行わず、`needs_human_decision` block を `pro-review-blocked`
相当の人間判断待ちに寄せる。詳細は `~/.claude/skills/expert-security/references/post-check-policy.md`。

### 3.5-B-3. 失敗時の扱い (security 影響有無で gate を変える)

ClusterOrchestrator が post-check expert から当該 PR の判定材料を受け取れなかった場合 (spawn timeout / agent error /
判定欠落) の扱いは **security 影響あり / なしで分岐**する。

#### security 影響なし

(本フェーズに到達した時点で post_check_expert == "security-expert" のため通常は該当しないが、安全側として記載)
- post-check スキップとして扱い、`apply_security_post_check_labels $PR skipped` で `pro-security-post-check-skipped` を付与
- フェーズ4 (global review) に **フルモード**で進める (Security/Abuse Lens を通常通り重く見る)
- op-merge の対象になる
- 完了報告に warning を出す

#### security 影響あり (`op-domain: security` または `pro-security-expert` ラベル付き)

- post-check スキップとして扱い、`apply_security_post_check_labels $PR skipped` で `pro-security-post-check-skipped` を付与
- フェーズ4 (global review) には **フルモード**で進めてよい (Security/Abuse Lens を通常通り重く見る)
- ただし **op-merge gate は不可**: `pro-security-post-check-skipped` が残ったままの security 影響 PR は op-merge から自動的に除外される
- 解除には以下のいずれかが必要:
  1. security-expert を手動で再 spawn し PASS / PASS_WITH_NOTES を得る (推奨)
  2. 人間が `pro-security-post-check-manual-override` ラベルを付与し明示承認する (例外運用)
- 完了報告に warning を出し、人間に再実行 / 承認を促す

これにより post-check の不安定さが pipeline を止めない (フェーズ4 はフルモードで通る) が、
**security 影響 PR は security-expert の Issue 固有深掘り再監査の signal を経ずにマージされない**。
silent な攻撃面復活を構造的に防ぐ。

security 影響判定は以下のいずれかを満たす場合:
- apply 担当が `security-expert` または `debug-expert` かつ Issue marker が `op-domain: security` で起票されている
- post-check 担当が `security-expert` として解決されている (フェーズ1-2-c の結果)
- ラベルに `pro-security-expert` を含む

---

## 3.5-B-4. UX/UI Auxiliary Post-check (security mitigation が UI / workflow に影響する場合)

security-expert が post-check で `requires_aux_post_check: true` + `aux_post_check_experts: [ux-ui-audit-expert]` +
`aux_post_check_status: required_pending` を返した場合、op-run は **ux-ui-audit-expert を post-check モードで追加 spawn** する。
これは security mitigation (overwrite confirm dialog 追加 / 削除確認 stage 追加 / 拡張子 warning 等) が
UI / workflow に影響を与えた場合に、UX 退化 (a11y / focus / contrast / state recovery / step 数増加) を
構造的に検出するため。

### 起動条件 (すべて満たす)

- security post-check が PASS / PASS_WITH_NOTES を返した
- security post-check meta block の `requires_aux_post_check == true`
- `aux_post_check_experts` に `ux-ui-audit-expert` が含まれる
- `aux_post_check_status == required_pending`

> 重要: aux UX post-check も primary UX (3.5-A) と同じく result enum は
> `pass` / `pass_with_notes` / `block` の 3 値のみ。`needs_human_decision` は返してはいけない
> (canonical: `~/.claude/skills/_shared/markers/ux-ui-markers.md` L146)。情報不足は BLOCK + Required Changes
> に不足情報を書く。controller の `apply_ux_post_check_labels()` は 4 値 (pass / pass_with_notes / block / skipped)
> しか受け付けないため、`needs_human_decision` を返すと controller が未知 result で落ちる。
> (post-check expert の結果スキーマは verdict enum を PASS / BLOCK /
> NEEDS_HUMAN_DECISION に正規化するが、aux UX では NEEDS_HUMAN_DECISION を BLOCK に倒す。`op-run-postcheck` は ADR-0016 で削除済み)

### spawn

ClusterOrchestrator が aux UX post-check expert (ux-ui-audit-expert) を Agent tool で spawn する (cluster-orchestrator-directives.md フェーズ5.5)。
primary security post-check の結果確定後 (3.5-B-2) に行うため、
security post-check とは別のタイミングで aux を発火する (security 結果を受けてから aux を発火する)。
prompt 内の `<trigger_reason>` は ClusterOrchestrator が security post-check meta から展開して注入する。
`op-run-postcheck` workflow は ADR-0016 で削除済み。

### aux post-check の判定処理 (controller 主語)

op-run controller は、ClusterOrchestrator が post-check expert から受け取る aux post-check 判定結果を確認した後、
必ず `apply_ux_post_check_labels "<PR>" "<result>"` (4-3-2 で定義) を呼んで
ラベルを排他制御する。aux post-check expert が直接 `gh pr edit` / label helper を呼ぶことは禁止。

| aux_post_check 判定 | 司令官の動作 | label helper 呼び出し |
|--------------------|------------|----------------------|
| PASS | security post-check の `aux_post_check_status` を `pass` に更新。フェーズ4 (review-expert global review) に **軽量モード**で進める | `apply_ux_post_check_labels $PR pass` |
| PASS_WITH_NOTES | aux_post_check_status を `pass` に更新 (`pass_with_notes` も merge 許容)。Notes は PR コメントに既に残る。フェーズ4 に軽量モードで進める | `apply_ux_post_check_labels $PR pass_with_notes` |
| BLOCK | aux_post_check_status を `block` に更新。フェーズ4 を呼ばず、op-run の判定優先順位 1-8 で apply 担当 expert (designer-expert / feature-expert) を再 spawn して Required Changes を実装させる | `apply_ux_post_check_labels $PR block` |

```bash
# 3.5-B-4: controller が aux UX post-check result を受け取った後に呼ぶ実装例
# op pr label-transition が内部で label fetch + delta + apply + verify を完結させるため pre-fetch 不要
# AUX_UX_RESULT は ClusterOrchestrator が post-check expert から受け取る結果の verdict を正規化した結果 (pass/pass_with_notes/block/skipped)
apply_ux_post_check_labels "$PR_NUMBER" "$AUX_UX_RESULT"
```

### aux post-check spawn 失敗時

ClusterOrchestrator が aux UX post-check expert から判定材料を受け取れなかった場合 (spawn timeout / agent error /
`checks[]` に当該 `pr_number` が欠落):

- `aux_post_check_status` を `skipped` に更新
- `apply_ux_post_check_labels $PR skipped` で `pro-ux-ui-audit-skipped` を付与
- security 影響あり PR は op-merge gate で BLOCK されるため、再 spawn または manual override が必要

### stale 判定

aux post-check 完了後、apply 担当の再実装で head SHA が進んだ場合:

- 再実装 commit を検出したら `aux_post_check_status` を `stale` に更新
- 再 audit が必要 (3.5-B-4 を再実行)

### head SHA の整合

aux post-check の `<!-- op-post-check-meta -->` block の `post_checked_head_sha` は
判定確定時の現在 head SHA。op-merge は security-expert post-check / aux ux-ui-audit-expert post-check の
それぞれの `post_checked_head_sha` を current_head_sha と比較し、いずれかが stale なら merge BLOCK する。

---

## 3.5-C. Skip (post_check_expert == null)

post-check が `null` のクラスタ (バックエンドのみの修正 / DB / CLI 等) は本フェーズで何もせずフェーズ4 へ進む。
`null` 値そのものが「明示的に post-check 不要」を意味しているため、警告を出さない。
controller 内で完結し、ClusterOrchestrator が post-check expert を spawn しない。

---

## 3.5-D. Planned Env Post-check Skip (post_check_expert == "env-expert")

/**
 * 機能概要: env-expert は planned expert のため、post-check expert として spawn しない。
 *           routing metadata 上 `post_check_expert: env-expert` が来ても、本ステップで
 *           planned skip として扱い、active apply fallback (1-2-d) と矛盾しない動作を保証する。
 * 作成意図: env-expert を runtime に漏らさない (ClusterOrchestrator が env-expert を spawn しない)。
 * 注意点: spawn 失敗を skip 扱いしているのではなく、planned 設計として spawn 自体を行わない。
 *         release / installer / updater / distribution 方針判断が主題なら needs_human_decision に倒す。
 */

`env-expert` が `post_check_expert` として解決されたクラスタは、controller が本フェーズで以下の処理を行う
(workflow を呼ばず controller 内で完結する)。

1. **ClusterOrchestrator が env-expert を spawn しない** (subagent_type: env-expert の spawn 失敗を構造的に防ぐ)
2. apply expert がフェーズ1-2-d の Active Apply Expert Normalization で `security-expert` /
   `debug-expert` / `refactor-expert` のいずれかに正規化済みであること、または
   `needs_human_decision` (内部 enum) に倒れていることを確認する
3. release / installer / updater / distribution 方針判断が主題と判定された場合 (1-2-d で
   `needs_human_decision` になっているケース) は本フェーズも skip し、人間レビューに回す
4. PR 本文 / コメントに planned post-check skip marker を残す
5. 通常通りフェーズ4 (review-expert global review) へ進む (BLOCK しない)

> **env post-check が security signal を含む場合の post-check 担当切り替え**:
> Issue / PR の content に OSV / dependency vulnerability / supply-chain / secret leak /
> credential exposure / permission risk が含まれていて、apply 側が 1-2-d で `security-expert`
> に正規化されたクラスタは、`post_check_expert` 側も `env-expert` (planned skip) で打ち止めにせず
> **`security-expert` を post_check_expert として再付与** する (3.5-B Security Post-check が動く)。
> これにより env routing の中身が security の場合に post-check が空になる事故を防ぐ。
> 具体的には controller が `post_check_expert` resolution の最後で次の追従ルールを適用する:
>
>     if resolved post_check_expert == "env-expert"
>         and (active_apply_expert == "security-expert"
>              or any(security keyword in issue body / labels)):
>         post_check_expert = "security-expert"  # 3.5-B へ寄せる
>     # 残りの env-expert post-check は本 3.5-D へ流す

### 使用する marker

```md
<!-- op-planned-post-check-skipped: env-expert -->
```

### PR コメントテンプレ

```md
<!-- op-planned-post-check-skipped: env-expert -->

env-expert is currently a planned expert and was not spawned as a post-check expert.
The env-domain apply path was handled through active fallback
(see Active Apply Expert Normalization in op-run / phase 1-2-d).

If this change requires release / installer / updater / distribution policy
decisions, human review is required (see needs_human_decision flow).

🤖 op-run フェーズ3.5-D (Planned Env Post-check Skip)
```

### 補足

- `env-expert` 実装時は本サブセクションを削除し、3.5-A / 3.5-B と同様の active spawn 節
  (ClusterOrchestrator による active post-check expert spawn) に置き換える。
- 本 skip は **fail-open** ではない。env domain の apply 自体が `debug-expert` /
  `refactor-expert` で正規化されており、PR 全体の global review (フェーズ4) は通常通り行われる。

---

## 3.5-E. Default Branch (unknown / unregistered / 他 planned post-check)

/**
 * 機能概要: 3.5-A / 3.5-B / 3.5-C / 3.5-D のいずれにも該当しない post_check_expert
 *           値を受け取った場合の default 経路。`runtime-contract.md` §6 / §7 の
 *           Planned / Unregistered Expert Rule に整合させ、未知 expert の silent spawn を防ぐ。
 * 作成意図: P1-3 で報告された「dispatcher に default 不在」を埋める。release-expert /
 *           compatibility-expert といった他 planned post-check や、op-run routing 対象外の
 *           Utility Worker (spec-expert: post-check capability なし)、unregistered な expert 名が
 *           紛れ込んだケースを構造的に拒否する。
 * 注意点: ここで `needs_human_decision` を返すのは内部 enum (snake_case) のみ。
 *         GitHub label `needs:human-decision` の付与は controller の label 境界 helper で行う。
 *         本ステップは controller 内で完結し、ClusterOrchestrator が post-check expert を spawn しない。
 */

### 適用ケース

dispatcher の判定優先 (3.5 冒頭) を上から見て、3.5-A / 3.5-B / 3.5-C / 3.5-D の
いずれにも該当しない `post_check_expert` 値はすべて本ステップに落ちる。具体的には:

- `release-expert` / `compatibility-expert` (planned)、`spec-expert`
  (active だが op-spec 専用 Utility Worker で post-check capability なし)。
  いずれも 3.5-D のような documented skip 経路を持たない
- `active-expert-registry.md` / `planned-experts.md` のどちらにも無い expert 名
  (typo / 古い marker / 想定外の routing 結果)

### 動作

```text
case post_check_expert:
  release-expert | compatibility-expert | spec-expert:
    # planned (release/compat) または op-run 非対象 Utility Worker (spec-expert) として post-check spawn 不可。
    # post-check expert resolution の再決定が必要
    # ClusterOrchestrator が当該 PR の post-check expert を spawn しない
    log warning("post_check_expert=${post_check_expert} は post-check spawn 不可 (planned or Utility Worker)")
    return needs_human_decision  # 内部 enum (snake_case)
    abort_dispatch()
    # → controller は post_check_expert を null / active expert に再 routing するか、
    #    人間レビューに回す。本フェーズでは workflow を呼ばない。

  *:  # unregistered
    # active-expert-registry.md / planned-experts.md のどちらにも無い
    log error("post_check_expert=${post_check_expert} は unregistered。contract error として停止")
    raise ContractError
    abort_dispatch_with_contract_error()
```

### 後段への影響

- `needs_human_decision` (内部 enum) になったクラスタは controller がフェーズ4 を **呼ばず**、
  `pro-review-blocked` 相当の人間レビュー待ちに寄せる (`apply_review_labels $PR blocked`)。
  PR 本文に「post_check_expert dispatch unresolved」を明記し、後段で Issue 起票して再 routing する。
- contract error abort の場合は op-run controller 側で停止し、registry / agent frontmatter の
  整合 (CLAUDE.md の Single Canonical Source Rule / runtime-contract.md §7) を人間に確認させる。
  自動補正してはならない。
