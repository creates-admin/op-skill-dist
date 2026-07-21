# Tauri Performance — Tauri v2 IPC / 起動 / payload 最適化

<!--
機能概要: Tauri v2 アプリの性能改善判断と実装パターン。
作成意図: Tauri の性能劣化は Rust の処理そのものより、frontend ↔ Rust の
         IPC 粒度・JSON serialize・main thread blocking が原因になりやすい。
         本ファイルはこの「境界の性能」に集中する。
注意点: WebView 性能は OS 依存 (Edge WebView2 / WKWebView)。
       Rust 側 / frontend 側のどちらで起きているかを必ず分ける。
-->

## Tauri 性能の典型的 bottleneck

| カテゴリ | 例 | 影響 |
|---------|---|------|
| IPC chatty | invoke を高頻度に呼ぶ (render loop / scroll handler) | UI freeze、IPC overhead が支配的 |
| 巨大 payload | Vec<u8> / Vec<f64> を base64 で渡す | serialize / deserialize で main thread block |
| command 粒度過小 | 1 件ずつ get/set で N 回 invoke | round-trip が支配的 |
| main thread blocking | command 内で重い同期処理 | UI freeze |
| frontend polling | setInterval で invoke poll | 不要 IPC、battery 劣化 |
| sync I/O on command | command 内で std::fs 直呼び | runtime block |
| startup cost | 起動時に大量 init | 初期表示遅延 |

---

## 計測

### invoke の所要時間

```typescript
// 簡易計測 (frontend)
const t0 = performance.now()
const result = await invoke('cmd', args)
console.log(`invoke cmd: ${(performance.now() - t0).toFixed(1)}ms`)
```

### Rust command の所要時間

```rust
#[tauri::command]
async fn cmd(args: Args) -> Result<Output, String> {
    let t0 = std::time::Instant::now();
    let r = inner(args).await;
    eprintln!("[BENCH] cmd: {:?}", t0.elapsed());
    r
}
```

> **計測コードは benchmark 専用 build flag に隔離し、merge 前に削除する**。

### hyperfine で起動時間

```bash
hyperfine \
  --warmup 1 \
  --runs 10 \
  './src-tauri/target/release/app --headless'  # CLI mode 等
```

GUI 起動時間は WebDriver / playwright で計測 (Tauri の `#tauri-driver` を使う構成)。

---

## 改善パターン

### 1. command batching — N+1 invoke を 1 回に

```typescript
// Bad: N+1
for (const id of ids) {
  const meta = await invoke('get_meta', { id })
  // ...
}

// Good: batch
const metas = await invoke('get_meta_batch', { ids })
```

```rust
#[tauri::command]
async fn get_meta_batch(ids: Vec<String>) -> Result<Vec<Meta>, String> {
    let mut out = Vec::with_capacity(ids.len());
    for id in ids {
        out.push(load_meta(&id).await?);
    }
    Ok(out)
}
```

### 2. file path handoff — binary を IPC で渡さない

```rust
// Bad: 巨大 binary を base64 / JSON 経由
#[tauri::command]
async fn render_page(page: usize) -> Result<Vec<u8>, String> {
    let bitmap = render(page);
    Ok(bitmap)  // serialize で base64 化、巨大
}
```

```rust
// Good: tmp file に書き、frontend は file URL で読む
use tauri::path::BaseDirectory;
use tauri::Manager;

#[tauri::command]
async fn render_page(app: tauri::AppHandle, page: usize) -> Result<String, String> {
    let bitmap = render(page);
    let path = app.path().resolve(format!("page_{}.png", page), BaseDirectory::AppCache)
        .map_err(|e| e.to_string())?;
    std::fs::write(&path, &bitmap).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}
```

```typescript
import { convertFileSrc } from '@tauri-apps/api/core'

const localPath = await invoke<string>('render_page', { page: 0 })
const url = convertFileSrc(localPath)
imgEl.src = url  // WebView が直接 file から読む (IPC を通らない)
```

### 3. event-based progress — polling を廃止

