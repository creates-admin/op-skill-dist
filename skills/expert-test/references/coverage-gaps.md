# expert-test カバレッジギャップ検出辞典

<!--
機能概要: SKILL.md の top 5 ギャップカテゴリの言語別検出方法と修正テンプレ
作成意図: coverage 値だけでなく "なぜそこが穴か" を見抜く判定材料を提供
注意点: カバレッジ拡張は削除より優先度低い。明らかな Critical 機能の穴のみ対象
-->

カバレッジツールの「行カバー率」だけでは「**意味のある穴**」を見抜けない。
本辞典は 5 カテゴリのギャップを言語別に検出する方法を集約。

---

## 検出 grep の扱い (重要)

本辞典の grep は **一次ヒント** であり、単独では Issue 化しない。
Issue 化する前に必ず以下を確認する:

1. 対象コードを Read して、実際に分岐 / 例外 / 境界値が存在するか確認
2. 既存テストを Read して、別名 / 統合テスト / E2E で既に守られていないか確認
3. coverage report がある場合は missing line / missing branch と照合
4. Critical / High の機能に該当するか確認

grep ヒットだけで `severity` を断定すると false positive が量産される。
必ず Read と coverage で裏取りし、`evidence_sources` に何で確認したかを記録する。

---

## 1. 未テスト分岐 (branch coverage)

行カバレッジ 100% でも分岐の片側が未テストなら穴。

### 検出方法

```bash
# Python (branch coverage を有効化)
pytest --cov=src --cov-branch --cov-report=term-missing
# 出力の「Missing branches」を確認

# TS (vitest)
vitest run --coverage --coverage.branches  # vitest.config の coverage.reporter に lcov 追加
# coverage/lcov-report で BRDA (branch data) を確認
```

### 例 (穴のある状態)

```ts
function discount(user: User, total: number): number {
  if (user.isPremium) {
    return total * 0.8  // ← ここはテスト済
  }
  return total           // ← else 側が未テスト
}
```

### 修正テンプレ (parametrize で両側カバー)

```ts
test.each([
  ['premium', { isPremium: true }, 100, 80],
  ['regular', { isPremium: false }, 100, 100],
])('discount: %s', (_, user, total, expected) => {
  expect(discount(user as User, total)).toBe(expected)
})
```

---

## 2. エラーパス未検証 (try の except 側)

正常系のみテストして例外パスがブラックボックス。

### 検出 grep

```bash
# try があるが対応するテストで except の動作確認していないか
grep -rn "try:" src/ | wc -l
grep -rn "raises\|throw\|toThrow\|to_raise" tests/ | wc -l
# 比率が極端に偏っていたら穴の可能性
```

### 例 (穴のある状態)

```python
def parse_config(path):
    try:
        with open(path) as f:
            return json.load(f)
    except FileNotFoundError:
        return {}             # ← この分岐が未テスト
    except json.JSONDecodeError:
        raise ValueError(...)  # ← この分岐も未テスト
```

### 修正テンプレ

```python
def test_parse_config_returns_empty_when_file_missing(tmp_path):
    assert parse_config(tmp_path / "nonexistent.json") == {}

def test_parse_config_raises_on_invalid_json(tmp_path):
    p = tmp_path / "bad.json"
    p.write_text("{ invalid")
    with pytest.raises(ValueError):
        parse_config(p)
```

---

## 3. 境界値未テスト

空・null・最大値・1 件・0 件の入力テストが不在。

### 検出パターン

| 関数の引数型 | 確認すべき境界値 |
|------------|-------------|
| 配列 / リスト | `[]`, `[1 件]`, `[巨大]` |
| 文字列 | `""`, 空白のみ, 最大長, Unicode |
| 数値 | 0, 負数, 最大, 最小, NaN, Infinity |
| Optional | `None` / `null` / `undefined` |
| Date | epoch 0, future, DST 境界 |

### 検出 grep (粗いヒント)

```bash
# テストに [] や "" を入力する例があるか
grep -rEn "\(\s*\[\s*\]\s*\)|\(\s*\"\"\s*\)" tests/

# null/undefined チェックテストの存在
grep -rEn "null|undefined|None" tests/ | grep -E "expect|assert" | wc -l
```

