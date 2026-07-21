# expert-feature ツール・コマンド辞典 (project-type 別)

<!--
機能概要: feature-expert が apply モードで使う Verification Ladder のスタック別実装。
         型 → サーバ → 通信 → UI の各レイヤーで叩くべき lint / typecheck / unit / build コマンド集
作成意図: SKILL.md の「実装順序の原則」と「実行モード (apply)」の実装側辞典。
         expert-debug/references/tools.md と整合させ、Verification Ladder の Level 解釈を共通化。
注意点: ツールが入っていない環境もあるので、必ず存在確認してから提案する。
       ツール未導入は「失敗」ではなく「検証未実行 (理由)」として完了報告に明記する。
       feature-expert の apply は通常 Level 1〜3 まで。Level 4 は allow_level_4: true 時のみ、Level 5 は dedicated Issue。
-->

agent が「このプロジェクトでどう検証するか?」を判断する際の参照辞典。
**SKILL.md の Verification Ladder と「実装順序の原則」と対応している**。

---

## 共通: 実行前の存在確認 (前提契約)

検証コマンドを叩く前に、必ず以下で project-type を判定する。

```bash
# Project-type 判定
test -f Cargo.toml         && echo "rust"
test -f package.json       && echo "node"
test -f pubspec.yaml       && echo "flutter"
test -d src-tauri          && echo "tauri-v2"

# Tool 存在確認
command -v cargo           || echo "missing: rust toolchain"
command -v node            || echo "missing: node"
command -v flutter         || echo "missing: flutter sdk"

# package manager 判定
test -f pnpm-lock.yaml     && echo "pkg-mgr: pnpm"
test -f package-lock.json  && echo "pkg-mgr: npm"
test -f yarn.lock          && echo "pkg-mgr: yarn"
```

ツール非導入は失敗ではなく「検証未実行 (理由: ツール非導入)」として完了報告に明記する。

---

## Verification Ladder Level の解釈 (feature-expert 用)

| Level | 内容 | feature-expert apply の扱い |
|-------|------|--------------------------|
| 0 | Read / Grep / Glob | scan モード (apply では既存資産探索で使用) |
| 1 | lint / format / typecheck | apply で **必須** (各レイヤー実装ごとに) |
| 2 | unit test | apply で **必須** (該当があれば。happy path 1〜2 本含む) |
| 3 | build (dev) | apply で **依存追加 / IPC 変更 / capability 変更時必須**、それ以外は任意 |
| 4 | full build / 統合 | 原則 **dedicated Issue 化**。`allow_level_4: true` 指定時のみ apply で実施可 |
| 5 | E2E / 実機 / network drive | 常に **dedicated Issue 化**、apply では実施しない |

各レイヤーで 1〜2 ファイル単位で fail-fast 検証する。**まとめて変更してから検証は禁止**。

---

## Project Recipe 1: Tauri v2 (Rust + Vue 3 + TypeScript)

判定: `src-tauri/` あり、`package.json` あり (Vue 採用は `vite.config.ts` + `vue` 依存で確認)。

### レイヤー別 verification command

| レイヤー | Level | コマンド | 用途 |
|---------|-------|---------|------|
| 型 (Rust) | 1 | `cd src-tauri && cargo check` | コンパイル可否 |
| 型 (Rust) | 1 | `cd src-tauri && cargo clippy -- -D warnings` | lint |
| 型 (TS) | 1 | `pnpm vue-tsc --noEmit` | TypeScript 型チェック (Vue SFC 含む) |
| 型 (TS) | 1 | `pnpm eslint src/ --max-warnings=0` | lint |
| サーバ (Rust command) | 2 | `cd src-tauri && cargo test <test_name>` | 単一 unit test |
| サーバ (Rust command) | 2 | `cd src-tauri && cargo test --lib` | 全 lib unit test |
| 通信 (capability) | 1 | `cargo check` (Rust handler 登録漏れの検出に有効) | handler ↔ capability 整合の最低限確認 |
| 通信 (capability) | 4 | `pnpm tauri build` または `pnpm tauri dev` (allow_level_4 必須) | Tauri 側統合検証 (capability JSON の完全な権限チェック) |
| 通信 (wrapper) | 1 | `pnpm vue-tsc --noEmit` で wrapper の型整合確認 | invoke 引数 / 戻り値 |
| UI (Vue) | 1 | `pnpm vue-tsc --noEmit` | template + script |
| UI (Vue) | 2 | `pnpm vitest run <test-file>` | 単一 unit / component test |
| UI (Vue) | 2 | `pnpm vitest run` | 全 unit test |
| build (dev) | 3 | `cd src-tauri && cargo build` | Rust dev build |
| build (dev) | 3 | `pnpm build` | Vite build |
| build (full) | 4 | `pnpm tauri build` | Tauri release build (allow_level_4 必須) |

### 実装順序と検証の対応

