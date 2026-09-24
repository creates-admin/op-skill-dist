# expert-feature 検証・コミット辞典

スタック別の検証コマンドは `~/.claude/skills/_shared/project-profile.md`「検証コマンド (スタック別)」。
コマンドは存在確認してから実行し、ツール非導入は「検証未実行 (理由: ツール非導入)」として完了報告に書く。

## Verification Ladder Level の解釈 (feature-expert)

| Level | 内容 | apply での扱い |
|---|---|---|
| 0 | Read / Grep / Glob | scan、apply の資産探索 |
| 1 | lint / format / typecheck | 必須 (各レイヤー実装ごと) |
| 2 | unit test | 該当があれば必須 (happy path 1〜2 本を含む) |
| 3 | dev build | 依存追加 / IPC 変更 / capability 変更時は必須 |
| 4 | full build / Tauri 統合 (`tauri build` / `tauri dev`) | 司令官が明示した場合のみ。それ以外は dedicated Issue |
| 5 | E2E / 実機 / network drive | 実施しない (dedicated Issue) |

## Tauri v2 の実装順序と検証

```
1. 型定義 (src/types/, src-tauri/src/types.rs)      → Level 1: vue-tsc + cargo check
2. Rust command (src-tauri/src/commands/)           → Level 1: cargo clippy / Level 2: cargo test
3. capability (src-tauri/capabilities/)             → Level 1: cargo check (handler 登録の整合のみ。capability JSON の完全な検証は Level 4)
4. invoke wrapper (src/api/)                        → Level 1: vue-tsc
5. UI (src/pages/, src/components/)                 → Level 1: vue-tsc + eslint / Level 2: vitest
6. happy path test                                  → Level 2
```

## レイヤーまたぎの整合確認

- command 名: Rust の `#[tauri::command]` と `src/api/` の `invoke` 名が一致 (`asset-discovery.md`「Tauri v2 境界」の diff)
- 型契約: Rust の `AppResult<T>` と TS の `invoke<T>()` の `T` が一致
- error: Rust が `AppError` を返し、TS の catch が AppError の serialize 形式を前提にしている
- state: UI の loading / error / empty / success が wrapper の戻り値と対応している
- 新規 command は `tauri::generate_handler` と capability に登録されている

## happy path test 雛形

異常系 / 境界値テストは追加しない (test-expert へ委譲)。

```ts
// Vue + Vitest
import { describe, it, expect, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import CaseDetail from '../CaseDetail.vue'

vi.mock('@/api/case', () => ({ getCase: vi.fn().mockResolvedValue({ id: '1', title: 'test' }) }))

describe('CaseDetail', () => {
  it('shows case title on success', async () => {
    const wrapper = mount(CaseDetail, { props: { id: '1' } })
    await flushPromises()
    expect(wrapper.text()).toContain('test')
  })
})
```

```rust
// Rust command
#[tokio::test]
async fn get_case_returns_case_for_valid_id() {
    let result = get_case("test-id".into()).await;
    assert_eq!(result.unwrap().id, "test-id");
}
```

```dart
// Flutter widget (mocktail)
testWidgets('shows case title on success', (tester) async {
  final repo = _FakeRepository();
  when(() => repo.getCase('1')).thenAnswer((_) async => Case(id: '1', title: 'test'));
  await tester.pumpWidget(MaterialApp(home: CaseDetailPage(id: '1', repository: repo)));
  await tester.pumpAndSettle();
  expect(find.text('test'), findsOneWidget);
});
```

## 完了報告での検証レベル記録

```markdown
## 検証

| Level | 内容 | コマンド | 結果 |
|-------|------|---------|------|
| 1 | TS typecheck | pnpm vue-tsc --noEmit | pass |
| 2 | Rust unit | cd src-tauri && cargo test commands::case | pass (3/3) |
| 3 | Tauri build | - | skipped (依存追加なし、IPC 変更なし) |
| 4-5 | full build / E2E | - | skipped (dedicated Issue 推奨) |
```

`pass` / `fail` / `skipped` を必ず書く。`fail` を含むまま完了報告しない。

## コミットメッセージテンプレ

形式と `Fixes` / `Refs` の使い分けは `~/.claude/skills/_shared/commit-convention.md` (既定は `Fixes #N`)。

```
feat(<scope>): <要約> (Fixes #N)

<実装の goal を 1〜2 文>

手本:
- <既存ファイル:LINE>: <参考にした要素 (構成 / 命名 / error 処理 / 状態管理)>

再利用した既存資産:
- <crate / module / wrapper / component / type>: <用途>

実装内容:
- <ファイル>: <変更>

テスト:
- 残: <test_xxx_when_yyy>: happy path 検証
- 委譲 Issue: #M (異常系 / 境界値テストを test-expert に依頼)
```

`手本` と `再利用した既存資産` が空なら完了報告しない。
