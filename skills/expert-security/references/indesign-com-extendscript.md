# indesign-com-extendscript.md — InDesign / COM / ExtendScript 境界

<!--
機能概要: InDesign 連携 (ExtendScript / JSX / COM) の audit 観点。
作成意図: 文字列 interpolation injection / 一時ファイル権限 / version routing / 外部アプリ起動境界を統一する。
注意点: shell / process の audit は shell-process.md。
       capability の整合は capability-permission.md。
-->

## audit 対象

- ExtendScript (.jsx) の generation
- JSX 一時ファイルの保存先 / 削除タイミング / 権限
- ExtendScript 文字列に user input を interpolate
- COM 経由の InDesign 起動 / バージョン routing
- generated script / log への production path / document content 漏洩

---

## 検査観点

### 1. ExtendScript 文字列 interpolation

```text
NG (危険):
  let jsx = format!("var doc = app.open(File('{}'));", path);

問題:
  path に ' (single quote) が含まれると string literal を抜けて任意 JS 実行
  Windows path の \ も escape が必要 (二重 backslash)
  改行 (\n / \r) で文を分割される
```

```text
OK (安全):
  - JSX 文字列内では proper escape (single quote → \\', backslash → \\\\, newline → \\n / \\r)
  - もしくは JSX 側で arguments[0] のような外部から渡せる仕組みを使う
  - JSX を string で持たず、template + 安全な substitution で組み立てる
```

```rust
fn escape_for_jsx_string(s: &str) -> String {
    s.replace('\\', "\\\\")
        .replace('\'', "\\'")
        .replace('\n', "\\n")
        .replace('\r', "\\r")
        .replace('\t', "\\t")
}

fn build_jsx_open(path: &str) -> String {
    let escaped = escape_for_jsx_string(path);
    format!("var doc = app.open(File('{}'));", escaped)
}
```

### 2. JSX 一時ファイルの保存先 / 権限 / 削除

```text
- system temp directory ($TEMP / system temp dir) に作成
- predictable filename を避ける (tempfile crate 利用)
- 権限を user-private にする (Windows: default ACL / Linux/macOS: mode 0600)
- 実行後に削除 (panic / error 経路でも cleanup)
- crash 時に残る可能性を考慮 (predictable name を避けることで再利用攻撃を防ぐ)
```

### 3. COM / 外部アプリ起動境界

```text
- COM 経由の InDesign 起動 (Windows com crate / C++ 経由) は shell injection と同等の扱い
- args / parameters は配列で渡す (文字列連結禁止)
- 起動先 binary (InDesign.exe) は絶対 path で指定 (PATH 依存禁止)
- バージョン routing は trusted internal だが、外部入力で version path を選ばせない
```

### 4. InDesign version routing

```text
- 設定 / project file から「InDesign 2024」「InDesign 2025」のような version 文字列を受け取る経路
- version 文字列を allowlist で照合 (許可 version のみ)
- version → executable path は hard-coded mapping (config 経由で書き換え可能にしない)
- 起動先 path が file system に存在することを確認
```

### 5. generated script / log の sanitize

```text
- 生成 JSX に user の絶対 path / document content を hard-code しない
- error log に JSX 全体を出力すると path / content 漏洩
- log は JSX template + 引数 のように分けて、引数だけ sanitize して出力
```

### 6. document content の取扱

```text
- ExtendScript で document content を JSX 文字列に embed すると path / 文書内容が JSX file に永続化
- 機密 document を JSX 経由で操作する場合は、embed ではなく file 経由 / IPC 経由で内容を渡す
- 一時 JSX file の権限と削除を厳密に管理
```

---

## 典型 finding

| pattern | severity | mitigation |
|---------|----------|-----------|
| `format!("var path = '{}'", user_path)` で escape なし (ExtendScript injection) | Critical | escape ヘルパー利用 / arguments 経由 |
| JSX 一時 file が predictable name (`/tmp/script.jsx`) | High | tempfile crate 利用 |
| JSX 一時 file が mode 0644 で他ユーザー読める | High | mode 0600 |
| InDesign.exe を PATH 依存で起動 | High | 絶対 path / version allowlist |
| version routing で config から読んだ path を信頼 | High | hard-coded mapping |
| 生成 JSX に絶対 path / document content 含む (log にそのまま出力) | High | sanitize / log separation |
| COM 起動の args を文字列連結 | Critical | args 配列化 |
| JSX file が panic / error 経路で残る | Medium | RAII / drop guard で cleanup |

---

## bulk_group 例

- `security:extendscript-injection`
- `security:jsx-tempfile-predictable`
- `security:jsx-tempfile-mode-too-permissive`
- `security:jsx-tempfile-leak`
- `security:com-shell-injection`
- `security:indesign-version-routing-untrusted`
- `security:jsx-leak-to-log`

---

## forbidden_shortcuts

InDesign / ExtendScript / COM finding では `do_not_remove_external_app_launch` を必ず含める:

```yaml
forbidden_shortcuts:
  - do_not_remove_external_app_launch  # InDesign 連携を全部削除しない
```

実際の修正は escape / tempfile 安全化 / version allowlist / 起動 path validation で対応する。
