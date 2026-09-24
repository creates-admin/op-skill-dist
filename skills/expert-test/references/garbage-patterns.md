# ゴミテスト catalog

削除前に SKILL.md の「テスト削除の 3 段階モデル」と `safety_gate` を必ず通す。

## catalog 索引 (top 14)

| # | カテゴリ | 検出兆候 | 判定 |
|---|---------|---------|------|
| 1 | 死んだテスト | import エラーで collect 失敗、削除されたコードを参照 | 削除候補 (例外的に 1 PR 削除可) |
| 2 | 重複カバレッジ | 同じ関数を 3 回以上テスト、入力違いの繰り返し | 統合 (parametrize) |
| 3 | 自明なテスト | getter / setter の値返し、フレームワーク機能のテスト | 削除候補 |
| 4 | 実装詳細依存 | private メソッド直テスト、内部フィールド検証 | 書き直し |
| 5 | 脆弱セレクタ | 深い CSS / XPath、絶対座標、index ベース選択 | 書き直し |
| 6 | 非決定的 | `Date.now()` / `Math.random()` 凍結なし、順序依存 | 書き直し |
| 7 | 環境依存 | 実 HTTP、`/tmp` 書き込み放置、locale 依存 | 書き直し |
| 8 | モック過多 | 全部 mock で本体コード未経由 | 書き直し / integration 化 |
| 9 | アサーション弱 | snapshot のみ、意味検証なし、常時 true | 書き直し (常時 true は削除候補) |
| 10 | 放置スキップ | `.skip` / `xit` がチケット参照なし | 削除候補 or 復活 |
| 11 | 長 setup / 短 assert | fixture 30 行 + assert 1 行 | fixture 化 + parametrize |
| 12 | 命名不良 | `test1`, `it('works')` | 書き直し |
| 13 | タイミング依存 | `sleep(100)` ハードコード、CI で flaky | 書き直し |
| 14 | TODO 放置 | `TODO: implement` のまま skip | 追跡して判断 |

## 判定の意味

判定は action の方向であり、即削除の許可ではない。

- **削除候補**: `delete_candidate` として報告する。apply では quarantine (skip 化) までで止め、観察期間後の別 PR で実削除する。
  同等カバレッジがなければ先に補完テストを追加する。
- **書き直し**: `rewrite_test`。元のテストは削除しない。
- **統合**: parametrize / fixture 共通化。テストケースは残す。

grep は一次ヒント。ヒット箇所を Read し、coverage / blame で裏付けてから finding にする。

## 1. 死んだテスト

```bash
pytest --collect-only 2>&1 | grep -E "ERROR|ImportError"
vitest list 2>&1 | grep -E "FAIL|Cannot find"
```

テストが import している名前が src 側に存在するかを grep で確認する。collect 不能でスイートを壊しているなら、追加意図を確認のうえ
1 PR で直接削除してよい (コミットに「<sha> で oldHelper 削除済、テストは長期 collect 不能だった」等の根拠)。

## 2. 重複カバレッジ

`grep -rln "functionName" tests/ | wc -l` と coverage report (同じ行を多数のテストがカバー) で確認。入力違いの繰り返しは 1 本に畳む:

```python
@pytest.mark.parametrize("email", ["a@b.c", "c@d.e", "e@f.g"])
def test_validate_returns_true_on_valid_email(email):
    assert validate(email) is True
```

## 3. 自明なテスト

自前ロジックのない getter / コンストラクタ代入の確認。契約の固定として残す価値がある場合もあるので安全弁を通してから判断する。
ロジックが追加されたら振る舞いのテストに書き直す。

## 4. 実装詳細依存

`(svc as any)._cache` のような private アクセス。public な振る舞い (2 回目の fetch がキャッシュヒットするか等) で書き直す。

## 5. 脆弱セレクタ

```bash
grep -rEn "nth-child|>\s*div\s*>\s*div" tests/
grep -rn "//html\[" tests/
```

`role=button[name='保存']` 等のセマンティック selector に置換する。

## 6. 非決定的

```bash
grep -rEn "Date\.now\(\)|new Date\(\)|Math\.random\(\)" tests/
grep -rEn "datetime\.(now|today)|random\." tests/
```

時刻・乱数を固定するか、値ではなく長さ・形式でアサートする (`references/tools.md` の「時刻 / 乱数の凍結」)。

## 7. 環境依存

```bash
grep -rEn "fetch\(['\"]http|axios\.get\(['\"]http|requests\.get\(['\"]http" tests/
grep -rEn "/tmp/|os\.environ\[|process\.env\." tests/
```

外部通信は msw / nock 等で差し替え、FS は tmp fixture、環境変数は隔離する。

## 8. モック過多

依存をすべて mock し「呼ばれたこと」だけを検証するテストは本体の変更を検出できない。削除・書き直しの前に、同じ振る舞いを検証する
integration / contract test が他にあるか確認し、なければ**先に**追加する。

## 9. アサーション弱

```bash
grep -rEn "toMatchSnapshot\(\)" tests/
grep -rEn "expect\(true\)\.toBe\(true\)|assert True$" tests/
```

snapshot のみのテストは、期待される構造 (要素の存在 / ARIA / テキスト) を明示アサートする形に書き直す。

## 10. 放置スキップ

```bash
grep -rEn "\.skip\(|\.todo\(|xit\(|xdescribe\(|@pytest\.mark\.skip" tests/
```

各箇所の追加コミットを git blame で確認し、関連 PR / Issue を追う。追加意図が復元できなければ
`needs_human_decision.required: true` (decision_type: "deletion")。

## 11. 長 setup / 短 assert

setup を `@pytest.fixture` / `beforeEach` に切り出して再利用し、parametrize でケースを畳む。

## 12. 命名不良

```bash
grep -rEn "test\(['\"]test[0-9]|it\(['\"]should work|test\(['\"]case " tests/
```

`<対象>_<期待動作>_<条件>` 形式に書き直す。

## 13. タイミング依存

```bash
grep -rEn "setTimeout\(.*[0-9]{2,3}|sleep\([0-9]+\)|Thread\.sleep\(" tests/
```

`waitFor` / `vi.advanceTimersByTime` 等の決定的な待機に置換する。

## 14. TODO 放置

```bash
grep -rEn "skip.*TODO|skip.*FIXME" tests/
```

関連 Issue が close 済みなのに skip のままなら、書く (`rewrite_test`) か削除候補。Issue が open ならそのまま (リマインダとして機能している)。
追跡できなければ `needs_human_decision.required: true` (decision_type: "deletion")。
