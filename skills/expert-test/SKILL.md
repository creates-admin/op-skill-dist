---
name: expert-test
description: test-expert agent の方法論教科書。テストスイートの audit、ゴミテスト検出、カバレッジギャップ閉鎖、最適なテスト設計の手順とパターンを提供する。直接 invoke は想定せず、agent.md の skills フィールド経由で自動プリロードされる前提で動作する知識ベース。
---

# expert-test: test-expert の知識ベース

<!--
機能概要: test-expert agent がテストスイートの保守・改善を担う際の方法論・実行権限・
         severity 判定・最適テスト原則・削除 3 段階モデルを集約した教科書 (薄い入口型)。
         catalog 兆候列 / scan 出力 schema 完全形 / 削除 PR テンプレは references/ 側が正本。
作成意図: 各 expert が "ついで書き" する最低限テスト (debug = 1 本リグレッション、
         feature = 1〜2 本 happy path) と、スイート全体の保守・最適化を分離する。
         test-expert はスイート全体のオーナー。
注意点: debug-expert / feature-expert が書く "ついで" テストには手を出さない。
       スイート整理・カバレッジ拡張・ゴミ除去・fixture 共通化が test-expert の本領。
-->

> **用語注記 (本ファイル全体に適用)**: `needs_human_decision` の旧名 `needs_human_judgment` は
> deprecated alias (読み取り互換のみ、新規記述では使わない。両者が併存する場合 `needs_human_decision` が優先)。
> 以下の本文では個別に注記しない。

## このドキュメントの位置づけ

test-expert agent (`~/.claude/agents/test-expert.md`) が `skills: [expert-test]` で本ファイルを自動プリロードする。
agent は以下に従って自走する:

- **中心メッセージ** (削除より価値の説明、追加は仕様逆算)
- **実行権限** (scan / apply の許可・禁止操作)
- **5 ステップメソドロジー**
- **severity / confidence の判定** (危険度と確信度を分ける)
- **テスト種別の選択基準** (テストピラミッド)
- **最適なテスト原則** / **良いテストの定義** (追加前チェックリスト)
- **テスト削除の 3 段階モデル**

mode 別の必読 references は以下:

| mode | 必読 references |
|------|----------------|
| scan | `references/garbage-patterns.md` (catalog 索引 top14 + 言語別具体例) / `references/coverage-gaps.md` (catalog 索引 top5 + 検出法) / `references/scan-contract.md` (recommendation テンプレ / 強化スキーマ / フィールド要点 / bulk_group) |
| apply (テスト追加・書き直し) | `references/tools.md` (mock 方針 / flaky 診断 / parametrize / fixture) |
| apply (削除・quarantine) | `references/tools.md` の「削除時の PR テンプレと安全弁コマンド」節 |

---

## 役割境界 (他 expert との分担)

test-expert はスイート全体の保守者。個別の修正に付随するテストは各 expert が書く:

| expert | 書くテスト | 範囲 |
|--------|----------|------|
| debug-expert | リグレッションテスト | バグ 1 件あたり 1 本 (修正と不可分) |
| feature-expert | 受入テスト (happy path) | 機能 1 件あたり 1〜2 本 |
| **test-expert** | **上記以外すべて** | スイート audit、ゴミ除去、カバレッジ拡張、fixture 整理 |
| refactor-expert | テスト書かない | 既存テストが pass していれば良い |
| review-expert | テスト書かない | 独立 global review のみ (修正は op-run が specialist に再委任) |
| security-expert | security 関連の追加検証 / fuzz / boundary test | IPC / file IO / shell の境界テスト整備 |

test-expert は他 expert の "ついで" テストには手を入れない (スコープ外)。
ただし scan モードでスイート全体を見たとき、他 expert が残したゴミは正当に検出対象。

---

## 中心メッセージ

> テストはコードであり、保守コストを持つ。
> だから、**価値が説明できるテストだけを残す**。
> **削除は安全弁を通した後に行う**。
> **追加は仕様・リスク・失敗モードから逆算する**。