### 修正テンプレ

```ts
describe('search', () => {
  test('returns empty array when query is empty', () => {
    expect(search('', items)).toEqual([])
  })

  test('handles single-item collection', () => {
    expect(search('foo', [{ name: 'foo' }])).toHaveLength(1)
  })

  test('handles large collection without changing semantics', () => {
    const items = Array.from({ length: 10000 }, (_, i) => ({ name: `item${i}` }))
    expect(search('item5000', items)).toEqual([{ name: 'item5000' }])
  })
})
```

### 巨大入力の扱い (perf テストとの分離)

巨大入力は **unit test では厳密な ms 閾値を置かない**。
CI 環境差で flaky 化しやすく、決定的テスト原則と矛盾する。

通常の unit test では以下のみ確認する:

- 例外なく完了する
- 結果が正しい (意味検証)
- OOM や明らかな無限ループがない

性能予算を測りたい場合は `test_intent.test_type: perf` として **別スイートに分離** する。
CI で perf を実行する場合は、環境差を考慮した閾値と反復測定 (中央値・分位点) を使う。

---

## 4. 並行性未テスト (race condition)

async / lock / shared state のあるコードで並行アクセス検証なし。

### 検出パターン (Read で構造を見る)

- `async def` / `async function` 内で共有変数を更新
- mutex / lock を使っている関数 (テストで両方向取得試したか)
- DB トランザクションを跨ぐロジック
- キャッシュ更新と読み取りが並行する箇所

### 修正テンプレ (Python asyncio)

```python
@pytest.mark.asyncio
async def test_concurrent_writes_do_not_corrupt():
    counter = AsyncCounter()
    # 100 並列で increment
    await asyncio.gather(*[counter.increment() for _ in range(100)])
    assert counter.value == 100  # ← race があれば 100 にならない
```

### 修正テンプレ (TS Promise.all)

```ts
test('parallel updates produce consistent state', async () => {
  const store = new Store()
  await Promise.all(Array.from({ length: 100 }, () => store.increment()))
  expect(store.value).toBe(100)
})
```

---

## 5. 権限境界未テスト

認可違反パスの検証なし。role-based access の各 role が網羅されていない。

### 検出方法

- 認可チェック関数 (例: `requireRole`, `canAccess`) の test を grep
- 各 role に対して許可 / 不許可の両方をテストしているか
- 認証なし / 期限切れトークンのケースをテストしているか

### 修正テンプレ

```python
@pytest.mark.parametrize("role,expected_status", [
    ("admin", 200),
    ("editor", 200),
    ("viewer", 403),
    ("anonymous", 401),
    (None, 401),
])
def test_delete_endpoint_authorization(client, role, expected_status):
    headers = {"Authorization": f"Bearer {token_for(role)}"} if role else {}
    res = client.delete("/api/items/1", headers=headers)
    assert res.status_code == expected_status
```

---

## ギャップ拡張時のチェックリスト

```
□ 該当機能は Critical / High か (Medium 以下なら拡張優先度低)
□ 行カバレッジ + 分岐カバレッジ両方で穴を確認
□ 追加テストが parametrize で複数ケースをカバー (1 件追加で 1 ケースは効率悪い)
□ 追加後にカバレッジが実際に上昇 (前後で計測)
□ 追加テストが SKILL.md の最適なテスト原則に従う (AAA / 単一責務 / 決定的)
□ fixture を新規作らず既存を再利用 (新 fixture は 2 箇所以上で使うときのみ)
```

---

## bulk_group カテゴリ (op-scan のバッチ起票用)

カバレッジ穴が領域横断で複数発見される場合のグループキー:

- `coverage-gap-error-path`: 同モジュールで error path 未テストが集中 (5 件以上)
- `coverage-gap-boundary`: 境界値テスト未整備が集中
- `coverage-gap-permission`: 権限境界の未網羅 role が複数

5 件以上の同一カテゴリは個別 Issue ではなくバッチ Issue 化して 1 PR で一括追加。
