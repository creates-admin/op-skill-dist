# Bottleneck Taxonomy — scan モード用の分類表

<!--
機能概要: optimize-expert scan モードで「なんとなく遅そう」を防ぐための分類表。
作成意図: scan は性能問題を断定しないが、加点要素 (severity 昇格根拠) と
         減点要素 (起票しない理由) を明文化し、ノイズを構造的に減らす。
注意点: ここに書かれていないパターンは ignored_noise の可能性が高い。
       入力規模・ホットパス性が示せないものは confirmed にしない。
-->

## scan モードの責務

> 「これは遅い」と断定するのではなく、
> 「この入力規模・この呼び出し頻度なら計算量 / I/O 回数が破綻するリスクがある」と書く。

判定の核は以下 3 点:

1. **計算量 / I/O 回数が静的に確定する**
2. **入力規模が運用上大きくなることが既知** (page_count / job_count / OCR block_count / file_count 等)
3. **measurement_plan を書ける** (op-run でどう測れば bottleneck と確定できるか)

3 点全て揃って初めて confirmed_findings。
1 だけなら investigation_candidates。

---

## 分類: algorithm

### algo-nested-loop-on2 — O(n²) / O(n*m) ネストループ

| 検出兆候 | 例 |
|---------|---|
| 二重 for で外側と内側が同じ collection / 関連 collection | `for x in items { for y in items { ... } }` |
| 外側 loop 内で内側 collection を線形探索 | `for x in xs { if ys.contains(&x.id) { ... } }` |
| 関連 collection を join するパターンで join 戦略がない | items × rules マトリクス処理 |

severity 昇格根拠:
- n が運用上 100 以上に達することが既知 (例: page_count, rule_count, OCR block_count)
- ホットパス (main loop / batch processor / per-page 処理)

改善方針: HashMap / HashSet による index 化、`algorithmic-optimization.md` 参照。

### algo-repeated-linear-search — Vec::contains の多重利用

| 検出兆候 | 例 |
|---------|---|
| ループ内で `vec.contains(&key)` 反復 | seen チェックを Vec で行う |
| `vec.iter().find(...)` 多発 | id lookup を毎回線形 |
| `vec.iter().position(...)` 多発 | 同上 |

severity 昇格根拠:
- 探索元の Vec が n 規模、探索回数も n 規模 (合計 O(n²))

改善方針: HashSet / HashMap / IndexMap への置き換え。

### algo-repeated-sort — 同じデータを毎回 sort

| 検出兆候 | 例 |
|---------|---|
| 関数呼び出し / loop iteration ごとに `sort_by` | sort 結果を cache していない |
| 同じデータに対する `sort` + `binary_search` のうち sort が外側 loop 内 | sort once + binary_search の機会喪失 |

改善方針: sort once + binary_search、または事前に sorted 構造で持つ。

### algo-repeated-parse — 同じ入力を毎回 parse

| 検出兆候 | 例 |
|---------|---|
| ループ内で同じ JSON / XML / IDML を `serde_json::from_str` | 結果を cache していない |
| `Path::new(s)` を毎回作って `to_str()` で戻す | 文字列 ↔ Path 変換が往復 |

改善方針: parse once、typed intermediate を持つ。

### algo-repeated-regex-compile — Regex を毎回 compile

| 検出兆候 | 例 |
|---------|---|
| 関数 / loop 内で `Regex::new("...")` | 関数呼び出しごとに compile |
| 同じ pattern を複数箇所で `Regex::new` | DRY 違反かつ性能問題 |

改善方針: `static REGEX: LazyLock<Regex> = LazyLock::new(|| Regex::new("...").unwrap());`

---

## 分類: io

### io-loop-file-rw — ループ内 file I/O

| 検出兆候 | 例 |
|---------|---|
| `for ... { fs::read(...) }` / `fs::write(...)` | 1 件ずつ open/close を繰り返す |
| `for ... { tokio::fs::write(...).await }` | async でも syscall コストは変わらない |
| 1 行ずつ append で大量書き込み | `BufWriter` で済むのに |

severity 昇格根拠:
- 件数 n が 100 以上、かつホットパス

改善方針: read once + in-memory 処理 / `BufReader` + `BufWriter` / batch I/O。

### io-n-plus-one — N+1 (DB / HTTP / IPC / fs)

| 検出兆候 | 例 |
|---------|---|
| `for item in items { fetch_detail(item.id) }` | 1 件ずつ HTTP / DB |
| `for page in pages { invoke('get_meta', { page }) }` | Tauri command N+1 |
| `for job in jobs { com.GetItem(job.id) }` | InDesign COM N+1 |

改善方針: batch API / IN 句 / multi-get / `invoke('get_meta_batch', { pages })`。

