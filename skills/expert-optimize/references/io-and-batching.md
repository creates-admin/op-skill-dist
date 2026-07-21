# I/O and Batching — I/O 削減とバッチ化

<!--
機能概要: file / DB / HTTP / IPC / COM の I/O 回数を減らし、batch 化する判断と実装パターン。
作成意図: CreatesWorks 系 (InDesign / IDML / PDF / OCR / ファイル監視 / NFS) では
         I/O が支配的。CPU 並列化より I/O 削減・バッチ化・キャッシュの方が
         はるかに効くことが多い。
注意点: I/O-bound に Rayon を使わない。InDesign COM は ExtendScript 側で
       まとめて処理する方が速いことが多い。
-->

## 大原則

> **I/O は CPU より 3〜6 桁遅い。
> 「ループ内 I/O」を見つけたら、まずそこを直す。**

| 操作 | 目安 |
|------|------|
| L1 cache | ~1 ns |
| L2 cache | ~3 ns |
| RAM | ~100 ns |
| SSD random read | ~100 µs |
| HDD random read | ~10 ms |
| LAN HTTP round trip | ~1 ms |
| WAN HTTP round trip | ~50〜200 ms |
| SQL query (simple, local) | ~1 ms |
| Tauri invoke round trip | ~0.1〜1 ms (JSON serialize 込み) |
| InDesign COM 1 call | ~10〜100 ms |
| network drive (SMB) | ~5〜50 ms (cold) |

「1 ms 程度なら気にしない」は 1,000 件で 1 秒、10,000 件で 10 秒になる。

---

## アンチパターン (検出すべき)

### ループ内 file I/O

```rust
// Bad: N 件 × open/read/close
for path in paths {
    let s = std::fs::read_to_string(&path)?;
    process(&s);
}
```

```rust
// Bad: N 件 × write
for item in items {
    std::fs::write(format!("out/{}.json", item.id), serialize(&item))?;
}
```

### N+1 (DB / HTTP / IPC / fs)

```sql
-- Bad: N+1 SQL
SELECT * FROM orders;        -- 1 query
-- per order:
SELECT * FROM order_items WHERE order_id = ?;  -- N queries
```

```rust
// Bad: N+1 HTTP
for job in jobs {
    let detail = http_get(&format!("/api/jobs/{}", job.id)).await?;
}
```

```typescript
// Bad: N+1 Tauri command
for (const page of pages) {
  const meta = await invoke('get_meta', { page })
}
```

```javascript
// Bad: N+1 InDesign COM (ExtendScript)
for (var i = 0; i < pageCount; i++) {
  doc.pages.item(i).pageItems.everyItem().getElements();  // 毎回 COM round trip
}
```

### 同期 I/O on async runtime

```rust
// Bad: tokio runtime を block
async fn read_config() -> Result<Config> {
    let s = std::fs::read_to_string("config.toml")?;  // block
    Ok(toml::from_str(&s)?)
}
```

### 小さい write の連発

```rust
// Bad: append が多発
let mut f = File::create("log.txt")?;
for line in lines {
    writeln!(f, "{}", line)?;  // 1 行ごとに syscall
}
```

### 同じ I/O を毎回繰り返す

```rust
// Bad: 同じ manifest を毎回 read
for item in items {
    let manifest_text = std::fs::read_to_string("manifest.json")?;
    let manifest: Manifest = serde_json::from_str(&manifest_text)?;
    apply(item, &manifest);
}
```

---

## 改善パターン

### read once + in-memory 処理

```rust
// Good
let manifest: Manifest = serde_json::from_str(&std::fs::read_to_string("manifest.json")?)?;
for item in items {
    apply(item, &manifest);
}
```

### BufReader / BufWriter で syscall 削減

```rust
use std::io::{BufRead, BufReader, BufWriter, Write};

// 1 行ずつ read を OS から取らずに buffer 経由
let f = BufReader::new(File::open("input.txt")?);
for line in f.lines() {
    process(&line?);
}

// write も buffer
let mut w = BufWriter::new(File::create("out.txt")?);
for line in lines {
    writeln!(w, "{}", line)?;
}
w.flush()?;
```

### batch API で N+1 解消 (SQL)

```sql
-- Good: JOIN で 1 query
SELECT o.*, i.* FROM orders o LEFT JOIN order_items i ON i.order_id = o.id;

-- または IN 句
SELECT * FROM order_items WHERE order_id IN (?, ?, ?, ...);
```

