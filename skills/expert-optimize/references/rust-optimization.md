# Rust Optimization — Rust 個別最適化判断表

<!--
機能概要: Rust 特有の最適化判断 (clone / Cow / Arc / iterator / collect / regex / serde 等)。
作成意図: Rust では「iterator chain と explicit loop の好み」のような
         micro-level の議論に陥りやすい。本ファイルは「実測で意味のある」
         Rust 固有の改善カテゴリだけを集める。
注意点: unsafe は原則禁止。SIMD / inline hint は最終手段。
       並列化は rayon-playbook.md を別途参照。
-->

## 優先順位 (Rust 案件)

1. **アルゴリズム** (`algorithmic-optimization.md`)
2. **不要 I/O 削減** (`io-and-batching.md`)
3. **不要 allocation / clone 削減** (本ファイル)
4. **regex / parse / sort の回数削減** (本ファイル)
5. **iterator / loop の明確化** (本ファイル)
6. **Rayon 並列化** (`rayon-playbook.md`)
7. **unsafe / SIMD** (原則禁止、最終手段)

---

## clone / borrow

### 大型データの clone を borrow に置き換える

**Before**:

```rust
fn process_jobs(jobs: Vec<Job>) -> Result<Vec<Output>> {
    for j in jobs.clone() {  // 巨大 Vec の clone
        // ...
    }
}
```

**After**:

```rust
fn process_jobs(jobs: &[Job]) -> Result<Vec<Output>> {
    for j in jobs {
        // ...
    }
}
```

**判断基準**: clone 対象が `> 1KB` または要素数 `> 1000`、かつホットパス。

### `String` clone を `&str` / `Cow` に

**Before**:

```rust
fn label(s: String) -> String { format!("[{}]", s) }
let msg = label("hello".to_string());
```

**After**:

```rust
fn label(s: &str) -> String { format!("[{}]", s) }
let msg = label("hello");

// あるいは Cow で「変えたいときだけ alloc」
fn maybe_normalize(s: &str) -> Cow<'_, str> {
    if s.contains(' ') {
        Cow::Owned(s.replace(' ', "_"))
    } else {
        Cow::Borrowed(s)
    }
}
```

### `Arc<T>` での共有 (read-only な大型データ)

複数の async task / thread に同じ大型 read-only データを渡すなら `Arc<T>`:

```rust
let manifest = Arc::new(load_manifest()?);

for task in tasks {
    let m = Arc::clone(&manifest);  // pointer copy のみ
    tokio::spawn(async move {
        process(&m, task).await
    });
}
```

> `Arc::clone` は cheap (atomic refcount 増減)。`(*manifest).clone()` で中身を deep clone してはいけない。

### `iter().cloned().collect()` を借用に

**Before**:

```rust
let names: Vec<String> = users.iter().map(|u| u.name.clone()).collect();
for n in &names {
    // ...
}
```

**After** (collect 不要):

```rust
for u in &users {
    let n = &u.name;
    // ...
}
```

### `.to_string()` / `.to_owned()` を避ける

```rust
// Bad: HashMap key を毎回 alloc
for u in &users {
    cache.insert(u.id.to_string(), u.score);
}

// Good: key 型を borrow ベースに
let cache: HashMap<&str, f64> = users.iter().map(|u| (u.id.as_str(), u.score)).collect();
// borrow 寿命が users の寿命に縛られる場合のみ
```

---

## Vec の容量制御

### `with_capacity` で再 alloc を排除

**Before**:

```rust
let mut out = Vec::new();
for i in 0..n {
    out.push(transform(i));
}
```

**After**:

```rust
let mut out = Vec::with_capacity(n);
for i in 0..n {
    out.push(transform(i));
}
```

> n が大きい (> 1,000) かつホットパスのみ意味がある。
> 数十要素なら ignored_noise (Vec の指数 grow で十分速い)。

### `String::with_capacity` で realloc 排除

