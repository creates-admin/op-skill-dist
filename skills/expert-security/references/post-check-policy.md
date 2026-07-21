# post-check-policy.md — Security Post-check 8 観点と aux UX post-check 状態遷移

<!--
機能概要: op-run フェーズ3.5-B で security-expert が実行する post-check の 8 観点と、
         判定 4 種 (PASS / PASS_WITH_NOTES / BLOCK / NEEDS_HUMAN_DECISION)、
         auxiliary UX post-check signal の状態遷移を定義する。
作成意図: post-check の判定軸を統一し、op-merge gate (legitimate_workflow_preserved /
         requires_aux_post_check / stale aux post-check) が machine-readable に判定できるようにする。
注意点: 観点本体はここに集約。判定 mat-rix は本ファイル、出力 schema は report-schema.md、
       template は templates/security-post-check-{pass,pass-with-notes,block}.md。
-->

## post-check の前提

- spawn 元: op-run フェーズ3.5-B
- 入力: PR diff + Issue + reviewed_head_sha + 既存 post-check コメント
- 出力: PR コメント (`<!-- op-security-post-check -->` + `<!-- op-post-check-meta -->`) + 司令官への report
- 独立性: apply 担当が `security-expert` だった場合、本 post-check は **別 spawn** で起動 (self-review 防止)
- read-only: コード編集 / commit / push 禁止 (Read + PR コメント投稿のみ)

---

## 8 観点 (post-check の核)

### 観点 1. 元 finding の解消

```text
- Issue success_criteria が満たされているか
- 元 finding の attack_path.steps が PR diff で実際に閉じられているか
- 修正方針 (recommendation.steps) が実装されているか
- mitigation_applied が canonical schema 拡張の preferred_mitigation と整合しているか
```

判定:
- 解消されていない → `finding_resolved: false` → BLOCK
- 解消されている → `finding_resolved: true`

---

### 観点 2. 別の攻撃面増加チェック

```text
- 修正で導入されたコード (新規 path / 新規 IO / 新規 IPC / 新規 shell call / 新規 parser) に
  未検証の入力経路がないか
- mitigation の追加で別の boundary (frontend free text → file IO) が新たに開いていないか
- canonicalize 追加が新しい error path / panic を作っていないか
```

判定:
- 新攻撃面あり → `new_attack_surface_introduced: true` → BLOCK
- なし → `new_attack_surface_introduced: false`

---

### 観点 3. 入力検証

```text
- path canonicalization が適用されているか
- encoding (UTF-8) / size limit / null byte / `..` rejection / Unicode 正規化
- reserved name / ADS / device / UNC / parent traversal の reject
- archive entry validation (zip-slip 防止)
- deserialize の size / depth / count limit
- URL の scheme / host allowlist
```

判定:
- 入力検証が実装されている → OK
- 欠落 → BLOCK

---

### 観点 4. 認可 / capability

```text
- IPC command の権限境界が capability と整合
- shell 引数が args 配列で渡されている
- file IO の root / scope 制限が適切 (boundary 別)
- Tauri capability の追加が妥当 (新規 capability に必要性の根拠)
- dangerous setting (dangerousUseHttpScheme / dangerousRemoteDomainIpcAccess 等) が無効
```

判定:
- 認可が適切 → OK
- 過剰許可 / 削除した command の dangling permission → BLOCK

---

### 観点 5. エラーパス

```text
- TOCTOU (check-then-act) が atomic operation に変換されているか
- privilege drop の漏れがないか
- 失敗時の error message に secret / production path / document content が漏れていないか
- panic / unwrap / expect が user input 経路で発火しないか
- error chain の sanitize
```

判定:
- error path が安全 → OK
- 漏洩 / panic 経路 → BLOCK

---

### 観点 6. scope_out 違反

```text
- Issue scope_out で除外された範囲に変更が及んでいないか
- 修正範囲が scope_in に閉じているか
- 関連 file の overreach (refactor 混入 / feature 混入) がないか
- public API / event name / IPC contract の変更が混入していないか
```