```rust
// 1 query で取得して in-memory で group_by
let rows = sqlx::query!("SELECT o.id as order_id, i.* FROM orders o
                        LEFT JOIN order_items i ON i.order_id = o.id")
    .fetch_all(&pool).await?;

let mut by_order: HashMap<OrderId, Vec<Item>> = HashMap::new();
for r in rows {
    by_order.entry(r.order_id).or_default().push(/* ... */);
}
```

### batch API で N+1 解消 (HTTP / Tauri / COM)

```rust
// Bad → Good: バッチ endpoint を作る
let details = http_post("/api/jobs/batch", &json!({ "ids": ids })).await?;
```

```typescript
// Tauri: 1 invoke で複数件取得
const metas = await invoke('get_meta_batch', { pages })
```

```javascript
// InDesign: ExtendScript 内で loop して 1 回だけ COM round trip
// (Tauri / Rust から呼ぶときは ExtendScript 1 ファイルにまとめて exec)
```

### async + concurrency limit (I/O parallel)

```rust
use tokio::sync::Semaphore;
use futures::future::join_all;

let sem = Arc::new(Semaphore::new(8));  // 同時 8 接続まで
let handles: Vec<_> = jobs.into_iter().map(|j| {
    let sem = Arc::clone(&sem);
    tokio::spawn(async move {
        let _permit = sem.acquire().await.unwrap();
        fetch(&j).await
    })
}).collect();
let results: Vec<_> = join_all(handles).await;
```

> **Rayon を使わない**。I/O-bound なので CPU 並列化の効果がない。
> async + semaphore で同時接続数を制御する。

### sync I/O を `spawn_blocking` で隔離

```rust
async fn parse_huge_file() -> Result<Data> {
    tokio::task::spawn_blocking(|| {
        // 巨大 file の sync read + parse は blocking thread に隔離
        let s = std::fs::read_to_string("huge.json")?;
        serde_json::from_str(&s)
    }).await?
}
```

### streaming parse (巨大ファイル)

```rust
// XML / IDML の streaming parse
use quick_xml::Reader;
use quick_xml::events::Event;

let mut reader = Reader::from_file("huge.idml")?;
let mut buf = Vec::new();
loop {
    match reader.read_event_into(&mut buf)? {
        Event::Start(ref e) => { /* ... */ }
        Event::Eof => break,
        _ => {}
    }
    buf.clear();
}
```

```rust
// JSON streaming (serde_json::StreamDeserializer)
use serde_json::Deserializer;

let f = File::open("huge.jsonl")?;
let stream = Deserializer::from_reader(f).into_iter::<Record>();
for record in stream {
    process(record?);
}
```

### bounded queue / worker pool

```rust
use tokio::sync::mpsc;

let (tx, mut rx) = mpsc::channel::<Job>(100);  // bounded

// producer
tokio::spawn(async move {
    for job in load_jobs() {
        tx.send(job).await.unwrap();
    }
});

// workers
let mut workers = Vec::new();
for _ in 0..8 {
    let mut rx = rx.clone();  // 注: mpsc は単一 receiver。flume / async-channel を使うか dispatcher パターン
    workers.push(tokio::spawn(async move {
        while let Some(job) = rx.recv().await {
            process(&job).await;
        }
    }));
}
```

### cache (明確な invalidation がある場合のみ)

```rust
use std::collections::HashMap;
use std::sync::RwLock;

// LRU や TTL の bounded cache
use lru::LruCache;
use std::num::NonZeroUsize;

let cache: RwLock<LruCache<Key, Arc<Value>>> =
    RwLock::new(LruCache::new(NonZeroUsize::new(1024).unwrap()));

fn get_or_compute(key: &Key) -> Arc<Value> {
    if let Some(v) = cache.read().unwrap().peek(key) {
        return Arc::clone(v);
    }
    let v = Arc::new(compute(key));
    cache.write().unwrap().put(key.clone(), Arc::clone(&v));
    v
}
```

> **cache は invalidation が難しい**。安易に入れない。詳細は `risk-and-rollback.md`。

---

## InDesign COM 特有の注意

InDesign COM 呼び出しは 1 回 ~10〜100 ms かかる。**並列化より呼び出し回数削減** が圧倒的に効く。

### Bad: COM N+1

```javascript
// VBScript / JavaScript (ExtendScript via Rust → COM bridge)
for (var i = 0; i < doc.pages.length; i++) {
  var page = doc.pages.item(i);                 // COM round trip
  var items = page.pageItems.everyItem().getElements();  // COM round trip
  for (var j = 0; j < items.length; j++) {
    var item = items[j];
    var bounds = item.geometricBounds;          // COM round trip × N × M
  }
}
```