```rust
let mut buf = String::with_capacity(estimated_size);
for line in lines {
    buf.push_str(line);
    buf.push('\n');
}
```

### `iter().collect::<Vec<_>>()` の代替

```rust
// 既知サイズなら map → collect が realloc を内部最適化する
let out: Vec<_> = (0..n).map(transform).collect();

// `collect_into` (nightly) や FromIterator の size_hint 経由で再 alloc 抑制
```

---

## regex / parse / serde

### regex の compile 1 回化

`algorithmic-optimization.md` の「repeated regex compile → static LazyLock」節を参照。
Rust 1.80+ は `std::sync::LazyLock`、それ以前は `once_cell::sync::Lazy`。

### serde roundtrip の排除

```rust
// Bad: parse → 加工 → serialize → parse
let m: Manifest = serde_json::from_str(&json)?;
let updated = update(m);
let json2 = serde_json::to_string(&updated)?;
let m2: Manifest = serde_json::from_str(&json2)?;

// Good: typed のまま扱う
let m: Manifest = serde_json::from_str(&json)?;
let updated = update(m);
// 必要時に serialize するだけ
```

### parser の使い分け

| ライブラリ | 用途 | 性能特性 |
|-----------|------|---------|
| `serde_json` | JSON 全般 | balanced |
| `simd-json` | 巨大 JSON の parse | SIMD で高速、API は serde 互換 |
| `quick-xml` | XML / IDML | streaming、event-based、低 alloc |
| `roxmltree` | XML 全 DOM が必要 | 簡潔だが alloc 多め |
| `pdf` / `lopdf` | PDF | 大型 PDF は streaming 必須 |

---

## iterator vs explicit loop

**性能差は通常誤差**。読みやすさで選ぶ。
ただし以下のケースは explicit loop の方が明確に速い:

- early exit が複雑 (multiple break / continue)
- 中で複数の collection に push する
- error 集約のロジックが複雑

> iterator chain を「速いから」という理由で書かない。
> CLAUDE.md (ガード節・ネスト 2) を満たす explicit loop の方が読みやすい場合がある。

---

## collect の使い所

### `.collect()` してから再走査を避ける

**Before**:

```rust
let scores: Vec<f64> = users.iter().map(|u| compute(u)).collect();
let total: f64 = scores.iter().sum();
let max = scores.iter().fold(f64::MIN, |a, b| a.max(*b));
```

**After**:

```rust
let mut total = 0.0;
let mut max = f64::MIN;
for u in &users {
    let s = compute(u);
    total += s;
    max = max.max(s);
}
```

### `Result<Vec<_>>` の collect

```rust
// Result<Vec<_>, E> に collect すると最初のエラーで止まる
let parsed: Result<Vec<_>, _> = lines.iter().map(parse).collect();
```

---

## sort / binary_search

### sort once + binary_search

```rust
// Bad: 毎クエリで sort
for q in queries {
    let mut s = items.clone();
    s.sort_by_key(|x| x.priority);
    let pos = s.binary_search_by_key(&q.priority, |x| x.priority);
}

// Good: sort once
let mut sorted = items.clone();
sorted.sort_by_key(|x| x.priority);
for q in queries {
    let pos = sorted.binary_search_by_key(&q.priority, |x| x.priority);
}
```

### `sort_unstable` で十分な場合

```rust
// 同値の順序保持が不要なら unstable の方が速い
items.sort_unstable_by_key(|x| x.id);
```

---

## Path / PathBuf

```rust
// Bad: Path ↔ String 変換を往復
let s = path.to_str().unwrap().to_string();
let p2 = PathBuf::from(s);

// Good: Path のまま扱う
fn process(path: &Path) -> Result<()> { /* ... */ }
```

OS 文字列 (`OsString` / `OsStr`) も同様。Windows の non-UTF8 path 対応にもなる。

---

## HashMap / HashSet の hasher

