# report-schema.md — refactor-expert payload schema (pointer)

<!--
機能概要: refactor-expert が出力する scan finding (immediate_refactor + architecture_debt を finding_type で
         分岐する 1 struct) の正規仕様。ADR-0008 (payload 軸) M3 横展開 2/4 (#587) で Rust types 正本へ移管済。
作成意図: 散在していた散文 schema を `op-core::payload::refactor_finding` の Rust types に集約し
         (Single Canonical Source Rule)、本ファイルは pointer に降格する。drift を物理的に起こさない。
注意点: scan finding (immediate_refactor / architecture_debt) の散文 schema 全文は op-core::payload に移管済。
       詳細は `op help payload refactor-finding` を参照。apply report (contract_preservation 等) は
       apply-report payload (op-core::payload::apply_report) が canonical のため本 payload の対象外。
       fingerprint (op-fingerprint / op-refactor-debt-key) は payload schema ではなく dedup 運用記述のため
       `_shared/dedup-policy.md` を正本とする (本 pointer の対象外)。
-->

## 正本

refactor-expert の scan / patrol finding payload (`finding_type` で immediate_refactor + architecture_debt を
分岐し、`execution_mode` / `direct_apply_safe` / `affected_paths` / `proposed_stages` / `needs_human_decision` 等の
refactor 拡張を含む) の正本は **`op-core::payload::refactor_finding`** (Rust types) に移管済 (ADR-0008 M3 #587)。

CLI で確認する:

```bash
op help payload refactor-finding --json   # 必須/任意 field・enum・shape の self-describe
op help payload --list                    # 既知 payload 一覧
```

- 設計判断: [ADR-0008 `op help payload` 軸](../../../op-tools/docs/adr/0008-payload-axis.md)
- Rust types 正本: `op-tools/crates/op-core/src/payload/refactor_finding.rs`

> **payload の対象範囲**: 本 payload は scan finding (immediate_refactor + architecture_debt を `finding_type` で
> 分岐する 1 struct) に絞る。**apply report** (`contract_preservation` / `commits_added` / `verification_ladder` 等) は
> **apply-report payload (`op-core::payload::apply_report`) が canonical** であり、refactor 側で再定義しない
> (`op help payload apply-report --json` を参照)。

## architecture_debt の累積メタデータ責務 (役割分担)

agent (refactor-expert) は新規検出時点の暫定値のみを返す (`seen_count = 1` / `risk_trend = "stable"` /
`first_detected_at = last_seen_at = today`)。累積メタデータ (`seen_count`, `risk_trend`, `last_seen_at` の更新,
`needs:triage` ラベル付与) は **op-patrol が fingerprint 突合により上書き** する。agent 側で過去検出回数を
推測してはならない。詳細は `architecture-debt.md` の Tracking Policy 節および
`~/.claude/skills/expert-refactor/SKILL.md` の Architecture Debt Tracking 節を参照。

## fingerprint の所在 (payload schema ではない)

`op-fingerprint` / `op-refactor-debt-key` は **dedup 用の運用記述** であり payload schema ではない。
refactor-expert は finding 内に fingerprint 文字列を埋め込まず、位置情報 (`files` / `symbols` /
`bulk_group` / `affected_paths`) を埋めるだけでよい (op-scan / op-patrol が自動生成する)。

正本:

- `~/.claude/skills/_shared/dedup-policy.md` — `op-fingerprint` 共通仕様 + `op-refactor-debt-key`
  (architecture_debt 補助 marker) の生成規則・優先順位

## schema 同期の責務 (pointer 化後も継続)

本 payload schema の変更時は **Rust types 正本 (`refactor_finding.rs`) を起点**に、以下と同期させる
(どれか一方だけ変更してはならない):

- `~/.claude/skills/_shared/expert-spawn.md` の canonical schema 節
- `~/.claude/agents/refactor-expert.md` の必須出力節
- `~/.claude/skills/op-scan/SKILL.md` / `~/.claude/skills/op-patrol/SKILL.md` の finding 受領節

> apply report / Issue 本文 hidden marker (`op-fingerprint` / `op-refactor-debt-key`) の詳細は、
> `op help payload refactor-finding` の notes および上記同期先 (expert-spawn.md / dedup-policy.md) を正本とする。
> schema 違反 (必須フィールド欠落 / enum 不正値) は scan / patrol / apply で immediate fail。
