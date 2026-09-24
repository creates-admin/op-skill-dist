# カバレッジギャップ catalog

行カバー率だけでは意味のある穴は見抜けない。Critical / High の機能の穴だけを対象にする。

## catalog 索引 (top 5)

| # | ギャップ | 検出方法 |
|---|---------|---------|
| 1 | 未テスト分岐 | coverage report の missing branch、`if` の片側のみテスト |
| 2 | エラーパス未検証 | `try` の正常系のみテスト、`except` / `catch` 側未到達 |
| 3 | 境界値未テスト | 空・null・最大値・1 件・0 件の入力テスト不在 |
| 4 | 並行性未テスト | async / lock / shared state の race condition 検証なし |
| 5 | 権限境界未テスト | 認可違反パス未テスト、role 別の網羅なし |

## 裏取り (Issue 化の前に必須)

grep は一次ヒント。finding にする前に:

1. 対象コードを Read し、分岐 / 例外 / 境界値が実在するか確認する
2. 既存テスト (別名 / integration / E2E) で既に守られていないか確認する
3. coverage report があれば missing line / branch と照合する
4. Critical / High の機能に該当するか確認する

何で確認したかを `evidence_sources` に記録する。

## 1. 未テスト分岐

行カバレッジ 100% でも片側が未テストなら穴。branch coverage を有効にして確認する
(`pytest --cov=src --cov-branch --cov-report=term-missing` の Missing branches / vitest の lcov `BRDA`)。両側を 1 本でカバーする:

```ts
test.each([
  ['premium', { isPremium: true }, 100, 80],
  ['regular', { isPremium: false }, 100, 100],
])('discount: %s', (_, user, total, expected) => {
  expect(discount(user as User, total)).toBe(expected)
})
```

## 2. エラーパス未検証

`try:` の数とテスト側の `raises` / `toThrow` の数の比率が極端に偏っていれば疑う。`FileNotFoundError` → 既定値、
`JSONDecodeError` → `ValueError` のような except 分岐ごとに、tmp fixture で失敗状況を作ってテストする。

## 3. 境界値未テスト

| 引数型 | 確認すべき境界値 |
|--------|----------------|
| 配列 / リスト | `[]`, 1 件, 巨大 |
| 文字列 | `""`, 空白のみ, 最大長, Unicode |
| 数値 | 0, 負数, 最大, 最小, NaN, Infinity |
| Optional | `None` / `null` / `undefined` |
| Date | epoch 0, 未来, DST 境界 |

巨大入力の unit test には ms 閾値を置かない (例外なく完了する / 結果が正しい / OOM・無限ループがない、だけを確認)。
性能予算は `test_type: perf` として別スイートに分ける。

## 4. 並行性未テスト

Read で構造を見る: async 内の共有変数更新 / mutex・lock を使う関数 / DB トランザクションを跨ぐロジック / キャッシュの更新と読み取りの並行。
N 並列 (`asyncio.gather` / `Promise.all`) で操作し、結果が N 回分になるかをアサートする。

## 5. 権限境界未テスト

認可チェック関数 (`requireRole` / `canAccess` 等) のテストを grep し、各 role の許可 / 不許可の両方、認証なし・期限切れトークンを確認する。
role と期待ステータスを parametrize で網羅する (例: admin 200 / editor 200 / viewer 403 / anonymous 401)。

## 拡張時のチェックリスト

```
□ 該当機能は Critical / High か
□ 行カバレッジと分岐カバレッジの両方で穴を確認した
□ parametrize で複数ケースを 1 本にまとめた
□ 追加前後で coverage を計測し、実際に上がった
□ SKILL.md の最適なテスト原則 (AAA / 単一責務 / 決定的) に従う
□ 既存 fixture を再利用した (新規 fixture は 2 箇所以上で使うときのみ)
```
