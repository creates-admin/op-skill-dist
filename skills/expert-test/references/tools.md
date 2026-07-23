# expert-test ツール・テンプレ辞典

<!--
機能概要: テストランナー / カバレッジ / parametrize / fixture / mock の言語別最小テンプレ集
作成意図: agent が "どう書くか" で迷ったときの参照辞典。実用最小形のみ
注意点: 環境にツールがない場合は提案 (インストール強制はしない)
       2026-07-23 の重複解消編集で、他 tools.md (expert-debug / expert-feature) と
       重複していた基礎テンプレ節 (カバレッジ / parametrize / fixture / 時刻凍結 /
       env 隔離) は節名 + 要点 1〜2 行に圧縮した (削除はしていない)。
       test-expert 固有価値 (mock 方針判断・flaky 診断・git blame によるゴミテスト判定)
       は圧縮せず全文残す。
-->

---

## カバレッジ計測コマンド

| 言語 | コマンド |
|------|---------|
| Python (pytest-cov) | `pytest --cov=src --cov-branch --cov-report=term-missing` (html は `--cov-report=html` → `htmlcov/index.html`) |
| TS (vitest / jest) | `vitest run --coverage` / `jest --coverage` → `coverage/` |
| Rust | `cargo tarpaulin --out Stdout` |
| Go | `go test -cover ./...` |
| Dart | `dart test --coverage=coverage` + `format_coverage` → `coverage/` |

未導入時は `pip install pytest-cov` / `npm i -D @vitest/coverage-v8` を提案。

---

## parametrize テンプレ (重複テスト統合の主要手段)

同一ロジックを入力違いで繰り返すテストは 1 本に畳む。Python は `@pytest.mark.parametrize`
(`pytest.param(..., id="name")` で読みやすく)、TS は `test.each([[...], ...])`、
Rust は `rstest` の `#[case::name(...)]` を使う。具体構文は各言語のテストランナー doc 参照。

---

## fixture テンプレ (DRY 化の主要手段)

Python は `@pytest.fixture` (yield で teardown、`scope=function/class/module/session` で
高コスト fixture を共有範囲に応じて使い分け)、TS は `beforeEach`/`afterEach` でセットアップ/後始末を書く。
authorization token 付き client などの共有セットアップは fixture 化してテスト本体を薄く保つ。

---

## mock 方針 (mock してよい / してはいけない の判断)

mock テンプレを使う前に、まず **何を mock するか** を決める。
mock しすぎると「振る舞いではなく呼び出し順の写経」になり、本体ロジックの変更を検出できなくなる。

### mock してよいもの

- 外部 HTTP / ネットワーク
- メール送信 / SMS / Push 通知
- 決済 API
- 時刻 (`Date.now`, `datetime.now`)
- 乱数 (`Math.random`, `random`)
- OS / FS の危険操作 (削除、グローバル書込)
- 高コストな外部サービス (LLM API、画像処理)

### mock してはいけないもの

- テスト対象の主要ロジック本体
- validation / authorization の本体
- domain rule / business rule
- repository と service の **両方** を同時に mock して、本体経由が消える構成

### 判断基準

以下に 1 つでも該当したら mock の使い方を見直す:

- mock によりテストが「振る舞い」ではなく「呼び出し順の写経」になっている
- mock なしの integration / contract test が **別に存在しない**
- mock したことで失敗モード (例: 認可漏れ、契約破綻) を見逃している
- mock オブジェクトが多すぎてテスト本体が読めない (mock 5 個以上は要警戒)

### 出力 schema との対応

`test_intent.mock_policy` で mock するもの / しないものとその理由を必ず明記する。

```json
"mock_policy": {
  "mock": ["fetch", "Date.now"],
  "do_not_mock": ["UserService の validate", "discount 本体"],
  "reason": "外部依存と時刻のみ mock。本体ロジックは経由させて検証する"
}
```

---

## mock テンプレ

上記「mock 方針」で決めた対象を実装するときの最小形。Python は `unittest.mock` /
`monkeypatch.setattr` で差し替え、TS (vitest) は `vi.fn()` + `vi.mock(...)` で差し替える。
外部 HTTP は TS では `msw` (`setupServer` + `http.get(...)`) が推奨 (request/response の形まで検証できる)。

---

## 時刻 / 乱数の凍結

flaky の主要原因。テストでは必ず固定する。Python は `pytest-freezegun` の `freezer.move_to(...)`、
TS (vitest) は `vi.useFakeTimers()` + `vi.setSystemTime(...)` + `vi.advanceTimersByTime(...)` で凍結・進行させる。

---

## 環境変数 / 設定の隔離

Python は `monkeypatch.setenv(...)`、TS (vitest) は `vi.stubEnv(...)` / `vi.unstubAllEnvs()` で
テスト用の環境変数 (DB URL 等) に差し替え、他テストへ漏らさない。

---

## flaky テスト診断コマンド

```bash
# 失敗するテストを特定 (pytest)
pytest tests/ -v --tb=short
pytest tests/ --lf  # last failed のみ再実行
pytest tests/ --ff  # 失敗を最初に実行

# 反復実行で flaky 判定
for i in {1..10}; do pytest tests/ -x || echo "FAIL on iteration $i"; done

# vitest 反復
for i in {1..10}; do npx vitest run --bail || echo "FAIL on iter $i"; done
```

flaky と判定されたテストは:
1. 時刻 / 乱数 / 順序依存を疑う (このファイルの「凍結」セクション参照)
2. 環境依存を疑う (`/tmp`, `process.env`, 実 HTTP)
3. 並行性を疑う (テスト間でリソース競合していないか)
4. 修正できないなら `.skip` 化 + チケット起票 (放置スキップにしない)

---

## 安全削除の git blame コマンド

ゴミ判定テストを削除する前の必須確認:

```bash
# テスト追加コミットの確認
git blame tests/path/to/file.test.ts

# 特定テストブロック (skip 等) の追加コミット
git log --diff-filter=A --pretty=format:"%H %s" -- tests/path/to/file.test.ts | head -5

# テストが参照している関数の最終変更
git log -p src/path/to/file.ts | head -50

# Issue / PR から context 復元
gh search issues "tests/path/to/file" --state=all
gh search prs "tests/path/to/file" --state=all
```

これで「なぜ追加されたか」が分かる。それでも不明なら **削除せず .skip** で観察期間を取る。
