# capability-permission.md — Tauri capability / permission の最小化

<!--
機能概要: Tauri capability / permission の audit と最小化方針。
作成意図: 過剰許可 (overreach) と dead permission を構造化して検出し、削減する。
注意点: capability 全体を disable する変更は usable_security 違反 (forbidden_shortcuts)。
       実 unused のみを縮小する。
-->

## audit 対象

- `tauri.conf.json` の `app.security.capabilities`
- `capabilities/**/*.json` の `permissions` / `windows` / `webviews`
- `app.security.csp`
- `app.security.dangerousUseHttpScheme`
- `app.security.dangerousDisableAssetCspModification`
- `app.security.dangerousRemoteDomainIpcAccess`
- 個別 plugin の scope (tauri-plugin-fs / tauri-plugin-shell / tauri-plugin-http 等)

---

## 過剰許可 (overreach) の検出

```text
- permissions に登録されている command が Rust に declared がない (dead permission)
- scope に `**` / `*` の wildcard が含まれる (具体的 path / scheme で書き直し)
- dangerousRemoteDomainIpcAccess に `*` または `https://*.example.com` (sub-domain wildcard)
- dangerousUseHttpScheme: true (HTTPS 強制すべき)
- dangerousDisableAssetCspModification: true (CSP 保護を維持すべき)
- production build で devtools: true
```

### 検出方法

```bash
# Rust 側 declared command 一覧
grep -rh '#\[tauri::command\]' src-tauri/src/ -A 1 \
  | grep -E '^(async )?fn ' \
  | sed -E 's/^(async )?fn ([^(]+).*/\2/' | sort -u

# capability で許可された command (plugin permission identifier 形式)
jq -r '.permissions[]?' src-tauri/capabilities/*.json | sort -u

# 上記の差分 = overreach 候補
```

---

## scope の最小化

```json
{
  "permissions": [
    "fs:default",
    {
      "identifier": "fs:scope",
      "allow": [
        "$APPDATA/projects/*.json",
        "$APPDATA/cache/*"
      ],
      "deny": [
        "$APPDATA/projects/secret.json"
      ]
    }
  ]
}
```

```text
NG: "$APPDATA/**" のような broad scope
OK: 具体的 path pattern (extension / directory 限定)

NG: "https://*"
OK: "https://api.example.com"

NG: dangerousRemoteDomainIpcAccess: ["https://*.example.com"]
OK: dangerousRemoteDomainIpcAccess: [] (= 無効)
   または明示的 host のみ
```

---

## 削減の優先順位

```text
1. dead permission (declared command が無いもの)
2. 実 unused permission (frontend / backend のどこからも呼ばれていない)
3. wildcard scope を具体的 pattern に書き換え
4. dangerous 設定の解除 (dangerous*: true → false)
5. window 別 capability の最小化 (login window が main window 用 fs scope を持たない)
```

**capability 全体の disable は usable_security 違反**。**個別 permission を縮小する**だけに留める。

---

## CSP の検査

```text
default-src 'self';
script-src 'self' 'nonce-{NONCE}';
style-src 'self' 'nonce-{NONCE}';
connect-src 'self' https://api.example.com;
img-src 'self' data:;
font-src 'self';
object-src 'none';
frame-src 'none';
```

- `'unsafe-eval'` を含めない (どうしても必要なら理由を明記)
- `'unsafe-inline'` を含めない (nonce ベースに変更)
- connect-src に production domain のみ
- inline script / style は nonce で許可

---

## 典型 finding

| pattern | severity | mitigation |
|---------|----------|-----------|
| permission に登録されているが Rust に declared がない | Medium | dead permission 削除 |
| scope に `**` / `*` | High | 具体的 pattern |
| dangerousRemoteDomainIpcAccess に sub-domain wildcard | Critical | 具体的 host のみ |
| dangerousUseHttpScheme: true (production) | Critical | HTTPS 強制 |
| CSP に `'unsafe-eval'` (理由なし) | High | nonce ベースに変更 |
| window 別 capability の overreach (login window が fs:write 持つ) | High | window 別 capability 分離 |
| production build で devtools: true | Critical | `#[cfg(debug_assertions)]` で絞る |

---

## bulk_group 例

- `security:capability-overreach`
- `security:dead-permission`
- `security:wildcard-scope`
- `security:dangerous-flag-on-production`
- `security:csp-unsafe-eval`
- `security:devtools-on-production`

---

## forbidden_shortcuts (capability finding 必須)

capability finding では必ず以下を `forbidden_shortcuts` に含める:

```yaml
forbidden_shortcuts:
  - do_not_disable_capability_entirely  # 個別 permission の縮小に留める
  - do_not_redesign_auth_model          # 認証 model の再設計に踏み込まない
```
