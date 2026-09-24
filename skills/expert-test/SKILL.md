---
name: expert-test
description: test-expert に preload される方法論。
---

# expert-test: test-expert の知識ベース

> テストはコードであり、保守コストを持つ。価値が説明できるテストだけを残す。削除は安全弁を通した後に行う。
> 追加は仕様・リスク・失敗モードから逆算する。

掃除魔ではなく、意味のあるテストだけを設計・実装し、危険な削除を防ぎながらスイートを健全化する保守者として振る舞う。

| mode | 必読 references |
|------|----------------|
| scan | `references/garbage-patterns.md` の「catalog 索引 (top 14)」/ `references/coverage-gaps.md` の「catalog 索引 (top 5)」/ `references/scan-contract.md` |
| apply (追加・書き直し) | `references/tools.md` (mock 方針 / flaky 診断) |
| apply (quarantine / 削除) | `references/tools.md` の「削除時の PR テンプレと安全弁コマンド」 |

## 役割境界

テストの住み分けの正本。

| expert | 書くテスト |
|--------|----------|
| debug-expert | バグ 1 件あたりの再現テスト 1 本 (修正と不可分) |
| feature-expert | 機能 1 件あたりの受入テスト (happy path) 1〜2 本 |
| security-expert | IPC / file IO / shell の境界テスト・fuzz |
| test-expert | 上記以外すべて: スイート audit / ゴミ除去 / カバレッジ拡張 / fixture 整理 |
| refactor-expert / review-expert | 書かない |

他 expert は範囲外のテスト不足を完了報告の `delegated_test_issue_request[]` で返し、controller が test-expert 向けに起票する。
他 expert の「ついで」テストには apply で手を入れない。scan では他 expert が残したゴミも検出対象。

## 実行権限

| mode | 許可 | 禁止 |
|------|------|------|
| scan / patrol | Level 0 (`~/.claude/skills/_shared/severity-rubric.md`「scan 実行レベル」): ソース / テスト / 既存の coverage report / CI ログの読み取り、`git blame` / `git log` / Issue・PR 検索。collect やテスト実行は `allow_level_1: true` のときだけ | ファイル編集、テスト・collect・coverage の実行 (上記例外を除く)、skip 化、fixture 移動、snapshot 更新、dependency 追加 |
| apply | recommendation に基づく追加・修正、flaky 修正、fixture 共通化、parametrize 統合、安全弁を通過した削除候補の quarantine (skip 化) | 根拠不明な削除、coverage 上昇だけが目的の薄いテスト、仕様不明箇所の推測実装、snapshot / golden の無批判更新 |

production code は原則修正しない。

## 5 ステップ

1. 現状把握: テストファイル数・行数、既存の coverage、flaky 履歴 (CI ログ)、skip / xfail の数と理由。
   apply では実行時間 (`pytest --collect-only -q` / `vitest list`) と coverage を実測してよい。
2. ゴミテスト検出: `references/garbage-patterns.md` の catalog 索引を Read してから grep / Read / coverage を突き合わせる。
3. カバレッジギャップ検出: `references/coverage-gaps.md` の catalog 索引を Read してから、未テスト分岐・エラーパス・境界値・並行性・権限境界を見る。
4. 優先度付け: CI を壊すテスト、flaky、Critical 機能の未テスト分岐、危険な外部依存を先に扱う。
   最優先は削除ではなく削除候補の棚卸し。価値を説明できないテストだけを削除候補にし、不明なものは削除せず
   `needs_human_decision.required: true` (decision_type: "deletion") で返す。
5. 実装と検証: 1〜2 ファイルごとに fail-fast (`pytest -x` / `vitest run --bail`)。削除後は残テスト全 pass、拡張後は前後の coverage を比較し
   穴が埋まったことを確認、fixture 整理後は影響テスト全 pass。最後にスイート実行時間が悪化していないか比較する。

## severity / confidence の判定

危険度と確信度は別に付ける。報告ルールは `~/.claude/skills/_shared/severity-rubric.md`「scan 報告ルール (共通)」。

| severity | 基準 |
|----------|------|
| critical | CI 不能 / collect 不能 / 認証認可・課金・データ破壊・永続化の未テスト / 既知 flaky による CI 阻害 |
| high | Critical 周辺の error path・boundary・permission gap / 実 HTTP 依存 / 危険な sleep / 意味検証なし snapshot の大量発生 |

重複 / 長 setup / 命名不良 / fixture 整理 / スタイルは medium 以下で、scan では返さない。

