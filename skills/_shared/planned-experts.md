<!--
schema_version: 3
last_breaking_change: 2026-06-20
notes: v1 (2026-05-06) — planned expert (env / release / compatibility / spec) の正本を新設。
       agent / skill 実体を持たないため runtime spawn 禁止。本ファイルは planned expert names /
       purpose / runtime spawn prohibition / current substitutes / allowed metadata usage /
       runtime normalization requirement の単一正本。active expert は
       `skills/_shared/active-expert-registry.md` を参照。
       2026-05-07 — Roadmap-only planned experts 節を新設し `docs-expert` / `ops-expert` を
       runtime-non-spawnable として明示登録した。あわせて OP skill 名 (`op-doctor` / `op-cleanup` /
       `op-triage` / `op-release`) は expert ではなく OP skill namespace である旨を section 化して、
       roadmap で見かけた名前が runtime-contract §7 (unregistered → invalid spawn) に対して
       明示拒否扱いになるよう範囲を揃えた。
       v2 (2026-05-08) — env-expert Allowed metadata に `<!-- op-scan-expert: env-expert -->` を追加 (op-scan / op-patrol 既存出力との整合)。substitute / Hard rule / roadmap-only セクションの `needs:human-decision` (label 形式) を internal enum `needs_human_decision` に統一し、label 境界での変換規約 (`runtime-contract.md` §3-C) と整合させた。
       v3 (2026-06-20) — spec-expert 節を削除 (active-expert-registry.md の Utility Workers へ昇格。ADR-0017 W1b)。
       既存セクション削除のため breaking change として schema_version を bump。planned expert は env / release / compatibility の 3 体に縮小。
-->

# Planned Experts

/**
 * 機能概要: roadmap 上のみに存在し、agent / skill 実体を持たない planned expert (env / release /
 *           compatibility / spec) の名前・目的・現行代替先・許容メタデータ・runtime 禁止規則を
 *           1 ファイルに集約する。
 * 作成意図: 過去に planned expert (特に release-expert) が op-run / op-post-check の fallback
 *           destination として誤って指名される事故が複数あり、active と planned を物理的に
 *           分離する正本を設けて runtime spawn 禁止を 1 ヶ所で宣言する。
 * 注意点: planned expert は active registry に入れない。active 化するときは agents/<expert>.md と
 *         skills/expert-*/SKILL.md の両方を新設し、`skills/_shared/active-expert-registry.md` に
 *         移動した上で本ファイルから当該節を削除すること。
 *         release-expert は他 planned と扱いが異なり、fallback destination としても使えない。
 */

This document records expert names that may appear in roadmap discussions,
future architecture notes, or routing metadata, but are not currently authorized
as runtime-spawnable active experts.

This file is canonical for planned expert names.

Planned experts MUST NOT be spawned at runtime unless they are later moved to
`skills/_shared/active-expert-registry.md` and backed by both:

- `agents/<expert>.md`
- `skills/expert-*/SKILL.md`

## Contract

A planned expert may appear as:

- future roadmap item,
- issue metadata,
- PR explanatory metadata,
- post-check skipped marker,
- design note.

A planned expert MUST NOT appear as:

- direct runtime spawn target,
- required apply executor,
- required post-check executor,
- active fallback destination.

## env-expert

Status: planned

Runtime spawn: prohibited

Purpose:

- development environment inspection
- dependency/toolchain version review
- OSV or vulnerability-tooling environment checks
- build/runtime environment drift detection

Current substitutes:

- `debug-expert`: environment-related build or runtime failures
- `security-expert`: dependency vulnerability, OSV-related findings, supply-chain risk
- `refactor-expert`: configuration cleanup, structure cleanup, environment file organization
- `needs_human_decision`: machine policy, organization policy, tool installation policy (rendered as GitHub label `needs:human-decision` only at the label boundary)

Allowed metadata usage:

- `<!-- op-scan-expert: env-expert -->`
- `<!-- op-run-expert: env-expert -->`
- `<!-- op-post-check-expert: env-expert -->`
- `<!-- op-planned-post-check-skipped: env-expert -->`

Runtime requirement:

- Must normalize before spawn.

## release-expert

Status: planned

Runtime spawn: prohibited

Future role candidate:

- no-apply / release readiness review
- release checklist validation
- installer / updater readiness review
- distribution readiness review

Current substitutes:

- `debug-expert`
  - release build failure
  - packaging failure
  - installer build failure
  - CI release job failure

- `refactor-expert`
  - release script cleanup
  - artifact layout cleanup
  - packaging config cleanup
  - version metadata cleanup

