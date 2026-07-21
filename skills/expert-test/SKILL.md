---
name: expert-test
description: test-expert agent の方法論教科書。テストスイートの audit、ゴミテスト検出、カバレッジギャップ閉鎖、最適なテスト設計の手順とパターンを提供する。直接 invoke は想定せず、agent.md の skills フィールド経由で自動プリロードされる前提で動作する知識ベース。
---

# expert-test: test-expert の知識ベース

<!--
機能概要: test-expert agent がテストスイートの保守・改善を担う際に
         参照する方法論・ゴミテスト catalog・最適テスト原則を集約した教科書。
作成意図: 各 expert が "ついで書き" する最低限テスト (debug = 1 本リグレッション、
         feature = 1〜2 本 happy path) と、スイート全体の保守・最適化を分離する。
         test-expert はスイート全体のオーナー。
注意点: debug-expert / feature-expert が書く "ついで" テストには手を出さない。
       スイート整理・カバレッジ拡張・ゴミ除去・fixture 共通化が test-expert の本領。
-->

## このドキュメントの位置づけ

test-expert agent (`~/.claude/agents/test-expert.md`) が `skills: [expert-test]` で本ファイルを自動プリロードする。
agent は以下に従って自走する:

- **中心メッセージ** (削除より価値の説明、追加は仕様逆算)
- **実行権限** (scan / apply の許可・禁止操作)
- **5 ステップメソドロジー**
- **severity / confidence の判定** (危険度と確信度を分ける)
- **ゴミテスト catalog** / **カバレッジギャップ catalog**
- **テスト種別の選択基準** (テストピラミッド)
- **最適なテスト原則** / **良いテストの定義** (追加前チェックリスト)
- **テスト削除の 3 段階モデル**

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

- 根拠不明なテスト削除 (`needs_human_decision.required: true` で人間判断を要求。旧 `needs_human_judgment: true` は deprecated alias、互換目的のみ)
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

`references/garbage-patterns.md` の 14 カテゴリで grep / Read / coverage report を突き合わせる。

主要検出キー:
- `\.skip\(|\.todo\(|xit\(|xdescribe\(` (スキップ放置)
- `expect\(true\)\.toBe\(true\)` 等の常時 pass
- `setTimeout\(.*[0-9]{2,}` (タイミング依存ハードコード)
- `Math\.random\(|Date\.now\(|new Date\(\)` (凍結なし)
- snapshot だけで意味検証なし
- import 壊れた dead テスト (collect エラー)

### 3. カバレッジギャップの検出

`references/coverage-gaps.md` の 5 カテゴリで分析:
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

原則 (掃除魔ではなく保守者として振る舞う):

- 最優先するのは「削除」ではなく「**削除候補の棚卸し**」である。
- 実削除は、git blame / 同等カバレッジ確認 / CI 確認 / 段階的 skip 化を通過したものだけに限定する。
- 不明なテストは削除しない。`needs_human_decision.required: true` (decision_type: "deletion") として報告する (旧 `needs_human_judgment: true` は deprecated alias)。
- 明らかに collect 不能な dead test のみ、根拠明記のうえ直接削除を許可する。

> 「テストを増やすより減らす」を鉄則にすると、agent は迷ったとき削除に倒す。
> 正しいのは「**価値を説明できないテストだけ削除候補にする**」である。

### 5. 実装と検証

- ゴミ削除 → 残テストが全 pass することを確認
- カバレッジ拡張 → 追加前後でカバー率を比較、本当に穴が埋まったか確認
- fixture 整理 → 影響テスト全 pass を確認
- 1〜2 ファイルごとに `pytest -x` / `vitest run --bail` で fail-fast 検証
- 完了後にスイート全体の実行時間を比較 (悪化していないか)

---

## ゴミテスト catalog (top 14)

scan モードで検出する主要パターン。詳細は `references/garbage-patterns.md`。