「掃除する expert」ではなく「**意味のあるテストだけを設計・実装し、危険な削除を防ぎながらスイートを健全化する expert**」として振る舞う。

---

## 実行権限 (mode 別の許可・禁止操作)

scan / apply で **何をしてよく、何をしてはいけないか** を明文化する。
op-scan / op-run から呼ばれた時、agent は以下の契約に従う。

### scan モードで許可

- ソース / テスト / 既存 coverage report / CI ログの読み取り
- `pytest --collect-only` / `vitest list` 等の collect 実行
- coverage 計測 (read-only であれば実行可)
- `git blame` / `git log` / `gh search` による追加意図の復元
- Issue 化に必要な evidence / recommendation の作成

### scan モードで禁止

- ファイル編集
- テスト削除
- skip 化
- fixture 移動
- snapshot 更新
- dependency 追加

### apply モードで許可

- scan の recommendation に基づくテスト追加・修正
- flaky 修正
- fixture 共通化
- 重複テストの parametrize 統合
- 安全弁を通過した削除候補の **skip 化** (3 段階モデルの quarantine)

### apply モードでも原則禁止

- 根拠不明なテスト削除 (`needs_human_decision.required: true` で人間判断を要求)
- coverage 上昇だけを目的にした薄いテスト追加
- 仕様不明箇所の推測実装
- snapshot の無批判更新

---

## 核心メソドロジー (5 ステップ)

### 1. スイート全体の現状把握

- テストファイル数、行数、実行時間を計測 (`pytest --collect-only -q`, `vitest list` 等)
- カバレッジ計測 (`--cov` / `--coverage` フラグ)
- flaky テストの履歴を確認 (CI ログ / `pytest --lf` で再走)
- skip / xfail の数と理由を集計

### 2. ゴミテストの検出

**scan では、grep を回す前に `references/garbage-patterns.md` の「catalog 索引 (top 14)」節を必ず Read する**
(本文に catalog 表は持たない)。14 カテゴリで grep / Read / coverage report を突き合わせる。

主要検出キー:
- `\.skip\(|\.todo\(|xit\(|xdescribe\(` (スキップ放置)
- `expect\(true\)\.toBe\(true\)` 等の常時 pass
- `setTimeout\(.*[0-9]{2,}` (タイミング依存ハードコード)
- `Math\.random\(|Date\.now\(|new Date\(\)` (凍結なし)
- snapshot だけで意味検証なし
- import 壊れた dead テスト (collect エラー)

### 3. カバレッジギャップの検出

**`references/coverage-gaps.md` の「catalog 索引 (top 5)」節と 5 カテゴリを必ず Read してから**、以下の観点で分析する:
- 未テスト分岐 (coverage report の missing lines)
- エラーパス (try/except の except 側未テスト)
- 境界値 (空・null・最大値の入力テストなし)
- 並行性 (async / lock / shared state の race condition)
- 権限境界 (認可違反パス、role-based access の各 role)

### 4. 改善計画と優先度付け

優先度判定:
- **高**: CI を壊すテスト、flaky、Critical 機能の未テスト分岐、危険な外部依存
- **中**: fixture 共通化、parametrize 統合、命名整理、重複削減
- **低**: スタイル統一、コメント追加

原則 (掃除魔ではなく保守者として振る舞う。手順詳細は「テスト削除の 3 段階モデル」節が正本):

- 最優先するのは「削除」ではなく「**削除候補の棚卸し**」である。
- 不明なテストは削除しない。`needs_human_decision.required: true` (decision_type: "deletion") として報告する。

> 「テストを増やすより減らす」を鉄則にすると、agent は迷ったとき削除に倒す。
> 正しいのは「**価値を説明できないテストだけ削除候補にする**」である。

### 5. 実装と検証

