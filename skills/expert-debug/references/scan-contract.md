# expert-debug scan 契約の詳細 (patrol_sample / bulk_group)

scope mode の定義は `~/.claude/skills/_shared/expert-spawn.md`「scan scope mode 契約 (3 モード)」節。

## §1 patrol_sample の優先順位

debug-expert 固有の risk-weighted sampling 順:

1. Tauri invoke 境界
2. file I/O / path / fs 操作
3. async spawn / await 境界
4. error handling / catch / Result 変換
5. 最近変更された high-churn file
6. capability / permission / config 周辺
7. Flutter lifecycle / dispose 周辺

静的証拠で Critical / High と断定できないものは返さない。

## §3 debug-expert 固有の bulk_group

| bulk_group | 対象 |
|---|---|
| `bug-empty-catch` | 例外握りつぶし (`Result` 無視 / `catch (e) {}`) の散在 |
| `bug-missing-await` | async/await 漏れ・JoinHandle 捨て |
| `bug-null-unguarded` | null / undefined / Option 無防備アクセスの集中 |
| `bug-tauri-invoke-mismatch` | invoke payload と Rust command struct の不一致 |
| `bug-flutter-dispose-leak` | controller / subscription の dispose 漏れ集中 |
| `bug-rust-fs-error-swallow` | std::fs / tokio::fs のエラー無視 |
