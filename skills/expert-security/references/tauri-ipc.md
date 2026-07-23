# tauri-ipc.md — Tauri IPC / WebView 境界 + command 入力検証契約

<!--
機能概要: Tauri command / IPC / WebView ↔ Rust 境界の audit 観点、および `#[tauri::command]`
         個別の入力検証チェックリスト・エラーパス作法・panic 禁止・dead reference 検出を集約する。
作成意図: 元 tauri-ipc.md (境界全体) と tauri-command-contract.md (command 単位の契約) は
         相互 pointer が本文の 2 割を占める過剰分割だったため 1 ファイルに統合した。
注意点: capability / permission そのものの最小化・過剰許可検出は capability-permission.md。
       本ファイルは「IPC 境界全体の観点」と「command 単位の入力検証・エラーパス契約」の両方を扱う。
-->

## audit 対象

- すべての `#[tauri::command]` 関数
- frontend 側の `invoke()` / `core/Tauri` API 呼び出し
- Tauri event (`emit` / `listen`)
- WebView 設定 (`devtools` / `additionalBrowserArgs` / `dragDropEnabled` / `acceptFirstMouse`)
- WebView ↔ Rust の payload (Window message / custom protocol)
- Tauri plugin の registered command (tauri-plugin-fs / tauri-plugin-shell / tauri-plugin-http 等)
- `app.security.csp` / `app.security.dangerousUseHttpScheme` / `app.security.dangerousDisableAssetCspModification` / `app.security.dangerousRemoteDomainIpcAccess`

---

## 入力検証チェックリスト

すべての `#[tauri::command]` 関数の引数は **untrusted** として、以下を順番にチェックする:

```text
1. 引数の型は最小限の表現か
   - String を取る場合、enum で表現できないか確認
   - Vec<u8> を取る場合、size 上限を State 側で hold

2. 文字列引数 (String, &str, OsString)
   - 長さ上限 (例: 4096 bytes)
   - null byte (\0) reject
   - encoding 確認 (UTF-8 でない場合は明示)
   - 想定 format (path / URL / identifier / content) ごとに専用 validation

3. path 引数
   - trust_boundary を確定 (frontend_invoke = boundary A, untrusted)
   - parent traversal / UNC / device / reserved / ADS reject
   - canonicalize → scope check (boundary B 以外は scope 強制)
   - extension 検査
   - 詳細: windows-path-boundaries.md / file-picker-and-user-selected-path.md

4. URL 引数
   - url::Url::parse で parse
   - scheme allowlist (https のみ等)
   - host allowlist (production domain のみ)

5. 数値引数 (u32 / u64 / i64 / f64)
   - 範囲チェック (min / max, overflow 検出は checked_add / checked_mul)
   - 負数許容性 (時刻 / index は usize)

6. 構造体引数 (serde で deserialize)
   - serde の strict deserialize (deny_unknown_fields)
   - deserialize 後に business validation
   - 巨大 string / 巨大配列 / 深い nesting は reject (deserialize DOS)

7. binary 引数 (Vec<u8>, Bytes)
   - size 上限
   - magic number / format 検証
```

---

## capability / permission の整合

- registered command と capability の `permissions` が一致しているか
- 削除した command が capability に残っていないか (dangling)
- `**` / `*` ベースの broad scope を使わない (具体的 path / scheme で書く)

詳細は `capability-permission.md`。

---

## WebView 設定の検査

| 設定 | 推奨値 | 理由 |
|-----|--------|------|
| `devtools` | production: false / dev: true | 攻撃者が WebView 内 JS を debug / inject 防止 |
| `dragDropEnabled` | 必要な window でのみ true | drag drop 経由の path 取り込みを限定 |
| `acceptFirstMouse` | false (macOS) | 別 app の click 透過防止 |
| `additionalBrowserArgs` | 信頼できる値のみ | env var / user input で渡さない |
| `dangerousUseHttpScheme` | false (production) | HTTPS 強制 |
| `dangerousDisableAssetCspModification` | false | CSP の保護を維持 |
| `dangerousRemoteDomainIpcAccess` | 空配列 (= 無効) または明示 host のみ | remote IPC は最大限制限 |

---

## CSP (Content Security Policy)

- `app.security.csp` で defaul-src を限定
- inline script / inline style を必要なら nonce ベースで許可
- script-src に `'unsafe-eval'` / `'unsafe-inline'` を含めない (やむを得なければ理由を明記)
- connect-src は production domain のみ

---