```typescript
// Bad: polling
setInterval(async () => {
  const progress = await invoke('get_progress')
  bar.value = progress
}, 100)
```

```typescript
// Good: event listener
import { listen } from '@tauri-apps/api/event'

const unlisten = await listen<number>('progress', (e) => {
  bar.value = e.payload
})
onUnmounted(() => unlisten())
```

```rust
use tauri::Emitter;

#[tauri::command]
async fn long_task(app: tauri::AppHandle) -> Result<(), String> {
    for i in 0..100 {
        do_step(i).await;
        app.emit("progress", i).map_err(|e| e.to_string())?;
    }
    Ok(())
}
```

### 4. main thread blocking を spawn_blocking に逃がす

> **汎用パターン**: `spawn_blocking` / `tokio::fs` の基礎パターンは `io-and-batching.md` を正本とする。
> 本節は Tauri command / `AppHandle` を伴う固有コンテキストのみ記載する。

```rust
// Bad: command 内で重い同期処理 → runtime block
#[tauri::command]
async fn parse_idml(path: String) -> Result<Manifest, String> {
    let s = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let m = parse_huge(&s).map_err(|e| e.to_string())?;
    Ok(m)
}
```

```rust
// Good: spawn_blocking で隔離
#[tauri::command]
async fn parse_idml(path: String) -> Result<Manifest, String> {
    tokio::task::spawn_blocking(move || {
        let s = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
        parse_huge(&s).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}
```

### 5. async tokio::fs を使う

```rust
// Bad: tokio runtime に std::fs を持ち込む
#[tauri::command]
async fn read_config() -> Result<Config, String> {
    let s = std::fs::read_to_string("config.toml").map_err(|e| e.to_string())?;
    toml::from_str(&s).map_err(|e| e.to_string())
}

// Good
#[tauri::command]
async fn read_config() -> Result<Config, String> {
    let s = tokio::fs::read_to_string("config.toml").await.map_err(|e| e.to_string())?;
    toml::from_str(&s).map_err(|e| e.to_string())
}
```

### 6. State (managed) で大型データを共有

```rust
// 起動時に一度だけ load し、command で再利用
use tauri::State;
use std::sync::Mutex;

struct AppState {
    manifest: Mutex<Option<Arc<Manifest>>>,
}

fn main() {
    tauri::Builder::default()
        .manage(AppState { manifest: Mutex::new(None) })
        .invoke_handler(tauri::generate_handler![load_manifest, get_meta])
        .run(tauri::generate_context!())
        .expect("error");
}

#[tauri::command]
async fn load_manifest(state: State<'_, AppState>, path: String) -> Result<(), String> {
    let m = Arc::new(parse_manifest(&path).await.map_err(|e| e.to_string())?);
    *state.manifest.lock().unwrap() = Some(m);
    Ok(())
}

#[tauri::command]
async fn get_meta(state: State<'_, AppState>, id: String) -> Result<Meta, String> {
    let m = state.manifest.lock().unwrap().as_ref()
        .ok_or("manifest not loaded")?
        .clone();
    Ok(m.get(&id).cloned().ok_or("not found")?)
}
```

> **command 内で `parse_manifest` を毎回呼んではいけない**。State に保持する。

### 7. command 結果の cache (frontend 側)

```typescript
// 同じ引数の invoke を memoize
import { useMemoize } from '@vueuse/core'

const getMeta = useMemoize(async (id: string) => {
  return await invoke<Meta>('get_meta', { id })
})

// 同じ id への呼び出しは cache から
const m1 = await getMeta('a')
const m2 = await getMeta('a')  // cache hit
```

> invalidation 戦略を明確に。data 更新後は cache clear が必要。

### 8. capability / permission 設定で不要 capability を外す

```json
// src-tauri/capabilities/default.json
{
  "permissions": [
    "core:default",
    "fs:allow-read-text-file",
    {
      "identifier": "fs:scope",
      "allow": [{ "path": "$APPDATA/myapp/*" }]
    }
  ]
}
```

