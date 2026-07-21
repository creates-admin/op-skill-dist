# Algorithmic Optimization — 競技プログラミング的思考を業務処理に適用する

<!--
機能概要: 計算量改善パターン全集。optimize-expert apply mode の中核 reference。
作成意図: 業務データ処理 (発注書 / 面付 / 検版 / 校正 / OCR / IDML / PDF / job 管理)
         における bottleneck の多くは、O(n²) → O(n) への計算量改善で解決する。
         Rayon で並列化する前に、まず計算量を下げる。
注意点: micro optimization (`u32` vs `usize` 等) は対象外。
       入力規模 n が小さいことが確実な箇所では適用しない。
-->

## 大原則

1. **まず計算量を見る**。並列化より計算量改善が先
2. **入力サイズの上限を特定する**。n の典型値と最大値を分けて考える
3. **改善後のテンプレが既存より読みやすいことを目指す**。HashMap index 化は読みやすい部類
4. **micro optimization に逃げない**。誤差レベルの改善のために可読性を犠牲にしない

> 「O(n²) のまま `par_iter()` で並列化しても、入力が増えれば負ける。
> まず O(n) や O(n log n) に落として、それでも重い場合に並列化する。」

---

## ステップ 1: 計算量を見る

### 入力サイズを特定する

| 業務文脈 | n の典型値 | n の最大値 |
|---------|----------|-----------|
| InDesign 1 ジョブの page_count | 4〜32 | 数百 |
| 検版・校正の rule_count | 数十〜数百 | 数千 |
| OCR の block / line / char count | 数百〜数千 | 数万 |
| 発注書の item count | 数十 | 数百 |
| job manager の active job count | 数 | 数百 |
| ファイル監視対象 directory の file count | 数百 | 数万 |
| PDF の page_count | 数〜数百 | 数千 |
| IDML の story / spread count | 数十 | 数百 |

### O 記法で見当をつける

| n | O(n) | O(n log n) | O(n²) | O(n³) |
|---|------|-----------|-------|-------|
| 100 | 100 | 700 | 10,000 | 1,000,000 |
| 1,000 | 1,000 | 10,000 | 1,000,000 | 1,000,000,000 |
| 10,000 | 10,000 | 130,000 | 100,000,000 | 破綻 |
| 100,000 | 100,000 | 1.7M | 破綻 | 破綻 |

n = 1,000 の O(n²) は 100 万 op、運用上は許容範囲だが、n = 10,000 で 1 億 op になり破綻する。
**「現状動くから OK」ではなく、運用上の n 最大値で判断する**。

### 改善の機会を見つけるサイン

- 二重 for で外側と内側が同じ collection
- ループ内で `.contains()` / `.iter().find()` / `.iter().position()`
- 同じデータに対する `sort_by` を毎回呼ぶ
- 同じ `Regex::new(...)` を関数 / loop ごとに呼ぶ
- 同じ JSON / XML を毎回 parse
- 比較対象を全組み合わせで突き合わせる (interval overlap / matching / diff)

---

## ステップ 2: 改善パターン

### nested loop → HashMap index

**Before** (O(n*m) — n × m の線形探索):

```rust
// items × rules の照合: O(items.len() * rules.len())
for item in items {
    for rule in rules {
        if rule.target_id == item.id {
            // ...
        }
    }
}
```

**After** (O(n + m) — index 構築 + 線形走査):

```rust
// rules を target_id で index 化
let rule_index: HashMap<&str, &Rule> = rules.iter()
    .map(|r| (r.target_id.as_str(), r))
    .collect();

for item in items {
    if let Some(rule) = rule_index.get(item.id.as_str()) {
        // ...
    }
}
```

> **判断基準**: rules.len() が 100 以上、または items.len() × rules.len() > 10,000。
> rules.len() が常に数個ならネスト loop のままで十分 (HashMap 構築コストの方が高い)。

### Vec::contains 多重利用 → HashSet

**Before** (O(n*m)):

```rust
let mut seen: Vec<JobId> = Vec::new();
for job in jobs {
    if !seen.contains(&job.id) {
        seen.push(job.id);
        // 処理
    }
}
```

**After** (O(n)):

```rust
let mut seen: HashSet<JobId> = HashSet::new();
for job in jobs {
    if seen.insert(job.id) {
        // 処理 (insert が true ならまだなかった = 初出)
    }
}
```

