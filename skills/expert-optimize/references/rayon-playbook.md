# Rayon Playbook — 並列化判断と実装パターン

<!--
機能概要: Rust の Rayon (data parallelism crate) を安全に使うための判断表と実装パターン。
作成意図: 並列化は強力だが事故りやすい。安易な par_iter() で「むしろ遅くなる」
         「順序が壊れる」「Mutex 競合で詰まる」事故を構造的に防ぐ。
注意点: I/O-bound には使わない。UI / COM thread には使わない。
       single-thread より速いことを benchmark で実測してから採用する。
       公式ドキュメントの "high-level parallel constructs are the simplest, generally efficient way"
       (Rayon docs.rs) という設計思想に従う。
-->

## Rayon の位置づけ

Rayon は **CPU-bound な data parallelism** のための crate。
標準 iterator の並列版 (`ParallelIterator` trait) を提供する。
([Rayon docs.rs](https://docs.rs/rayon/latest/rayon/iter/trait.ParallelIterator.html) — par_iter / par_iter_mut / into_par_iter で並列 iterator を作る)

**Rayon は I/O 待ちを隠す道具ではない**。I/O-bound には async + concurrency limit が正解。

---

## Rayon を採用してよい条件 (全て満たすこと)

- [ ] **CPU-bound** である (計算が支配的)
- [ ] 各要素の処理が **独立** している (要素間の依存がない)
- [ ] **shared mutable state を使わない** (`Mutex<Vec>` への push 等を避ける)
- [ ] 1 要素あたりの処理粒度が **十分大きい** (目安: > 1 µs、できれば > 100 µs)
- [ ] 入力サイズが **十分大きい** (目安: > 数百要素)
- [ ] **順序が不要**、または collect で順序を復元できる
- [ ] reduce / collect の結果が **決定的** である (浮動小数点の非結合的 reduce に注意)
- [ ] **エラー集約方法が明確** (最初の 1 件 / 全件 / 集約)
- [ ] **single-thread より速いことを benchmark で実測** できる

---

## Rayon を使わない条件 (どれか 1 つでも該当すれば NG)

- I/O-bound (file read / HTTP / DB / socket)
- COM / UI / InDesign / WebView / Tauri Window などスレッド制約のある処理
- 小さい collection (input size threshold は実測で決めるが、目安で 数百要素未満)
- lock 付き shared state を更新する処理 (`Mutex<Vec<_>>::push` 等)
- 浮動小数点の非結合的 reduce が結果差分を生む処理
- エラーの最初の 1 件が意味を持つ処理 (順序仕様がある)
- メモリ帯域がボトルネック (CPU 並列化しても帯域で詰まる)

---

## 良い並列化パターン

### 1. map → collect (最もシンプル、最も安全)

```rust
use rayon::prelude::*;

let results: Vec<_> = pages
    .par_iter()
    .map(|page| analyze_page(page))
    .collect();
```

- 各 page が独立
- shared mutable state なし
- collect で順序保持される (`Vec` に集める場合)

### 2. filter_map → collect (None を除外しつつ collect)

```rust
let valid: Vec<_> = items
    .par_iter()
    .filter_map(|item| validate(item).ok())
    .collect();
```

### 3. par_chunks (chunk 単位で処理)

```rust
let results: Vec<_> = data
    .par_chunks(1024)
    .map(|chunk| process_chunk(chunk))
    .collect();
```

- 粒度を chunk size で制御
- chunk 内 sequential、chunk 間 parallel
- 1 要素の処理が小さい場合に有効

### 4. fold + reduce (集約)

```rust
let total: f64 = items
    .par_iter()
    .fold(|| 0.0_f64, |acc, item| acc + item.score)
    .sum::<f64>();

// または reduce
let total: f64 = items
    .par_iter()
    .map(|item| item.score)
    .reduce(|| 0.0, |a, b| a + b);
```

> 浮動小数点の reduce は **非結合的**。順序が変わると結果が微妙に変わることに注意。
> 完全な決定性が必要なら sequential。

### 5. thread local accumulation → final merge

```rust
use rayon::prelude::*;

let groups: HashMap<Category, Vec<Item>> = items
    .par_iter()
    .fold(
        || HashMap::<Category, Vec<Item>>::new(),
        |mut acc, item| {
            acc.entry(item.category).or_default().push(item.clone());
            acc
        },
    )
    .reduce(
        || HashMap::new(),
        |mut a, b| {
            for (k, v) in b {
                a.entry(k).or_default().extend(v);
            }
            a
        },
    );
```

> thread local に貯めて最後に merge → lock を一切持たない。
> Mutex<HashMap> への並列 insert より高速かつ安全。

### 6. Result<Vec<_>, E> の collect (最初のエラーで止まる)

```rust
let results: Result<Vec<_>, MyError> = items
    .par_iter()
    .map(|item| process(item))
    .collect();
```

> 順序保証されないため、「最初の」エラーは仕様上 deterministic ではない。
> 全件のエラー収集が必要なら別パターン (下記)。

### 7. partition で成功 / 失敗を分ける

```rust
let (oks, errs): (Vec<_>, Vec<_>) = items
    .par_iter()
    .map(|item| process(item))
    .partition(Result::is_ok);

let oks: Vec<_> = oks.into_iter().map(Result::unwrap).collect();
let errs: Vec<_> = errs.into_iter().map(Result::unwrap_err).collect();
```

---

## 悪い並列化パターン (避ける)

### 1. par_iter + Mutex<Vec>::push (典型的アンチパターン)

```rust
// Bad
use rayon::prelude::*;
use std::sync::Mutex;

let results = Mutex::new(Vec::new());
items.par_iter().for_each(|item| {
    let r = process(item);
    results.lock().unwrap().push(r);  // 全 thread が lock を奪い合う
});
```

問題:
- Mutex 競合で sequential より遅くなる
- 順序が不定 (panic / poison risk)
- lock overhead が処理時間を上回る

→ **`map().collect()` に置き換える**:

```rust
// Good
let results: Vec<_> = items.par_iter().map(|item| process(item)).collect();
```

### 2. par_iter 内で I/O

```rust
// Bad: I/O-bound に Rayon
items.par_iter().for_each(|item| {
    std::fs::write(format!("out/{}.json", item.id), serialize(item)).unwrap();
});
```

問題:
- file write は I/O 待ちなので CPU 並列化の効果がない
- file system / disk が並列 write を捌けないと逆に遅い
- error handling が複雑化 (panic で thread が死ぬ)

→ **async + semaphore で concurrency limit**:

```rust
use tokio::sync::Semaphore;
let sem = Arc::new(Semaphore::new(8));
let handles: Vec<_> = items.into_iter().map(|item| {
    let sem = Arc::clone(&sem);
    tokio::spawn(async move {
        let _permit = sem.acquire().await.unwrap();
        tokio::fs::write(format!("out/{}.json", item.id), serialize(&item)).await
    })
}).collect();
```

### 3. par_iter 内で Tauri command / COM / UI 操作

```rust
// Bad: COM / UI thread 制約越境
items.par_iter().for_each(|item| {
    com_handle.update_item(item);  // COM apartment 違反 → クラッシュ or 不定動作
});
```

→ **sequential に戻す**、または UI thread にディスパッチ。

### 4. 小さい Vec への par_iter

```rust
// Bad: overhead が処理時間を上回る
let small: Vec<i32> = (0..20).collect();
let r: Vec<i32> = small.par_iter().map(|x| x * 2).collect();
```

→ **sequential で十分** (`small.iter()`)。
あるいは threshold 切り替え:

```rust
const PARALLEL_THRESHOLD: usize = 1000;

let r: Vec<_> = if items.len() < PARALLEL_THRESHOLD {
    items.iter().map(process).collect()
} else {
    items.par_iter().map(process).collect()
};
```

> threshold は実測で決める。

### 5. global cache を lock しながら処理

```rust
// Bad: 全 thread が同じ Mutex<HashMap> を奪い合う
let cache = Arc::new(Mutex::new(HashMap::new()));
items.par_iter().for_each(|item| {
    let mut c = cache.lock().unwrap();
    c.entry(item.key).or_insert_with(|| compute(item));
});
```

→ **DashMap (concurrent HashMap) を使う**、または thread local cache + final merge:

```rust
use dashmap::DashMap;
let cache: DashMap<Key, Value> = DashMap::new();
items.par_iter().for_each(|item| {
    cache.entry(item.key.clone()).or_insert_with(|| compute(item));
});
```

> ただし DashMap も無料ではない。**まず benchmark を取る**。

---

## エラー処理の設計

並列化はエラーの順序・集約方針を変える。**仕様変更にならないように設計する**。

| 仕様 | 推奨パターン |
|------|------------|
| 最初のエラーで停止、エラー内容は deterministic | sequential のまま (Rayon を諦める) |
| 最初のエラーで停止、内容は any でよい | `Result<Vec<_>, _>::collect` |
| 全件のエラーを収集 | `partition` で oks / errs に分ける |
| エラーは log だけ、success のみ集める | `filter_map(|x| process(x).ok())` |
| 件数集計だけ必要 | `fold` で count を持つ |

---

## 浮動小数点 reduce の決定性

```rust
// 非決定的 (実行ごとに微妙に違う結果になりうる)
let sum: f64 = values.par_iter().sum();

// 順序固定で決定的にしたい場合は sequential
let sum: f64 = values.iter().sum();

// または高精度 reduce (Kahan summation) を sequential で
fn kahan_sum(xs: &[f64]) -> f64 {
    let mut s = 0.0;
    let mut c = 0.0;
    for &x in xs {
        let y = x - c;
        let t = s + y;
        c = (t - s) - y;
        s = t;
    }
    s
}
```

> 業務処理 (会計・面付寸法・色値) で「結果が毎回微妙に違う」のは事故。
> 浮動小数点 reduce を Rayon で並列化する前に、結果の互換性を必ず確認する。

---

## benchmark で必ず確認する項目

並列化を採用する前に:

- [ ] sequential 版 benchmark (mean / stddev)
- [ ] parallel 版 benchmark (mean / stddev)
- [ ] 入力サイズ small / medium / large の 3 段階
- [ ] thread 数の差分 (1 / 4 / 8 / 物理コア数)
- [ ] 出力順序が一致するか (Vec で collect なら通常一致)
- [ ] エラー semantics が一致するか
- [ ] メモリ使用量 (並列化で peak が上がる)
- [ ] CPU 使用率 (並列化で 100% に近づくか、I/O 待ちで低空飛行か)

### thread 数の制御

```rust
// グローバル
rayon::ThreadPoolBuilder::new()
    .num_threads(8)
    .build_global()
    .unwrap();

// scoped
let pool = rayon::ThreadPoolBuilder::new().num_threads(4).build().unwrap();
let result = pool.install(|| items.par_iter().map(process).collect::<Vec<_>>());
```

### `RAYON_NUM_THREADS` 環境変数

benchmark 時に環境変数で制御:

```bash
RAYON_NUM_THREADS=1 cargo bench  # sequential 比較
RAYON_NUM_THREADS=4 cargo bench
RAYON_NUM_THREADS=8 cargo bench
```

---

## 採用の判断フロー

```text
1. CPU-bound か?
   - No (I/O-bound) → async + concurrency limit
   - Yes → 次へ

2. 要素間依存があるか?
   - Yes → sequential、または計算グラフを再設計
   - No → 次へ

3. 入力サイズが十分大きいか? (目安 > 数百)
   - No → sequential
   - Yes → 次へ

4. 1 要素の処理粒度が十分か? (目安 > 1 µs)
   - No → par_chunks で粒度を上げる、または sequential
   - Yes → 次へ

5. shared mutable state を使うか?
   - Yes → thread local + merge、または DashMap、または sequential
   - No → 次へ

6. 順序 / エラー semantics は仕様と整合するか?
   - No → sequential
   - Yes → 次へ

7. sequential 版と parallel 版の Before/After bench を取る
   - parallel が clear に速い → 採用
   - marginal / none → 撤退
   - parallel が遅い → 撤退
```

---

## 参考: Rayon の高水準 API

公式 docs.rs では「高水準の parallel constructs が最も単純で、一般に効率的」とされている。
([Rayon docs.rs](https://docs.rs/rayon/latest/rayon/) — high-level constructs being the simplest, generally efficient way)

優先順位:
1. `par_iter()` / `par_iter_mut()` / `into_par_iter()` — 既存 iterator パターンを並列化
2. `par_chunks()` / `par_chunks_mut()` — 粒度制御
3. `par_sort()` / `par_sort_unstable()` — 並列 sort
4. `join()` — 2 つの独立タスクを並列実行
5. `scope()` — borrow 越しに scoped 並列タスクを spawn
6. `ThreadPoolBuilder` — 専用 pool が必要なときだけ

低水準 (channel, custom executor) を自前で組む前に、まず高水準で試す。
