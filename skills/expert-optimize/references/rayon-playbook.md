# Rayon Playbook — 並列化の判断と実装パターン

Rayon は **CPU-bound な data parallelism** 用。I/O 待ちを隠す道具ではない (I/O-bound は async + semaphore、`io-and-batching.md`)。

## 採用条件 (全て満たす)

- [ ] CPU-bound (計算が支配的)
- [ ] 要素が独立 (要素間依存なし)
- [ ] shared mutable state なし (`Mutex<Vec>` push 等を使わない)
- [ ] 1 要素の粒度が十分 (目安 > 1 µs、できれば > 100 µs)
- [ ] 入力が十分大きい (目安 > 数百要素。threshold は実測で決める)
- [ ] 順序不要、または `Vec` への collect で順序を復元できる
- [ ] reduce / collect の結果が決定的 (浮動小数点の非結合 reduce に注意)
- [ ] エラー集約方針が明確
- [ ] sequential 版より速いことを benchmark で実測できる

使わない: I/O-bound / スレッド制約のある処理 (COM・InDesign・WebView・Tauri Window・Flutter platform channel) / 小さい collection / lock 付き shared state 更新 / 「最初の 1 件」のエラーが仕様上意味を持つ処理 / メモリ帯域が bottleneck。

## 良いパターン (shared mutable state を持たない)

```rust
use rayon::prelude::*;

let results: Vec<_> = pages.par_iter().map(analyze_page).collect();          // Vec collect は順序保持
let valid: Vec<_> = items.par_iter().filter_map(|i| validate(i).ok()).collect();
let results: Vec<_> = data.par_chunks(1024).map(process_chunk).collect();     // 粒度が小さすぎる時

// thread local に貯めて最後に merge (Mutex<HashMap> 並列 insert の代替)
let groups: HashMap<Category, Vec<Item>> = items.par_iter()
    .fold(HashMap::new, |mut acc: HashMap<Category, Vec<Item>>, item| {
        acc.entry(item.category).or_default().push(item.clone());
        acc
    })
    .reduce(HashMap::new, |mut a, b| {
        for (k, v) in b { a.entry(k).or_default().extend(v); }
        a
    });

// threshold 切替 (閾値は実測で決める)
let r: Vec<_> = if items.len() < PARALLEL_THRESHOLD {
    items.iter().map(process).collect()
} else {
    items.par_iter().map(process).collect()
};
```

高水準 API を優先する: `par_iter` 系 → `par_chunks` → `par_sort(_unstable)` → `join` (2 タスク) → `scope` (borrow 越し) → 専用 `ThreadPoolBuilder`。channel / custom executor を自前で組む前に高水準で試す。

## 悪いパターン

| Bad | 問題 | 置き換え |
|---|---|---|
| `for_each` 内で `results.lock().unwrap().push(..)` | lock 競合で sequential より遅い、順序不定、poison | `map().collect()` |
| `par_iter` 内で `fs::write` / HTTP / DB | I/O 待ちで効果なし、disk が捌けず逆に遅い、panic で thread が死ぬ | async + semaphore |
| `par_iter` 内で COM / UI 操作 | COM apartment (STA) 違反・UI thread 制約でクラッシュ / 不定動作 | sequential / UI thread へディスパッチ |
| 数十要素の `par_iter` | overhead が処理時間を上回る | sequential / threshold |
| 全 thread が同じ `Mutex<HashMap>` cache を lock | 競合 | fold + reduce、または `DashMap` (shard lock があるので benchmark 必須) |

## エラー処理の設計

| 仕様 | パターン |
|---|---|
| 最初のエラーで停止、内容が決定的であること | sequential のまま |
| 最初のエラーで停止、内容はどれでもよい | `collect::<Result<Vec<_>, _>>()` (並列では「最初」は非決定) |
| 全件のエラーを収集 | `partition(Result::is_ok)` で oks / errs に分ける |
| エラーは log のみ、成功だけ集める | `filter_map(|x| process(x).ok())` |
| 件数だけ必要 | `fold` で count |

## 浮動小数点 reduce

`values.par_iter().sum::<f64>()` は分割順で結果が微妙に変わる。会計・面付寸法・色値など結果が毎回違うと事故になる処理は sequential (精度が要るなら Kahan summation を sequential で)。並列化するなら出力互換を必ず確認する。

## 採用前に benchmark で確認する項目

- sequential 版と parallel 版の mean / stddev を small / medium / large で
- thread 数別: `RAYON_NUM_THREADS=1 / 4 / 8 cargo bench` (コード内固定は `ThreadPoolBuilder::new().num_threads(n)` + `pool.install`)
- 出力順序・エラー semantics が一致するか
- peak メモリ (並列化で上がる)、CPU 使用率 (100% 近くまで上がるか、I/O 待ちで低いか)
- parallel が clear に速い時だけ採用。marginal / none / 劣化なら撤退
