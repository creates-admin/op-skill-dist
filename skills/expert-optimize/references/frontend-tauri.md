# Frontend / Tauri Performance — Vue 3 / TypeScript / Tauri v2 / Flutter

対象は initial bundle size / interaction latency / memory retention / LCP・TBT / IPC 往復と payload / 起動時間。
色・余白 (designer) や文言・状態網羅 (ux-ui-audit) は扱わない。性能指標で示せるものだけ。

## Tauri v2 境界

Tauri の劣化は Rust の処理そのものより frontend ↔ Rust 境界 (IPC 粒度・serialize・main thread blocking) で起きやすい。
Rust 側と frontend 側のどちらで起きているかを分けて測る。WebView 性能は OS 依存 (WebView2 / WKWebView)。

判断順:

1. invoke の往復回数が多い (loop 内 invoke / render loop・scroll handler 内 invoke / 1 件ずつ get・set) → batch command / event 化
2. payload が大きい (> 100 KB、binary) → file path handoff (`convertFileSrc`、asset protocol の scope 設定が要る) / streaming / incremental event
3. command 内の重い同期処理・`std::fs` → `spawn_blocking` / `tokio::fs`
4. frontend が `setInterval` で invoke polling → event listener
5. 起動が遅い → lazy init / setup で background spawn / splash + lazy bundle

| 操作 | 目安 |
|---|---|
| 空 invoke / event emit | ~0.1〜0.5 ms |
| JSON < 1 KB / 10 KB | ~0.5〜1 ms / ~1〜5 ms |
| JSON 1 MB | ~50〜200 ms |
| binary 1 MB を base64 経由 | ~100〜400 ms (33% 肥大 + parse) |
| binary 1 MB を file URL 経由 | ~5〜20 ms |

計測は frontend で `performance.now()`、Rust で `Instant::now()`。計測コードは commit 前に削除する。

## bundle / runtime (Vue 3)

- ライブラリの置換・lazy load は、visualizer で 100 KB 以上かつ initial chunk に含まれることを確認してから行う (実は数 KB しか効かないことがある)。LCP・TBT を測らずに lazy load しない
- `shallowRef` / `markRaw` を一律に適用しない (reactive が必要なものに適用すると UI が更新されなくなる)
- Web Worker は IPC overhead が新しい bottleneck になりうる。µs 単位の処理を逃がさない

## Flutter

計測は `flutter run --profile` + devtools。debug mode の数値で判断しない。サイズは `flutter build apk --release --analyze-size` で比較する。
