# secrets-and-logs.md — secret / path / 文書内容の漏洩

log は障害解析に必要なので消さない。出力内容の sanitize と log 権限で対処する (`forbidden_shortcuts: do_not_disable_capability_entirely`)。

## 1. 見る場所と漏れるもの

- 出力先: `log::*` / `tracing::*` / `println!` / `eprintln!` / `dbg!`、panic message、`Result::Err` と error chain、
  Toast / dialog / notification / status bar、生成 artifact (PDF metadata / JSX / JSON / CSV)、crash report / telemetry、Tauri event payload。
- 漏れるもの: secret (API key / OAuth・refresh token / session / 秘密鍵)、production path (ユーザー名入りの絶対 path / 内部構造)、
  document content (文書本文 / 個人情報 / 顧客名)、URL query の token (`?api_key=` → log / referer に残る)。

## 2. 対処

- log は workspace 相対 path か error kind のみ。frontend には kind に応じた汎用 code を返し、error chain (`{:?}`) を返さない。
- Toast / dialog は業務向けの文言。生成 artifact の metadata にユーザー名・内部 path を入れない。token は URL query に載せない。
- log file は Unix 0600 / directory 0700 (Windows はユーザー専用 ACL)。production の既定 level は info / warn まで。

## 3. 典型 finding

| パターン | severity 目安 | mitigation |
|---|---|---|
| secret を log に直接出力 | Critical | 出さない / mask |
| log に絶対 path / 文書内容 | High | sanitize / 相対 path |
| frontend への error に絶対 path / token / chain 全体 | High | 汎用 code |
| 生成 artifact に production path | High | metadata sanitize |
| log file が 0644 | High | 0600 |
| token を URL query に載せる | High | header / body |
| panic message に user input | High | panic 経路を除去 |
| Toast 文言に絶対 path | Medium (報告しない) | 業務向け文言 |
