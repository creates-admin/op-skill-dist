# user-capability-preservation.md — User Capability の維持

<!--
機能概要: usable_security.affected_user_capability / legitimate_workflow_preserved / ux_impact の判定基準。
作成意図: 「security finding の修正で何の capability が影響を受けるか」「正当な workflow が維持されるか」を
         構造化して、scan / apply / post-check が同じ判定をできるようにする。
注意点: 本ファイルは「capability 一覧と判定基準」に加えて、apply mode の
       `apply_allowed` / `requires_aux_post_check` 判定マトリクスの正本を兼ねる (apply-policy.md は pointer)。
       mitigation の優先順位 / 禁止される deny は usable-security.md。
       apply の標準フロー / 失敗時の扱い / 許可される修正リストは apply-policy.md。
       OS file picker 経由 path の扱いは file-picker-and-user-selected-path.md。
-->

## affected_user_capability enum

canonical schema 拡張で必須:

```yaml
usable_security:
  affected_user_capability:
    - save_as
    - open_file
    - choose_directory
    - export
    - import
    - external_app_launch
    - batch_processing
```

複数該当する場合は配列で列挙。

| capability | 説明 |
|-----------|------|
| `save_as` | ユーザーが任意 path / 任意ファイル名で保存できる (OS save dialog 経由含む) |
| `open_file` | ユーザーが任意ファイルを開ける (OS open dialog 経由含む) |
| `choose_directory` | ユーザーが任意 directory を選択できる (project workspace / output directory 等) |
| `export` | export 機能 (PDF / IDML / JSON / CSV など他形式への出力) |
| `import` | import 機能 (他形式 → アプリ内データへの取り込み) |
| `external_app_launch` | 外部アプリ連携 (InDesign / Photoshop / Acrobat / explorer / open) |
| `batch_processing` | 複数ファイル / 複数項目の一括処理 |

---

## legitimate_workflow_preserved の判定

### true にできる条件 (すべて満たす)

```text
- 上記 capability のいずれも UI から削除されていない
- 上記 capability の利用に必要な UI ボタン / メニュー / ショートカットが残っている
- 出力先 / 読込元の選択肢を強制的に絞っていない (workspace 配下のみ等)
- capability 全体を disable していない (= mitigation は validation / canonicalize / scope に閉じている)
```

### false にすべきケース

```text
- save_as の UI が削除された
- open_file の UI が削除された
- export / import の UI が削除された
- 外部アプリ連携の UI が削除された
- 出力先が workspace に固定された (save_as の選択肢が消えた)
- 読込元が固定された (open_file の選択肢が消えた)
- capability 全体が disable された
- batch processing 機能が削除された
- これらに対する代替 UX が提供されていない
```

`legitimate_workflow_preserved == false` の apply は **絶対に行わない**。
post-check で `false` を検出したら **BLOCK**。

### 判定の例外

```text
代替 UX が提供されている場合は false にしない:

例: save_as の dialog に追加で「危険な path を検出しました。ユーザー文書 directory に保存しますか?」
    のような選択肢を提示するが、最終的にはユーザーが任意 path に保存できる
    → legitimate_workflow_preserved: true (UX は維持されている)

例: import が完全に削除されたが、新規実装で「安全な import wizard」を提供
    → legitimate_workflow_preserved: true (代替 UX あり)
    ただしこれは UX impact: high なので自動 apply 禁止 (needs_human_decision)
```

---

## ux_impact の判定 (usable-security.md と整合)

| ux_impact | 説明 | 自動 apply 可否 |
|-----------|------|----------------|
| `none` | UI 変更なし。validation / canonicalize / log sanitize のみ | OK |
| `low` | overwrite confirm 等の追加。既存導線維持 | OK |
| `medium` | 中程度の UI 追加 (削除確認 dialog 等) | needs_human_decision (case by case) |
| `high` | 大きな UI 変更 / capability 見直し / auth 再設計 | NG (`needs_human_decision` で必ず停止) |

---

## 判定マトリクス (apply mode)

apply mode で security_risk × ux_impact × legitimate_workflow_preserved の判定:

| security_risk | ux_impact | legitimate_workflow_preserved | apply_allowed | requires_aux_post_check |
|---------------|-----------|------------------------------|---------------|------------------------|
| high | none | true | **true** | false (UX 中立) |
| high | low | true | **true** | true (UI に確認 dialog 追加など) |
| high | medium | true | **needs_human_decision** | — |
| high | high | true | **needs_human_decision** | — |
| any | any | false | **needs_human_decision** | — |
| medium | none | true | true | false |
| medium | low | true | true (case by case) | true |
| medium | medium/high | any | needs_human_decision | — |
| low | any | any | false (apply しない) | — |

**`requires_aux_post_check: true`** にすべきケース:

- save_as / open_file / export / import の UI に新規 confirmation dialog を追加した
- error / warning Toast の文言を大きく変えた
- workflow の step 数が増えた (1 click → 2 click)
- batch processing UI に確認段階を増やした
- focus / keyboard 操作経路に影響しうる UI 変更
- a11y 要素 (aria-label / role / contrast) が変わった

`requires_aux_post_check: false` (= `not_required`) にできるケース:

- backend のみの修正 (UI / WebView 領域に diff なし)
- log / error 文字列の変更 (Toast / dialog 表示しない部分)
- capability JSON / 設定 file 変更 (UI ボタン / メニューに影響なし)
- IPC command の入力 validation 追加 (frontend がエラーを既存 error path で扱う場合)
- Tauri capability 縮小 (実 unused のみ削除、UI から呼ばれない command の削除)

