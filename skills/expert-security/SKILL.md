---
name: expert-security
description: security-expert に preload される方法論。
---

# expert-security: security-expert の知識ベース

露出面を見つける → 到達経路を証明する → 危険な経路だけを遮断する → 正当なユーザー操作は残す。
不変則 (capability を削らない / mitigation ladder / 到達経路なしの High・Critical 禁止 / UX impact high は人間判断) は agent 定義。
用語: 「露出面」= `security.attack_surface`、「到達経路」= `security.attack_path` (payload の field 名)。

## 判断優先順位

1. Issue / PR の scope_in / scope_out / success_criteria
2. 対象 repo の CLAUDE.md・既存コードの慣習、検証契約 (`~/.claude/skills/_shared/project-profile.md`)
3. 本 skill の references
4. `~/.claude/skills/_shared/` の共通契約
5. 外部知識 (OWASP / CWE / Tauri Security 等)

## モード別手順

spawn prompt に mode が無ければ入力から推定する (scope のみ → scan、PR diff + Issue → post-check)。
OP-managed で自動判断できないものは `needs_human_decision` (decision_type は通常 `security` / `scope` / `risk`)。

### scan / patrol

1. 露出面を棚卸しする (`references/attack-surface-map.md`)。patrol では同ファイルの「patrol の優先対象 (新規追加された変更)」を先に見る。
2. 入力源を信頼境界 A〜G に分類する (`references/source-sink-analysis.md` §1)。
3. source → sink の到達経路を steps で示す。`reachable: true` にできないものは報告しない (§2〜§3)。
4. threat model (actor / preconditions / required_user_action / asset_at_risk) を確定する (§4)。
5. exploitability × impact と evidence_grade で severity を決める (§5〜§6)。Critical / High 以外は出さない。
6. usable security を判定する (`references/usable-security.md` §3)。`legitimate_workflow_preserved: true` にできる mitigation しか提案しない。
7. `recommendation.steps` を mitigation ladder の順で書く (`usable-security.md` §5)。
   `verification_steps` には「元の attack_path を再現する regression test を足す」と「forbidden_shortcuts を守る」、
   `success_criteria` には「attack_path.steps が再現しない / legitimate_workflow_preserved == true / 新たな露出面がない」を入れる。
   `scope_out` には UI の大幅再設計・認証モデル再設計などを入れる。
8. 領域別の観点と severity 目安は各カタログ (tauri-ipc / path-file-io / shell-process / secrets-and-logs / external-url-updater / parser-boundary)。

bulk_group は `security:<concern>` 形式 (一覧は `source-sink-analysis.md` §7)。

### refute

契約は `~/.claude/skills/_shared/refute-contract.md` (security は default `confirmed`)。severity 過大は
`source-sink-analysis.md` §5〜§6 で `downgrade` を判定する。

### apply

`references/apply-policy.md` に従う。可否マトリクスで判定 → UX 中立な mitigation のみ実装 → security regression test 追加 →
検証 → commit (push しない) → 修正完了報告。

### post-check

`references/post-check-policy.md` に従う。worktree の HEAD と指定 head SHA の一致確認 → PR diff と元 Issue の照合 → 8 観点 → 判定 4 種 →
PR コメント + 構造化返却。PR 全体の lens (Workflow / UX / Test / Compatibility / Release / Spec / Refactor) は review-expert の担当なので重複監査しない。

## 出力契約

| mode | 正本 |
|---|---|
| scan / patrol | envelope は `~/.claude/skills/_shared/expert-spawn.md`「scan 出力 envelope 契約」。field・必須性・enum は `op help payload security-finding --json` |
| refute | `~/.claude/skills/_shared/refute-contract.md` §6 |
| apply | `~/.claude/skills/_shared/expert-spawn.md`「修正完了報告 schema」+ `apply-policy.md`「完了報告の security 追加 field」 |
| post-check | `post-check-policy.md`「出力」の返却 field |

拡張 field の判定基準: `security` / `threat_model` は `source-sink-analysis.md`、`usable_security` は `usable-security.md`、
`post_check` は `post-check-policy.md` 観点 8。

## 他 expert との責務分離

| 領域 | 担当 |
|---|---|
| 露出面調査・経路遮断 (IPC / file IO / path / capability / shell / secret / updater / parser / InDesign COM) | 本 expert |
| PR 全体の 7 lens 横断 review (Security/Abuse lens 含む) | review-expert。本 expert は Issue 固有の security 深掘り post-check のみ |
| a11y / 状態網羅 / UI 監査 | ux-ui-audit-expert。本 expert は UI / workflow に影響する mitigation で `requires_aux_post_check: true` を返すだけ |
| バグ修正 / 機能実装 / 構造改善 / 性能改善 | debug / feature / refactor / optimize-expert。本 expert は露出面に直結する場合のみ apply |
| security regression test 以外のテスト全般 | test-expert (finding として指摘のみ) |
| dependency / lockfile / toolchain、release / installer / updater 設計、互換性 / migration | planned expert の領域。finding として指摘し、apply しない (`~/.claude/skills/_shared/planned-experts.md`) |
| 仕様の妥当性 | scope_out として扱い、spec 判断は op-spec へ |

未解消の security finding が残っている apply では code-review を invoke しない (`code_review_skip_reason: "security finding 残置"`)。

## references

| File | 内容 | 使う場面 |
|---|---|---|
| `references/attack-surface-map.md` | 露出面の分類・見る場所・patrol 優先対象 | scan / patrol / post-check 観点 2 |
| `references/source-sink-analysis.md` | 信頼境界 A〜G / source・sink / attack_path / threat model / exploitability・impact / severity / bulk_group | finding 確定前 |
| `references/usable-security.md` | mitigation ladder / 許可・禁止される deny / usable_security field / user-selected path | 修正方針の提示・apply・post-check 観点 7 |
| `references/apply-policy.md` | apply 可否マトリクス / apply してよい・いけない変更 / 手順 / 完了報告の security 追加 field | apply |
| `references/post-check-policy.md` | 8 観点 / 判定 4 種 / aux UX post-check / 返却 field | post-check |
| `references/report-schema.md` | scan payload の正本 pointer | 出力時 |
| `references/tauri-ipc.md` | IPC 入力 / WebView 設定 / capability・permission 最小化 | IPC / capability finding |
| `references/path-file-io.md` | 境界別の scope / Windows path 境界 15 種 | file IO / path finding |
| `references/shell-process.md` | 起動経路 / InDesign COM・ExtendScript | shell / 外部アプリ finding |
| `references/secrets-and-logs.md` | log / error / Toast / artifact への secret・path・文書内容の漏洩 | logging / secret finding |
| `references/external-url-updater.md` | scheme / host / redirect / TLS / updater signature | URL / updater finding |
| `references/parser-boundary.md` | zip-slip / decompression bomb / deserialize DOS / XXE | parser / archive finding |
