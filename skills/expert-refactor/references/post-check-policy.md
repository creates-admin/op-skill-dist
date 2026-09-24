# Post-check Policy

## 許容値

refactor finding の `post_check_expert` は以下 3 値のみ (op-run の post-check dispatcher が処理するのはこの 3 値):

```text
ux-ui-audit-expert
security-expert
null
```

`env-expert` / `compatibility-expert` / `release-expert` / `designer-expert` / `test-expert` / `review-expert` / `spec-expert` は指定しない。
必要な follow-up 検証は「post-check に乗せられない検証要件の逃がし先」へ。

## 標準値: null

- 単一 feature 内の god function 分解
- 単一 feature 内の scattered token (UI 表示や file IO に絡まないもの)
- pure な型 / 関数の整理、import 並び替え / utils 再配置
- UI 表示にも file IO / shell / permission にも触れない構造整理

## ux-ui-audit-expert を選ぶ条件

- UI state (loading / error / empty / success) の表示変更
- user flow (画面遷移 / 操作導線) に影響する component 分割
- recovery (undo / cancel / 復帰) を含む component 整理
- a11y (focus / aria / contrast / keyboard) に影響する変更
- visual に見える component の分割 / 統合

## security-expert を選ぶ条件

security surface が実際に変わるかで判定する:

```text
入力源が外部 (user / IPC / network) から file path を組み立てる → security-expert
canonicalization / root 制限 / `..` rejection / extension 制限に触る → security-expert
Tauri capability / permission / shell / updater / secret に触る → security-expert
file write / delete / open の許可範囲が変わり得る → security-expert
secret / token / credential を扱う path / config の整理 → security-expert
それ以外 → null
```

### security-expert を選ばないケース

feature-local path literal の定数化、同一 feature 内の固定 string の inventory 化、入力源・出力先・許可範囲が変わらない path helper 抽出、
I/O surface が変わらない構造整理は `null`。gotchas に「path_values_changed=false / permission_unchanged=true を検証済み」を 1 行書き、apply 時の自己検証で完結させる。

## post-check に乗せられない検証要件の逃がし先

1. `gotchas` に書く (例: `"Compatibility lens 重点確認: serialized format に近接、migration 整合確認"`)
2. apply report の `recommended_followup_experts` に書く (`post_check_expert` とは別フィールド):
   ```json
   "recommended_followup_experts": [
     { "expert": "test-expert", "reason": "god function を 5 関数に分解したが既存テストが 1 本のみ", "scope": "follow-up Issue" }
   ]
   ```
3. Issue / PR 本文の Refactor Execution Control 節の `forbidden_stage_actions` / `gotchas`
4. global review (review-expert の 7 lens) に任せる

## ラベル対応

| post_check_expert | ラベル |
|---|---|
| `null` | `pro-refactor-expert` |
| `security-expert` | `pro-refactor-expert` + `pro-security-expert` |
| `ux-ui-audit-expert` | `pro-refactor-expert` + `pro-ux-ui-audit-expert` |

ラベル付与は op-scan / op-patrol が行う。`pro-compatibility-expert` / `pro-release-expert` / `pro-test-expert` / `pro-designer-expert` は付けない。

## 複数 post-check が必要に見えるケース → Issue 分割

例: file IO の path policy 整理 (security) + UI 状態の文言整理 (ux-ui) は 1 Issue にまとめず、
`scope_in: src-tauri/src/path_policy/` (security-expert) と `scope_in: src/features/<feature>/ui/` (ux-ui-audit-expert) の 2 Issue に分け、
gotchas に分割理由を書く。
