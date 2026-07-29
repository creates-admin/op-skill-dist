# expert-feature scan 出力契約 (完全形)

<!--
機能概要: feature-expert が scan / patrol モードで finding を返すときの出力契約の完全形。
         検出対象と報告ルール / envelope の詳細 (candidate_report / medium-low 内部保持) /
         recommendation の構造化フォーマット / 強化スキーマの JSON skeleton /
         スキーマフィールド要点表 / op-patrol 経由の追加制約 を集約する。
作成意図: SKILL.md 本文は「references を 1 行も読まなくても事故らない層」に絞る (ADR-0030 決定1)。
         schema 全文と patrol 固有の運用制約は「読む必要が mode で決まる層」なので本ファイルへ分離した。
         SKILL.md 側には envelope の骨子・必須フィールド名・誘導文だけが残る。
注意点: agent は必要時のみ Read。ただし **scan / patrol で finding を 1 件でも返すなら本ファイルは必読**。
       canonical 必須フィールドの正本は `~/.claude/skills/_shared/expert-spawn.md` (>=1) の
       「scan 出力契約 (canonical schema)」節であり、本ファイルはその feature-expert 固有の強化分を定義する。
       severity / confidence / needs_human_decision の判定基準は SKILL.md 側が正本 (ここでは再掲しない)。
-->

> **用語注記**: `needs_human_decision` の旧名 `needs_human_judgment` は deprecated alias
> (読み取り互換のみ、新規記述では使わない)。詳細は SKILL.md 冒頭の用語注記。

---

## §0. scan 検出対象と報告ルール

### 検出対象

- SKILL.md の silent fork / implementation gap catalog 7 カテゴリ (severity が critical / high のもの)
- 仕様書 / 型定義 / コメントと実装の乖離
- 死蔵 TODO / FIXME (本番影響レベルのみ)

### 報告ルール

報告ルールの共通骨格 (Critical / High only / 静的証拠必須 / 可能性表現の原則禁止 / 0 件表現 /
無効スタックの ignored_noise 扱い / 規約準拠は指摘しない) は
`_shared/severity-rubric.md`「scan 報告ルール (共通)」節が正本 — **本ファイルを読む時点で未読なら Read する**。

feature-expert 固有の差分のみ:

- `severity` / `confidence` の付け方は SKILL.md「severity / confidence の判定」節に従う
  (両方とも必須フィールド、ここでは再掲しない)。`needs_human_decision` の判定も同節に従う
- 本 repo の disabled stack (React / Go) 由来の検出は報告しない

出力契約は `_shared/expert-spawn.md` の **scan 共通スキーマ** + 本ファイル §3 の強化スキーマに従う。

---

## §1. envelope の詳細 (default / candidate_report / medium-low)

envelope の形状そのもの (既定 `{"findings": [ <scan-finding>, ... ]}` / 0 件は `{"findings": []}` /
JSON-only の禁止行 / `candidate_report: true` 時の 3 分類 object) の正本は
`_shared/expert-spawn.md`「scan 出力 envelope 契約」節 — **JSON を組み立てる前に Read する**。

feature-expert 固有の差分のみ:

- `investigation_candidates` / `ignored_noise` は既定では **内部分類のみ**で出力しない
  (`candidate_report: true` が明示された場合の代替 envelope に載せる)
- medium / low の扱いは下記の内部保持条件に従う

### medium / low の扱い

通常 scan 出力には出さない。ただし以下の場合のみ candidate として **内部保持**する:

- patrol_sample 由来で同一 bulk_group が複数見つかった
- High 昇格根拠が揃いそう
- `candidate_report: true` が明示された

これら以外は `ignored_noise` に分類し、JSON には出力しない。

---

## §2. recommendation の構造化フォーマット (additive 検出 Issue 用)

silent fork / implementation gap 検出は「ここに穴がある」だけでなく、
**apply が即実装できる具体計画** を `recommendation` に詰める。
これで context 喪失問題を構造的に防ぐ (scan の判断が apply に完全継承)。

