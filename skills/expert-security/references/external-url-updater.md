# external-url-updater.md — external URL / HTTP / updater

updater・installer・signing の設計変更は planned expert (release) の領域なので apply しない。ここは検査と防御のみ。

## 1. 検査観点

- **scheme** — WebView の navigation・API・updater payload は https のみ。`file:` / `data:` / `javascript:` は明示許可した場面以外 reject。
- **host** — production domain の allowlist。sub-domain wildcard は最小限。
- **redirect** — 追跡先の scheme / host が allowlist 外なら止める (reqwest は `redirect::Policy::custom`)。
- **TLS** — 検証無効化 flag を使わない。
- **updater** — public key は binary に hard-code (env / config から読まない)。signature 検証を省略・warning 扱いにしない。
  version 検証で downgrade を防ぐ。payload size 上限。manifest URL は https の trusted host。展開は `parser-boundary.md`。
- **download の保存** — 保存先 path は境界 E と同じ検査 (`path-file-io.md`)。

## 2. 典型 finding

| パターン | severity 目安 | mitigation |
|---|---|---|
| `accept_invalid_certs` / `danger_accept_invalid_hostnames` | Critical | 削除 (dev 限定にもしない方が安全) |
| updater の signature 検証 skip / manifest URL が http | Critical | 検証必須 / https |
| production で http の API 呼び出し | High | https |
| redirect で host 変更を許す | High | allowlist |
| updater public key を env / config から読む | High | hard-code |
| WebView で `javascript:` / `data:` を受け入れる | High | scheme reject |
