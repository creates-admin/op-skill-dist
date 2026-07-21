# Risk and Rollback — リスク分類と撤退条件

<!--
機能概要: 最適化のリスクレベル分類と、apply mode での撤退条件・rollback 手順。
作成意図: 性能改善は「速くしたつもり」が最も危険。事故を起こす前に撤退する判断基準を構造化する。
注意点: 高リスク変更は op-run agent 単独では apply しない。司令官にエスカレーションする。
-->

## リスクレベル分類

| Level | 例 | apply 単独可否 |
|-------|---|---------------|
| **low** | index 追加 / repeated parse 削減 / with_capacity / regex compile 位置変更 / 明らかな N+1 削減 / 既存 API を使った batch 化 | ○ |
| **medium** | データ構造変更 (Vec → HashMap) / cache 追加 (bounded) / 処理順序変更なしの並列化 / streaming 化 / lazy load | ○ (Before/After 必須) |
| **high** | アルゴリズム全面変更 / 処理順序変更 / 非同期化 / cache invalidation が必要 / floating point reduce 順序変更 / worker pool 導入 / unsafe / shared state を伴う並列化 | × (司令官エスカレーション) |

---

## low risk の特徴

- 既存挙動・出力・順序を変えない
- 入出力インターフェースが変わらない
- 改善ロジックが明確 (例: 「O(n²) を HashMap で O(n) に」)
- 1 ファイル / 1 関数で完結
- 既存テストで互換性が確認できる
- benchmark で改善が clear に出る

例:

```rust
// Before: O(n²)
for x in xs { for y in ys { if x.id == y.id { ... } } }

// After: O(n + m)
let index: HashMap<_, _> = ys.iter().map(|y| (y.id, y)).collect();
for x in xs { if let Some(y) = index.get(&x.id) { ... } }
```

```rust
// Before: 関数呼び出しごとに regex compile
fn validate(s: &str) -> bool {
    let re = Regex::new(r"...").unwrap();
    re.is_match(s)
}

// After: LazyLock で 1 回 compile
static RE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"...").unwrap());
fn validate(s: &str) -> bool { RE.is_match(s) }
```

---

## medium risk の特徴

- 既存挙動は変えないが内部実装が変わる
- 複数ファイルに渡る
- cache を導入する (invalidation 戦略は明確)
- streaming 化で処理順序は維持
- 並列化するが順序を Vec で復元
- bench を慎重に取る必要がある (small / medium / large 全部)

例:

```rust
// データ構造変更: Vec → HashMap (lookup 改善)
struct State {
    // Before: items: Vec<Item>,
    items: HashMap<ItemId, Item>,
}
// 全ての lookup 経路を update する必要がある
```

```rust
// 並列化 (順序維持)
let results: Vec<_> = pages.par_iter().map(analyze).collect();
// Vec collect で順序保持
```

```rust
// bounded cache 追加
let cache: LruCache<Key, Arc<Value>> = LruCache::new(NonZeroUsize::new(1024).unwrap());
// invalidation: data 更新時に該当 key を remove
```

---

## high risk の特徴

- 既存挙動が微妙に変わる可能性がある
- 順序・決定性・エラー semantics が変わる
- cache invalidation が複雑
- floating point reduce で結果差分
- async 化で error propagation が変わる
- shared state を増やす (lock / channel)
- unsafe を含む
- 周辺コードに大きな影響

例:

```rust
// アルゴリズム全面変更: O(n²) line matching → Myers diff
// 出力フォーマットが微妙に変わる可能性、テスト全 update が必要
```

```rust
// floating point reduce の並列化
let sum: f64 = values.par_iter().sum();
// 順序非結合性で結果が誤差レベル変わる → 業務影響を確認
```

```rust
// 同期 → async 化
// before: fn process() -> Result<Output>
// after: async fn process() -> Result<Output>
// 呼び出し側全部の async 化波及
```

high risk は **必ず司令官エスカレーション**。op-run agent 単独で apply しない。

---

## 撤退条件 (apply mode)

以下のいずれかに該当した場合、変更を取り下げるか司令官にエスカレーションする。

### 1. 改善率が測定誤差内 (none)

```text
Before: mean = 250 ms, stddev = 20 ms
After:  mean = 245 ms, stddev = 18 ms
improvement = 5 ms / combined_stddev ≈ 27 ms → none
```

→ **撤退**。Direct Mode では人間向けに「改善なし」を報告してよい。OP-managed Mode では apply report の decision="reverted" + measurement に構造化して返し、Issue コメント化は commander / OP skill が判断する。

### 2. ベンチマーク不安定 (unstable)

```text
before_stddev_ms > before_mean_ms * 0.2
or after_stddev_ms > after_mean_ms * 0.2
例: mean = 100 ms, stddev = 30 ms → 不安定 (30 > 100 * 0.2)
```

→ **判定保留** (decision = deferred)。benchmark 環境を改善 (ノイズ減らす / 入力規模を上げる) するか、
ベンチ条件改善 Issue を別起票。

