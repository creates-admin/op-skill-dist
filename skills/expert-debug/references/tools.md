# expert-debug ツール・コマンド辞典 (project-type 別)

<!--
機能概要: プロジェクトタイプ別の検証 recipe・テスト雛形・ログ・静的解析コマンド集
作成意図: 言語別ではなくプロジェクトタイプ別に整理することで、
         Tauri v2 / Vue 3 / Flutter / Rust crate / Node.js のいずれかを開いたときに
         一目で「この project は Level X までこのコマンドを叩けば良い」
         と分かるようにする。SKILL.md の Verification Ladder の実装側辞典。
         2026-07-23 の重複解消編集で、旧 expert-feature/references/tools.md と
         recipe 本体 (project-type 判定・Level 別コマンド) を統合し、
         本ファイルを **debug-expert / feature-expert 共通の project-type 別
         verification recipe 辞書の正本**とした。feature-expert 固有の
         「実装順序との対応」「silent fork 防止の整合確認」「happy path 雛形」
         「完了報告フォーマット」は `expert-feature/references/tools.md` 側に残る
         (recipe 本体への pointer のみ持つ)。
注意点: ツールが入っていない環境もあるので、必ず存在確認してから提案する。
       ツール未導入は「失敗」ではなく「検証未実行 (理由)」として扱う。
       pnpm/npm/yarn はコマンド例として概ね等価に読み替え可 (lockfile で判定、下記参照)。
-->

agent が「このプロジェクトでどう検証するか?」を判断する際の参照辞典。
**SKILL.md の Verification Ladder と対応している**。debug-expert / feature-expert
双方がこの辞書を参照する (Level の意味づけ自体は各 agent の SKILL.md 本文が正本)。

---

## 共通: 実行前の存在確認 (前提契約)

検証コマンドを叩く前に、必ず以下で project-type を判定する。
ツール非導入の場合は失敗ではなく「検証未実行 (理由: ツール非導入)」として完了報告に明記する。

```bash
# Project-type 判定
test -f Cargo.toml         && echo "rust"
test -f package.json       && echo "node"
test -f pubspec.yaml       && echo "flutter"
test -d src-tauri          && echo "tauri-v2"
test -f pyproject.toml     && echo "python"  # conditional_stack のみ

# Tool 存在確認
command -v cargo           || echo "missing: rust toolchain"
command -v node            || echo "missing: node"
command -v flutter         || echo "missing: flutter sdk"
command -v npm             || echo "missing: npm"

# 重要ファイル
test -d node_modules       || echo "needs: npm install"
test -f package-lock.json  && echo "lockfile: npm"
test -f pnpm-lock.yaml     && echo "lockfile: pnpm"
test -f yarn.lock          && echo "lockfile: yarn"
```

---

## Project Recipe 1: Rust crate (単独 lib / bin)

判定: `Cargo.toml` あり、`src-tauri/` なし。

| Level | コマンド | 用途 |
|-------|---------|------|
| 0 | `rg 'unwrap\(\)\|expect\('` | panic 候補 |
| 0 | `rg 'tokio::spawn'` -A 3 | JoinHandle 取り扱い |
| 1 | `cargo check` | コンパイル可否のみ (高速) |
| 1 | `cargo clippy -- -D warnings` | lint (警告を error 化) |
| 1 | `cargo fmt --check` | フォーマット差分検出 |
| 2 | `cargo test` | 全 unit test |
| 2 | `cargo test -- --test-threads=1` | 並行起因の flaky 切り分け |
| 3 | `cargo build` | dev build |
| 4 | `cargo build --release` (`allow_level_4: true` 必須) | release build (重い、原則 dedicated Issue 化) |

