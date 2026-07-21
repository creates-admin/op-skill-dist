# windows-path-boundaries.md — Windows / Tauri Desktop Path Boundary

<!--
機能概要: Windows 固有の path 境界 (parent traversal / symlink / junction / reparse point / UNC /
         device path / ADS / reserved name / mixed separator / TOCTOU) の検査観点。
作成意図: Tauri / Rust 開発で頻出する Windows path の落とし穴を集約し、scan / patrol / apply / post-check で
         網羅的に検査できるようにする。Windows 環境固有の reject パターンを統一する。
注意点: 本ファイルは Windows 固有 path の attack surface 観点。
       OS file picker 経由 path の扱いは file-picker-and-user-selected-path.md。
       trust boundary 判定は trust-boundaries.md。
-->

## 検査観点 (15 種)

```text
1. parent traversal: ../
2. symlink
3. NTFS junction
4. reparse point
5. UNC path / network share
6. Windows device path: \\?\C:\...
7. reserved names: CON, PRN, AUX, NUL, COM1, LPT1
8. alternate data stream (ADS): file.txt:stream
9. case-insensitive path collision
10. mixed separator: / と \
11. trailing dot / trailing space
12. long path handling
13. temp directory race
14. overwrite / delete / rename の TOCTOU
15. drive letter / current directory 依存
```

---

## 1. parent traversal (`../`)

### 攻撃シナリオ

- archive entry name に `../foo` を含む (zip-slip)
- 設定ファイル / project file 内の reference path に `../`
- frontend invoke 経由の path に `../`

### 検査

- `Path::join` の前に `..` を含む component を reject
- canonicalize 後の絶対 path が想定 root の外を指していないか
- archive extraction では entry name を component 単位で iterate し、`Component::ParentDir` を reject

Rust 実装例は本ファイル末尾「統合チェック関数の例」の `validate_input_path` 内
`Component::ParentDir` チェック部分を参照。

---

## 2. symlink

### 攻撃シナリオ

- ユーザー文書 directory に symlink を仕込み、そこを target にして任意 path に書き込む
- imported file の path が symlink で system32 を指す

### 検査

- `std::fs::canonicalize(path)` で resolve する
- canonicalize 後の path で scope check
- `std::fs::symlink_metadata` で symlink を判定可能だが、TOCTOU を考えると canonicalize → 即 open のほうが安全

### 注意

- canonicalize は file が存在しないと失敗する (新規作成 path の検査ではダメ)
- 新規作成の場合は parent directory を canonicalize し、その下に予定 file 名を join する

---

## 3. NTFS junction

### 攻撃シナリオ

- junction (NTFS のディレクトリ symlink) を仕込み、別 volume を指す
- mklink /J で作成可能 (admin 不要)

### 検査

- `std::fs::canonicalize` で resolve される (= symlink と同等の扱い)
- canonicalize 後の path で scope check
- canonicalize 失敗時は reject

---

## 4. reparse point

### 攻撃シナリオ

- reparse point (NTFS の特殊 link 機構) で別 volume / 別 path を指す
- symlink / junction / mount point / OneDrive placeholder すべて reparse point の一種

### 検査

- `std::fs::symlink_metadata().file_type().is_symlink()` だけでは不十分 (reparse point 全般を捉えない)
- Windows API `GetFileAttributesW` で `FILE_ATTRIBUTE_REPARSE_POINT` を確認するか、canonicalize で resolve
- canonicalize 後の path で scope check

### Rust 例

```rust
use std::os::windows::fs::MetadataExt;

fn is_reparse_point(p: &Path) -> std::io::Result<bool> {
    let m = std::fs::symlink_metadata(p)?;
    const FILE_ATTRIBUTE_REPARSE_POINT: u32 = 0x400;
    Ok(m.file_attributes() & FILE_ATTRIBUTE_REPARSE_POINT != 0)
}
```

---

## 5. UNC path / network share (`\\server\share\...`)

### 攻撃シナリオ

- ユーザーが選択した path が `\\malicious-server\share\foo.exe`
- network 越境のファイル操作 (TOCTOU / 認証 / payload 経路)
- `\\?\UNC\server\share\...` の device prefix UNC

### 検査

- アプリの想定が local FS のみなら UNC path を reject
- `\\` で始まる path は reject (drive letter で始まらない)
- `\\?\UNC\...` も reject

### 例外

- ユーザーが network share 上の file を編集する正当な用途なら許可
- ただし threat_model に「network share TOCTOU / payload tampering」を明記し、必要な validation を追加

---