### io-sync-on-async-runtime — async 内同期 I/O

| 検出兆候 | 例 |
|---------|---|
| `async fn` 内で `std::fs::*` 直呼び | runtime block |
| `async fn` 内で `std::process::Command::output()` | runtime block |
| tokio context で `std::thread::sleep` | runtime block |

改善方針: `tokio::fs::*` / `tokio::process::Command` / `tokio::time::sleep`。
ただし debug-expert と境界が近い (バグ寄り)。性能影響が示せれば optimize で起票。

### io-tauri-ipc-chatty — Tauri IPC の高頻度往復

| 検出兆候 | 例 |
|---------|---|
| frontend が `invoke` を高頻度に呼ぶ | render loop 内 invoke、scroll handler 内 invoke |
| 巨大 JSON / 巨大 binary を base64 で渡す | serialize コストが支配的 |
| 1 件ごとに command 分割 | batch command がない |

改善方針: command batching / 結果の event 通知化 / binary は file path handoff、`tauri-performance.md` 参照。

---

## 分類: allocation

### alloc-unnecessary-clone — 大量 clone / String 化

| 検出兆候 | 例 |
|---------|---|
| 巨大 `Vec<T>` / `HashMap` の `.clone()` 連発 | 関数引数で毎回 clone |
| `&str` で済むところで `.to_string()` | API 設計の問題、性能影響あり |
| `iter().cloned().collect()` がホットパス | borrow で済む可能性 |

severity 昇格根拠:
- データ規模が大きい (1MB 以上 / 10万要素以上)、かつホットパス

改善方針: `&[T]` / `Cow<'_, str>` / `Arc<T>` / borrow / iterator chain。

### alloc-serde-roundtrip — parse → serialize → parse の往復

| 検出兆候 | 例 |
|---------|---|
| `from_str` → 加工 → `to_string` → `from_str` | 中間で typed 構造を持てば 1 回で済む |
| Tauri 境界で 2 回 serialize | frontend / backend で同じ struct を typed で扱う |

改善方針: typed intermediate、parse once。

### alloc-unbounded-growth — 無限成長する cache / listener

| 検出兆候 | 例 |
|---------|---|
| `HashMap` への insert のみで eviction なし | LRU や TTL がない |
| `Vec` への push のみで truncate なし | 履歴 buffer 等 |
| event listener / watcher の addEventListener のみで removeEventListener なし | dispose 漏れ |

severity 昇格根拠:
- 長時間運用 (Tauri / Flutter アプリ常駐) で OOM 経路

改善方針: bounded cache (LRU / TTL / size cap) / dispose / unmount cleanup。

### alloc-vec-no-capacity — `Vec::push` 多発で再 alloc

| 検出兆候 | 例 |
|---------|---|
| 大量 push 前に `Vec::with_capacity(n)` がない | 既知サイズなのに |
| `String::push_str` 連発で初期 capacity なし | string builder 用途 |

改善方針: `with_capacity` / `String::with_capacity`。
ただし n が小さい場合は ignored_noise (micro optimization)。

---

## 分類: parallelism

### par-mutex-vec-push — par_iter + Mutex<Vec> push

| 検出兆候 | 例 |
|---------|---|
| `par_iter().for_each(|x| { results.lock().unwrap().push(...) })` | 並列化が逆に遅くなる |
| `Arc<Mutex<HashMap>>` への並列 insert | 同上 |

改善方針: `par_iter().map(...).collect()` / fold + reduce / thread local accumulation、`rayon-playbook.md` 参照。

### par-io-bound — I/O-bound に par_iter

| 検出兆候 | 例 |
|---------|---|
| `par_iter` 内で file read / HTTP / DB | I/O 待ちで CPU 並列化しても効果薄 |
| `par_iter` 内で Tauri command / COM 呼び出し | スレッド制約に違反する場合も |

改善方針: async + concurrency limit (semaphore) / worker pool / batch API。

### par-small-input — 極小粒度 par_iter

| 検出兆候 | 例 |
|---------|---|
| 数十要素以下の Vec への par_iter | overhead が処理時間を上回る |
| 1 要素の処理が 1 µs 未満 | 同上 |

改善方針: threshold で sequential / parallel を切り替え、または並列化を諦める。

### par-ui-thread-violation — UI / COM スレッド制約越境

| 検出兆候 | 例 |
|---------|---|
| `par_iter` 内で Tauri WebView / Window 操作 | UI スレッド制約 |
| `par_iter` 内で InDesign COM 呼び出し | COM apartment 違反 |
| `par_iter` 内で Flutter platform channel | UI thread 制約 |

severity 昇格根拠: クラッシュ / 不定動作