#### 最小テスト雛形

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn handles_empty_input() {
        assert_eq!(parse(""), Err(ParseError::Empty));
    }

    #[test]
    #[should_panic(expected = "specific message")]
    fn panics_on_invalid() {
        target(bad);
    }

    #[tokio::test]
    async fn async_resolves() {
        assert_eq!(fetch().await.unwrap(), expected);
    }
}
```

#### tokio runtime テスト

```rust
#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn parallel_safe() { /* ... */ }
```

---

## Project Recipe 2: Tauri v2 app

判定: `src-tauri/` ディレクトリあり。

frontend (Vue/TS) と backend (Rust) の **両方を回す**。順番に叩く。

| Level | コマンド | 場所 |
|-------|---------|------|
| 0 | `rg "invoke\(['\"]" src` | invoke 呼び出し列挙 (frontend) |
| 0 | `rg '#\[tauri::command\]' src-tauri/src` | command 定義列挙 (backend) |
| 0 | `rg '\.unwrap\(\)\|\.expect\(' src-tauri/src` | panic 候補 |
| 1-be | `cd src-tauri && cargo check` | backend コンパイル |
| 1-be | `cd src-tauri && cargo clippy -- -D warnings` | backend lint |
| 1-be | `cd src-tauri && cargo check` (capability/handler 登録漏れの最低限確認) | capability 変更の型レベル確認 |
| 1-fe | `npm run typecheck` または `npx vue-tsc --noEmit` (pnpm 環境では `pnpm vue-tsc --noEmit`) | frontend 型 |
| 1-fe | `npm run lint` | frontend lint |
| 2-be | `cd src-tauri && cargo test` | backend test |
| 2-fe | `npx vitest run` または `npm test` | frontend test |
| 3-be | `cd src-tauri && cargo build` | backend dev build |
| 3-fe | `npm run build` | frontend dev build |
| 4 | `npm run tauri build` または `npm run tauri dev` (`allow_level_4: true` 必須) | 統合 build (capability JSON の完全な権限チェックを含む配布パッケージ build。原則 dedicated Issue 化) |
| 5 | Tauri WebDriver / Windows 実機 / network drive 経由の E2E | 常に dedicated Issue 化、apply では実施しない |

> **Level 4/5 の割り当てについて (2026-07-23 修正)**: 旧版は `npm run tauri build` を
> Level 5 としていたが、SKILL.md 本文の Verification Ladder ("Level 4 = Tauri 統合、
> `allow_level_4: true` 時のみ実施可" / "Level 5 = E2E・実機のみ")と整合させ、
> 配布パッケージ build は **Level 4** (実機 / WebDriver 等の E2E のみが Level 5) に修正した。
> 単に 1〜3 を順に通すだけでは capability JSON の完全な権限チェックが行われないため、
> Level 4 の実体は「`tauri build` / `tauri dev` を回す」ことと定義する。

#### invoke 境界の確認 (重要)

```bash
# frontend 側の invoke 呼び出し
rg --no-heading "invoke\\(['\"]([^'\"]+)['\"]" src --only-matching -r '$1' | sort -u

# backend 側の #[tauri::command] 関数名
rg --no-heading '#\[tauri::command\]\s*(?:async\s+)?(?:pub\s+)?fn\s+(\w+)' src-tauri/src --only-matching -r '$1' | sort -u

# 比較すれば、どちらかにしか存在しない command が浮く
```

#### capability / permission 確認

```bash
# 使ってる plugin 列挙
rg 'tauri-plugin-' src-tauri/Cargo.toml

