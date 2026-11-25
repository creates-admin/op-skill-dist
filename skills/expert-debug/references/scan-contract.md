# expert-debug scan 契約の詳細 (patrol_sample / severity / bulk_group)

scope mode の定義は `~/.claude/skills/_shared/expert-report-schemas.md`「scan scope mode 契約 (3 モード)」節。

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

## §2 Severity Policy (報告閾値)

報告ルールは `~/.claude/skills/_shared/severity-rubric.md`「scan 報告ルール (共通)」節 (scan 前に Read)。debug 固有の基準:

### Critical

- データ破壊 (保存済み内容の欠落 / 上書き / 不可逆な変更)
- 権限突破 / 任意パス書き込み / path traversal
- プロセスクラッシュ (panic, SIGABRT, OOM, 無限ループ)
- 本番操作不能 (起動失敗、フォールバック不在のフリーズ)
- 外部プロセス誤起動 / sidecar 暴走
- セキュリティ境界の破綻 (capability 漏れ、unsafe な FFI 境界)

### High

- 主要機能が無音で失敗する (画面上は成功、実は処理されていない)
- 非同期処理の取りこぼし (`spawn` 後に handle を捨てる、await 漏れ)
- ファイル入出力の失敗を検知できない (`unwrap_or_default` で握りつぶし)
- 日本語パス / 空入力 / 大量件数 / Windows UNC で壊れる
- Rust panic が Tauri command 経由で UI まで伝播
- Tauri invoke の payload schema 不一致 (silent serde 失敗)
- Flutter で dispose 後に setState / Stream 受信
- Vue state と Rust backend state の不整合 (二重管理 / 競合)

Python / FastAPI は `pyproject.toml` / `requirements.txt` / FastAPI import がある repo でのみ報告する。

## §3 debug-expert 固有の bulk_group

| bulk_group | 対象 |
|---|---|
| `bug-empty-catch` | 例外握りつぶし (`Result` 無視 / `catch (e) {}`) の散在 |
| `bug-missing-await` | async/await 漏れ・JoinHandle 捨て |
| `bug-null-unguarded` | null / undefined / Option 無防備アクセスの集中 |
| `bug-tauri-invoke-mismatch` | invoke payload と Rust command struct の不一致 |
| `bug-flutter-dispose-leak` | controller / subscription の dispose 漏れ集中 |
| `bug-rust-fs-error-swallow` | std::fs / tokio::fs のエラー無視 |
