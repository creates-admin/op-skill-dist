# expert-debug ツール・コマンド辞典

スタック別の検証コマンドは `~/.claude/skills/_shared/project-profile.md`「検証コマンド (スタック別)」。ここは debug 固有の Level 0 grep・Tauri 境界確認・再現テスト・ログ。

## Level 0 grep (危険パターン)

```bash
rg '\.unwrap\(\)|\.expect\(' --type rust                            # panic 候補
rg 'tokio::spawn' --type rust -A 3                                   # JoinHandle の扱い
rg "invoke\(['\"][^'\"]+['\"]" --type ts -A 3 | rg -B 1 -v 'catch'   # invoke の catch 漏れ候補
rg '_(\w+)Controller\b' --type dart | rg -v dispose                  # dispose 漏れ候補
```

## Tauri v2 境界の確認

```bash
# frontend の invoke 名と backend の command 名を突き合わせ、片側にしか無いものを探す
rg --no-heading --no-filename "invoke(?:<[^>]*>)?\(['\"]([^'\"]+)['\"]" src --only-matching -r '$1' | sort -u
rg --no-heading --no-filename -U '#\[tauri::command\]\s*(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?fn\s+(\w+)' src-tauri/src --only-matching -r '$1' | sort -u
rg '"identifier"|"permissions"' src-tauri/capabilities/
rg "tauri::generate_handler" src-tauri/src/main.rs src-tauri/src/lib.rs   # 新規 command の登録漏れ
```

並行起因の flaky 切り分け: `cargo test -- --test-threads=1`。

## 再現テストの言語別最小テンプレ

- 再現テストは修正対象関数の既存テストモジュールに、失敗する形で 1 本だけ書く。
- Tauri invoke 境界は `@tauri-apps/api/mocks` の `mockIPC` で mock し、未 mock の command は throw させて取りこぼしを検知する。
- Flutter の dispose 漏れは `pumpWidget` で別 widget に差し替えて強制 unmount し、ticker / subscription 残存の警告が出ないことを確認する。

## ログ挿入

`[DEBUG]` プレフィックスを付けて入力値と型を出す。修正後に 0 件を確認する:

```bash
rg '\[DEBUG\]' --type-add 'vue:*.vue' -t rust -t ts -t js -t dart -t vue
```