# capability ファイル確認
ls src-tauri/capabilities/
cat src-tauri/capabilities/*.json | rg '"identifier"|"permissions"'

# generate_handler! への登録漏れ確認 (新規 command 追加時)
rg "tauri::generate_handler" src-tauri/src/main.rs src-tauri/src/lib.rs
```

---

## Project Recipe 3: Vue 3 frontend (Tauri 非依存)

判定: `package.json` に `vue` 依存、`src-tauri/` なし。

| Level | コマンド | 用途 |
|-------|---------|------|
| 0 | `rg "console\.(log\|debug)" src` | 残存デバッグログ |
| 0 | `rg '\.then\([^)]*\)$' src` | Promise の catch なし |
| 1 | `npx vue-tsc --noEmit` | 型エラーのみ |
| 1 | `npm run lint` または `npx eslint . --max-warnings 0` | lint |
| 2 | `npx vitest run` | 全テスト (watch なし) |
| 2 | `npx vitest run path/to/specific.test.ts` | 特定テストのみ |
| 3 | `npm run build` | 本番 build |

#### 最小テスト雛形

```ts
import { describe, test, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';

test('component renders', () => {
  const wrapper = mount(MyComponent, { props: { name: 'a' } });
  expect(wrapper.text()).toContain('a');
});

test('emit on click', async () => {
  const wrapper = mount(MyComponent);
  await wrapper.find('button').trigger('click');
  expect(wrapper.emitted('submit')).toBeTruthy();
});

// Tauri invoke の mock
import { mockIPC } from '@tauri-apps/api/mocks';
mockIPC((cmd, args) => {
  if (cmd === 'save_doc') return { ok: true };
  throw new Error(`unmocked: ${cmd}`);
});
```

---

## Project Recipe 4: Flutter app

判定: `pubspec.yaml` あり。

| Level | コマンド | 用途 |
|-------|---------|------|
| 0 | `rg 'setState' lib/` | dispose 後 setState 候補 |
| 0 | `rg '\.dispose\(\)' lib/` | dispose 漏れ確認 |
| 1 | `dart format --set-exit-if-changed lib/ test/` | フォーマット差分検出 |
| 1 | `flutter analyze` | 静的解析 + lint |
| 2 | `flutter test` | 全 unit / widget test |
| 2 | `flutter test test/path/specific_test.dart` | 特定テストのみ |
| 3 | `flutter build apk --debug` (Android) / `flutter build ios --debug --no-codesign` (iOS, macOS のみ) / `flutter build windows\|macos\|linux --debug` | debug build (必要時のみ) |
| 4 | `flutter build apk --release` 等の release build (`allow_level_4: true` 必須) | リリース build (原則 dedicated Issue 化) |
| 5 | `flutter test integration_test/` / `flutter run -d <device>` | E2E / 実機 (常に dedicated Issue 化) |

#### 最小テスト雛形

```dart
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('parser rejects empty', () {
    expect(() => parse(''), throwsArgumentError);
  });

  testWidgets('renders title', (tester) async {
    await tester.pumpWidget(const MyApp());
    expect(find.text('Title'), findsOneWidget);
  });

  testWidgets('disposes on remove', (tester) async {
    await tester.pumpWidget(const Scaffold(body: MyForm()));
    await tester.pumpWidget(const SizedBox());  // 強制 unmount
    // ticker / subscription 残存で警告が出ないか pumpAndSettle で確認
  });
}
```

---

## Project Recipe 5: Python / FastAPI (conditional_stack)

判定: `pyproject.toml` または `requirements.txt` あり、かつ FastAPI / Pydantic 依存。
通常はこの recipe に入らない。AI Gateway / Python backend repo のときのみ参照。

| Level | コマンド | 用途 |
|-------|---------|------|
| 1 | `mypy .` | 型チェック |
| 1 | `ruff check .` | lint (高速) |
| 2 | `pytest -x` | 最初の失敗で停止 |
| 2 | `pytest --cov=src --cov-report=term-missing` | カバレッジ |
| 3 | `python -m compileall src/` | syntax 全体確認 |

```python
import pytest

def test_subject():
    assert target(input) == expected

def test_raises():
    with pytest.raises(ValueError, match="message"):
        target(bad)

@pytest.mark.asyncio
async def test_async():
    assert await async_target() == value
```

---

## Project Recipe 6: Node.js / TypeScript backend (Tauri / Vue なし)

判定: `package.json` あり、`src-tauri/` なし、`vue` 依存なし、`express` / `fastify` / `nestjs` 等が依存に存在。

| Level | コマンド | 用途 |
|-------|---------|------|
| 1 | `pnpm tsc --noEmit` (または `npx tsc --noEmit`) | 型チェック |
| 1 | `pnpm eslint src/ --max-warnings=0` | lint |
| 2 | `pnpm test <test-file>` (vitest / jest) | 特定テストのみ |
| 2 | `pnpm test` | 全テスト |
| 3 | `pnpm build` | dev build |

---

## ログ挿入テンプレ

すべて `[DEBUG]` プレフィックスで、修正後に grep して全削除する。

| 言語 | テンプレ |
|------|---------|
| Rust | `eprintln!("[DEBUG] func: input={:?}", input);` |
| TS/Vue | `console.log('[DEBUG] funcName:', { input, type: typeof input });` |
| Dart | `debugPrint('[DEBUG] func: input=$input type=${input.runtimeType}');` |
| Python | `print(f"[DEBUG] func: input={input!r} type={type(input).__name__}")` |

修正完了後に必ず:

```bash
# 各 project-type の対象拡張子で残存確認
rg "\[DEBUG\]" --type rust
rg "\[DEBUG\]" --type ts --type vue --type js
rg "\[DEBUG\]" --type dart
# 検出 0 件になるまで削除
```

---

## デバッガ起動

| 言語 | コマンド |
|------|---------|
| Rust | `rust-gdb target/debug/binary` / `rust-lldb` (macOS) |
| Node | `node --inspect-brk script.js` (Chrome DevTools 接続) |
| Python | `python -m pdb script.py` / `breakpoint()` 埋め込み |
| Flutter | DevTools (`flutter pub global run devtools`) / IDE breakpoint |
| Tauri | DevTools = WebView の右クリック → Inspect (dev mode) |

---

## git 経由のバグ発生時期特定

```bash
# 二分探索でバグを入れたコミット特定
git bisect start
git bisect bad HEAD
git bisect good <既知の正常コミット>
# 各ステップで Repro Lock の repro_command を再実行 → bisect good/bad
git bisect reset

# 最近の変更を特定範囲だけで見る
git log --oneline --since="1 week ago" -- src-tauri/src/file.rs
```

---

## ツール非導入時の Grep フォールバック

```bash
# Rust の panic 候補
rg '\.unwrap\(\)|\.expect\(' --type rust

# Tauri invoke の catch 漏れ候補 (TS)
rg "invoke\(['\"][^'\"]+['\"]" --type ts -A 3 | rg -B 1 -v 'catch|\.catch'

# Vue の reactivity 喪失候補 (state 再代入)
rg '\bstate\s*=\s*\{' --type vue --type ts

# Flutter の dispose 漏れ候補
rg '_(\w+)Controller\b' --type dart --no-heading | rg -v 'dispose'

# 浮動小数比較 ==
rg "==\s*0\.[0-9]+|0\.[0-9]+\s*==" --type ts --type rust
```

---

## 検証未実行を完了報告に書く

ツール非導入・環境制約で実行できなかった検証は、以下のフォーマットで完了報告に明記する:

```markdown
## 未実行の検証

- Level 3 (Tauri build): 未実行
  - 理由: WSL 環境に Windows toolchain 未導入
  - 残存リスク: Windows build 固有の path / linker 問題は未確認
  - フォロー: 実機 Windows での dedicated E2E Issue を別途起票予定
```

これで「動くか分からないまま PR」を防ぐ。
