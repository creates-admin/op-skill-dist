<!--
schema_version: 2
last_breaking_change: 2026-05-07
notes: v2 (2026-05-07) — apply/fix・post-check runtime resolution の戻り値 (内部 enum) と
       GitHub label を分離。内部処理は snake_case の `needs_human_decision` を正本とし、
       GitHub に渡す段階のみ `needs:human-decision` (colon, label form) に変換する。
       merge-blocking state list は op-merge が読む GitHub label 文脈のため label 形式
       のまま据え置き。新規セクション §3-C で internal enum ↔ GitHub label の対応表を追加。
       v1 (2026-05-06) — OP runtime 全体の共有境界 (active/planned expert 区別、
       runtime spawn rule、apply/post-check resolution の分離、routing metadata の
       実行権限化禁止、merge-blocking state の共通カテゴリ) を 1 ファイルに集約した
       新設正本。各 OP skill 個別の手順は移していない。共有契約・名称・境界のみ。
-->

# Runtime Contract

/**
 * 機能概要: OP runtime 全体で共有される境界契約 (どこからどの expert を spawn してよいか、
 *           marker は実行権限ではないこと、apply/fix と post-check の resolution が別レイヤーで
 *           あること、merge を block しうる状態の共通分類) を 1 箇所で定義する正本。
 * 作成意図: 従来は op-scan / op-patrol / op-run / op-merge の各 SKILL.md に類似の境界規則が
 *           散在しており、planned expert を spawn 対象として扱わない・marker を spawn 認可と
 *           誤読しない、といった不変則の単一根拠が無かった。本ファイルを単一正本にして、
 *           各 OP skill 側からは pointer 参照に降格させる。
 * 注意点: 本ファイルは shared boundary のみを定義する。op-run の具体フロー、marker 詳細 schema、
 *         active expert 一覧表、planned expert 個別詳細は本ファイルには書かない (それぞれの
 *         正本側に置く)。破壊的変更時は schema_version を bump し、`_shared/version-check.md`
 *         の段階移行プロトコルに従うこと。
 */

This document defines shared runtime boundary rules for OP skills.

This file is canonical for:

- runtime spawn boundary,
- active/planned expert separation,
- routing metadata interpretation,
- no-apply expert restrictions,
- scan-time / patrol-time / apply-fix spawn separation,
- shared merge-blocking state categories.

Concrete OP skill procedures remain in each OP skill file.
This document defines only shared contracts, names, and boundaries.

---

## 1. Canonical Sources

OP runtime の解釈に用いる正本は以下に固定する。本ファイルから列挙された個別正本へ
pointer で降りる構造であり、列挙先を二重管理しない。

- `skills/_shared/active-expert-registry.md`
  - runtime-spawnable active expert registry
- `skills/_shared/planned-experts.md`
  - planned / not-yet-runtime-spawnable expert registry
- `skills/_shared/markers/labels-and-markers.md`
  - marker names, label names, ownership, core semantics
- `skills/_shared/model-selection.md`
  - model selection rules (Phase × Expert × complexity → Opus / Sonnet / Haiku、具体 version は model-selection.md §1),
    task_complexity / area complexity 区分, override 優先順位, `--quality` flag 仕様
- `skills/_shared/op-config-schema.md`
  - `op-config.yaml` schema (complexity_thresholds / domain_tags / model_overrides / quality_defaults)

矛盾時の扱い。

```md
If another file conflicts with these documents, the `_shared` canonical files win for OP runtime interpretation.
```

---

## 2. Active Registry and Agent Frontmatter Relationship

agent ファイル frontmatter と active-expert-registry.md は責務が異なる。両者を混同して
「frontmatter に skill が書いてあるから runtime spawn 可」と推論してはならない。

- `agents/*.md` frontmatter
  - mechanical implementation/skill linkage source
- `active-expert-registry.md`
  - OP runtime-spawnable active expert registry
- `planned-experts.md`
  - planned / not-yet-runtime-spawnable registry

重要文。

```md
If frontmatter and `active-expert-registry.md` conflict, OP skills **MUST** treat it as a contract error and stop. OP skills MUST NOT auto-resolve, and MUST NOT prefer frontmatter over the registry. Human intervention is required to reconcile.
OP skills must not infer runtime spawn eligibility from frontmatter alone.
```