```markdown
## 実装計画

### 対象
- ファイル / 関数: `path/to/file.ext::funcName`
- 現状: <現状を 1 行で>
- 検出種別: <duplicate_helper / bypass_wrapper / adhoc_error_type / pattern_deviation / missing_error_path / stale_todo / spec_divergence (enum 対応表に従う)>

### 手本にする既存実装
- ファイル: `path/to/template.ext:LINE`
- 抽出する要素:
  - ファイル構成: <...>
  - 命名規則: <...>
  - error 処理形式: <...>
  - 状態管理パターン: <...>

### 再利用する既存資産
| # | 種別 | 場所 | 用途 |
|---|------|------|------|
| 1 | crate | `src/utils/sanitize.rs::sanitize_html` | XSS 防止 |
| 2 | wrapper | `src/api/index.ts::invoke` | Tauri 呼び出し |
| 3 | type alias | `src/types/result.ts::AppResult` | error 統一 |

### 実装するもの
| # | レイヤー | 追加 / 変更内容 | 期待動作 |
|---|---------|---------------|---------|
| 1 | 型 | `src/types/foo.ts` に `Foo` 型追加 | ... |
| 2 | API | `src-tauri/src/commands/foo.rs` 追加 | ... |
| 3 | wrapper | `src/api/foo.ts` 追加 | ... |
| 4 | UI | `src/pages/foo/FooList.vue` 追加 | ... |

### 必要な前提・依存
- 既存の <fixture / コンポーネント / モジュール> を再利用
- 新規 <作る場合のみ列挙、最小限>

### 推定規模
- 追加 LoC: 約 N 行
- 追加ファイル: N 個
- 副作用: <なし or 列挙>

### 受入条件
- <条件 1>
- <条件 2>

### 検証
- Level 1: <lint / type コマンド>
- Level 2: <unit test コマンド>
- Level 3: <build コマンド、IPC / 依存変更時のみ>
- happy path test: 1〜2 本追加 (異常系は test-expert に Issue 起票で委譲)
```

---

## §3. 強化スキーマ (feature-expert 共通)

検出系・追加系・補完系すべてで共通して使う schema。canonical 必須フィールドの正本は
`_shared/expert-spawn.md`。apply agent が迷わず処理できるよう、feature-expert は追加で
**severity / confidence / action / asset_map** を必須とする (各フィールドの意味は §4
「スキーマフィールド要点」の表を参照)。

> **3 表現は意図的な多重**: §2 の「実装計画」テンプレ = `recommendation` 本文の中身、下の骨格スケルトン =
> finding object 全体の形、§4 の表 = 各フィールドの意味。役割が異なるので互いの重複ではない。

判断上の要点 (削っても失わないための補足):

- `asset_map.template_files` / `reusable_assets` / `extracted_pattern` を埋められない場合、
  silent fork 防止の最低充足条件を満たしていない = 実装に入らない
- `hypothesis` / `excluded_hypotheses` は「なぜこの検出が pattern deviation であり、意図的な省略ではないか」を
  否定材料つきで書く (単なる推測の断定は禁止)
- `recommendation` は apply がそのまま実装テンプレとして使えるだけの具体性 (手本ファイル・再利用資産・実装するもの・検証コマンド) を持たせる

