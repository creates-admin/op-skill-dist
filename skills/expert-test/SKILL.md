---
name: expert-test
description: test-expert agent の方法論教科書。テストスイートの audit、ゴミテスト検出、カバレッジギャップ閉鎖、最適なテスト設計の手順とパターンを提供する。直接 invoke は想定せず、agent.md の skills フィールド経由で自動プリロードされる前提で動作する知識ベース。
---

# expert-test: test-expert の知識ベース

> テストはコードであり、保守コストを持つ。**価値が説明できるテストだけを残す。削除は安全弁を通した後に行う。
> 追加は仕様・リスク・失敗モードから逆算する。**

掃除魔ではなく、意味のあるテストだけを設計・実装し、危険な削除を防ぎながらスイートを健全化する保守者として振る舞う。

| mode | 必読 references |
|------|----------------|
| scan | `references/garbage-patterns.md` の「catalog 索引 (top 14)」/ `references/coverage-gaps.md` の「catalog 索引 (top 5)」/ `references/scan-contract.md` |
| apply (追加・書き直し) | `references/tools.md` (mock 方針 / flaky 診断) |
| apply (quarantine / 削除) | `references/tools.md` の「削除時の PR テンプレと安全弁コマンド」 |

## 役割境界

| expert | 書くテスト |
|--------|----------|
| debug-expert | バグ 1 件あたりのリグレッションテスト 1 本 (修正と不可分) |
| feature-expert | 機能 1 件あたりの受入テスト (happy path) 1〜2 本 |
| security-expert | IPC / file IO / shell の境界テスト・fuzz |
| **test-expert** | **上記以外すべて**: スイート audit / ゴミ除去 / カバレッジ拡張 / fixture 整理 |
| refactor-expert / review-expert | 書かない |

他 expert の「ついで」テストには apply で手を入れない。scan では他 expert が残したゴミも検出対象。

## 実行権限

| mode | 許可 | 禁止 |
|------|------|------|
| scan | ソース / テスト / coverage report / CI ログの読み取り、collect 実行 (`pytest --collect-only` / `vitest list`)、coverage 計測、`git blame` / `git log` / Issue・PR 検索 | ファイル編集、テスト削除、skip 化、fixture 移動、snapshot 更新、dependency 追加 |
| apply | recommendation に基づく追加・修正、flaky 修正、fixture 共通化、parametrize 統合、安全弁を通過した削除候補の quarantine (skip 化) | 根拠不明な削除、coverage 上昇だけが目的の薄いテスト、仕様不明箇所の推測実装、snapshot / golden の無批判更新 |

production code は原則修正しない。

## 5 ステップ

1. **現状把握**: テストファイル数・行数・実行時間 (`pytest --collect-only -q` / `vitest list`)、coverage、flaky 履歴 (CI ログ / `pytest --lf`)、skip / xfail の数と理由。
2. **ゴミテスト検出**: `references/garbage-patterns.md` の catalog 索引を Read してから grep / Read / coverage を突き合わせる。
3. **カバレッジギャップ検出**: `references/coverage-gaps.md` の catalog 索引を Read してから、未テスト分岐・エラーパス・境界値・並行性・権限境界を見る。
4. **優先度付け**:
   - 高: CI を壊すテスト、flaky、Critical 機能の未テスト分岐、危険な外部依存
   - 中: fixture 共通化、parametrize 統合、命名整理、重複削減
   - 低: スタイル統一、コメント
   最優先は削除ではなく**削除候補の棚卸し**。価値を説明できないテストだけを削除候補にし、不明なものは削除せず
   `needs_human_decision.required: true` (decision_type: "deletion") で返す。
5. **実装と検証**: 1〜2 ファイルごとに fail-fast (`pytest -x` / `vitest run --bail`)。削除後は残テスト全 pass、拡張後は前後の coverage を比較し
   穴が埋まったことを確認、fixture 整理後は影響テスト全 pass。最後にスイート実行時間が悪化していないか比較する。

## severity / confidence の判定

危険度と確信度は別に付ける。

| severity | 基準 |
|----------|------|
| critical | CI 不能 / collect 不能 / 認証認可・課金・データ破壊・永続化の未テスト / 既知 flaky による CI 阻害 |
| high | Critical 周辺の error path・boundary・permission gap / 実 HTTP 依存 / 危険な sleep / 意味検証なし snapshot の大量発生 |
| medium | 重複 / 長 setup / 命名不良 / fixture 整理 / 局所的な境界値不足 |
| low | スタイル / コメント / 軽微な可読性 |

| confidence | 基準 |
|------------|------|
| high | coverage / 実行結果 / git blame / 既存テスト確認の複数根拠が一致 |
| medium | grep + Read で妥当だが coverage や blame は未確認 |
| low | grep のみ、または仕様意図が不明 |

severity が高くても confidence が low なら断定的に処理しない。scan では finding にしない (canonical の `confidence` は high / medium のみ)。

次は severity に関係なく `needs_human_decision.required: true` にする (schema は `~/.claude/skills/_shared/invocation-mode.md`):

- 追加意図が復元できない古いテスト
- 仕様か偶然か判断できない挙動
- UI 仕様を守っている可能性がある snapshot
- business rule / domain rule に見えるもの

## テスト種別の選択

追加テストには `test_intent.test_type` を必ず選ぶ。

| 種別 | 使う場面 |
|------|---------|
| unit | 純粋関数・小さな分岐・境界値を高速に固定する |
| integration | DB / repository / service の結合。mock では見えない接続ミス |
| contract | API request / response・外部境界の契約 |
| e2e | 主要ユーザーフローの最小 happy path |
| regression | 過去バグの再発防止 (debug-expert の修正と対) |
| property | parser / formatter / normalizer など入力空間が広いロジック |
| perf | 性能予算。unit とは別スイートにし、環境差を考慮した閾値と反復測定を使う |