OP skills は自動解決せず、registry と frontmatter の不一致は contract error として停止し、人間の修正を要求する。frontmatter を runtime routing の正本として扱ってはならない。

---

## 3. Runtime Spawn Rule

expert を spawn する OP skill は、spawn 直前に共有契約で resolution を行う。

- expert を spawn する OP skill は、spawn 前に共有契約で解決する。
- `active-expert-registry.md` にいない expert は spawn 禁止。
- Issue / PR marker は routing metadata であり spawn authorization ではない。

ただし spawn 解決の戻り値は **apply/fix 用と post-check 用で別**である。共通結果として
一括にせず、本ファイルでは次節 3-A / 3-B で分離する。

---

### 3-A. Apply / Fix Runtime Resolution

apply / fix runtime resolution の **戻り値は内部 enum** であり、以下のいずれかを返さな
ければならない。GitHub label への変換は label boundary (Issue / PR / コメントへの
label 付与時) でのみ行い、内部関数・dispatch・sentinel 比較は snake_case の enum を
そのまま使う。internal enum と GitHub label の対応は §3-C を参照。

- `skills/_shared/active-expert-registry.md` にある active expert
- `needs_human_decision` (内部 enum。label 変換規約は §3-C)
- abort / safe no-op

apply / fix runtime resolution は以下を返してはならない。

- planned expert を spawn target として返す
- planned-skip marker を「apply 成功」として返す
- unregistered expert を spawn target として返す

重要文。

```md
A planned-skip marker is not a valid apply/fix resolution outcome.
Apply/fix execution must either run an active expert, escalate to needs_human_decision (internal enum; rendered as the GitHub label `needs:human-decision` only at the label boundary), or abort.
```

---

### 3-B. Post-check Runtime Resolution

post-check runtime resolution の **戻り値も内部 enum** であり、以下のいずれかを返してよい。
GitHub label への変換は §3-A と同様に label boundary でのみ行う。

- active post-check expert (`active-expert-registry.md` の Post-check 列が yes / conditional / specialist のもの)
- `null` (post-check 不要が明示されている場合)
- documented planned-skip marker (planned post-check expert が指定された場合)
- `needs_human_decision` (内部 enum。label 変換規約は §3-C)
- abort / safe no-op

planned-skip marker が valid となる条件。

```md
A planned-skip marker is valid only when:

- the requested post-check expert is unavailable or planned,
- the skip is explicitly recorded with the responsible marker (e.g. `op-planned-post-check-skipped`),
- the skip does not pretend that validation occurred,
- downstream merge gates can distinguish skipped validation from successful validation.
```

---

### 3-C. Internal Enum vs GitHub Label

apply/fix・post-check runtime resolution は **内部処理は snake_case の enum を正本** とし、
GitHub に渡す段階 (Issue / PR / コメントへの label 付与時) のみ colon 区切りの label 形式
に変換する。逆方向 (GitHub label を関数戻り値や dispatch key としてそのまま使う) は禁止。

| Internal enum (関数戻り値・dispatch・内部分岐) | GitHub label (Issue / PR ラベル付与時) |
|---|---|
| `needs_human_decision` | `needs:human-decision` |

OP skill 実装での運用ルール。

- 関数戻り値・switch / dispatch table のキー・sentinel 比較は snake_case enum を使う。
- GitHub API でラベルを付ける直前で `enum_to_label()` 相当の boundary 変換を 1 箇所行う。
- 既存の GitHub label を読み取って分岐する場合も、boundary で snake_case enum に正規化してから内部処理に渡す。

merge-blocking state list (§11) は op-merge が GitHub label を直接読む文脈のため、`needs:human-decision`
の colon 形式のまま据え置く。これは label boundary のすぐ外側で読まれる仕様であり、
内部 enum 用途ではない。

---

## 4. Runtime Owner Rule

各 OP skill は spawn の owner を以下のように分担する。

- `op-scan`: scan-time expert spawn を解決
- `op-patrol`: patrol-time expert spawn を解決
- `op-run`: apply/fix expert spawn を解決
- `op-merge`: review / gate-related expert usage を解決する場合がある

