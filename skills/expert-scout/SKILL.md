---
name: expert-scout
description: scout に preload される方法論。実在確認 gate・起票 draft (本文ファイル) の作成・返却スキーマ。
---

# expert-scout: scout agent の知識ベース

op-report controller から渡された単一 finding を実在確認し、`confirmed` なら起票 draft (dedup 入力 + 本文ファイル) を作って返す手順。
fingerprint 生成・重複チェック・起票は controller が行う。

## 1. 実在確認 gate

静的根拠 (Read / Grep / Glob) のみで次のいずれかに判定する。

| 値 | 条件 | 動作 |
|---|---|---|
| `confirmed` | finding が実在すると静的に確認できた (`evidence_grade` は `direct` か根拠が複数ある `inferred`) | 2 章の手順で draft を作る |
| `not_confirmed` | 根拠が見当たらない / 実行時にしか確認できない (`requires_runtime`) / 状況証拠が 1 本のみ / 「可能性がある」レベル | draft を作らず返却 |
| `needs_human_decision` | 既存パターンが複数で基準が定まらない / deprecated 資産が絡み可否不明 / 設計意図が静的に復元できない / 解釈が複数ある | draft を作らず返却。`options` / `recommended_option` / `safest_default` を含める |

severity は判定に使わない (ラベルと本文の記述にのみ使う。判定基準は `~/.claude/skills/_shared/severity-rubric.md`)。

## 2. draft 作成 (`confirmed` のときのみ)

1. dedup 入力を決める: `domain` / `title` / `files` / `symbols` (形は `~/.claude/skills/_shared/dedup-policy.md`)。
   `files[0]` が primary file になる。
2. 本文組立: `~/.claude/skills/_shared/pr-templates.md`「Issue 本文 (指示書フル版)」。marker は同ファイル「Issue 本文 hidden marker」、
   `op-run-expert` / `op-post-check-expert` の値とラベルは「domain → marker / ラベル表」で決める。
   `op-fingerprint` marker は書かない (controller が生成して差し込む)。
   severity ラベル (`severity:<critical|high>`) は severity が Critical / High のときだけ付ける。
3. 本文を spawn prompt の `body_file` (絶対パス) に Write する。
4. 返却の `draft` に dedup 入力・ラベル・`body_file` を入れる。

## 3. 返却スキーマ (JSON)

controller への要約テキストは 1 行。詳細は JSON に入れる。

```json
{
  "result": "confirmed | not_confirmed | needs_human_decision",
  "finding_summary": "finding の 1〜2 文要約",
  "evidence": "静的根拠 (ファイル:行 + 観測内容)、または根拠が得られなかった旨",
  "evidence_grade": "direct | inferred | requires_runtime",
  "draft": {
    "domain": "debug",
    "title": "Issue タイトル",
    "files": ["path/to/file.ext:LINE"],
    "symbols": ["symbol"],
    "labels": ["auto-report", "pro-debug-expert"],
    "body_file": "/abs/path/task-1.md"
  },
  "needs_human_decision": { "required": true, "...": "schema は invocation-mode.md" },
  "assumptions": ["確認できなかった項目の推定"]
}
```

| フィールド | 必須条件 |
|---|---|
| `result` | 常時 |
| `draft` | `confirmed` 時 (`symbols` は無ければ空配列) |
| `evidence` / `evidence_grade` | `not_confirmed` 時必須、それ以外も推奨 (`confirmed` 時は本文にも転記) |
| `needs_human_decision` | `needs_human_decision` 時 (正規スキーマは `~/.claude/skills/_shared/invocation-mode.md`) |
| `assumptions` | 推定がある時 |
