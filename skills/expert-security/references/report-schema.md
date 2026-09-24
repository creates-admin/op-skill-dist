# report-schema.md — security-expert payload schema (pointer)

scan / patrol finding (`security` / `threat_model` / `usable_security` / `post_check` 拡張を含む) の正本は
Rust types `op-core::payload::security_finding`。field・必須性・enum は CLI で確認する:

```bash
op help payload security-finding --json
```

- envelope (`{"findings": [...]}`) と共通 field の意味は `~/.claude/skills/_shared/expert-spawn.md`「scan 出力契約」。
- 拡張 field の判定基準: `security` / `threat_model` は `source-sink-analysis.md`、`usable_security` は `usable-security.md`、
  `post_check` は `post-check-policy.md` 観点 8。
- apply と post-check には専用 payload が無い。apply は expert-spawn.md の修正完了報告に `apply-policy.md` の security field を足し、
  post-check は `post-check-policy.md`「返却 field」に従う。
- schema を変えるときは Rust types を起点にし、`expert-spawn.md` の security 拡張節と agents/security-expert.md の必須出力節を合わせる。

schema 違反 (必須 field 欠落 / enum 不正値) は controller 側で fail する。
