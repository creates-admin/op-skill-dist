# expert-test ゴミテスト全集

<!--
機能概要: SKILL.md の top 14 catalog を言語別具体例 + 検出 grep で深掘りした辞典
作成意図: 削除前に読む証拠集。安易な削除を防ぎ、判定根拠を持って処理するための補助資料
注意点: agent は必要時のみ Read。SKILL.md の安全弁 (git blame / coverage diff / 段階削除) を必ず通す
-->

ゴミテスト 14 カテゴリの言語別具体例と検出 grep。
**削除前に SKILL.md の「テスト削除の 3 段階モデル」と `safety_gate` を必ず通す**。

---

## 判定表記の統一ポリシー

本辞典の各カテゴリには「判定」が付くが、これは **action の方向性** を示すもので、
**即削除の許可ではない**。原則として以下を統一する:

- 「**削除候補**」: 3 段階モデルの `delete_candidate` として Issue 化する。
  apply 時は `quarantine` (skip 化) までで止め、観察期間後の別 PR で実削除する。
  同等カバレッジがない場合は、先に補完テストを追加する。
- 「**書き直し**」: rewrite_test として実装。元のテストは削除しない。
- 「**統合**」: parametrize / fixture 共通化。実テストケースは残す。

### 例外: 1 PR で直接削除可

明らかに collect 不能でテストスイート全体を壊している dead test (カテゴリ 1) のみ、
追加意図を確認したうえで 1 PR で直接削除可。
その場合もコミットメッセージに根拠を必ず記載する。

> **重要**: 「判定: 削除」と書かれていても、**安全弁を通過するまで実削除しない**。
> agent は判定文の勢いではなく 3 段階モデルに従う。

---

## 1. 死んだテスト (collect 失敗 / 削除コード参照)

### 検出方法

```bash
# pytest: collect エラーの一覧
pytest --collect-only 2>&1 | grep -E "ERROR|ImportError"

# vitest: 同様
vitest list 2>&1 | grep -E "FAIL|Cannot find"

# 削除されたコードを参照しているテスト (関数名が src に存在しないか確認)
# 例: テストで import している名前を src 側で grep
```

### 例 (TS)

```ts
// 削除された関数を import している
import { oldHelper } from '../src/helpers'  // ← src/helpers から oldHelper は削除済
test('oldHelper works', () => { ... })
```

判定: **削除候補 (例外的に 1 PR 削除可)**。
collect 不能でスイートを壊しているなら、追加意図を確認したうえで直接削除可。
コミットメッセージに `<commit-sha> で oldHelper 削除済、テストは長期 collect 不能だった` と根拠記載。

---

## 2. 重複カバレッジ

### 検出方法

```bash
# 同じ関数を多数のテストが触っている (粗い指標)
grep -rln "functionName" tests/ | wc -l

# coverage report で同じ行を多数のテストがカバー
pytest --cov=src --cov-report=html
# coverage/index.html → 各行の覆われ方確認
```

### 例 (Python)

```python
# tests/test_validate.py
def test_validate_returns_true_on_valid_email(): assert validate("a@b.c") is True
def test_validate_returns_true_on_valid_email_2(): assert validate("c@d.e") is True
def test_validate_returns_true_on_valid_email_3(): assert validate("e@f.g") is True
```

判定: **parametrize で統合**。

```python
@pytest.mark.parametrize("email", ["a@b.c", "c@d.e", "e@f.g"])
def test_validate_returns_true_on_valid_email(email):
    assert validate(email) is True
```

---

## 3. 自明なテスト (getter/setter / フレームワーク機能)

### 例 (TS)

```ts
test('getName returns name', () => {
  const obj = new Foo({ name: 'x' })
  expect(obj.getName()).toBe('x')  // ← 自前ロジックなし、コンストラクタの代入を確認しているだけ
})
```

判定: **削除候補**。
ただし、コンストラクタ代入だけを確認しているテストでも、
契約の固定として残す価値がある場合は安全弁を通してから判断する。
ロジックが追加されたら振る舞いをテストする方向で書き直す。

---

## 4. 実装詳細依存 (private / 内部状態)

### 例 (TS)

```ts
test('internal cache populated', () => {
  const svc = new Service()
  svc.fetch('key')
  expect((svc as any)._cache.size).toBe(1)  // ← private フィールドアクセス
})
```

判定: **書き直し**。public な振る舞い (2 回目の fetch でキャッシュヒットするか等) でテスト。

---

## 5. 脆弱セレクタ (XPath / 深い CSS / index)

### 例 (E2E)

```ts
await page.click('div > div > section:nth-child(3) > button:nth-child(2)')  // ← レイアウト変更で即破綻
```

判定: **書き直し**。`role=button[name='保存']` 等のセマンティック selector に置換。

### 検出 grep

```bash
grep -rEn "nth-child|>\s*div\s*>\s*div" tests/
grep -rn "//html\[" tests/   # XPath
```

---

## 6. 非決定的 (時刻 / 乱数 / 順序依存)

### 例 (Python)

```python
def test_token_unique():
    t1 = generate_token()
    t2 = generate_token()
    assert t1 != t2  # ← 乱数依存。Math.random で同じ値が出る可能性 (1/N) で flaky
```

判定: **書き直し**。`monkeypatch` で乱数を固定、または別の保証 (長さ・形式) でアサート。

### 検出 grep

```bash
grep -rEn "Date\.now\(\)|new Date\(\)|Math\.random\(\)" tests/
grep -rEn "datetime\.(now|today)|random\." tests/
```

---

## 7. 環境依存 (実 HTTP / FS / locale)

### 例 (Node)

