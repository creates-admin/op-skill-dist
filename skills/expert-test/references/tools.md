# expert-test ツール・テンプレ辞典

<!--
機能概要: テストランナー / カバレッジ / parametrize / fixture / mock の言語別最小テンプレ集
作成意図: agent が "どう書くか" で迷ったときの参照辞典。実用最小形のみ
注意点: 環境にツールがない場合は提案 (インストール強制はしない)
-->

---

## カバレッジ計測コマンド

| 言語 | コマンド | 出力先 |
|------|---------|-------|
| Python (pytest-cov) | `pytest --cov=src --cov-branch --cov-report=term-missing` | 標準出力 |
| Python (pytest-cov, html) | `pytest --cov=src --cov-report=html` | `htmlcov/index.html` |
| TS (vitest) | `vitest run --coverage` | `coverage/` |
| TS (jest) | `jest --coverage` | `coverage/` |
| Rust | `cargo tarpaulin --out Stdout` | 標準出力 |
| Go | `go test -cover ./...` | 標準出力 |
| Dart | `dart test --coverage=coverage` + `format_coverage` | `coverage/` |

カバレッジ未導入の場合は `pip install pytest-cov` / `npm i -D @vitest/coverage-v8` を提案。

---

## parametrize テンプレ (重複テスト統合の主要手段)

### Python (pytest)

```python
@pytest.mark.parametrize("input,expected", [
    ("", []),
    ("foo", ["foo"]),
    ("foo,bar", ["foo", "bar"]),
])
def test_parse(input, expected):
    assert parse(input) == expected

# id を付けて読みやすく
@pytest.mark.parametrize("input,expected", [
    pytest.param("", [], id="empty"),
    pytest.param("foo", ["foo"], id="single"),
    pytest.param("foo,bar", ["foo", "bar"], id="multi"),
])
def test_parse(input, expected): ...
```

### TS (vitest / jest)

```ts
test.each([
  ['empty', '', []],
  ['single', 'foo', ['foo']],
  ['multi', 'foo,bar', ['foo', 'bar']],
])('parse %s: input=%s', (_, input, expected) => {
  expect(parse(input)).toEqual(expected)
})
```

### Rust

```rust
#[rstest]
#[case::empty("", vec![])]
#[case::single("foo", vec!["foo"])]
#[case::multi("foo,bar", vec!["foo", "bar"])]
fn test_parse(#[case] input: &str, #[case] expected: Vec<&str>) {
    assert_eq!(parse(input), expected);
}
```

---

## fixture テンプレ (DRY 化の主要手段)

### Python (pytest)

```python
@pytest.fixture
def authenticated_client(db):
    user = User.create(email="test@example.com")
    client = TestClient(app)
    client.headers["Authorization"] = f"Bearer {token_for(user)}"
    yield client
    user.delete()  # teardown

def test_get_profile(authenticated_client):
    res = authenticated_client.get("/api/profile")
    assert res.status_code == 200
```

scope を活用して高コスト fixture を効率化:
- `function` (default) — 各テストで作り直し
- `class` — クラス内で共有
- `module` — ファイル内で共有
- `session` — 全テスト実行で共有

### TS (vitest)

```ts
import { beforeEach, afterEach, test, expect } from 'vitest'

let client: TestClient
let userId: string

beforeEach(async () => {
  const user = await User.create({ email: 'test@example.com' })
  userId = user.id
  client = new TestClient({ token: tokenFor(user) })
})

afterEach(async () => {
  await User.delete(userId)
})

test('get profile', async () => {
  const res = await client.get('/api/profile')
  expect(res.status).toBe(200)
})
```

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

### Python (unittest.mock / monkeypatch)

```python
def test_send_email_called_with_correct_args(monkeypatch):
    sent = []
    monkeypatch.setattr("app.email.send", lambda to, subj: sent.append((to, subj)))

    notify_user(user_id=1, message="hi")

    assert sent == [("user1@example.com", "hi")]
```

### TS (vitest)

```ts
import { vi, test, expect } from 'vitest'

test('send_email called with correct args', () => {
  const sendMock = vi.fn()
  vi.mock('../email', () => ({ send: sendMock }))

  notifyUser(1, 'hi')

  expect(sendMock).toHaveBeenCalledWith('user1@example.com', 'hi')
})
```

### HTTP mock (msw — TS 推奨)

```ts
import { setupServer } from 'msw/node'
import { http, HttpResponse } from 'msw'

const server = setupServer(
  http.get('/api/users', () => HttpResponse.json([{ id: 1 }]))
)
beforeAll(() => server.listen())
afterEach(() => server.resetHandlers())
afterAll(() => server.close())
```

---

## 時刻 / 乱数の凍結

flaky の主要原因。テストでは必ず固定する。

### Python

```python
def test_token_expires_after_1h(freezer):  # pytest-freezegun
    freezer.move_to("2026-01-01 12:00:00")
    token = generate_token()
    freezer.move_to("2026-01-01 13:00:01")
    assert is_expired(token)
```

### TS (vitest)

```ts
import { vi, test, expect, beforeEach, afterEach } from 'vitest'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

test('token expires after 1h', () => {
  vi.setSystemTime(new Date('2026-01-01T12:00:00'))
  const token = generateToken()
  vi.advanceTimersByTime(60 * 60 * 1000 + 1)
  expect(isExpired(token)).toBe(true)
})
```

---

## 環境変数 / 設定の隔離

### Python

```python
def test_uses_test_db(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "sqlite:///:memory:")
    db = connect()
    assert db.url == "sqlite:///:memory:"
```

### TS (vitest)

```ts
import { vi } from 'vitest'

beforeEach(() => {
  vi.stubEnv('DATABASE_URL', 'sqlite:///:memory:')
})
afterEach(() => {
  vi.unstubAllEnvs()
})
```

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
