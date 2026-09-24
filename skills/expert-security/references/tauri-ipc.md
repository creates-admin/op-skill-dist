# tauri-ipc.md — Tauri IPC / WebView 境界 / capability

## 1. `#[tauri::command]` の入力検証

引数はすべて untrusted (境界 A)。

1. **型** — String より enum で表せないか。`Vec<u8>` には size 上限。
2. **文字列** — 長さ上限 (例 4096 bytes)、null byte reject、encoding、用途 (path / URL / identifier / content) ごとの専用 validation。
3. **path** — `..` / UNC / device / reserved / ADS を reject → canonicalize → scope (境界 B 以外は強制) → 拡張子 (`path-file-io.md`)。
4. **URL** — `url::Url::parse` → scheme allowlist (https) → host allowlist。
5. **数値** — 範囲チェック、`checked_*` で overflow、index は usize。
6. **構造体** — `#[serde(deny_unknown_fields)]`、deserialize 後の業務 validation、巨大 string・配列・深い nesting の reject。
7. **binary** — size 上限、magic number / format 検証。

## 2. エラーパス

- `Result` を返す。user input 経路で `unwrap` / `expect` / `panic!` / `unreachable!` / `unimplemented!` / `[idx]` / `as` cast /
  未検査の算術 (overflow・0 除算) を使わない。代わりに `get` / `try_into` / `checked_*`。user input で panic するなら DoS。
- error は構造化する (thiserror + Serialize)。frontend には汎用の code / message、詳細は log のみ。絶対 path・token・文書内容を入れない。
- `State<Mutex<T>>` の lock 内で長時間処理や IO をしない。async で複数 lock を取るなら順序を統一し、RwLock の reader 保持中に writer を取らない。

## 3. event / WebView

- `emit_to` / `emit_all` の payload に secret・絶対 path を入れない。特定 window 向けは `emit_to`。`listen` で受ける payload も検証する。

| 設定 | 推奨 |
|---|---|
| `devtools` | production では無効 (`#[cfg(debug_assertions)]`) |
| `dragDropEnabled` | 必要な window のみ true |
| `acceptFirstMouse` (macOS) | false |
| `additionalBrowserArgs` | 固定値のみ (env / user input を渡さない) |
| `dangerousUseHttpScheme` / `dangerousDisableAssetCspModification` | false |
| `dangerousRemoteDomainIpcAccess` | 空、または明示 host のみ (sub-domain wildcard 禁止) |

CSP: `default-src 'self'`、script / style は nonce で許可、`'unsafe-eval'` / `'unsafe-inline'` を入れない (必要なら理由を明記)、
connect-src は production domain のみ、`object-src 'none'` / `frame-src 'none'`。

## 4. capability / permission の最小化

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

## 5. 典型 finding

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