重要文。

```md
Issue markers and PR markers are routing metadata.
They do not authorize another OP skill's later spawn.

In particular, `op-run` owns final apply/fix runtime spawn resolution even when the requested expert came from `op-scan` or `op-patrol` metadata.
```

---

## 5. Spawn Context Separation

spawn context は別物であり、文脈をまたいで権限を継承しない。

- scan-time spawn: `op-scan` が読み取り専用 audit 目的で expert を spawn する文脈。
- patrol-time spawn: `op-patrol` が巡回監査目的で expert を spawn する文脈。
- apply/fix spawn: `op-run` が修正適用目的で expert を spawn する文脈。
- review/gate usage: `op-merge` / `review-expert` が merge gate 判定に expert を用いる文脈。
- marker emission: 上記いずれかの文脈で Issue / PR / コメントに hidden marker を残す行為。

重要文。

```md
A marker emitted in one context must not be treated as authorization in another.
```

---

## 6. Planned Expert Rule

planned expert は以下に出てよい。

- roadmap notes
- architecture discussions
- future design documents
- Issue routing metadata
- PR explanatory metadata
- planned-skip markers

ただし runtime spawn target にはできない。planned expert は `subagent_type` / `Agent({...})`
等の spawn 引数として渡してはならず、apply/fix の fallback destination としても使えない。
個別 expert ごとの詳細は `skills/_shared/planned-experts.md` を参照する。

---

## 7. Unregistered Expert Rule

`active-expert-registry.md` にも `planned-experts.md` にもない expert は runtime spawn invalid
とする。invalid な要求が来た場合に許可される処理は次の 3 つのみ (内部 enum 用途)。

- explicit mapping による active expert への normalize
- `needs_human_decision` (内部 enum。label 変換規約は §3-C)
- clear contract error で abort

unregistered expert を黙って active expert に置換することは許されない。normalize する場合は
mapping 元と mapping 先を記録する (詳細は §10)。

---

## 8. No-Apply Rule

advisory 専用 / no-apply の expert は apply/fix executor にできない。apply/fix runtime
resolution が no-apply expert を spawn target として要求された場合、以下のいずれかに
normalize しなければならない (内部 enum 用途)。

- active apply expert
- `needs_human_decision` (内部 enum。label 変換規約は §3-C)
- documented advisory-only path

no-apply expert に直接 commit / push を行わせる経路は禁止する。

---

## 9. Routing Metadata Rule

以下はすべて routing metadata であり、それ自体は実行権限ではない。

- Issue markers
- PR markers
- cluster annotations
- roadmap notes
- suggested expert names in scan findings
- `recommended_expert`
- `op-run-expert`
- `op-post-check-expert`
- `op-scan-expert`

これらは下流の OP skill が runtime resolution を行うためのヒントであり、OP skill 側で
§3-A / §3-B / §6 / §7 / §8 を適用したうえで spawn 可否を再判定する。

---

## 10. Reclassification Metadata Rule

reclassification (例: `release-expert` → `debug-expert` への振替) は schema field を
主とする。

- `reclassified_from`
- `reclassified_to`
- `reclassification_reason`

PR hidden marker (`<!-- op-reclassified-from: ... -->` 等) を併記する場合、それは schema
field の mirror であり、第二正本にしてはならない。schema field と PR marker が矛盾した
場合は schema field が勝つ。

---

## 11. Merge-Blocking State Categories

以下の状態は potentially merge-blocking として扱う。op-merge / review gate は本リストに
照らして単独でマージしない。本リストは op-merge が GitHub label を直接読み取る文脈の
ため、`needs:human-decision` は colon 区切りの label 形式で記述する (§3-C の内部 enum
ではない)。

- unresolved conflict
- failed required verification
- `pro-review-blocked`
- `needs-specialist-review`
- unresolved unsafe `needs:human-decision`
- missing required global review approval
- unresolved security block
- unresolved post-check block

`op-planned-post-check-skipped` は単体 block ではない。これは「planned expert が原因で
post-check を実施できなかった」ことの記録であり、merge 可否は §3-B の planned-skip
valid 条件と上記 block list の組み合わせで判定する。
