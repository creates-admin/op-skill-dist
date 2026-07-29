# expert-test scan 出力契約 (recommendation / 強化スキーマ / bulk_group)

<!--
機能概要: test-expert が scan モードで finding を返すときの出力契約辞典。
         recommendation の構造化フォーマット (テスト追加 Issue 用)、強化スキーマの
         フル JSON 例、スキーマフィールド要点表、test-expert 固有の bulk_group カテゴリを集約する。
作成意図: SKILL.md 本文は「毎回踏む契約と判断の核」に絞り、mode (scan) でのみ必要な
         schema 完全形をここへ分離する (ADR-0030 決定1 の層別配置基準)。
         scan の判断を apply に完全継承させる「実装計画つき Issue」の実体はここが正本。
注意点: scan で finding の JSON を組み立てる前に必ず Read する。
       canonical 必須フィールドの正本定義は `_shared/expert-spawn.md` 側にある (本ファイルは
       test-expert 固有フィールドと、canonical フィールドの test 文脈での埋め方を規定する)。
       severity / confidence / needs_human_decision の判定基準は SKILL.md 本文が正本。
-->

## scan の責務: 「実装計画つき Issue」を出す

カバレッジギャップ検出 (テスト不足) は「ここに穴がある」だけでなく、
**apply が即実装できる具体計画** を `recommendation` に詰める。
これで context 喪失問題を構造的に防ぐ (scan の判断が apply に完全継承)。

### recommendation の構造化フォーマット (テスト追加 Issue 用)

```markdown
## 追加テスト計画

### 対象
- 関数 / モジュール: `path/to/file.ext::funcName`
- 現状カバレッジ: <line N% / branch M%>

### テスト意図 (なぜこのテストが必要か)
- 守る仕様:
  - <このテストが保証する外部仕様・業務仕様>
- 想定する失敗モード:
  - <このテストが落ちることで検出したいバグ>
- テスト種別:
  - unit / integration / contract / e2e / regression / property / perf のいずれか
- なぜこの層でテストするか:
  - <unit で十分か、integration が必要か、e2e でしか確認できないか>
- mock 方針:
  - mock するもの: <...>
  - mock しないもの: <...>
  - 理由: <...>
- このテストが失敗したときに疑う箇所:
  - <原因候補>

### 追加するテストケース
| # | ケース名 | 入力 | 期待出力 | カバー対象 |
|---|---------|------|---------|----------|
| 1 | empty_input | `[]` | `0` | 境界値 (空) |
| 2 | single_item | `[5]` | `5` | 通常系 |
| 3 | mixed_signs | `[-1, 2, -3]` | `-2` | 符号混在 |
| 4 | overflow_safe | `[MAX_INT]` | `MAX_INT` | 境界値 (最大) |

### 必要な fixture / mock
- 既存 fixture 再利用: `<fixture-name>` (`tests/conftest.py`)
- 新規 fixture: <なし or 名前と内容 / 2 箇所以上で使う見込みがあるか>
- mock 対象: <なし or 対象関数とモック方針>

### 推定規模
- 追加 LoC: 約 N 行
- 追加ファイル: 0 (既存テストファイルに追加) or 1 (新規テストファイル)
- 実行時間影響: <推定 +X ms>

### カバレッジ予測
- Before: line X% / branch Y%
- After: line A% / branch B%
- 注: Critical 機能のみ Critical/High 起票、それ以外は対象外。
       coverage 上昇だけを目的にしたテストは追加しない。
```

### 強化スキーマ (test-expert 共通)

削除系・修正系・追加系すべてで共通して使う schema。
apply agent が迷わず処理できるよう、**severity / confidence / action / safety_gate** を必須とする。

```json
{
  "title": "discount() の else 分岐が未テスト",
  "severity": "high",
  "severity_reason": "請求ロジックの通常価格パス (else 分岐) がカバーされておらず、バグが混入しても自動検出できない。billing 機能に直結するため High。",
  "domain": "test",
  "files": ["src/pricing.ts:42", "tests/pricing.test.ts"],
  "symbols": ["discount"],
  "confidence": "high",
  "issue_type": "coverage_gap",
  "action": "add_test",

  "summary": "premium ユーザー以外の通常価格パスがテストされていない。請求ロジックに直結するため High。",
  "evidence": "discount() の if user.isPremium 側のみ test_discount_premium がカバー、else 側は未到達 (branch coverage で確認)",
  "evidence_grade": "direct",
  "evidence_sources": ["coverage", "source_read", "test_run"],

  "hypothesis": "discount() 追加時に premium ユーザーのテストだけ書かれ、else 分岐のテストが漏れたまま放置された。",
  "excluded_hypotheses": [
    "else 分岐は到達不能: 否定 (通常ユーザーで呼ばれる実装パスが存在する)"
  ],

  "risk_if_ignored": "請求ロジックの通常価格パスにバグが入ってもテストで検出できない",
  "risk_if_changed": "なし (テスト追加のみ、本体変更なし)",
  "protected_behavior": "premium 以外のユーザーは total そのままを返す",

  "test_intent": {
    "spec": "discount(user, total) は user.isPremium=false のとき total を変更しない",
    "failure_mode": "通常ユーザーに対して誤って割引が適用される、または 0 / NaN が返る",
    "test_type": "unit",
    "why_this_layer": "純粋関数。integration や e2e に逃がす理由がなく、unit で十分守れる",
    "mock_policy": {
      "mock": [],
      "do_not_mock": ["discount 本体"],
      "reason": "純粋関数のため mock は不要。mock するとテストが本体を経由しなくなる"
    },
    "failure_suspects": ["discount の条件式の反転", "isPremium プロパティ名の typo"]
  },

  "safety_gate": {
    "requires_blame": false,
    "requires_coverage_diff": false,
    "requires_ci_pass": true,
    "requires_observation_period": false
  },
  "needs_human_decision": {"required": false},

  "scope_in": ["tests/pricing.test.ts"],
  "scope_out": ["src/pricing.ts (実装変更不要)"],
  "verification_steps": [
    "branch coverage が 100% になる",
    "test.each で premium / regular の両方を 1 テストでカバー"
  ],
  "success_criteria": "tests/pricing.test.ts の discount テストが両分岐カバー、coverage.branches >= 100% で discount 関数",
  "gotchas": [
    "既存テストの命名が test_discount_premium のため、追加分は test_discount_regular とする"
  ],

  "recommendation": "## 追加テスト計画\n\n### 対象\n- 関数: src/pricing.ts::discount\n- 現状: line 100% / branch 50%\n\n### テスト意図\n- 守る仕様: isPremium=false のとき total そのまま\n- 失敗モード: 通常ユーザーに誤割引\n- 種別: unit / mock なし\n\n### 追加ケース\n| # | ケース | 入力 | 期待 |\n|---|-------|------|------|\n| 1 | regular | { isPremium: false } | total そのまま |\n\n### fixture\n既存 makeUser を再利用\n\n### 推定: +6 LoC, branch 50% → 100%",

  "bulk_group": null,
  "recommended_runner": "test-expert",
  "post_check_expert": null,
  "blocking": false,
  "blocking_reason": null
}
```