改善方針: 並列化を取り下げる / UI thread にディスパッチ / sequential に戻す。

---

## 分類: memory

### mem-listener-leak — listener / watcher / timer 解除漏れ

| 検出兆候 | 例 |
|---------|---|
| `addEventListener` のみで `removeEventListener` なし | unmount cleanup 不在 |
| Vue で `watch` / `setInterval` を `onUnmounted` で停止していない | 同上 |
| Flutter で controller の `dispose` 不在 | TextEditingController / FocusNode / AnimationController |
| Tauri で `listen` のみで unlisten なし | event subscription 漏れ |

> debug-expert との境界が近い。バグ (dispose 漏れ) としては debug、長時間メモリ肥大として optimize で起票。

改善方針: `onUnmounted` / `onDispose` / `unlisten()` の追加。

### mem-large-buffer-retention — 不要な大 buffer の保持

| 検出兆候 | 例 |
|---------|---|
| PDF / 画像の bitmap を処理後も struct field に保持 | drop 時期が遅い |
| OCR の中間 image buffer を最終結果まで持ち回る | 段階的 drop で十分 |
| Tauri state に巨大 Vec を抱えたまま | 解放タイミングがない |

改善方針: scope を狭める / `mem::take` で drop / 不要になった時点で `= None` / streaming 化。

---

## 分類: bundle (frontend)

### bundle-full-import — 巨大ライブラリの全 import

| 検出兆候 | 例 |
|---------|---|
| `import _ from 'lodash'` (named import なし) | tree-shaking 効かず全 bundle |
| `import * as moment from 'moment'` | 全 locale 込み |
| icon library 全 import | `import { Icon } from '@iconify/vue'` 等で named import 推奨 |

severity 昇格根拠: initial bundle が 1MB 超、または LCP に明確な影響

改善方針: named import / tree-shakable な代替 (date-fns / dayjs) / icon は SVG 個別。

### bundle-no-lazy-route — route lazy load 不在

| 検出兆候 | 例 |
|---------|---|
| router の全 route が同期 import | initial bundle に全画面が乗る |
| `defineAsyncComponent` を使わない巨大コンポーネント | dialog / modal も初期ロード |

改善方針: `() => import('./Page.vue')` で route 単位 splitting / `defineAsyncComponent`。

### bundle-no-treeshake-side-effects — sideEffects 設定不在

| 検出兆候 | 例 |
|---------|---|
| `package.json` に `"sideEffects": false` がない | tree-shaking が効かない |
| barrel re-export (`export * from ...`) で全 import 化 | 同上 |

改善方針: `sideEffects` 宣言 / barrel 解消。

---

## 分類: tauri (Rust + WebView 境界)

詳細は `tauri-performance.md`。

### tauri-ipc-chatty — IPC 高頻度往復 (再掲、io 系と同じカテゴリ)

### tauri-large-payload — 巨大 JSON payload

| 検出兆候 | 例 |
|---------|---|
| `Vec<u8>` / `Vec<f64>` を `Vec<u8>` 経由で frontend に送る | base64 / JSON serialize コスト |
| 100KB 以上の JSON を毎フレーム送る | 同上 |

改善方針: file path handoff (Rust が tmp file に書き、frontend が `convertFileSrc` で読む) / streaming / progress event。

### tauri-main-thread-blocking — main thread をブロックする command

| 検出兆候 | 例 |
|---------|---|
| `#[tauri::command]` 内で重い同期処理 | UI が freeze |
| `#[tauri::command]` 内で `block_on` | runtime 自殺 |

改善方針: `tokio::spawn_blocking` / `tokio::task::spawn` / progress event で incremental 通知。

---

## 分類で扱わないもの (ignored_noise)

以下は scan で報告しない:

- 1 回しか呼ばれない初期化処理の clone 1 個
- 入力規模が確実に小さい UI helper (10 要素以下が確実)
- iterator chain vs explicit loop の好み
- `String` vs `&str` の好み (借用関係が明確で性能差が誤差レベル)
- micro optimization (`u32` vs `usize` の好み等)
- benchmark で測っても誤差範囲の改善しか見込めない箇所
- 既存コードが CLAUDE.md 規約に従っているもの
- React / Go (disabled stack)

---

## scan 出力時の注意

- `evidence` には該当コード 5〜10 行を貼る (該当行の前後文脈を含めて)
- `why_it_matters` には **入力規模・呼び出し頻度・ホットパス性** を必ず書く
- `measurement_plan` には **baseline 取得コマンドと入力 fixture** を書く
- `risk` (low / medium / high) を `risk-and-rollback.md` に従って付与
- `recommendation.type` は `optimize` (改善方針が明確) または `investigation` (まず計測)
