# Structure Health

<!--
機能概要: god function / large file / large component / dead code の検出基準と
         分解 / 整理 policy を集約する。
作成意図: 行数だけで判断するのではなく、責務混在 / 変更理由の複数化を
         Issue 化の根拠にする。分割は処理順ではなく責務単位で行う。
注意点: 巨大 component の分割で UI / UX flow を変えない。Rust では
       visibility を広げて通すだけの分割を「悪化」として扱う。
-->

## God Function

### Detection (High として検出する条件)

- 1 関数内に validation / IO / domain logic / formatting / logging / persistence が混在
- if / match / switch が深く、失敗時分岐と正常処理が絡んでいる
- UI event / path construction / file write / open action まで 1 関数が持つ
- **変更理由が複数** ある
- テストしたい単位が関数内に埋もれている
- Tauri command が validation / business logic / file IO / serialization を全部持つ

### 行数の目安 (補助指標)

```text
Rust:        50 行超で確認、100 行以上は強く疑う
TypeScript:  40 行超で確認、80 行以上は強く疑う
Dart:        50 行超で確認、100 行以上は強く疑う
```

ただし行数だけでは Issue 化しない。**責務混在** が根拠。

### Decomposition Policy

#### 悪い分割 (処理順での切り分け)

```text
step1()
step2()
step3()
```

- 処理順は元の関数の中身を眺めれば分かる情報なので、分けても理解の助けにならない
- 変更理由が同じ部分が複数 step に散る

#### 良い分割 (責務単位での切り分け)

```text
validate_input()
resolve_output_path()
build_export_payload()
write_export_file()
open_generated_file()
```

- 各関数の **変更理由が単一** になる
- テスト可能な単位になる
- 関数名から責務が読み取れる

### apply 時の禁止事項

- 関数内関数で「分けたフリ」をしない (CLAUDE.md 規約: 関数内関数は原則禁止)
- private helper を増やすだけで責務分離していない分割をしない
- public API / シグネチャを変更しない
- error 種別 / Result 型 / panic 経路を変えない

---

## Large File

### Detection

- 1 ファイルに **複数の変更理由** がある
- 型定義、IO、UI、状態管理、変換処理が同居している
- ファイル名と中身の責務が合っていない
- import が広すぎる
- public export が多すぎる
- テスト対象の単位が見えない
- 少し変えるだけで巨大 diff になる

### 行数の目安 (補助指標)

```text
Rust:                300〜500 行で確認、800 行以上は強く疑う
TypeScript / Vue:    250〜400 行で確認、600 行以上は強く疑う
Flutter / Dart:      300〜500 行で確認 (Widget 1 ファイル)
設定 / 生成コード:    行数だけでは判断しない
```

### Apply Policy

- まず **pure function / private helper / type / local module** の抽出を優先する
- public API は変えない
- import 影響が小さいところから分離する
- Rust では visibility を広げて通すだけの分割を **避ける** (悪化として扱う)
- ファイル分割が directory 移動を伴う場合は staged_refactor で計画化する

---

## Large Component

### Detection

- 表示、状態、通信、変換、副作用が 1 component に集中
- build / render が巨大
- composable / controller / service に切れる責務が component 内に埋まっている
- UI state と domain state が混ざっている
- file IO / API / Tauri invoke を view component が直接扱う

### Vue 3 の典型分解パターン

```text
<view>.vue              UI 表示・slot
use<feature>.ts         状態 (composable)
<feature>Service.ts     Tauri invoke / API 呼び出し
<feature>Adapter.ts     domain 型 ↔ UI 型変換
<feature>.types.ts      型定義
```

### Flutter の典型分解パターン

```text
<feature>_page.dart        Widget ツリー
<feature>_view_model.dart  状態 (ChangeNotifier / Bloc)
<feature>_repository.dart  IO / API
<feature>_adapter.dart     entity ↔ view model 変換
<feature>_models.dart      型定義
```

### Apply Policy

- view / state / adapter / service の責務を分ける
- UI 表示の挙動は **変えない**
- DOM 構造 / props / emit / key / focus / state を不用意に変えない
- visual design を変更しない
- UX flow を変更しない

### 不変則 (component refactor)

- v-model / props / emit / slot シグネチャは変更しない
- key / id / class 命名は変更しない (CSS / 自動テストが依存している可能性)
- focus 順序 / tabindex を変えない
- aria 属性を変えない
- 見えるテキストを変えない

---

## Dead Code

### Detection

- active path と紛らわしい古い実装が残っている
- 参照されていない helper / module が残っている
- 旧 path / 旧 command / 旧 status が生きているように見える
- 新規実装時に **誤って再利用される** 可能性がある

### Removal Policy

refactor-expert は、dead code を検出しても **即削除を標準としない**。

#### 削除してよい条件 (すべて満たす場合のみ)

- static reference が **存在しない** (grep で確認)
- dynamic entrypoint **ではない**
- public export **ではない**
- command / route / IPC / migration / compatibility fallback **ではない**
- test fixture / sample / generated code **ではない**
- 削除後の check / test が通る

#### 不明な場合の扱い

- `architecture_debt` として記録する
- または `needs_human_decision` として返す
- 勢いで削除しない

### よくある誤判定パターン

- 動的 import / lazy load されている (`import()` / `defineAsyncComponent`)
- Tauri capability で許可されているが UI からは使われていない (CLI / debug 用)
- migration / compatibility fallback として残されている
- テストからのみ参照されている
- generated code / proto / rpc 経由で参照されている
- reflection / runtime dispatch されている

これらは **静的 grep では参照を検出できない** ため、削除前に必ず以下を確認する:

- README / CHANGELOG に言及があるか
- recent commit message に「保留」「互換性のため」等の言及があるか
- Tauri capability / permission JSON で参照されているか
- migration script から参照されているか