### スキーマフィールド要点

以下は test-expert 固有フィールドと canonical 必須フィールドの一覧。
canonical 必須フィールドの正本定義は `_shared/expert-spawn.md` を参照。

| フィールド | 役割 |
|-----------|------|
| `severity` | 危険度 (critical / high / medium / low) |
| `severity_reason` | **canonical 必須**: Critical / High と判定した根拠 (到達経路・観測可能な被害・影響範囲) |
| `domain` | **canonical 必須**: `test` 固定 |
| `symbols` | **canonical 必須**: テスト対象の関数名 / クラス名 / コンポーネント名 |
| `evidence_grade` | **canonical 必須**: `direct` / `inferred` / `requires_runtime`。`direct` 以外で Critical 不可 |
| `hypothesis` | **canonical 必須**: scan が立てた根本原因仮説 |
| `excluded_hypotheses` | **canonical 推奨**: 検討したが否定した仮説と否定根拠 |
| `recommended_runner` | **canonical 必須**: `test-expert` 固定 |
| `post_check_expert` | **canonical 必須**: 不要なら `null` を明示 (テスト追加のみなら原則 `null`) |
| `blocking` | **canonical 必須**: 新規変更が既存 debt を悪化させる場合 `true`。`blocking_reason` と対 |
| `blocking_reason` | **canonical 必須**: `blocking: false` なら `null`、`true` なら理由を 1 行 |
| `confidence` | 根拠の強さ (high / medium / low) — severity と独立 |
| `issue_type` | `garbage_test` / `coverage_gap` / `flaky` / `fixture_refactor` / `naming` / `performance` |
| `action` | `add_test` / `rewrite_test` / `consolidate_tests` / `mark_skip` / `delete_test` / `needs_human_decision` |
| `evidence_sources` | `grep` / `coverage` / `test_run` / `git_blame` / `ci_log` / `source_read` の組合せ |
| `risk_if_ignored` | 放置した時の被害 |
| `risk_if_changed` | 変更による副作用リスク |
| `protected_behavior` | このテストが守っている仕様 (削除候補で必須) |
| `test_intent` | 守る仕様 / 失敗モード / 種別 / mock 方針 / 失敗時の被疑箇所 |
| `safety_gate` | blame / coverage diff / CI / 観察期間のうち、apply 前に通過すべき関門 |
| `needs_human_decision` | required:true なら apply は手を出さず人間判断を待つ |


---

## bulk_group カテゴリ (test-expert 固有)

| bulk_group | 対象 | 想定 action (3 段階モデル準拠) |
|-----------|------|---------|
| `garbage-skip-untracked` | チケット参照なしの `.skip` / `xit` | delete_candidate (skip 理由追記 or quarantine) |
| `garbage-trivial-snapshot` | snapshot のみで意味検証なし | rewrite_test (振る舞いアサート追加) |
| `garbage-always-pass` | `expect(true).toBe(true)` 等の常時 pass | delete_candidate |
| `garbage-dead-import` | import 壊れて collect 失敗 | delete (例外として 1 PR 削除可) |
| `garbage-flaky-timing` | `sleep(N)` ハードコードで CI flaky | rewrite_test (仮想時計化) |
| `garbage-trivial-getter` | 自明な getter/setter テスト | delete_candidate |
| `coverage-gap-error-path` | 同領域で error path 未テストが集中 | add_test (一括追加) |
| `coverage-gap-boundary` | 境界値テスト未整備 | add_test (parametrize で一括追加) |

5 件以上の同 bulk_group は op-scan がバッチ Issue 化する。
delete_candidate は **3 段階モデル** に従い、いきなり物理削除しない
(通過条件は SKILL.md の「テスト削除の 3 段階モデル」節が正本)。