判定:
- scope_in 内 → OK
- scope_out 違反 → BLOCK

---

### 観点 7. 正当なユーザー操作が維持されているか

```text
- legitimate_workflow_preserved == true か
- save_as / open_file / export / import / external_app_launch の UI が削除されていないか
- 出力先 / 読込元の選択肢が強制的に絞られていないか
- capability 全体 disable されていないか
- forbidden_shortcuts が守られているか
- ux_impact が none / low に収まっているか (medium / high なら needs_human_decision)
```

判定:
- 維持されている → `workflow_preservation_result: pass` / `legitimate_workflow_preserved: true`
- 破壊されている → `workflow_preservation_result: block` / `legitimate_workflow_preserved: false` → BLOCK

---

### 観点 8. UX/UI auxiliary post-check が必要か

```text
- PR diff に frontend / vue / svelte / react / tsx / scss / css の変更があるか
- 新規 dialog / Toast / button / menu / keyboard handler 追加があるか
- 既存 a11y / focus / contrast / aria 属性が変わったか
- workflow step 数が変わったか
- これらが該当する場合は requires_aux_post_check: true で aux_post_check_experts: ux-ui-audit-expert を返す
```

判定:
- UI / workflow に影響なし → `requires_aux_post_check: false` / `aux_post_check_status: not_required`
- 影響あり → `requires_aux_post_check: true` / `aux_post_check_experts: [ux-ui-audit-expert]` / `aux_post_check_status: required_pending`

---

## 判定 4 種 (post_check_result)

| 判定 | 条件 | op-run の次アクション |
|------|------|---------------------|
| **PASS** | 観点 1〜7 すべて pass / 観点 8 が `not_required` または既に PASS | フェーズ4 (review-expert global review) に **`light-after-security-postcheck` モード**で進める。`requires_aux_post_check: true` の場合は ux-ui-audit-expert post-check を追加実行 |
| **PASS_WITH_NOTES** | 観点 1〜7 pass、軽微な hardening / docs 改善が follow-up として残る | Notes は post-check コメントに残す。フェーズ4 に **light モード**で進める |
| **BLOCK** | 観点 1〜7 のいずれかが pass しない / 観点 8 で aux post-check が BLOCK | フェーズ4 を呼ばず、`pro-security-needs-fix` ラベルを PR に付与。op-run の判定優先順位 1-8 で apply 担当 expert を再 spawn |
| **NEEDS_HUMAN_DECISION** | security risk と usable workflow のトレードオフが高く自動判断不能 / 大規模 capability 再設計が必要 | `needs_human_decision` block を出力。フェーズ4 を呼ばず、`pro-security-needs-fix` 付与 + 人間判断待ち |

---

## post_check_meta block (必須出力)

`<!-- op-post-check-meta -->` block に以下を必ず含める:

```text
<!-- op-post-check-meta -->
post_check_expert: security-expert
post_check_result: pass | pass_with_notes | block | needs_human_decision
post_checked_head_sha: <sha>
post_check_round: <1, 2, ...>

security_result: pass | block
finding_resolved: true | false
new_attack_surface_introduced: true | false
scope_out_violation: true | false
secret_or_path_leak_detected: true | false

workflow_preservation_result: pass | block | not_applicable
legitimate_workflow_preserved: true | false
ux_impact: none | low | medium | high
affected_user_capability: <CSV>

requires_aux_post_check: true | false
aux_post_check_experts: <CSV (e.g. ux-ui-audit-expert) | none>
aux_post_check_reason: <短い理由 | empty>
aux_post_check_status: not_required | required_pending | pass | block | skipped | stale
<!-- /op-post-check-meta -->
```

---

## aux_post_check_status の状態遷移

