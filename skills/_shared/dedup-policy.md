# fingerprint 生成 + 重複除外 policy (op-scan / op-patrol 共通)

**不変則: fingerprint は手書きしない。必ず op CLI で生成する。**
正規化アルゴリズムの正本は `op-tools/crates/op-core/src/fingerprint.rs` / `dedup.rs` (CLI 実装)。
fingerprint は Issue 本文の hidden marker として永続化されるため、仕様を変えると過去 Issue と照合できなくなる。

| 用途 | 生成コマンド |
|---|---|
| 通常 finding (4-seg) | `op core fingerprint --domain <d> --title <t> --file <files[0]> [--symbol <symbols[0]>] --plain` |
| bulk Issue (3-seg) | `op core fingerprint-bulk --domain <d> --bulk-group <g> --primary-dir <LCA> --plain` |
| architecture_debt 追跡キー | `op core fingerprint-bulk --domain refactor --bulk-group <g> --primary-dir <affected_paths の LCA> --plain` |
| 既存 Issue との重複判定 | `op scan dedup --findings-json <f>` (Cloud では `--input-json` で既存 Issue 素材を注入) |

---

## fingerprint 生成仕様

```text
fingerprint = "<domain>:<normalized_title>:<primary_file>:<symbol>"
```

- `normalized_title`: title を CLI が正規化 (小文字化・空白圧縮・句読点/助詞除去・30 char 切り詰め・空白→`-`)
- `primary_file`: `files[0]` から末尾 `:LINE` を除いたパス
- `symbol`: `symbols[0]`。空なら末尾 segment は空 (`security:foo:bar:`、3-seg ではない)
- 別表記 (`<domain>:<short-id>:...` 等) は誤り

例: `security:path-traversal-in-export:src-tauri/src/commands/export.rs:export_report`

---

## バッチ Issue 用 fingerprint (3-seg 形式)

`bulk_group` ごとに finding をまとめて起票する bulk Issue (1 Issue = N 個の同種問題) は 3-seg を使う。通常 finding は 4-seg。

```text
fingerprint = "<domain>:<bulk_group>:<primary_dir>"
```

- `bulk_group`: finding 側の値そのまま (正規化しない)
- `primary_dir`: affected_paths の最小共通祖先 (LCA) ディレクトリ (末尾 `/` のみ trim)

例: `refactor:refactor-scattered-tokens:src/features/report`
起票テンプレは `pr-templates.md`「op-scan: バッチ Issue 起票テンプレ」節。

---

## fingerprint 生成責務マトリクス (誰が採番するか)

生成主体を取り違えると同一 finding に 2 つの fingerprint が付き dedup が外れる。

| 経路 | 生成主体 |
|---|---|
| op-scan の scan finding | controller (op-scan フェーズ2-2)。expert は生成しない |
| op-patrol の scan finding | controller (op-patrol フェーズ5)。expert は生成しない |
| op-report (scout) の起票 | scout agent |
| review finding / post-check finding | agent (review-expert / post-check expert) |
| architecture_debt 追跡キー (`op-fingerprint-bulk`) | controller (op-scan / op-patrol)。refactor-expert は `bulk_group` / `affected_paths` を埋めるだけ |
| op-plan / op-architect の起票前 dedup | controller |

---

## 既存 Issue との重複除外

対象は `auto-report` ラベルの open Issue (op-scan / op-patrol 両方)。`op scan dedup` が判定する。

### 判定優先順位 (上から評価し、最初に一致したものでスキップ確定)

1. **fingerprint 完全一致** (本文 `<!-- op-fingerprint: ... -->` を比較)
2. `primary_file` + `symbol` 一致 (両者非空)
3. `primary_file` + 行範囲 ±5 (両者に line がある場合のみ)
4. title 類似 (下記)

スキップした検出は op-scan / op-patrol の完了報告に「既存 Issue #N と重複」として記載する。

#### priority 4 の title 類似度算法 (固定)

双方の title を normalize_title した後の Levenshtein 距離 ≤ 3 で類似と判定する。

---

## architecture_debt 追跡キー (`op-fingerprint-bulk`)

refactor の debt 系 finding (`finding_type` ∈ `architecture_debt` / `staged_refactor` / `needs_spec_decision`) は
title の微調整で 4-seg fingerprint がブレやすいため、`op-fingerprint` に加えて 3-seg の `op-fingerprint-bulk` を Issue 本文に埋める。

```bash
op core fingerprint-bulk --domain refactor --bulk-group <bulk_group> --primary-dir <affected_paths の LCA> --plain
```

```markdown
<!-- op-fingerprint: refactor:report-output-paths-scattered:src/features/report/export.ts:exportReport -->
<!-- op-fingerprint-bulk: refactor:refactor-scattered-tokens:src/features/report -->
```

### architecture_debt 既存 Issue 検索の優先順位

1. `op-fingerprint-bulk` 完全一致
2. `op-fingerprint` 完全一致
3. affected_paths 類似 + bulk_group 一致 + symbols 類似 (タイブレーカ)

最初に一致したものを同一 debt とし、`seen_count` / `last_seen_at` / `risk_trend` / `affected_paths` を更新する (重複起票しない)。
手順は op-patrol skill「architecture_debt の追跡方式」節。

---

## 既知の限界

fingerprint はファイル / 関数 rename ですり抜ける (false negative)。許容済みの弱みで、
同じバグの反復起票は patrol_score の `incident_score` 異常で察知する。
