# Post-check Policy

<!--
機能概要: refactor finding における post_check_expert の許容値と選択基準を定義する。
作成意図: op-run フェーズ3.5 の post-check dispatcher は ux-ui-audit-expert /
         security-expert / null の 3 値しか処理しない。dispatcher と Issue marker
         の許容値を一致させ、配線不整合を防ぐ。
注意点: 検証要件はあるが post-check に乗せられない expert (test / compatibility /
       release / designer) については、gotchas / recommended_followup_expert /
       Refactor Execution Control 節に逃がす。Phase 1 では拡張しない。
-->

## 現行の許容値 (硬い制限)

**refactor domain 限定の制約として**、refactor-expert が返してよい `post_check_expert` の値は
**以下 3 値のみ**:

```text
ux-ui-audit-expert      # op-run フェーズ3.5-A で active dispatch
security-expert         # op-run フェーズ3.5-B で active dispatch (Phase 2 で正式有効化済み)
null                    # post-check 不要
```

これ以外の値を返してはいけない。理由:

- op-run フェーズ3.5 の post-check dispatcher は上記 3 値しか処理しない
  (`skills/op-run/SKILL.md` フェーズ3.5)
- それ以外の値を hidden marker に書いても dispatcher 経路が無く、silent skip になる

> **重要 (Phase 2 以降の動作)**: `security-expert` は **active dispatch** であり、
> file IO / path traversal / permission / credential / network / deserialization / command execution
> 周辺の refactor では `post_check_expert: security-expert` を必ず指定する
> (silent merge gate stall は発生しない)。例外条件と理由は本ドキュメント下部
> 「security-expert を **選ばない** ケース」節 (正本) を参照。

> **注意 — `_shared/pr-templates.md` の marker enum 全体について**: pr-templates.md の
> `<!-- op-post-check-expert: ... -->` marker enum は **他 domain (env など) も含む全 domain 共通**
> のものであり、`env-expert` 等の値も列挙されている (op-run dispatcher 側で domain ごとに処理)。
> 本 3 値制限は **refactor domain finding に限定** された、より厳しい制約である。
> refactor finding では `env-expert` / `compatibility-expert` / `release-expert` /
> `designer-expert` / `test-expert` を post_check_expert に指定しない (Phase 1)。
> 必要な follow-up 検証は `recommended_followup_experts` に逃がす。

将来 Phase 2 以降で `compatibility-expert` / `release-expert` / `test-expert` /
`designer-expert` を post-check に正式追加する場合は、
**op-run フェーズ3.5 への dispatcher 追加 + pr-templates の marker 許容値拡大 +
op-merge gate 拡張 + stale 判定 + ラベル追加** をすべて済ませてから本ドキュメントを更新する。

---

## 標準値

通常の小規模 refactor は `post_check_expert: null` とする。

`null` を選ぶケース:

- 単一 feature 内の god function 分解
- 単一 feature 内の scattered token (UI 表示や file IO に絡まないもの)
- pure な型 / 関数の整理
- import 並び替え / utils 再配置
- 構造的に整理したが、UI 表示にも file IO / shell / permission にも触れない

---

## ux-ui-audit-expert を選ぶ条件

以下に絡む場合 (op-run フェーズ3.5-A が再監査):

- UI state (loading / error / empty / success) の表示変更
- user flow (画面遷移 / 操作導線) に影響する component 分割
- recovery (復帰可能性 / undo / cancel) を含む component 整理
- a11y (focus / aria / contrast / keyboard navigation) に影響する変更
- visual に見える component の分割 / 統合

`pro-ux-ui-audit-expert` ラベルを併せて付与する。

---

## security-expert を選ぶ条件

以下のいずれかに該当する場合 (op-run フェーズ3.5-B が再監査):

- **user input / IPC payload / external input から file path が組み立てられる**
  refactor (path 構築の入力源が外部にある)
- **canonicalization / root 制限 / `..` rejection / extension 制限** に触る refactor
- **Tauri capability / permission / shell / updater / secret** に触る refactor
- **file write / delete / open の許可範囲** が変わり得る refactor
- secret / token / credential を扱う path / config の整理

`pro-security-expert` ラベルを併せて付与する。

### security-expert を **選ばない** ケース (post_check_expert: null で良い)

以下に該当し、上記条件のいずれにも触れない場合は `post_check_expert: null` とする。
gotchas に「**path_values_changed=false / permission_unchanged=true** を検証済み」を
1 行明記して、post-check ではなく apply 時の自己検証で完結させる。

- 単なる feature-local path literal の定数化 / 共通化 (実値・root・permission・入力検証に触らない)
- 同一 feature 内の固定 string / 定数の inventory 化
- 同一 file 内の path helper 抽出で、**入力源・出力先・許可範囲が変わらない**もの
- 構造整理 (関数分解 / モジュール内 import 整理) で、I/O surface が変わらないもの

> 理由: `security-expert` は Phase 2 で active 化済みで、op-run フェーズ3.5-B (Security
> Post-check) は **正式 spawn される**。したがって post_check_expert を指定するかどうかの
> 判定は **「security surface が実際に変わるか」** ベースで行う。
> security surface (入力源 / canonicalization / permission / capability / shell / updater /
> secret / file write・delete・open の許可範囲) が変わらない単純な定数化まで
> security-expert に寄せると、Phase 2 でも post-check の対象が広がりすぎてレビュー負荷が
> 上がるだけで、検出対象に届かない。
> 上記 4 条件 (path_values_changed=false / permission_unchanged=true /
> 入力源不変 / 許可範囲不変) を gotchas と apply report の自己検証で明示できる
> 単純な refactor は `null` を選ぶ。