```
1. 型定義 (src/types/, src-tauri/src/types.rs)
   → Level 1: vue-tsc + cargo check
2. Rust command (src-tauri/src/commands/foo.rs)
   → Level 1: cargo clippy
   → Level 2: cargo test (該当あれば)
3. capability 追加 (src-tauri/capabilities/)
   → Level 1: cargo check (handler 登録の整合の最低限確認のみ。capability JSON の完全な統合検証は Level 4)
   → Level 4 (allow_level_4 必須): pnpm tauri build / dev で Tauri 側統合検証
4. invoke wrapper (src/api/foo.ts)
   → Level 1: vue-tsc
5. UI (src/pages/foo/, src/components/)
   → Level 1: vue-tsc + eslint
   → Level 2: vitest (該当あれば)
6. happy path test (1〜2 本)
   → Level 2: vitest run
```

### Tauri v2 固有のチェックポイント

```bash
# capability scope 漏れ確認 (新規 command 追加時)
grep -rn "tauri::generate_handler" src-tauri/src/main.rs src-tauri/src/lib.rs

# invoke wrapper と Rust command の整合 (silent fork 防止)
grep -rn "#\[tauri::command\]" src-tauri/src/ | sed -E 's/.*fn ([a-z_]+).*/\1/' | sort -u > /tmp/rust-cmds
grep -rn "invoke\(['\"]" src/api/ | sed -E "s/.*invoke\(['\"]([a-z_]+).*/\1/" | sort -u > /tmp/ts-cmds
diff /tmp/rust-cmds /tmp/ts-cmds  # 差分が出ないこと

# Result serialize の整合
# Rust 側: AppResult<T> = Result<T, AppError>
# TS 側: invoke<T>() で T を受け取れるか
```

### happy path test 雛形 (Vue + Vitest)

```ts
// src/pages/case/__tests__/CaseDetail.test.ts
import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import CaseDetail from '../CaseDetail.vue'

vi.mock('@/api/case', () => ({
  getCase: vi.fn().mockResolvedValue({ id: '1', title: 'test' }),
}))

describe('CaseDetail', () => {
  it('shows case title on success', async () => {
    const wrapper = mount(CaseDetail, { props: { id: '1' } })
    await wrapper.vm.$nextTick()
    await wrapper.vm.$nextTick()  // useFetch の resolve 待ち
    expect(wrapper.text()).toContain('test')
  })
})
```

異常系 / 境界値テストは追加しない (test-expert に Issue 起票で委譲)。

### happy path test 雛形 (Rust command)

```rust
// src-tauri/src/commands/case.rs
#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn get_case_returns_case_for_valid_id() {
        let result = get_case("test-id".into()).await;
        assert!(result.is_ok());
        assert_eq!(result.unwrap().id, "test-id");
    }
}
```

---

## Project Recipe 2: Vue 3 + TypeScript (Tauri なし)

判定: `package.json` あり、`src-tauri/` なし、`vite.config.ts` あり、`vue` 依存。

### レイヤー別 verification command

| レイヤー | Level | コマンド |
|---------|-------|---------|
| 型 | 1 | `pnpm vue-tsc --noEmit` |
| 型 | 1 | `pnpm eslint src/ --max-warnings=0` |
| API client | 1 | `pnpm vue-tsc --noEmit` (型整合) |
| UI | 1 | `pnpm vue-tsc --noEmit` |
| UI | 2 | `pnpm vitest run <test-file>` |
| build | 3 | `pnpm build` |

happy path test 雛形は Tauri v2 と同じ。

---

## Project Recipe 3: Rust crate (単独 lib / bin)

判定: `Cargo.toml` あり、`src-tauri/` なし、フロントエンドなし。

### レイヤー別 verification command

| レイヤー | Level | コマンド |
|---------|-------|---------|
| 型 | 1 | `cargo check` |
| 型 | 1 | `cargo clippy -- -D warnings` |
| 型 | 1 | `cargo fmt --check` |
| 実装 | 2 | `cargo test <test_name>` |
| 実装 | 2 | `cargo test --lib` |
| build | 3 | `cargo build` |
| build (release) | 4 | `cargo build --release` (allow_level_4 必須) |

### happy path test 雛形

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn happy_path_returns_expected() {
        let input = Input::new("valid");
        let result = process(input).unwrap();
        assert_eq!(result.status, Status::Done);
    }

    #[tokio::test]
    async fn async_happy_path() {
        let result = run_async("input").await.unwrap();
        assert!(result.is_complete());
    }
}
```

---

## Project Recipe 4: Flutter / Dart

判定: `pubspec.yaml` あり、`lib/` あり。

### レイヤー別 verification command

| レイヤー | Level | コマンド |
|---------|-------|---------|
| 型 / lint | 1 | `dart format --set-exit-if-changed lib/ test/` |
| 型 / lint | 1 | `flutter analyze` |
| 実装 | 2 | `flutter test test/<file>_test.dart` |
| 実装 | 2 | `flutter test` |
| build | 3 | `flutter build apk --debug` (Android) |
| build | 3 | `flutter build ios --debug --no-codesign` (iOS, macOS のみ) |
| build (release) | 4 | `flutter build apk --release` (allow_level_4 必須) |
| 実機 | 5 | `flutter run -d <device>` (常に dedicated Issue) |

### happy path test 雛形 (Flutter widget)

```dart
// test/features/case/case_detail_page_test.dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:my_app/features/case/case_detail_page.dart';

