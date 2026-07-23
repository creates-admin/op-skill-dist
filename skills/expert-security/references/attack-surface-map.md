# attack-surface-map.md — 攻撃面棚卸し

<!--
機能概要: security-expert が scan / patrol / apply / post-check で参照する攻撃面 (attack surface) の棚卸し。
作成意図: 「どこを見るべきか」を一覧化することで、scan / patrol の網羅性を担保し、
         post-check で「別の攻撃面が増えていないか」を機械的に確認できるようにする。
注意点: 本ファイルは観点表。実際の到達可能性 (reachable / practical) の判定は source-sink-analysis.md。
       trust boundary 別の信頼境界判定は trust-boundaries.md。
-->

## 全体像 (P0 対象)

CreatesWorks / Tauri v2 / Rust / Vue / Flutter / Windows desktop 文脈での重点対象:

```text
P0 (最優先で audit):
- src-tauri/**
- #[tauri::command]
- std::fs / tokio::fs
- std::process::Command / Command::new
- tauri-plugin-shell
- tauri-plugin-fs
- capability / permission 設定 (tauri.conf.json / capabilities/**)
- user-selected path (OS file picker / directory picker 経由)
- export / import (フォーマット変換 / シリアライズ / デシリアライズ)
- InDesign / ExtendScript / COM 連携
- updater / external URL / HTTP
- archive extraction (zip / tar / IDML)
- parser (PDF / image / CSV / JSON / TOML)
- log / error 出力 (production path / token / document content の漏洩)
```

## attack_surface enum (canonical schema 拡張)

canonical schema の `security.attack_surface` には以下のいずれかを設定する:

| attack_surface | 説明 | P0 対象 |
|----------------|------|---------|
| `ipc` | Tauri command / IPC / WebView ↔ Rust 境界 | `#[tauri::command]` / invoke / event |
| `file_io` | std::fs / tokio::fs / async-std::fs | read / write / delete / rename / copy |
| `path` | path canonicalization / parent traversal / symlink / reparse point / UNC / device path / ADS / reserved name | std::path::Path / PathBuf / canonicalize |
| `shell` | std::process::Command / tauri-plugin-shell / 外部アプリ起動 | Command::new / args / shell |
| `capability` | Tauri capability / permission / scope | capabilities/**/*.json / tauri.conf.json |
| `secret` | token / API key / 秘密鍵 / 認証情報 | env::var / Keychain / Credential Manager |
| `url` | external URL / HTTP / scheme 検証 / redirect | url::Url / reqwest / fetch |
| `parser` | PDF / image / zip / IDML / CSV / JSON / TOML / XML deserialize | serde_json / quick_xml / pdf-rs / image |
| `updater` | tauri-updater / signature 検証 / payload 検証 | tauri-updater / signing / public key |
| `logging` | log / error / panic message / dialog / Toast に secret / production path / document content 漏洩 | log::* / println / eprintln / Toast |
| `indesign_com` | ExtendScript / JSX 一時ファイル / COM 経由 InDesign 操作 | ExtendScript / JSX / win32com |
| `installer` | MSI / installer / signing / artifact 完整性 | tauri-bundler / wix / signtool |

---

## 1. Tauri command / IPC

### audit 対象

- `#[tauri::command]` 関数すべて (新規 / 既存)
- `frontend → invoke()` の呼び出し (frontend code)
- `Tauri event` (`emit` / `listen`) の payload 検証
- `WebView ↔ Rust` の境界 (URL filtering, dragDropEnabled, devtools, allowlist)

### 検査観点

- 入力検証: path / URL / 文字列 / 数値 範囲 / null byte / encoding
- 認可: capability / permission / scope と command が整合しているか
- エラーパス: panic / unwrap / expect が user input 経路で発火しないか
- 出力: error message / response に secret / production path が漏れていないか

詳細は `tauri-ipc.md`。

---

## 2. file IO / path

### audit 対象

- `std::fs::*` / `tokio::fs::*` / `async-std::fs::*` の呼び出し
- `Path::new` / `PathBuf::from` / `Path::join`
- `fs::canonicalize` / `fs::read_link` / `fs::symlink_metadata`
- `fs::create_dir_all` / `fs::write` / `fs::remove_file` / `fs::remove_dir_all`
- `fs::rename` / `fs::copy`

### 検査観点

