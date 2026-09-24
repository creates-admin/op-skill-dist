# attack-surface-map.md — 露出面の棚卸し

scan / patrol で「どこを見るか」の一覧。到達可能性の判定は `source-sink-analysis.md`、各領域の検査観点はカタログ側。

## attack_surface 分類と見る場所

| attack_surface | 見る場所 | カタログ |
|---|---|---|
| `ipc` | `#[tauri::command]` / frontend の `invoke()` / event `emit`・`listen` / WebView 設定 | `tauri-ipc.md` |
| `capability` | `tauri.conf.json` の `app.security.*` / `capabilities/**/*.json` / plugin scope (fs / shell / http) | `tauri-ipc.md` |
| `file_io` | `std::fs` / `tokio::fs` の read・write・delete・rename・copy・create_dir_all | `path-file-io.md` |
| `path` | `Path::join` / `PathBuf::from` / canonicalize / Windows 固有の path 形式 | `path-file-io.md` |
| `shell` | `std::process::Command` / tauri-plugin-shell / 外部アプリ起動 | `shell-process.md` |
| `indesign_com` | ExtendScript (.jsx) 生成 / JSX 一時ファイル / COM 起動 / version routing | `shell-process.md` |
| `secret` / `logging` | env・OS 資格情報ストアからの取得 / `log::*`・`println!`・`dbg!` / error chain / dialog・Toast / 生成 artifact / crash report | `secrets-and-logs.md` |
| `url` / `updater` | reqwest・ureq・fetch / 外部リンク / redirect / TLS 設定 / updater manifest・signature | `external-url-updater.md` |
| `parser` | serde / quick_xml / PDF・image parser / zip・tar・IDML 展開 / CSV・TOML | `parser-boundary.md` |
| `installer` | bundler 設定 / signing / artifact の完全性検証 | 下記 |

## カタログの無い領域

**temp / cache / backup**
- temp file が他ユーザーから読めないか、crash・error 時に消えるか
- cache に secret・文書内容が残り続けないか
- predictable な backup / temp path が symlink で悪用されないか

**drag & drop / clipboard**
- `dragDropEnabled` は必要な window だけか
- drop された path を picker 経由と同じ検査 (canonicalize ほか) にかけているか (`usable-security.md` §4)
- clipboard の text を path / URL として使う前に検証しているか

**CLI 引数 / 環境変数**
- CLI 引数でユーザーが制御できる path / URL を受けていないか
- debug / devtools / allowlist などの dangerous setting が env で production に入らないか (`RUST_LOG` / `TAURI_DEBUG` 等)
- `RUST_LOG` 等は log level にだけ使い、出力先 path や format に使わない

**installer / signing**
- signing が release pipeline で必須か、artifact のハッシュ・署名検証を省いていないか
- signing key / updater 秘密鍵が repo・artifact に入っていないか
- 設計変更は planned expert の領域なので apply せず finding として指摘する

## patrol の優先対象 (新規追加された変更)

`#[tauri::command]` / `std::fs`・`tokio::fs` / `Command::new`・tauri-plugin-shell / capability・permission / import・export /
external URL・HTTP / parser・archive 展開 / log・error 表示 / InDesign・ExtendScript・COM / drag-drop・clipboard handler。
scan でも上記と `src-tauri/**`・user-selected path を最優先 (P0) で見る。区画の選定は op-patrol controller が行い、本 expert は渡された area を監査する。
