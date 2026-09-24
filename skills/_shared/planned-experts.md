# Planned Experts

agent / skill 実体を持たない planned expert の正本。active expert は `active-expert-registry.md`。
全員 Status: planned / Runtime spawn: prohibited。

planned expert は Issue / PR の routing metadata・post-check skipped marker・設計メモには書いてよいが、
spawn target / apply executor / post-check executor / fallback destination にはしない。spawn 前の正規化は
`op run expert-resolve` が行う。Review Fix Loop 等で LLM が再分類するときは下記 `Current substitutes` の主題で振り分ける。
active 化するときは `agents/<expert>.md` と `skills/expert-*/SKILL.md` を新設し、`active-expert-registry.md` へ移して本ファイルから節を削除する。

## env-expert

開発環境・依存 / toolchain・OSV・build/runtime 環境 drift。

Current substitutes:

- `debug-expert`: environment 起因の build / runtime failure
- `security-expert`: dependency vulnerability / OSV / supply-chain risk
- `refactor-expert`: configuration・環境ファイルの構造整理
- `needs_human_decision`: machine policy / organization policy / tool installation policy

## release-expert

release readiness / installer・updater・distribution。

Current substitutes:

- `debug-expert`: release build / packaging / installer build / CI release job の failure
- `refactor-expert`: release script / artifact layout / packaging config / version metadata の整理
- `security-expert`: signing risk / secrets exposure / supply-chain / updater exposure / distribution security finding
- `needs_human_decision`: release approval / signing・installer・updater・distribution policy / versioning・release strategy / go-no-go

Hard rule:

- `release-expert` MUST NOT be used as a runtime fallback destination.

## compatibility-expert

互換性 / migration / version 差。

Current substitutes:

- `debug-expert`: compatibility bug / version 差の regression / migration failure / environment-specific failure
- `refactor-expert`: API surface / compatibility shim / module boundary / deprecated interface の整理
- `needs_human_decision`: compatibility policy / supported version matrix / deprecation policy / product-level tradeoff

`test-expert` は修正後の follow-up coverage として推奨してよいが、既定の substitute ではない。

## Roadmap-only planned experts

以下は roadmap 上の名前のみ。spawn 不可、routing metadata (`op-run-expert` / `op-post-check-expert` /
`recommended_fix_expert` 等) にも fallback にも使わない。routing に現れたら substitute へ正規化する。

- `docs-expert` → `feature-expert` (受入条件が具体的な文書系作業) / `needs_human_decision` (文書方針)
- `ops-expert` → `debug-expert` (再現可能な運用障害) / `security-expert` (secret 漏洩・supply-chain・runtime hardening) / `needs_human_decision` (運用方針)

`op-*` は OP skill の名前であり expert ではない。routing metadata に現れたら routing bug として active expert へ振り直す。
