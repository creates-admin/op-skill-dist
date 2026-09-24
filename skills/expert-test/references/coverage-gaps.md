# カバレッジギャップ catalog

行カバー率だけでは意味のある穴は見抜けない。Critical / High の機能の穴だけを対象にする。

## catalog 索引 (top 5)

| # | ギャップ | 検出方法 |
|---|---------|---------|
| 1 | 未テスト分岐 | coverage report の missing branch、`if` の片側のみテスト (行カバレッジ 100% でも片側が未テストなら穴) |
| 2 | エラーパス未検証 | `try` の正常系のみテスト、`except` / `catch` 側未到達。例外分岐の数とテスト側の `raises` / `toThrow` の数が極端に偏っていれば疑う |
| 3 | 境界値未テスト | 空・null・最大値・1 件・0 件の入力テスト不在 |
| 4 | 並行性未テスト | async / lock / shared state / トランザクション跨ぎの race condition 検証なし |
| 5 | 権限境界未テスト | 認可違反パス未テスト、role 別の網羅なし、認証なし・期限切れトークンの未検証 |

## 裏取り (Issue 化の前に必須)

grep は一次ヒント。finding にする前に:

1. 対象コードを Read し、分岐 / 例外 / 境界値が実在するか確認する
2. 既存テスト (別名 / integration / E2E) で既に守られていないか確認する
3. coverage report があれば missing line / branch と照合する
4. Critical / High の機能に該当するか確認する

何で確認したかを `evidence_sources` に記録する。

巨大入力の unit test には ms 閾値を置かない (例外なく完了する / 結果が正しい / OOM・無限ループがない、だけを確認)。
性能予算は `test_type: perf` として別スイートに分ける。