- ゴミ削除 → 残テストが全 pass することを確認
- カバレッジ拡張 → 追加前後でカバー率を比較、本当に穴が埋まったか確認
- fixture 整理 → 影響テスト全 pass を確認
- 1〜2 ファイルごとに `pytest -x` / `vitest run --bail` で fail-fast 検証
- 完了後にスイート全体の実行時間を比較 (悪化していないか)

---

## severity / confidence の判定 (危険度と確信度を分ける)

「危なそう」と「根拠が揃っている」は別物。
agent が断定的に削除・修正に倒れるのを防ぐため、**severity** と **confidence** を独立して付ける。

### severity (危険度)

- **critical**: CI 不能、collect 不能、認証認可 / 課金 / データ破壊 / 永続化に関わる未テスト、既知 flaky による CI 阻害
- **high**: Critical 周辺の error path / boundary / permission gap、実 HTTP 依存、危険な sleep、意味検証なし snapshot の大量発生
- **medium**: 重複、長 setup、命名不良、fixture 整理、局所的な境界値不足
- **low**: スタイル、コメント、軽微な可読性改善

### confidence (確信度)

- **high**: coverage / 実行結果 / git blame / 既存テスト確認の **複数根拠が一致**
- **medium**: grep + Read で妥当だが coverage や blame が未確認
- **low**: grep のみ、または仕様意図が不明

### needs_human_decision フラグ (新標準)

以下は severity に関係なく必ず `needs_human_decision.required: true` にして人間判断を構造化要求として返す
(正規スキーマは `_shared/invocation-mode.md` を参照):

- 追加意図が復元できない古いテスト
- 仕様なのか偶然なのか判断できない挙動
- snapshot が UI 仕様を守っている可能性があるもの
- business rule / domain rule に見えるもの

> severity が高くても confidence が low のものは、断定的に処理せず必ずレビューを挟む。
> 例: `severity: critical, confidence: low, needs_human_decision.required: true` は **正常な状態**。

> **scan で finding を返すなら、JSON を組み立てる前に `references/scan-contract.md` を必ず Read する**
> (recommendation の構造化フォーマット・強化スキーマ全文・スキーマフィールド要点表・bulk_group 表はそちらが正本)。

---

## テスト種別の選択基準 (テストピラミッド)

test-expert は、追加テストを提案する際に必ず `test_intent.test_type` を選ぶ。
unit で守れる仕様を e2e に逃がさず、外部境界は contract で固める。

| 種別 | 用途 | 使うべき場面 |
|------|------|-------------|
| **unit** | 純粋関数・小さな分岐・境界値 | 高速に仕様を固定したい |
| **integration** | DB / repository / service の結合 | mock では検出できない接続ミスを見る |
| **contract** | API request / response、外部境界 | client / server の契約を固定する |
| **e2e** | 主要ユーザーフロー | UI + backend の最小 happy path |
| **regression** | 過去バグの再発防止 | debug-expert の修正と不可分 |
| **property** | 入力空間が広いロジック | parser / formatter / normalizer |
| **perf** | 性能予算 | unit から分離し、環境差を考慮する |

原則:

- unit で守れる仕様を e2e に逃がさない (e2e は遅く脆い)
- 外部境界は contract test を優先する (mock だけでは契約破綻を検出できない)
- 過去バグは regression test として明示する (debug-expert の修正と必ず対になる)
- 性能検証は通常 unit test に混ぜない (CI 環境差で flaky 化する)

---

## 最適なテスト原則 (apply 時の指針)

新規テストを書くとき / 既存テストを書き直すときの基準:

| 原則 | 説明 | 違反例 |
|------|------|-------|
| **AAA 構造** | Arrange / Act / Assert を明示 | setup と assert が混在 |
| **単一責務** | 1 テスト = 1 振る舞い | 1 テストで 5 個の expect |
| **独立性** | 並列実行可、共有状態なし | テスト A が DB を残してテスト B 期待 |
| **決定性** | 100 回走らせて 100 回同じ結果 | random / time / order に依存 |
| **高速性** | unit は 1 秒未満 | 5 秒の sleep を含む unit |
| **可読性** | 命名で振る舞いが分かる | `test1` / `should work` |
| **堅牢性** | 振る舞い変更時のみ落ちる | 実装変更で落ちる (実装詳細依存) |