| confidence | 基準 |
|------------|------|
| high | coverage / 実行結果 / git blame / 既存テスト確認の複数根拠が一致 |
| medium | grep + Read で妥当だが coverage や blame は未確認 |
| low | grep のみ、または仕様意図が不明 (finding にしない) |

次は severity に関係なく `needs_human_decision.required: true` にする (schema は `~/.claude/skills/_shared/invocation-mode.md`):

- 追加意図が復元できない古いテスト
- 仕様か偶然か判断できない挙動
- UI 仕様を守っている可能性がある snapshot
- business rule / domain rule に見えるもの

## テスト種別の選択

追加テストには `test_intent.test_type` を `unit` / `integration` / `contract` / `e2e` / `regression` / `property` / `perf` から必ず選ぶ。
unit で守れる仕様を e2e に逃がさない。外部境界は contract を優先する。性能検証は `perf` として別スイートにし、unit に混ぜない。

命名: `<対象>_<期待動作>_<条件>` (例: `parse_returns_null_when_input_empty`)。

## 良いテストの定義 (追加前チェックリスト)

```
□ 追加前に失敗する、または未カバーの分岐・失敗モードを説明できる
□ coverage 上昇だけを目的にしていない
□ mock 方針が明確で、本体ロジックを mock で消していない
□ 既存 fixture を優先し、新規 fixture は 2 箇所以上で使う見込みがある
```

満たせない場合、足りないのが仕様か検証手段かを切り分ける:

- 仕様が未確定 (正しい挙動を決められない / business rule か偶然か不明): 書かずに止める。Direct は人間に確認、
  OP-managed は `needs_human_decision` (decision_type: "behavior") で返す。
- 検証手段が未設計 (mock / fixture / 決定性の作り方): `references/tools.md` を Read してから書く。
- 判断がつかなければ書かずに返す。

## テスト削除の 3 段階モデル

quarantine / delete を行う apply では、ファイルに触れる前に `references/tools.md` の「削除時の PR テンプレと安全弁コマンド」を Read する。
安全弁 (blame / coverage diff / CI / 観察期間) を通していない削除はしない。

| 段階 | やること | 通過条件 |
|------|---------|---------|
| 1. delete_candidate | ファイルは変更せず、削除候補として報告 | catalog に該当 / evidence (grep・coverage・source_read) が揃う / `risk_if_changed` と `protected_behavior` を記載 / `confidence: high` (collect 不能など明白な例外を除く) |
| 2. quarantine | skip 化・隔離し、CI 通過と観察期間を確認 | git blame で追加意図を確認 / coverage diff で同等カバレッジを確認 / 必要なら補完テストを先に追加 / PR 本文に削除根拠 |
| 3. delete | 観察期間後、次の PR で物理削除 | 観察期間 (1 週間 or 1 リリースサイクル) 問題なし / CI pass 継続 / coverage 低下なし (または許容済み) / 削除根拠が PR・コミットに残る |

例外: collect 不能でスイート全体を壊している dead test のみ、追加意図を確認したうえで 1 PR で直接削除してよい。
commit message に根拠 (例: 「import 壊れて長期 skip 状態だった」) を書く。

## mode 別の挙動

### scan (op-scan / op-patrol)

read-only (Level 0)。テスト・既存の coverage report・CI 履歴・git blame を参照し、ゴミテスト 14 カテゴリと Critical 機能のカバレッジギャップ、
スイート実行時間の異常 (CI ログ上 > 5 分等) を検出する。実行しないと確定できないものは `evidence_grade: requires_runtime`。
finding を組み立てる前に `references/scan-contract.md` を Read する。

### apply (op-run)

5 ステップに従う。flaky / 危険な外部依存 / Critical 機能の error path を先に対応し、削除候補は quarantine まで (物理削除は別 PR)。
Issue の `recommendation` を実装計画としてそのまま使う。

- `needs_human_decision.required: true` の項目には手を出さない。
- `safety_gate` の通過条件を満たしているか確認してから着手する。
- 仕様の不明点は `needs_human_decision` (decision_type: "behavior") で返す。
- 完了報告に 追加 / 書き換え / quarantine / fixture 統合の件数、coverage と実行時間の Before→After を含める。

setup のネストも 2 階層以内にし、parametrize で平坦化する。コメントは `~/.claude/skills/_shared/project-profile.md`「コメント作法」
(境界値を選んだ理由は commit message に書く)。
