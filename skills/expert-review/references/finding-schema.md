# finding-schema.md — review-expert payload schema (pointer)

<!--
機能概要: review-expert が出力する machine-readable block (op-review-meta / op-review-finding) の
         payload schema の所在を示す pointer。ADR-0008 (payload 軸) M3 横展開 3/4 (#588) で
         self-describe を Rust descriptor へ移管した。
作成意図: review payload の field 一覧・enum・shape を `op help payload review-finding` で
         self-describe できるようにし、本ファイルは pointer に降格する。ただし review marker の
         field schema 最終正本は `_shared/markers/review-markers.md` のままであり、本 payload
         descriptor はそれに従属する self-describe である (二重正本を作らない、Single Canonical Source Rule)。
注意点: review payload は他 3 expert (scan-finding / apply-report) と別形状。
        review_result によって出力 block 組み合わせが変わる (approve = meta のみ /
        それ以外 = meta + finding[])。詳細は `op help payload review-finding` の shape (object) と
        notes を参照。観点本体は lens-catalog.md、判定軸は result-decision.md、手順原則は
        evidence-policy.md (本ファイルは出力 schema の所在のみ)。
-->

## 正本の二層構造

review-expert の payload schema は **二層** で正本が定まる。混同しないこと。

| 層 | 正本 | 役割 |
|---|------|------|
| **field schema (最終正本)** | `~/.claude/skills/_shared/markers/review-markers.md` | op-review-meta / op-review-finding block の field 一覧 / enum / null 許可ルール / provenance / 集約ルール の canonical 定義 |
| **self-describe (従属)** | `op-core::payload::review_finding` (Rust types) → `op help payload review-finding` | 上記 field schema を CLI から self-describe する descriptor。review-markers.md に従属し、新たな正本を作らない |

本ファイルは review-expert 視点の **実装ガイドの pointer** であり、上記いずれの正本でもない。
schema を確認するときは:

```bash
op help payload review-finding --json   # review payload の shape (object: meta + findings)・必須/任意 field・enum を self-describe
op help payload --list                  # 既知 payload 一覧
```

- 設計判断: [ADR-0008 `op help payload` 軸](../../../op-tools/docs/adr/0008-payload-axis.md)
- Rust types (self-describe descriptor): `op-tools/crates/op-core/src/payload/review_finding.rs`
- **field schema 最終正本**: `~/.claude/skills/_shared/markers/review-markers.md` (op-review-meta / op-review-finding block schema)

## review payload の形状 (他 3 expert と異なる)

review payload は scan-finding (単一 array) / apply-report (単一 object) と異なり、
**top-level object に `meta` + `findings` を持つ別形状**:

| review_result | 必須 block (= payload の中身) |
|--------------|------------------------------|
| `approve` | `meta` のみ (`findings` は空配列) |
| `needs-fix` | `meta` + `findings` (1 件以上) |
| `needs-specialist-review` | `meta` + `findings` (1 件以上) |
| `blocked` | `meta` + `findings` (1 件以上) |

**いかなる場合も `meta` (op-review-meta block 相当) を必ず持つ**。op-merge の gate 検証の根拠。
全体 `review_result` は finding 単位 `result` の最重値で集約する
(`blocked` > `needs-specialist-review` > `needs-fix` > `approve`)。
詳細な集約ルール・null 許可範囲・lens → recommended_fix_expert 対応・finding 本文の書き方は
`op help payload review-finding` の notes および field schema 正本 `markers/review-markers.md` を参照。

## schema 同期の責務 (pointer 化後も継続)

review payload schema を変更するときは **field schema 最終正本 (`markers/review-markers.md`) を起点**に、
以下と同期させる (どれか一方だけ変更してはならない):

- `op-tools/crates/op-core/src/payload/review_finding.rs` (self-describe descriptor、review-markers.md に追従)
- `~/.claude/skills/_shared/pr-templates.md` の review 結果コメント / specialist 判断結果コメント節 (bash gh HEREDOC 実テンプレート)
- `~/.claude/skills/_shared/expert-spawn.md` の review 用 prompt 独立性確保節 / `recommended_fix_expert` の解決順位
- `~/.claude/skills/op-run/SKILL.md` のフェーズ4 / 4.5 節
- `~/.claude/skills/op-merge/SKILL.md` の op-review-meta gate 節 (gate 3a〜3i / 5)

> schema 違反 (必須フィールド欠落 / enum 不正値) は review / op-merge gate で immediate fail。
> 本ファイルは review-expert の **実装ガイド** であり、canonical 仕様 (markers/review-markers.md) の上書きはできない。
