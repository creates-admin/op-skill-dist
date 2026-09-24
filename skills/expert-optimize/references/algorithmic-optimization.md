# Algorithmic Optimization — 計算量改善パターン

並列化より先に計算量を下げる。micro optimization (`u32` vs `usize` 等) は対象外。

## 判断フロー

1. ホットパスでない → 触らない
2. n が確実に 100 未満 → 触らない (HashMap 構築などの overhead の方が大きい)
3. 計算量を 1 段下げられる → このファイル。下げられない → I/O / allocation / 並列化を検討
4. 改善が誤差レベル → 撤退。そうでなければ実装 + Before/After

**運用上の n の最大値で判断する** (「今は動く」ではなく)。O(n²) は n = 1,000 で 100 万 op (許容圏)、n = 10,000 で 1 億 op (破綻)。

業務データの n の目安:

| 文脈 | 典型 | 最大 |
|---|---|---|
| InDesign ジョブの page_count / PDF page_count | 数〜数十 | 数百〜数千 |
| 検版・校正 rule_count | 数十〜数百 | 数千 |
| OCR block / line / char | 数百〜数千 | 数万 |
| 発注書 item / active job | 数〜数十 | 数百 |
| 監視 directory の file_count | 数百 | 数万 |
| IDML story / spread | 数十 | 数百 |

---

## パターン

### nested loop → HashMap index (O(n*m) → O(n + m))

```rust
let rule_index: HashMap<&str, &Rule> = rules.iter().map(|r| (r.target_id.as_str(), r)).collect();
for item in items {
    if let Some(rule) = rule_index.get(item.id.as_str()) { /* ... */ }
}
```

適用基準: 内側が 100 件以上、または n × m > 10,000。内側が常に数個ならネストのままが速い。`Vec::contains` 多重利用 → `HashSet` も同じ基準 (`if seen.insert(id)` で初出判定を兼ねる)。

### repeated sort → sort once + binary_search (O(m·n log n) → O((n + m) log n))

loop 外で 1 回 sort し、各クエリは `binary_search_by_key`。同値の順序保持が不要なら `sort_unstable_by_key`。

### repeated regex compile → static LazyLock

```rust
static JOB_ID_RE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^[A-Z]{3}-\d{6}$").unwrap());
```

`std::sync::LazyLock` は Rust 1.80+。それ以前は `once_cell::sync::Lazy`。

### repeated parse → parse once + typed intermediate

loop 内の同一入力の parse を loop 外へ出し、typed のまま持ち回る (serialize は外へ出す時だけ)。

### 重複検出 → canonical key + hash (O(n²) → O(n))

全ペア比較をやめ、正規化キー / 内容 hash で `HashMap<Key, Vec<&T>>` に bucket 化し、`len() > 1` の bucket だけ扱う。

### 区間衝突 → sweep line (O(n²) → O(n log n))

端点を `(t, Start(i) | End(i))` の event にして sort し、active set を 1 回走査する。面付の配置衝突・スケジュール重なり・bbox 判定。同時刻の Start/End の順序 (閉区間か半開区間か) を既存仕様に合わせる。

### 依存関係 → topological sort (O(n + e))

Kahn's algorithm (in_degree 0 から剥がす) か `petgraph::algo::toposort`。出力件数 < ノード数なら循環あり (循環検出を兼ねる)。

### 範囲集計 → prefix sum

`prefix[i + 1] = prefix[i] + v` を事前計算し `[l, r)` の和を `prefix[r] - prefix[l]` で O(1)。更新が多いなら Fenwick tree / segment tree。

---

## 業務ドメイン別の典型改善

| 処理 | Before | After |
|---|---|---|
| 検版・差分検出 | 全ページ × 全ページの全ピクセル比較 | ページごとの canonical hash (perceptual hash / 正規化 text hash) で bucket 化し、bucket 内だけ詳細比較 |
| 校正ルール適用 | rule × text の全文走査 | literal は Aho-Corasick で 1 走査、regex は compile once、ngram は inverted index |
| OCR 候補統合 | 全候補の総当たり | page / line / bbox bucket で grouping し bucket 内だけ比較 |
| IDML / 面付 | spread / page item を毎回 XML から線形検索 | parse once + spread_id / page_id / story_id の HashMap index |
| ファイル監視 | 毎ポーリング全 walk | mtime / inode manifest cache + notify によるイベント駆動 (`io-and-batching.md`) |
| 発注書集計 | order × item の SQL N+1 | JOIN 1 回 + group by |

---

## 原則とアンチパターン

- データ構造の選択理由を 1 行コメントに残す (例: `// rule_id index で線形探索を排除`)
- sweep line / segment tree / Aho-Corasick など高度なアルゴリズムは境界値・空入力・1 要素・最大規模の 4 ケース以上をテストする
- n = 10 で index 化しない / 順序不要なのに `BTreeMap`・`IndexMap` を使わない
- 自前 hash 関数を書かない (決定性が必要なら `BTreeMap` か固定 hasher)
- 「O(log n) の方が偉い」と定数倍・読みやすさを無視しない / segment tree 等を要件に対し過剰に持ち込まない
