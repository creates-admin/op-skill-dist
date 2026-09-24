# ツール・テンプレ辞典

環境にツールがなければ導入を提案するに留める (インストールを強制しない)。

## カバレッジ計測

主要スタック (Rust / Vue・TS / Flutter) のコマンドは `~/.claude/skills/_shared/project-profile.md`。それ以外:

| 言語 | コマンド |
|------|---------|
| Python | `pytest --cov=src --cov-branch --cov-report=term-missing` (未導入なら `pytest-cov` を提案) |
| TS (jest) | `jest --coverage` |
| Go | `go test -cover ./...` |

## parametrize / fixture

- 入力違いの繰り返しは 1 本に畳む: Python `@pytest.mark.parametrize` (`pytest.param(..., id=...)`)、TS `test.each`、Rust `rstest` の `#[case::name(...)]`。
- 共有セットアップは fixture 化してテスト本体を薄く保つ: Python `@pytest.fixture` (yield で teardown、高コストなものは `scope` で共有)、TS `beforeEach` / `afterEach`。

## mock 方針

mock を書く前に、何を mock するかを決める。

| mock してよい | mock してはいけない |
|--------------|-------------------|
| 外部 HTTP / ネットワーク | テスト対象の主要ロジック本体 |
| メール / SMS / Push | validation / authorization の本体 |
| 決済 API | domain rule / business rule |
| 時刻 / 乱数 | repository と service を同時に mock して本体経由が消える構成 |
| OS / FS の危険操作 | |
| 高コストな外部サービス (LLM API / 画像処理) | |

次のどれかに当たれば使い方を見直す:

- テストが振る舞いではなく「呼び出し順の写経」になっている
- mock なしの integration / contract test が別に存在しない
- mock のせいで失敗モード (認可漏れ・契約破綻) を見逃している
- mock が 5 個以上でテスト本体が読めない

`test_intent.mock_policy` に mock するもの / しないもの / 理由を書く。

実装: Python は `unittest.mock` / `monkeypatch.setattr`、TS (vitest) は `vi.fn()` / `vi.mock(...)`。外部 HTTP は TS なら `msw`
(request / response の形まで検証できる)。

## 時刻 / 乱数の凍結

flaky の主因。Python は `pytest-freezegun` (`freezer.move_to(...)`)、TS (vitest) は `vi.useFakeTimers()` + `vi.setSystemTime(...)` +
`vi.advanceTimersByTime(...)`。乱数は seed 固定か `monkeypatch` で差し替える。

## 環境変数の隔離

Python は `monkeypatch.setenv(...)`、TS (vitest) は `vi.stubEnv(...)` / `vi.unstubAllEnvs()`。他テストへ漏らさない。

## flaky 診断

```bash
pytest tests/ --lf   # 前回失敗分のみ
for i in {1..10}; do pytest tests/ -x || echo "FAIL on iteration $i"; done
for i in {1..10}; do npx vitest run --bail || echo "FAIL on iter $i"; done
```

疑う順: 時刻・乱数・順序依存 → 環境依存 (`/tmp` / `process.env` / 実 HTTP) → テスト間のリソース競合。
直せないなら skip 化 + Issue 起票 (理由とチケット参照のない skip にしない)。

## 削除時の PR テンプレと安全弁コマンド

SKILL.md の「テスト削除の 3 段階モデル」の実装。quarantine / delete の PR で必ず残す。

### 安全弁コマンド (apply 前)

```bash
git blame tests/path/to/file.test.ts                                              # 追加コミット
git log --diff-filter=A --pretty=format:"%H %s" -- tests/path/to/file.test.ts | head -5
git log -p src/path/to/file.ts | head -50                                         # 対象コードの最終変更
gh search issues "tests/path/to/file" --state=all                                 # 追加意図の復元
gh search prs "tests/path/to/file" --state=all
```

同等カバレッジは、対象テストを skip 化して coverage を再計測し、低下がないことで確認する。
追加意図が分からなければ削除せず、`needs_human_decision.required: true` (decision_type: "deletion") で返す。

### 削除根拠テンプレ (PR 本文 / コミットメッセージ)

```
## 削除根拠
- 追加コミット: <sha> (<日付>, <作者>)
- 追加意図 (Issue/PR から復元): <要約>
- 現状の評価: <なぜ価値を失ったか>
- 同等カバレッジ: <他テストの参照、なければ「補完テスト追加済」>
- 観察期間: <skip 化からの経過、問題の有無>
- safety_gate 通過記録:
  - blame: ✓ <sha>
  - coverage_diff: ✓ <他テストでカバー>
  - ci_pass: ✓ <runId>
  - observation_period: ✓ <YYYY-MM-DD ~ YYYY-MM-DD>
```