```rust
// 標準 DefaultHasher は SipHash で安全だが少し遅い
use std::collections::HashMap;
let m: HashMap<String, i64> = HashMap::new();

// より速い hasher (DoS 耐性が不要なら ahash / fxhash)
use ahash::AHashMap;
let m: AHashMap<String, i64> = AHashMap::new();
```

> Tauri command の入力 / 外部入力を key にする場合は DoS 耐性が必要 → 標準 DefaultHasher を使う。
> 内部処理だけなら ahash / fxhash で 30〜50% 速くなることがある。

---

## async / Tokio

async 内で同期 I/O を呼ばない・concurrent fetch・timeout などの詳細パターンは
`io-and-batching.md` の「同期 I/O on async runtime」「async + concurrency limit (I/O parallel)」
「sync I/O を `spawn_blocking` で隔離」節を参照。

主要ポイント:
- `async fn` 内で `std::fs::*` を直呼びしない → `tokio::fs` または `spawn_blocking`
- concurrent fetch は `futures::future::join_all` + Semaphore で concurrency 制限
- timeout は `tokio::time::timeout` で明示的に設定

---

## error / Result

### `?` 経路で `unwrap` / `panic!` を混入しない

```rust
// Bad: Result 経路に panic
fn load(path: &Path) -> Result<Config> {
    let s = std::fs::read_to_string(path)?;
    let c: Config = serde_json::from_str(&s).unwrap();  // panic 経路
    Ok(c)
}

// Good
fn load(path: &Path) -> Result<Config> {
    let s = std::fs::read_to_string(path)?;
    let c: Config = serde_json::from_str(&s)?;
    Ok(c)
}
```

> debug-expert との境界。性能改善でこれを混入させない。

---

## 機械語レベル (最終手段)

### `#[inline]` / `#[inline(always)]`

ホットパスの極小関数で、profile guided optimization が効かない場合に検討。
**通常は不要**。LLVM が判断する。

### `#[cold]`

エラーパスや初期化失敗パスに付与すると分岐予測のヒントになる。

### SIMD (`std::simd` / `wide` / `packed_simd_2`)

数値計算 (画像処理 / DSP / 集計) で有効。**通常は不要**。
SIMD を入れる前に必ず scalar 版で benchmark を取り、SIMD 化で何倍速くなるか実測する。

### `unsafe` は原則禁止

性能改善で unsafe を入れない。どうしても必要な場合は:

- Safety 不変条件をコメントで明記
- `# Safety` doc コメントで invariants を列挙
- miri / sanitizer でチェック
- security-expert にレビュー依頼 (深掘り security 鑑識)、または review-expert に global review 依頼

---

## アンチパターン (Rust)

- 「`Vec::contains` を `HashSet::contains` に変えた」だけで n が 5 のケース (改善なし)
- 巨大 `String::push_str` で `with_capacity` も bench も取らずに `Cow` 化 (誤差)
- `iter()` を `into_iter()` に変える「最適化」で意味の変更を起こす (move されてしまう)
- `clone()` を全部消そうとして借用地獄になる (可読性破壊)
- `Arc<Mutex<T>>` を `Arc<RwLock<T>>` に変えただけで lock 競合を解決した気になる
- `simd-json` を試さずに `serde_json` を遅いと決めつける (まず benchmark)
- crate を rewrite して bench を取らない

---

## 改善判断フロー (Rust 固有)

```text
1. benchmark で bottleneck が確認できたか? → No → 触らない
2. 計算量改善が可能か? → Yes → algorithmic-optimization.md
3. I/O 削減が可能か? → Yes → io-and-batching.md
4. clone / allocation を削減できるか?
   - 対象が大きい (> 1KB / > 1000 要素) か? → Yes → このファイル
   - 小さい? → 触らない
5. regex / parse / sort を 1 回化できるか? → Yes → このファイル
6. 並列化を検討するか? → rayon-playbook.md
7. 改善後に必ず Before/After ベンチ取得
```
