# Verification Ladder

<!--
機能概要: refactor apply 後の検証 Level 0〜5 を定義し、refactor-expert が
         一次確認すべき範囲 (Level 0〜2) と test-expert / 司令官に委譲する
         範囲を分担する。
作成意図: refactor は no-behavior-change が絶対条件。一次確認を必須にし、
         検証不能な箇所は residual_risk として正直に申告する。
注意点: 検証コマンドは存在確認 → 実行の順で行う。ない場合は失敗ではなく
       「検証未実行 (理由: ツール非導入)」として扱う。
-->

## Responsibility

```text
refactor-expert:
  自分の変更が壊していないことを一次確認する。

test-expert:
  検証設計・回帰テスト化・テスト品質を担当する。
```

refactor-expert は Level 0〜2 を **必須**、Level 3 を必要に応じて、
Level 4〜5 は原則 司令官 / test / release expert に委譲する。

---

## Level 0: 静的確認 (必須)

apply 直後に必ず実行する:

- diff review (`git diff`)
- import / export 確認
- public API 変更なし確認
- grep で残存 literal / duplicate helper / bypass 確認
- path / key / command / status の **実値不変** 確認
- Tauri command name / event name / permission name の **不変** 確認
- Rust visibility が不要に広がっていないことの確認
- circular dependency が増えていないことの確認

### 残存 literal の確認手順

scattered token 共通化後は必ず実行:

```bash
# 旧 literal が token 定義以外に残っていないか
rg "<旧literal>" --type rs --type ts --type vue
# token 定義ファイル以外でヒットしたら未置換
```

### Rust visibility 拡大の確認

```bash
# pub が不要に広がっていないか diff で確認
git diff -- '*.rs' | grep -E '^\+.*\bpub\b'
# 必要最小限であることを目視確認
```

---

## Level 1: 軽量静的チェック (必須)

該当ツールがあれば必ず実行する:

| 言語 | コマンド |
|------|---------|
| Rust | `cargo check` / `cargo clippy -- -D warnings` |
| TypeScript / Vue | `vue-tsc --noEmit` / `eslint .` |
| Flutter / Dart | `dart analyze` / `flutter analyze` |
| すべての言語 | formatter (任意) |

存在確認:

```bash
test -f Cargo.toml         # Rust crate / Tauri backend
test -f package.json       # Vue / TS frontend
test -f pubspec.yaml       # Flutter app
command -v cargo
command -v flutter
```

---

## Level 2: 変更範囲の既存テスト (必須、該当があれば)

変更範囲をカバーする既存テストを実行する:

| 言語 | コマンド (例) |
|------|------------|
| Rust | `cargo test <module>` |
| TypeScript / Vue | `pnpm test <related>` / `vitest run <pattern>` |
| Dart / Flutter | `dart test <related>` / `flutter test test/<pattern>` |

注意:

- **既存テストの追加・修正をしない** (test-expert に委譲)
- 既存テストが落ちた場合は、refactor が挙動を変えてしまった可能性 → revert + 原因調査

---

## Level 3: 統合寄り smoke (必要に応じて)

| 種類 | 例 |
|------|---|
| Tauri command compile 確認 | `cd src-tauri && cargo check` (capability 含む) |
| export / open / save / load smoke | 該当 feature の主要動線を 1 回実行 |
| CLI / command matrix の該当部分 | CLI の代表的 subcommand 1〜2 個 |
| file IO の入出力先確認 | 出力ファイルパス / 内容を grep で確認 |

実施判断:

- 該当 feature が file IO / IPC / external process / Tauri command を含む → 推奨
- pure refactor (型 / 関数の整理のみ) → 省略可

実施できない場合は `residual_risk` に「Level 3 smoke 未実施 (理由)」を明記する。

---

## Level 4: 重い統合検証 (原則委譲)

| 種類 | 例 |
|------|---|
| full build | `cargo build --release` |
| Tauri build | `pnpm tauri build` (重い) |
| E2E | `flutter integration_test` |

refactor-expert は **原則実行しない**:

- 司令官が `allow_level_4: true` を渡した場合のみ実施
- それ以外は dedicated Issue 化 / release-expert / test-expert に委譲

---

## Level 5: 実機 / installer / updater (常に委譲)

- Windows 実機 / macOS 実機 / Linux 実機での確認
- installer / updater の動作確認
- network drive / 日本語パス / UNC path の確認

refactor-expert は **実施しない**。司令官 / release-expert / test-expert / 人間に委譲する。

---

## 検証コマンドの存在確認 → 実行 の前提

検証コマンド実行前に必ず存在確認する。ない場合は失敗ではなく
「検証未実行 (理由: ツール非導入)」として扱い、`verification_not_run` に記録する。

```bash
test -f Cargo.toml         # Rust crate / Tauri backend
test -f package.json       # Vue / TS frontend
test -f pubspec.yaml       # Flutter app
test -d src-tauri          # Tauri v2 アプリ
command -v cargo           # Rust toolchain
command -v flutter         # Flutter SDK
command -v pnpm
command -v dart
```

---

## apply report への記録

apply 完了報告には以下を必ず含める:

```yaml
verification_performed:
  - command: "cargo check"
    result: "passed"
  - command: "vue-tsc --noEmit"
    result: "passed"
  - command: "grep for remaining literals"
    result: "only token definition remains"

verification_not_run:
  - command: "cargo test"
    reason: "no existing tests for this module"
  - command: "tauri build"
    reason: "Heavy integration build; not required for this scoped refactor"

residual_risk:
  - "Manual smoke recommended for report export/open flow"
  - "No unit test exists for path policy contract"
```

---

## Standard Policy 早見表

| Level | refactor-expert | 例外条件 |
|-------|-----------------|---------|
| 0 | 必須 | なし (絶対実施) |
| 1 | 必須 | ツール非導入時のみ skip |
| 2 | 必須 (該当があれば) | 既存テスト 0 件なら verification_not_run |
| 3 | 推奨 (file IO / IPC が絡むなら) | scope_in に明示されていない場合は手順提示のみ |
| 4 | 委譲 | `allow_level_4: true` 明示時のみ実施 |
| 5 | 常に委譲 | 実施しない |

---

## CLAUDE.md 規約との整合

CLAUDE.md の「検証なしの実装は出荷しない」原則を守る。

- Level 0〜2 で実施できなかったものは必ず `verification_not_run` に明記
- 検証不能な箇所は `residual_risk` に記録
- 「たぶん大丈夫」では完了報告しない
