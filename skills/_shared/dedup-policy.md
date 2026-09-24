# fingerprint 生成 + 重複除外 policy (op-scan / op-patrol 共通)

不変則: fingerprint は手書きしない。op CLI で生成する (正規化は CLI が行う)。

| 用途 | 生成コマンド |
|---|---|
| 通常 finding (4-seg) | `op core fingerprint --domain <d> --title <t> --file <files[0]> [--symbol <symbols[0]>] --plain` |
| bulk Issue (3-seg) | `op core fingerprint-bulk --domain <d> --bulk-group <g> --primary-dir <LCA> --plain` |
| architecture_debt 追跡キー | `op core fingerprint-bulk --domain refactor --bulk-group <g> --primary-dir <affected_paths の LCA> --plain` |
| 既存 Issue との重複判定 | `op scan dedup --findings-json <f>` (Cloud では `--input-json` で既存 Issue 素材を注入) |

通常 finding の形式は `<domain>:<normalized_title>:<primary_file>:<symbol>` (symbol が空でも 4 segment)。

## バッチ Issue 用 fingerprint (3-seg 形式)

`bulk_group` ごとに finding をまとめて起票する bulk Issue (1 Issue = N 個の同種問題) は 3-seg
`<domain>:<bulk_group>:<primary_dir>` を使う。`--primary-dir` には affected_paths の最小共通祖先 (LCA) ディレクトリを
controller が計算して渡す。起票テンプレは `pr-templates.md`「op-scan: バッチ Issue 起票テンプレ」節。

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

## 既存 Issue との重複除外

対象は `auto-report` ラベルの open Issue (op-scan / op-patrol 両方)。`op scan dedup` が
fingerprint 完全一致 → file+symbol → file+行 ±5 → title 類似 の順で判定する。
スキップした検出は op-scan / op-patrol の完了報告に「既存 Issue #N と重複」として記載する。

## architecture_debt 追跡キー (`op-fingerprint-bulk`)

refactor の debt 系 finding (`finding_type` ∈ `architecture_debt` / `staged_refactor` / `needs_spec_decision`) は
title の微調整で 4-seg fingerprint がブレやすいため、`op-fingerprint` に加えて 3-seg の `op-fingerprint-bulk` を Issue 本文に埋める。

```markdown
<!-- op-fingerprint: refactor:report-output-paths-scattered:src/features/report/export.ts:exportReport -->
<!-- op-fingerprint-bulk: refactor:refactor-scattered-tokens:src/features/report -->
```

既存 debt Issue の検索と更新 (`seen_count` / `last_seen_at` / `risk_trend` / `affected_paths`) は op-patrol skill「architecture_debt の追跡方式」節。

## 既知の限界

fingerprint はファイル / 関数 rename ですり抜ける (false negative)。許容済みの弱みとする。
