<!--
schema_version: 3
last_breaking_change: 2026-05-08
notes: v1 (2026-05-06) — agent / skill 対応の derived registry を新設。
       agent 名から skill path を機械生成することは禁止。
       v2 (2026-05-06) — runtime canonical 化に合わせて planned 詳細を planned-experts.md に分離、
       frontmatter 優先表現を削除。本ファイルを OP runtime の canonical 正本に昇格。
       v3 (2026-05-08) — Active Experts 表に `Issue post-check` / `Global review` の 2 列を分離し、Runtime Spawn Categories 表と意味を完全一致させた。`refactor-expert` の Issue post-check を `conditional` → `no` に固定 (架構 debt の追跡は marker で個別指定する設計に整理)。`review-expert` の Issue post-check 列を `no` に固定 (Global review 専任の宣言を強化、`<!-- op-post-check-expert: review-expert -->` 禁止を再確認)。
       v3 末尾 (2026-06-15) — Utility Workers 節を additive 追加 (scout を op-report 専用 worker として記録)。schema_version は 3 のまま (新節追加のみ、既存節無変更)。
       v3 末尾 (2026-06-20) — Utility Workers 節に spec-expert を additive 追加 (ADR-0017 W1b、op-spec worker)。schema_version は 3 のまま (Active Experts 表は無変更、scout 追加と同型)。
-->

# Active Expert Registry

This file is the canonical OP runtime registry for active, runtime-spawnable experts.

An OP skill MUST NOT spawn an expert that is absent from this registry.

`agents/*.md` frontmatter remains the mechanical source for agent-to-skill linkage, but it is not by itself sufficient to make an expert runtime-spawnable.

If this registry and agent frontmatter disagree, the mismatch is a contract error and must be resolved explicitly. Do not automatically prefer frontmatter over the registry for runtime spawn eligibility.

/**
 * 機能概要: OP runtime が参照する active expert と、agent ファイル / skill ディレクトリの対応を
 *           1 表で正規化する。命名規則 (`expert-<name>`) は機械生成可能ではないため、
 *           実際のディレクトリ名と agent frontmatter linkage を本表で固定する。
 * 作成意図: `debug-expert → expert-debug`、`designer-expert → expert-design`、
 *           `ux-ui-audit-expert → expert-ux-ui-audit` のように agent 名 → skill 名の変換に
 *           不規則性があるため、runtime / 文書側で「skills/expert-<agent-name>/」のような
 *           推測パスを使うと壊れる。本ファイルを runtime-spawnable expert の canonical 正本
 *           として OP skill 群から参照する。
 * 注意点: planned expert 詳細は本ファイルに残さない。`planned-experts.md` を参照する。
 *         frontmatter とのリンク確認は機械的検証であり、runtime spawn 可否の判定は本 registry が決める。
 */

## Canonical Runtime Spawn Source

This file is the canonical OP runtime source for runtime-spawnable active experts.

An expert is runtime-spawnable by OP skills only when it is listed here and backed by both:

- `agents/<expert>.md`
- `skills/expert-*/SKILL.md`

`agents/*.md` frontmatter remains the mechanical source for checking agent/skill implementation linkage.

This file is the OP runtime registry.

Planned experts are not listed here.
Planned experts belong in:

- `skills/_shared/planned-experts.md`

OP skills MUST NOT spawn an expert that is absent from this registry.

## 命名規則について

agent 名から skill ディレクトリ名を機械生成 (例: `skills/expert-<agent-name>/`) してはならない。
実際の対応は不規則であり、必ず以下の方法で解決する。

1. **Runtime spawn 正本** — 本ファイルの「Active Experts」表を参照する
2. **Agent / skill linkage の機械的確認** — `agents/<agent-name>.md` の frontmatter `skills:` を読む

両者が disagree した場合は contract error として扱い、explicit に解決する (frontmatter を自動的に正とする扱いはしない)。

---

## Active Experts

`agents/<agent>.md` が同梱されており、frontmatter `skills:` で参照される `skills/<skill>/` も同梱されている expert。

| Agent | Agent file | Skill | Skill directory | Runtime apply | Issue post-check | Global review |
|---|---|---|---|---|---|---|
| `debug-expert` | `agents/debug-expert.md` | `expert-debug` | `skills/expert-debug/` | yes | no | no |
| `feature-expert` | `agents/feature-expert.md` | `expert-feature` | `skills/expert-feature/` | yes | no | no |
| `refactor-expert` | `agents/refactor-expert.md` | `expert-refactor` | `skills/expert-refactor/` | yes | no | no |
| `optimize-expert` | `agents/optimize-expert.md` | `expert-optimize` | `skills/expert-optimize/` | yes | no | no |
| `test-expert` | `agents/test-expert.md` | `expert-test` | `skills/expert-test/` | yes | no | no |
| `designer-expert` | `agents/designer-expert.md` | `expert-design` | `skills/expert-design/` | yes | no | no |
| `ux-ui-audit-expert` | `agents/ux-ui-audit-expert.md` | `expert-ux-ui-audit` | `skills/expert-ux-ui-audit/` | no | yes | gate |
| `review-expert` | `agents/review-expert.md` | `expert-review` | `skills/expert-review/` | no | no | yes |
| `security-expert` | `agents/security-expert.md` | `expert-security` | `skills/expert-security/` | yes | yes | specialist |