class _FakeRepository extends Mock implements CaseRepository {}

void main() {
  testWidgets('shows case title on success', (tester) async {
    final repo = _FakeRepository();
    when(() => repo.getCase('1'))
        .thenAnswer((_) async => Case(id: '1', title: 'test'));

    await tester.pumpWidget(MaterialApp(
      home: CaseDetailPage(id: '1', repository: repo),
    ));
    await tester.pumpAndSettle();

    expect(find.text('test'), findsOneWidget);
  });
}
```

異常系 / 境界値テストは追加しない (test-expert に Issue 起票で委譲)。

---

## Project Recipe 5: Node.js / TypeScript backend (Tauri / Vue なし)

判定: `package.json` あり、`src-tauri/` なし、`vue` 依存なし、`express` / `fastify` / `nestjs` 等が依存に存在。

### レイヤー別 verification command

| レイヤー | Level | コマンド |
|---------|-------|---------|
| 型 | 1 | `pnpm tsc --noEmit` |
| 型 | 1 | `pnpm eslint src/ --max-warnings=0` |
| 実装 | 2 | `pnpm test <test-file>` (vitest / jest) |
| 実装 | 2 | `pnpm test` |
| build | 3 | `pnpm build` |

---

## レイヤーまたぎの整合確認 (silent fork 防止)

実装後、レイヤー間の整合を最低限確認する:

### 型契約の整合

```bash
# Rust 戻り値 type と TS invoke<T> の T が揃っているか
# Rust 側
grep -rn "fn.*-> AppResult<" src-tauri/src/commands/<feature>.rs

# TS 側
grep -rn "invoke<.*>(" src/api/<feature>.ts
```

### error type の整合

```bash
# Rust 側で AppError を返している
grep -rn "AppError\|AppResult" src-tauri/src/commands/<feature>.rs

# TS 側で catch (e) → e の型が AppError serialize 形式と一致しているか
grep -rn "catch.*=>" src/api/<feature>.ts -A 3
```

### state の整合

```bash
# UI 側の loading / error / empty / success state が wrapper の戻り値と一致
grep -rn "v-if=\"loading\|v-if=\"error\|v-if=\"empty" src/pages/<feature>/
```

---

## 完了報告での検証レベル記録

apply 完了時、PR 本文 / 完了報告に必ず記載:

```markdown
## 検証

| Level | 内容 | コマンド | 結果 |
|-------|------|---------|------|
| 1 | TS typecheck | pnpm vue-tsc --noEmit | pass |
| 1 | Rust clippy | cd src-tauri && cargo clippy | pass |
| 2 | Rust unit | cd src-tauri && cargo test commands::case | pass (3/3) |
| 2 | Vue unit | pnpm vitest run case/CaseDetail.test.ts | pass (1/1) |
| 3 | Tauri build | (skipped) | skipped (依存追加なし、IPC 変更なし) |
| 4 | full build | (skipped) | skipped (allow_level_4 not specified) |
| 5 | E2E | (skipped) | skipped (dedicated Issue 起票推奨) |

Manual required: no
未検証理由: Level 4-5 は実装スコープ外 (Issue 起票で test-expert / E2E 担当に委譲)
```

`pass` / `fail` / `skipped` を必ず記載。`fail` を含むまま完了報告してはいけない (PR は draft のまま)。

---

## ツール非導入時の挙動

- ツール非導入は失敗ではなく **「検証未実行 (理由: ツール非導入)」** として明記
- そのレイヤーの検証は skipped 扱い
- 完了報告に「<ツール> が未導入のため <Level X> 未実行」と書く
- ユーザー判断で導入を進めるか、別 Issue を起こすかは人間に投げる

```bash
# 例: Rust toolchain がない環境で Tauri command を変更した場合
command -v cargo || echo "skipped Level 1 Rust check: cargo not installed"
```

---

## CLAUDE.md 規約準拠の確認

実装後、以下の grep で違反がないか確認:

```bash
# ネスト深さ確認 (3 階層以上は要警戒、4 階層以上は違反)
# Vue / TS
grep -rn "                " src/ --include='*.vue' --include='*.ts' | head -10

# Rust
grep -rn "                " src-tauri/src/ --include='*.rs' | head -10

# 過剰抽象化の兆候 (1 関数 1 ファイル)
find src/ -name '*.ts' -size -500c | head -10  # 極端に小さいファイル

# 日本語コメントの存在 (主要処理に意図コメントがあるか)
grep -rn "^/\*\*" src/ --include='*.ts' | head -10
```

違反を見つけたらコミット前に修正。
