# security-apply-report.md — apply 完了報告テンプレ

<!--
機能概要: security-expert apply mode の完了時に司令官 (op-run) へ返す構造化 report テンプレ。
作成意図: apply_decision / mitigation_applied / legitimate_workflow_preserved / ux_impact /
         requires_aux_post_check を machine-readable に返し、op-run の post-check 配線を可能にする。
注意点: 本 report は司令官への返却用。コミットメッセージや PR 本文ではない。
       PR 本文は `~/.claude/skills/_shared/pr-templates.md` の op-run: PR open テンプレを使う。
-->

## 完了報告フォーマット (司令官 / op-run へ返却)

```yaml
# === apply_decision (必須) ===
apply_decision:
  security_risk: high | medium | low
  ux_impact: none | low | medium | high
  legitimate_workflow_preserved: true | false
  apply_allowed: true | false

# === mitigation_applied (必須) ===
# usable-security.md の mitigation ladder から実際に適用したもの
mitigation_applied:
  - validate
  - canonicalize
  - scope
  - confirm
  - audit
  - permission_split

# === files_changed (必須) ===
files_changed:
  - "src-tauri/src/commands/io.rs"
  - "src-tauri/src/commands/io_test.rs"

# === aux_post_check (必須) ===
requires_aux_post_check: true | false
aux_post_check_experts:
  - ux-ui-audit-expert
aux_post_check_reason: "<UI / workflow に影響する変更を行ったか / なぜ aux post-check が必要か>"

# === verification_results (必須) ===
verification_results:
  static: pass | fail | skipped
  unit: pass | fail | skipped
  build: pass | fail | skipped
  integration: pass | fail | skipped

# === commit_sha (apply 完了時に必須) ===
commit_sha: "<sha (push しない)>"

# === Issue 整合 ===
issue_number: <Issue 番号>
scope_in_respected: true | false
scope_out_violation: false  # 違反なら apply してはいけない

# === assumptions (該当時) ===
assumptions:
  - "<入力情報が不足したため X を仮定した>"

# === blocked_actions (該当時) ===
blocked_actions:
  - "<判断なしで実行しなかった操作>"
```

---

## apply 成功時の例

```yaml
apply_decision:
  security_risk: high
  ux_impact: low
  legitimate_workflow_preserved: true
  apply_allowed: true

mitigation_applied:
  - validate
  - canonicalize
  - scope
  - audit

files_changed:
  - "src-tauri/src/commands/save.rs"
  - "src-tauri/src/commands/save_test.rs"

requires_aux_post_check: false
aux_post_check_experts: []
aux_post_check_reason: ""

verification_results:
  static: pass
  unit: pass
  build: pass
  integration: skipped  # InDesign COM 環境依存のため

commit_sha: "abc1234..."

issue_number: 142
scope_in_respected: true
scope_out_violation: false

summary: |
  src-tauri/src/commands/save.rs::save_user_data に path canonicalize / scope check / 
  reserved name reject / ADS reject を追加した。OS file picker 経由の path は
  user-granted capability として扱い、scope は強制しない。error message は
  generic な文言に sanitize した (絶対 path 漏洩防止)。
  
  attack_path: "frontend invoke → save_user_data(path=../system32/...) → fs::write" は
  canonicalize + scope check + reject により閉じた。
  
  UX 影響: なし (既存 file picker 経由 save の挙動は同じ、不正 path 入力時のみ error 表示)。
```

---

## apply 不可 (needs_human_decision) の例

UX impact が high または legitimate_workflow_preserved: false が必要な場合:

```yaml
apply_decision:
  security_risk: high
  ux_impact: high
  legitimate_workflow_preserved: false
  apply_allowed: false

mitigation_applied: []  # 何も apply しない
files_changed: []

requires_aux_post_check: false
aux_post_check_experts: []

verification_results:
  static: skipped
  unit: skipped
  build: skipped
  integration: skipped

needs_human_decision:
  required: true
  reason: |
    finding を解消するには save_as の OS dialog UI を削除して固定 directory 保存に切り替える
    必要があるが、これは usable_security の forbidden_shortcuts (do_not_remove_file_picker /
    do_not_force_fixed_output_directory) に違反する。
    UX impact: high のため自動 apply 禁止。
  decision_type: usable_security
  options:
    - id: "A"
      label: "現 UX を維持し、save 経路に validation を強化するだけにする"
      consequence: "security_risk は完全には解消しないが、UX は壊れない"
    - id: "B"
      label: "UX を再設計して固定 directory + 別 location 選択フロー (wizard)"
      consequence: "security_risk は解消するが、UX 再設計が必要 (designer-expert / feature-expert 連携)"
    - id: "C"
      label: "Issue scope を分割し、validation 強化のみ本 PR で対応、UX 再設計は別 Issue"
      consequence: "本 Issue は完了扱い、別 Issue で UX 設計"
  recommended_option: "C"
  safest_default: "C"
  blocked_actions:
    - "save_as UI の削除 (UX impact: high / legitimate_workflow_preserved: false)"
  can_continue_without_decision: false
  next_safe_action: "完了報告に blocked として記録、commit せず終了"

issue_number: 142
scope_in_respected: not_applicable  # apply してないため
scope_out_violation: false

summary: |
  この finding を解消するには UX 大幅変更 (save_as UI 削除 / 出力先固定) が必要で、
  usable_security の forbidden_shortcuts に違反する。
  UX impact: high のため自動 apply せず、人間判断を要求。
```

---

## 注意点

- `apply_allowed: false` のときは `commit_sha` は空、`files_changed` は空配列
- `legitimate_workflow_preserved: false` の状態で `apply_allowed: true` にしてはいけない
- `ux_impact: high` の状態で `apply_allowed: true` にしてはいけない
- `verification_results` で fail があれば commit せず、`apply_allowed: false` で報告する
- push しない (push は op-run の責務)
- label の付与・剥奪を行わない (label は op-run の責務)

---

## 司令官 (op-run) の利用

司令官は本 report を読んで:

1. `apply_allowed: true` なら post-check (フェーズ3.5-B) に進める
2. `apply_allowed: false` (`needs_human_decision`) なら `pro-security-needs-fix` 付与 + 人間判断待ち
3. `requires_aux_post_check: true` なら post-check 後に ux-ui-audit-expert post-check を追加実行
4. `verification_results` で fail があれば apply 担当の再 spawn を判断
