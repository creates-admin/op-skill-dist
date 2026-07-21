# shell-process.md — std::process::Command / tauri-plugin-shell / 外部アプリ起動

<!--
機能概要: shell / process 起動の境界。args 配列化、起動先 binary の trusted path 確認、
         working_dir / env の正規化、output / error の sanitize。
作成意図: shell injection / 任意 binary 起動 / output 経由の path leak を構造化して防ぐ。
注意点: COM / ExtendScript 経由の外部アプリ起動は indesign-com-extendscript.md。
       capability 整合は capability-permission.md。
-->

## 検査観点

```text
1. shell 文字列連結ではなく args 配列で渡す
2. 起動先 binary が trusted path にある
3. working_dir / env がユーザー操作で改変できない
4. output / error の sanitize
5. capability / scope の整合
```

---

## 1. shell 文字列連結ではなく args 配列で渡す

```text
NG:
  Command::new("sh").arg("-c").arg(format!("convert {} -resize 50% {}", input, output))
  → input / output に shell metachar (`;`, `|`, `&`, `$`, ``, `()`, `\\`) が混入すると command injection

OK:
  Command::new("convert")
      .arg(input)            // args 配列で個別に渡す
      .arg("-resize")
      .arg("50%")
      .arg(output)

OK (sh 経由が必要なら):
  Command::new("sh")
      .arg("-c")
      .arg(r#"convert "$1" -resize 50% "$2""#)  // shell script 内で $1 / $2 を quote
      .arg("--")
      .arg(input)
      .arg(output)
```

### shell metachar 一覧 (reject すべき)

```text
shell injection に使える文字: ` & | ; > < ' " $ \ ( ) { } [ ] ! ? * ~ \n \r
```

ただし、args 配列で渡せば shell parser は介在しないので、これらの文字を含む文字列が arg として渡っても問題ない (= 1 つの引数として扱われる)。

`tauri-plugin-shell` の `Command::new("...")` も同様に args 配列で渡せる。
shell 文字列を許可する `Shell::execute("sh -c ...")` 系は使わない。

---

## 2. 起動先 binary が trusted path

### PATH 依存の問題

- `Command::new("convert")` のように binary 名のみ指定すると、PATH から探索される
- 攻撃者が PATH の優先位置に同名 binary を仕込むと任意 binary 起動

### 対策

- 起動先を絶対 path で指定 (`/usr/bin/convert` / `C:\Program Files\app\app.exe`)
- アプリ bundle 内 binary を起動するなら `tauri::api::path::resource_dir()` 経由
- 動的な選択 (例: InDesign のバージョン routing) でも、許可 path リストに照合

### 動的選択の例

```rust
fn locate_indesign_executable(version: &str) -> Result<PathBuf, &'static str> {
    let allowed: &[(&str, &str)] = &[
        ("2024", r"C:\Program Files\Adobe\Adobe InDesign 2024\InDesign.exe"),
        ("2025", r"C:\Program Files\Adobe\Adobe InDesign 2025\InDesign.exe"),
    ];
    let path = allowed
        .iter()
        .find(|(v, _)| *v == version)
        .map(|(_, p)| PathBuf::from(p))
        .ok_or("unsupported version")?;
    if !path.exists() {
        return Err("InDesign not installed");
    }
    Ok(path)
}
```

---

## 3. working_dir / env の正規化

```text
- Command::current_dir(...) は trusted path を渡す (user input の path をそのまま使わない)
- env::var を Command::env(...) に渡す前に sanitize
  - PATH を clear するか、必要な path のみ追加
  - LD_LIBRARY_PATH / DYLD_LIBRARY_PATH / PATHEXT は除外
- env を空にすると一部 binary が動かないので、必要な env のみ allow-list で渡す
```

### Rust 例

```rust
fn safe_command(exe: &Path) -> Command {
    let mut cmd = Command::new(exe);
    cmd.env_clear();
    // 最小限の env を allow-list で復元
    if let Ok(home) = std::env::var("HOME") {
        cmd.env("HOME", home);
    }
    if let Ok(path) = std::env::var("PATH") {
        // 必要に応じて PATH を限定
        cmd.env("PATH", path);
    }
    cmd
}
```

---

## 4. output / error の sanitize

- `Command::output()` / `Command::stdout` / `Command::stderr` の戻り値に絶対 path / secret が含まれていないか確認
- error を log / error / Toast に転送する前に sanitize
- 詳細 output は debug log のみに、user 向け error は generic 文言

---

## 5. capability / scope の整合

- `tauri-plugin-shell` の scope に execute 可能 binary を制限 (具体的 path / args pattern)
- `**` / `*` ベースの broad scope は使わない
- 削除した shell command が capability に残っていないか (dangling permission)

詳細は `capability-permission.md`。

---

## 典型 finding

| pattern | severity | mitigation |
|---------|----------|-----------|
| `Command::new("sh").arg("-c").arg(format!("..."))` で user input 直接 interpolate | Critical | args 配列化 + shell 文字列禁止 |
| `Command::new("convert")` で PATH 依存 | High | 絶対 path 指定 |
| working_dir に user input | High | trusted path のみ |
| env を default のまま継承 | Medium | env allow-list |
| stdout / stderr を error にそのまま転送 (絶対 path / secret 漏洩) | High | sanitize |
| `tauri-plugin-shell` の scope に `**` | High | 具体的 path / args pattern |

---

## bulk_group 例

- `security:unsafe-shell-args`
- `security:path-dependent-binary-launch`
- `security:env-leak-to-subprocess`
- `security:command-output-leak`
- `security:shell-scope-overreach`
