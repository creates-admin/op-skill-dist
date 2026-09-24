# Benchmark Protocol — Before / After 計測と統計判定

scan では実行しない (apply / investigation 用)。

## 原則

1. 計測なき最適化は出荷しない
2. Before / After は同じコマンド・同じ入力・同じ環境で取る
3. release build で測る (debug build の数値で判断しない)
4. warmup ≥ 3、runs ≥ 10
5. mean と stddev を並べて判定する
6. 入力は small / medium / large で分ける (n が変わると勝敗が逆転しうる)
7. コマンド・環境・fixture を報告に残す

## ツール選択

| 対象 | 推奨 | 補助 |
|---|---|---|
| CLI / build / pipeline 全体 | hyperfine | — |
| Rust 関数単位 | criterion (`cargo bench`) | — |
| Rust ホットパスの可視化 | cargo flamegraph / perf | samply (perf 不要) |
| Rust メモリ / allocation | dhat / valgrind massif | heaptrack、peak RSS は `/usr/bin/time -v` |
| Vue / TS bundle | vite-bundle-visualizer / rollup-plugin-visualizer | — |
| Vue / TS runtime | Chrome DevTools Performance / Lighthouse | playwright tracing |
| Flutter | `flutter run --profile` + devtools | `flutter build apk --release --analyze-size` |
| Tauri | hyperfine + DevTools / WebDriver | — |

mean が 1 ms 以下の関数は hyperfine の精度限界を下回るので criterion を使う。

---

## hyperfine

`git checkout` を hyperfine 内に入れるとノイズが増える。**before / after の binary を別名で保存して並べる**:

```bash
# Before (実装前)
cargo build --release --bin app && mkdir -p target/bench && cp target/release/app target/bench/before
# ... 改善実装 ...
cargo build --release --bin app && cp target/release/app target/bench/after

hyperfine --warmup 3 --runs 10 \
  --parameter-list size small,medium,large \
  --export-markdown target/bench/result.md --export-json target/bench/result.json \
  './target/bench/before input/sample-{size}.json' \
  './target/bench/after input/sample-{size}.json'
```

- cold / warm (I/O 系): cold は `--warmup 0 --prepare 'sync && echo 3 > /proc/sys/vm/drop_caches'` (Linux only)。Windows / WSL では drop_caches が使えないので cold は「初回実行」として別取得
- `--setup` (全 run 前に 1 回) / `--prepare` (各 run 前に毎回、前提リセット) / `--cleanup` (最後に 1 回)
- `--shell=none` で shell 起動オーバーヘッドを除く
- JSON から数値抽出: `jq '.results[] | {command, mean, stddev}' result.json` (単位は秒)

## criterion

```toml
[dev-dependencies]
criterion = { version = "0.5", features = ["html_reports"] }

[[bench]]
name = "target_bench"
harness = false
```

```rust
// benches/target_bench.rs
use criterion::{black_box, criterion_group, criterion_main, BenchmarkId, Criterion, Throughput};

fn bench_target(c: &mut Criterion) {
    let mut group = c.benchmark_group("target_function");
    for size in ["small", "medium", "large"] {
        let input = load_fixture(size); // 実 fixture か synthetic data
        group.throughput(Throughput::Elements(input.len() as u64));
        group.bench_with_input(BenchmarkId::from_parameter(size), &input, |b, input| {
            b.iter(|| black_box(target_function(black_box(input))));
        });
    }
    group.finish();
}

criterion_group!(benches, bench_target);
criterion_main!(benches);
```

```bash
cargo bench --bench target_bench -- --save-baseline before   # Before
cargo bench --bench target_bench -- --baseline before        # After (improved / regressed / no change)
# 数値: target/criterion/target_function/<size>/new/estimates.json
# ノイズが大きい時: -- --warm-up-time 5 --measurement-time 30
```

## プロファイリング (どこが遅いか分からない時)

- flamegraph: `cargo flamegraph --bin app -- <input>`。perf 権限不足なら `perf_event_paranoid` を調整するか samply (`samply record ./target/release/app <input>`) を使う
- dhat: `dhat` を optional feature で入れ、`#[global_allocator]` に `dhat::Alloc` を設定して `cargo run --release --features dhat` → `dhat-heap.json` を dh_view で開き、支配的な allocation site を見る
- bundle: `npx vite-bundle-visualizer` の treemap で大きい dependency を確認
- Lighthouse: `npx lighthouse <url> --output html`。目安 LCP < 2.5s / TBT < 200ms / CLS < 0.1

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
| **unstable** (先に評価) | before_stddev > before_mean × 0.2 または after_stddev > after_mean × 0.2 | revert して `deferred` |
| **clear** | ratio ≥ 3 | `applied` |
| **marginal** | 1 ≤ ratio < 3 | risk low なら `applied` (marginal と明記)、medium 以上は `reverted` / `escalated` |
| **none** | ratio < 1 (誤差内 or 劣化) | `reverted` |

例: Before 250±8 ms / After 220±6 ms → improvement 30、combined ≈ 10、ratio ≈ 3.0 → clear。Before 250±30 / After 240±28 → ratio ≈ 0.24 → none。

`improvement.ratio_percent` = improvement_ms / before_mean_ms × 100、`speedup` = before_mean / after_mean (例 `"3.0x"`)。

## ノイズ抑制 (Windows / WSL / クラウド VM で不安定な時)

- 他プロセス (browser / IDE / antivirus scan) を止める、laptop は AC 接続・省電力 OFF
- Linux は `cpupower frequency-set -g performance`
- 連続実行で stddev が悪化するなら thermal throttling を疑う
- `--warmup 5` / `--runs 20` に増やす
- 同じ binary の baseline を 2 回取り、差が誤差内かでベンチ自体の信頼性を確認する

---

## 報告の最低記載項目

完了報告 (apply-report) と PR / commit message に:

- 計測コマンド (正確な引数) とツールバージョン
- OS / CPU / RAM / WSL or native
- 入力 fixture (path / 規模 / 内容概要)、I/O 系は cold / warm の区別
- 規模別の Before / After の mean ± stddev / runs、speedup、統計判定
- 互換性 (公開 API 不変 / 出力差分なし / 既存テスト pass / エッジケース)
- リスクレベルと根拠、撤退しなかった理由、残課題 (別 bottleneck)

commit message の Benchmark 節の例:

```
perf(dispatcher): seen 判定を HashSet 化 (Fixes #N)

ベンチマーク (release, criterion):
- 1000 件: 250 ms → 82 ms (3.0x, clear)
- 10000 件: 24500 ms → 820 ms (30x, clear)
互換性: 公開 API 変更なし / 出力順序維持 / 既存テスト全 pass
リスク: low (データ構造置き換えのみ)
```

## 禁止事項

- debug build (`cargo run`) での計測
- warmup なし / 1 回だけの計測
- mean だけ報告して stddev を書かない
- Before と After で入力・コマンド・環境を変える / fixture を毎回変える
- After だけ取って Before を取らない
- 「速くなった気がする」での実装確定