骨格スケルトン (値はプレースホルダ、具体スタック非依存):

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
    "extracted_pattern": "<抽出したパターンの1行要約>"
  },
  "needs_human_decision": { "required": false },
  "recommendation": "<実装計画テンプレ (§2 のフォーマット参照)>",
  "bulk_group": "feature-missing-error-path",
  "recommended_runner": "feature-expert",
  "post_check_expert": "ux-ui-audit-expert",
  "blocking": false,
  "blocking_reason": null
}
```

上記以外の canonical 必須フィールド (`severity_reason` / `symbols` / `summary` / `evidence` /
`hypothesis` / `excluded_hypotheses` / `risk_if_ignored` / `risk_if_changed` /
`protected_behavior` / `scope_in` / `scope_out` / `verification_steps` / `success_criteria` /
`gotchas`) も省略せずすべて埋める。

---

## §4. スキーマフィールド要点

以下は feature-expert 固有フィールドと canonical 必須フィールドの一覧。
canonical 必須フィールドの正本定義は `_shared/expert-spawn.md` を参照。

| フィールド | 役割 |
|-----------|------|
| `severity` | 危険度 (critical / high / medium / low) |
| `severity_reason` | **canonical 必須**: Critical / High と判定した根拠 (到達経路・観測可能な被害・影響範囲) |
| `domain` | **canonical 必須**: `feature` 固定 |
| `symbols` | **canonical 必須**: 対象コンポーネント名 / 関数名 / 型名 |
| `evidence_grade` | **canonical 必須**: `direct` / `inferred` / `requires_runtime`。`direct` 以外で Critical 不可 |
| `hypothesis` | **canonical 必須**: scan が立てた根本原因仮説 |
| `excluded_hypotheses` | **canonical 推奨**: 検討したが否定した仮説と否定根拠 |
| `recommended_runner` | **canonical 必須**: `feature-expert` 固定 |
| `post_check_expert` | **canonical 必須**: UI ファイルを触る場合は `ux-ui-audit-expert`、そうでない場合は `null` |
| `blocking` | **canonical 必須**: 新規変更が既存 debt を悪化させる場合 `true`。`blocking_reason` と対 |
| `blocking_reason` | **canonical 必須**: `blocking: false` なら `null`、`true` なら理由を 1 行 |
| `confidence` | 根拠の強さ (high / medium / low) — severity と独立 |
| `issue_type` | `duplicate_helper` / `bypass_wrapper` / `adhoc_error_type` / `pattern_deviation` / `missing_error_path` / `stale_todo` / `spec_divergence` (enum 対応表に従う) |
| `action` | `replace_with_existing_asset` / `align_to_pattern` / `complete_missing_state` / `add_implementation` / `needs_human_decision` (bulk_group との対応は enum 対応表を参照) |
| `evidence_sources` | `grep` / `source_read` / `git_log` / `git_blame` / `gh_search` の組合せ |
| `asset_map` | 手本ファイル / 再利用資産 / 抽出パターン (silent fork 防止の証拠) |
| `protected_behavior` | この実装が守る振る舞い (実装計画の核) |
| `needs_human_decision` | required:true なら apply は手を出さず人間判断を待つ |

> enum 対応表 (bulk_group / issue_type / action) の正本は
> `references/silent-fork-patterns.md` の「catalog 索引 + enum 対応表」節。

apply agent は `recommendation` の計画を実装テンプレとしてそのまま使う。
仕様の不明点があれば `needs_human_decision` (decision_type: "behavior") で構造化返却する。
Issue コメント化は commander が判断する (mode 差は SKILL.md 冒頭参照)

`needs_human_decision.required: true` の Issue には apply しない。

---

## §5. patrol 経由の追加制約 (op-patrol から呼ばれた時)

`op-patrol` から委譲された場合、area 選定をやり直さない。
patrol が選んだ area と巡回理由を尊重し、**feature 専門の read-only audit に限定**する。

入力される想定:

- `area`: 巡回対象区画
- `patrol_reason`: なぜこの area が選ばれたか (1〜2 行)
- `scope_in` / `scope_out`
- `suspicion`: `duplicate_helper` / `bypass_wrapper` / `adhoc_error_type` / `pattern_deviation` / `missing_error_path` / `stale_todo` / `spec_divergence` (enum 対応表の `issue_type` に揃える)
- `run_id`: op-patrol の run id

重要 (op-patrol の read-only policy を優先):

- 実行レベルと報告閾値の正本は `_shared/severity-rubric.md`「scan 報告ルール (共通)」節
  (Level 0 固定 = 編集・ビルド・テスト・型チェック禁止 / Critical・High のみ) —
  **patrol audit を始める前に Read する**
- patrol では加えて、命名整理・好みのリファクタは Critical / High であっても返さない
- 実行しないと確定できないものは `evidence_grade = requires_runtime` + `reproduction_hint` で返し、`--auto` 起票対象にしない

patrol 経由で起票してよい指摘:

| severity | 該当 |
|----------|------|
| Critical | data loss / security に直結する silent fork (既存 sanitization bypass で injection 経路露出 等) / Critical 機能の主要 error path 欠如 |
| High | 既存資産無視による重複実装 (将来保守コスト爆発確定) / 主要 loading / empty state 欠如で UX 致命的破綻 / Critical 機能の spec divergence / 本番影響レベルの死蔵 TODO |

patrol 経由で **起票しないもの** (op-scan モードなら可だが patrol では禁止):

- 命名が微妙、構造を綺麗にできる
- Medium 以下の pattern deviation
- 実装の書き方の好み