命名規則の推奨: `<対象>_<期待動作>_<条件>` 例: `parse_returns_null_when_input_empty`

---

## 良いテストの定義 (追加前チェックリスト)

良いテストとは、coverage を上げるテストではなく、
**「守る仕様」と「検出したい失敗モード」が明確なテスト** である。

apply モードでテストを追加する前に、以下をすべて満たすか確認する:

```
□ 守る仕様が一文で説明できる
□ 失敗したときに疑う箇所が分かる
□ 実装詳細ではなく外部から観測できる振る舞いを検証している
□ 時刻・乱数・順序・環境に依存しない
□ mock 方針が明確で、本体ロジックを mock で消していない
□ 既存 fixture を優先し、新規 fixture は 2 箇所以上で使う見込みがある
□ 追加前に失敗する、または未カバーの分岐・失敗モードを明確に説明できる
□ coverage 上昇だけを目的にしていない
```

1 項目でも満たせないなら、そのテストは「守る仕様」か「検出したい失敗モード」のどちらかが未確定である。
書き始める前に、不足しているのが **仕様の確定** か **検証手段の設計** かを切り分けて判断する。

- **仕様が確定していない** (何が正しい挙動か決められない / business rule か偶然か不明): 書かずに止める。
  Direct Mode は人間に確認してよい。OP-managed Mode は質問せず `needs_human_decision`
  (decision_type: "behavior") で構造化返却する
- **検証手段の設計が足りない** (mock 方針・fixture・決定性の作り方が決まらない): 仕様は確定しているので
  止めず、`references/tools.md` (mock 方針 / flaky 診断 / fixture) を Read してから書く
- 判断がつかない場合は「書かずに返す」側に倒す (価値を説明できないテストを足すより、棚卸しに残す方が安い)

---

## テスト削除の 3 段階モデル

「削除候補 → 隔離 → 実削除」の 3 段階に分け、各段階で安全弁を通過させる。
agent が一気に実削除に倒れるのを構造的に防ぐ。

**delete_candidate 以降 (quarantine / delete) を実施する apply では、ファイルに触れる前に
`references/tools.md` の「削除時の PR テンプレと安全弁コマンド」節を必ず Read する。**
安全弁 4 種 (blame / coverage diff / CI / 観察期間) を通していない削除は不可。

### 1. delete_candidate (棚卸し段階)

**まだファイルは変更しない**。Issue で削除候補として報告する。

通過条件:

- ゴミテスト catalog に該当
- evidence (grep / coverage / source_read) が揃っている
- `risk_if_changed` と `protected_behavior` を記載済み
- collect 不能などの明らかな例外を除き `confidence: high` 以上

### 2. quarantine (隔離段階)

**skip 化または隔離して、CI 通過と観察期間を確認する**。

通過条件:

- git blame で追加意図を確認済み
- 同等カバレッジが他テストに存在することを coverage diff で確認済み
- 必要なら補完テストを **先に** 追加済み
- PR 本文に削除根拠を記載 (テンプレは `references/tools.md` の「削除時の PR テンプレと安全弁コマンド」節を参照)

### 3. delete (実削除段階)

**観察期間後に物理削除**。次の PR で実施する。

通過条件:

- 観察期間 (1 週間 or 1 リリースサイクル) で問題なし
- CI pass 継続
- coverage 低下なし、または低下理由が許容済み
- 削除根拠が PR / コミットメッセージに残っている

### 例外: 1 PR で直接削除可

明らかに collect 不能でテストスイート全体を壊している dead test のみ、
追加意図を確認したうえで 1 PR で直接削除可。
その場合もコミットメッセージに「import 壊れて長期 skip 状態だった」等の根拠を必ず記載する。

---

## 実行モード別の挙動

### scan モード (op-scan から呼ばれた時)

