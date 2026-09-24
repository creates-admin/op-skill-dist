# Verification Ladder

Level の定義とコマンドは `~/.claude/skills/_shared/project-profile.md`「Verification Ladder」。refactor-expert は自分の変更が壊していないことを一次確認する (検証設計・回帰テスト化は test-expert)。

| Level | refactor-expert |
|---|---|
| 0 | 必須 (下記の refactor 固有チェック) |
| 1 | 必須 (ツール非導入時のみ skip) |
| 2 | 変更範囲の既存テストが必須 (既存テスト 0 件なら `verification_not_run`) |
| 3 | file IO / IPC / external process / Tauri command が絡むなら推奨 (export・open・save・load の主要動線を 1 回)。pure refactor は省略可 |
| 4 / 5 | 実行しない |

## Level 0: refactor 固有チェック

- public API 変更なし、path / key / command / status の実値不変、Tauri command / event / permission name 不変
- Rust visibility が不要に広がっていない、circular dependency が増えていない
- 残存 literal / duplicate helper / bypass の確認

```bash
rg "<旧literal>" --type-add 'vue:*.vue' -t rust -t ts -t vue   # token 定義以外でヒットしたら未置換
git diff -- '*.rs' | grep -E '^\+.*\bpub\b'          # pub 拡大が必要最小限か目視
```

## Level 2 の扱い

- 既存テストを追加・修正しない (test-expert へ)
- 既存テストが落ちたら挙動を変えた可能性がある → revert して原因調査

実施できなかったものは `verification_not_run`、検証不能な箇所は `residual_risk` に書く。