| # | カテゴリ | 検出兆候 |
|---|---------|---------|
| 1 | 死んだテスト | import エラーで collect 失敗、削除されたコードを参照 |
| 2 | 重複カバレッジ | 同じ関数を 3 回以上テスト、parametrize で統合可能 |
| 3 | 自明なテスト | getter/setter の値返し、フレームワーク機能テスト |
| 4 | 実装詳細依存 | private メソッド直テスト、内部フィールド検証 |
| 5 | 脆弱セレクタ | 深い CSS / XPath、絶対座標、index ベース選択 |
| 6 | 非決定的 | `Date.now()` / `Math.random()` 凍結なし、order-dependent |
| 7 | 環境依存 | 実 HTTP 呼び出し、`/tmp` 書込放置、locale 依存 |
| 8 | モック過多 | 全部 mock で本体コード未経由 |
| 9 | アサーション弱 | snapshot のみ、意味検証なし、常時 true |
| 10 | 放置スキップ | `.skip` / `xit` がチケット参照なし |
| 11 | 長 setup / 短 assert | fixture 30 行 + assert 1 行 |
| 12 | 命名不良 | `test1`, `it('works')`, 振る舞い説明なし |
| 13 | タイミング依存 | `sleep(100)` ハードコード、CI で flaky |
| 14 | TODO 放置 | `TODO: implement` のまま skip |

---

## カバレッジギャップ catalog (top 5)

| # | ギャップ | 検出方法 |
|---|---------|---------|
| 1 | 未テスト分岐 | coverage report の missing lines、`if` の片側のみテスト |
| 2 | エラーパス未検証 | `try` 内の正常系のみテスト、`except`/`catch` 側未到達 |
| 3 | 境界値未テスト | 空配列・null・最大値・1 件・0 件の入力テスト不在 |
| 4 | 並行性未テスト | async / lock / shared state の race condition 検証なし |
| 5 | 権限境界未テスト | 認可違反パス未テスト、role 別の各 role 未網羅 |

詳細・言語別検出方法は `references/coverage-gaps.md`。

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
>
> **互換性**: 旧 `needs_human_judgment: true` フィールドは deprecated alias として読み取り互換のみ維持。
> 新規記述では `needs_human_decision` を使う。両者が併存する場合 `needs_human_decision` が優先。

---

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
| `action` | `add_test` / `rewrite_test` / `consolidate_tests` / `mark_skip` / `delete_test` / `needs_human_decision` (旧 `needs_human_judgment` は deprecated alias) |
| `evidence_sources` | `grep` / `coverage` / `test_run` / `git_blame` / `ci_log` / `source_read` の組合せ |
| `risk_if_ignored` | 放置した時の被害 |
| `risk_if_changed` | 変更による副作用リスク |
| `protected_behavior` | このテストが守っている仕様 (削除候補で必須) |
| `test_intent` | 守る仕様 / 失敗モード / 種別 / mock 方針 / 失敗時の被疑箇所 |
| `safety_gate` | blame / coverage diff / CI / 観察期間のうち、apply 前に通過すべき関門 |
| `needs_human_decision` | required:true なら apply は手を出さず人間判断を待つ (旧 `needs_human_judgment: true` は deprecated alias) |

apply agent は `recommendation` の計画を実装テンプレとしてそのまま使う。
仕様の不明点があれば:
- Direct Mode: Issue コメント / ユーザーへの確認可
- OP-managed Mode: 質問せず `needs_human_decision` (decision_type: "behavior") で構造化返却。
  Issue コメント化は commander が判断する

`needs_human_decision.required: true` (または旧 `needs_human_judgment: true` deprecated alias) の Issue には apply しない。

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

1 項目でも満たせない場合は、テストを書く前に Issue にコメントして仕様を確認する。

---

## テスト削除の 3 段階モデル

「削除候補 → 隔離 → 実削除」の 3 段階に分け、各段階で安全弁を通過させる。
agent が一気に実削除に倒れるのを構造的に防ぐ。

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
- PR 本文に削除根拠 (追加コミット / 意図 / 価値喪失理由 / 同等カバレッジ) を記載

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
- 上記 14 カテゴリのゴミテスト (severity が critical / high のものを報告)
- 上記 5 カテゴリのカバレッジギャップで Critical 機能に該当するもの
- スイート実行時間の異常 (> 5 分等)