- canonicalize 後に scope (root / workspace / user-selected) 内かを確認しているか
- symlink / junction / reparse point を resolve したか
- UNC path / device path (`\\?\C:\...`) を reject しているか
- reserved name (CON, PRN, AUX, NUL, COMx, LPTx) を reject しているか
- alternate data stream (`file.txt:stream`) を reject しているか
- mixed separator (/ と \) の正規化
- trailing dot / trailing space の正規化
- TOCTOU (rename / copy / delete の race)
- temp directory race
- overwrite 時の確認 / 削除時の確認

詳細は `path-file-io.md` / `windows-path-boundaries.md` / `file-picker-and-user-selected-path.md`。

---

## 3. shell / process

### audit 対象

- `std::process::Command::new` / `Command::arg` / `Command::args`
- `tauri-plugin-shell` の `Command` / `open` / `spawn`
- 外部アプリ起動 (InDesign / Photoshop / Acrobat / explorer / open / xdg-open)
- ExtendScript / JSX 経由の InDesign 操作
- COM 経由の外部アプリ起動

### 検査観点

- shell 文字列連結ではなく args 配列で渡しているか
- shell metachar (`& | ; > < ' " $ ` ` `() {} [] ! \\` および `\n` `\r`) の混入を reject しているか
- user input を direct interpolation していないか
- working_dir / env がユーザー操作で改変できないか
- 起動先 binary が trusted path にあるか (PATH 依存ではないか)
- output / error の secret / path 漏洩

詳細は `shell-process.md` / `indesign-com-extendscript.md`。

---

## 4. capability / permission

### audit 対象

- `tauri.conf.json` の `app.security.capabilities`
- `capabilities/**/*.json` の `permissions` / `windows` / `webviews`
- `app.security.csp` (Content Security Policy)
- `app.security.dangerousUseHttpScheme` / `app.security.dangerousDisableAssetCspModification`
- `app.security.dangerousRemoteDomainIpcAccess`
- `tauri-plugin-fs` / `tauri-plugin-shell` / `tauri-plugin-http` の scope

### 検査観点

- 必要最小限の permission しか有効化されていないか
- `**` / `*` のような broad scope ではなく具体的 path / scheme になっているか
- `dangerousUseHttpScheme` 等の dangerous 設定が無効か、必要なら threat model に明記しているか
- capability が IPC command の実利用と乖離していないか (overreach)
- 削除した capability がまだ frontend / backend で参照されていないか (dangling)

詳細は `capability-permission.md`。

---

## 5. secret / token / log / error / dialog / Toast

### audit 対象

- env::var / std::env / dotenv 経由の取得
- Keychain (macOS) / Credential Manager (Windows) / Secret Service (Linux) 経由の取得
- log::info! / log::error! / println! / eprintln! / dbg!
- error message (Result::Err / Box<dyn Error> / anyhow::Error) / panic message の chain
- dialog / Toast / status bar / error 画面の表示
- crash report / telemetry
- generated artifact (生成された JSX / 生成された JSON / 生成された PDF) に secret が混入していないか

### 検査観点

- secret / production path (絶対 path / ユーザー名を含む path) / document content (顧客の文書 / 個人情報) / token を log / error / Toast / artifact / commit に出力していないか
- error chain で source error をそのまま転送していないか (sanitize 漏れ)
- crash report / telemetry に user content が含まれないか
- dialog / Toast 文言に技術詳細を出しすぎていないか

詳細は `secrets-and-logs.md`。

---

## 6. external URL / updater / installer / signing

### audit 対象

- reqwest / ureq / fetch の呼び出し
- tauri-updater / `app.updater` の設定 / updater manifest (latest.json / version)
- `<a href="...">` の external URL
- redirect 追跡
- TLS / cert 検証
- updater payload signature 検証 / public key の管理
- tauri-bundler / MSI / DMG / AppImage / deb 生成
- signtool / codesign / authenticode
- artifact の完整性検証

### 検査観点

- scheme allowlist (https のみ等) / host allowlist (production domain のみ)
- redirect 追跡時に scheme / host が変わったら reject
- TLS は default (rustls / system roots) を使い、`accept_invalid_certs` 等の dangerous setting を有効化していないか
- updater payload の signature 検証を skip していないか
- public key / signing key を hard-coded / repo・artifact に commit していないか、適切に管理されているか
- updater manifest の URL が trusted host か
- signing が CI / release pipeline で必須化されているか
- artifact のハッシュ / 署名検証を skip していないか

詳細は `external-url-updater.md` (updater 節) および別途 release-expert (Phase 4) と分担。

---

## 7. parser / archive / serializer (zip-slip 含む)

### audit 対象

- serde_json / serde_yaml / toml / quick_xml の deserialize
- pdf-rs / lopdf / poppler の PDF parse
- image / zune-image / kamadak-exif の image parse
- zip / tar / flate2 / brotli の archive extraction (ユーザーが import した archive を含む)
- IDML (XML over zip) の parse / extraction
- CSV (csv crate) の parse

### 検査観点

- archive extraction で zip-slip (entry name の `..` / 絶対 path / path traversal in zip) を防いでいるか
- 解凍先が canonicalize 後に scope (workspace / user-selected) 内に閉じているか
- 個別 entry のファイルサイズ / archive 全体のサイズ / エントリ数 / 圧縮比 / 解凍後合計サイズの上限があるか (zip bomb / decompression bomb 対策)
- ネストされた archive (zip in zip) の扱い
- symlink / hardlink を含む archive の扱い (作成時 reject)
- deserialize で巨大配列 / 深い nesting / 巨大 string を reject しているか (deserialize DOS)
- recursion limit / depth limit / size limit / count limit
- parser に user input を直接渡す前に file size / encoding を確認しているか

詳細は `parser-boundary.md` (archive 節含む)。

---

## 8. InDesign COM / ExtendScript

### audit 対象

- ExtendScript (.jsx) の generation
- JSX 一時ファイルの保存先 / 削除タイミング / 権限
- ExtendScript 文字列に user input を interpolate
- COM 経由の InDesign 起動 / バージョン routing
- generated script / log への production path / document content 漏洩

### 検査観点

- path / text / document content を JSX 文字列へ直接 interpolation していないか
- JSX 文字列内で proper escape (`\\`, `\"`, `\n` 等) しているか
- temp JSX を安全な一時領域に作成しているか (`$TEMP` / system temp)
- temp JSX の権限と削除を管理しているか (cleanup on error)
- COM / ExtendScript 起動を shell injection と同等に扱っているか
- InDesign version routing は trusted internal だが、外部入力で version path を選ばせていないか
- script / log / error に production path や document content を過剰出力していないか

詳細は `indesign-com-extendscript.md`。

---

## 9. temp / cache / backup

### audit 対象

- system temp directory (`$TEMP` / `/tmp`)
- cache directory (`$LOCALAPPDATA` / `~/.cache`)
- backup file (`*.bak` / `*~`) の生成
- generated artifact (PDF / JSX / JSON) の保存

### 検査観点

- temp file の権限 (other user から読めないか)
- temp file の cleanup (process crash 時 / error 時)
- cache に secret / document content が permanent に残らないか
- backup の symlink 経由攻撃 (predictable path)

詳細は `path-file-io.md` の temp 節。

---

## 10. drag & drop / clipboard

### audit 対象

- `dragDropEnabled: true` の Tauri window
- `tauri-plugin-clipboard-manager`
- frontend `dragenter` / `drop` event handler
- clipboard 経由の path / URL / file 取り込み

### 検査観点

- drag drop 経由の path を file picker と同等の検査 (canonicalize / scope) にかけているか
- clipboard text を URL / path として扱う前に validation しているか
- 外部ファイルの拒否 / 受入リストの明示

---

## 11. CLI argument / env var

### audit 対象

- `std::env::args` / `clap` / `argh` の parse
- `std::env::var` / `dotenv`
- launch arguments (Tauri / debug build)

### 検査観点

- CLI arg に user-controllable path / URL を取らせていないか
- env var に依存する dangerous setting (debug, devtools, allowlist) が production で off か
- `RUST_LOG` / `TAURI_DEBUG` 等の env が production で意図せず ON にならないか

---

## 12. 新規追加変更の最優先 patrol 対象

`op-patrol` で最近の変更を優先する場合、以下を最優先 candidate に含める:

- 新規追加された `#[tauri::command]`
- 新規追加された `std::fs::*` / `tokio::fs::*`
- 新規追加された `Command::new` / `tauri-plugin-shell`
- 新規追加された capability / permission
- 新規追加された import / export 機能
- 新規追加された external URL / HTTP request
- 新規追加された parser / archive extraction
- 新規追加された log::* / error 表示
- 新規追加された InDesign / ExtendScript / COM 連携
- 新規追加された drag drop / clipboard handler

詳細な candidate 選定は op-patrol 側 (`~/.claude/skills/op-patrol/SKILL.md`) を参照。
本 skill は patrol 対象を audit する観点を提供する。
