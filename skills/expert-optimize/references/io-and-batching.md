# I/O and Batching — I/O 削減とバッチ化

InDesign / IDML / PDF / OCR / ファイル監視 / NFS 系では I/O が支配的で、CPU 並列化より I/O 削減・batch 化の方がはるかに効く。I/O-bound に Rayon を使わない。

## レイテンシの目安

| 操作 | 目安 |
|---|---|
| RAM | ~100 ns |
| SSD random read | ~100 µs |
| HDD random read / LAN HTTP / local SQL | ~1〜10 ms |
| WAN HTTP | ~50〜200 ms |
| Tauri invoke | ~0.1〜1 ms (serialize 込み) |
| InDesign COM 1 call | ~10〜100 ms |
| network drive (SMB, cold) | ~5〜50 ms |

1 ms でも 1,000 件で 1 秒、10,000 件で 10 秒。

## 判断フロー

1. ループ内に I/O / network / IPC / COM がある → 必ず候補
2. read once / parse once で済む → 即実装
3. batch API がある / 作れる → batch 化
4. async + concurrency limit で並行化できる → semaphore + tokio。できなければ sequential のまま
5. cache は invalidation 戦略が決まる場合のみ (bounded LRU / TTL、`rust-optimization.md`)
6. Before/After で確認

---

## パターン

### read once / parse once

loop 内で同じ manifest を毎回 read + parse しない。loop 外で 1 回読み、参照を渡す。IDML の story 等は parse once して `HashMap<StoryId, Parsed>` に index。

### BufReader / BufWriter

1 行ずつの read / write を都度 syscall させない。`BufWriter` は **`flush()?` を明示する** (drop 時の暗黙 flush はエラーを握り潰す)。

### N+1 解消

SQL / HTTP / Tauri invoke / COM は同型の問題。1 件ずつ取る形を JOIN・`IN (...)`・batch endpoint (`POST /api/jobs/batch {ids}`)・batch command・1 回の ExtendScript に畳み、in-memory で group_by する。

### async + concurrency limit

```rust
let sem = Arc::new(Semaphore::new(8)); // 同時 8 まで (外部 API は rate limit を尊重して決める)
let handles: Vec<_> = jobs.into_iter().map(|j| {
    let sem = Arc::clone(&sem);
    tokio::spawn(async move {
        let _permit = sem.acquire().await.unwrap();
        fetch(&j).await
    })
}).collect();
let results = futures::future::join_all(handles).await;
```

timeout は `tokio::time::timeout` で明示する。

### async runtime 上の同期 I/O

`async fn` 内で `std::fs` / 重い同期 parse を呼ぶと runtime worker を塞ぐ。`tokio::fs` を使うか、`tokio::task::spawn_blocking(move || { ... }).await?` に隔離する。

### streaming parse (巨大ファイル)

全体を `String` に読み込まない。XML / IDML は `quick_xml::Reader::from_file` + `read_event_into(&mut buf)` (毎回 `buf.clear()`)、JSONL は `serde_json::Deserializer::from_reader(f).into_iter::<Record>()`。

### bounded queue

producer / consumer は bounded channel (`tokio::sync::mpsc::channel(100)`) で backpressure をかける (unbounded は OOM 経路)。**`tokio::sync::mpsc` は単一 receiver** — worker N 本に配るなら `flume` / `async-channel` か、1 receiver から dispatch する。

---

## InDesign COM

- 1 call 10〜100 ms。**並列化より呼び出し回数の削減** が圧倒的に効く
- page × pageItem × property を 1 件ずつ COM 越しに取る形 (N × M round trip) をやめ、ExtendScript 1 本で全件を集めて `JSON.stringify` で返し、Rust 側は `do_script` を 1 回だけ呼んで parse する
- COM は STA。**COM 呼び出しを Rayon で並列化しない**。複数 InDesign プロセスでの並列化は可能だが license / resource コストが高い

## ファイル監視

- 数秒ごとの全 directory walk をやめ、`notify::recommended_watcher` でイベント駆動にする
- 全 walk は起動時の manifest 構築と cache miss 時だけ。以降は notify event で manifest を差分更新

## OCR / PDF

- OCR API をページごとに逐次 await しない。semaphore で並行度を制限して並行化 (API rate limit を尊重)
- PDF 全ページ render は bitmap を `Vec` に retain せず 1 ページずつ処理して drop (`rust-optimization.md`)
