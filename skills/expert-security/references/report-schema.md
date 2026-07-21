# report-schema.md — security-expert payload schema (pointer)

<!--
機能概要: security-expert が出力する canonical schema 拡張 (security / threat_model / usable_security /
         post_check) の正規仕様。ADR-0008 (payload 軸) M3 横展開 1/4 (#586) で Rust types 正本へ移管済。
作成意図: 散在していた散文 schema を `op-core::payload::security_finding` の Rust types に集約し
         (Single Canonical Source Rule)、本ファイルは pointer に降格する。drift を物理的に起こさない。
注意点: scan/patrol finding の散文 schema 全文は op-core::payload に移管済。
       詳細は `op help payload security-finding` を参照。apply report / post-check meta block /
       Issue 本文 marker の正本は下記「schema 同期の責務」先 (expert-spawn.md / pr-templates.md)。
-->

## 正本

security-expert の scan/patrol finding payload (`security` / `threat_model` / `usable_security` /
`post_check` 拡張を含む) の正本は **`op-core::payload::security_finding`** (Rust types) に移管済 (ADR-0008 M3 #586)。

CLI で確認する:

```bash
op help payload security-finding --json   # 必須/任意 field・enum・shape の self-describe
op help payload --list                    # 既知 payload 一覧
```

- 設計判断: [ADR-0008 `op help payload` 軸](../../../op-tools/docs/adr/0008-payload-axis.md)
- Rust types 正本: `op-tools/crates/op-core/src/payload/security_finding.rs`

## schema 同期の責務 (pointer 化後も継続)

本 payload schema の変更時は **Rust types 正本 (`security_finding.rs`) を起点**に、以下と同期させる
(どれか一方だけ変更してはならない):

- `~/.claude/skills/_shared/expert-spawn.md` の canonical schema 節
- `~/.claude/skills/_shared/pr-templates.md` の post-check meta block 節
- `~/.claude/agents/security-expert.md` の必須出力節
- `~/.claude/skills/op-run/SKILL.md` のフェーズ3.5-B 節
- `~/.claude/skills/op-merge/SKILL.md` の gate 節

> apply report / post-check meta block / Issue 本文 hidden marker の詳細は、`op help payload security-finding`
> の notes および上記同期先 (expert-spawn.md / pr-templates.md) を正本とする。
> schema 違反 (必須フィールド欠落 / enum 不正値) は scan / patrol / apply / post-check で immediate fail。
