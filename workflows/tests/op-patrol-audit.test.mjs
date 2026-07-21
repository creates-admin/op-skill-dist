/**
 * 機能概要:
 *   op-patrol-audit.js (op-patrol フェーズ4 区画別 audit + 起票前 refute、C3) の純関数 logic harness。
 *   Issue #608: region 単位再集約 (regroupByRegion) と verdict 再配分 + audit_report 統計 (attachVerdicts)
 *   の回帰を決定的に検出する。
 *
 * 注意点:
 *   - 本体 op-patrol-audit.js は改変しない (_extract.mjs が runtime 非干渉でソースから切り出す)。
 *   - 非決定 API は assertion に持ち込まない (固定入力→固定出力)。
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { loadPureFns, loadNormalizeArgs } from "./_extract.mjs";

const fns = loadPureFns("op-patrol-audit.js", {
  functions: ["regroupByRegion", "attachVerdicts"],
});

// RVW-004 準拠: loadNormalizeArgs はトップレベルで一度だけ呼ぶ (副作用なし・純評価なので毎回構築する必要がない)
const na = loadNormalizeArgs("op-patrol-audit.js");

// regroupByRegion 用の入力を組む helper (テスト realm の値のみ使用)。
function makeRegionInput() {
  const regionDefs = [
    { id: "r1", area: "op-tools" },
    { id: "r2", area: "expert-test" },
  ];
  // tasks = region × expert を flat 化したもの (audit fan-out 順)
  const tasks = [
    { region: regionDefs[0], expert: { name: "debug-expert" } },
    { region: regionDefs[0], expert: { name: "security-expert" } },
    { region: regionDefs[1], expert: { name: "test-expert" } },
  ];
  const auditResults = [
    { findings: [{ summary: "a", severity: "critical" }] },
    { findings: [{ summary: "b", severity: "high" }, { summary: "c", severity: "low" }] },
    { findings: [{ summary: "d", severity: "high" }] },
  ];
  return { regionDefs, tasks, auditResults };
}

// ---- regroupByRegion: region 単位に集約、detected_by/region_id/finding_ref 付与 ----
test("regroupByRegion は region 単位で findings を集約し finding_ref を <region>:<expert>#<idx> 形で付与する", () => {
  const { regionDefs, tasks, auditResults } = makeRegionInput();
  const out = fns.regroupByRegion(regionDefs, tasks, auditResults);
  assert.equal(out.length, 2);
  // r1 は debug(1) + security(2) = 3 件
  assert.equal(out[0].region_id, "r1");
  assert.equal(out[0].findings.length, 3);
  assert.deepEqual(
    out[0].findings.map((f) => f.finding_ref),
    ["r1:debug-expert#0", "r1:security-expert#0", "r1:security-expert#1"]
  );
  // r2 は test-expert 1 件
  assert.equal(out[1].region_id, "r2");
  assert.deepEqual(
    out[1].findings.map((f) => f.finding_ref),
    ["r2:test-expert#0"]
  );
  // region_id / detected_by を各 finding に stamp
  assert.equal(out[0].findings[0].region_id, "r1");
  assert.equal(out[0].findings[1].detected_by, "security-expert");
});

test("regroupByRegion は auditResults[i] が null (expert 失敗) を空 batch 扱いし index ずれを起こさない", () => {
  const { regionDefs, tasks } = makeRegionInput();
  // security (index1) が null
  const auditResults = [{ findings: [{ summary: "a", severity: "high" }] }, null, { findings: [{ summary: "d", severity: "low" }] }];
  const out = fns.regroupByRegion(regionDefs, tasks, auditResults);
  // r1 は debug 1 件のみ (security null)
  assert.equal(out[0].findings.length, 1);
  assert.equal(out[0].findings[0].finding_ref, "r1:debug-expert#0");
  // r2 は test-expert 1 件 (index ずれずに #0)
  assert.equal(out[1].findings[0].finding_ref, "r2:test-expert#0");
});

test("regroupByRegion は finding 0 件の region も空 findings で残す (region 欠落させない)", () => {
  const regionDefs = [{ id: "r1", area: "x" }, { id: "r2", area: "y" }];
  const tasks = [{ region: regionDefs[0], expert: { name: "debug-expert" } }];
  const auditResults = [{ findings: [] }];
  const out = fns.regroupByRegion(regionDefs, tasks, auditResults);
  assert.equal(out.length, 2);
  assert.equal(out[1].region_id, "r2");
  assert.deepEqual(out[1].findings, []);
});

// ---- attachVerdicts: verdict を finding_ref で region に再配分 + audit_report 統計 ----
test("attachVerdicts は verdict を finding_ref で region に再配分し severity 別件数を集計する", () => {
  const a = {
    today: "2026-06-02",
    run_id: "run-x",
    regions: [{ id: "r1", risk_score: 0.8, stale_score: 0.3 }],
  };
  const regions = [
    {
      region_id: "r1",
      area: "op-tools",
      findings: [
        { finding_ref: "r1:debug-expert#0", severity: "critical" },
        { finding_ref: "r1:debug-expert#1", severity: "high" },
        { finding_ref: "r1:debug-expert#2", severity: "low" },
      ],
    },
  ];
  const verdicts = [
    { finding_ref: "r1:debug-expert#0", verdict: "confirmed" },
    { finding_ref: "r1:debug-expert#1", verdict: "refuted", refuted: true },
  ];
  const out = fns.attachVerdicts(a, regions, verdicts);
  const r = out.regions[0];
  // verdict は 2 件再配分
  assert.equal(r.verdicts.length, 2);
  const rep = r.audit_report;
  assert.equal(rep.findings_count, 3);
  assert.equal(rep.critical_count, 1);
  assert.equal(rep.high_count, 1);
  assert.equal(rep.refuted_count, 1);
  assert.equal(rep.risk_score, 0.8);
  assert.equal(rep.stale_score, 0.3);
});

test("attachVerdicts は summary を全 region 横断で合算する", () => {
  const a = {
    today: "2026-06-02",
    run_id: "run-y",
    regions: [{ id: "r1" }, { id: "r2" }],
  };
  const regions = [
    {
      region_id: "r1",
      area: "a",
      findings: [{ finding_ref: "r1:debug#0", severity: "critical" }],
    },
    {
      region_id: "r2",
      area: "b",
      findings: [
        { finding_ref: "r2:test#0", severity: "high" },
        { finding_ref: "r2:test#1", severity: "high" },
      ],
    },
  ];
  const verdicts = [{ finding_ref: "r2:test#0", verdict: "refuted", refuted: true }];
  const out = fns.attachVerdicts(a, regions, verdicts);
  assert.equal(out.summary.regions_count, 2);
  assert.equal(out.summary.findings_total, 3);
  assert.equal(out.summary.critical_total, 1);
  assert.equal(out.summary.high_total, 2);
  assert.equal(out.summary.refuted_total, 1);
  // run_id / today を引き継ぐ
  assert.equal(out.run_id, "run-y");
  assert.equal(out.today, "2026-06-02");
});

test("attachVerdicts は region def に risk_score/stale_score が無い場合 null を入れる", () => {
  const a = { today: "t", run_id: "r", regions: [{ id: "r1" }] };
  const regions = [{ region_id: "r1", area: "a", findings: [] }];
  const out = fns.attachVerdicts(a, regions, []);
  assert.equal(out.regions[0].audit_report.risk_score, null);
  assert.equal(out.regions[0].audit_report.stale_score, null);
});

// ---- normalizeArgs: 必須フィールドの fail-fast ----
test("normalizeArgs は regions 空 / today 欠落 / run_id 欠落で throw する", () => {
  assert.throws(() => na.run({}), /regions must be a non-empty array/);
  assert.throws(() => na.run({ regions: [{ id: "r1" }] }), /today.*required/);
  assert.throws(() => na.run({ regions: [{ id: "r1" }], today: "2026-06-02" }), /run_id is required/);
});
