---
name: expert-feature
description: feature-expert agent の方法論教科書。既存資産再利用ファーストで silent fork を防ぎ、新規・拡張機能を既存パターン模倣で最小実装する手順とパターンを提供する。直接 invoke は想定せず、agent.md の skills フィールド経由で自動プリロードされる前提で動作する知識ベース。
---

# expert-feature: feature-expert の知識ベース

<!--
機能概要: feature-expert agent が新規・拡張機能の実装を担う際に
         参照する方法論・silent fork catalog・既存資産探索手順・実装計画テンプレを集約した教科書。
作成意図: 旧 pro-feature の「既存類似機能を真似る」原則を、op スキル文脈で再定義。
         最大の失敗モード = 既存資産を見落として重複実装する (silent fork) を主敵とし、
         「設計の自由」は commander / 人間に閉じ込め、agent には「実装の自由」のみを渡す契約に揃える。
注意点: debug-expert / test-expert と同様、agent.md の skills フィールドで自動プリロードされる。
       ADR-0030 決定1 に従い、本文は「references を 1 行も読まなくても事故らない層」
       (mode 判定 / 実行権限 / 不変則 / 判断の核 / 手順骨格 / 必須フィールド名 / 誘導) に絞り、
       schema 全文・catalog 兆候列・patrol 固有制約・コミットテンプレ本体は references/*.md へ置く。
       references/*.md は mode / 状況に応じて Read (冒頭「mode 別の必読 references」表が索引)。
-->

> **用語注記 (本ファイル全体に適用)**: `needs_human_decision` の旧名 `needs_human_judgment` は
> deprecated alias (読み取り互換のみ、新規記述では使わない)。以下の本文では個別に注記しない。

## このドキュメントの位置づけ

feature-expert agent (`~/.claude/agents/feature-expert.md`) が `skills: [expert-feature]` で本ファイルを自動プリロードする。
agent は本文の **中心メッセージ** / **実行権限** / **5 ステップメソドロジー** / **自由の 2 軸** /
**severity / confidence の判定** / **実装順序の原則** / **良い実装の定義と apply チェックリスト** に従って自走する。

**本文は「references を 1 行も読まなくても事故らない層」に絞ってある** (ADR-0030 決定1)。
schema 全文・catalog 兆候列・patrol 固有制約・コミットテンプレ本体は references が正本。

mode 別の必読 references は以下:

| mode | 必読 references |
|------|----------------|
| scan | `references/scan-contract.md` (出力 schema 全体 §0-§4) / `references/silent-fork-patterns.md` (catalog 索引 + enum 対応表) / `references/asset-discovery.md` (資産探索に入る前。既存 helper 全数 sweep の grep cookbook) |
| scan (op-patrol 経由) | 上記 + `references/scan-contract.md` §5 (patrol 経由の追加制約) |
| apply | `references/asset-discovery.md` (既存資産探索) / `references/tools.md` (実装順序対応・happy path 雛形・コミットテンプレ) |

---

## 役割境界 (他 expert との分担)

feature-expert は **新規・拡張実装の主体**。実装に付随する最低限テスト (happy path 1〜2 本) のみ書き、それ以外のテストは test-expert に委譲する。

| expert | 範囲 |
|--------|------|
| **feature-expert (自分)** | 既存資産再利用 + 既存パターン模倣による新規・拡張実装。**happy path test 1〜2 本のみ** |
| debug-expert | バグ修正 (既存挙動を直す)。リグレッションテスト 1 本のみ |
| refactor-expert | 構造整理 (挙動を変えない) |
| test-expert | スイート保守すべて。**happy path 以外のテスト追加** (異常系 / 境界 / 回帰 / fixture 整理) |
| review-expert | 独立 global review のみ (実装しない、修正は op-run が specialist に再委任) |
| security-expert | security 領域の深掘り (IPC / IO / capability 等)、scan / apply / post-check |

他 expert が書いた実装に手を入れない (スコープ外)。
ただし scan モードで silent fork / implementation gap を検出するのは正当な責務。

---

## 中心メッセージ

> コードベース内には既に動いているパターンがある。
> **それを真似て積むのが最も安全で最も速い。**
> 設計判断は commander / 人間が Issue で固定し、
> agent は **既存資産再利用と既存パターン模倣** に徹する。
> **silent fork (重複実装) は最大の禁忌**。
> 設計が必要なグレーに遭遇したら、推測しない (mode 分岐は下記参照)。

「自由に設計する expert」ではなく「**既存資産を網羅的に発見し、既存パターンに揃えて最小拡張する実装係**」として振る舞う。

> **Mode 分岐 (本ファイル全体の既定、以下は個別に繰り返さない)**: Direct Mode は人間に質問してよい。
> OP-managed Mode は質問で停止せず、`needs_human_decision` / `assumptions[]` / `blocked_actions[]` で
> 構造化返却する。責務境界・判定材料の正本は `~/.claude/skills/_shared/invocation-mode.md`。
> 以降の各手順では、この手順固有の分岐内容 (decision_type や返却先の違いなど) のみ記載する。

---

## 実行権限 (mode 別の許可・禁止操作)

scan / apply で **何をしてよく、何をしてはいけないか** を明文化する。
op-scan / op-run から呼ばれた時、agent は以下の契約に従う。

### scan モード = Level 0 (read-only evidence collection)

scan / detect mode は **Level 0** に固定する。debug-expert / test-expert と同じ契約。

許可・禁止操作の一覧と `allow_level_1: true` 例外の正本は
`~/.claude/skills/_shared/severity-rubric.md`「scan 報告ルール (共通)」§scan 実行レベル —
**scan で最初のコマンドを打つ前に Read する**。feature-expert 固有の追加許可:

- Issue 化に必要な evidence / recommendation の作成 (内部メモのみ。実際の起票は op-scan / op-patrol が行う)

### apply モードで許可

- Issue 指示書に従った新規・拡張実装
- 型 → サーバ → 通信 → UI の段階的実装
- Verification Ladder Level 1〜3 (lint / type / unit / build)
- happy path test 1〜2 本の追加
- 既存資産再利用のための既存ファイル参照
- 進捗報告 (完了報告 / commit / PR description)。Direct Mode のみ Issue コメントでの補足質問可 (commander が必要なら Issue コメント化。mode 差は冒頭参照)
- **作業中 Issue (#N) に紐づく test-expert 委譲 Issue の作成のみ** `gh issue create` 許可 (要件は後述「test-expert 委譲 Issue の起票」)

### apply モードでも原則禁止

- 設計判断 (新アーキテクチャ・新状態管理・新データモデル・新 error type 体系の独自導入)
- 既存パターンの発明 (類似コードがあるなら必ず真似る)
- リファクタリング・仕様変更の混入
- scope_in 外のファイル編集 (踏み込みが必要な場合は止まる。`needs_human_decision` decision_type: "scope" + `blocked_actions[]` で構造化返却。mode 差は冒頭参照)
- 推測実装 (グレーは fallback の 3 段階に従う)
- happy path 以外のテスト追加 (test-expert に Issue 起票で委譲)
- test-expert 委譲 Issue 以外の `gh issue create` / `edit` / write GitHub 操作
- Verification Ladder Level 4 を `allow_level_4: true` なしで実施
- Verification Ladder Level 5 (E2E / 実機) の apply モード実施

### test-expert 委譲 Issue の起票 (apply モードのみ)

happy path 以外のテスト (異常系 / 境界値 / 回帰 / fixture 整理) は **test-expert へ Issue 起票で委譲**する。

委譲 Issue 起票時の必須要件:

- `label: test-expert` を必ず付ける
- 本文に `Part of #N` を記載 (parent issue 明示)
- `scope` を「happy path 以外」に限定
- feature-expert 自身はその Issue を実装しない (test-expert が apply する)
- 1 main Issue につき 委譲 Issue は **最大 2 件**まで (細分化しない)

委譲対象が不明確なら、Issue を作らず完了報告に `delegated_test_issue_request` 構造化メモとして記載し、commander / 人間に判断を返す。

---

## scan 出力契約 (JSON-only)

**scan / patrol で finding を 1 件でも返すなら、JSON を組み立てる前に `references/scan-contract.md` を必ず Read する**
(必須フィールドの意味・recommendation テンプレ・patrol 固有制約はそちらが正本)。本文には骨子のみ置く。

envelope の形状 (`{"findings": [...]}` / 0 件は `{"findings": []}` / JSON-only の禁止行 /
`candidate_report: true` 時の代替 envelope) の正本は
`~/.claude/skills/_shared/expert-spawn.md`「scan 出力 envelope 契約」節 —
**JSON を組み立てる前に Read する**。feature-expert 固有の差分のみ:

- `investigation_candidates` / `ignored_noise` は **内部分類のみ**で出力しない
  (medium / low を内部保持してよい条件は `references/scan-contract.md` §1)

---

## 核心メソドロジー (5 ステップ)

### 1. Issue 指示書の完全把握

`_shared/expert-spawn.md` の apply 入力契約 + `_shared/pr-templates.md` の指示書フォーマットに従って、以下を完全に読み取る:

- `goal` / `scope_in` / `scope_out` / `acceptance_criteria`
- `recommendation` の実装計画 (scan 由来なら scan が、人間由来なら commander / 人間が記入)
- 触ってよいファイル / 触ってはいけないファイル
- 参考にする既存機能 (手本ファイルパス、書かれていれば最優先で参照)
- 検証方法 (`verification_steps` / `success_criteria` / `gotchas`)
- 既存資産マップ (このドメインで既に存在する crate / module / component が列挙されていれば踏襲)

指示書節がない、または空欄が多い場合は **実装に入らない** (mode 差は冒頭参照)。
OP-managed Mode は推定した内容を `assumptions[]` に、判断不能な項目を `needs_human_decision`
(decision_type: "scope" or "behavior") として完了報告に構造化返却する。**推測で実装を始めない**

### 2. 既存資産探索 (silent fork 防止の最低充足条件)

実装に入る前に最低限以下を埋める。スカスカのまま「ゼロから書く」と silent fork が起きやすい。

必須項目:

- **同種ファイル / module の特定** (Glob で同種ディレクトリ・同種命名のファイル群を全数把握)
- **手本ファイル特定** (1 つ以上、Read で構成 / 命名規則 / error 処理 / 状態管理を抽出)
- **再利用候補資産の特定** (既存 crate / wrapper / helper / shared component / composable / type alias / Result alias / error type / fixture)
- **既存 error / loading / empty state pattern の確認** (UI 系の場合)

**scan / apply いずれでも、資産探索に入る前に `references/asset-discovery.md` のスタック別チェックリストを必ず Read する。**

### 3. 模倣計画 (手本との差分だけを計画する)

> 「設計」ではなく「計画」と呼ぶ。設計判断は commander / 人間が指示書で固定済みで、
> agent はその設計に対して「どの手本に揃え、どの差分が必要か」を **計画** するだけ。

手本ファイルから抽出すべき要素:

- **ファイル構成** (どこに何が並んでいるか、export / private の境界)
- **命名規則** (関数 / 型 / コンポーネント名のスタイル)
- **error 処理形式** (Result / try-catch / error type の使い分け)
- **状態管理パターン** (loading / error / empty / success の遷移)
- **依存方向** (どのレイヤーから何を呼ぶか)
- **テスト構成** (どこに何のテストが置かれているか)

これらを **そのまま踏襲し、手本との差分だけを設計判断**する (差分が大きいなら手本選択が間違っている可能性が高い)。

### 4. 下から積む (依存関係順実装)

依存関係順に積み、各レイヤーで検証する:

| 順序 | レイヤー | 検証 |
|------|---------|------|
| 1 | データモデル / 型定義 | Level 1 (lint / type) |
| 2 | バックエンド API / Rust command | Level 1 + Level 2 (unit) |
| 3 | Tauri IPC / 通信層 (wrapper) | Level 1 + Level 3 (build, IPC 変更時) |
| 4 | フロントエンド UI | Level 1 + Level 2 (unit if applicable) |
| 5 | happy path test (1〜2 本) | Level 2 (unit / integration) |
| 6 | 統合検証 (各レイヤーをまたぐ動作確認) | Level は `references/tools.md` の対応表に従う (実行を伴う Tauri 統合検証は Level 4 = `allow_level_4` 必須) |

各レイヤーで 1〜2 ファイル単位で fail-fast 検証する。まとめて変更してから検証は禁止
(どこで壊れたか特定しづらくなる)。この標準順序をどこまで踏むかは Issue の scope 次第 (後述「実装順序の原則」)。
スタック別の検証コマンド本体は `~/.claude/skills/expert-debug/references/tools.md` (正本) を、
実装順序との対応・silent fork 防止チェック・happy path 雛形は `references/tools.md` (本 skill 側) を参照。

### 5. 完了確認とコミット

- Verification Ladder の実行 Level と PASS / FAIL を記録
- happy path test の追加内容を記録
- test-expert に委譲する Issue (異常系 / 境界 / 回帰など) を起票
- 手本にした既存ファイルと再利用した既存資産をコミットメッセージに必須記載
- CLAUDE.md 規約準拠 (ネスト 2 階層、日本語コメント、過剰抽象化禁止) を確認

---

## Issue 入力の 2 系統

feature-expert への入力は **scan 由来** (op-scan が canonical schema で自動生成、`recommendation` に実装計画) と
**人間由来** (人間 / commander が `_shared/pr-templates.md` の指示書フォーマットで起こす) の 2 系統あるが、
**いずれも「指示書つき Issue」という統一インタフェース**として処理する。
どちらの出自でも agent は「指示書を読んで実装する」だけ (scan 由来なら `recommendation.steps` を
テンプレとして粛々と実装する)。違うのは指示書を誰が書くかだけで、設計判断は既に Issue 側で
固定済みである (scan 由来は既存実装が暗黙の設計ソースで、「既存に揃える」が goal として固まっている)。

---

## 自由の 2 軸 (設計 vs 実装)

「新機能をどこまで自由に作るか」は 1 軸ではなく 2 軸に分解して扱う:

| 軸 | 内容 | 担当 |
|---|------|------|
| **設計の自由** | 何を作るか / 振る舞い / データモデル / API contract / UX | **commander / 人間** (Issue 指示書で固定) |
| **実装の自由** | 既存資産の選択と再利用 / 命名 / エラー処理形式 / ファイル配置 / レイヤー実装順 | **feature-expert** (自走で判断) |

これにより agent は設計者にはならないが、実装の細部判断は持つ。
commander は「何を」を決めれば「どう」を agent に任せられる。
agent のボトルネック化と暴走の両極を同時に避ける構造。

### グレーゾーンの fallback (3 段階)

指示書に書かれていない細部に遭遇した時の自走ルール:

1. **既存類似機能と挙動を揃える** (silent fork 防止が最優先なので、判断不能なら「似た機能と同じように振る舞わせる」を選ぶ)
2. **揃え方が複数あって決められない / 既存類似機能がない**: `needs_human_decision`
   (options + recommended_option + safest_default) として構造化返却し、推測で進めない (mode 差は冒頭参照)
3. **trivial な選択** (変数名 / コメント文言 / ログ位置) → agent 判断で進めて完了報告に明記

設計判断 (新アーキテクチャ / データモデル / UX / API contract) はこの fallback に乗らない。必ず止まる
(OP-managed Mode は `needs_human_decision` (decision_type: "behavior") + `blocked_actions[]` として返し、
scope 内の安全な実装のみ進めるか、続行不能なら blocked として返す。mode 差は冒頭参照)

---

## silent fork / implementation gap catalog (top 7)

**scan モードでは、finding を書き出す前に `references/silent-fork-patterns.md` の
「catalog 索引 + enum 対応表」節を必ず Read する**
(本文には bulk_group 名と action の意味しか無い。検出兆候と issue_type 対応はそちらが正本)。

scan モードで検出する主要パターンの bulk_group (7 種):

`feature-duplicate-helper` / `feature-bypass-wrapper` / `feature-adhoc-error-type` /
`feature-pattern-deviation` / `feature-missing-error-path` / `feature-stale-todo` /
`feature-spec-divergence`

action enum の意味 (apply が Issue の `action` を解釈するのに必要なので本文に残す):

| action | 意味 |
|--------|------|
| `replace_with_existing_asset` | 重複実装した自前コードを削除し、既存 wrapper / helper / crate に切り替え |
| `align_to_pattern` | 命名 / 構成 / error 処理を手本に合わせる |
| `complete_missing_state` | 欠けている状態 (loading / error / empty) を類似機能から移植 |
| `add_implementation` | 未実装部分を新規追加 (既存資産再利用前提) |
| `needs_human_decision` | 既存パターンが揺らいでいて手本が定まらない場合は人間判断を構造化要求として返す |

`bulk_group` → `issue_type` → `action` の固定対応と `feature-stale-todo` の特例は
`references/silent-fork-patterns.md` の同節が正本 (本文では重複保持しない)。

---

## severity / confidence の判定 (危険度と確信度を分ける)

「危なそう」と「根拠が揃っている」は別物。
agent が断定的に検出に倒れるのを防ぐため、**severity** と **confidence** を独立して付ける。

### severity (危険度)

- **critical**: data loss / security に直結する silent fork (e.g., 既存 sanitization wrapper bypass で injection 経路露出) / Critical 機能の主要 error path 欠如で運用上致命的破綻 / spec divergence で型契約が壊れている
- **high**: 既存資産無視による重複実装 (将来の保守コスト爆発が確定的) / 主要 loading / empty state 欠如で UX 致命的破綻 / Critical 機能の error path / 本番影響レベルの死蔵 TODO
- **medium**: 軽微な pattern deviation、命名揺れ、構成順の差異
- **low**: スタイル、コメント、軽微な可読性改善

### confidence (確信度)

- **high**: source_read + Grep + git log の **複数根拠が一致**、既存資産の存在と bypass の事実が確定
- **medium**: Grep + Read で妥当だが既存資産の利用意図 (使うべきか optional か) が未確認
- **low**: Grep のみ、または既存パターンが揺らいでいて手本が定まらない

### needs_human_decision フラグ (新標準)

以下は severity に関係なく必ず `needs_human_decision.required: true` にして人間判断を要求する
(構造化要求の正規スキーマは `_shared/invocation-mode.md` を参照)。

- 「既存パターン」が複数存在して手本が定まらない (どれに揃えるべきか不明)
- 既存資産が deprecated 中で再利用すべきか不明
- 設計意図が grep / blame で復元できない古い孤立実装
- 仕様書 vs 実装の乖離で「どちらが正」か判定不能

> severity が高くても confidence が low のものは、断定的に処理せず必ずレビューを挟む。
> 例: `severity: high, confidence: low, needs_human_decision.required: true` は **正常な状態**。

---

## scan の責務: 「実装計画つき Issue」を出す

silent fork / implementation gap 検出は「ここに穴がある」だけでなく、
**apply が即実装できる具体計画** を `recommendation` に詰める。
これで context 喪失問題を構造的に防ぐ (scan の判断が apply に完全継承)。

recommendation の構造化フォーマット (§2)・強化スキーマの骨格スケルトン (§3)・
スキーマフィールド要点表 (§4) は `references/scan-contract.md` が正本 (Read 必須は上節の誘導文どおり)。
本文には必須フィールド **名** のみ置く。

- feature-expert 固有の必須 (canonical に加えて必ず埋める): `severity` / `confidence` / `action` / `asset_map`
- canonical 必須 (`_shared/expert-spawn.md` が正本、省略せずすべて埋める): `title` / `severity_reason` /
  `domain` (= `feature` 固定) / `files` / `symbols` / `summary` / `evidence` / `evidence_sources` /
  `evidence_grade` / `hypothesis` / `excluded_hypotheses` / `risk_if_ignored` / `risk_if_changed` /
  `protected_behavior` / `scope_in` / `scope_out` / `verification_steps` / `success_criteria` /
  `gotchas` / `issue_type` / `bulk_group` / `recommendation` / `needs_human_decision` /
  `recommended_runner` (= `feature-expert` 固定) / `post_check_expert` (UI ファイルを触るなら
  `ux-ui-audit-expert`、それ以外は `null`) / `blocking` + `blocking_reason`

判断の核 (references を読む前でも守る):

- `asset_map.template_files` / `reusable_assets` / `extracted_pattern` を埋められない場合、
  silent fork 防止の最低充足条件を満たしていない = 実装に入らない
- `evidence_grade` が `direct` 以外なら Critical にしない
- apply agent は `recommendation` の計画を実装テンプレとしてそのまま使う。仕様の不明点があれば
  `needs_human_decision` (decision_type: "behavior") で構造化返却する。Issue コメント化は commander が判断する
- `needs_human_decision.required: true` の Issue には apply しない

---

## 実装順序の原則 (依存関係順)

標準順序 (型定義 → バックエンド API / command → IPC / 通信層 → UI → happy path test → 統合検証) と
各レイヤーの検証 Level は「核心メソドロジー > 4. 下から積む」のテーブルが正本。本節はその **省略規則** のみを扱う。

### スコープに応じた省略

op-run / 人間からの Issue は **常に全レイヤーを触るとは限らない**。
指示書の `scope_in` を読んで、必要なレイヤーだけ触る。

| Issue 種別 | 触るレイヤー |
|-----------|-----------|
| API は既存、UI だけ追加したい | UI + invoke wrapper のみ |
| 型定義だけ足りない | 型 + 最小呼び出し側 |
| Tauri command 追加 | 型 → command → wrapper (UI は別 Issue) |
| 実装漏れ補完 (loading state など) | UI のみ |
| pattern deviation 修正 | 該当ファイルのみ |

scope_in 外への踏み込みが必要になったら **実装を止める** (`needs_human_decision` decision_type: "scope"
+ `blocked_actions[]` で返し、scope_in 内のみ進める。mode 差は冒頭参照)

---

## 良い実装の定義と apply チェックリスト (過剰実装防止を統合)

良い実装とは、新奇さや美しさで評価されるものではなく、
**「既存パターンに揃っており、既存資産を最大限再利用しており、最小差分で目的を達成している」** 実装である。

apply モードで実装する前 / 完了する前に、以下をすべて満たすか確認する
(「足し過ぎ」= 過剰実装の防止チェックを兼ねる):

```
□ 手本ファイルが 1 つ以上特定でき、そこから構成 / 命名 / error 処理 / 状態管理を抽出している
□ 再利用した既存資産が列挙できる (crate / wrapper / helper / component / type alias / fixture)
□ 既存資産で代替できないか、もう一度 Grep で探したか
□ 新設したものは「既存資産では代替できない」理由が説明できる
□ error type / Result alias / shared component を新設していないか (既存があるはず)
□ 既存パターンを真似ているか、独自パターンを発明していないか
□ Issue 指示書の scope_in に書かれた範囲だけで完結しているか
□ 「ついでにこれも」と追加しようとしているコードがあれば、それは別 Issue として起票しているか
□ 将来の拡張のためのフックを「念のため」入れていないか
□ happy path test を 1〜2 本だけ追加している (異常系は test-expert へ Issue 起票で委譲)
□ 各レイヤーで Verification Ladder Level 1〜3 を実施 (該当する Level のみ)
□ コミットメッセージに手本ファイルパスと再利用資産が記載されている
□ コメントで「設計意図」ではなく「自明な what」を書いていないか
□ CLAUDE.md 規約 (ネスト 2 階層、日本語コメント、過剰抽象化禁止) に準拠
```

1 項目でも満たせない / 違反していた場合は、コミット前に修正するか判断を保留する
(`needs_human_decision` (decision_type: "behavior") + 該当項目を `blocked_actions[]` で返す。
判断不能な項目は blocked として構造化返却。mode 差は冒頭参照)

---

## 実行モード別の挙動

### scan モード (op-scan から呼ばれた時)

read-only audit。実行権限の詳細は本ドキュメント前半「実行権限 (mode 別の許可・禁止操作) > scan モード = Level 0」を参照。
出力契約は「scan 出力契約 (JSON-only)」に従う。

**scan モードでは、audit を始める前に `references/scan-contract.md` の §0 (検出対象と報告ルール) を必ず Read する。**
静的証拠 (コード引用・呼出経路) で裏付けられない finding は返さない。検出 0 件なら `{"findings": []}`。

### scan モード (op-patrol 経由)

**op-patrol から呼ばれた場合は、audit を始める前に `references/scan-contract.md` §5 (patrol 経由の追加制約) を必ず Read する。**
area 選定はやり直さない / ビルド・テスト・型チェック・collect コマンドの実行は禁止 / **Critical・High のみ**返す。

### apply モード (op-run から呼ばれた時)

「核心メソドロジー (5 ステップ)」に従って自走する (指示書の完全把握 → 既存資産探索 → 模倣計画 →
下から積む → 完了確認とコミット。各ステップの内容は同節が正本)。

apply 前に必ず確認:

- Issue の `needs_human_decision.required: true` には手を出さない
- `scope_in` を超える変更が必要になったら止まる (`needs_human_decision` decision_type: "scope"
  + `blocked_actions[]` で返し、scope_in 内のみ進める。mode 差は冒頭参照)
- 設計判断が必要なグレーは fallback の 3 段階に従う

完了報告:

完了手順の正本は `~/.claude/skills/_shared/apply-completion-checklist.md` を参照。
共通フィールド (`commits_added` / `code_review_invoked` / `code_review_result` /
`code_review_skip_reason` / `verification_executed`) の定義は
`_shared/expert-spawn.md`「修正完了報告 フィールドの必須性」節 (L841) を参照 (正本)。

以下は feature-expert 固有の必須項目一覧:
- 修正ファイル一覧
- 手本にした既存ファイル (silent fork 防止の証拠)
- 再利用した既存資産 (crate / wrapper / helper / component / type alias)
- Verification Ladder で実行した Level 別の PASS / FAIL
- 未実行の検証 (理由と残存リスク、Level 4-5 は dedicated Issue 化を提案)
- 追加した happy path test 一覧
- test-expert に委譲した Issue (異常系 / 境界 / 回帰 / fixture 整理)
- 残存リスク (未検証パス、設計判断保留した箇所)

---

## コミット時の必須記載 (silent fork 防止の構造的担保)

**apply の commit を作る前に `references/tools.md` のコミットテンプレ節を必ず Read する。**
「手本」「再利用した既存資産」が空欄のままの完了報告は不可。

apply 完了時のコミットメッセージは `references/tools.md`「コミットメッセージテンプレ」に従う。
**手本ファイルパスと再利用資産を必須記載することで、silent fork が起きなかったことを構造的に証明する**。

### Fixes / Refs の使い分け

**正本は `~/.claude/skills/_shared/commit-convention.md` §3**
(op-merge gate 19 = `op-core/src/merge/verify.rs::eval_issue_link_gates` の prose 転記)。

- **既定は `Fixes #N`**。
- `Refs #N` は **open かつ `op:staged-refactor` / `op:architecture-debt` ラベル付きの親 Issue** を
  参照する staged PR に限る。通常 PR が `Refs` のみだと gate 19 (`GATE_19_REFS_NOT_STAGED`) で block される。
- 未検証項目 / 委譲がある場合は `Refs` で Issue を開いたままにせず、**委譲先を別 Issue に起票して
  本 PR は `Fixes` で閉じる** (§3-2)。

`手本` 節と `再利用した既存資産` 節が空白だった場合は、apply は完了報告できない (silent fork が起きた可能性が高い)。
完了前に既存資産探索をやり直す。

---

## 実装完了後の code-review invoke

本節の方法論は `~/.claude/skills/_shared/apply-completion-checklist.md` に集約された。
本 expert の固有 skip 条件のみ以下に残す。

skip 条件なし。apply 後は必ず invoke する。

---

## CLAUDE.md 規約との整合

共通骨格 (優先順位 3 段 / 既定値 6 項目 / audit・refute 側での扱い) の正本は
`~/.claude/skills/_shared/project-profile.md` の「対象 repo 規約への準拠 (worker 共通)」節 —
**apply で最初のファイルを編集する前に Read する** (scan では「規約準拠を指摘しない」判断に使う)。

feature-expert 固有の適用差分のみ:

- **ネスト**: ガード節・関数抽出・dispatch table で平坦化する
- **抽象化**: 新規実装でも 1 関数 1 ファイル / interface と implementation の形式的分離をしない
  (Clean Architecture / DDD の導入は指示書に要求がある場合のみ)

---

## 深掘り参照

- scan / patrol 出力契約の完全形 (検出対象・報告ルール / envelope 詳細 / recommendation テンプレ / 強化スキーマ / フィールド要点表 / patrol 追加制約): `~/.claude/skills/expert-feature/references/scan-contract.md`
- silent fork catalog 索引 (検出兆候列) + bulk_group / issue_type / action enum 対応表、および言語別具体例 (Rust / Tauri / Vue / Flutter): `~/.claude/skills/expert-feature/references/silent-fork-patterns.md`
- 既存資産探索のスタック別チェックリスト + grep cookbook: `~/.claude/skills/expert-feature/references/asset-discovery.md`
- 検証コマンド本体 (Verification Ladder スタック別、debug-expert と共有する正本): `~/.claude/skills/expert-debug/references/tools.md`
- 実装順序との対応・silent fork 防止のレイヤーまたぎ整合確認・happy path 雛形・完了報告フォーマット・**コミットメッセージテンプレ** (feature-expert 固有): `~/.claude/skills/expert-feature/references/tools.md`

---

## Direct Expert Run (直接実行時の対話型入口)

共通手順・default テーブル・初回確認テンプレ・禁止事項は
`~/.claude/skills/_shared/invocation-mode.md` を参照。

### 初期モード

feature-expert は **apply は明示許可が必要**。要件が曖昧なら spec-expert 的な確認 (acceptance criteria 整理) を先に行う。

---

## 参照ドキュメント (Single Canonical Source)

| Path | 役割 |
|------|------|
| `skills/_shared/runtime-contract.md` (>=1) | runtime spawn 境界 / apply 可否 / merge-blocking state |
| `skills/_shared/active-expert-registry.md` (>=2) | active / planned 区別、本 expert の runtime 適格性確認 |
| `skills/_shared/markers/labels-and-markers.md` (>=2) | 出力 marker / 受領 label の名前と core semantics |
| `skills/_shared/common-setup.md` (>=2) | Explore 委譲プロトコル (breadth / クエリ数基準) + フォールバック |
| `skills/_shared/apply-completion-checklist.md` | apply Run Mode の完了手順。固有 skip 条件は本 SKILL.md の「## 実装完了後の code-review invoke」節を参照 |
| `skills/_shared/expert-spawn.md` | canonical schema / apply 入力契約 / spawn schema / **Marker Publish Validate 節** |
| `skills/_shared/read-economy.md` (>=1) | Read Economy 原則 (R1〜R5) |
