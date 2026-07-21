# tauri-ipc.md — Tauri IPC / WebView 境界

<!--
機能概要: Tauri command / IPC / WebView ↔ Rust 境界の audit 観点。
作成意図: frontend (untrusted) と backend (trusted) の境界で必要な validation / capability 整合 /
         payload 検証を集約する。
注意点: `#[tauri::command]` 個別の入力検証契約は tauri-command-contract.md。
       capability / permission は capability-permission.md。
       本ファイルは「境界全体」の観点。
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

## 入力検証契約

すべての `#[tauri::command]` の引数は **untrusted** として validate する:

- 文字列: 長さ上限 / encoding / null byte reject
- path: trust_boundary 別 (windows-path-boundaries.md / file-picker-and-user-selected-path.md)
- URL: scheme allowlist / host allowlist
- 数値: 範囲チェック (bounds / overflow)
- 構造体: serde で deserialize 後に追加 validation
- ファイル content (Vec<u8>): size 上限 / 内容 validation

詳細は `tauri-command-contract.md`。

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

## 典型 finding

| pattern | severity | mitigation |
|---------|----------|-----------|
| `#[tauri::command] fn write_file(path: String, content: String)` で入力検証なし | Critical | path validation + scope + canonicalize |
| `dragDropEnabled: true` が全 window | High | 必要な window のみ true |
| `dangerousRemoteDomainIpcAccess` で `*` または `https://*.example.com` (sub-domain wildcard) | High | 具体的 host のみ |
| capability 削除後の registered command が残る | High | dead command の削除 |
| event payload に secret 含む | High | event payload sanitize |
| CSP に `'unsafe-eval'` (理由なし) | High | nonce ベースに変更 / `'unsafe-eval'` 削除 |
| WebView の `devtools: true` が production build にも含まれる | Critical | `#[cfg(debug_assertions)]` で絞る |

---

## bulk_group 例

- `security:ipc-input-unvalidated` — `#[tauri::command]` の入力検証欠落が散在
- `security:capability-overreach` — capability が必要以上に広い
- `security:webview-devtools-on-production` — production build で devtools 有効
- `security:csp-unsafe-eval` — CSP に `'unsafe-eval'` 含まれる