## 6. Windows device path (`\\?\C:\...`)

### 攻撃シナリオ

- device path で MAX_PATH を回避し、想定外の長 path を渡す
- canonicalize の検査を回避 (device path は normalization rule が異なる)
- `\\?\Volume{GUID}\...` の volume guid path

### 検査

- アプリの想定が user file のみなら device path を reject
- `\\?\` / `\\.\` で始まる path は reject

---

## 7. reserved name (`CON`, `PRN`, `AUX`, `NUL`, `COMx`, `LPTx`)

### 攻撃シナリオ

- ユーザーが file picker で `C:\Users\Alice\Documents\CON.txt` を選択
- archive entry name に `CON` を含む
- export filename を `LPT1` にされる

### 検査

Rust 実装例は本ファイル末尾「統合チェック関数の例」の `validate_input_path` 内
reserved name チェック部分を参照。

### 注意

- 拡張子の有無に関わらず予約 (CON.txt も予約名)
- file_stem だけでなく全 component を確認

---

## 8. alternate data stream (ADS): `file.txt:stream`

### 攻撃シナリオ

- `file.txt:hidden_stream` という path で hidden data を書く
- `directory:stream` で directory の ADS に書く
- archive entry / user input にコロン区切り stream 名を含む

### 検査

Rust 実装例は本ファイル末尾「統合チェック関数の例」の `validate_input_path` 内
ADS チェック (`drive_stripped.contains(':')`) 部分を参照。

ADS を含む path は reject。

---

## 9. case-insensitive path collision

### 攻撃シナリオ

- Windows は case-insensitive (`Foo.txt` と `foo.txt` は同一視)
- アプリが case-sensitive な比較で「workspace 内 path」を判定すると、`C:\WORKSPACE\foo` が `C:\workspace\foo` と一致しない
- denylist / allowlist を case-sensitive で書くと bypass 可能

### 検査

- workspace / scope の比較は `std::ascii::eq_ignore_ascii_case` または小文字化して比較
- canonicalize 後の path も case 正規化される (Windows では大文字小文字が修正される) ので、比較もそれに合わせる

---

## 10. mixed separator (`/` と `\`)

### 攻撃シナリオ

- `C:\Users/Alice\Documents/foo.txt` のような mixed path
- denylist が `\` 区切り前提で書かれていると、`/` 区切り path で bypass

### 検査

- canonicalize 後は `\` (backslash) に統一される (Windows の場合)
- 比較前に separator を統一する

---

## 11. trailing dot / trailing space

### 攻撃シナリオ

- `foo.txt.` (trailing dot) は Windows では `foo.txt` として扱われる
- `foo.txt ` (trailing space) も同様
- ファイル名比較で `foo.txt` と `foo.txt ` を別扱いすると bypass 可能

### 検査

- canonicalize 後の file name で比較
- file_name の末尾 dot / space を reject (= reserved な構造)

---

## 12. long path handling (MAX_PATH = 260)

### 攻撃シナリオ

- 260 文字を超える path を渡し、アプリが truncate して別 path に書き込む
- device path (`\\?\`) で MAX_PATH を回避され、想定外の場所に書く

### 検査

- アプリの想定が long path 対応なら manifest で `longPathAware` を有効化
- そうでなければ MAX_PATH 超過の path を reject (or canonicalize 失敗で reject)
- device path prefix は section 6 で reject 済み

---

## 13. temp directory race

### 攻撃シナリオ

- 攻撃者が temp directory で予測可能な name の file を先に作る (predictable filename)
- アプリが create_new flag なしで write し、攻撃者の symlink 経由で別 path に書き込み

### 検査

- `tempfile::tempfile()` / `tempfile::NamedTempFile` を使う (predictable filename を避ける)
- `OpenOptions::new().write(true).create_new(true).open(path)` で既存 file の上書きを reject
- temp directory の権限を確認 (Windows: ユーザー専用、Linux: 0700 mode)

---

## 14. overwrite / delete / rename の TOCTOU

### 攻撃シナリオ

- アプリが `if path.exists() { fs::remove_file(path); }` のような check-then-act
- check と act の間に攻撃者が path を symlink に差し替える
- canonicalize の結果と、その後の操作対象が同一でない (canonicalize 後に path が変わる)

### 検査

- check-then-act パターンを避ける
- `OpenOptions::new().write(true).create_new(true).open(...)` のような atomic operation を使う
- canonicalize 直後に open し、以降は file descriptor / handle で操作する
- atomic rename (`rename` 自体は atomic だが、source が race で書き換わるリスクは残る)

---

## 15. drive letter / current directory 依存

### 攻撃シナリオ

- `foo.txt` のような relative path は current directory 依存
- アプリの起動 path が攻撃者制御下なら、想定外の場所に書き込み
- `C:foo.txt` のような drive-relative path (drive letter のみ指定、root 省略) は current directory 依存

### 検査

- 入力が relative path なら必ず工程の最初で絶対 path に解決する
- `std::env::current_dir()` に依存しない (起動時 / library load 時に決まる base path を使う)
- `C:foo.txt` 形式の drive-relative path も reject (drive letter 指定なら必ず `\` 必須)

---

## 統合チェック関数の例

```rust
use std::path::{Component, Path, PathBuf};

