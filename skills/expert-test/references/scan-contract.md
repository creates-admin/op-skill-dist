# scan 出力契約 (test-expert)

envelope・canonical 必須フィールドは `~/.claude/skills/_shared/expert-spawn.md` の「scan 出力契約 (canonical schema)」が正本。
本ファイルは test-expert の拡張フィールドと、canonical フィールドの test 文脈での埋め方を定める。

## scan の責務: 実装計画つき Issue

「ここに穴がある」だけでなく、apply がそのまま実装できる計画を `recommendation.steps` に入れる。テスト追加なら steps に次を含める:

- 対象 (`path::func`) と現状 coverage (line / branch)
- 追加ケース (ケース名 / 入力 / 期待出力 / カバー対象)
- 再利用する fixture・新規 fixture (2 箇所以上で使う見込み)・mock 対象
- 推定規模 (追加 LoC / ファイル / 実行時間影響) と coverage 予測 (Before → After)

coverage 上昇だけを目的にしたテストは計画しない。

## canonical フィールドの埋め方

| フィールド | test-expert での値 |
|-----------|------------------|
| `severity` | critical / high のみ返す (基準は SKILL.md「severity / confidence の判定」) |
| `domain` | `test` |
| `symbols` | テスト対象の関数 / クラス / コンポーネント名 |
| `confidence` | high / medium。low は finding にしない |
| `recommendation.type` | `test` (調査が要るなら `investigation`) |
| `recommended_runner` | `test-expert` |
| `post_check_expert` | テスト追加のみなら `null` |
| `blocking` / `blocking_reason` | 新規変更が既存 debt を悪化させるとき `true` + 理由 |

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

## 例

```json
{
  "title": "discount() の else 分岐が未テスト",
  "severity": "high",
  "severity_reason": "請求ロジックの通常価格パスが未カバーで、バグが入っても自動検出できない",
  "domain": "test",
  "files": ["src/pricing.ts:42", "tests/pricing.test.ts"],
  "symbols": ["discount"],
  "summary": "premium 以外のユーザーの通常価格パスがテストされていない。",
  "evidence": "if (user.isPremium) 側のみ test_discount_premium がカバー、else は branch coverage で未到達",
  "evidence_grade": "direct",
  "hypothesis": "追加時に premium のテストだけ書かれ else 分岐が漏れた",
  "excluded_hypotheses": ["else は到達不能: 否定 (通常ユーザーで呼ばれる)"],
  "scope_in": ["tests/pricing.test.ts"],
  "scope_out": ["src/pricing.ts (実装変更不要)"],
  "recommendation": {
    "type": "test",
    "steps": [
      "対象 src/pricing.ts::discount (line 100% / branch 50%)",
      "test.each で premium / regular の 2 ケース (regular: {isPremium:false}, 100 → 100)",
      "既存 makeUser fixture を再利用、mock なし",
      "推定 +6 LoC、branch 50% → 100%"
    ]
  },
  "verification_steps": ["discount の branch coverage が 100%"],
  "success_criteria": ["premium / regular の両分岐がテストされる"],
  "gotchas": ["既存命名に合わせ test_discount_regular とする"],
  "bulk_group": null,
  "confidence": "high",
  "requires_dynamic_verification": false,
  "recommended_runner": "test-expert",
  "post_check_expert": null,
  "blocking": false,
  "blocking_reason": null,

  "issue_type": "coverage_gap",
  "action": "add_test",
  "evidence_sources": ["coverage", "source_read"],
  "risk_if_ignored": "通常価格パスのバグを検出できない",
  "risk_if_changed": "なし (テスト追加のみ)",
  "protected_behavior": "premium 以外は total をそのまま返す",
  "test_intent": {
    "spec": "isPremium=false のとき total を変更しない",
    "failure_mode": "通常ユーザーへの誤割引、0 / NaN の返却",
    "test_type": "unit",
    "why_this_layer": "純粋関数で unit で十分",
    "mock_policy": {"mock": [], "do_not_mock": ["discount 本体"], "reason": "純粋関数のため不要"},
    "failure_suspects": ["条件式の反転", "isPremium の typo"]
  },
  "safety_gate": {"requires_blame": false, "requires_coverage_diff": false, "requires_ci_pass": true, "requires_observation_period": false},
  "needs_human_decision": {"required": false}
}
```

## bulk_group カテゴリ (test-expert 固有)

同じ bulk_group が 5 件以上なら op-scan がバッチ Issue にする。delete_candidate は 3 段階モデルに従う。

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
