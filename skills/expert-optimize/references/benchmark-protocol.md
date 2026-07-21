# Benchmark Protocol — optimize-expert の心臓部

<!--
機能概要: optimize-expert apply mode の Before / After 計測手順を統一する。
作成意図: 「速くなったつもり」を構造的に排除する唯一の根拠。
         hyperfine / criterion / プロファイラの使い分け、warmup・min-runs・
         入力規模・cold/warm cache 区別・統計的有意性の判定までを 1 ファイルに集約。
注意点: scan モードでは benchmark を実行しない (Level 0 限定)。
       本ドキュメントは apply mode と investigation Issue 用。
-->

## 大原則

1. **計測なき最適化は出荷しない**
2. **Before / After は同じコマンド・同じ入力・同じ環境で取る**
3. **release build で測る** (debug build の数値で判断しない)
4. **warmup と min-runs を必ず入れる**
5. **平均値だけでなく標準偏差を見る** (有意性判定の根拠)
6. **入力規模は small / medium / large で分ける** (n が変わると勝負が逆転する場合がある)
7. **コマンド・環境・入力 fixture を report に残す** (再現可能性)

---

## ツール選択

| 計測対象 | 推奨ツール | 補助 |
|---------|----------|------|
| CLI / コマンド全体 / build / pipeline | hyperfine | — |
| Rust 関数単位 / data structure micro bench | criterion | cargo bench |
| Rust ホットパスの可視化 | cargo flamegraph / perf | samply |
| Rust メモリ / allocation | dhat / valgrind massif | heaptrack |
| Vue / TS frontend bundle | vite-bundle-visualizer / rollup-plugin-visualizer | — |
| Vue / TS runtime | Chrome DevTools Performance / Lighthouse | playwright + tracing |
| Flutter | flutter devtools / `--profile` mode | observatory |
| Tauri 全体 | hyperfine + Tauri 起動 / WebDriver 計測 | DevTools 接続 |

---

## hyperfine の使いどころ

