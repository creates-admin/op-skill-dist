<!--
schema_version: 2
last_breaking_change: 2026-05-17
notes: v2 (2026-05-17) — `op-post-check-meta` 共通必須フィールドに `audit_result` を追加 (#110)。
       op-merge gate 13/16 が strict require している `audit_result` (UPPERCASE human-readable) と
       `post_check_result` (lowercase machine-readable canonical enum) の対応表を canonical schema
       として明文化。将来の post-check spawn で audit_result 書き漏れによる gate fail を構造的に防ぐ。
       v1 (2026-05-06) — Marker schema 分割 (followup #20) で `pr-templates.md` から
       post-check 共通 marker (`op-post-check-meta`) の detailed schema を切り出した正本ファイル。
       domain 固有 (ux-ui / security) の追加フィールドは別ファイル
       (`ux-ui-markers.md` / `security-markers.md`) に分離。
       marker 名 / owner / consumer / core meaning は引き続き `labels-and-markers.md` が正本。

機能概要:
  apply 後の domain-specific 再検証 (post-check) の共通 metadata block の field schema、
  enum 値、複数 post-check 共存ルール、stale 判定ルールを集約する。

作成意図:
  pr-templates.md が PR body テンプレと post-check schema を同時に抱えていたため、
  共通の post-check meta block を独立した正本に切り出す (Single Canonical Source Rule)。
  domain 固有フィールドは別ファイルに分離して、共通部分の schema を読みやすくする。

注意点:
  - marker 名 / core semantics は `labels-and-markers.md` の Post-check / Gate Markers 節が正本。
  - domain 固有フィールドは:
      - UX/UI の場合は `ux-ui-markers.md`
      - security の場合は `security-markers.md`
  - bash gh コマンドや PR comment 本文の具体例は `pr-templates.md` を参照する。
-->

# Post-check Markers — Detailed Schema

apply 後の domain-specific 再検証 (post-check) で使う **共通** metadata block の detailed schema 正本。

marker 名・所有者・consumer・基本 meaning・runtime spawn effect・merge blocking effect は
`skills/_shared/markers/labels-and-markers.md` の **Post-check / Gate Markers** 節が canonical。

domain 固有フィールド (UX/UI / security) は別ファイルに分離:

- UX/UI 系 post-check 詳細: `skills/_shared/markers/ux-ui-markers.md`
- Security 系 post-check 詳細: `skills/_shared/markers/security-markers.md`

PR comment / bash gh HEREDOC 形式の実テンプレートは `skills/_shared/pr-templates.md` の
「op-run: UX/UI Post-check Result」「op-run: Security Post-check Result」「op-run: post-check meta block」
節を参照する。

---

## 関連正本ファイル

| 概念 | 正本 |
|---|---|
| marker 名 / owner / consumer / 基本 meaning | `skills/_shared/markers/labels-and-markers.md` |
| UX/UI 固有フィールド (`blocking_count` / `notes_count` / observation 観点 / Applicable States / Design Plan gate) | `skills/_shared/markers/ux-ui-markers.md (>=2)` |
| Security 固有フィールド (`security_result` / `usable_security` / `aux_post_check_*`) | `skills/_shared/markers/security-markers.md` |
| op-merge gate 11〜18 (post-check 通過判定) | `skills/op-merge/SKILL.md` |
| post-check spawn の routing | `skills/_shared/runtime-contract.md` |
| PR comment テンプレ (bash gh HEREDOC) | `skills/_shared/pr-templates.md` |

---

## `<!-- op-post-check-meta -->` block schema (共通)

apply 後の post-check 結果に必ず添える共通 metadata block。UX/UI / security 等の domain 固有マーカー
(`<!-- op-ux-ui-audit -->` / `<!-- op-security-post-check -->`) と並べて出力し、その直後に同じ
コメント内で本 block を置く。

### 必須フィールド

```text
<!-- op-post-check-meta -->
audit_result: PASS | PASS_WITH_NOTES | BLOCK
post_check_expert: ux-ui-audit-expert | security-expert | <その他 active expert>
post_check_result: pass | pass_with_notes | block | needs_human_decision
post_checked_head_sha: <sha>
post_check_round: <integer>
```

| フィールド | 型 | 必須 | enum / 制約 |
|---|---|---|---|
| `audit_result` | enum | ✓ | `PASS` / `PASS_WITH_NOTES` / `BLOCK` の 3 値 (UPPER CASE, human-readable)。op-merge gate 13/16/18 が strict require。`post_check_result` と必ず整合させる (対応表参照) |
| `post_check_expert` | string | ✓ | post-check 担当 expert 名。**active expert のみ可**。planned expert (`env` / `compatibility` / `spec` / `release`) を直接書いてはならない (skip する場合は `op-planned-post-check-skipped` を使う) |
| `post_check_result` | enum | ✓ | `pass` / `pass_with_notes` / `block` / `needs_human_decision` の 4 値 (lowercase, machine-readable canonical enum) |
| `post_checked_head_sha` | string | ✓ | post-check 時点の PR head sha (40 桁 SHA-1)。op-merge は `current PR head == post_checked_head_sha` を要求 (stale 判定) |
| `post_check_round` | integer | ✓ | 1 origin の通算 post-check 試行数 |

### `post_check_result` enum semantics

| 値 | 意味 |
|---|---|
| `pass` | 元 finding 解消、別の問題なし。op-merge 通過候補 |
| `pass_with_notes` | 元 finding 解消、軽微な観察事項あり (PR comment に Notes として残す)。op-merge 通過候補 |
| `block` | 修正が不十分または別の問題が新規発生。apply 担当 expert に再 spawn が必要 |
| `needs_human_decision` | risk と usability のトレードオフ等で自動判断不能。`needs:human-decision` ラベル + Issue コメントで人間判断待ち |

### `audit_result` と `post_check_result` の役割分離

| フィールド | 表記 | 役割 | 使用者 |
|---|---|---|---|
| `audit_result` | UPPER CASE | human-readable 判定文言。op-merge gate が `PASS` / `PASS_WITH_NOTES` / `BLOCK` を直接 grep する | op-merge gate 13/16/18、人間が読む PR comment |
| `post_check_result` | lower_case | machine-readable canonical enum (4 値)。routing / label 付与の決定論的 key | op-run routing、op-merge gate 13a/16a、op-patrol ledger |

`audit_result` は **共通必須フィールド** であり、domain 固有マーカー (`<!-- op-ux-ui-audit -->` /
`<!-- op-security-post-check -->`) の有無に関わらず `<!-- op-post-check-meta -->` block に必ず出力する。
**`audit_result` の canonical schema 正本は本ファイル (post-check-markers.md, schema_version>=2) のみ**。
domain 固有ファイル (`ux-ui-markers.md (>=2)` / `security-markers.md`) は domain 固有フィールドのみを
canonical 管理し、`audit_result` については本ファイルへの pointer を持つ (Single Canonical Source Rule)。

### `audit_result` ↔ `post_check_result` 許容対応表 (canonical)

op-merge gate 13d (UX) / 16b (security) が矛盾 marker として拒否する組み合わせを含めた完全対応表。

| `audit_result` (UPPER) | `post_check_result` (lower) | op-merge 判定 | 備考 |
|---|---|---|---|
| `PASS` | `pass` | 通過 | 正常 |
| `PASS_WITH_NOTES` | `pass_with_notes` | 通過 | 正常 |
| `BLOCK` | `block` | 中断 | 正常 |
| `BLOCK` | `needs_human_decision` | 中断 | security のみ許可。`audit_result` は `BLOCK` で固定し、判定本文に human decision 要素を記載 |
| `PASS` | `block` | **矛盾 → forge 扱い・中断** | gate 13d / 16b が拒否 |
| `PASS` | `needs_human_decision` | **矛盾 → forge 扱い・中断** | gate 13d / 16b が拒否 |
| `PASS_WITH_NOTES` | `block` | **矛盾 → forge 扱い・中断** | gate 13d / 16b が拒否 |
| `PASS_WITH_NOTES` | `needs_human_decision` | **矛盾 → forge 扱い・中断** | gate 13d / 16b が拒否 |
| `BLOCK` | `pass` | **矛盾 → forge 扱い・中断** | gate 13d / 16b が拒否 |
| `BLOCK` | `pass_with_notes` | **矛盾 → forge 扱い・中断** | gate 13d / 16b が拒否 |

UX/UI post-check では `needs_human_decision` は通常使わない (security domain 専用の result)。
UX/UI では `audit_result: BLOCK` + `post_check_result: block` を使用する。

矛盾 marker 検出の実装詳細は `skills/op-merge/SKILL.md` gate 13d / 16b 節を参照。

---

## 複数 post-check が同 PR にぶら下がる場合のルール

UX/UI / security の両方が要求される PR (例: security mitigation で UI 影響あり) や、
auxiliary post-check (security → ux-ui-audit) が走るケースでは、**1 expert ごとに 1 block** を持たせる。

```text
# UX/UI post-check
<!-- op-ux-ui-audit -->
<!-- op-post-check-meta -->
audit_result: PASS
post_check_expert: ux-ui-audit-expert
post_check_result: pass
post_checked_head_sha: <sha-1>
post_check_round: 1
... (UX/UI 固有フィールド: ux-ui-markers.md 参照)

# Security post-check
<!-- op-security-post-check -->
<!-- op-post-check-meta -->
audit_result: PASS
post_check_expert: security-expert
post_check_result: pass
post_checked_head_sha: <sha-1>
post_check_round: 1
... (security 固有フィールド: security-markers.md 参照)
```

block を分けることで:

- expert 単位の `post_check_round` を独立に進行できる。
- op-merge gate が expert 単位で stale 判定できる (一方だけ stale でも他方の通過は保持)。
- domain 固有フィールドが混ざらず、parse が容易。

---

## op-merge gate ルール (gate 11〜18)

op-merge は **すべての required post-check が current head sha に対して `pass` または
`pass_with_notes`** のときだけマージを許可する。判定の概要:

| 状態 | op-merge の動作 |
|---|---|
| `post_check_result == pass` または `pass_with_notes` かつ `post_checked_head_sha == current head` | gate 通過 |
| `post_check_result == block` | merge 不可 (apply 担当 expert 再 spawn / 例外時は manual override) |
| `post_check_result == needs_human_decision` | merge 不可 (人間判断待ち) |
| `post_checked_head_sha != current head` | stale。再 post-check 必要 (`pro-*-stale` 系ラベル付与) |
| post-check コメント自体が不在 | UX/UI / security 影響 PR では merge 不可 (manual override が無ければ skip 不可) |

各 domain ごとの gate 番号と blocking ラベルは `skills/op-merge/SKILL.md` の post-check gate 節を参照。

---

## stale 判定の SHA 比較ルール

op-merge は post-check コメント内の `post_checked_head_sha` と現在 PR head sha を **完全一致** で比較する。

- 完全一致 → fresh (current head の post-check 結果が有効)
- 不一致 → stale (再 post-check 必要)

review-expert の `reviewed_head_sha` と同じ仕組みで、apply commit が後から積まれた場合の
「合意なきマージ」を構造的に防ぐ。

---

## planned expert post-check skip との関係

post-check 担当が planned expert (`env-expert` / `compatibility-expert`) で spawn できない場合、
または op-run routing 対象外の Utility Worker (`spec-expert`: post-check capability なし) が解決された場合は、
本 block を出さず `<!-- op-planned-post-check-skipped -->` marker を代わりに残す
(詳細は `labels-and-markers.md` の同 marker 節)。

- `op-planned-post-check-skipped` 単体では merge-blocking ではないが、
- 他 gate (security / ux-ui / review) と組み合わせて op-merge は判定する。

`release-expert` は **fallback destination としても使用禁止**。`recommended_fix_expert: release-expert`
や `op-post-check-expert: release-expert` は spawn 前に `debug` / `refactor` / `needs_human_decision`
に再分類する (詳細は `skills/_shared/expert-spawn.md` および `skills/_shared/runtime-contract.md`)。

---

## 互換性 / Deprecated

- v1 → v2 breaking change: `audit_result` が任意 (domain 固有のみ) から共通必須フィールドに昇格。
  過去の merged PR post-check コメントへの遡及適用は不可 (不可逆)。
  将来の post-check 投稿に対する規約変更として適用 (#110)。
- 既存 `op-post-check-meta` block で `audit_result` を省略しているものは、次の post-check 時に
  必ず `audit_result` を追加して再投稿 (または `post_check_round` を +1 して再発行) すること。

---

## Lint Regression Examples

`op-tools/crates/op-core/tests/prose_examples.rs` が parse + lint clean を assert する canonical。
Rust struct schema 変更時に同期する (silent fork 防止、ADR-0003)。

<!-- op-post-check-meta -->
audit_result: PASS
post_check_expert: security-expert
post_check_result: pass
post_checked_head_sha: 1234567890abcdef1234567890abcdef12345678
post_check_round: 1

<!-- op-run-controller-meta -->
base_ref: main
base_sha: 1234567890abcdef1234567890abcdef12345678
