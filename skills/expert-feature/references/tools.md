# expert-feature 検証・コミット辞典

検証 Level の定義は `~/.claude/skills/_shared/project-profile.md`「Verification Ladder」。レイヤー別の必須 Level は SKILL.md「4. 下から積む」。

## レイヤーまたぎの整合確認

- command 名: Rust の `#[tauri::command]` と `src/api/` の `invoke` 名が一致 (`asset-discovery.md`「Tauri v2 境界」の diff)
- 型契約: Rust の `AppResult<T>` と TS の `invoke<T>()` の `T` が一致
- error: Rust が `AppError` を返し、TS の catch が AppError の serialize 形式を前提にしている
- state: UI の loading / error / empty / success が wrapper の戻り値と対応している
- 新規 command は `tauri::generate_handler` と capability に登録されている

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
```