### repeated sort → sort once + binary_search

**Before** (O(m * n log n) — m 回 sort):

```rust
for query in queries {
    let mut sorted = items.clone();
    sorted.sort_by_key(|x| x.priority);
    // ... binary_search 等
}
```

**After** (O(n log n + m log n) — sort 1 回):

```rust
let mut sorted = items.clone();
sorted.sort_by_key(|x| x.priority);

for query in queries {
    let pos = sorted.binary_search_by_key(&query.priority, |x| x.priority);
    // ...
}
```

### repeated regex compile → static LazyLock

**Before**:

```rust
fn validate(s: &str) -> bool {
    let re = regex::Regex::new(r"^[A-Z]{3}-\d{6}$").unwrap();
    re.is_match(s)
}
```

**After**:

```rust
use std::sync::LazyLock;

static JOB_ID_RE: LazyLock<regex::Regex> =
    LazyLock::new(|| regex::Regex::new(r"^[A-Z]{3}-\d{6}$").unwrap());

fn validate(s: &str) -> bool {
    JOB_ID_RE.is_match(s)
}
```

> Rust 1.80+ で `std::sync::LazyLock` が安定。それ以前は `once_cell::sync::Lazy` を使う。

### repeated parse → parse once + typed intermediate

**Before**:

```rust
for op in operations {
    let manifest: Manifest = serde_json::from_str(&manifest_json)?;
    apply(op, &manifest);
}
```

**After**:

```rust
let manifest: Manifest = serde_json::from_str(&manifest_json)?;
for op in operations {
    apply(op, &manifest);
}
```

### duplicate detection → canonical key + hash

**Before** (O(n²)):

```rust
// 重複ファイル検出
for a in files {
    for b in files {
        if a != b && file_eq(a, b) {
            // 重複
        }
    }
}
```

**After** (O(n) + hash):

```rust
let mut by_hash: HashMap<u64, Vec<&File>> = HashMap::new();
for f in &files {
    let key = canonical_hash(f);  // 内容の hash や正規化キー
    by_hash.entry(key).or_default().push(f);
}
let duplicates: Vec<_> = by_hash.values().filter(|v| v.len() > 1).collect();
```

### interval overlap → sweep line

**Before** (O(n²) — 全組み合わせ):

```rust
for a in intervals {
    for b in intervals {
        if a != b && a.overlaps(b) {
            // 衝突
        }
    }
}
```

**After** (O(n log n) — 端点をソートして sweep):

```rust
#[derive(Clone, Copy)]
enum Event { Start(usize), End(usize) }

let mut events: Vec<(i64, Event)> = Vec::new();
for (i, iv) in intervals.iter().enumerate() {
    events.push((iv.start, Event::Start(i)));
    events.push((iv.end, Event::End(i)));
}
events.sort_by_key(|(t, _)| *t);

let mut active: HashSet<usize> = HashSet::new();
for (_, ev) in events {
    match ev {
        Event::Start(i) => {
            for &j in &active {
                // i と j は overlap
            }
            active.insert(i);
        }
        Event::End(i) => { active.remove(&i); }
    }
}
```

### graph dependency → topological sort

job 依存関係や IDML story 連結のような DAG は Kahn's algorithm / DFS で線形時間で処理。

```rust
// in_degree でレベルごとに処理 (Kahn's)
let mut in_degree: HashMap<NodeId, usize> = HashMap::new();
for (_, deps) in &graph {
    for &d in deps {
        *in_degree.entry(d).or_insert(0);
    }
}
for (n, _) in &graph {
    in_degree.entry(*n).or_insert(0);
}
for (_, deps) in &graph {
    for &d in deps {
        // d は依存先
        in_degree.entry(d).and_modify(|c| *c += 1);
    }
}

let mut ready: VecDeque<NodeId> = in_degree.iter()
    .filter(|(_, &c)| c == 0)
    .map(|(n, _)| *n)
    .collect();
let mut order = Vec::new();
while let Some(n) = ready.pop_front() {
    order.push(n);
    if let Some(deps) = graph.get(&n) {
        for &d in deps {
            let c = in_degree.entry(d).and_modify(|c| *c -= 1).or_insert(0);
            if *c == 0 { ready.push_back(d); }
        }
    }
}
```

### range query → prefix sum / segment tree

