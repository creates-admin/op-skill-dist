# security-scan-finding.md — Issue 起票テンプレ (security domain)

<!--
機能概要: scan / patrol で security domain finding を Issue 化する際の本文テンプレ。
作成意図: canonical schema 拡張 (security / threat_model / usable_security / post_check) を Issue 本文に
         そのまま反映できる構造を提供する。
注意点: 共通テンプレ (`~/.claude/skills/_shared/pr-templates.md` の Issue 起票テンプレ) を補完する。
       hidden marker / ラベル付与は op-scan / op-patrol が行う。
-->

## Issue タイトル

```
[security-expert] <短い要約>
```

例: `[security-expert] export 経由で path canonicalize 漏れ → 任意ファイル書き込み`

---

## Issue 本文 (指示書フル版 + security 拡張)

```bash
# domain = security のラベル付与パターン
# - 基本: --label "pro-security-expert"
# - apply を debug-expert に回す場合: --label "pro-debug-expert" --label "pro-security-expert"
gh issue create \
  --title "[security-expert] <要約>" \
  --label "auto-report" --label "pro-security-expert" --label "severity:<critical|high>" \
  --body "$(cat <<'EOF'
<!-- op-fingerprint: security:<bulk_group>:<primary_file>:<symbol> -->
<!-- op-source: op-scan -->
<!-- op-domain: security -->
<!-- op-scan-expert: security-expert -->
<!-- op-run-expert: security-expert -->
<!-- op-post-check-expert: security-expert -->
<!-- op-security-requires-aux-post-check: false | ux-ui-audit-expert -->

## 概要
<1〜2 文で問題を説明>

## 検出根拠
- 対象ファイル: `path/to/file.ext:LINE`
- 検出スキル: security-expert
- 深刻度: <Critical / High>
- attack_surface: <ipc | file_io | path | shell | capability | secret | url | parser | updater | logging | indesign_com | installer>
- evidence_grade: <direct | inferred | requires_runtime>

## 観測された挙動 / Evidence

```rust
<該当コード 5〜10 行>
```

## Threat Model

| 項目 | 値 |
|------|-----|
| actor | <local_user / malicious_document / malicious_project_file / compromised_frontend / network_attacker / malicious_update_source / malicious_plugin> |
| preconditions | <観測可能な前提条件 (1 行ずつ)> |
| required_user_action | <ユーザー操作が必要なら明記、不要なら "なし"> |
| asset_at_risk | <user_file / production_path / token / document_content / generated_artifact> |

## Source → Sink Reachability

| 項目 | 値 |
|------|-----|
| source.kind | <frontend_invoke / imported_file / external_url / config / clipboard / drag_drop / user_selected_file / env / cli_arg> |
| source.symbol | `<関数 / 入口>` |
| source.input_name | `<parameter>` |
| sink.kind | <file_read / file_write / file_delete / rename / copy / execute / request / disclose / parse / update> |
| sink.symbol | `<関数 / 出口>` |
| trust_boundary | <frontend_to_backend / user_file / user_selected_path / external_url / local_fs / env / config / generated_script / com_boundary> |

### Attack Path (steps)

1. <source から sink までの具体的な流れ Step 1>
2. <Step 2>
3. <Step 3>
4. <...>

reachable: true / false
exploitability: <none / theoretical / reachable / practical>
impact:
- confidentiality: <none / low / medium / high>
- integrity: <none / low / medium / high>
- availability: <none / low / medium / high>

## Usable Security 方針

| 項目 | 値 |
|------|-----|
| affected_user_capability | <save_as / open_file / choose_directory / export / import / external_app_launch / batch_processing から該当を列挙> |
| legitimate_workflow_preserved | true (推奨 mitigation で workflow 維持できる) |
| ux_impact | <none / low / medium / high> |
| preferred_mitigation | <validate / canonicalize / scope / confirm / audit / permission_split> |
| forbidden_shortcuts | <do_not_remove_file_picker / do_not_force_fixed_output_directory / do_not_remove_import_export / do_not_remove_external_app_launch / do_not_disable_capability_entirely / do_not_redesign_auth_model / do_not_change_updater_design / do_not_force_dependency_update> |

---

## 🤖 apply agent への指示書

### scan が立てた仮説
<根本原因として最有力と判断したもの>

### 除外した仮説 (scan が検証して否定した)
- <仮説 X: 否定の根拠>
- <仮説 Y: 否定の根拠>

### 触ってよいファイル (scope_in)
- `path/to/file.ext`
- `path/to/related.ext`

### 触ってはいけないファイル / 領域 (scope_out)
- <別 Issue で扱う範囲、影響範囲外、UI 大幅再設計、認証 model 再設計など>

### 推奨修正手順 (mitigation ladder に従う)

1. **validate**: <入力検証の追加>
2. **canonicalize**: <path / URL / encoding の正規化>
3. **scope**: <scope check (boundary B = user-selected の場合は scope 強制しない)>
4. **confirm**: <破壊的操作の確認 (UI 既存導線維持)>
5. **audit**: <error / log の sanitize>

### 必須検証項目
- [ ] 元 finding (attack_path) が閉じる test を追加
- [ ] 既存テストが pass
- [ ] cargo clippy / cargo fmt --check pass
- [ ] usable_security の forbidden_shortcuts が守られている
- [ ] ux_impact == none / low に収まる

### 成功条件 (success_criteria)
- 元 finding の attack_path.steps が再現しない
- legitimate_workflow_preserved == true
- 別の攻撃面が増えていない

### 既知の落とし穴 / 注意点
- <scan が遭遇した罠 / apply で踏みやすいミス>
- <例: canonicalize 失敗時の error に絶対 path が漏れがち>

### usable security 不変則
- save_as / open_file / export / import / external_app_launch を削除しない
- 出力先を workspace 等に固定しない
- capability 全体を disable しない
- UX impact high の修正は自動 apply せず needs_human_decision で停止する

---

## 関連
<関連 Issue / PR / 既知の議論があれば>

---
🤖 op-scan による自動起票 (security-expert)
EOF
)"
```

---

## ラベル例

- `auto-report`
- `pro-security-expert` (apply 兼 post-check)
- 必要なら `pro-debug-expert` (apply を debug-expert に回す場合)
- `severity:critical` または `severity:high`
- `batch` (bulk_group で 5 件以上をバッチ Issue 化する場合)

---

## バッチ Issue (bulk_group ベース)

同質な検出 5 件以上は `~/.claude/skills/_shared/pr-templates.md` の「op-scan: バッチ Issue 起票テンプレ」を使う。
タイトル例:

```
[security-expert] path canonicalize 漏れ一括対応 (export 系 8 件)
```

本文には **対象一覧テーブル** + **共通の threat_model / usable_security 方針** + **指示書** を含める。

---

## hidden marker のサニティ

起票後、以下が必ず Issue 本文先頭に含まれていることを確認:

```markdown
<!-- op-fingerprint: security:... -->
<!-- op-source: op-scan -->
<!-- op-domain: security -->
<!-- op-scan-expert: security-expert -->
<!-- op-run-expert: security-expert -->  # または debug-expert
<!-- op-post-check-expert: security-expert -->
<!-- op-security-requires-aux-post-check: false -->  # または ux-ui-audit-expert
```

`op-security-requires-aux-post-check: ux-ui-audit-expert` を設定するのは、
推奨 mitigation が UI / workflow に影響することが事前に判明している場合のみ。
通常は `false` で起票し、apply 後の post-check で実際に判定する。
