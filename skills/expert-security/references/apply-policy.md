# apply-policy.md — apply の可否と範囲

判定の核: **ユーザーの操作能力を減らさずに到達経路だけを塞げるか。減るなら apply しない。**

## 1. 可否マトリクス

`security_risk × ux_impact × legitimate_workflow_preserved` で決める (ux_impact と legitimate_workflow_preserved の判定は `usable-security.md` §3)。

| security_risk | ux_impact | legitimate_workflow_preserved | apply | requires_aux_post_check |
|---|---|---|---|---|
| high | none | true | する | false |
| high | low | true | する | true (確認ダイアログ追加など) |
| high | medium / high | true | `needs_human_decision` | — |
| medium | none | true | する | false |
| medium | low | true | 状況次第でする | true |
| medium | medium / high | any | `needs_human_decision` | — |
| any | any | false | `needs_human_decision` | — |
| low | any | any | しない (別 PR) | — |

## 2. apply してよい変更 (UX 中立)

- path canonicalization / root・workspace・user-selected scope の確認
- shell 文字列連結 → args 配列
- 文脈上不要な URL scheme (`javascript:` / `data:` / `file:`) と known-bad path class (UNC / device / reparse traversal / ADS / reserved name) の reject
- log からの token・secret 除去 / error message の sanitize / log file 権限の縮小 (0600)
- IPC command の入力検証追加
- 実際に未使用の Tauri permission の縮小
- 既存導線を壊さない範囲での上書き・削除・外部起動の確認ダイアログ
- predictable な temp 名 → tempfile crate / rename ベースの atomic write
- TLS・証明書検証を無効化する dangerous flag の削除
- JSX 文字列の escape / archive extraction の zip-slip 対策と size limit
- security regression test

## 3. apply してはいけない変更

- 保存先選択・読込元選択 UI の削除 / export・import 機能の削除 / 外部アプリ連携の削除
- 認証・権限モデル全体の再設計 / updater・installer・signing 設計の変更
- DB migration / file format・serialized format の変更
- dependency update / lockfile 更新を主作業にする変更
- public API / event 名 / IPC contract の変更
- UX impact high の変更

## 4. 手順

1. Issue 指示書 (scope_in / scope_out / verification_steps / success_criteria / gotchas と security 拡張) を読む。
   デザインモック URL があれば UI 変更の目標として `Artifact({action:"read", url})` で確認する。
2. §1 で可否を判定する。apply しないなら `needs_human_decision` を返して終わる (commit しない)。
3. mitigation ladder の範囲 (validate / canonicalize / scope / confirm / audit / permission_split) で実装する。
4. 到達経路の再発を防ぐ security regression test を足す。
5. 検証する (`~/.claude/skills/_shared/project-profile.md` の検証コマンド)。fail なら commit しない。
6. commit する。本文に「遮断した到達経路 / 維持した user capability / post-check 観点との対応」を書く。
   形式は `~/.claude/skills/_shared/commit-convention.md`。push しない。
7. `~/.claude/skills/_shared/apply-completion-checklist.md` に従って完了報告を返す。

途中で次が判明したら `needs_human_decision` で止める: ux_impact が medium 以上になる / scope_out に踏み込む必要がある。
未 commit の部分実装は worktree に残してよい。

コード規約は対象 repo の CLAUDE.md (既定: ネスト 2 階層以内・日本語コメント。`project-profile.md`「対象 repo 規約への準拠 (worker 共通)」)。

## 5. 完了報告の security 追加 field

`~/.claude/skills/_shared/expert-spawn.md`「修正完了報告 schema」に以下を足す。

```yaml
apply_decision:
  security_risk: high | medium | low
  ux_impact: none | low | medium | high
  legitimate_workflow_preserved: true | false
  apply_allowed: true | false
mitigation_applied: [validate, canonicalize, scope, confirm, audit, permission_split]   # 実際に適用したもの
requires_aux_post_check: true | false
aux_post_check_experts: [ux-ui-audit-expert]    # requires_aux_post_check: true のとき
aux_post_check_reason: "<UI / workflow に何が起きたか>"
```

- `apply_allowed: false` なら `commits_added: []`、`needs_human_decision` を付ける (schema は `~/.claude/skills/_shared/invocation-mode.md`、
  `decision_type` は通常 `security`、scope 起因なら `scope`)。選択肢には「UX を維持して validation 強化のみ」を必ず含める。
- `legitimate_workflow_preserved: false` または `ux_impact: high` で `apply_allowed: true` にしない。
- `requires_aux_post_check` の判定は `post-check-policy.md` 観点 8 と同じ基準。