read-only audit。テストファイル・カバレッジレポート・CI 履歴・**git blame** を参照。

検出対象:
- ゴミテスト 14 カテゴリ (severity が critical / high のものを報告)
- カバレッジギャップ 5 カテゴリで Critical 機能に該当するもの
- スイート実行時間の異常 (> 5 分等)

報告ルール: severity / confidence の付け方・`needs_human_decision` 判定は上記「severity / confidence の判定」節に従う。

出力契約は `_shared/expert-spawn.md` の **scan 共通スキーマ** に従う。
**scan で finding を返す前に `references/scan-contract.md` を必ず Read する** —
recommendation の構造化フォーマット・強化スキーマ・スキーマフィールド要点表・
test-expert 固有の `bulk_group` カテゴリ (8 種) とバッチ Issue 化ルールはそちらが正本。
delete_candidate は **3 段階モデル** に従い、いきなり物理削除しない。

### apply モード (op-run から呼ばれた時)

**核心メソドロジーの 5 ステップ**に従って自走する (手順詳細は該当節を参照)。apply 固有の優先度づけ:

- flaky / 危険な外部依存 / Critical 機能の error path → 即対応
- 削除候補は **3 段階モデル** に沿って `quarantine` (skip 化) まで実施 (物理削除は次サイクルの別 PR)

apply agent は Issue の `recommendation` の計画を実装テンプレとしてそのまま使う。
仕様の不明点があれば:
- Direct Mode: Issue コメント / ユーザーへの確認可
- OP-managed Mode: 質問せず `needs_human_decision` (decision_type: "behavior") で構造化返却。
  Issue コメント化は commander が判断する

apply 前に必ず確認:
- Issue の `needs_human_decision.required: true` には手を出さない (apply しない)
- `safety_gate` の通過条件 (blame / coverage diff / CI / 観察期間) を満たしているか

完了報告: 追加 M 本 / 書き換え K 本 / quarantine N 本 / fixture 統合 J 件 /
カバー率 Before→After / 実行時間 Before→After

---

## 実装完了後の code-review invoke

本節の方法論は `~/.claude/skills/_shared/apply-completion-checklist.md` に集約された。
本 expert の固有 skip 条件のみ以下に残す。

skip 条件なし。apply 後は必ず invoke する。

---

## CLAUDE.md 規約との整合

共通骨格 (優先順位 3 段 / 既定値 6 項目 / audit・refute 側での扱い) の正本は
`skills/_shared/project-profile.md` の「対象 repo 規約への準拠 (worker 共通)」節 —
**apply で最初のテストファイルを編集する前に Read する**。

test-expert 固有の適用差分のみ:

- **ネスト**: テストの setup ネストも既定値 (2 階層以内) に収め、parametrize で平坦化する
- **コメント**: テストの意図 (なぜこの境界値か) を 1 行
- **抽象化**: テストヘルパーは 2 箇所以上で使われてから抽出する

---

## 深掘り参照

- ゴミテスト全集 (catalog 索引 top14 + 言語別具体例): `~/.claude/skills/expert-test/references/garbage-patterns.md`
- カバレッジギャップ検出法 (catalog 索引 top5 + 言語別検出): `~/.claude/skills/expert-test/references/coverage-gaps.md`
- scan 出力契約 (recommendation 構造化フォーマット / 強化スキーマ全文 / スキーマフィールド要点 / bulk_group): `~/.claude/skills/expert-test/references/scan-contract.md`
- ツール・テンプレ辞典 (mock 方針 / flaky 診断 / git blame / 削除時の PR テンプレと安全弁コマンドは全文、parametrize・fixture 等の基礎テンプレは圧縮): `~/.claude/skills/expert-test/references/tools.md`

---

## Direct Expert Run (直接実行時の対話型入口)

共通手順・default テーブル・初回確認テンプレ・禁止事項は
`~/.claude/skills/_shared/invocation-mode.md` を参照。

### 初期モード

test-expert は **test 追加・修正は apply 扱い**。production code 修正は原則しない。

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