集計クエリが多いなら prefix sum で O(1) lookup:

```rust
// items[i] の累積を持っておく
let mut prefix = vec![0_i64; items.len() + 1];
for (i, &v) in items.iter().enumerate() {
    prefix[i + 1] = prefix[i] + v;
}

// [l, r) の和 = prefix[r] - prefix[l]
fn range_sum(prefix: &[i64], l: usize, r: usize) -> i64 {
    prefix[r] - prefix[l]
}
```

更新が多い場合は segment tree / Fenwick tree (BIT)。

---

## 業務ドメイン別の典型改善

### 検版・差分検出

```text
Before: 全ページ × 全ページの全ピクセル比較 → O(p² × pixel)
After:
  1. ページごとに canonical hash を作る (画像 → perceptual hash / 文字 → normalized text hash)
  2. hash bucket で候補を絞る
  3. bucket 内のみ詳細比較
  → O(p) + O(候補ペア × pixel)
```

### 校正ルール適用

```text
Before: rule × text の二重 loop で全文走査 → O(rules × text_len)
After:
  1. rule を pattern_kind ごとに分類 (literal / regex / ngram)
  2. literal は Aho-Corasick で 1 走査 → O(text_len + matches)
  3. regex は LazyLock で compile once
  4. ngram は inverted index
  → O(text_len × log(rules)) または O(text_len)
```

### OCR 候補統合

```text
Before: OCR 候補全比較 → O(c²)
After: page / line / bbox bucket で grouping → O(c + bucket 内 c²')
       各 bucket の c' は 数十以下に収まる
```

### IDML / 面付処理

```text
Before: spread / page item を毎回 XML から線形検索
After: parse once + spread_id / page_id / story_id で HashMap index
       → O(item_count) for index build, O(1) for lookup
```

### ファイル検出 / 監視

```text
Before: 全 directory walk を毎ポーリングごとに → O(file_count)
After:
  1. mtime / inode の manifest cache
  2. fs watcher (notify crate) でイベント駆動
  3. 全 walk は cache miss / 起動時のみ
  → イベント駆動で O(変更件数)
```

### 発注書集計

```text
Before: SQL N+1 で order × item を loop fetch
After: JOIN 1 回 + group by → O(orders + items)
       または batch IN 句 + frontend で再集計
```

### Tauri command で「全件取って frontend で filter」

```text
Before: backend が全件返す → frontend が全件 filter
After: filter 条件を invoke 引数で渡し、backend が絞る
       payload 削減 + frontend computed 削減
```

---

## 設計原則

- **計算量改善は並列化より優先**。`par_iter` で誤魔化さない
- **データ構造の選択理由を 1 行コメントに残す**
  - 例: `// O(n²) → O(n): rule_id index で線形探索を排除`
- **入力規模が小さい場合は単純な実装を維持する**
  - n = 10 で HashMap 構築は overhead の方が大きい
- **高度なアルゴリズム (sweep line / segment tree / Aho-Corasick) はテストを厚くする**
  - 境界値・空入力・1 要素・最大規模の 4 ケースは最低でも
- **iterator chain と explicit loop は読みやすさで選ぶ**。性能差は通常誤差

---

## アンチパターン (避けるべき)

- HashMap 構築コストを無視して n = 10 で index 化する (overhead で逆に遅い)
- `BTreeMap` を使う必要がないのに使う (順序不要なら `HashMap` で十分速い)
- `IndexMap` を使う必要がないのに使う (insertion order 不要なら HashMap)
- 自前 hash 関数を書く (`HashSet`/`HashMap` の DefaultHasher で十分、決定性が必要なら `BTreeMap` か固定 hasher)
- segment tree / Fenwick tree を要件に対して過剰に持ち込む
- 「O(n) より O(log n) の方が偉い」という思考停止 (定数倍と読みやすさを忘れる)
- 競プロの最適解を業務コードに直接持ち込む (テストせずに `unsafe` を使う等)

---

## 改善の判断フロー

```text
1. ホットパスか? → No → 触らない
2. 入力規模 n は? → 小さい (確実に < 100) → 触らない
3. 計算量を 1 段階下げられる? → Yes → 計算量改善 (このファイル)
                                → No  → I/O / allocation / 並列化 を検討
4. 改善が誤差レベル? → Yes → 触らない (撤退)
                    → No  → 実装 + Before/After 計測
```
