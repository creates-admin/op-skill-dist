# scan 出力契約 (test-expert)

envelope・canonical 必須フィールドは `~/.claude/skills/_shared/expert-report-schemas.md` の「scan 出力契約 (canonical schema)」が正本。
本ファイルは test-expert の拡張フィールドと、canonical フィールドの test 文脈での埋め方を定める。

## scan の責務: 実装計画つき Issue

「ここに穴がある」だけでなく、apply がそのまま実装できる計画を `recommendation.steps` に入れる。テスト追加なら steps に次を含める:

- 対象 (`path::func`) と現状 coverage (line / branch)
- 追加ケース (ケース名 / 入力 / 期待出力 / カバー対象)
- 再利用する fixture・新規 fixture (2 箇所以上で使う見込み)・mock 対象
- 推定規模 (追加 LoC / ファイル / 実行時間影響) と coverage 予測 (Before → After)

coverage 上昇だけを目的にしたテストは計画しない。

## canonical フィールドの埋め方

`domain: "test"` / `recommended_runner: "test-expert"` / `post_check_expert` はテスト追加のみなら `null` / `recommendation.type` は `test` (調査が要るなら `investigation`) /
`symbols` はテスト対象の関数・クラス・コンポーネント名。severity の基準は下の「severity / confidence の判定」。

## 拡張フィールド

| フィールド | 役割 |
|-----------|------|
| `issue_type` | `garbage_test` / `coverage_gap` / `flaky` / `fixture_refactor` / `naming` / `performance` |
| `action` | `add_test` / `rewrite_test` / `consolidate_tests` / `mark_skip` / `delete_test` / `needs_human_decision` |
| `evidence_sources` | `grep` / `coverage` / `test_run` / `git_blame` / `ci_log` / `source_read` の組合せ |
| `risk_if_ignored` / `risk_if_changed` | 放置時の被害 / 変更の副作用 |
| `protected_behavior` | このテストが守る仕様 (削除候補で必須) |
| `test_intent` | `spec` / `failure_mode` / `test_type` / `why_this_layer` / `mock_policy` / `failure_suspects` |
| `safety_gate` | apply 前に通すべき関門 (`requires_blame` / `requires_coverage_diff` / `requires_ci_pass` / `requires_observation_period`) |
| `needs_human_decision` | `required: true` なら apply は手を出さない |

## bulk_group カテゴリ (test-expert 固有)

delete_candidate は 3 段階モデルに従う。

| bulk_group | 対象 | 想定 action |
|-----------|------|------------|
| `garbage-skip-untracked` | チケット参照なしの `.skip` / `xit` | delete_candidate (skip 理由追記 or quarantine) |
| `garbage-trivial-snapshot` | 意味検証なしの snapshot | rewrite_test |
| `garbage-always-pass` | `expect(true).toBe(true)` 等 | delete_candidate |
| `garbage-dead-import` | import 壊れて collect 失敗 | delete (1 PR 削除可の例外) |
| `garbage-flaky-timing` | `sleep(N)` ハードコード | rewrite_test (仮想時計化) |
| `garbage-trivial-getter` | 自明な getter / setter | delete_candidate |
| `coverage-gap-error-path` | 同領域の error path 未テスト集中 | add_test |
| `coverage-gap-boundary` | 境界値テスト未整備 | add_test (parametrize) |
| `coverage-gap-permission` | 権限境界の未網羅 role | add_test (parametrize) |

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
