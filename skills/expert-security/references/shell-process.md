# shell-process.md — process 起動 / 外部アプリ / InDesign COM・ExtendScript

外部アプリ連携は正当な capability。削除せず、起動経路を安全にする (`forbidden_shortcuts: do_not_remove_external_app_launch`)。

## 1. args 配列で渡す

```rust
// NG: user input が shell に解釈される
Command::new("sh").arg("-c").arg(format!("convert {} -resize 50% {}", input, output));
// OK: 引数ごとに渡す (metachar を含んでも 1 引数として扱われる)
Command::new(convert_exe).arg(input).arg("-resize").arg("50%").arg(output);
// sh が必要なら: 位置引数で渡し script 内で quote する
Command::new("sh").arg("-c").arg(r#"convert "$1" -resize 50% "$2""#).arg("--").arg(input).arg(output);
```

tauri-plugin-shell も args 配列で呼び、shell 文字列を実行する API は使わない。

## 2. 起動先 binary

- 名前だけ (`Command::new("convert")`) だと PATH 探索になり、同名 binary を先に置かれると任意 binary が起動する。絶対 path で指定する。
- bundle 内 binary は resource dir から解決する。
- 動的に選ぶ場合 (InDesign の version routing 等) は hard-coded の allowlist で version → 絶対 path を引き、存在を確認する。
  version 文字列を config / project file から受けても、path そのものを外部から与えさせない。

## 3. working_dir / env / 出力

- `current_dir` には trusted path だけを渡す。
- `env_clear()` してから必要な env だけを allow-list で渡す。`LD_LIBRARY_PATH` / `DYLD_LIBRARY_PATH` / `PATHEXT` は渡さない。
- stdout / stderr を error・log・Toast にそのまま転送しない (絶対 path / secret)。詳細は debug log のみ。
- tauri-plugin-shell の scope は具体的な binary path / args pattern に限定する (`**` 禁止)。

## 4. InDesign / ExtendScript / COM

- **JSX 文字列 interpolation** — `format!("app.open(File('{}'));", path)` は `'` で literal を抜けて任意 JS が実行される。
  escape (`\` → `\\`、`'` → `\'`、`\n` / `\r` / `\t`) するか、`arguments` 経由で値を渡す。
- **JSX 一時ファイル** — system temp に tempfile crate で作る (予測不能な名前、Unix 0600 / Windows ユーザー専用)、
  error / panic 経路でも drop guard で削除する。
- **COM 起動** — shell injection と同等に扱う。引数は配列、InDesign.exe は絶対 path (§2)。
- **文書内容** — 機密文書の内容を JSX に埋め込むと一時 JSX に残る。file / IPC 経由で渡す。生成 JSX 全体を log に出さない
  (template と引数を分け、引数を sanitize して出す)。
- trust_boundary は JSX 生成を `generated_script`、COM 呼び出しを `com_boundary` とする。

## 5. 典型 finding

| パターン | severity 目安 | mitigation |
|---|---|---|
| `sh -c` に user input を format | Critical | args 配列 |
| JSX 文字列に escape なしで user path / text | Critical | escape / arguments 経由 |
| COM 起動の引数を文字列連結 | Critical | 配列化 |
| PATH 依存の binary 起動 / config 由来 path で InDesign を選ぶ | High | 絶対 path / hard-coded allowlist |
| working_dir に user input | High | trusted path |
| stdout / stderr や生成 JSX を error・log へそのまま転送 | High | sanitize |
| shell plugin の scope に `**` | High | 具体 path / args pattern |
| JSX 一時ファイルが predictable 名 / 0644 | High | tempfile / 0600 |
| env を無制限に継承 / JSX が error 経路で残る | Medium (報告しない) | allow-list / drop guard |