判定の指針 (security surface が動くか):

```text
入力源が外部 (user / IPC / network) → security-expert
permission / capability / canonicalization に触る → security-expert
shell / updater / secret に触る → security-expert
file write / delete / open の許可範囲が変わり得る → security-expert
それ以外 (feature-local 定数化、入力源・許可範囲・実値が変わらない) → null + gotchas 記載
```

---

## post-check に乗せられない検証要件の逃がし先

以下のような **post-check ではないが follow-up 検証が必要な** ケースは、
`post_check_expert` に specialist を入れず、別経路で記録する。

### 1. gotchas に明記する

scan finding の `gotchas` フィールドに記録し、apply 時に意識させる。

```json
"gotchas": [
  "Compatibility lens 重点確認: serialized format に近接、変更時は migration 整合確認",
  "Test follow-up 推奨: 既存テストが薄いため test-expert への Issue 起票を検討"
]
```

### 2. apply report の recommended_followup_expert で記録する

`post_check_expert` とは **別フィールド** として apply report に含める:

```json
{
  "recommended_post_check_expert": null,
  "recommended_followup_experts": [
    {
      "expert": "test-expert",
      "reason": "god function を 5 関数に分解したが、既存テストが 1 本しかない。回帰テスト整備を別 Issue で",
      "scope": "follow-up Issue として op-scan --include-test または直接起票"
    },
    {
      "expert": "compatibility-expert",
      "reason": "config key の格納場所を整理した。他バージョンとの互換性は migration 観点での確認推奨",
      "scope": "global review (review-expert) の Compatibility Lens で扱う"
    }
  ]
}
```

### 3. Refactor Execution Control 節で残存リスクとして記録する

Issue / PR 本文の Refactor Execution Control 節 (`_shared/pr-templates.md` 参照)
内の `forbidden_stage_actions` / `gotchas` に明記する。

### 4. global review (review-expert) の lens で扱う

`review-expert` はフェーズ4 で 7 lens (Security/Abuse, Workflow/UX, Test, Compatibility,
Release, Spec, Refactor) を回す。post-check に乗らない検証は global review の該当 lens に
任せるのが Phase 1 の正規ルートとなる。

---

## post_check_expert マーカーの記録

op-scan / op-patrol が Issue 起票する際の hidden marker:

```markdown
<!-- op-domain: refactor -->
<!-- op-scan-expert: refactor-expert -->
<!-- op-run-expert: refactor-expert -->
<!-- op-post-check-expert: <ux-ui-audit-expert | security-expert | null> -->
```

`null` の場合も marker は **必ず出力** し、値を `null` にする。
canonical schema の `post_check_expert` field と完全一致させる。

---

## ラベル付与 (正本)

ラベル名・色・core semantics の正本は `skills/_shared/markers/labels-and-markers.md`。
本節は refactor domain 固有の **post_check_expert → pro-* 対応表** のみを正本として持つ
(architecture-debt.md の Labels 節はここを参照する):

| post_check_expert | 追加するラベル |
|-------------------|-------------|
| `null` | (refactor 標準ラベルのみ: `pro-refactor-expert`) |
| `security-expert` | `pro-refactor-expert` + `pro-security-expert` |
| `ux-ui-audit-expert` | `pro-refactor-expert` + `pro-ux-ui-audit-expert` |

apply 担当の `pro-refactor-expert` は **必ず** 付与する。

`pro-compatibility-expert` / `pro-release-expert` / `pro-test-expert` / `pro-designer-expert`
は refactor finding の post-check ラベルとして **付与しない** (Phase 1)。

---

## Red-team / Global Review Boundary

refactor-expert は、**review-expert を post_check_expert に指定しない**。

review-expert は以下で起動する:

- op-merge の global review gate
- 高リスク PR の独立レビュー
- security / compatibility / release / broad refactor を含む merge 前確認
- 司令官が明示した場合

`<!-- op-post-check-expert: review-expert -->` 指定は禁止。

---

## planned expert の取扱い

`compatibility-expert` / `release-expert` / `env-expert` 等が未実装 (planned expert) の場合の挙動は
`_shared/expert-spawn.md` の Planned Expert Notice に従う。`spec-expert` は active 化済だが op-spec 専用
Utility Worker (op-run routing 対象外 / post-check capability なし) のため、同じく post_check_expert にはしない。

refactor-expert はこれら planned expert / op-run 非対象 Utility Worker を **post_check_expert に書き込まない** (Phase 1)。
将来 active 化 (post-check capability 付き) された expert が増えたら本ドキュメントを更新する。

---

## 複数 post-check が必要に見えるケース → Issue 分割

例: file IO の path policy 整理 (security 必要) + UI 状態の文言整理 (ux-ui 必要)

→ 1 Issue にまとめず、2 つに分割する:

```text
Issue A: src-tauri 側の path policy 整理
  bulk_group: refactor-scattered-tokens
  subtype: paths
  post_check_expert: security-expert
  scope_in: src-tauri/src/path_policy/

Issue B: UI 側の status 文言整理
  bulk_group: refactor-scattered-tokens
  subtype: status_values
  post_check_expert: ux-ui-audit-expert
  scope_in: src/features/<feature>/ui/
```

`gotchas` に「複数 post-check 必要のため Issue を分割した」と記録する。

---

## 早見表

```text
finding に security 観点 (file IO / shell / permission / secret) → security-expert
finding に UI 観点 (state / flow / recovery / a11y) → ux-ui-audit-expert
両方必要 → Issue 分割
それ以外で検証 follow-up 必要 → gotchas + recommended_followup_experts に記録
それ以外 → null
```
