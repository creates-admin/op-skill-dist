/**
 * 機能概要:
 *   op-spec-patrol-audit.js (ADR-0017 W3、canonical spec domain drift 専任 audit + refute) の
 *   純関数 logic harness。feature 単位再集約 (regroupByFeature) と verdict 再配分 + audit_report 統計
 *   (attachVerdicts)、normalizeArgs の fail-fast を決定的に検証する。
 *   op-patrol-audit.test.mjs を手本にする。
 *
 * 注意点:
 *   - 本体 op-spec-patrol-audit.js は改変しない (_extract.mjs が runtime 非干渉でソースから切り出す)。
 *   - 非決定 API は assertion に持ち込まない (固定入力→固定出力)。
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { loadPureFns, loadNormalizeArgs } from "./_extract.mjs";

const fns = loadPureFns("op-spec-patrol-audit.js", {
  functions: ["regroupByFeature", "attachVerdicts"],
});

const na = loadNormalizeArgs("op-spec-patrol-audit.js");

// ---- regroupByFeature: feature 単位に集約、detected_by/feature/finding_ref 付与 ----
test("regroupByFeature は feature 単位で findings を集約し finding_ref を <feature>#<idx> 形で付与する", () => {
  const featureDefs = [
    { feature: "op-scan", spec_path: ".claude/rules/op-scan.md" },
    { feature: "op-patrol", spec_path: ".claude/rules/op-patrol.md" },
  ];
  const auditResults = [
    {
      spec_state: "stale",
      findings: [
        { diff_type: "spec_stale", severity: "high", spec_says: "a", code_reality: "b" },
        { diff_type: "code_deviation", severity: "low", spec_says: "c", code_reality: "d" },
      ],
    },
    { spec_state: "exists", findings: [{ diff_type: "premise_mismatch", severity: "critical", spec_says: "e", code_reality: "f" }] },
  ];
  const out = fns.regroupByFeature(featureDefs, auditResults);
  assert.equal(out.length, 2);
  // op-scan は 2 件、finding_ref は <feature>#<idx>
  assert.equal(out[0].feature, "op-scan");
  assert.equal(out[0].spec_state, "stale");
  assert.deepEqual(
    out[0].findings.map((f) => f.finding_ref),
    ["op-scan#0", "op-scan#1"]
  );
  // detected_by / feature を各 finding に stamp
  assert.equal(out[0].findings[0].detected_by, "spec-expert");
  assert.equal(out[0].findings[0].feature, "op-scan");
  // op-patrol は 1 件
  assert.equal(out[1].feature, "op-patrol");
  assert.deepEqual(
    out[1].findings.map((f) => f.finding_ref),
    ["op-patrol#0"]
  );
});

test("regroupByFeature は auditResults[i] が null (spawn 失敗) を空 batch 扱いし index ずれを起こさない", () => {
  const featureDefs = [
    { feature: "a", spec_path: "a.md" },
    { feature: "b", spec_path: "b.md" },
  ];
  const auditResults = [null, { spec_state: "exists", findings: [{ diff_type: "spec_stale", severity: "high" }] }];
  const out = fns.regroupByFeature(featureDefs, auditResults);
  // a は null → 空 findings
  assert.deepEqual(out[0].findings, []);
  assert.equal(out[0].spec_state, null);
  // b は 1 件 (index ずれずに #0)
  assert.equal(out[1].findings[0].finding_ref, "b#0");
});

test("regroupByFeature は finding 0 件の feature も空 findings で残す (feature 欠落させない)", () => {
  const featureDefs = [{ feature: "x", spec_path: "x.md" }];
  const auditResults = [{ spec_state: "exists", findings: [] }];
  const out = fns.regroupByFeature(featureDefs, auditResults);
  assert.equal(out.length, 1);
  assert.deepEqual(out[0].findings, []);
});

// ---- attachVerdicts: verdict を finding_ref で feature に再配分 + audit_report 統計 ----
test("attachVerdicts は verdict を finding_ref で feature に再配分し confirmed/refuted を集計する", () => {
  const a = { today: "2026-06-21", run_id: "run-x", features: [{ feature: "op-scan" }] };
  const features = [
    {
      feature: "op-scan",
      spec_path: ".claude/rules/op-scan.md",
      spec_state: "stale",
      findings: [
        { finding_ref: "op-scan#0", severity: "critical" },
        { finding_ref: "op-scan#1", severity: "high" },
        { finding_ref: "op-scan#2", severity: "low" },
      ],
    },
  ];
  const verdicts = [
    { finding_ref: "op-scan#0", verdict: "confirmed" },
    { finding_ref: "op-scan#1", verdict: "refuted", refuted: true },
  ];
  const out = fns.attachVerdicts(a, features, verdicts);
  const ft = out.features[0];
  assert.equal(ft.verdicts.length, 2);
  const rep = ft.audit_report;
  assert.equal(rep.feature, "op-scan");
  assert.equal(rep.drift_count, 3);
  assert.equal(rep.confirmed_count, 1);
  assert.equal(rep.refuted_count, 1);
  // spec_path / spec_state を引き継ぐ
  assert.equal(ft.spec_path, ".claude/rules/op-scan.md");
  assert.equal(ft.spec_state, "stale");
});

test("attachVerdicts は summary を全 feature 横断で合算し run_id/today を引き継ぐ", () => {
  const a = { today: "2026-06-21", run_id: "run-y", features: [{ feature: "f1" }, { feature: "f2" }] };
  const features = [
    { feature: "f1", findings: [{ finding_ref: "f1#0", severity: "critical" }] },
    {
      feature: "f2",
      findings: [
        { finding_ref: "f2#0", severity: "high" },
        { finding_ref: "f2#1", severity: "high" },
      ],
    },
  ];
  const verdicts = [
    { finding_ref: "f1#0", verdict: "confirmed" },
    { finding_ref: "f2#0", verdict: "refuted", refuted: true },
  ];
  const out = fns.attachVerdicts(a, features, verdicts);
  assert.equal(out.summary.features_count, 2);
  assert.equal(out.summary.findings_total, 3);
  assert.equal(out.summary.confirmed_total, 1);
  assert.equal(out.summary.refuted_total, 1);
  assert.equal(out.run_id, "run-y");
  assert.equal(out.today, "2026-06-21");
});

// ---- normalizeArgs: 必須フィールドの fail-fast ----
test("normalizeArgs は features 空 / today 欠落 / run_id 欠落 / spec_path 欠落で throw する", () => {
  assert.throws(() => na.run({}), /features must be a non-empty array/);
  assert.throws(() => na.run({ features: [{ feature: "x", spec_path: "x.md" }] }), /today.*required/);
  assert.throws(
    () => na.run({ features: [{ feature: "x", spec_path: "x.md" }], today: "2026-06-21" }),
    /run_id is required/
  );
  assert.throws(
    () => na.run({ features: [{ feature: "x" }], today: "2026-06-21", run_id: "r" }),
    /missing feature\/spec_path/
  );
});

test("normalizeArgs は JSON 文字列 args も parse する (Workflow tool の到着形式)", () => {
  const out = na.run(
    JSON.stringify({
      features: [{ feature: "op-scan", spec_path: ".claude/rules/op-scan.md" }],
      today: "2026-06-21",
      run_id: "run-z",
    })
  );
  assert.equal(out.features.length, 1);
  assert.equal(out.run_id, "run-z");
});
