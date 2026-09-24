# expert-debug ツール・コマンド辞典

スタック別の基本検証コマンドは `~/.claude/skills/_shared/project-profile.md`「検証コマンド (スタック別)」。ここは debug 固有の Level 0 grep・Tauri 境界確認・再現テスト雛形・ログ・bisect。
コマンドは存在確認してから実行し、ツール非導入は「検証未実行 (理由: ツール非導入)」として報告する。

## project-type 判定

```bash
test -f Cargo.toml && echo rust;  test -d src-tauri && echo tauri-v2
test -f package.json && echo node; test -f pubspec.yaml && echo flutter
test -f pnpm-lock.yaml && echo pnpm; test -f package-lock.json && echo npm; test -f yarn.lock && echo yarn
test -d node_modules || echo "needs: install"
```

## Level 0 grep (危険パターン)

```bash
rg '\.unwrap\(\)|\.expect\(' --type rust                            # panic 候補
rg 'tokio::spawn' --type rust -A 3                                   # JoinHandle の扱い
rg "invoke\(['\"][^'\"]+['\"]" --type ts -A 3 | rg -B 1 -v 'catch'   # invoke の catch 漏れ候補
rg '\bstate\s*=\s*\{' --type-add 'vue:*.vue' -t ts -t vue          # reactive 再代入
rg '_(\w+)Controller\b' --type dart | rg -v dispose                  # dispose 漏れ候補
rg 'setState' lib/                                                   # dispose 後 setState 候補
```

## Tauri v2 境界の確認

```bash
# frontend の invoke 名と backend の command 名を突き合わせ、片側にしか無いものを探す
rg --no-heading --no-filename "invoke(?:<[^>]*>)?\(['\"]([^'\"]+)['\"]" src --only-matching -r '$1' | sort -u
rg --no-heading --no-filename -U '#\[tauri::command\]\s*(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?fn\s+(\w+)' src-tauri/src --only-matching -r '$1' | sort -u

# capability / permission
rg 'tauri-plugin-' src-tauri/Cargo.toml
rg '"identifier"|"permissions"' src-tauri/capabilities/
rg "tauri::generate_handler" src-tauri/src/main.rs src-tauri/src/lib.rs   # 新規 command の登録漏れ
```

Tauri の Level: 1 = backend `cargo check` / `clippy` + frontend `vue-tsc --noEmit` / lint、2 = `cd src-tauri && cargo test` + `vitest run`、
3 = backend `cargo build` + frontend `npm run build`、4 = `tauri build` / `tauri dev` (司令官が明示した場合のみ)。

並行起因の flaky 切り分け: `cargo test -- --test-threads=1`。

## 再現テストの言語別最小テンプレ

失敗する再現テストを先に書くときの最小雛形。

### Rust (cargo test)

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn handles_empty_input() {
        assert_eq!(parse(""), Err(ParseError::Empty));
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn async_resolves() {
        assert_eq!(fetch_user(1).await.unwrap().id, 1);
    }
}
```

### Vue / TypeScript (vitest)

```ts
import { test, expect } from 'vitest';
import { mockIPC } from '@tauri-apps/api/mocks';

test('handleSubmit rejects empty input', () => {
  expect(handleSubmit({ name: '' })).toEqual({ ok: false, error: 'name required' });
});

// Tauri invoke 境界の mock (未 mock の command は throw させて取りこぼしを検知)
mockIPC((cmd, args) => {
  if (cmd === 'save_doc') return { ok: true };
  throw new Error(`unmocked: ${cmd}`);
});
```

### Flutter / Dart (flutter test)

```dart
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('parser rejects empty', () {
    expect(() => parse(''), throwsArgumentError);
  });

  testWidgets('disposes controllers', (tester) async {
    await tester.pumpWidget(const MaterialApp(home: MyForm()));
    await tester.pumpWidget(const SizedBox()); // 強制 unmount
    // ticker / subscription 残存の警告が出ないことを確認
  });
}
```

## ログ挿入テンプレ

| 言語 | テンプレ |
|---|---|
| Rust | `eprintln!("[DEBUG] func: input={:?}", input);` |
| TS/Vue | `console.log('[DEBUG] funcName:', { input, type: typeof input });` |
| Dart | `debugPrint('[DEBUG] func: input=$input type=${input.runtimeType}');` |

修正後に 0 件を確認する:

```bash
rg '\[DEBUG\]' --type-add 'vue:*.vue' -t rust -t ts -t js -t dart -t vue
```

## git bisect

```bash
git bisect start && git bisect bad HEAD && git bisect good <既知の正常コミット>
# 各ステップで Repro Lock の repro_command を再実行 → git bisect good / bad
git bisect reset
```

## 検証未実行の報告形式

```markdown
## 未実行の検証

- Level 3 (Tauri build): 未実行
  - 理由: WSL 環境に Windows toolchain 未導入
  - 残存リスク: Windows build 固有の path / linker 問題は未確認
```
