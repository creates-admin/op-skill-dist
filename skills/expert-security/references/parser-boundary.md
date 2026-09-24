# parser-boundary.md — parser / archive / deserialize

外部ファイル (境界 E) を parse・展開する経路。parser crate 自体の既知脆弱性は依存監査の領域。

## 1. zip-slip

entry name の `..` / 絶対 path / `\` を reject し、展開先が canonicalize 後に展開 root 内かを確認する。

```rust
fn safe_entry_path(dest_dir: &Path, name: &str) -> Result<PathBuf, &'static str> {
    let p = Path::new(name);
    if name.contains('\\') || p.is_absolute()
        || p.components().any(|c| !matches!(c, Component::Normal(_) | Component::CurDir)) {
        return Err("unsafe entry name");
    }
    let root = dest_dir.canonicalize().map_err(|_| "dest")?;
    let dest = root.join(p);
    // 親が既に存在するなら canonicalize して root 内か確認する (symlink 済み directory 対策)
    if let Some(parent) = dest.parent().and_then(|d| d.canonicalize().ok()) {
        if !parent.starts_with(&root) { return Err("path escape"); }
    }
    Ok(dest)
}
```

archive 内の symlink / hardlink entry は作成しない (skip または reject)。

## 2. decompression bomb

上限を持つ: archive 全体サイズ / entry ごとの展開後サイズ / 展開後合計 / entry 数 / 圧縮比 / ネスト (zip in zip) の深さ。
例: 合計 100 MB、entry 10 MB、10,000 entries、圧縮比 1:100。実際の読み出しバイト数で数える (header の申告値を信じない)。

## 3. deserialize / parser DoS

- parse 前に入力サイズ上限を確認する (例 `if input.len() > 5 * 1024 * 1024 { return Err(..) }`)。
- depth / count / 巨大 string (base64 の巨大 binary 等) / recursion の上限。
- XML は外部 entity と entity 展開を無効化する (XXE / billion laughs)。
- magic number と encoding (UTF-8 / UTF-16 / Shift_JIS) を明示してから parser に渡す。
- parse 失敗で panic しない (`Result` + 構造化 error)。

## 4. 典型 finding

| パターン | severity 目安 | mitigation |
|---|---|---|
| 展開で `..` / 絶対 path を reject しない | Critical (import 操作が要るなら High) | entry 検証 + scope |
| archive の size / count / ratio 上限なし | High | 上限 |
| `serde_json::from_str` に上限なしの入力 | High | size 上限 |
| XML の entity 展開が有効 | High | 無効化 |
| archive 内 symlink を作成 | High | reject |
| parse 失敗で panic | High | Result |
| nested archive の深さ制御なし | Medium (報告しない) | depth 上限 |
