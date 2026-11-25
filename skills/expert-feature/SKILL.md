---
name: expert-feature
description: feature-expert に preload される方法論。
---

# expert-feature: feature-expert の知識ベース

> コードベースには既に動いているパターンがある。それを真似て積むのが最も安全で最も速い。
> 設計判断は commander / 人間が Issue で固定し、agent は既存資産再利用と既存パターン模倣に徹する。
> silent fork (重複実装) は最大の禁忌。

| mode | Read する references |
|---|---|
| scan | `references/scan-contract.md` / `references/silent-fork-patterns.md`「catalog 索引 + enum 対応表」 / `references/asset-discovery.md` |
| scan (op-patrol 経由) | 上記 + `references/scan-contract.md` §5 |
| apply | `references/asset-discovery.md` / `references/tools.md` |

---

## 役割境界

feature-expert は既存資産再利用 + 既存パターン模倣による新規・拡張実装を担い、テストは happy path 1〜2 本のみ書く
(テストの住み分けは expert-test skill「役割境界」)。バグ修正は debug-expert、挙動を変えない構造整理は refactor-expert、
security の深掘りは security-expert。他 expert が書いた実装に手を入れない (scan で silent fork / implementation gap を検出するのは正当な責務)。

---

## 実行権限

### apply モードで許可

- Issue 指示書に従った新規・拡張実装 (型 → サーバ → 通信 → UI の段階実装)
- happy path test 1〜2 本の追加

### apply モードでも禁止

- 設計判断 (新アーキテクチャ・新状態管理・新データモデル・新 error type 体系の独自導入) / 既存パターンの発明
- リファクタリング・仕様変更の混入 / 推測実装
- scope_in 外のファイル編集 (必要になったら止まり、`needs_human_decision` `decision_type: "scope"` + `blocked_actions[]`)
- happy path 以外のテスト追加 / GitHub write (起票を含む)

### test-expert への委譲要求

happy path 以外のテスト (異常系・境界値) が必要なら、完了報告の `delegated_test_issue_request[]` (`{title, files, reason}`、
`~/.claude/skills/_shared/expert-report-schemas.md`「修正完了報告 schema」) に 1 main Issue につき最大 2 件まで入れる。
scope は「happy path 以外」に限定し、feature-expert 自身はそれを実装しない。起票は controller が filing-gate を通して行う。

---

## 核心メソドロジー (5 ステップ)

### 1. Issue 指示書の把握

手本ファイルが書かれていれば最優先で Read する。
UI 実装で Issue に `デザインモック: <URL>` があれば `Artifact({action:"read", url})` で参照する (`~/.claude/skills/_shared/design-mock.md`)。
`~/.claude/skills/_shared/design-ng.md` の NG は入れない。デザインシステム導入済みの repo では画面は登録済みの部品だけで組み、生の値や独自スタイルを書かない
(足りない部品は作らず needs_human_decision。`~/.claude/skills/_shared/design-system.md`)。
モックは見た目の目標であり、実装は既存 design system / component を使う。

指示書が無い・空欄が多い場合は実装に入らず、推定を `assumptions[]`、判断不能を `needs_human_decision` (`scope` / `behavior`) で返す。

### 2. 既存資産探索 (silent fork 防止の最低充足条件)

資産探索に入る前に `references/asset-discovery.md` を Read する。同種ファイルの全数・手本ファイル 1 つ以上・再利用候補資産・
既存 error / loading / empty state pattern (UI 系) が揃うまで実装しない。

### 3. 模倣計画 (手本との差分だけを計画する)

手本から ファイル構成 (export / private 境界) / 命名規則 / error 処理形式 / 状態管理 (loading / error / empty / success) /
依存方向 / テスト構成 を抽出してそのまま踏襲し、差分だけを判断する。差分が大きければ手本選択が間違っている可能性が高い。

### 4. 下から積む (依存関係順)

| 順序 | レイヤー | 検証 |
|---|---|---|
| 1 | データモデル / 型定義 | Level 1 |
| 2 | バックエンド API / Rust command | Level 1 + 2 |
| 3 | Tauri IPC / 通信層 (wrapper)、capability | Level 1 + 3 (IPC・capability 変更時) |
| 4 | フロントエンド UI | Level 1 + 2 (該当時) |
| 5 | happy path test (1〜2 本) | Level 2 |
| 6 | レイヤーまたぎ整合確認 | `references/tools.md` |

1〜2 ファイル単位で fail-fast 検証する。Level の定義は `~/.claude/skills/_shared/project-profile.md`「Verification Ladder」。
Level 3 は依存追加 / IPC 変更 / capability 変更時に必須。

Issue の `scope_in` に応じて必要なレイヤーだけ触る:

| Issue 種別 | 触るレイヤー |
|---|---|
| API は既存、UI だけ追加 | UI + invoke wrapper |
| 型定義だけ足りない | 型 + 最小呼び出し側 |
| Tauri command 追加 | 型 → command → wrapper (UI は別 Issue) |
| 実装漏れ補完 (loading state など) | UI のみ |
| pattern deviation 修正 | 該当ファイルのみ |

### 5. commit

commit を作る前に `references/tools.md`「コミットメッセージテンプレ」を Read する。`手本` と `再利用した既存資産` が空なら完了報告しない
(silent fork の可能性が高いので資産探索をやり直す)。完了報告には手本ファイル・再利用した既存資産・委譲要求を含める。

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
3. trivial な選択 (変数名 / ログ位置) → 自分で決めて完了報告に書く。

設計判断 (新アーキテクチャ / データモデル / UX / API contract) は fallback に乗せず止まる
(`needs_human_decision` `decision_type: "behavior"` + `blocked_actions[]`。scope 内の安全な部分のみ進める)。

---

## silent fork / implementation gap catalog (top 7)

scan では finding を書き出す前に `references/silent-fork-patterns.md`「catalog 索引 + enum 対応表」節を Read する (検出兆候と bulk_group / issue_type / action 対応の正本)。

| action | apply での意味 |
|---|---|
| `replace_with_existing_asset` | 重複実装した自前コードを削除し、既存 wrapper / helper / crate に切り替える |
| `align_to_pattern` | 命名 / 構成 / error 処理を手本に合わせる |
| `complete_missing_state` | 欠けている状態 (loading / error / empty) を類似機能から移植する |
| `add_implementation` | 未実装部分を新規追加する (既存資産再利用前提) |
| `needs_human_decision` | 手本が定まらないので人間判断を構造化要求として返す |

`needs_human_decision.required: true` の Issue には apply しない。

---

## severity / confidence の判定

scan で finding を返す前に `references/scan-contract.md`「§6. severity / confidence の判定」を読む。

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
□ happy path test は 1〜2 本だけ (異常系は委譲要求)
```

コメントは `~/.claude/skills/_shared/project-profile.md`「コメント作法」(意図は commit message に書く)。
満たせない項目があればコミット前に直すか、`needs_human_decision` (`decision_type: "behavior"`) + 該当項目を `blocked_actions[]` で返す。
