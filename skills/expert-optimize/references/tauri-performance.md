# Tauri Performance — Tauri v2 IPC / 起動 / payload

Tauri の劣化は Rust の処理そのものより、frontend ↔ Rust 境界 (IPC 粒度・serialize・main thread blocking) で起きやすい。Rust 側と frontend 側のどちらで起きているかを必ず分けて測る。WebView 性能は OS 依存 (WebView2 / WKWebView)。

## 典型 bottleneck と判断順

1. invoke の往復回数が多い (loop 内 invoke / render loop・scroll handler 内 invoke / 1 件ずつ get・set) → batch command / event 化
2. payload が大きい (> 100 KB、binary) → file path handoff / streaming / incremental event
3. command 内の重い同期処理・`std::fs` → `spawn_blocking` / `tokio::fs`
4. frontend が `setInterval` で invoke polling → event listener
5. 起動が遅い → lazy init / setup で background spawn / splash + lazy bundle

## 所要時間の目安

| 操作 | 目安 |
|---|---|
| 空 invoke / event emit | ~0.1〜0.5 ms |
| JSON < 1 KB / 10 KB | ~0.5〜1 ms / ~1〜5 ms |
| JSON 1 MB | ~50〜200 ms |
| binary 1 MB を base64 経由 | ~100〜400 ms (33% 肥大 + parse) |
| binary 1 MB を file URL 経由 | ~5〜20 ms |

## 計測

- frontend: `performance.now()` で `await invoke()` を挟む。Rust: `Instant::now()` + `elapsed()`。**計測コードは commit 前に削除する**
- 起動時間: CLI / headless モードがあれば hyperfine、GUI は tauri-driver (WebDriver) / playwright

---

## パターン

### command batching

`for (id of ids) await invoke('get_meta', {id})` → `invoke('get_meta_batch', { ids })`。Rust 側は `Vec::with_capacity(ids.len())` に詰めて返す。

### file path handoff (binary を IPC で渡さない)

```rust
#[tauri::command]
async fn render_page(app: tauri::AppHandle, page: usize) -> Result<String, String> {
    let bitmap = render(page);
    let path = app.path().resolve(format!("page_{page}.png"), BaseDirectory::AppCache)
        .map_err(|e| e.to_string())?;
    std::fs::write(&path, &bitmap).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}
```

frontend は `convertFileSrc(localPath)` (`@tauri-apps/api/core`) を `img.src` 等に渡し、WebView が直接読む。asset protocol の scope 設定が要る。

### event による progress (polling 廃止)

Rust は `use tauri::Emitter;` で `app.emit("progress", i)`、frontend は `const unlisten = await listen<number>('progress', e => ...)` し、`onUnmounted(() => unlisten())` で必ず解除する。

### main thread / runtime blocking

```rust
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

- 軽い読み込みは `tokio::fs::read_to_string(..).await`
- command 内で `Handle::current().block_on(..)` を呼ばない (runtime 内の再入で panic)

### State で大型データを共有

- 毎回 command 内で manifest を parse しない。`.manage(AppState { manifest: Mutex<Option<Arc<Manifest>>> })` に一度 load し、command は `State<'_, AppState>` から `Arc` を clone して使う (lock 保持を短く)
- command 引数は serde 経由なので `Arc` / `Mutex` は渡せない。共有は State で持つ

### frontend 側のキャッシュ / filter

- 同じ引数の invoke は `useMemoize` (@vueuse/core) で memoize できる。データ更新時の cache clear を決めてから
- 全件取って frontend で filter しない。filter 条件を invoke 引数で渡し backend で絞る (payload と computed の両方が減る)

### capability

`src-tauri/capabilities/*.json` の過剰な permission / scope を絞る (security 影響に加え IPC validation コストも増える)。

## startup

- 重い init を `main` で同期実行しない。`OnceLock` で初回使用時に初期化するか、`.setup(|app| { let h = app.handle().clone(); tauri::async_runtime::spawn(async move { ...; h.emit("manifest-ready", ..) }); Ok(()) })` で background 化
- frontend は initial bundle を最小にし、本体を `await import('./app')` で lazy load + splash (`frontend-bundle-performance.md`)
