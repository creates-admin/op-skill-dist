# report-schema.md — security-expert payload schema (pointer)

scan / patrol finding (`security` / `threat_model` / `usable_security` / `post_check` 拡張を含む) の正本は
Rust types `op-core::payload::security_finding`。field・必須性・enum は CLI で確認する:

```bash
op help payload security-finding --json
```

- envelope (`{"findings": [...]}`) と共通 field の意味は `~/.claude/skills/_shared/expert-report-schemas.md`「scan 出力契約」。
- 拡張 field の判定基準: `security` / `threat_model` は `source-sink-analysis.md`、`usable_security` は `usable-security.md`、
  `post_check` は `post-check-policy.md` 観点 8。
- apply と post-check には専用 payload が無い。apply は expert-report-schemas.md の修正完了報告に `apply-policy.md` の security field を足し、
  post-check は `post-check-policy.md`「出力」の返却 fieldに従う。

schema 違反 (必須 field 欠落 / enum 不正値) は controller 側で fail する。

## mode 別の出力契約

| mode | 正本 |
|---|---|
| scan / patrol | envelope は `~/.claude/skills/_shared/expert-report-schemas.md`「scan 出力 envelope 契約」。field・必須性・enum は `op help payload security-finding --json` |
| refute | `~/.claude/skills/_shared/refute-contract.md` §6 |
| apply | `~/.claude/skills/_shared/expert-report-schemas.md`「修正完了報告 schema」+ `apply-policy.md`「完了報告の security 追加 field」 |
| post-check | `post-check-policy.md`「出力」の返却 field |
