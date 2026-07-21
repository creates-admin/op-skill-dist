# security-needs-human-decision.md — 人間判断要求テンプレ

<!--
機能概要: security-expert が apply / post-check で人間判断が必要と判断した場合に返す YAML block。
作成意図: UX impact high / capability 全体禁止 / 認証 model 再設計など、自動判断不能なケースを
         構造化して司令官 (op-run) に返す。質問テキストではなく options / safest_default で判断材料を提供する。
注意点: 詳細 schema・mode 判定・禁止フレーズの正規仕様は `~/.claude/skills/_shared/invocation-mode.md` を参照。
       本ファイルは security-expert 向けの埋め込み形式テンプレ。
-->

## 標準テンプレ (YAML、apply / post-check report に埋め込む)

```yaml
needs_human_decision:
  required: true
  reason: "<人間判断が必要な根拠 (1〜2 文)>"
  decision_type: usable_security | scope | risk | security | compatibility | release | environment | deletion | dependency
  options:
    - id: "A"
      label: "<選択肢 A の概要>"
      consequence: "<結果の説明>"
    - id: "B"
      label: "<選択肢 B の概要>"
      consequence: "<結果の説明>"
  recommended_option: "A" | "B" | ... | "none"
  safest_default: "A" | "B" | ...
  blocked_actions:
    - "<判断なしでは絶対に実行しない操作>"
  can_continue_without_decision: true | false
  next_safe_action: "<続行可能な場合の次の行動>"
```

---

## decision_type の選び方

| decision_type | いつ使うか |
|---------------|----------|
| `usable_security` | UX impact high / legitimate_workflow_preserved: false が必要 / capability 全体禁止が必要 |
| `scope` | Issue scope_in 外への踏み込みが必要 / scope 再定義が必要 |
| `risk` | security risk と UX trade-off の判断が必要 |
| `security` | security 設計の根本変更 (auth model / token storage) が必要 |
| `compatibility` | 保存形式 / migration を伴う変更が必要 (compatibility-expert と分担) |
| `release` | updater / installer / signing 設計の変更が必要 (release-expert と分担) |
| `environment` | dependency update / lockfile 更新を主作業にする変更が必要 (env-expert と分担) |
| `deletion` | 重要な capability / feature の削除判断が必要 |
| `dependency` | 新規 dependency 追加 / 既存 dependency 削除が必要 |

---

## 出力例 1: UX impact high で capability 縮小が必要 (usable_security)

```yaml
needs_human_decision:
  required: true
  reason: |
    finding を解消するには save_as の OS dialog UI を削除して固定 directory 保存に切り替える必要があるが、
    これは usable_security の forbidden_shortcuts (do_not_remove_file_picker /
    do_not_force_fixed_output_directory) に違反する。UX impact: high のため自動 apply 禁止。
  decision_type: usable_security
  options:
    - id: "A"
      label: "現 UX を維持し、save 経路に validation 強化のみ"
      consequence: "security_risk は完全解消しないが、UX は壊れない (validation で大半の攻撃経路は閉じる)"
    - id: "B"
      label: "UX 再設計 (固定 directory + 別 location 選択 wizard)"
      consequence: "security_risk は完全解消するが、UX 再設計が必要 (designer-expert / feature-expert 連携)"
    - id: "C"
      label: "Issue scope を分割。validation 強化のみ本 PR で対応、UX 再設計は別 Issue"
      consequence: "本 Issue は完了扱い、別 Issue で UX 設計を spec-expert / designer-expert に handoff"
  recommended_option: "C"
  safest_default: "C"
  blocked_actions:
    - "save_as UI の削除 (UX impact: high)"
    - "出力先 directory の固定化 (legitimate_workflow_preserved: false)"
  can_continue_without_decision: false
  next_safe_action: "完了報告に blocked として記録、commit せず終了"
```

---

## 出力例 2: scope_out への踏み込み (scope)

```yaml
needs_human_decision:
  required: true
  reason: |
    Issue scope_in は src-tauri/src/commands/io.rs だが、修正には frontend 側 (Toast 通知) の変更が必要。
    Issue scope_out には frontend が含まれており、踏み込み判断が必要。
  decision_type: scope
  options:
    - id: "A"
      label: "Issue scope_in に frontend を追加して同 PR で修正"
      consequence: "PR は広がるが silent な error 退化を防げる"
    - id: "B"
      label: "frontend 変更は別 Issue 化"
      consequence: "本 PR は backend のみ完了。frontend は別 Issue (feature-expert / designer-expert)"
  recommended_option: "B"
  safest_default: "B"
  blocked_actions:
    - "scope_out (frontend) のファイル編集"
  can_continue_without_decision: true
  next_safe_action: "backend のみ apply 完了として commit、frontend candidate を別 Issue 化"
```

---

## 出力例 3: 認証 model 再設計が必要 (security)

```yaml
needs_human_decision:
  required: true
  reason: |
    finding は token storage の安全性に関わるが、解消には Keychain / Credential Manager 連携を含む
    認証 model の再設計が必要。本 expert の apply 範囲を超える (forbidden_shortcuts:
    do_not_redesign_auth_model)。
  decision_type: security
  options:
    - id: "A"
      label: "Keychain / Credential Manager 連携を含む auth model 再設計を別 Issue 化"
      consequence: "spec-expert + security-expert で再設計、本 PR は閉じる"
    - id: "B"
      label: "暫定対応として token を encrypted file に保存"
      consequence: "secret leak リスクは下がるが、ユーザー入力 password 不要の運用が崩れる"
  recommended_option: "A"
  safest_default: "A"
  blocked_actions:
    - "認証 model 全体の再設計"
    - "token storage の根本変更"
  can_continue_without_decision: false
  next_safe_action: "完了報告に blocked として記録、commit せず終了"
```

---

## 出力例 4: post-check で legitimate_workflow_preserved: false を検出

post-check mode で apply 担当が UI 削除 / capability 全体禁止を実装した場合:

```yaml
needs_human_decision:
  required: true
  reason: |
    apply で save_as UI の削除が確認された (legitimate_workflow_preserved: false)。
    これは usable_security の forbidden_shortcuts に違反するため、自動 PASS にできない。
    人間判断: 修正方針を変えるか、override を承認するか。
  decision_type: usable_security
  options:
    - id: "A"
      label: "BLOCK 判定として apply 担当に再実装を依頼 (UX 中立 mitigation のみ)"
      consequence: "apply 担当が再 spawn され、validation 強化のみで実装し直す"
    - id: "B"
      label: "manual override を承認 (緊急 hotfix 等の例外運用)"
      consequence: "pro-security-post-check-manual-override + op-manual-override block で承認、follow-up Issue で再 audit"
  recommended_option: "A"
  safest_default: "A"
  blocked_actions:
    - "PASS 判定 (legitimate_workflow_preserved: false のため)"
    - "merge (gate で BLOCK)"
  can_continue_without_decision: false
  next_safe_action: "post_check_result: needs_human_decision で記録、pro-security-needs-fix 付与"
```

---

## 注意点

- 質問テキスト ("どうしますか?" / "確認してください") は禁止。`options[]` で構造化
- `recommended_option` は必須 (判断保留なら "none")
- `safest_default` も必須 (commander が即時に決められない場合の既定値)
- `blocked_actions` で判断なしで実行しない操作を必ず列挙
- `can_continue_without_decision: false` のときは必ず停止 (commit せず終了)
- 詳細 schema は `~/.claude/skills/_shared/invocation-mode.md` および `~/.claude/skills/_shared/pr-templates.md` の "Needs Human Decision" 節
