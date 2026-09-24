# security-contract.md — 作業冒頭の核

spawn 直後に読む。mode を決め、該当 mode の手順と出力契約に従う。

## 1. invocation mode

判定と振る舞いは `~/.claude/skills/_shared/invocation-mode.md`。曖昧なら OP-managed 側に倒す。
OP-managed では質問で停止せず、不足情報は `assumptions[]` に記録し、自動判断できないものは
`needs_human_decision` (decision_type は通常 `security` / `scope` / `risk`) で返す。

## 2. モード

| mode | 起動元 | 入力 | 出力 |
|---|---|---|---|
| scan | op-scan / Direct (scope 指定) | scope | `{"findings": [...]}` envelope (security-finding payload) |
| patrol | op-patrol | controller が選んだ area | 同上 |
| refute | op-scan / op-patrol の refute フェーズ | 1 件の finding | refute verdict JSON |
| apply | op-run apply | Issue 指示書 + worktree + branch | commit (push しない) + 修正完了報告 |
| post-check | op-run post-check | PR diff + 元 Issue + head SHA | PR コメント (自然文) + 構造化返却 |

spawn prompt に mode が明記されていればそれに従う。無ければ入力から推定する (scope のみ → scan、PR diff + Issue → post-check)。

## 3. モード別手順

### scan / patrol

1. 露出面を棚卸しする (`attack-surface-map.md`)。patrol では同節の「新規追加変更の優先対象」を先に見る。
2. 入力源を信頼境界 A〜G に分類する (`source-sink-analysis.md` §1)。
3. source → sink の到達経路を steps で示す。`reachable: true` にできないものは報告しない (§2〜§3)。
4. threat model (actor / preconditions / required_user_action / asset_at_risk) を確定する (§4)。
5. exploitability × impact と evidence_grade で severity を決める (§5〜§6)。Critical / High 以外は出さない。
6. usable security を判定する (`usable-security.md`): affected_user_capability / legitimate_workflow_preserved /
   ux_impact / preferred_mitigation / forbidden_shortcuts。`legitimate_workflow_preserved: true` にできる mitigation しか提案しない。
7. `recommendation.steps` を mitigation ladder の順で書く (`usable-security.md` §5)。
   `verification_steps` には「元の attack_path を再現する regression test を足す」と「forbidden_shortcuts を守る」、
   `success_criteria` には「attack_path.steps が再現しない / legitimate_workflow_preserved == true / 新たな露出面がない」を入れる。
   `scope_out` には UI の大幅再設計・認証モデル再設計などを入れる。
8. 領域別の観点は各カタログ (tauri-ipc / path-file-io / shell-process / secrets-and-logs / external-url-updater / parser-boundary) を参照。

scan は read-only (Level 0)。Issue 起票は controller が行う。

### refute (skeptic)

契約は `~/.claude/skills/_shared/refute-contract.md`。security domain の default は `confirmed`。
`refuted` にするには `security_unreachable_proof` (source → sink が届かない / trust boundary で遮断される /
required_user_action が成立しない、を実コード引用で示す) が必要。示せなければ `confirmed`。
severity 過大は `source-sink-analysis.md` §5〜§6 で `downgrade` を判定する。

### apply

`apply-policy.md` に従う。要点: 可否マトリクスで判定 → UX 中立な mitigation のみ実装 → security regression test 追加 →
検証 → commit (push しない) → 修正完了報告。

### post-check

`post-check-policy.md` に従う。要点: worktree の HEAD が指定 head SHA と一致するか確認 (不一致なら BLOCK で報告) →
PR diff と元 Issue の success_criteria / scope を照合 → 8 観点 → 判定 4 種 → PR コメント + 構造化返却。
PR 全体の lens (Workflow / UX / Test / Compatibility / Release / Spec / Refactor) は review-expert の担当なので重複監査しない。

## 4. 出力契約

| mode | 正本 |
|---|---|
| scan / patrol | envelope は `~/.claude/skills/_shared/expert-spawn.md`「scan 出力 envelope 契約」。field は `op help payload security-finding` (`report-schema.md`) |
| refute | `~/.claude/skills/_shared/refute-contract.md` §6 |
| apply | `~/.claude/skills/_shared/expert-spawn.md`「修正完了報告 schema」+ `apply-policy.md`「完了報告の security 追加 field」 |
| post-check | `post-check-policy.md`「返却 field」 |

security finding の固定値: `domain: security` / `severity: critical | high` /
`recommended_runner: security-expert | debug-expert` (op-run が最終決定) / `post_check_expert: security-expert`。
`security` / `threat_model` / `usable_security` / `post_check` の 4 拡張は必須。

HTML marker は書かない。label も操作しない (controller の責務)。

## 5. 禁止事項

- 保存先選択・読込元選択・export / import・外部アプリ連携の capability 全体削除、またはその提案
- OS file picker 経由の path を「untrusted で危険」として禁止する
- 到達経路 (`attack_path`) を示さない High / Critical
- 静的証拠の裏付けがない推測 finding
- `recommended_fix_expert` に ux-ui-audit-expert / review-expert を指定する。post-check expert に review-expert を指定する
- UX impact high の自動 apply
- dependency update / lockfile 更新を主作業とする apply
- OP-managed Mode での質問 / 自由記述の判断保留
- 明示許可なしの能動的検証 (fuzzing / 実環境での再現 / PoC 実行)
- scan / patrol / post-check / refute 中のコード編集。apply でも push しない
- self-review (自分が apply した PR の post-check を同じ spawn で行う)
- mitigation ladder やガイドラインの機械的全適用 (判断材料であって絶対ではない)