#[derive(Debug)]
enum PathRejectReason {
    ParentTraversal,
    UncOrDevicePath,
    ReservedName,
    AlternateDataStream,
    TrailingDotOrSpace,
    EmptyPath,
}

fn validate_input_path(p: &Path) -> Result<(), PathRejectReason> {
    // empty
    if p.as_os_str().is_empty() {
        return Err(PathRejectReason::EmptyPath);
    }
    
    let s = p.to_string_lossy();
    
    // device path / UNC
    if s.starts_with(r"\\?\") || s.starts_with(r"\\.\") || s.starts_with(r"\\") {
        return Err(PathRejectReason::UncOrDevicePath);
    }
    
    // parent traversal
    if p.components().any(|c| matches!(c, Component::ParentDir)) {
        return Err(PathRejectReason::ParentTraversal);
    }
    
    // ADS
    let drive_stripped = if s.len() >= 2 && s.chars().nth(1) == Some(':') {
        &s[2..]
    } else {
        &s
    };
    if drive_stripped.contains(':') {
        return Err(PathRejectReason::AlternateDataStream);
    }
    
    // reserved name (全 component を確認)
    for c in p.components() {
        if let Component::Normal(name) = c {
            if let Some(name) = name.to_str() {
                let stem = name.split('.').next().unwrap_or("");
                let upper = stem.to_uppercase();
                let reserved = ["CON", "PRN", "AUX", "NUL"];
                if reserved.contains(&upper.as_str()) {
                    return Err(PathRejectReason::ReservedName);
                }
                if (upper.starts_with("COM") || upper.starts_with("LPT")) && upper.len() == 4 {
                    if upper.chars().last().unwrap().is_ascii_digit() {
                        return Err(PathRejectReason::ReservedName);
                    }
                }
                // trailing dot / space
                if name.ends_with('.') || name.ends_with(' ') {
                    return Err(PathRejectReason::TrailingDotOrSpace);
                }
            }
        }
    }
    
    Ok(())
}

fn canonicalize_and_check_scope(p: &Path, root: &Path) -> std::io::Result<PathBuf> {
    let canonical = std::fs::canonicalize(p)?;
    let root_canonical = std::fs::canonicalize(root)?;
    if !canonical.starts_with(&root_canonical) {
        return Err(std::io::Error::new(
            std::io::ErrorKind::PermissionDenied,
            "scope violation",
        ));
    }
    Ok(canonical)
}
```

---

## 取扱規約まとめ

| 入力源 | parent traversal | UNC / device | reserved | ADS | 大小区別 | scope check |
|-------|-----------------|------------|---------|-----|---------|------------|
| boundary A (frontend free text) | reject | reject | reject | reject | case-insensitive | scope 強制 |
| boundary B (user-selected) | (canonicalize で resolve) | reject (アプリ想定外なら) | reject | reject | case-insensitive | scope 強制しない |
| boundary C (app internal) | (使わない) | (使わない) | (使わない) | (使わない) | case-insensitive | scope 確認 |
| boundary D (config/old project) | reject | reject | reject | reject | case-insensitive | scope 強制 (再検証) |
| boundary E (imported file 内 path) | reject | reject | reject | reject | case-insensitive | scope 強制 |
| boundary F (env / cli) | reject | reject | reject | reject | case-insensitive | scope 確認 |

---

## post-check で確認する観点

post-check で「path 系 mitigation を実装した PR」では以下を確認:

```text
- canonicalize 後に scope check が実装されているか (boundary B 以外)
- reserved name reject が実装されているか
- ADS reject が実装されているか
- device / UNC reject が実装されているか (アプリ想定次第)
- parent traversal reject が実装されているか (boundary B 以外)
- canonicalize 失敗時の error 出力に絶対 path が漏れていないか
- TOCTOU 対策 (check-then-act → atomic open) が考慮されているか
```
