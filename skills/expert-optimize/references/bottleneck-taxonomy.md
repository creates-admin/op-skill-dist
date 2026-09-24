# Bottleneck Taxonomy — scan 用の分類表

「遅い」と断定せず、「この入力規模・呼び出し頻度なら計算量 / I/O 回数が破綻する」と書く。confirmed にする条件は 3 つ全て:

1. 計算量 / I/O 回数が静的に確定する
2. 入力規模が運用上大きくなることが既知 (page_count / job_count / OCR block_count / file_count 等)
3. 計測計画 (どう測れば確定できるか) を書ける

満たさないものは返さない。ここに無いパターンは ignored_noise の可能性が高い。各見出しの bulk_group は SKILL.md の表の値。

## algorithm (`perf-nested-loop-on2` / `perf-repeated-compile`)

| パターン | 検出兆候 | 昇格根拠 |
|---|---|---|
| nested loop O(n²)/O(n*m) | 外側 loop 内で同一・関連 collection を走査、join 戦略なしの items × rules | n が運用上 100 以上、かつホットパス |
| repeated linear search | loop 内 `vec.contains` / `iter().find` / `iter().position` | 探索元・探索回数とも n 規模 |
| repeated sort | 呼び出し・iteration ごとに `sort_by` | 同上 |
| repeated parse | loop 内で同じ JSON / XML / IDML を parse、`Path` ↔ `String` 往復 | 同上 |
| repeated regex compile | 関数 / loop 内 `Regex::new` | 呼び出し頻度が高い |

## io (`perf-loop-io` / `perf-tauri-ipc-chatty`)

| パターン | 検出兆候 |
|---|---|
| ループ内 file I/O | `for { fs::read / fs::write }`、async でも syscall コストは同じ、1 行ずつ append |
| N+1 | loop 内で 1 件ずつ HTTP / DB / `invoke` / COM |
| async 内同期 I/O | `async fn` 内の `std::fs` / `std::process::Command::output()` / `std::thread::sleep`。バグ寄りなので debug の領域。性能影響を示せる場合のみ optimize で起票 |
| Tauri IPC chatty | render loop・scroll handler 内 `invoke`、巨大 JSON / binary を base64 で送る、1 件ずつの command |

昇格根拠: 件数 n が 100 以上かつホットパス。I/O 1 回 1 ms でも 1 万件で 10 秒。

## allocation / memory (`perf-unnecessary-clone` / `perf-unbounded-growth`)

| パターン | 検出兆候 | 昇格根拠 |
|---|---|---|
| 大量 clone / String 化 | 巨大 `Vec` / `HashMap` の `.clone()`、ホットパスの `iter().cloned().collect()`、`&str` で済む `.to_string()` | 1 MB 以上 / 10 万要素以上かつホットパス |
| serde roundtrip | `from_str` → 加工 → `to_string` → `from_str`、Tauri 境界での 2 重 serialize | 同上 |
| unbounded growth | eviction なしの cache insert、truncate なしの履歴 push、listener / watcher / timer の解除漏れ (Vue `onUnmounted`、Flutter `dispose`、Tauri `unlisten`) | 常駐アプリ (Tauri / Flutter) で長時間運用の OOM 経路 |
| 大 buffer の長期保持 | 処理後も struct field に bitmap / OCR 中間 buffer / Tauri state の巨大 Vec | 同上 |
| capacity なし push | 既知サイズの大量 push、`push_str` 連発 | n が大きい場合のみ (小さければ noise) |

dispose 漏れはバグとしては debug-expert、長時間のメモリ肥大として示せるなら optimize で起票する。

## parallelism (`perf-bad-parallelism`)

| パターン | 検出兆候 |
|---|---|
| par_iter + Mutex | `for_each` 内で `Mutex<Vec>` push / `Arc<Mutex<HashMap>>` insert |
| I/O-bound par_iter | `par_iter` 内で file / HTTP / DB |
| 極小粒度 | 数十要素以下、または 1 要素 < 1 µs |
| スレッド制約越境 | `par_iter` 内で Tauri Window・WebView 操作 / InDesign COM (STA) / Flutter platform channel。クラッシュ・不定動作なら昇格 |

## bundle / frontend (`perf-bundle-fullimport`)

| パターン | 検出兆候 | 昇格根拠 |
|---|---|---|
| 全 import | `import _ from 'lodash'` / `import * as moment` / icon library 全 import | initial bundle 1 MB 超、または LCP に明確な影響 |
| lazy route 不在 | router の全 route が同期 import、巨大 dialog を eager load | 同上 |
| tree-shake 阻害 | `"sideEffects": false` 未宣言、barrel `export *` | 同上 |

## Tauri 境界 (`perf-tauri-ipc-chatty`)

| パターン | 検出兆候 |
|---|---|
| 巨大 payload | `Vec<u8>` / `Vec<f64>` を戻り値にする、100 KB 以上の JSON を高頻度送信 |
| main thread blocking | `#[tauri::command]` 内の重い同期処理 / `block_on` |

## ignored_noise (報告しない)

SKILL.md「起票しない」に加え: 10 要素以下が確実な UI helper / `String` vs `&str`、`u32` vs `usize` の好み。
