# Rust Optimization — clone / allocation / メモリ / Rust 固有の判断

優先順位は SKILL.md「3. Optimize」。並列化は `rayon-playbook.md`、async I/O は `io-and-batching.md`。

## 対象を絞る

- clone / allocation 最適化は **1 KB 超 または 1,000 要素超、かつホットパス** だけ。外れるものは ignored_noise
- dhat / heaptrack で allocation が bottleneck と確認してから触る
- borrow 地獄で可読性が壊れるなら撤退

## clone / borrow

| 形 | 置き換え |
|---|---|
| 大型 `Vec` / `HashMap` の引数渡しで clone | `&[T]` / `&T` |
| `String` 引数 | `&str` (呼び側の `.to_string()` も消える)。条件付き書き換えなら `Cow<'_, str>` で必要時だけ alloc |
| 複数 task / thread に渡す read-only 大型データ | `Arc<T>`。`Arc::clone(&x)` は refcount 増加のみだが、`(*x).clone()` は中身の deep clone |
| `&mut self` から大型 field を取り出す | `std::mem::take` / `mem::replace` (clone せず所有権移動) |
| HashMap key の `.to_string()` 毎回 alloc | borrow ベースの key 型 (寿命が元データに縛られるので合う場合のみ) |
| collect して再走査するだけ | chain して 1 回で済ませる / collect 自体を消す |
| parse → 加工 → serialize → 再 parse | typed のまま加工し、外へ出す時だけ serialize |

## capacity

既知サイズで `> 1,000` かつホットパスなら `Vec::with_capacity` / `String::with_capacity`。数十なら不要 (指数 grow で十分)。size_hint が効く `(0..n).map(f).collect()` は collect 側が抑える。

## drop タイミングと大型 buffer

- 使い終わった大型変数は block scope に閉じ込めて早期 drop する (関数末尾まで生かすとその間 peak RSS に乗る)
- パイプライン (render → preprocess → OCR) は段階ごとに `drop` し、全段階の buffer を struct field に同時保持しない
- 全ページの bitmap を `Vec` に retain せず 1 ページずつ streaming 処理する
- peak RSS は `/usr/bin/time -v <cmd>` の Maximum resident set size で Before/After を比べる

## bounded cache

- unbounded cache / unbounded queue は禁止 (OOM 経路)
- 容量上限だけなら `lru::LruCache` (`NonZeroUsize` で capacity)、TTL が要るなら `moka` (`max_capacity` + `time_to_live`)
- invalidation 戦略 (更新時にどの key を消すか) を決めてから入れる。決められないなら入れない
- 読み多めなら値を `Arc<V>` にして lock 保持時間を短くする

## regex / parse / serde

- regex は `static LazyLock` で compile once (`algorithmic-optimization.md`)
- parser の使い分け:

| crate | 用途 |
|---|---|
| `serde_json` | JSON 全般 |
| `simd-json` | 巨大 JSON (serde 互換 API)。`serde_json` が遅いと決めつける前に benchmark |
| `quick-xml` | XML / IDML の streaming (event-based、低 alloc) |
| `roxmltree` | DOM 全体が必要な XML (alloc 多め) |
| `lopdf` / `pdf` | PDF。大型は streaming 必須 |

## その他の Rust 固有ポイント

- iterator vs explicit loop の性能差は通常誤差。読みやすさで選ぶ (early exit が複雑・複数 collection へ push・error 集約が複雑なら loop)
- `Result<Vec<_>, _>` への collect は最初のエラーで止まる
- `Path` ↔ `String` の往復をしない (`&Path` のまま扱う。non-UTF8 path 対応にもなる)
- hasher: 内部処理だけなら `ahash` / `FxHashMap` で速くなることがある。**外部入力・Tauri command 入力を key にするなら DoS 耐性のある標準 SipHash のまま**
- 最適化で `?` 経路に `unwrap` / `panic!` を混入させない
- `iter()` → `into_iter()` 置換は move を起こし意味が変わりうる
- `Arc<Mutex<T>>` → `Arc<RwLock<T>>` の置換だけで lock 競合は解決しない

## 最終手段

- `#[inline]` は通常不要 (LLVM に任せる)。`#[cold]` はエラーパスの分岐ヒント
- SIMD は scalar 版の benchmark を先に取り、倍率を実測してから
- unsafe は原則禁止。どうしても必要なら `# Safety` に invariants を列挙し、miri / sanitizer で確認し、high risk として `escalated`

## アンチパターン

- n = 5 の `Vec::contains` を `HashSet` 化 / 計測なしの `Cow` 化・`SmallVec`・`arrayvec` 導入
- clone を全部消そうとして借用地獄 / clone 1 個のために unsafe
- `Box` で十分なものを `Arc` 化 / 小さい struct を `Box` に入れる
- crate を書き換えて bench を取らない
