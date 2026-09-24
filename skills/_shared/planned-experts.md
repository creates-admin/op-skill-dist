# Planned Experts

agent / skill 実体を持たない planned expert の正本。active expert は `active-expert-registry.md`。

planned expert は Issue / PR の routing metadata・post-check skipped marker・設計メモには書いてよいが、
spawn target / apply executor / post-check executor / fallback destination にはしない。spawn 前に下記
`Current substitutes` のいずれかへ正規化する。active 化するときは `agents/<expert>.md` と `skills/expert-*/SKILL.md` を
新設し、`active-expert-registry.md` へ移して本ファイルから節を削除する。

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
- `needs_human_decision`: machine policy, organization policy, tool installation policy

Allowed metadata usage: `op-run-expert` / `op-post-check-expert` の値として `env-expert`。

## release-expert

Status: planned

Runtime spawn: prohibited

Future role candidate: no-apply な release readiness / release checklist / installer・updater・distribution readiness review。

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
  - updater exposure surface
  - distribution security finding

- `needs_human_decision`
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
- release policy / approval が要るなら `needs_human_decision`。
- 具体的な build / package failure は `debug-expert`。
- release script の構造整理は `refactor-expert`。
- 具体的な security finding は `security-expert`。

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

- `needs_human_decision`
  - compatibility policy
  - supported version matrix decision
  - deprecation policy
  - product-level compatibility tradeoff

Notes: `test-expert` は修正後の follow-up coverage として推奨してよいが、既定の substitute ではない。

## Roadmap-only planned experts

以下は roadmap 上の名前のみ。spawn 不可、routing metadata (`op-run-expert` / `op-post-check-expert` /
`recommended_fix_expert` 等) にも fallback にも使わない。routing に現れたら substitute へ正規化する。

- `docs-expert` → `feature-expert` (受入条件が具体的な文書系作業) / `needs_human_decision` (文書方針)
- `ops-expert` → `debug-expert` (再現可能な運用障害) / `security-expert` (secret 漏洩・supply-chain・runtime hardening) / `needs_human_decision` (運用方針)

## OP skill names (not experts)

`op-*` は OP skill (orchestrator) の名前であり expert ではない。routing metadata (`op-run-expert` 等) に現れたら
routing bug として active expert へ振り直す。
