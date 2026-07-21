<!--
schema_version: 2
last_breaking_change: 2026-05-07
notes: v1 (2026-05-06) — Marker schema 分割 (followup #20) で `pr-templates.md` から
       op-merge gate skip / 例外運用に使う `<!-- op-manual-override -->` block の detailed schema
       を切り出した正本ファイル。marker 名 / owner / consumer / core meaning は
       引き続き `labels-and-markers.md` が正本。
       v2 (2026-05-07) — `reviewed_head_sha` フィールドを必須化。stale override 検出ルールを追加。
       `has_valid_manual_override(target, expected_head_sha)` 10-条件 AND 判定 pseudocode を canonical 化。
       label-only bypass を構造的に拒否する文言に揃えた。

機能概要:
  op-merge gate 12〜13 / 15〜16 / 17 / 18 で UI / security post-check の skip + BLOCK 状態の
  例外マージを承認する manual override marker block の detailed schema、必須フィールド、validation
  rule を集約する。

作成意図:
  pr-templates.md に存在していた manual override block schema を独立した正本に切り出す
  (Single Canonical Source Rule)。labels-and-markers.md からも `pr-templates.md の
  op-manual-override 節を正本とする` と参照されていたが、本ファイルが新たな正本となる。

注意点:
  - marker 名 / core semantics は `labels-and-markers.md` の Override Markers 節が正本。
    本ファイルは詳細フィールド / 必須要件 / validation rule の正本。
  - 常用厳禁 / 緊急例外承認のみ運用する。silent な常用化を構造的に防ぐため、必ず block を残す。
  - manual override label (`pro-ux-ui-audit-manual-override` / `pro-security-post-check-manual-override`)
    の付与だけでは無効。block 不在時は op-merge が「無効」とみなし、対応 gate を中断扱いにする。
  - bash gh コマンドや PR comment 本文の具体例は `pr-templates.md` を参照する。
-->

# Merge Gate Markers — Detailed Schema

op-merge gate skip / 例外運用に使う marker の detailed schema 正本。

marker 名・所有者・consumer・基本 meaning・runtime spawn effect・merge blocking effect は
`skills/_shared/markers/labels-and-markers.md` の **Override Markers** 節が canonical。

PR comment / bash gh HEREDOC 形式の実テンプレートは `skills/_shared/pr-templates.md` の
「op-merge: manual override block」節を参照する。

---

## 関連正本ファイル

| 概念 | 正本 |
|---|---|
| marker 名 / owner / consumer / 基本 meaning | `skills/_shared/markers/labels-and-markers.md` |
| op-merge gate 全体仕様 (gate 12〜13 / 15〜16 / 17 / 18) | `skills/op-merge/SKILL.md` |
| UI 影響 PR の post-check schema | `skills/_shared/markers/ux-ui-markers.md` |
| security 影響 PR の post-check schema | `skills/_shared/markers/security-markers.md` |
| 共通 post-check meta block | `skills/_shared/markers/post-check-markers.md` |
| PR comment テンプレ (markdown / bash gh HEREDOC) | `skills/_shared/pr-templates.md` |

---

## `<!-- op-manual-override -->` block schema

UI 影響 PR (gate 12〜13) または security 影響 PR (gate 15〜16 / 17) で post-check が **skipped** または
**BLOCK** のままマージする例外運用を行う場合、人間が PR コメントに残す承認 block。

op-merge は対応する manual-override **ラベル** + **本 block** の **両方が揃った場合のみ** gate を
skip する。ラベルだけでは認めない (理由 / 承認者 / follow-up Issue が記録されないため)。

### 必須フィールド

```text
<!-- op-manual-override
override_target: pro-ux-ui-audit-manual-override | pro-security-post-check-manual-override
approver: <GitHub handle>
reason: <なぜ post-check skip / BLOCK のままマージしたか。緊急性の根拠を含める>
followup_issue: #<N>
overridden_at: <ISO8601 timestamp>
reviewed_head_sha: <40 hex SHA, override 承認時の PR head SHA>
-->
```

| フィールド | 型 | 必須 | 内容 |
|---|---|---|---|
| `override_target` | enum | ✓ | どのラベルの override を意味するか。`pro-ux-ui-audit-manual-override` または `pro-security-post-check-manual-override` |
| `approver` | string | ✓ | override を承認した人間の GitHub handle (`@username` 形式または bare username) |
| `reason` | string | ✓ | override の根拠。緊急対応 / hotfix / 検証 PR 等の状況説明。「テストのため」のような曖昧文言は不可 |
| `followup_issue` | string | ✓ | override 後の再 audit / 是正を追跡する Issue 番号 (`#42` 等)。**security override の場合は security-expert による再 post-check を必ず予約** |
| `overridden_at` | string | ✓ | ISO8601 タイムスタンプ (例: `2026-05-05T14:23:00+09:00`) |
| `reviewed_head_sha` | string | ✓ | override 承認時の PR head SHA (40 hex)。現在の `headRefOid` と一致しない場合は **stale** 扱いで gate skip 不可。`<!-- op-review-meta -->` の `reviewed_head_sha` と同じ概念で、override 後に push があれば再 override が必要 |

### `override_target` enum

| 値 | 適用 gate | skip 対象 |
|---|---|---|
| `pro-ux-ui-audit-manual-override` | gate 12〜13 | UX/UI post-check の skip / BLOCK の例外承認 |
| `pro-security-post-check-manual-override` | gate 15〜16 / 17 / 18 | security post-check (本体および aux post-check) の skip / BLOCK の例外承認 |

ラベル名と完全一致させる (typo / 短縮形は無効)。詳細なラベル semantics は
`skills/_shared/markers/labels-and-markers.md` の Active Post-check Labels 節を参照。

---

## op-merge gate との関係

### 必須要件 (block + label の両立)

op-merge は以下の **両方** が揃った場合のみ gate を skip する:

1. PR に対応する manual-override **ラベル** (`pro-ux-ui-audit-manual-override` または
   `pro-security-post-check-manual-override`) が付与されている。
2. PR コメントに対応 `override_target` を持つ `<!-- op-manual-override -->` block が存在する。

ラベルだけ / block だけでは無効。op-merge は block 不在時に label を「無効」とみなし、
対応 gate (12〜13 / 15〜16 / 17 / 18) を **中断扱い** にする。

### gate 適用範囲

| Gate | 適用 PR | override で skip 可能なケース |
|---|---|---|
| 12 | UX/UI 影響 PR (`pro-ux-ui-audit-skipped`) | post-check spawn 失敗等で skip 状態のまま緊急マージ |
| 13 | UX/UI 影響 PR (post-check `BLOCK`) | BLOCK 判定のまま緊急マージ (再実装よりも即時マージが必要な事情) |
| 15 | security 影響 PR (`pro-security-post-check-skipped`) | security post-check spawn 失敗等で skip 状態のまま緊急マージ |
| 16 | security 影響 PR (post-check `BLOCK`) | BLOCK 判定のまま緊急マージ |
| 18 | security mitigation の aux post-check skip / BLOCK | aux 系 (UX/UI auxiliary post-check) の skip / BLOCK のまま緊急マージ |

詳細な gate 番号 / 中断条件 / 復旧手順は `skills/op-merge/SKILL.md` の post-check gate 節を参照。

---

## has_valid_manual_override 判定 (canonical pseudocode)

op-merge は gate 12 / 13 / 15 / 16 / 17 / 18 で manual override 適用を判定する際、
以下の AND 条件をすべて満たした場合のみ override が valid と認める。
**いずれか 1 つでも欠けたら override は invalid となり、対応 gate は中断扱い**になる。

```text
has_valid_manual_override(target, expected_head_sha) -> bool
  1. PR に target に対応する manual-override label (`pro-ux-ui-audit-manual-override`
     または `pro-security-post-check-manual-override`) が付与されている
  2. PR コメントまたは PR body に `<!-- op-manual-override -->` block が存在する
  3. block の投稿者が trusted author (TRUSTED_REVIEW_AUTHORS) である
  4. block の `override_target` が target に対応する label 名と一致する
  5. `reason` が non-empty (緊急性の根拠を含む文言が望ましい。空文字 / "test" 等は無効)
  6. `approver` が non-empty (GitHub handle 形式)
  7. `approver` が trusted user / trusted role である (TRUSTED_REVIEW_AUTHORS にマッチ、または repo owner)
  8. `followup_issue` が `#<整数>` 形式で、リポジトリに実在する Issue を参照
  9. `overridden_at` が ISO8601 形式で non-empty
  10. `reviewed_head_sha` == expected_head_sha (= 現在の PR `headRefOid`、stale でない)
```

label 単独 / block 単独 / 古い head に対する block (override 後に push された) はすべて **invalid**。
op-merge は invalid override を検出した場合、対応 gate を中断扱いとし、停止理由を以下のように出力する:

- 「Manual override exists but is stale: reviewed_head_sha does not match current head_sha.」
- 「Manual override block missing required field: <field-name>.」
- 「Manual override block author is not trusted: <author>.」
- 「Manual override label present but no valid block found.」

### gate 名 (target) と既存 label の対応

| target (gate name) | 対応 manual-override label | 適用 gate |
|---|---|---|
| `ux-ui-post-check` | `pro-ux-ui-audit-manual-override` | gate 12, 13, 18 (aux UX/UI) |
| `security-post-check` | `pro-security-post-check-manual-override` | gate 15, 16, 17 |

`review-gate` (gates 1–5) と `merge-gate` (composite) には現状 manual override 経路は **存在しない**。
将来追加する場合も同じ has_valid_manual_override 規約に従う必要がある。

### stale 検出の具体例

| シナリオ | 結果 |
|---|---|
| override 投稿時の `reviewed_head_sha` が現在 head と一致 | valid (gate skip) |
| override 投稿後に PR head が更新された (push があった) | **stale**, invalid (gate skip 不可。再 override 要請) |
| override 対象 gate と現在失敗している gate が異なる | invalid (gate skip 不可) |

---

## validation rules

op-merge は本 block を読み取り、以下を必ず確認する:

| 確認項目 | 不通過時の動作 |
|---|---|
| 全 6 フィールドが揃っている | gate skip 不可 (中断扱い) |
| `override_target` が enum 内の値 | gate skip 不可 |
| `approver` が non-empty | gate skip 不可 |
| `reason` が non-empty かつ「緊急性の根拠を含む」(短すぎる文言は人間レビュアーが reject) | gate skip 不可 |
| `followup_issue` が `#<整数>` 形式で実在する Issue を参照 | gate skip 不可 |
| `overridden_at` が ISO8601 形式 | gate skip 不可 |
| `reviewed_head_sha` が non-empty かつ 40-hex 形式 | gate skip 不可 |
| `reviewed_head_sha` == 現在の `headRefOid` (stale でない) | gate skip 不可 (stale override / re-override 要請) |
| 1 PR に同 `override_target` の block が複数ある場合 | 最新の `overridden_at` を採用 (古いものは記録のみ) |

`reason` の品質判定 (緊急性の根拠を含むか) は op-merge では機械的に行わず、
**人間レビュアーが post-merge audit で確認**する。silent な常用化を防ぐため、
followup Issue で再 audit を予約することが構造的な歯止めとなる。

---

## 常用禁止と監査追跡

manual override は **緊急例外承認のみ** で運用する。常用厳禁。

### 構造的歯止め

- block の `followup_issue` を必須化することで、後続 audit / 是正の追跡が常に残る。
- ラベル単独では skip 不可とすることで、無記名 / 無理由の bypass を構造的に防ぐ。
- `overridden_at` で時系列を残すことで、「いつ・誰が・なぜ」を audit ログ化する。
- security override の `followup_issue` には **security-expert による再 post-check を
  必ず予約**することで、skip した security 案件が放置されないことを担保する。

### 監査の責務

人間レビュアー / op-merge 運用者は以下を定期的に監査する:

- `pro-*-manual-override` ラベルが付いた PR の `followup_issue` がすべてクローズされているか。
- `reason` が抽象的すぎる override が積み上がっていないか。
- 同じ `approver` から短期間に複数の override が出ていないか (常用化のシグナル)。

---

## 互換性 / Deprecated

現状なし。本ファイルは v1 として新設。`<!-- op-manual-override -->` block 自体は canonical 状態。

`pr-templates.md` 側に元々存在した「op-merge: manual override block」節は、本ファイルへの pointer に
降格する (重複定義を増やさないため)。bash gh / markdown のテンプレ記述は引き続き `pr-templates.md`
側を参照する。

---

## Lint Regression Examples

`op-tools/crates/op-core/tests/prose_examples.rs` が parse + lint clean を assert する canonical。
Rust struct schema 変更時に同期する (silent fork 防止、ADR-0003)。

`followup_issue` の値は YAML で `#` がコメント開始のため引用符で囲む必要がある。

<!-- op-manual-override -->
override_target: pro-ux-ui-audit-manual-override
approver: m-kaito
reason: Emergency deploy required for critical production outage fix
followup_issue: "#42"
overridden_at: 2026-05-09T10:00:00Z
reviewed_head_sha: 1234567890abcdef1234567890abcdef12345678

<!-- op-fallback-applied -->
source_expert: env-expert
normalized_to: debug-expert
source_context: issue-routing
source_id: null
reason: env-expert is a planned expert; routing to debug-expert
applied_at: 2026-05-09T10:00:00Z
controller: op-run
