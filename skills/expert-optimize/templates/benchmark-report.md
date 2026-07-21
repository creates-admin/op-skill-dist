# Performance Report — apply mode 完了報告 Markdown template

<!--
このファイルは apply mode 完了時に PR description / Issue コメントへ
ペーストして使う Markdown template。<...> 部分を実値に置き換える。
JSON 形式の機械可読な報告は templates/apply-report.schema.json を使用。
-->

## Performance

### Target
- 対象: `<file_path>::<function_or_command>`
- カテゴリ: `<algorithm | io | allocation | cache | parallelism | bundle | startup>`
- bulk_group: `<perf-nested-loop-on2 | perf-loop-io | ... など>`

### Change
<改善内容を 1〜3 文で。「なぜこの構造が必要か」を含む>

例:
> seen の `Vec::contains` 線形探索を `HashSet` に置き換え (O(n²) → O(n))。
> dispatch 順序を維持するため、別 Vec で push 順を保持する設計とした。

### Benchmark
| Case | Before (mean ± stddev) | After (mean ± stddev) | Speedup | Significance |
|---|---:|---:|---:|---:|
| small (<n>) | <X> ± <Y> ms | <X> ± <Y> ms | <N>x | clear / marginal / none |
| medium (<n>) | <X> ± <Y> ms | <X> ± <Y> ms | <N>x | clear / marginal / none |
| large (<n>) | <X> ± <Y> ms | <X> ± <Y> ms | <N>x | clear / marginal / none |

### Command
```bash
<正確な hyperfine / criterion / その他コマンド>
```

例:
```bash
cargo bench --bench dispatcher_bench -- --baseline before
```

または:
```bash
hyperfine \
  --warmup 3 \
  --runs 10 \
  --export-markdown target/bench/result.md \
  './target/bench/before input/sample-large.json' \
  './target/bench/after input/sample-large.json'
```

### Environment
- OS: <Windows 11 / WSL2 Ubuntu 24.04 / macOS 14 / etc.>
- CPU: <モデル名 + コア数>
- RAM: <GB>
- Tool versions:
  - Rust: <`cargo --version` 出力>
  - hyperfine: <`hyperfine --version` 出力>
  - criterion: <Cargo.toml バージョン>
  - Node: <`node --version`>
  - Vue / Vite / Tauri: <該当バージョン>

### Input fixture
- path: `<fixtures/perf/sample-large.json>`
- 内容概要: <1〜2 文。要素数・ファイルサイズ・代表的な特性>
- cold / warm: <warm cache / cold cache (drop_caches) / 区別なし>

### Correctness
- [x] cargo test (全 pass)
- [x] cargo build --release (成功)
- [x] vue-tsc --noEmit / eslint . (該当時)
- [x] flutter analyze / flutter test (該当時)
- [x] 入出力インターフェース不変 (公開 API 変更なし)
- [x] 出力差分なし (fixture 比較で binary 一致 / JSON 一致)
- [x] エッジケース (empty / null / 巨大) 動作確認

### Risk
- Risk level: `<low | medium | high>`
- Risk notes: <なぜそのレベルか>
- Rollback: <`git revert <sha>` / branch 削除 / 手動 patch 等>

### 撤退判断
- 撤退しなかった理由:
  - improvement が `<clear | marginal>` (誤差を超える)
  - 既存テスト全 pass
  - 入出力互換維持
  - リスクレベル `<low / medium>` で apply 単独可

### Notes
<残課題、関連する別 bottleneck の Issue 起票推奨、要観察ポイント等>

例:
> 残課題: dispatcher 全体の throughput には worker pool 導入余地あり。
> 関連 bottleneck として spawn コストが Rust の tokio::spawn 単位で支配的。
> 別 Issue で「dispatcher worker pool 導入の計測検証」を提案。

---

<!-- ここから下は PR template に組み込む際の補足。Issue コメント単独利用なら省略可 -->

## Verification Ladder 結果

| Level | 種類 | 結果 |
|-------|------|------|
| 0 | static scan | (apply mode では実行なし) |
| 1 | type / lint | <PASS / FAIL / 未実行 + 理由> |
| 2 | unit test | <PASS / FAIL / 未実行 + 理由> |
| 3 | package build | <PASS / FAIL / 未実行 + 理由> |
| B | benchmark | <Before/After 取得済み> |
| 4 | integration | <未実行 (allow_level_4 なし) / 実行 PASS> |
| 5 | E2E | <未実行 (常に dedicated Issue)> |

---

## コミットメッセージテンプレ

```
perf(<scope>): <要約> (Fixes #N)

<改善内容と背景を 1〜3 文>

ベンチマーク (release build, criterion / hyperfine):
- 100 件: 1.2 ms → 0.8 ms (1.5x, clear)
- 1000 件: 250 ms → 82 ms (3.0x, clear)
- 10000 件: 24500 ms → 820 ms (30x, clear)

互換性:
- 公開 API 変更なし
- 出力順序維持 (専用テストで確認)
- 既存テスト全 pass

リスク: low (HashSet 置き換えのみ、ロジック変更なし)
```
