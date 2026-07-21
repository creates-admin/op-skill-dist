# external-url-updater.md — external URL / updater / signature / TLS

<!--
機能概要: external URL / HTTP request / Tauri updater / signing / TLS の audit 観点。
作成意図: scheme / host / signature / redirect / TLS の前提を統一して、network 越境攻撃を防ぐ。
注意点: 配布 / installer / signing 設計の変更は release-expert (Phase 4 planned) の責務。
       本ファイルは security 観点 (検査と防御) に集中する。
-->

## audit 対象

- `reqwest` / `ureq` / `fetch` の呼び出し
- `tauri-updater` / `app.updater` 設定
- `<a href="...">` の external URL
- redirect 追跡
- TLS / cert 検証 setting
- updater payload signature 検証
- public key の管理

---

## 検査観点

### 1. scheme allowlist

```text
- WebView 内 URL navigation: https のみ
- updater payload URL: https のみ
- API 呼び出し: https のみ
- file:// / data: / javascript: は明示許可した場面以外で reject
```

### 2. host allowlist

```text
- production domain のみ
- sub-domain wildcard (https://*.example.com) は限定的に
- redirect 追跡時に host が変わったら reject
```

### 3. redirect の取扱

```rust
// reqwest の例
let client = reqwest::Client::builder()
    .redirect(reqwest::redirect::Policy::custom(|attempt| {
        // host が allowlist 外ならstop
        let allowed = ["api.example.com", "cdn.example.com"];
        let host = attempt.url().host_str().unwrap_or("");
        if allowed.contains(&host) {
            attempt.follow()
        } else {
            attempt.stop()
        }
    }))
    .build()?;
```

### 4. TLS / cert 検証

```text
NG: accept_invalid_certs(true)
NG: danger_accept_invalid_hostnames(true)
OK: rustls + system roots (default)
OK: 必要なら custom CA bundle を明示
```

### 5. updater signature 検証

```text
- tauri-updater の public key は hard-coded で持つ
- payload の signature 検証を skip しない (UpdaterError は accept しない)
- public key rotation 計画 (将来の Phase 4 で release-expert 担当)
- updater manifest URL も signature / TLS で守られる host
```

### 6. updater payload validation

```text
- signature 検証 + version 検証 (downgrade 防止)
- payload size 上限
- payload 解凍 (zip-slip 防止) は parser-boundary.md を参照
```

---

## 典型 finding

| pattern | severity | mitigation |
|---------|----------|-----------|
| `reqwest::get("http://...")` で http (production) | High | https 強制 |
| `accept_invalid_certs(true)` | Critical | 削除 / dev 限定 |
| `danger_accept_invalid_hostnames(true)` | Critical | 削除 |
| redirect 追跡で host change を許可 | High | host allowlist |
| updater signature 検証 skip / warning で通す | Critical | signature 必須 |
| updater public key を env / config から読む (改竄リスク) | High | hard-coded |
| updater manifest URL が http | Critical | https |
| dangerousRemoteDomainIpcAccess に sub-domain wildcard | Critical | 具体的 host のみ |

---

## bulk_group 例

- `security:tls-skip`
- `security:redirect-host-change`
- `security:updater-signature-skipped`
- `security:updater-manifest-http`
- `security:unsafe-scheme-accepted`
- `security:host-allowlist-too-broad`