| status | 意味 | 設定タイミング |
|--------|------|--------------|
| `not_required` | UI / workflow に影響なし、aux post-check 不要 | security post-check 時、観点 8 が NO |
| `required_pending` | UI / workflow に影響あり、ux-ui-audit-expert post-check 待ち | security post-check 時、観点 8 が YES |
| `pass` | aux post-check が PASS / PASS_WITH_NOTES を返した | ux-ui-audit-expert post-check 完了後 (op-run が更新) |
| `block` | aux post-check が BLOCK を返した | ux-ui-audit-expert post-check 完了後 (op-run が更新) |
| `skipped` | aux post-check が spawn 失敗等で skip 状態 | op-run が制御 |
| `stale` | aux post-check 後に commit が積まれて再実行が必要 | op-run / op-merge が判定 |

`required_pending` / `block` / `skipped` / `stale` のいずれかが残っていると **op-merge gate で BLOCK** される (op-merge/SKILL.md 参照)。

---

## aux UX post-check の追加実行フロー

```text
1. security-expert post-check (本フェーズ) が `requires_aux_post_check: true` を返す
2. op-run が ux-ui-audit-expert を post-check モードで spawn
3. ux-ui-audit-expert が PR diff を audit し、PASS / PASS_WITH_NOTES / BLOCK を返す
4. ux-ui-audit-expert は <!-- op-post-check-meta --> block で以下を出力:

   <!-- op-post-check-meta -->
   post_check_expert: ux-ui-audit-expert
   post_check_result: pass | pass_with_notes | block
   post_checked_head_sha: <sha>
   post_check_round: <1, 2, ...>

   triggered_by: security-expert
   trigger_reason: security_mitigation_changes_save_open_export_workflow
   workflow_preservation_result: pass | block
   affected_user_capability: <CSV>
   <!-- /op-post-check-meta -->

5. op-run が security-expert の aux_post_check_status を pass / block に更新
6. すべての post-check が PASS / PASS_WITH_NOTES なら → review-expert global review
7. いずれか BLOCK なら → 該当 apply expert に再委任
```

---

## stale 判定

`current_head_sha` と `post_checked_head_sha` が一致しない場合は **stale**。

```text
security post-check stale:
  reviewed_head_sha != current_head_sha
  → re-post-check が必要

aux UX post-check stale:
  aux_post_check の post_checked_head_sha != current_head_sha
  → re-aux-post-check が必要
```

stale な状態で merge しない (op-merge gate)。

---

## 完了報告 (司令官への返却)

op-run へ返す情報:

- post_check_result (pass / pass_with_notes / block / needs_human_decision)
- post_checked_head_sha
- post_check_round
- 8 観点の評価結果
- requires_aux_post_check / aux_post_check_experts / aux_post_check_status
- 投稿した PR コメント URL
- assumptions / needs_human_decision / blocked_actions (該当時)

---

## post-check が BLOCK になる典型ケース

| ケース | 違反観点 | 対応 |
|-------|---------|------|
| canonicalize 漏れ残存 | 1, 3 | apply 担当に再実装 |
| 修正で新しい IO 経路に validation 漏れ | 2, 3 | apply 担当に再実装 |
| capability 過剰許可残存 | 4 | apply 担当に再実装 |
| error message に絶対 path | 5 | apply 担当に再実装 |
| Issue scope_out への変更 (refactor 混入等) | 6 | apply 担当に再実装、または別 Issue 化 |
| save_as UI 削除 | 7 | NEEDS_HUMAN_DECISION (capability 全体禁止) |
| 出力先 workspace 固定 | 7 | NEEDS_HUMAN_DECISION |
| frontend に新規 confirmation dialog 追加で a11y 退化 (aux post-check BLOCK) | 8 | apply 担当 (designer-expert / feature-expert) に再実装 |

---

## NEEDS_HUMAN_DECISION の典型ケース

```text
- security risk が high だが、修正案が UX impact: high になる (capability 縮小が必要)
- 修正方針に複数の選択肢があり (validation 強化 vs capability 制限)、自動判断不能
- 認証 model / token storage / updater 設計の再設計が必要
- 大規模 capability 再設計が必要
- DB migration を伴う互換性問題 (compatibility-expert と分担)
```

`needs_human_decision` block の schema は `_shared/pr-templates.md` の "Needs Human Decision" 節を参照。
