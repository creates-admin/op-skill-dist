// criterion benchmark template for optimize-expert apply mode
//
// 機能概要: Rust 関数単位の Before / After 計測テンプレ。
// 作成意図: small / medium / large の 3 段階入力で計測し、改善率を実測する。
//           apply mode で「とりあえず動く bench」を即用意するための雛形。
// 使用方法:
//   1. このファイルを `benches/<target>_bench.rs` にコピー
//   2. `Cargo.toml` の [[bench]] エントリを追加 (下記参照)
//   3. `load_fixture` / `target_function` を実コードに合わせて差し替え
//   4. `cargo bench --bench <target>_bench -- --save-baseline before`
//   5. 改善実装
//   6. `cargo bench --bench <target>_bench -- --baseline before`
//
// Cargo.toml に追加:
// [dev-dependencies]
// criterion = { version = "0.5", features = ["html_reports"] }
//
// [[bench]]
// name = "<target>_bench"
// harness = false

use criterion::{black_box, criterion_group, criterion_main, BenchmarkId, Criterion, Throughput};

// fixture loader: 実プロジェクトの fixture / synthetic data 生成に差し替え
fn load_fixture(size: &str) -> Vec<Item> {
    let n = match size {
        "small" => 100,
        "medium" => 1_000,
        "large" => 10_000,
        _ => 1_000,
    };
    // 実データを使う場合: serde_json::from_str(&std::fs::read_to_string(format!("fixtures/perf/{}.json", size)).unwrap()).unwrap()
    (0..n).map(|i| Item { id: format!("id-{}", i), value: i as f64 }).collect()
}

// target function: 実プロジェクトの計測対象関数に差し替え
fn target_function(input: &[Item]) -> Vec<Output> {
    input.iter().map(|item| Output { id: item.id.clone(), score: item.value * 2.0 }).collect()
}

#[derive(Clone)]
struct Item {
    id: String,
    value: f64,
}

#[derive(Clone)]
struct Output {
    id: String,
    score: f64,
}

fn bench_target(c: &mut Criterion) {
    let mut group = c.benchmark_group("target_function");

    // small / medium / large の 3 段階で計測
    for size in ["small", "medium", "large"] {
        let input = load_fixture(size);

        // throughput を要素数で記録 (Criterion がスループット表示)
        group.throughput(Throughput::Elements(input.len() as u64));

        group.bench_with_input(BenchmarkId::from_parameter(size), &input, |b, input| {
            b.iter(|| {
                // black_box: 入力が定数畳み込みされないように
                let result = target_function(black_box(input));
                // 出力も black_box で消去されないように
                black_box(result);
            });
        });
    }

    group.finish();
}

// 個別の関数 bench (compare 用に複数併存させてもよい)
fn bench_target_large_only(c: &mut Criterion) {
    let input = load_fixture("large");
    c.bench_function("target_function_large_only", |b| {
        b.iter(|| {
            let result = target_function(black_box(&input));
            black_box(result);
        });
    });
}

criterion_group!(benches, bench_target, bench_target_large_only);
criterion_main!(benches);

// ベンチマーク実行 / baseline 比較:
//
//   # baseline (Before) を保存
//   cargo bench --bench target_bench -- --save-baseline before
//
//   # 改善後 (After) を before と比較
//   cargo bench --bench target_bench -- --baseline before
//   # 出力例: "Performance has improved." or "regressed." or "no change."
//
//   # HTML レポート (criterion features = ["html_reports"] が必要)
//   open target/criterion/target_function/large/report/index.html
//
//   # JSON 取得
//   cat target/criterion/target_function/large/new/estimates.json
//
// noise 抑制:
//
//   # 他プロセスを止め、CPU を performance governor に固定 (Linux)
//   sudo cpupower frequency-set -g performance
//
//   # warmup / measurement time を増やす
//   cargo bench --bench target_bench -- --warm-up-time 5 --measurement-time 30