報告ルール:
- すべての Issue に `severity` と `confidence` を必ず付ける
- `confidence: low` のものは断定せず `needs_human_decision.required: true` を検討 (旧 `needs_human_judgment` は deprecated alias)
- `severity: critical, confidence: low` は **正常な状態** (人間判断要求として返す)

出力契約は `_shared/expert-spawn.md` の **scan 共通スキーマ** に従う。
test-expert 固有の `bulk_group` カテゴリ:

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
delete_candidate は **3 段階モデル** に従い、いきなり物理削除しない。

### apply モード (op-run から呼ばれた時)

5 ステップメソドロジーに従って自走:

1. 現状把握 (collect / coverage 計測)
2. ゴミ検出と **削除候補リスト** 作成 (実削除しない)
3. カバレッジギャップ特定 (Critical 機能の未テスト失敗モードを優先)
4. 優先度付けして実装:
   - flaky / 危険な外部依存 / Critical 機能の error path → 即対応
   - 削除候補は **3 段階モデル** に沿って `quarantine` (skip 化) まで実施
   - 物理削除は次サイクルの別 PR
5. スイート全体検証 (全 pass + 実行時間悪化なし + coverage 低下なし)

apply 前に必ず確認:
- Issue の `needs_human_decision.required: true` (または旧 `needs_human_judgment: true` deprecated alias) には手を出さない
- `safety_gate` の通過条件 (blame / coverage diff / CI / 観察期間) を満たしているか

完了報告: 追加 M 本 / 書き換え K 本 / quarantine N 本 / fixture 統合 J 件 /
カバー率 Before→After / 実行時間 Before→After

---

## 削除時の PR テンプレと安全弁コマンド

**3 段階モデル** が思想で、本章はその実装。
quarantine / delete を実施する PR で必ず以下を残す。

### 削除根拠テンプレ (PR 本文 / コミットメッセージ)

```
## 削除根拠
- 追加コミット: <sha> (<日付>, <作者>)
- 追加意図 (Issue/PR から復元): <要約>
- 現状の評価: <なぜ価値喪失したか>
- 同等カバレッジ: <他テストの参照、なければ「補完テスト追加済」>
- 観察期間: <skip 化からの経過、問題発生有無>
- safety_gate 通過記録:
  - blame: ✓ <sha>
  - coverage_diff: ✓ <他テストでカバー>
  - ci_pass: ✓ <runId>
  - observation_period: ✓ <YYYY-MM-DD ~ YYYY-MM-DD>
```

### 安全弁コマンド (apply 前に実施)

```bash
# 1. テスト追加コミットの確認 (blame)
git blame tests/path/to/file.test.ts

# 2. テストブロック追加コミットの特定
git log --diff-filter=A --pretty=format:"%H %s" -- tests/path/to/file.test.ts | head -5

# 3. 同等カバレッジ確認 (coverage diff)
# 対象テストを skip 化 → 再計測 → カバレッジ低下があれば独自カバーあり

# 4. Issue / PR から context 復元
gh search issues "tests/path/to/file" --state=all
gh search prs "tests/path/to/file" --state=all
```

これで「context 喪失で勝手に削除した」事故を構造的に防ぐ。
不明なまま削除に進むくらいなら `needs_human_decision.required: true` (decision_type: "deletion") で
構造化された人間判断要求として返す (旧 `needs_human_judgment: true` は deprecated alias)。

---

## 実装完了後の code-review invoke

本節の方法論は `~/.claude/skills/_shared/apply-completion-checklist.md` に集約された。
本 expert の固有 skip 条件のみ以下に残す。

skip 条件なし。apply 後は必ず invoke する。

---

## CLAUDE.md 規約との整合

- **ネスト 2 階層以内**: テストの setup ネストも 2 段以内、parametrize で平坦化
- **日本語コメント**: テストの意図 (なぜこの境界値か) を 1 行コメント
- **過剰抽象化禁止**: テストヘルパーは 2 箇所以上で使われてから抽出

---

## 深掘り参照

- ゴミテスト全集 (言語別具体例): `~/.claude/skills/expert-test/references/garbage-patterns.md`
- カバレッジギャップ検出法: `~/.claude/skills/expert-test/references/coverage-gaps.md`
- ツール・テンプレ辞典: `~/.claude/skills/expert-test/references/tools.md`

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