CLI / build / コマンド全体の wall-clock を取る用途。warmup と min-runs が標準で入る。
([sharkdp/hyperfine](https://github.com/sharkdp/hyperfine) — warmup / min-runs / export-json 等を備えたコマンドラインベンチマークツール)

### 単発計測 (baseline 取得)

```bash
hyperfine \
  --warmup 3 \
  --runs 10 \
  --export-json target/bench/baseline.json \
  --export-markdown target/bench/baseline.md \
  './target/release/app input/sample-large.json'
```

### Before / After 比較 — 推奨パターン

`git checkout` を hyperfine 内に入れるとノイズが増える。
**before / after の binary を別名でビルドして並べて比較する** のが安定:

```bash
# 1. before binary を保存
git stash  # apply 中の変更を退避
cargo build --release --bin app
cp target/release/app target/bench/before
git stash pop

# 2. after binary をビルド
cargo build --release --bin app
cp target/release/app target/bench/after

# 3. 比較
hyperfine \
  --warmup 3 \
  --runs 10 \
  --export-markdown target/bench/result.md \
  './target/bench/before input/sample-large.json' \
  './target/bench/after input/sample-large.json'
```

### 入力規模別の比較

```bash
hyperfine \
  --warmup 3 \
  --runs 10 \
  --parameter-list size small,medium,large \
  --export-markdown target/bench/by-size.md \
  './target/bench/before input/sample-{size}.json' \
  './target/bench/after input/sample-{size}.json'
```

### cold / warm cache 区別 (I/O 影響時)

```bash
# cold: OS page cache を毎回クリア (Linux only)
hyperfine \
  --warmup 0 \
  --runs 10 \
  --prepare 'sync && echo 3 > /proc/sys/vm/drop_caches' \
  './target/bench/after input/large.idml'

# warm: warmup 込み (定常状態の wall-clock)
hyperfine \
  --warmup 3 \
  --runs 10 \
  './target/bench/after input/large.idml'
```

> Windows / WSL では drop_caches が使えないため、cold は実質「初回実行」として 1 回 + warm を別途取得する。

---

## criterion の使いどころ

Rust 関数単位の micro-benchmark。run 間の統計を保存し、回帰検出ができる。
([Criterion.rs](https://bheisler.github.io/criterion.rs/book/) — statistics-driven micro-benchmarking)

### `Cargo.toml` 設定

```toml
[dev-dependencies]
criterion = { version = "0.5", features = ["html_reports"] }

[[bench]]
name = "target_bench"
harness = false
```

### 最小 bench (`benches/target_bench.rs`)

`templates/criterion-bench-template.rs` の完全版を参照。

```rust
use criterion::{black_box, criterion_group, criterion_main, BenchmarkId, Criterion};

fn load_fixture(size: &str) -> Vec<Item> {
    // small / medium / large の fixture を返す
}

fn bench_target(c: &mut Criterion) {
    let mut group = c.benchmark_group("target_function");
    for size in ["small", "medium", "large"] {
        let input = load_fixture(size);
        group.bench_with_input(BenchmarkId::from_parameter(size), &input, |b, input| {
            b.iter(|| {
                let result = target_function(black_box(input));
                black_box(result);
            });
        });
    }
    group.finish();
}

criterion_group!(benches, bench_target);
criterion_main!(benches);
```

### 実行と結果

```bash
cargo bench --bench target_bench
# target/criterion/target_function/large/report/index.html を確認
# JSON 結果: target/criterion/target_function/large/new/estimates.json
```

### baseline 保存と比較

```bash
# baseline 保存 (Before)
cargo bench --bench target_bench -- --save-baseline before

# 改善後の比較 (After)
cargo bench --bench target_bench -- --baseline before
# 結果に "Performance has improved" / "regressed" / "no change" が表示される
```

---

## プロファイリング (どこが遅いか分からない時)

### Rust — flamegraph

```bash
cargo install flamegraph
sudo cargo flamegraph --bin app -- input/sample-large.json
# flamegraph.svg が生成される
```

WSL2 / Linux で perf 権限が必要。`echo -1 > /proc/sys/kernel/perf_event_paranoid` の調整が要る場合あり。

### Rust — samply (perf 不要、portable)

```bash
cargo install samply
samply record ./target/release/app input/sample-large.json
# Firefox Profiler 互換 UI で確認
```

### Rust — メモリ (dhat)

```toml
[dependencies]
dhat = { version = "0.3", optional = true }

[features]
dhat = ["dep:dhat"]
```

```rust
#[cfg(feature = "dhat")]
use dhat::{Dhat, DhatAlloc};

#[cfg(feature = "dhat")]
#[global_allocator]
static ALLOCATOR: DhatAlloc = DhatAlloc;

fn main() {
    #[cfg(feature = "dhat")]
    let _dhat = Dhat::start_heap_profiling();
    // ...
}
```

```bash
cargo run --release --features dhat
# dhat-heap.json が生成される → https://nnethercote.github.io/dh_view/dh_view.html で確認
```

### Frontend — bundle 分析 (Vite)

```bash
npx vite-bundle-visualizer
# stats.html が開く。treemap で大きい dependency を視覚的に確認
```

### Frontend — runtime profile

Chrome DevTools の Performance タブで record → load。
Lighthouse で Core Web Vitals (LCP / TBT / CLS) を取る。

### Flutter — profile mode + devtools

```bash
flutter run --profile -d <device>
# devtools URL が表示される → Performance タブで CPU profile
flutter build apk --release --analyze-size
# build/apk/release/snapshot/code-size-snapshot.json を確認
```

---

## 統計的有意性の判定

mean だけ見ると測定誤差を改善と勘違いする。**標準偏差 (stddev) と並べて判定する**。

単位は ms に統一する (criterion 等が ns / s で返す場合は ms に揃える)。

```text
improvement_ms     = before_mean_ms - after_mean_ms
combined_stddev_ms = sqrt(before_stddev_ms^2 + after_stddev_ms^2)
ratio              = improvement_ms / combined_stddev_ms
```

| 判定 | 条件 | 行動 / decision |
|------|------|----------------|
| **clear** | ratio >= 3 (両側で重ならない) | 実装確定、コミット (decision = applied) |
| **marginal** | 1 <= ratio < 3 | 実装可だが message に marginal 旨明記 (decision = applied / risk medium 以上は reverted) |
| **none** | ratio < 1 (誤差内 or 劣化) | **撤退**、改善なし報告 (decision = reverted) |
| **unstable** | before_stddev_ms > before_mean_ms * 0.2 or after_stddev_ms > after_mean_ms * 0.2 | 判定保留、ベンチ条件を改善 (decision = deferred) |

例:

```text
Before: mean = 250 ms, stddev = 8 ms, runs = 10
After:  mean = 220 ms, stddev = 6 ms, runs = 10

improvement = 30 ms
combined stddev ≈ sqrt(8² + 6²) ≈ 10 ms
improvement / combined_stddev ≈ 3.0 → clear (ぎりぎり)
```

```text
Before: mean = 250 ms, stddev = 30 ms, runs = 10
After:  mean = 240 ms, stddev = 28 ms, runs = 10

improvement = 10 ms
combined stddev ≈ 41 ms
improvement / combined_stddev ≈ 0.24 → none (撤退)
```

---

## ベンチマーク環境ノイズの抑制

特に Windows / WSL / クラウド VM で安定しない場合:

- 他プロセスを止める (browser, IDE, antivirus scan)
- CPU governor を performance に固定 (Linux: `cpupower frequency-set -g performance`)
- 低消費電力モード OFF (laptop は AC 接続)
- thermal throttling 確認 (連続実行で stddev が悪化していないか)
- `--warmup 5` に増やす
- `--runs 20` に増やす
- 同じ binary を 2 回 baseline 取って差分が誤差内か確認 (ベンチ自体の信頼性確認)

---

## 報告の最低記載項目

`templates/benchmark-report.md` のフォーマットに従う。最低限:

- 計測コマンド (hyperfine / criterion の正確な引数)
- ツールバージョン (`hyperfine --version`, `cargo --version`)
- OS / CPU / RAM / WSL or native
- 入力 fixture (path / size / 内容概要)
- Before / After の mean / stddev / runs
- 改善率 (%) と統計判定 (clear / marginal / none / unstable)
- cold / warm 区別 (I/O 系の場合)

---

## 禁止事項

- debug build での計測 (`cargo run` のまま)
- warmup なし
- 1 回しか実行しない計測
- 平均値だけ報告して stddev を書かない
- mean が 1 ms 以下の関数を criterion なしで hyperfine する (hyperfine の精度限界)
- 入力 fixture を毎回変える (再現性が消える)
- Before と After で異なる入力を使う
- After だけ取って Before を取らない
- 「速くなった気がする」での実装確定
