# Benchmark Protocol — Before / After 計測と統計判定

scan では実行しない (apply / investigation 用)。

## 原則

1. 計測なき最適化は出荷しない。「速くなった気がする」で実装を確定しない
2. Before / After は同じコマンド・同じ入力・同じ環境で取る。fixture を毎回変えない。After だけ取って Before を取らない、はしない
3. release build で測る (debug build の数値で判断しない)
4. warmup ≥ 3、runs ≥ 10
5. mean と stddev を並べて判定する (mean だけ報告しない)
6. 入力は small / medium / large で分ける (n が変わると勝敗が逆転しうる)。I/O 系は cold / warm を区別する
7. コマンド (正確な引数)・ツールバージョン・OS / CPU / RAM / WSL or native・fixture (path / 規模) を報告に残す

## ツールの使い分け

- CLI / pipeline 全体は hyperfine。`git checkout` を hyperfine 内に入れず、before / after の binary を別名で保存して並べる
- mean が 1 ms 以下の関数は hyperfine の精度限界を下回るので criterion (`--save-baseline before` → `--baseline before`)
- どこが遅いか分からないときは flamegraph / samply、allocation は dhat、bundle は visualizer で先に特定する
- Windows / WSL では drop_caches が使えないので、cold は「初回実行」として別に取る
- ベンチが不安定なときは同じ binary の baseline を 2 回取り、差が誤差内かでベンチ自体の信頼性を確認する

---

## 統計的有意性の判定

単位は ms に揃える (criterion の ns / hyperfine の s を換算)。

```text
improvement_ms     = before_mean_ms - after_mean_ms
combined_stddev_ms = sqrt(before_stddev_ms^2 + after_stddev_ms^2)
ratio              = improvement_ms / combined_stddev_ms
```

| 判定 | 条件 | decision |
|---|---|---|
| unstable (先に評価) | before_stddev > before_mean × 0.2 または after_stddev > after_mean × 0.2 | revert して `deferred` |
| clear | ratio ≥ 3 | `applied` |
| marginal | 1 ≤ ratio < 3 | risk low なら `applied` (marginal と明記)、medium 以上は `reverted` / `escalated` |
| none | ratio < 1 (誤差内 or 劣化) | `reverted` |

例: Before 250±8 ms / After 220±6 ms → improvement 30、combined ≈ 10、ratio ≈ 3.0 → clear。Before 250±30 / After 240±28 → ratio ≈ 0.24 → none。

`improvement.ratio_percent` = improvement_ms / before_mean_ms × 100、`speedup` = before_mean / after_mean (例 `"3.0x"`)。
