# expert-feature scan 出力契約

canonical 必須フィールドは `~/.claude/skills/_shared/expert-report-schemas.md`「scan 出力契約 (canonical schema)」節。本ファイルは feature 固有の強化分。
severity / confidence / needs_human_decision の判定基準は §6。

## §1. 検出対象

silent fork / implementation gap catalog 7 カテゴリ、仕様書 / 型定義 / コメントと実装の乖離、本番影響レベルの死蔵 TODO / FIXME のうち Critical / High。

- `domain: "feature"` / `recommended_runner: "feature-expert"` / `post_check_expert`: UI ファイルを触るなら `ux-ui-audit-expert`、それ以外は `null`
- `evidence_grade` が `direct` 以外なら Critical にしない
- `asset_map.template_files` / `reusable_assets` / `extracted_pattern` を埋められない finding は返さない

## §2. recommendation の構造化フォーマット

`recommendation.steps` は `expert-report-schemas.md`「実装計画の埋め込み (additive 検出)」の実装計画に、feature 固有の次の 2 つを加える:

- 手本にする既存実装: `path/to/template.ext:LINE` と抽出する要素 (ファイル構成 / 命名規則 / error 処理形式 / 状態管理パターン)
- 再利用する既存資産: 種別 / 場所 / 用途 の一覧

検証には Level 1 / 2 / 3 (IPC・依存変更時のみ) のコマンドと happy path test 1〜2 本を書く (異常系は委譲)。

## §3. 強化スキーマ

- `hypothesis` / `excluded_hypotheses` は「なぜ pattern deviation であり意図的な省略ではないか」を否定材料つきで書く
- `asset_map` は `{ "template_files": ["<path>:<line>"], "reusable_assets": [{ "kind", "path", "purpose" }], "extracted_pattern": "<1 行要約>" }`

## §4. スキーマフィールド要点 (feature 固有)

| フィールド | 役割 |
|---|---|
| `confidence` | 根拠の強さ (high / medium)。severity と独立 |
| `issue_type` / `action` | 値と bulk_group との対応は `silent-fork-patterns.md`「catalog 索引 + enum 対応表」 |
| `evidence_sources` | `grep` / `source_read` / `git_log` / `git_blame` / `gh_search` の組合せ |
| `asset_map` | 手本ファイル / 再利用資産 / 抽出パターン (silent fork 防止の証拠) |
| `protected_behavior` | この実装が守る振る舞い |
| `blocking` / `blocking_reason` | 新規変更が既存 debt を悪化させる場合 `true` + 理由 1 行。false なら reason は `null` |

## §5. patrol 経由の追加制約 (op-patrol から呼ばれた時)

入力は 区画 (area) / 前回巡回 / 巡回理由 / run_id / today。area 選定をやり直さず、feature 専門の read-only audit に限定する。

- 命名整理・好みのリファクタは Critical / High でも返さない
- 実行しないと確定できないものは `evidence_grade: requires_runtime` + `reproduction_hint` で返す

## §6. severity / confidence の判定

severity (危険度) と confidence (確信度) は独立に付ける。報告ルールは `~/.claude/skills/_shared/severity-rubric.md`「scan 報告ルール (共通)」節。

### severity

- critical: data loss / security に直結する silent fork (既存 sanitization wrapper bypass で injection 経路露出等) /
  Critical 機能の主要 error path 欠如で運用上致命的 / spec divergence で型契約が壊れている
- high: 既存資産無視の重複実装 (保守コスト増が確定的) / 主要 loading・empty state 欠如で UX が致命的に破綻 /
  Critical 機能の error path / 本番影響レベルの死蔵 TODO
- 報告しない: 軽微な pattern deviation・命名揺れ・構成順の差・スタイル

### confidence

- high: source_read + Grep + git log の複数根拠が一致し、既存資産の存在と bypass が確定
- medium: Grep + Read で妥当だが、既存資産を使うべきか optional かが未確認
- low: Grep のみ、または既存パターンが揺らいで手本が定まらない (finding にしない)

### needs_human_decision.required: true にするケース (severity に関係なく)

- 既存パターンが複数あり手本が定まらない
- 既存資産が deprecated 中で再利用すべきか不明
- 設計意図が grep / blame で復元できない古い孤立実装
- 仕様書 vs 実装の乖離で「どちらが正」か判定不能

`severity: high, confidence: medium, needs_human_decision.required: true` は正常な状態。
