# shell-process.md — process 起動 / 外部アプリ / InDesign COM・ExtendScript

外部アプリ連携は正当な capability。削除せず、起動経路を安全にする (`forbidden_shortcuts: do_not_remove_external_app_launch`)。

## 1. 起動経路

- user input は args 配列で渡す (`sh -c` への format 禁止。sh が必要なら位置引数)。tauri-plugin-shell も args 配列で呼ぶ。
- 起動先 binary は絶対 path (PATH 探索に依存しない)。bundle 内 binary は resource dir から解決する。
  動的に選ぶ場合 (InDesign の version routing 等) は hard-coded の allowlist で version → 絶対 path を引き、path そのものを外部から与えさせない。
- `current_dir` は trusted path のみ。env は allow-list で渡す。stdout / stderr を error・log・Toast にそのまま転送しない。
- tauri-plugin-shell の scope は具体的な binary path / args pattern に限定する (`**` 禁止)。

## 2. InDesign / ExtendScript / COM

- **JSX 文字列 interpolation** — `format!("app.open(File('{}'));", path)` は `'` で literal を抜けて任意 JS が実行される。
  escape (`\` → `\\`、`'` → `\'`、`\n` / `\r` / `\t`) するか、`arguments` 経由で値を渡す。
- **JSX 一時ファイル** — system temp に tempfile crate で作る (予測不能な名前、Unix 0600 / Windows ユーザー専用)、
  error / panic 経路でも drop guard で削除する。
- **COM 起動** — shell injection と同等に扱う。引数は配列、InDesign.exe は絶対 path (§1)。
- **文書内容** — 機密文書の内容を JSX に埋め込むと一時 JSX に残る。file / IPC 経由で渡す。生成 JSX 全体を log に出さない
  (template と引数を分け、引数を sanitize して出す)。
- trust_boundary は JSX 生成を `generated_script`、COM 呼び出しを `com_boundary` とする。

## 3. 典型 finding

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
