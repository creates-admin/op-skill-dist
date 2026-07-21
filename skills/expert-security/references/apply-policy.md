# apply-policy.md — apply 可否判定 / UX impact / 限定 apply の許可リスト

<!--
機能概要: security-expert が apply mode で「何を apply してよいか / してはいけないか」を判定する規約。
作成意図: UX impact high の自動 apply を構造的に防ぎ、UX 中立な mitigation のみ実装する。
注意点: 修正方針 (mitigation ladder) は usable-security.md。
       affected_user_capability / legitimate_workflow_preserved / ux_impact の判定は user-capability-preservation.md。
-->

## apply mode の前提

- spawn 元: op-run フェーズ2-C (security domain Issue の実装)
- 入力: Issue 指示書 + worktree + branch + canonical schema 拡張
- 出力: apply report + commit (push しない)
- self-review 防止: apply 担当が `security-expert` になった場合、post-check は別 spawn

apply 可否は **`apply_decision` block** として構造化して返す:

```yaml
apply_decision:
  security_risk: high | medium | low
  ux_impact: none | low | medium | high
  legitimate_workflow_preserved: true | false
  apply_allowed: true | false
  needs_human_decision:
    decision_type: usable_security | scope | risk
    reason: "<人間判断が必要な根拠>"
```

---

## 判定マトリクス

| security_risk | ux_impact | legitimate_workflow | apply_allowed | requires_aux_post_check |
|---------------|-----------|--------------------|--------------|------------------------|
| **high** | none | true | **true** | false |
| **high** | low | true | **true** | true (UI 変更ありなら) |
| **high** | medium | true | **needs_human_decision** | — |
| **high** | high | true | **needs_human_decision** | — |
| any | any | **false** | **needs_human_decision** | — |
| medium | none | true | true (UX 中立 hardening) | false |
| medium | low | true | true (case by case) | true |
| medium | medium/high | any | needs_human_decision | — |
| low | any | any | false (apply しない、別 PR) | — |

---

## apply してよいもの (UX 中立な改修)

```text
- path canonicalization の追加
- root / workspace / user-selected scope の確認
- shell 文字列連結を args 配列に変える
- unsafe URL scheme (javascript: / data: / file: 等の文脈不適切な scheme) の reject
- known-bad path class (UNC / device path / reparse point traversal / ADS / reserved name) の reject
- token / secret の log 出力除去
- error message の sanitize (production path / document content / token を除去)
- IPC command の入力検証追加
- Tauri capability の明らかな過剰許可の縮小 (実 unused のみ)
- overwrite / delete / external launch の確認ダイアログ追加 (UI 既存導線を壊さない範囲)
- security regression test の追加
- log permission の縮小 (mode 0600)
- temp file の predictable name → tempfile crate 利用
- atomic write (rename ベース) の導入
- TLS / cert 検証の dangerous flag 削除
- JSX 文字列の proper escape 追加
- archive extraction の zip-slip / size limit 追加
```

---

## apply してはいけないもの (UX 破壊 / 越権 / human decision 領域)

```text
- 保存先選択 UI の削除
- 読込元選択 UI の削除
- export / import 機能そのものの削除
- 外部アプリ連携 (InDesign / Photoshop / Acrobat 等) の削除
- 認証 / 権限モデル全体の再設計
- updater / installer / signing 設計の変更
- DB migration を伴う変更
- dependency update / lockfile 更新を主作業にする変更
- public API / event name / IPC contract の変更 (refactor-expert / spec-expert と分担)
- UX impact high の変更を自動実装する
- file format / serialized format の変更 (compatibility-expert と分担)
```

---

## apply の標準フロー

```text
1. Issue 指示書を読む
   - scope_in / scope_out / verification_steps / success_criteria / gotchas
   - canonical schema 拡張 (security / threat_model / usable_security)

2. apply 可否を判定 (上記マトリクス)
   - UX impact が medium / high なら needs_human_decision で停止
   - legitimate_workflow_preserved == false なら needs_human_decision で停止
   - security_risk が low なら apply しない (別 PR)

3. UX 中立な mitigation のみ実装
   - usable-security.md の mitigation ladder に従う
   - validate / canonicalize / scope / confirm / audit / permission_split から選ぶ
   - capability 全体の deny は使わない

4. CLAUDE.md 規約準拠
   - ネスト 2
   - 日本語コメント (作成意図 / 注意点)

5. security regression test を追加
   - 攻撃経路の再発を防ぐ test
   - canonical schema 拡張 + Issue verification_steps を満たす

6. verification 実行
   - cargo fmt / cargo clippy / cargo test (project-profile.md 参照)
   - フロントエンド変更があれば pnpm test 等

7. commit
   - 日本語 commit message
   - 変更理由 + mitigation summary
   - push しない (push は op-run の責務)

8. apply report を返す (templates/security-apply-report.md)
   - apply_decision
   - mitigation_applied (validate / canonicalize / scope / confirm / audit / permission_split)
   - files_changed
   - legitimate_workflow_preserved
   - ux_impact
   - requires_aux_post_check
   - aux_post_check_experts
   - verification_results
   - commit_sha
```

---

## requires_aux_post_check の判定

apply 後の post-check で UX/UI auxiliary post-check が必要か:

`requires_aux_post_check: true` にすべきケース:

- save_as / open_file / export / import の UI に新規 confirmation dialog を追加
- error / warning Toast の文言を大きく変更
- workflow の step 数が増えた (1 click → 2 click)
- batch processing UI に確認段階を増やした
- focus / keyboard 操作経路に影響しうる UI 変更
- a11y 要素 (aria-label / role / contrast) が変わった

`requires_aux_post_check: false` (= `not_required`) にできるケース:

- backend のみの修正 (UI / WebView 領域に diff なし)
- log / error 文字列の変更 (Toast / dialog 表示しない部分)
- capability JSON / 設定 file 変更 (UI ボタン / メニューに影響なし)
- IPC command の入力 validation 追加 (frontend がエラーを既存 error path で扱う)
- Tauri capability 縮小 (実 unused のみ削除、UI から呼ばれない command の削除)

---

## apply 失敗時の扱い

```text
- 検証 (cargo test 等) が fail なら commit しない
- 修正方針が UX impact high になることが apply 中に判明したら needs_human_decision で停止
- scope_out への踏み込みが必要だと判明したら needs_human_decision で停止
- needs_human_decision で停止した場合も、worktree 内で部分実装 (commit せず) は残してよい
  司令官が判断後、別 expert に引き継ぐか scope を再定義する
```

---

## CLAUDE.md 規約 (再掲)

apply 中も以下を守る:

- ネスト 2 (if / loop / callback)
- 日本語コメント (関数 / クラス / 主要処理に作成意図 / 注意点)
- 自明なコードに過剰なコメント禁止
- 検証なしの実装禁止
- 過剰な抽象レイヤー禁止
- フラット構造優先 (3 階層以内)

詳細は `~/.claude/CLAUDE.md`。

---

## 司令官 / op-run へのシグナル (apply report)

`templates/security-apply-report.md` に従う。最低限以下を含める:

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
  - src-tauri/src/commands/io.rs
  - src-tauri/src/commands/io_test.rs

requires_aux_post_check: false
aux_post_check_experts: []

verification_results:
  static: pass
  unit: pass
  build: pass

commit_sha: <sha>
```

`needs_human_decision` で停止した場合は `templates/security-needs-human-decision.md` を使う。
