# parser-boundary.md — PDF / image / zip / IDML / CSV / JSON / TOML parser の境界

<!--
機能概要: 外部ファイルを parse / deserialize / extract する経路の audit 観点。
作成意図: zip-slip / decompression bomb / deserialize DOS / parser DOS / archive escape を構造化して防ぐ。
注意点: 入力源 (boundary E: imported file) の取扱は trust-boundaries.md。
       parser 自体の脆弱性 (CVE) は dependency 監査 (env-expert) と分担。
-->

## audit 対象

- serde_json / serde_yaml / toml / quick_xml の deserialize
- pdf-rs / lopdf / poppler の PDF parse
- image / zune-image / kamadak-exif の image parse
- zip / tar / flate2 / brotli / zstd の archive extraction
- IDML (XML over zip) の parse / extraction
- CSV (csv crate) の parse
- TOML (toml crate) の parse

---

## 検査観点

### 1. zip-slip (archive entry path traversal)

```text
- entry name に `..` / 絶対 path / `\` (Windows) を含むものを reject
- 解凍先が canonicalize 後に scope 内か確認
- entry name は component 単位で iterate
```

```rust
fn safe_extract_entry(dest_dir: &Path, entry_name: &str) -> Result<PathBuf, &'static str> {
    let entry_path = Path::new(entry_name);
    
    // parent traversal reject
    if entry_path.components().any(|c| matches!(c, Component::ParentDir)) {
        return Err("zip-slip");
    }
    
    // 絶対 path / device path reject
    if entry_path.is_absolute() {
        return Err("absolute path in archive");
    }
    
    // Windows separator も含めて確認
    if entry_name.contains('\\') {
        return Err("backslash in archive entry");
    }
    
    let dest = dest_dir.join(entry_path);
    let dest_canonical = dest_dir.canonicalize().map_err(|_| "canonicalize failed")?;
    
    // dest が dest_dir の外を指していないか
    if let Ok(d) = dest.canonicalize() {
        if !d.starts_with(&dest_canonical) {
            return Err("path escape");
        }
    }
    
    Ok(dest)
}
```

### 2. decompression bomb (zip bomb / tar bomb)

```text
- archive 全体のサイズ上限
- 個別 entry のサイズ上限
- 解凍後合計サイズ上限
- 圧縮比 (compressed / decompressed) の上限
- entry 数の上限
- ネストされた archive (zip in zip) の depth 上限
```

```rust
const MAX_TOTAL_DECOMPRESSED: u64 = 100 * 1024 * 1024;  // 100 MB
const MAX_ENTRY_DECOMPRESSED: u64 = 10 * 1024 * 1024;   // 10 MB
const MAX_ENTRIES: usize = 10_000;
const MAX_RATIO: f64 = 100.0;  // compressed:decompressed = 1:100 まで
```

### 3. deserialize DOS (serde_json / quick_xml)

```text
- size 上限を deserialize 前に確認
- depth limit (default は無制限のものが多い)
- count limit (巨大配列 / 巨大 map)
- 巨大 string (base64 encode された巨大 binary 等)
- recursion limit
```

```rust
// serde_json の例
let limit = 5 * 1024 * 1024;  // 5 MB
if input.len() > limit {
    return Err("input too large");
}
let value: MyStruct = serde_json::from_str(input)?;
```

### 4. parser に user input を直接渡す前のチェック

```text
- file size を確認
- magic number / file signature を確認
- encoding (UTF-8 / UTF-16 / Shift_JIS 等) を明示
- parser に渡す前に外周で size limit
```

### 5. archive 内 symlink / hardlink

```text
- archive entry が symlink / hardlink の場合は reject (作成しない)
- tar / zip-rs / 7z 等で symlink を含む archive を「作成」しない
- 既存 archive を「展開」する際も symlink entry を skip
```

---

## 典型 finding

| pattern | severity | mitigation |
|---------|----------|-----------|
| zip extraction で `..` reject なし (zip-slip) | Critical | entry path validation + scope check |
| archive size 上限なし (decompression bomb) | High | size / count / ratio limit |
| serde_json::from_str に巨大 input (DOS) | High | size limit |
| XML parser で entity expansion (XXE / billion laughs) | High | entity expansion disable |
| archive 内 symlink を作成 (任意 path 上書き) | High | symlink reject |
| nested archive (zip in zip) の depth 制御なし | Medium | depth limit |
| parser 失敗時に panic (unwrap / expect) | High | Result + structured error |

---

## bulk_group 例

- `security:zip-slip`
- `security:decompression-bomb-no-limit`
- `security:deserialize-dos`
- `security:xxe-or-entity-expansion`
- `security:archive-symlink-allowed`
- `security:parser-panic-on-input`
