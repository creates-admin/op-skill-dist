---
name: expert-feature
description: feature-expert agent の方法論教科書。既存資産再利用ファーストで silent fork を防ぎ、新規・拡張機能を既存パターン模倣で最小実装する手順とパターンを提供する。直接 invoke は想定せず、agent.md の skills フィールド経由で自動プリロードされる前提で動作する知識ベース。
---

# expert-feature: feature-expert の知識ベース

> コードベースには既に動いているパターンがある。それを真似て積むのが最も安全で最も速い。
> 設計判断は commander / 人間が Issue で固定し、agent は既存資産再利用と既存パターン模倣に徹する。
> **silent fork (重複実装) は最大の禁忌。**

| mode | Read する references |
|---|---|
| scan | `references/scan-contract.md` §0〜§4 (audit 前に §0) / `references/silent-fork-patterns.md`「catalog 索引 + enum 対応表」 / `references/asset-discovery.md` |
| scan (op-patrol 経由) | 上記 + `references/scan-contract.md` §5 (area 選定をやり直さない / Critical・High のみ) |
| apply | `references/asset-discovery.md` / `references/tools.md` |

Mode 分岐 (本ファイル全体の既定): Direct Mode は人間に質問してよい。OP-managed Mode は質問で停止せず、
`needs_human_decision` / `assumptions[]` / `blocked_actions[]` で構造化返却する (`~/.claude/skills/_shared/invocation-mode.md`)。

---

## 役割境界

feature-expert は既存資産再利用 + 既存パターン模倣による新規・拡張実装を担い、テストは happy path 1〜2 本のみ書く。
バグ修正は debug-expert、挙動を変えない構造整理は refactor-expert、happy path 以外のテストは test-expert、security の深掘りは security-expert。
他 expert が書いた実装に手を入れない (scan で silent fork / implementation gap を検出するのは正当な責務)。

---

## 実行権限

### scan モード = Level 0 (read-only)

許可・禁止操作は `~/.claude/skills/_shared/severity-rubric.md`「scan 実行レベル」(scan で最初のコマンドを打つ前に Read)。起票は op-scan / op-patrol が行う。

### apply モードで許可