> 過剰な permission は security 影響だけでなく、IPC validation コストも増やす。

---

## startup 最適化

### lazy init で起動を軽く

```rust
// Bad: 起動時に全 init
fn main() {
    let manifest = parse_huge_manifest();  // 5 秒
    let cache = build_cache();             // 3 秒
    tauri::Builder::default()
        .manage(AppState { manifest, cache })
        .run(tauri::generate_context!())
        .unwrap();
}

// Good: lazy init (使うときに初めて)
struct AppState {
    manifest: OnceLock<Manifest>,
    cache: OnceLock<Cache>,
}

#[tauri::command]
async fn ensure_manifest(state: State<'_, AppState>) -> Result<(), String> {
    state.manifest.get_or_init(|| parse_huge_manifest());
    Ok(())
}
```

### setup hook での重い処理を background に

```rust
fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                // 重い init は background で
                let manifest = parse_huge_manifest_async().await;
                handle.emit("manifest-ready", &manifest).unwrap();
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .unwrap();
}
```

### frontend の splash screen + lazy bundle

```typescript
// initial bundle を最小に、本体は lazy import
async function bootstrap() {
  const { startApp } = await import('./app')  // lazy
  await startApp()
}
showSplash()
bootstrap().then(hideSplash)
```

---

## アンチパターン (Tauri)

### IPC を「同期 function 呼び出し」のつもりで使う

frontend で `await invoke()` を 1 件ごとに loop するのは N round-trip。
**1 回でまとめて取る / event で push する** 設計に変える。

### 全件取って frontend で filter

```typescript
// Bad: 100,000 件取って frontend で filter
const all = await invoke<Item[]>('get_all_items')
const filtered = all.filter(i => i.match(query))

// Good: filter 条件を渡して backend で絞る
const filtered = await invoke<Item[]>('get_items', { query })
```

### `block_on` を command 内で

```rust
// Bad: tokio runtime を再 entry → 自殺
#[tauri::command]
async fn cmd() -> Result<(), String> {
    tokio::runtime::Handle::current().block_on(other_async())  // panic
}
```

### `Arc<Mutex<T>>` を command 引数に

Tauri command 引数は serde 経由なので Arc/Mutex を引数で渡せない。
State (managed) で持つ。

### binary を JSON serialize で渡す

```rust
// Bad: Vec<u8> は base64 化されて 33% 肥大、parse コストも
#[tauri::command]
async fn read_image(path: String) -> Result<Vec<u8>, String> {
    Ok(std::fs::read(&path).map_err(|e| e.to_string())?)
}
```

→ `convertFileSrc` で file URL handoff に置き換え。

---

## benchmark の所要時間目安

| 操作 | 所要時間 |
|------|---------|
| 空 invoke (引数なし、戻り値なし) | ~0.1〜0.5 ms |
| 小さい JSON (< 1KB) invoke | ~0.5〜1 ms |
| 中 JSON (10KB) invoke | ~1〜5 ms |
| 大 JSON (1MB) invoke | ~50〜200 ms (serialize 込み) |
| binary 1MB を base64 経由 invoke | ~100〜400 ms |
| binary 1MB を file URL 経由 | ~5〜20 ms (file IO のみ) |
| event emit | ~0.1〜0.5 ms |

> 運用上の payload size を見積もり、IPC で送るか file handoff にするかを判断する。

---

## 改善判断フロー (Tauri)

```text
1. invoke の往復回数が多いか?
   - Yes → batch 化、または event 化
   - No  → 次へ

2. payload が大きいか? (> 100 KB)
   - Yes → file path handoff、streaming、incremental event
   - No  → 次へ

3. command 内で重い同期処理があるか?
   - Yes → spawn_blocking、または tokio::fs
   - No  → 次へ

4. frontend が polling していないか?
   - Yes → event listener に置き換え
   - No  → 次へ

5. startup が遅いか?
   - Yes → lazy init、background spawn、splash
   - No  → 次へ

6. 改善後 hyperfine / DevTools profile で再計測
```
