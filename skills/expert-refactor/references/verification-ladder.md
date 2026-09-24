# Verification Ladder

refactor-expert は自分の変更が壊していないことを一次確認する。検証設計・回帰テスト化は test-expert。
コマンドは存在確認してから実行し、ツールが無ければ失敗ではなく `verification_not_run` (理由: ツール非導入) に記録する。
スタック別コマンドは `_shared/project-profile.md`「検証コマンド (スタック別)」。

| Level | 内容 | refactor-expert |
|---|---|---|
| 0 | 静的確認 | 必須 |
| 1 | 軽量静的チェック | 必須 (ツール非導入時のみ skip) |
| 2 | 変更範囲の既存テスト | 必須 (既存テスト 0 件なら verification_not_run) |
| 3 | 統合寄り smoke | file IO / IPC / external process / Tauri command が絡むなら推奨。pure refactor は省略可 |
| 4 | 重い統合検証 (release build / `pnpm tauri build` / E2E) | 実行しない (司令官が明示した場合のみ) |
| 5 | 実機 / installer / updater / network drive・日本語パス・UNC path | 実行しない (人間・test-expert へ) |

## Level 0: 静的確認

- `git diff` review、import / export 確認、public API 変更なし
- path / key / command / status の実値不変、Tauri command / event / permission name 不変
- Rust visibility が不要に広がっていない、circular dependency が増えていない
- 残存 literal / duplicate helper / bypass の確認

```bash
rg "<旧literal>" --type-add 'vue:*.vue' -t rust -t ts -t vue   # token 定義以外でヒットしたら未置換
git diff -- '*.rs' | grep -E '^\+.*\bpub\b'          # pub 拡大が必要最小限か目視
```

## Level 1: 軽量静的チェック

Rust: `cargo check` / `cargo clippy -- -D warnings` / TS・Vue: `vue-tsc --noEmit` / `eslint .` / Dart: `dart analyze` / `flutter analyze`

## Level 2: 変更範囲の既存テスト

`cargo test <module>` / `vitest run <pattern>` / `flutter test test/<pattern>` 等。

- 既存テストを追加・修正しない (test-expert へ)
- 既存テストが落ちたら挙動を変えた可能性がある → revert して原因調査

## Level 3: 統合寄り smoke

`cd src-tauri && cargo check` (capability 含む) / export・open・save・load の主要動線を 1 回 / CLI 代表 subcommand / 出力ファイルパスと内容の確認。
実施できなければ `residual_risk` に「Level 3 smoke 未実施 (理由)」を書く。

## apply report への記録

```yaml
verification_performed:
  - command: "cargo check"
    result: "passed"
  - command: "grep for remaining literals"
    result: "only token definition remains"
verification_not_run:
  - command: "cargo test"
    reason: "no existing tests for this module"
residual_risk:
  - "Manual smoke recommended for report export/open flow"
```

Level 0〜2 で実施できなかったものは `verification_not_run`、検証不能な箇所は `residual_risk` に書く。「たぶん大丈夫」で完了報告しない。