> **注**:
> - `Runtime apply` は op-run フェーズ2 で `subagent_type` に渡せるか。
> - `Issue post-check` は op-run フェーズ3.5 で発生する Issue 固有の再監査 (元 finding 解消確認 / 別の攻撃面増加チェック等) を担当できるか。
> - `Global review` は op-run フェーズ4 で実施される PR 全体監査を担当できるか。`gate` は op-architect Design Plan gate 担当を意味する (PR 全体監査ではない)。`specialist` は security 観点の specialist として global review に参加することを意味する。
> - `review-expert` は **Global review 専任** であり、`op-post-check-expert` には指定しない (`<!-- op-post-check-expert: review-expert -->` 禁止)。
> - `refactor-expert` は Issue post-check を持たない。架構 debt の追跡は `<!-- op-refactor-debt-key: ... -->` で行い、特定 Issue の post-check が必要な場合は marker で individual に指定する。

## Runtime Spawn Categories

| Expert | Runtime spawn | Apply executor | Post-check | Global review |
|---|---:|---:|---:|---:|
| debug-expert | yes | yes | no | no |
| feature-expert | yes | yes | no | no |
| refactor-expert | yes | yes | no | no |
| optimize-expert | yes | yes | no | no |
| test-expert | yes | yes | no | no |
| designer-expert | yes | yes | no | no |
| ux-ui-audit-expert | yes | no | yes | gate |
| review-expert | yes | no | no | yes |
| security-expert | yes | yes | yes | specialist |

## Planned Experts

Planned experts are defined in:

- `skills/_shared/planned-experts.md`

This registry lists only runtime-spawnable active experts.
Planned expert の runtime rule (spawn 禁止 / fallback destination の扱い / `release-expert` の特例) は
`planned-experts.md` および `runtime-contract.md` を参照すること。

---

## Utility Workers (registry 非追加 / spawn 非対象)

runtime routing テーブル外で特定 OP skill が内部的に spawn する軽量 worker。
`subagent_type` に直接渡すことは active expert の経路 (op-run/op-scan の registry-driven routing) では想定外。
Active / Planned lifecycle 管理外。op-scan / op-patrol / op-run の cluster 化・routing 対象にはならない。

| Agent | Agent file | Skill | Skill directory | 呼び出し元 |
|---|---|---|---|---|
| scout | `agents/scout.md` | expert-scout | `skills/expert-scout/` | op-report |
| spec-expert | agents/spec-expert.md | expert-spec | skills/expert-spec/ | op-spec |

---

## 複雑度感度 (model selection summary)

OP-managed mode で spawn する際の model (Opus / Sonnet / Haiku、具体 version は model-selection.md §1) は、各 expert の
**複雑度感度** によって決まる。本節は summary のみで、mapping table / decision rule の **正本は
`_shared/model-selection.md` (>=1) §5**。

複雑度感度の意味:

- **audit 感度** (op-scan / op-patrol) — 区画 complexity (`single` / `typical` / `complex` / `critical`)
  の上昇に伴って推論深さ要求が増えるか
- **apply 感度** (op-run) — task_complexity (`routine` / `extension` / `design` / `integration` /
  `api-design`) の上昇に伴って推論深さ要求が増えるか

| Expert | audit 感度 | apply 感度 | 補足 |
|---|---|---|---|
| debug-expert | 高 | 高 | 並行性 / spec 解釈 / 根本原因 |
| feature-expert | — | 高 | silent fork 統合 / API 設計 |
| refactor-expert | 高 | 高 | architecture debt / 責務境界 |
| optimize-expert | 高 | 高 | algorithm 改善 |
| test-expert | 低 | 中 | rubric 中心 (audit) / 設計戦略 (apply) |
| designer-expert | 高 | 高 | 全体調和 / 空間認識 — **Haiku 不可** |
| ux-ui-audit-expert | 高 | — | workflow 認知負荷 — **Haiku 不可** |
| review-expert | — | — | global review 専任 (OP-managed mode で常に Opus / Direct Mode は frontmatter)。詳細は `model-selection.md` §6 |
| security-expert | 高 | 高 | attack chain 仮説 |

- 「audit 感度 = 高」の expert は `complex` / `critical` 区画で Opus を推奨
- 「apply 感度 = 高」の expert は `design` / `integration` / `api-design` で Opus を推奨
- 「—」は当該 phase で spawn されない (該当 phase なし)

実 spawn 時の model 決定経路 / override 優先順位 / `--quality` flag の詳細は
`_shared/model-selection.md` (>=1) §5 / §6 / §7 を参照。本 registry は **複雑度感度の summary** のみを
正本として保持し、mapping table の二重定義は行わない (Single Canonical Source Rule)。

---

## 参照経路

本ファイルは以下から参照される (各 OP skill 内では本ファイルへの単一参照を推奨):

- `skills/op-run/SKILL.md` (1-2-d Active Apply Expert Normalization / 4.5-2-fallback)
- `skills/op-scan/SKILL.md`
- `skills/op-patrol/SKILL.md`
- `skills/op-architect/SKILL.md`
- `skills/op-merge/SKILL.md`
- `skills/_shared/expert-spawn.md`
- `skills/_shared/runtime-contract.md`
- `skills/_shared/model-selection.md` (>=1) — 各 expert の audit / apply 感度を summary として持つ
  pointer 関係。mapping table / decision rule の正本は model-selection.md 側

更新ルール:

1. agent を新規追加した場合は `agents/<name>.md` を先に作り、frontmatter `skills:` を埋め、
   skill ディレクトリ `skills/<skill-name>/SKILL.md` を作ってから本ファイルに行を足す。
2. planned → active への昇格時は、`planned-experts.md` から該当エントリを外し、本ファイルの
   Active Experts 表 / Runtime Spawn Categories 表に行を足し、Runtime apply / Post-check 列を埋める。
3. agent 名 / skill 名の rename は本ファイル更新を必須とする。
4. 本ファイルと `agents/*.md` frontmatter が disagree した場合は contract error。explicit に修正する
   (どちらが勝つかの自動規則は持たない)。
