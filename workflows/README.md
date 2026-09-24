# workflows/

OP skill が `Workflow({name: "op-skill:<name>", args})` で呼ぶ workflow script (`.js`) の正本。
plugin component として読まれる。編集は新規 session から反映される (開発中に最新を動かすなら `scriptPath` で呼ぶ)。

## script 一覧

いずれも read-only (編集・commit・push しない)。判定・起票・Ledger 更新は呼び出し側 controller が行う。

| script | 呼び出し元 | 役割 |
|---|---|---|
| `op-scan-audit` | op-scan | expert 並列 audit → normal mode の High/Critical を同 domain 別インスタンス skeptic で refute |
| `op-patrol-audit` | op-patrol | region × expert の並列 audit → High/Critical を refute (region 単位に集約) |
| `op-spec-patrol-audit` | op-spec-patrol | feature ごとに spec-expert で正本⟷code の domain drift を audit → refute (default=refuted)。機械 drift は `op spec-patrol` 担当 |
| `op-run-discover` | op-run | cluster ごとの worktree で investigation reader を並列 spawn し、Stage2 競合検出用の report を返す |
| `op-survey` | 任意 (横断調査) | goal / axes / preset で調査軸を立て investigator を並列 spawn。findings を返すだけで判定しない |

refute の worker 契約と controller 側の適用は `skills/_shared/refute-contract.md`。

## args / 戻り値

args は object で渡す (Workflow tool からは JSON 文字列で届くため、各 script の `normalizeArgs()` が parse と必須検証を行う)。
read-only spawn に `model: "fable"` が渡された場合、`normalizeArgs()` が opus へ矯正し `fable_guard_corrections` に記録する。

| script | args | 戻り値 |
|---|---|---|
| `op-scan-audit` | `{mode:'normal'\|'from-issue', scope (from-issue 時は推定 scope), experts:[{name,model}], today:'YYYY-MM-DD', extra_directives?, from_issue_{number,title,body}? (from-issue 時)}` | `{mode, scope, today, findings:[scan-finding + detected_by + finding_ref], verdicts:[{finding_ref, verdict:confirmed\|refuted\|downgrade, refuted, confirmed_severity?, reason, evidence_excerpt, evidence_location, reread_performed, supports_claim, security_unreachable_proof?}]}` |
| `op-patrol-audit` | `{today, run_id, regions:[{id, area, risk_score?, stale_score?, last_scanned_at, selection_reason, expert_list:[{name,model}]}]}` | `{today, run_id, regions:[{region_id, area, findings (finding_ref=`<region_id>:<expert>#<idx>`), verdicts, audit_report:{area,risk_score,stale_score,findings_count,critical_count,high_count,refuted_count}}], summary:{regions_count,findings_total,critical_total,high_total,refuted_total}}` |
| `op-spec-patrol-audit` | `{today, run_id, features:[{feature, spec_path, paths?, code_scope?, status?, target_issues?}]}` | `{today, run_id, features:[{feature, spec_path, spec_state, findings:[{feature, diff_type:spec_stale\|code_deviation\|premise_mismatch, severity, spec_says, code_reality, source, evidence_grade, suggested_direction, cross_feature?} + finding_ref=`<feature>#<idx>`], verdicts (+drift_confirmed_by_evidence), audit_report:{feature,drift_count,confirmed_count,refuted_count}}], summary:{features_count,findings_total,confirmed_total,refuted_total}}` |
| `op-run-discover` | `{clusters:[{id, expert, model, module, issues:[番号], files_declared:[], worktree_path, issue_bodies?:[{number, body}]}], base_sha, base_ref, ts, global_conflict_files?:[path]}` | `{base_sha, base_ref, ts, reports:[{cluster_id, files_likely_to_modify, risk_files, needs_serialization, worktree_path, ...}]}` |
| `op-survey` | `{repo_root, goal, axes?:[{id,title,focus,how,agentType?}], preset?:'op-skill-migration', model?:'sonnet', default_agent_type?:'general-purpose'}` (axis 解決: axes > preset > goal 導出) | `{goal, preset, axis_source, findings:[surveyFinding + detected_by + finding_ref=`<axis_id>:<title>#<idx>`], coverage_notes:[{axis, note}]}` |

呼び出し規約 (preflight / `.result` unwrap / args 渡し) は `skills/_shared/workflow-calling.md`。

## CI ゲート (`.github/workflows/op-tools-ci.yml`)

`workflow-static-gate` (構文・禁則トークン・`normalizeArgs()`・phase 位置) と `workflow-logic-test` (`workflows/tests/` の純関数テスト)。
import できないため、schema や helper は script ごとに複製する。

```bash
node --test workflows/tests/*.test.mjs   # repo root から
```

純関数のロジックを変えたら対応する `*.test.mjs` も更新する。
