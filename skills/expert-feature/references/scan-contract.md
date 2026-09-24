# expert-feature scan 出力契約

canonical 必須フィールドは `~/.claude/skills/_shared/expert-spawn.md`「scan 出力契約 (canonical schema)」節。本ファイルは feature 固有の強化分。
severity / confidence / needs_human_decision の判定基準は SKILL.md。

## §0. scan 検出対象と報告ルール

検出対象:

- silent fork / implementation gap catalog 7 カテゴリ (critical / high のもの)
- 仕様書 / 型定義 / コメントと実装の乖離
- 本番影響レベルの死蔵 TODO / FIXME

報告ルールの共通骨格は `~/.claude/skills/_shared/severity-rubric.md`「scan 報告ルール (共通)」節。React / Go 由来の検出は報告しない。

## §1. envelope の詳細

envelope は `expert-spawn.md`「scan 出力 envelope 契約」節。`investigation_candidates` / `ignored_noise` は既定では出力しない (`candidate_report: true` 時のみ代替 envelope に載せる)。

medium / low は通常出力しない。以下の場合のみ candidate として内部保持する: patrol_sample で同一 bulk_group が複数見つかった / High 昇格根拠が揃いそう / `candidate_report: true`。それ以外は `ignored_noise`。

## §2. recommendation の構造化フォーマット

`recommendation` は apply がそのまま実装テンプレとして使える具体性を持たせる:

```markdown
## 実装計画

### 対象
- ファイル / 関数: `path/to/file.ext::funcName`
- 現状: <1 行>
- 検出種別: <issue_type>

### 手本にする既存実装
- ファイル: `path/to/template.ext:LINE`
- 抽出する要素: ファイル構成 / 命名規則 / error 処理形式 / 状態管理パターン

### 再利用する既存資産
| # | 種別 | 場所 | 用途 |
|---|------|------|------|
| 1 | wrapper | `src/api/index.ts::invoke` | Tauri 呼び出し |

### 実装するもの
| # | レイヤー | 追加 / 変更内容 | 期待動作 |
|---|---------|---------------|---------|
| 1 | 型 | `src/types/foo.ts` に `Foo` 型追加 | ... |

### 必要な前提・依存
- 既存の <fixture / component / module> を再利用。新規は作る場合のみ最小限

### 推定規模
- 追加 LoC / 追加ファイル数 / 副作用

### 受入条件
- <条件>

### 検証
- Level 1 / 2 / 3 (IPC・依存変更時のみ) のコマンド
- happy path test 1〜2 本 (異常系は test-expert へ委譲)
```

## §3. 強化スキーマ

- `hypothesis` / `excluded_hypotheses` は「なぜ pattern deviation であり意図的な省略ではないか」を否定材料つきで書く
- `asset_map` を埋められない finding は返さない

```json
{
  "title": "<画面/機能>の<欠落 state>が欠けている",
  "severity": "high",
  "domain": "feature",
  "files": ["<path>:<line>"],
  "confidence": "high",
  "issue_type": "missing_error_path",
  "action": "complete_missing_state",
  "evidence_grade": "direct",
  "evidence_sources": ["grep", "source_read"],
  "asset_map": {
    "template_files": ["<手本ファイル>:<line>"],
    "reusable_assets": [{ "kind": "<component|composable|...>", "path": "<path>", "purpose": "<用途>" }],
    "extracted_pattern": "<抽出したパターンの 1 行要約>"
  },
  "needs_human_decision": { "required": false },
  "recommendation": "<§2 の実装計画>",
  "bulk_group": "feature-missing-error-path",
  "recommended_runner": "feature-expert",
  "post_check_expert": "ux-ui-audit-expert",
  "blocking": false,
  "blocking_reason": null
}
```

上記以外の canonical 必須フィールド (`severity_reason` / `symbols` / `summary` / `evidence` / `hypothesis` / `excluded_hypotheses` /
`risk_if_ignored` / `risk_if_changed` / `protected_behavior` / `scope_in` / `scope_out` / `verification_steps` / `success_criteria` / `gotchas`) もすべて埋める。

## §4. スキーマフィールド要点 (feature 固有)

| フィールド | 役割 |
|---|---|
| `confidence` | 根拠の強さ (high / medium / low)。severity と独立 |
| `issue_type` | `duplicate_helper` / `bypass_wrapper` / `adhoc_error_type` / `pattern_deviation` / `missing_error_path` / `stale_todo` / `spec_divergence` |
| `action` | `replace_with_existing_asset` / `align_to_pattern` / `complete_missing_state` / `add_implementation` / `needs_human_decision` |
| `evidence_sources` | `grep` / `source_read` / `git_log` / `git_blame` / `gh_search` の組合せ |
| `asset_map` | 手本ファイル / 再利用資産 / 抽出パターン (silent fork 防止の証拠) |
| `protected_behavior` | この実装が守る振る舞い |
| `post_check_expert` | UI ファイルを触るなら `ux-ui-audit-expert`、それ以外は `null` |
| `blocking` / `blocking_reason` | 新規変更が既存 debt を悪化させる場合 `true` + 理由 1 行。false なら reason は `null` |

bulk_group / issue_type / action の対応は `silent-fork-patterns.md`「catalog 索引 + enum 対応表」。

## §5. patrol 経由の追加制約 (op-patrol から呼ばれた時)

area 選定をやり直さない。patrol が選んだ area と巡回理由を尊重し、feature 専門の read-only audit に限定する。

入力: `area` / `patrol_reason` / `scope_in` / `scope_out` / `suspicion` (issue_type と同じ enum) / `run_id`

- Level 0 固定・Critical / High のみ (`severity-rubric.md`「scan 報告ルール (共通)」、patrol audit 前に Read)
- 命名整理・好みのリファクタは Critical / High でも返さない
- 実行しないと確定できないものは `evidence_grade: requires_runtime` + `reproduction_hint` で返す (`--auto` 起票対象外)

| severity | patrol で起票してよい指摘 |
|---|---|
| Critical | data loss / security に直結する silent fork / Critical 機能の主要 error path 欠如 |
| High | 既存資産無視の重複実装 / 主要 loading・empty state 欠如で UX 破綻 / Critical 機能の spec divergence / 本番影響レベルの死蔵 TODO |

patrol で返さないもの: 命名が微妙・構造を綺麗にできる / Medium 以下の pattern deviation / 書き方の好み。
