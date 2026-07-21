# secrets-and-logs.md — secret / token / production path / document content の漏洩防止

<!--
機能概要: log / error / dialog / Toast / generated artifact に secret / token / production path /
         document content が漏洩する経路の audit と sanitize 規約。
作成意図: 「とりあえず log::error!(...)」で発生する path / content 漏洩を構造化して検出する。
注意点: log の存在自体を否定しない (debug / 障害解析に必須)。output sanitize と log permission の組合せで対処する。
-->

## audit 対象

- `log::*!` / `tracing::*!` / `println!` / `eprintln!` / `dbg!` / `print` / `printf`
- `panic!` / `unreachable!` / `unimplemented!` / `Result::Err`
- `Toast` / dialog / `tauri::api::notification` / status bar
- generated artifact (生成 PDF / JSX / JSON / 帳票) の内容
- crash report / telemetry payload
- error chain (`anyhow::Error` / `Box<dyn Error>` / `thiserror`)

---

## 漏洩しうるデータ class

| class | 例 |
|-------|-----|
| **secret** | API key / OAuth token / refresh token / session id / 秘密鍵 / password hash |
| **production path** | `C:\Users\Alice\Documents\...` / `/Users/alice/...` / 内部 directory 構造 |
| **document content** | 顧客文書本文 / 個人情報 / 顧客名 / 知財文書 |
| **token in URL** | `?api_key=...` / `Authorization: Bearer ...` |

---

## sanitize 規約

### log

```rust
// NG: 絶対 path / user 名漏洩
log::error!("failed to write {}: {}", path.display(), err);

// OK: relative path / sanitized
let relative = path.strip_prefix(&workspace_root).unwrap_or(path);
log::error!(target: "io", "failed to write {}: {}", relative.display(), err.kind());

// OK: kind のみ (production)
log::error!(target: "io", "failed to write file: {}", err.kind());
```

### error message (frontend に返すもの)

```rust
// NG: 絶対 path 含む error
return Err(format!("file not found: {}", path.display()));

// OK: generic な error
return Err("file_not_found".to_string());

// 詳細は log にのみ書く
log::warn!(target: "io", "file not found");
```

### Toast / dialog

```text
- Toast / dialog の文言に絶対 path を含めない
- 「エクスポートに失敗しました」「保存先を確認してください」のような業務向け文言
- 詳細は log のみに書く
```

### generated artifact

```text
- 生成 PDF の metadata / file properties に user 名 / 内部 path を含めない
- 生成 JSX に production path を hard-code しない (= JSX 文字列化の安全 escape)
- 生成 JSON / CSV に secret を含めない
```

---

## log permission

```text
Linux/macOS:
  log file を mode 0600 で生成
  log directory も 0700 (other ユーザーから listing できない)

Windows:
  log file を user-private (default ACL は user 専用が多いが確認)
  log directory も user-private
```

production build の log level:

- `info` または `warn` まで (debug / trace は default off)
- env var で debug 有効化できるとしても、production では default off

---

## error chain の sanitize

```text
- anyhow::Error / Box<dyn Error> の chain をそのまま frontend に返さない
- chain の root cause に absolute path / secret が含まれる可能性
- error level (Result::Err) は frontend には kind のみ、詳細は log のみ
```

```rust
// NG: chain をそのまま frontend に返す
fn do_something() -> Result<(), String> {
    inner().map_err(|e| format!("{:?}", e))?;  // chain 全体が文字列化
    Ok(())
}

// OK: kind のみ frontend に
fn do_something() -> Result<(), String> {
    inner().map_err(|e| {
        log::error!(target: "domain", "operation failed: {:?}", e);
        match e.downcast_ref::<DomainError>() {
            Some(DomainError::NotFound) => "not_found".to_string(),
            Some(DomainError::Forbidden) => "forbidden".to_string(),
            _ => "internal_error".to_string(),
        }
    })?;
    Ok(())
}
```

---

## 典型 finding

| pattern | severity | mitigation |
|---------|----------|-----------|
| `log::error!("...{}", path.display())` で絶対 path | High | sanitize / relative path |
| frontend に返す error に絶対 path / token | High | error sanitize |
| Toast / dialog 文言に絶対 path | Medium | 業務向け文言 |
| 生成 artifact に production path 含む | High | metadata sanitize |
| secret を log に直接出力 | Critical | secret を log しない / mask |
| log file mode 0644 で他ユーザー読める | High | mode 0600 |
| token を URL query に含める (log / referer 漏洩) | High | header / body へ移行 |
| panic message に user input 含む | High | panic 経路を排除 |

---

## bulk_group 例

- `security:secret-in-log`
- `security:production-path-in-log`
- `security:document-content-in-log`
- `security:error-leak-to-frontend`
- `security:token-in-url`
- `security:log-permission-too-permissive`
- `security:artifact-metadata-leak`

---

## forbidden_shortcuts

```yaml
forbidden_shortcuts:
  - do_not_disable_capability_entirely  # log 機能そのものを削除しない
```

log の存在自体は debug / 障害解析に必須。sanitize と permission で対処する。
