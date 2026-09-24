# Structure Health

行数ではなく責務混在 / 変更理由の複数化を Issue 化の根拠にする。分割は処理順ではなく責務単位で行う。

<!-- anchor: patrol-sampling -->

## Patrol Sampling 優先度 (op-patrol 経由の巡回対象選定)

repo 全体を均等に見ず risk-weighted に巡回する。

何を探すか:

- 肥大化し続けているファイル
- ゴッド関数 / 巨大 Tauri command / 巨大 Vue component / 巨大 Flutter Widget
- utils / common / helpers のゴミ箱化
- feature 間の依存逆流
- path / key / command / status / token の散乱
- ディレクトリ構造の一貫性崩壊
- architecture_debt の再検出、新規コードによる既存負債の悪化

どこから見るか (優先度高):

- 最近変更されたファイル / 行数が増加傾向のファイル
- import 数・public export が多いファイル
- utils / common / helpers、src-tauri commands、feature boundary
- path / config / IPC / storage / status を含むファイル
- 過去に `architecture_debt` として検出された affected_paths と、新規実装が触った既存 debt 周辺

出力契約は scan と同じ (SKILL.md「Canonical Schema Contract」節)。

---

## God Function

### Detection

- 1 関数内に validation / IO / domain logic / formatting / logging / persistence が混在
- if / match / switch が深く、失敗時分岐と正常処理が絡んでいる
- UI event / path construction / file write / open action まで 1 関数が持つ
- 変更理由が複数ある / テストしたい単位が関数内に埋もれている
- Tauri command が validation / business logic / file IO / serialization を全部持つ

行数の目安 (補助指標のみ): Rust・Dart 50 行超で確認・100 行以上は強く疑う / TypeScript 40 行超で確認・80 行以上は強く疑う。

### Decomposition Policy

処理順 (`step1()` / `step2()` / `step3()`) で切らない。責務単位で切り、各関数の変更理由を単一にする:

```text
validate_input()
resolve_output_path()
build_export_payload()
write_export_file()
open_generated_file()
```

### apply 時の禁止事項

- 関数内関数で「分けたフリ」をしない
- private helper を増やすだけで責務分離していない分割をしない
- public API / シグネチャ、error 種別 / Result 型 / panic 経路を変えない

---

## Large File

### Detection

- 1 ファイルに複数の変更理由がある / 型定義・IO・UI・状態管理・変換処理が同居
- ファイル名と中身の責務が合っていない
- import が広すぎる / public export が多すぎる / テスト対象の単位が見えない
- 少し変えるだけで巨大 diff になる

行数の目安: Rust 300〜500 行で確認・800 行以上は強く疑う / TS・Vue 250〜400 行で確認・600 行以上は強く疑う /
Dart 300〜500 行 (Widget 1 ファイル) / 設定・生成コードは行数で判断しない。

### Apply Policy

- pure function / private helper / type / local module の抽出を優先する
- public API は変えない。import 影響が小さいところから分離する
- Rust で visibility を広げて通すだけの分割は悪化として扱う
- directory 移動を伴う分割は staged_refactor で計画化する

---

## Large Component

### Detection

- 表示・状態・通信・変換・副作用が 1 component に集中 / build・render が巨大
- composable / controller / service に切れる責務が component 内に埋まっている
- UI state と domain state が混ざっている
- file IO / API / Tauri invoke を view component が直接扱う

### 典型分解パターン

```text
Vue 3                         Flutter
<view>.vue        UI・slot    <feature>_page.dart        Widget ツリー
use<feature>.ts   状態        <feature>_view_model.dart  状態 (ChangeNotifier / Bloc)
<feature>Service.ts invoke/API <feature>_repository.dart IO / API
<feature>Adapter.ts 型変換    <feature>_adapter.dart     entity ↔ view model
<feature>.types.ts 型定義     <feature>_models.dart      型定義
```

### 不変則 (component refactor)

- UI 表示の挙動 / visual design / UX flow を変えない
- v-model / props / emit / slot シグネチャを変えない
- key / id / class 命名を変えない (CSS / 自動テストが依存している可能性)
- focus 順序 / tabindex / aria 属性 / 見えるテキストを変えない
  (確認観点は expert-ux-ui-audit skill の `references/a11y-checklist.md`)

---

## Dead Code

### Detection

- active path と紛らわしい古い実装、参照されていない helper / module
- 旧 path / 旧 command / 旧 status が生きているように見える
- 新規実装時に誤って再利用される可能性がある

### Removal Policy

即削除を標準としない。以下をすべて満たす場合のみ削除してよい:

- static reference が存在しない (grep で確認)
- dynamic entrypoint / public export ではない
- command / route / IPC / migration / compatibility fallback ではない
- test fixture / sample / generated code ではない
- 削除後の check / test が通る

不明なら `architecture_debt` か `needs_human_decision` で返す。

### 静的 grep で参照を検出できない誤判定パターン

- 動的 import / lazy load (`import()` / `defineAsyncComponent`)
- Tauri capability で許可されているが UI からは使われていない (CLI / debug 用)
- migration / compatibility fallback、テストからのみの参照
- generated code / proto / rpc 経由、reflection / runtime dispatch

削除前に README / CHANGELOG、最近の commit message (「保留」「互換性のため」等)、Tauri capability / permission JSON、migration script を確認する。