---

## scan / patrol で必ず付与する内容

scan / patrol で security finding を起票する場合、`usable_security` block を必ず以下のように埋める:

```yaml
usable_security:
  affected_user_capability:
    - save_as          # 該当する capability を 1 つ以上列挙
  legitimate_workflow_preserved: true   # 提案する mitigation で workflow が維持されるか
  ux_impact: low                         # mitigation を適用した場合の UX impact
  preferred_mitigation:
    - canonicalize
    - scope
    - confirm
  forbidden_shortcuts:
    - do_not_remove_file_picker
    - do_not_force_fixed_output_directory
```

ここで提案する mitigation で `legitimate_workflow_preserved == true` にできない場合、
**そもそもその修正方針は提案しない**。別の mitigation ladder を選ぶか、別の Issue scope (人間判断必要) として扱う。

---

## post-check で確認する観点 (post-check-policy.md と整合)

```text
観点 7. 正当なユーザー操作が維持されているか
  - PR diff で UI / workflow に変更があったか確認
  - save_as / open_file / export / import / external_app_launch の UI が削除されていないか
  - 出力先 / 読込元の選択肢が強制的に絞られていないか
  - capability 全体 disable されていないか
  - forbidden_shortcuts が守られているか
  - 該当する場合は legitimate_workflow_preserved: false で BLOCK
```

```text
観点 8. UX/UI auxiliary post-check が必要か
  - PR diff で frontend / vue / svelte / react / tsx / vue / scss / css の変更があるか
  - 新規 dialog / Toast / button / menu / keyboard handler 追加があるか
  - 既存 a11y / focus / contrast / aria 属性が変わったか
  - workflow step 数が変わったか (1 click → 2 click)
  - これらが該当する場合は requires_aux_post_check: true で aux_post_check_experts: ux-ui-audit-expert を返す
```

---

## 例: capability 別の典型 finding と mitigation

**共通原則 (全 capability に共通する NG mitigation)**: capability の UI / 導線を削除する、
出力先・読込元を固定する、受け入れ形式を 1 つに縮退させる、といった「capability 自体を犠牲にする」
修正は禁止 (`legitimate_workflow_preserved` の判定基準を参照)。正しい mitigation は常に
validate / canonicalize / scope / confirm / audit の組合せで攻撃経路だけを閉じる。

### 早見表 (残り 4 capability)

| capability | 典型 finding | 正しい mitigation |
|---|---|---|
| `save_as` | path が canonicalize されない / ADS・device path・reserved name (CON/PRN/AUX 等) を reject しない / overwrite 確認がない | validate (extension/reserved/ADS/device path) + canonicalize + confirm (overwrite) + audit |
| `open_file` | project file 内 path を再検証しない (boundary D) | validate (entry name/size/depth/count) + canonicalize + scope |
| `export` | 出力 path に user input をそのまま使う / artifact に secret・production path 混入 | validate + canonicalize + confirm (overwrite) + audit (artifact sanitize) |
| `batch_processing` | 途中エラー時の rollback・部分成功の扱いが曖昧で artifact が不整合状態に | validate + canonicalize + scope + audit (途中失敗時の状態を log) + confirm (大量処理開始前) |

### import に関する finding (代表例)

```text
典型 finding:
  import で外部 file を扱うが parser に size / depth / count limit がない /
  archive extraction で zip-slip / encoding 検査なしで panic

正しい mitigation:
  validate + canonicalize + scope + audit

NG mitigation:
  import 機能を削除する / 受け入れ format を 1 つに固定する (UX 退化)
```

### external_app_launch に関する finding (代表例)

```text
典型 finding:
  shell 文字列連結で外部アプリ起動 (InDesign / Photoshop / Acrobat / explorer / open / xdg-open) /
  COM / ExtendScript で user input を文字列 interpolation /
  起動先 binary が PATH 依存 (任意 binary 起動リスク)

正しい mitigation:
  validate (起動先 binary の trusted path) +
  args 配列で渡す (shell 文字列禁止) +
  audit (output / error sanitize) +
  confirm (起動前確認 - ただし既存導線を壊さない範囲)

NG mitigation:
  外部アプリ連携を全部削除する / InDesign 連携を全部禁止する
```

---

## 司令官 / op-run へのシグナル

apply / post-check で `legitimate_workflow_preserved == false` または `ux_impact == high` を返す場合、
必ず `needs_human_decision` block を併記する (`templates/security-needs-human-decision.md` 参照)。

```yaml
needs_human_decision:
  required: true
  reason: "<UX impact が high のため自動 apply しない / capability 全体禁止が必要なため再設計が必要>"
  decision_type: "usable_security"
  options:
    - id: "A"
      label: "現 UX を維持し、validation だけで攻撃経路を閉じる"
      consequence: "security_risk は残るが UX は壊れない"
    - id: "B"
      label: "UX 破壊を許容して capability 全体を縮小"
      consequence: "security_risk は解消するが import / export 等の UX が失われる"
  recommended_option: "A"
  safest_default: "A"
  blocked_actions:
    - "apply (UX impact: high のため自動実行禁止)"
  can_continue_without_decision: false
  next_safe_action: "<完了報告に blocked として記録し、commit せず終了>"
```