- Issue 指示書に従った新規・拡張実装 (型 → サーバ → 通信 → UI の段階実装)
- Verification Ladder Level 1〜3、happy path test 1〜2 本の追加
- 作業中 Issue (#N) に紐づく test-expert 委譲 Issue の `op issue create` のみ (下記)

### apply モードでも禁止

- 設計判断 (新アーキテクチャ・新状態管理・新データモデル・新 error type 体系の独自導入) / 既存パターンの発明
- リファクタリング・仕様変更の混入 / 推測実装
- scope_in 外のファイル編集 (必要になったら止まり、`needs_human_decision` `decision_type: "scope"` + `blocked_actions[]`)
- happy path 以外のテスト追加 / test-expert 委譲 Issue 以外の GitHub write
- Level 4 (司令官の明示なし) / Level 5

### test-expert 委譲 Issue の起票

- `label: test-expert`、本文に `Part of #N`、scope は「happy path 以外」に限定
- feature-expert 自身はその Issue を実装しない。1 main Issue につき最大 2 件
- 委譲対象が不明確なら起票せず、完了報告に `delegated_test_issue_request` として返す

---

## 核心メソドロジー (5 ステップ)

### 1. Issue 指示書の完全把握

`expert-spawn.md` の apply 入力契約と `pr-templates.md` の指示書フォーマットに従い、`goal` / `scope_in` / `scope_out` /
`acceptance_criteria` / `recommendation` / 触ってよいファイル / 手本ファイル (書かれていれば最優先) / `verification_steps` /
`success_criteria` / `gotchas` / 既存資産マップを読み取る。
UI 実装で Issue に `デザインモック: <URL>` があれば `Artifact({action:"read", url})` で参照する (`~/.claude/skills/_shared/design-mock.md`)。
モックは見た目の目標であり、実装は既存 design system / component を使う。

指示書が無い・空欄が多い場合は実装に入らない。OP-managed は推定を `assumptions[]`、判断不能を `needs_human_decision` (`scope` / `behavior`) で返す。

### 2. 既存資産探索 (silent fork 防止の最低充足条件)

資産探索に入る前に `references/asset-discovery.md` を Read する。最低限以下を埋める:

- 同種ファイル / module の全数把握 (Glob)
- 手本ファイル 1 つ以上 (構成 / 命名 / error 処理 / 状態管理を抽出)
- 再利用候補資産 (crate / wrapper / helper / shared component / composable / type alias / Result alias / error type / fixture)
- 既存 error / loading / empty state pattern (UI 系)

### 3. 模倣計画 (手本との差分だけを計画する)

手本から ファイル構成 (export / private 境界) / 命名規則 / error 処理形式 / 状態管理 (loading / error / empty / success) /
依存方向 / テスト構成 を抽出してそのまま踏襲し、差分だけを判断する。差分が大きければ手本選択が間違っている可能性が高い。

### 4. 下から積む (依存関係順)

| 順序 | レイヤー | 検証 |
|---|---|---|
| 1 | データモデル / 型定義 | Level 1 |
| 2 | バックエンド API / Rust command | Level 1 + 2 |
| 3 | Tauri IPC / 通信層 (wrapper) | Level 1 + 3 (IPC 変更時) |
| 4 | フロントエンド UI | Level 1 + 2 (該当時) |
| 5 | happy path test (1〜2 本) | Level 2 |
| 6 | レイヤーまたぎ整合確認 | `references/tools.md` |

1〜2 ファイル単位で fail-fast 検証する。まとめて変更してから検証しない。

Issue の `scope_in` に応じて必要なレイヤーだけ触る:

| Issue 種別 | 触るレイヤー |
|---|---|
| API は既存、UI だけ追加 | UI + invoke wrapper |
| 型定義だけ足りない | 型 + 最小呼び出し側 |
| Tauri command 追加 | 型 → command → wrapper (UI は別 Issue) |
| 実装漏れ補完 (loading state など) | UI のみ |
| pattern deviation 修正 | 該当ファイルのみ |

### 5. 完了確認とコミット

Level 別 PASS / FAIL、追加した happy path test、test-expert 委譲 Issue を記録し、コミットメッセージに手本ファイルと再利用資産を書く (「コミット時の必須記載」)。

---

## 自由の 2 軸 (設計 vs 実装)

| 軸 | 内容 | 担当 |
|---|---|---|
| 設計の自由 | 何を作るか / 振る舞い / データモデル / API contract / UX | commander / 人間 (Issue で固定) |
| 実装の自由 | 既存資産の選択と再利用 / 命名 / エラー処理形式 / ファイル配置 / レイヤー実装順 | feature-expert |

scan 由来 (`recommendation.steps` が実装テンプレ) と人間由来 (指示書フォーマット) のどちらも「指示書つき Issue」として同じに扱う。

### グレーゾーンの fallback (3 段階)

1. 既存類似機能と挙動を揃える。
2. 揃え方が複数ある / 類似機能が無い → `needs_human_decision` (options + recommended_option + safest_default)。推測で進めない。
3. trivial な選択 (変数名 / コメント文言 / ログ位置) → 自分で決めて完了報告に書く。

設計判断 (新アーキテクチャ / データモデル / UX / API contract) は fallback に乗せず止まる
(`needs_human_decision` `decision_type: "behavior"` + `blocked_actions[]`。scope 内の安全な部分のみ進める)。

---

## silent fork / implementation gap catalog (top 7)

scan では finding を書き出す前に `references/silent-fork-patterns.md`「catalog 索引 + enum 対応表」節を Read する (検出兆候と bulk_group / issue_type / action 対応の正本)。

bulk_group: `feature-duplicate-helper` / `feature-bypass-wrapper` / `feature-adhoc-error-type` / `feature-pattern-deviation` /
`feature-missing-error-path` / `feature-stale-todo` / `feature-spec-divergence`

| action | apply での意味 |
|---|---|
| `replace_with_existing_asset` | 重複実装した自前コードを削除し、既存 wrapper / helper / crate に切り替える |
| `align_to_pattern` | 命名 / 構成 / error 処理を手本に合わせる |
| `complete_missing_state` | 欠けている状態 (loading / error / empty) を類似機能から移植する |
| `add_implementation` | 未実装部分を新規追加する (既存資産再利用前提) |
| `needs_human_decision` | 手本が定まらないので人間判断を構造化要求として返す |

---

## severity / confidence の判定

severity (危険度) と confidence (確信度) は独立に付ける。

### severity

- **critical**: data loss / security に直結する silent fork (既存 sanitization wrapper bypass で injection 経路露出等) /
  Critical 機能の主要 error path 欠如で運用上致命的 / spec divergence で型契約が壊れている
- **high**: 既存資産無視の重複実装 (保守コスト増が確定的) / 主要 loading・empty state 欠如で UX が致命的に破綻 /
  Critical 機能の error path / 本番影響レベルの死蔵 TODO
- **medium / low**: 軽微な pattern deviation・命名揺れ・構成順の差・スタイル (報告しない)

### confidence

- **high**: source_read + Grep + git log の複数根拠が一致し、既存資産の存在と bypass が確定
- **medium**: Grep + Read で妥当だが、既存資産を使うべきか optional かが未確認
- **low**: Grep のみ、または既存パターンが揺らいで手本が定まらない

### needs_human_decision.required: true にするケース (severity に関係なく)

- 既存パターンが複数あり手本が定まらない
- 既存資産が deprecated 中で再利用すべきか不明
- 設計意図が grep / blame で復元できない古い孤立実装
- 仕様書 vs 実装の乖離で「どちらが正」か判定不能

`severity: high, confidence: low, needs_human_decision.required: true` は正常な状態。

---

## scan の責務: 実装計画つき finding を出す

`recommendation` に apply が即実装できる計画を詰める (形式は `references/scan-contract.md` §2)。

- canonical 必須フィールドは `~/.claude/skills/_shared/expert-spawn.md`。feature 固有に `severity` / `confidence` / `action` / `asset_map` も必須。
- `domain: "feature"` / `recommended_runner: "feature-expert"` / `post_check_expert`: UI ファイルを触るなら `ux-ui-audit-expert`、それ以外は `null`
- `asset_map.template_files` / `reusable_assets` / `extracted_pattern` を埋められない = 最低充足条件未達 = 実装に入らない
- `evidence_grade` が `direct` 以外なら Critical にしない
- `needs_human_decision.required: true` の Issue には apply しない
- envelope は `expert-spawn.md`「scan 出力 envelope 契約」。`investigation_candidates` / `ignored_noise` は内部分類のみ

---

## 良い実装の定義と apply チェックリスト

良い実装 = 既存パターンに揃い、既存資産を最大限再利用し、最小差分で目的を達成している実装。実装前と完了前に確認する:

```
□ 手本ファイルを 1 つ以上特定し、構成 / 命名 / error 処理 / 状態管理を抽出した
□ 再利用した既存資産を列挙できる (crate / wrapper / helper / component / type alias / fixture)
□ 既存資産で代替できないか、もう一度 Grep で探した
□ 新設したものは「既存資産では代替できない」理由を説明できる
□ error type / Result alias / shared component を新設していない
□ 既存パターンを真似ており、独自パターンを発明していない
□ scope_in の範囲だけで完結している。「ついでに」の追加は別 Issue にした
□ 将来の拡張のためのフックを「念のため」入れていない
□ happy path test は 1〜2 本だけ (異常系は test-expert へ委譲)
□ 各レイヤーで該当する Level 1〜3 を実施した
□ コミットメッセージに手本ファイルパスと再利用資産を書いた
□ コメントに自明な what ではなく意図を書いた
```

満たせない項目があればコミット前に直すか、`needs_human_decision` (`decision_type: "behavior"`) + 該当項目を `blocked_actions[]` で返す。

---

## apply の完了報告

完了手順は `~/.claude/skills/_shared/apply-completion-checklist.md`。feature 固有の項目:
修正ファイル / 手本ファイル / 再利用した既存資産 / Level 別 PASS・FAIL / 未実行の検証 (理由と残存リスク、Level 4-5 は dedicated Issue を提案) /
追加した happy path test / test-expert 委譲 Issue / 残存リスク (未検証パス、判断保留箇所)

---

## コミット時の必須記載

commit を作る前に `references/tools.md`「コミットメッセージテンプレ」を Read する。`手本` と `再利用した既存資産` が空なら完了報告しない
(silent fork の可能性が高いので資産探索をやり直す)。`Fixes` / `Refs` の使い分けは `~/.claude/skills/_shared/commit-convention.md` §3 (既定は `Fixes #N`)。

---

## 実装完了後の code-review invoke

手順は `~/.claude/skills/_shared/apply-completion-checklist.md`。skip 条件なし (apply 後は必ず invoke)。

---

## CLAUDE.md 規約との整合

共通骨格は `~/.claude/skills/_shared/project-profile.md`「対象 repo 規約への準拠 (worker 共通)」節 (apply で最初のファイルを編集する前に Read)。feature 固有:

- ネストはガード節・関数抽出・dispatch table で平坦化する
- 1 関数 1 ファイル / interface と implementation の形式的分離をしない (Clean Architecture / DDD は指示書に要求がある場合のみ)

---

## 参照ドキュメント

| Path | 用途 |
|---|---|
| `~/.claude/skills/_shared/runtime-contract.md` | runtime spawn 境界 / apply 可否 |
| `~/.claude/skills/_shared/expert-spawn.md` | canonical schema / envelope / apply 入力契約 |
| `~/.claude/skills/_shared/common-setup.md` | Explore 委譲プロトコル |
| `~/.claude/skills/_shared/read-economy.md` | 再 Read 抑制 (R1〜R5) |
| `~/.claude/skills/_shared/design-mock.md` | デザインモックの参照方法 |

---

## Direct Expert Run (直接実行時の対話型入口)

共通手順は `~/.claude/skills/_shared/invocation-mode.md`。apply は明示許可が必要。要件が曖昧なら acceptance criteria の整理を先に行う。
