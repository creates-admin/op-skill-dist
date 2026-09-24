# tauri-ipc.md — Tauri IPC / WebView 境界 / capability

## 1. `#[tauri::command]` の入力と error

- 引数はすべて untrusted (境界 A)。path は `path-file-io.md`、URL は scheme / host allowlist、構造体・binary・文字列は size / depth 上限。
- user input 経路の `unwrap` / `expect` / `panic!` / index / 未検査の算術は DoS。`Result` + 構造化 error で返す。
- frontend への error は汎用 code / message。絶対 path・token・文書内容は log のみ (`secrets-and-logs.md`)。

## 2. event / WebView

event payload に secret・絶対 path を入れない。`listen` で受ける payload も検証する。

| 設定 | 推奨 |
|---|---|
| `devtools` | production では無効 (`#[cfg(debug_assertions)]`) |
| `dragDropEnabled` | 必要な window のみ true |
| `acceptFirstMouse` (macOS) | false |
| `additionalBrowserArgs` | 固定値のみ (env / user input を渡さない) |
| `dangerousUseHttpScheme` / `dangerousDisableAssetCspModification` | false |
| `dangerousRemoteDomainIpcAccess` | 空、または明示 host のみ (sub-domain wildcard 禁止) |

CSP に `'unsafe-eval'` / `'unsafe-inline'` を入れない。connect-src は production domain のみ。

## 3. capability / permission の最小化

過剰許可のサイン:
- scope に `**` / `*` (例 `$APPDATA/**`、`https://*`)。具体的な path pattern / host に書き直す
- Rust に存在しない command の permission (dead permission)、削除した command の permission が残っている
- window 別 capability の overreach (login window が main 用の fs:write を持つ)
- dangerous 設定の有効化

削減の優先順: dead permission → 実際に未使用の permission → wildcard を具体 pattern へ → dangerous 設定の解除 → window 別の最小化。
**capability 全体の disable はしない** (個別 permission の縮小に留める)。
capability finding の `forbidden_shortcuts` には `do_not_disable_capability_entirely` / `do_not_redesign_auth_model` を入れる。

declared command と capability の突き合わせ:

```bash
grep -rh -A1 '#\[tauri::command\]' src-tauri/src/ | grep -E '^\s*(pub )?(async )?fn ' \
  | sed -E 's/.*fn ([^(<]+).*/\1/' | sort -u
jq -r '.permissions[] | if type=="string" then . else .identifier end' src-tauri/capabilities/*.json | sort -u
```

## 4. 典型 finding

| パターン | severity 目安 | mitigation |
|---|---|---|
| `write_file(path: String, ...)` / `read_config(path: String)` に path 検証なし | Critical | validate + canonicalize + scope + 拡張子 |
| `run_script(args: Vec<String>)` に検証なし | Critical | args 検証 + trusted binary path |
| production build で devtools 有効 / `dangerousUseHttpScheme: true` | Critical | debug 限定 / HTTPS |
| `dangerousRemoteDomainIpcAccess` に wildcard | Critical〜High | 具体 host のみ |
| JSON / binary 引数に size 上限なし | High | size 上限 + strict deserialize |
| command 内の unwrap / panic | High | Result + 構造化 error |
| error / event payload に絶対 path・secret | High | sanitize |
| `dragDropEnabled` が全 window / scope に wildcard / CSP に `'unsafe-eval'` | High | 必要な範囲に限定 |
| window 別 capability の overreach | High | window ごとに分離 |
| dead permission | Medium (報告しない) | 削除 |
