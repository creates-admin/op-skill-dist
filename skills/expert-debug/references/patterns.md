# expert-debug バグパターン (active stack)

検出兆候の正本。報告閾値は SKILL.md の Severity Policy。

## catalog 索引 (top 20 — active stack 集中版)

### Tauri v2 境界 (最頻出)

`Vue state → invoke → #[tauri::command] → serde → domain → fs/process/DB/sidecar → Result → serde → Vue state` の各境界を順に疑う。

| # | パターン | 検出兆候 | 確認・修正 |
|---|---|---|---|
| 1 | invoke payload と Rust command 引数不一致 | `invoke('cmd', { foo })` と `fn cmd(bar: ...)` で名前 / 型が乖離 | key と引数名・型を 1 対 1 で照合。camelCase ↔ snake_case 自動変換はトップレベル引数のみで、ネストした struct には適用されない (`rename_all` の付け忘れ) |
| 2 | command 戻り値の Result serialize 失敗 | `Result<T, E>` の `E` が Serialize 未実装 / 詳細不明エラーが UI に届く | `E` の `Serialize` 実装、`thiserror` + `From<...>` の網羅 |
| 3 | capability / permission 漏れ | dev では動くが build 後だけ失敗 | `src-tauri/capabilities/*.json` と plugin permission を追加 |
| 4 | path scope 漏れ | dialog の戻りを使った fs アクセスが本番だけ deny | `BaseDirectory` 経由で resolve し、allowed scope に含まれるか確認 |
| 5 | WebView 側 invoke エラー握りつぶし | `.catch(...)` 不在で UI が無反応、保存できたと誤認 | toast / error state への接続を確認 |

追加で見る境界: sidecar / external command (`bundle.externalBin`・resource path の resolve、開発環境だけ動く) /
event の `listen` の戻り unlisten を呼ばない / `on_window_event` の `CloseRequested` 欠落で保存前に終了 /
新規 command の `tauri::generate_handler` 登録漏れ / `#[serde(default)]` 不在で旧 config が読めない。

### Rust

6 `unwrap()` / `expect()` panic (Tauri 経由で UI クラッシュ) / 7 `tokio::spawn` の JoinHandle 捨て / 8 async 関数・Tauri command 内の `std::fs` 直呼び /
9 `Result` / `?` 経路への `unwrap` / `panic!` 混入 / 10 path canonicalize 漏れ (`canonicalize()?` 後に `starts_with(&root)` が無い)

### Vue 3 + TypeScript

11 reactivity 喪失 (`state = newObj` / `.value` 付け忘れ) / 12 `await invoke(...)` の catch 漏れ / 13 画面遷移後に古い async result を反映 /
14 Pinia store と component local state の二重管理 / 15 `forEach(async ...)` など Promise 非待機

### Flutter / Dart

16 controller / subscription の dispose 漏れ / 17 `await` 後の `BuildContext` 使用で `mounted` ガード不在 / 18 build 内で `FutureBuilder` の future 再生成 /
19 initState で未待機の future / 20 platform channel / file picker の例外 (`MissingPluginException` / permission) 未処理

### 環境依存 (低頻度)

Windows / UNC path の比較失敗、日本語ファイル名の NFC/NFD、DST 境界の時刻計算、BOM 付きファイル、ロケール依存ソート、
ネットワークドライブの遅延・タイムアウト、プロセス FD 上限 (EMFILE)。