## event boundary

- `app.emit_to(label, ...)` / `app.emit_all(...)` で送る payload に secret / production path を含めない
- `listen()` する payload を untrusted として validation
- broadcast event (`emit_all`) は全 window に届くため、特定 window 向けには `emit_to` を使う

---

## エラーパスの作法

```text
1. Result<T, E> を返す
   - panic / unwrap / expect は user input 経路で使わない
   - panic = アプリ全体のクラッシュ。user input 経由で発火するなら Critical

2. error type を構造化
   - String を返すと frontend で扱いづらい
   - thiserror / serde::Serialize で structured error
   - error には user 向け文言と log 向け詳細を分ける

3. error 内容の sanitize
   - 絶対 path / token / secret / document content を error に含めない
   - 詳細は log に書き、frontend には generic な error code / message のみ返す
```

---

## panic / unwrap の禁止

`#[tauri::command]` 内では以下を禁止:

- `unwrap()` (Result / Option どちらも)
- `expect("...")` (同上)
- `panic!` / `unreachable!` / `unimplemented!`
- `[idx]` (slice / Vec への index アクセス)
- `as` cast (overflow リスク → `try_into` を使う)
- 整数の `+` / `-` / `*` / `/` (overflow / divide-by-zero → `checked_*` を使う)

これらは **user input 経路で panic 化すると DOS** になる。panic-safe な書き方に変える。

---

## state mutation の作法

- `tauri::State<Mutex<T>>` で共有 state を持つ場合、lock 内で長時間処理しない
- lock 内で IO すると deadlock リスク
- async command で `tokio::sync::Mutex` を使う場合、lock 順序を統一 (deadlock 防止)
- `RwLock` の reader を保持したまま writer を取らない

---

## 削除した command の dead reference 検出

```bash
# Rust 側に declared な command 一覧
grep -r '#\[tauri::command\]' src-tauri/src/ -A 1 | grep 'fn ' | sed 's/.*fn \([^(]*\).*/\1/'

# capability で permission 設定された command 一覧
jq -r '.permissions[]?.identifier // .permissions[]' src-tauri/capabilities/*.json

# 上記の差分が dead reference / dangling permission
```

declared command と capability の permission が乖離している場合、capability 過剰許可または dead command。

---

## 典型 finding

| pattern | severity | mitigation |
|---------|----------|-----------|
| `#[tauri::command] fn write_file(path: String, content: String)` で入力検証なし | Critical | path validation + scope + canonicalize |
| `#[tauri::command] fn read_config(path: String) -> Result<String, String>` で path 検証なし | Critical | path canonicalize + scope check + extension |
| `#[tauri::command] fn run_script(args: Vec<String>) -> Result<String, _>` で args の検証なし | Critical | args 検証 + 起動先 binary trusted path |
| WebView の `devtools: true` が production build にも含まれる | Critical | `#[cfg(debug_assertions)]` で絞る |
| `#[tauri::command] fn parse_data(json: String)` で size 上限なし | High | size 上限 + serde strict deserialize |
| `#[tauri::command] fn save(path: String, content: Vec<u8>)` で content size 上限なし | High | content size 上限 + path validation |
| command 内で `unwrap()` / panic | High | Result + structured error |
| error message に絶対 path 含む | High | error sanitize |
| `dragDropEnabled: true` が全 window | High | 必要な window のみ true |
| `dangerousRemoteDomainIpcAccess` で `*` または `https://*.example.com` (sub-domain wildcard) | High | 具体的 host のみ |
| capability 削除後の registered command が残る | High | dead command の削除 |
| event payload に secret 含む | High | event payload sanitize |
| CSP に `'unsafe-eval'` (理由なし) | High | nonce ベースに変更 / `'unsafe-eval'` 削除 |
| capability で許可されているが Rust に declared がない (dead permission) | Medium | dead permission 削除 |
| Rust に declared だが capability で許可されていない command (frontend 呼べない) | Low | (機能不全) |

---

## bulk_group 例

- `security:ipc-input-unvalidated` — `#[tauri::command]` の入力検証欠落が散在
- `security:ipc-panic-on-invalid-input` — user input で panic
- `security:ipc-error-leak` — error に絶対 path / secret 漏洩
- `security:capability-overreach` — capability が必要以上に広い
- `security:dead-permission` — capability の dead reference
- `security:webview-devtools-on-production` — production build で devtools 有効
- `security:csp-unsafe-eval` — CSP に `'unsafe-eval'` 含まれる
