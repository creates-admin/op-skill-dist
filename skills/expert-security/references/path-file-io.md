# path-file-io.md — std::fs / tokio::fs / path 検証の基本

<!--
機能概要: Rust の path / file IO API における観点と検査基準。
作成意図: canonicalize / scope / TOCTOU / temp file / atomic write の作法を統一する。
注意点: Windows 固有の path 境界は windows-path-boundaries.md。OS file picker 経由 path の扱いは
       file-picker-and-user-selected-path.md。
-->

## 検査観点

```text
1. canonicalize の適用
2. scope check (boundary 別)
3. atomic open / TOCTOU 対策
4. temp file の権限と cleanup
5. atomic write (rename ベース)
6. permission (mode / ACL)
7. error 出力の sanitize
```

---

## 1. canonicalize の適用

### 適用すべき API

- 入力 path を sink に渡す前に必ず `std::fs::canonicalize(&path)` (existing path)
- 新規作成 path は parent を canonicalize し、その下に file_name を join
- canonicalize の戻り値で以降の処理を行う (元の path 文字列を使わない)

### 失敗時の扱い

- canonicalize 失敗は path が存在しない / 権限不足 / reparse loop 等
- 失敗を error として返す (絶対 path を error に漏らさない)

---

## 2. scope check (boundary 別)

trust_boundary 別の scope 適用 (詳細は trust-boundaries.md):

| boundary | scope 強制 |
|---------|-----------|
| A (frontend free text) | 強制 (workspace / user data dir 内のみ) |
| B (user-selected) | **強制しない** (user-granted capability) |
| C (app internal) | 確認のみ |
| D (config / old project) | 強制 (再検証) |
| E (imported file 内 path) | 強制 (解凍先 / reference 解決) |
| F (env / cli) | 確認 (起動 path は信頼 base) |
| G (network) | 強制 (download 先) |

scope check の実装例:

```rust
fn within_scope(canonical: &Path, root_canonical: &Path) -> bool {
    canonical.starts_with(root_canonical)
}
```

---

## 3. atomic open / TOCTOU 対策

```text
NG (TOCTOU リスク):
  if path.exists() {
      fs::remove_file(path)?;
  }
  fs::write(path, content)?;

OK (atomic):
  // create_new で既存 file の上書きを atomic に reject
  let mut f = OpenOptions::new()
      .write(true)
      .create_new(true)
      .open(path)?;
  f.write_all(&content)?;

OK (intentional overwrite):
  let mut f = OpenOptions::new()
      .write(true)
      .truncate(true)
      .create(true)
      .open(path)?;
  f.write_all(&content)?;
```

### canonicalize → 即 open

- canonicalize の戻り値で即 open し、以降は file descriptor で操作
- canonicalize と open の間に path が差し替わるリスクを最小化

---

## 4. temp file の権限と cleanup

```text
- tempfile crate を使う (tempfile::NamedTempFile / tempfile::tempfile)
  - predictable filename を避ける
  - drop で自動削除
- 自前で /tmp / $TEMP に書く場合は権限を限定
  - Linux/macOS: mode 0600
  - Windows: ユーザー専用 ACL
- process crash / panic 時の cleanup を考慮 (tempfile は drop で消えるが、kill 時は残る)
- 非機密の cache は predictable name でも OK だが、機密データには使わない
```

---

## 5. atomic write (rename ベース)

```text
1. tempfile に書く
2. fsync で flush
3. rename で目的 path に置き換え
4. 失敗時は tempfile を消す

これで「書きかけ状態の file が永続化される」事故を防ぐ。
```

```rust
fn atomic_write(path: &Path, content: &[u8]) -> std::io::Result<()> {
    let parent = path.parent().ok_or_else(|| {
        std::io::Error::new(std::io::ErrorKind::InvalidInput, "path has no parent")
    })?;
    let mut tmp = tempfile::NamedTempFile::new_in(parent)?;
    tmp.write_all(content)?;
    tmp.as_file().sync_all()?;
    tmp.persist(path).map_err(|e| e.error)?;
    Ok(())
}
```

---

## 6. permission (mode / ACL)

```text
Linux/macOS:
  std::os::unix::fs::PermissionsExt
  - file mode 0600 / 0644 / 0700 を意図的に設定
  - umask に依存しない

Windows:
  std::os::windows::fs::OpenOptionsExt
  - ACL を default のまま使うことが多いが、必要なら icacls で制限
  - tempfile は user-private なので追加設定不要
```

---

## 7. error 出力の sanitize

```text
NG:
  log::error!("failed to write {}: {}", path.display(), err);
  → 絶対 path / user 名漏洩

OK:
  log::error!(target: "io", "failed to write file: {}", err.kind());
  // 詳細 path は trace level の log にのみ書き、production log level は info / warn まで
```

---

## 典型 finding

| pattern | severity | mitigation |
|---------|----------|-----------|
| frontend → write_user_data の path に canonicalize なし | Critical | canonicalize + scope + reject reserved/ADS/device |
| `if exists { remove }` パターンの TOCTOU | High | atomic open (create_new / truncate) |
| temp file mode 0644 で他ユーザー読める | High | mode 0600 / tempfile 利用 |
| log に Path::display() で絶対 path | High | sanitize / log level 制御 |
| atomic write なしで重要 file 直接書き換え | High | rename ベース atomic write |
| canonicalize 失敗の error が絶対 path 含む | Medium | error sanitize |

---

## bulk_group 例

- `security:path-traversal-in-export`
- `security:path-canonicalize-missing`
- `security:toctou-check-then-act`
- `security:temp-file-mode-too-permissive`
- `security:atomic-write-missing`
- `security:error-leak`