```ts
test('weather api', async () => {
  const res = await fetch('https://api.weather.com/...')  // ← 実通信
  expect(res.status).toBe(200)
})
```

判定: **書き直し**。msw / nock 等で mock 化。

### 検出 grep

```bash
grep -rEn "fetch\(['\"]http|axios\.get\(['\"]http|requests\.get\(['\"]http" tests/
grep -rEn "/tmp/|os\.environ\[|process\.env\." tests/
```

---

## 8. モック過多 (本体未経由)

### 例 (TS)

```ts
test('createUser', () => {
  const repo = mock<UserRepo>()
  const validator = mock<Validator>()
  const notifier = mock<Notifier>()
  const svc = new UserService(repo, validator, notifier)
  svc.create(input)
  expect(validator.validate).toHaveBeenCalledWith(input)  // ← 本体は何もしていない
})
```

判定: **書き直し or 統合テスト化**。
すべて mock のテストは「実装の写経」になりがちで、本体ロジックの変更を検出できない。
削除する前に、同じ振る舞いを検証する integration / contract test が他に存在するか確認する。
存在しない場合は **先に integration / contract test を追加** してから対応する。

---

## 9. アサーション弱 (snapshot のみ / 常時 true)

### 例

```ts
test('renders', () => {
  const wrapper = mount(MyComponent)
  expect(wrapper.html()).toMatchSnapshot()  // ← snapshot のみ。意味検証なし
})
```

判定: **書き直し**。期待される構造 (特定要素の存在、ARIA、テキスト) を明示アサート。

```ts
test('shows submit button when form is valid', () => {
  const wrapper = mount(MyComponent, { props: { isValid: true } })
  expect(wrapper.find('[role=button][name=送信]').exists()).toBe(true)
})
```

### 検出 grep

```bash
grep -rEn "toMatchSnapshot\(\)" tests/
grep -rEn "expect\(true\)\.toBe\(true\)|assert True$" tests/
```

---

## 10. 放置スキップ (`.skip` / `xit` / チケット参照なし)

### 例

```ts
it.skip('user can update profile', () => { ... })  // ← 理由なし、いつから skip か不明
```

判定: **削除候補 or 復活**。
SKILL.md の 3 段階モデルに従い、まず `.skip` の追加コミットを git blame で確認。
追加意図が復元できなければ `needs_human_decision.required: true` (decision_type: "deletion") として人間判断要求を構造化返却する (旧 `needs_human_judgment` は deprecated alias、互換目的のみ)。

### 検出 grep

```bash
grep -rEn "\.skip\(|\.todo\(|xit\(|xdescribe\(|@pytest\.mark\.skip" tests/
```

各検出箇所で `git blame` を取り、追加コミット message + 関連 PR を確認。

---

## 11. 長 setup / 短 assert

### 例

```python
def test_user_can_login():
    # setup 30 行
    db = create_test_db()
    user = User(...)
    db.add(user)
    db.commit()
    # ... さらに 25 行 ...

    # assert 1 行
    assert client.login(user.email, "pw").status_code == 200
```

判定: **fixture 化 + parametrize**。setup 部分を `@pytest.fixture` に切り出して再利用。

---

## 12. 命名不良 (`test1` / `should work` 等)

### 例

```ts
test('test1', () => { ... })
test('should work', () => { ... })
test('case 2', () => { ... })
```

判定: **書き直し**。`<対象>_<期待動作>_<条件>` 形式に。

```ts
test('parse_returns_null_when_input_empty', () => { ... })
```

### 検出 grep

```bash
grep -rEn "test\(['\"]test[0-9]|it\(['\"]should work|test\(['\"]case " tests/
```

---

## 13. タイミング依存 (`sleep(N)` ハードコード)

### 例

```ts
test('async update reflects', async () => {
  triggerUpdate()
  await new Promise(r => setTimeout(r, 500))  // ← CI で flaky の温床
  expect(state.value).toBe('updated')
})
```

判定: **書き直し**。`waitFor` / `vi.advanceTimersByTime` 等の決定的待機に置換。

### 検出 grep

```bash
grep -rEn "setTimeout\(.*[0-9]{2,3}|sleep\([0-9]+\)|Thread\.sleep\(" tests/
```

---

## 14. TODO 放置 (`TODO: implement` のまま skip)

### 例

```python
@pytest.mark.skip(reason="TODO: implement after API change")
def test_new_endpoint():
    pass
```

判定: 関連 Issue / PR を追跡。
Issue が close しているのにまだ skip なら、**書く (rewrite_test)** または **削除候補** として扱う。
Issue が open ならそのまま (テストの存在自体が TODO リマインダ)。
追跡できない TODO は `needs_human_decision.required: true` (decision_type: "deletion") として人間判断要求を構造化返却する (旧 `needs_human_judgment` は deprecated alias)。

### 検出 grep

```bash
grep -rEn "TODO|FIXME|XXX" tests/
grep -rEn "skip.*TODO|skip.*FIXME" tests/
```

---

## 横断: バッチ処理可能性の判定

同じ bulk_group に該当する検出が **5 件以上** なら、op-scan は個別 Issue ではなく
カテゴリ単位の **バッチ Issue** を起票する (`_shared/pr-templates.md` の バッチテンプレ)。

test-expert がよく出力する bulk_group:

- `garbage-skip-untracked`: 10 番のチケット参照なし `.skip`
- `garbage-trivial-snapshot`: 9 番の意味検証なし snapshot
- `garbage-always-pass`: 9 番の常時 pass
- `garbage-dead-import`: 1 番の死んだテスト
- `garbage-flaky-timing`: 13 番の sleep ハードコード
- `garbage-trivial-getter`: 3 番の自明 getter テスト

5 件未満の場合は通常通り個別 Issue。