- `security-expert`
  - concrete signing risk
  - secrets exposure
  - supply-chain vulnerability
  - updater attack surface
  - distribution security finding

- `needs_human_decision` (rendered as GitHub label `needs:human-decision` only at the label boundary)
  - release approval
  - signing policy
  - installer policy
  - updater adoption policy
  - distribution policy
  - versioning strategy
  - release strategy
  - go / no-go decision

Hard rule:

- `release-expert` MUST NOT be used as a runtime fallback destination.
- If the task requires release policy or approval, use `needs_human_decision` (rendered as GitHub label `needs:human-decision` only at the label boundary).
- If the task is a concrete build / package failure, normalize to `debug-expert`.
- If the task is release-script structure cleanup, normalize to `refactor-expert`.
- If the task is a concrete security finding, normalize to `security-expert`.

Runtime requirement:

- Must not be used as apply fallback destination.
- Must normalize before spawn.

## compatibility-expert

Status: planned

Runtime spawn: prohibited

Current substitutes:

- `debug-expert`
  - compatibility bug
  - regression caused by version difference
  - migration failure
  - environment-specific failure

- `refactor-expert`
  - API surface cleanup
  - compatibility shim cleanup
  - module boundary cleanup
  - deprecated interface cleanup

- `needs_human_decision` (rendered as GitHub label `needs:human-decision` only at the label boundary)
  - compatibility policy
  - supported version matrix decision
  - deprecation policy
  - product-level compatibility tradeoff

Notes:

- `test-expert` may be recommended as follow-up coverage after a compatibility fix.
- `test-expert` is not the default runtime substitute unless `op-run` normalization explicitly supports it.

Runtime requirement:

- Must normalize before spawn.

## Roadmap-only planned experts

These names appear in roadmap documents (`docs/historical/op_agent_roadmap.md`) only.
They are **not** runtime-spawnable, **not** valid as `subagent_type` /
`recommended_fix_expert` / `recommended_apply_expert` / `op-run-expert` /
`op-post-check-expert` routing metadata, and **not** valid fallback destinations.

These are reserved name slots that may be promoted to a canonical planned expert
section (with full Current substitutes / Hard rule / Runtime requirement) only
after explicit design agreement. Until promotion, treat them as advisory placeholders.

This section exists so that runtime-contract.md §7 Unregistered Expert Rule can
distinguish "name appears in a roadmap document we know about" from "name we
have never heard of" — both still resolve to invalid spawn, but the former is
expected and the latter is a routing bug.

### docs-expert

- Status: roadmap-only (no canonical planned section yet)
- Runtime spawn: prohibited
- Routing metadata: not allowed
  - must not appear in `<!-- op-run-expert -->`
  - must not appear in `<!-- op-post-check-expert -->`
  - must not appear in `<!-- op-scan-expert -->`
- Current substitutes:
  - `feature-expert` — documentation-touching feature work with concrete acceptance criteria
  - `needs_human_decision` — doc policy / tone / structure decisions (rendered as GitHub label `needs:human-decision` only at the label boundary)
- Runtime requirement: Must not be spawned. If routed, normalize to a substitute above.

### ops-expert

- Status: roadmap-only (no canonical planned section yet)
- Runtime spawn: prohibited
- Routing metadata: not allowed
  - must not appear in `<!-- op-run-expert -->`
  - must not appear in `<!-- op-post-check-expert -->`
  - must not appear in `<!-- op-scan-expert -->`
- Current substitutes:
  - `debug-expert` — operational failures with concrete repro
  - `security-expert` — operational security findings (secret leak / supply-chain / runtime hardening)
  - `needs_human_decision` — operational policy decisions (rendered as GitHub label `needs:human-decision` only at the label boundary)
- Runtime requirement: Must not be spawned. If routed, normalize to a substitute above.

## OP skill names (not experts)

`op-doctor` / `op-cleanup` / `op-triage` / `op-release` are **OP skill** names,
not expert names. They live in a different namespace and are **not subject** to
`active-expert-registry.md` / `planned-experts.md` / `runtime-contract.md §7`.

Their planning state is tracked only in `docs/historical/op_agent_roadmap.md`
(non-canonical roadmap) until each is implemented under `skills/op-*/SKILL.md`.

If you see these names in routing metadata (`<!-- op-run-expert -->` /
`<!-- op-post-check-expert -->`), that is a routing bug — OP skills are
**orchestrators**, not spawn targets. Reroute to an actual active expert.