### Good: ExtendScript 側で 1 回まとめて結果を返す

```javascript
// ExtendScript script 1 本で全部処理して JSON 返す
function collectAllBounds(doc) {
  var result = [];
  for (var i = 0; i < doc.pages.length; i++) {
    var page = doc.pages.item(i);
    var items = page.pageItems.everyItem().getElements();
    var pageItems = [];
    for (var j = 0; j < items.length; j++) {
      pageItems.push({
        id: items[j].id,
        bounds: items[j].geometricBounds,
      });
    }
    result.push({ pageIndex: i, items: pageItems });
  }
  return JSON.stringify(result);
}
collectAllBounds(app.activeDocument);  // ExtendScript から 1 回 JSON 返す
```

Rust 側は ExtendScript を `do_script` で 1 回だけ呼び、JSON を parse する。

### COM apartment 制約

InDesign COM は STA (Single-Threaded Apartment)。
**COM 呼び出しを Rayon で並列化してはいけない**。
複数プロセスで InDesign を起動して並列化することは可能だが、license / resource コストが高い。

---

## ファイル監視 (notify crate)

### Bad: full directory walk を毎ポーリング

```rust
// 数秒ごとに全 walk
loop {
    let files = walk("input/")?;
    for f in files {
        if let Some(mtime) = check_changed(&f) {
            process(&f);
        }
    }
    sleep(Duration::from_secs(5));
}
```

### Good: notify crate でイベント駆動

```rust
use notify::{RecommendedWatcher, RecursiveMode, Watcher, Event};

let (tx, rx) = std::sync::mpsc::channel();
let mut watcher = notify::recommended_watcher(tx)?;
watcher.watch(Path::new("input/"), RecursiveMode::Recursive)?;

for res in rx {
    let event: Event = res?;
    for path in event.paths {
        process(&path);
    }
}
```

### manifest cache (起動時のみ full walk)

```rust
// 起動時に manifest を読み、以降は notify で差分追跡
let manifest = load_or_build_manifest()?;
// notify event ごとに manifest update
```

---

## OCR / PDF / IDML の典型最適化

### OCR pipeline: ページごと逐次 → batch + 並行

```rust
// Bad: ページ N 件 × 1 件ずつ OCR API request
for page in pages {
    let result = ocr_api(&page.image).await?;
    save(&result);
}

// Good: batch + concurrency limit (ただし API rate limit を尊重)
let sem = Arc::new(Semaphore::new(4));  // 4 並列まで
let handles: Vec<_> = pages.into_iter().map(|page| {
    let sem = Arc::clone(&sem);
    tokio::spawn(async move {
        let _permit = sem.acquire().await.unwrap();
        ocr_api(&page.image).await
    })
}).collect();
```

### PDF 全ページ render: streaming + 必要時のみ

```rust
// Bad: 全ページ bitmap を vector に retain
let bitmaps: Vec<Bitmap> = (0..page_count).map(|i| render(i)).collect();
for bm in &bitmaps { /* ... */ }
// → 全 page の bitmap が同時に retain される (OOM リスク)

// Good: streaming
for i in 0..page_count {
    let bm = render(i);
    process(&bm);
    drop(bm);  // 早期 drop
}
```

### IDML XML parse: parse once + index

```rust
// Bad: parse を story / page ごとに毎回
for story_ref in story_refs {
    let xml = std::fs::read_to_string(&story_ref.path)?;
    let parsed = parse_story(&xml)?;
    process(&parsed);
}

// Good: parse once + index
let mut stories: HashMap<StoryId, ParsedStory> = HashMap::new();
for story_ref in story_refs {
    let xml = std::fs::read_to_string(&story_ref.path)?;
    stories.insert(story_ref.id.clone(), parse_story(&xml)?);
}
```

---

## 改善の判断フロー

```text
1. ループ内に I/O / network / IPC / COM があるか?
   - Yes → 必ず最適化候補
   - No  → 他のカテゴリへ

2. read once / parse once で済むか?
   - Yes → 即実装
   - No  → 次へ

3. batch API があるか / 作れるか?
   - Yes → batch 化
   - No  → 次へ

4. concurrency limit を入れて async parallel できるか?
   - Yes → semaphore + tokio
   - No  → sequential のまま

5. cache を入れる必要があるか?
   - Yes → invalidation 戦略を決めてから (bounded LRU / TTL)
   - No  → cache 入れない (推奨)

6. 改善後 Before/After bench で確認
```