### 3. 既存テストが追加・更新を要求するが書ける根拠が不足

最適化に伴いテスト fixture / 期待値の update が必要だが、何が正しいか判断できない場合。

→ **撤退**。test-expert に Issue 起票して仕様確認を依頼。

### 4. 入出力互換が証明できない

- 出力差分 (順序 / 値 / フォーマット) が出る
- エッジケース挙動 (empty / null / 巨大) が変わる
- 例外型・エラーメッセージが変わる
- panic / Result の境界が変わる

→ **撤退**。互換性が確保できる別アプローチを検討。

### 5. 可読性劣化に対して改善幅が小さい

- borrow 地獄になった
- ネスト 3 階層を超えた
- 1 関数 100 行を超えた
- コメントが「なぜ速いか」を長文で書く必要がある
- 非標準的な hack (unsafe / SIMD intrinsics / inline asm)

→ **撤退**。可読性を維持できる範囲で再設計。

### 6. 並列化により順序・決定性・エラー集約が変わる

- 結果順序が不定になる
- 浮動小数点 reduce で結果差分
- エラーの順序が仕様と違う
- 最初の 1 件で停止する仕様が「全件処理してから集約」に変わる

→ **撤退**、または sequential のまま、または仕様確認 Issue を起票。

### 7. lock / channel / shared state が増え、デッドロックリスク

- `Mutex<T>` を新設し、複数箇所で lock 順序が定義されない
- channel を新設し、bounded / unbounded の選択が曖昧
- worker pool の shutdown 経路が定義されない

→ **撤退**、または security-expert (深掘り) / review-expert (global review) にレビュー依頼を Issue 起票。

### 8. 高リスク変更を要求

上記「high risk」に該当する変更が必要と判明した場合。

→ **司令官エスカレーション**。

- Direct Mode: 以下の内容を人間向けに提示する (Issue コメントとして残してもよい)
- OP-managed Mode: 同内容を apply report の decision="escalated" + needs_human_decision /
  remaining_issues / assumptions[] に構造化して返す。Issue コメント化は commander / OP skill が判断する

明記する内容:

- 検出した bottleneck の概要
- 提案する high risk な改善方針
- リスク内容
- 推奨される代替案 (low / medium で対処できる代替があれば)

---

## rollback 手順

### worktree 隔離なら git で簡単に戻せる

```bash
# 全変更を破棄
git restore .

# 特定ファイルだけ戻す
git restore path/to/file.rs

# commit 済みなら revert (新しい revert commit を作る)
git revert <commit-sha>

# branch ごと捨てる (worktree 隔離なら影響なし)
git checkout main
git branch -D feature/perf-xxx
```

### 撤退理由の報告

- Direct Mode: 撤退理由を人間向け報告文として提示する (計測値 / 試みた改善 / 次アクション推奨)
- OP-managed Mode: Issue コメントは投稿せず、apply report の
  `decision` / `measurement` / `rollback` / `remaining_issues` に構造化して返す
  (commander / OP skill が Issue コメント化を判断する)

---

## エスカレーション (high risk)

high risk 最適化が必要と判明した場合は **司令官エスカレーション**。

- Direct Mode: bottleneck 概要・リスク内容・代替案・推奨判断を人間向けに提示
- OP-managed Mode: apply report の `decision="escalated"` + `needs_human_decision` /
  `remaining_issues` に構造化して返す

---

## CLAUDE.md 規約との整合

- **検証なしの実装は出荷しない** → benchmark + 既存テスト pass が必須
- **保守性・可読性を最優先** → 可読性劣化 vs 改善幅で判断、ネスト 2 維持
- **形式的美しさより実務的可読性** → unsafe / SIMD / inline asm は最終手段
- **同一問題で 2 回連続失敗したらアプローチを根本的に変更** → 撤退して再設計

---

## 撤退判断フロー

```text
1. After ベンチマークを取った
2. 統計判定 (clear / marginal / none / unstable)
   ratio = improvement_ms / combined_stddev_ms
   stddev_ratio_before = before_stddev_ms / before_mean_ms
   stddev_ratio_after  = after_stddev_ms / after_mean_ms

   - unstable (stddev_ratio_before > 0.2 or stddev_ratio_after > 0.2)
       → decision = deferred、benchmark 改善 Issue 起票
   - none (ratio < 1)
       → decision = reverted、撤退
   - marginal (1 <= ratio < 3) + 高リスク
       → decision = reverted、撤退
   - marginal + 低リスク
       → decision = applied、message に marginal 旨明記
   - clear (ratio >= 3) → 次へ

3. 既存テスト全 pass か?
   - No → 互換性確認、必要ならテスト update / 撤退
   - Yes → 次へ

4. 入出力互換が確認できるか?
   - No → decision = reverted、撤退
   - Yes → 次へ

5. 可読性劣化が許容範囲か?
   - No → decision = reverted、撤退、可読性を維持できる代替を検討
   - Yes → 次へ

6. リスクレベルは low / medium か?
   - high → decision = escalated、司令官エスカレーション
   - low / medium → decision = applied、コミット
```