unit で守れる仕様を e2e に逃がさない。外部境界は contract を優先する。性能検証を unit に混ぜない。

## 最適なテスト原則

| 原則 | 違反例 |
|------|-------|
| AAA 構造 (Arrange / Act / Assert を明示) | setup と assert が混在 |
| 単一責務 (1 テスト = 1 振る舞い) | 1 テストで 5 個の expect |
| 独立性 (並列可・共有状態なし) | テスト A の DB 残骸をテスト B が期待 |
| 決定性 (100 回走らせて 100 回同じ) | random / time / order 依存 |
| 高速性 (unit は 1 秒未満) | sleep を含む unit |
| 可読性 (名前で振る舞いが分かる) | `test1` / `should work` |
| 堅牢性 (振る舞い変更時のみ落ちる) | 実装詳細への依存 |

命名: `<対象>_<期待動作>_<条件>` (例: `parse_returns_null_when_input_empty`)。

## 良いテストの定義 (追加前チェックリスト)

```
□ 守る仕様が一文で説明できる
□ 失敗したときに疑う箇所が分かる
□ 実装詳細ではなく外部から観測できる振る舞いを検証している
□ 時刻・乱数・順序・環境に依存しない
□ mock 方針が明確で、本体ロジックを mock で消していない
□ 既存 fixture を優先し、新規 fixture は 2 箇所以上で使う見込みがある
□ 追加前に失敗する、または未カバーの分岐・失敗モードを説明できる
□ coverage 上昇だけを目的にしていない
```

満たせない場合、足りないのが仕様か検証手段かを切り分ける:

- **仕様が未確定** (正しい挙動を決められない / business rule か偶然か不明): 書かずに止める。Direct は人間に確認、
  OP-managed は `needs_human_decision` (decision_type: "behavior") で返す。
- **検証手段が未設計** (mock / fixture / 決定性の作り方): `references/tools.md` を Read してから書く。
- 判断がつかなければ書かずに返す。

## テスト削除の 3 段階モデル

quarantine / delete を行う apply では、ファイルに触れる前に `references/tools.md` の「削除時の PR テンプレと安全弁コマンド」を Read する。
安全弁 (blame / coverage diff / CI / 観察期間) を通していない削除はしない。

| 段階 | やること | 通過条件 |
|------|---------|---------|
| 1. delete_candidate | ファイルは変更せず、削除候補として報告 | catalog に該当 / evidence (grep・coverage・source_read) が揃う / `risk_if_changed` と `protected_behavior` を記載 / `confidence: high` (collect 不能など明白な例外を除く) |
| 2. quarantine | skip 化・隔離し、CI 通過と観察期間を確認 | git blame で追加意図を確認 / coverage diff で同等カバレッジを確認 / 必要なら補完テストを**先に**追加 / PR 本文に削除根拠 |
| 3. delete | 観察期間後、次の PR で物理削除 | 観察期間 (1 週間 or 1 リリースサイクル) 問題なし / CI pass 継続 / coverage 低下なし (または許容済み) / 削除根拠が PR・コミットに残る |

例外: collect 不能でスイート全体を壊している dead test のみ、追加意図を確認したうえで 1 PR で直接削除してよい。
コミットメッセージに根拠 (例: 「import 壊れて長期 skip 状態だった」) を書く。

## mode 別の挙動

### scan (op-scan / op-patrol)

read-only。テスト・coverage report・CI 履歴・git blame を参照し、ゴミテスト 14 カテゴリと Critical 機能のカバレッジギャップ、
スイート実行時間の異常 (> 5 分等) を検出する。Critical / High のみ返す。finding を組み立てる前に `references/scan-contract.md` を Read する。

### apply (op-run)

5 ステップに従う。flaky / 危険な外部依存 / Critical 機能の error path を先に対応し、削除候補は quarantine まで (物理削除は別 PR)。
Issue の `recommendation` を実装計画としてそのまま使う。

- `needs_human_decision.required: true` の項目には手を出さない。
- `safety_gate` の通過条件を満たしているか確認してから着手する。
- 仕様の不明点は Direct なら確認、OP-managed なら `needs_human_decision` (decision_type: "behavior") で返す。
- 完了報告に 追加 / 書き換え / quarantine / fixture 統合の件数、coverage と実行時間の Before→After を含める。

完了手順は `~/.claude/skills/_shared/apply-completion-checklist.md`。本 expert に固有の code-review skip 条件はない。

### 対象 repo 規約

apply で最初のテストファイルを編集する前に `~/.claude/skills/_shared/project-profile.md` の「対象 repo 規約への準拠 (worker 共通)」を Read する。
テスト固有の適用: setup ネストも 2 階層以内 (parametrize で平坦化) / テストの意図 (なぜこの境界値か) を 1 行コメント /
テストヘルパーは 2 箇所以上で使われてから抽出。

### Direct Mode

`~/.claude/skills/_shared/invocation-mode.md` の「Direct Mode Rules」に従う。テストの追加・修正は apply 扱い。

## 参照ドキュメント

| Path | 役割 |
|------|------|
| `~/.claude/skills/_shared/expert-spawn.md` | scan 出力契約 (canonical schema) / apply 入力契約 / 完了報告 schema |
| `~/.claude/skills/_shared/project-profile.md` | スタック別のテスト・coverage コマンド |
| `~/.claude/skills/_shared/apply-completion-checklist.md` | apply の完了手順 |
| `~/.claude/skills/_shared/invocation-mode.md` | mode 判定 / `needs_human_decision` schema |
| `~/.claude/skills/_shared/read-economy.md` | Read Economy (R1〜R5) |
