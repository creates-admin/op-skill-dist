/**
 * 機能概要:
 *   op-scan-audit.js (op-scan フェーズ1 audit + 起票前 refute、C2) の純関数 logic harness。
 *   Issue #608: provenance index-zip (detected_by / finding_ref 付与) の回帰を決定的に検出する。
 *
 * 注意点:
 *   - 本体 op-scan-audit.js は改変しない (_extract.mjs が runtime 非干渉でソースから切り出す)。
 *   - refute 適用 (refuted drop) は controller (op-scan SKILL.md フェーズ1.5) 側ロジックのため
 *     本 script の純関数には含まれない (verdicts はそのまま戻り値に載るだけ)。ここでは audit 集約の
 *     index-zip 整合を守る。
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { loadPureFns, loadNormalizeArgs } from "./_extract.mjs";

const fns = loadPureFns("op-scan-audit.js", {
  functions: ["flatWithProvenance"],
});

// RVW-004 準拠: loadNormalizeArgs はトップレベルで一度だけ呼ぶ (副作用なし・純評価なので毎回構築する必要がない)
const na = loadNormalizeArgs("op-scan-audit.js");

// ---- flatWithProvenance: experts と index zip、detected_by + finding_ref 付与 ----
test("flatWithProvenance は detected_by と finding_ref を expert#idx 形で付与する", () => {
  const experts = [{ name: "debug-expert" }, { name: "security-expert" }];
  const auditResults = [
    { findings: [{ summary: "a" }, { summary: "b" }] },
    { findings: [{ summary: "c" }] },
  ];
  const out = fns.flatWithProvenance(auditResults, experts);
  assert.equal(out.length, 3);
  assert.deepEqual(
    out.map((f) => f.finding_ref),
    ["debug-expert#0", "debug-expert#1", "security-expert#0"]
  );
  assert.equal(out[0].detected_by, "debug-expert");
  assert.equal(out[2].detected_by, "security-expert");
  // 元 finding フィールドを保持
  assert.equal(out[1].summary, "b");
});

test("flatWithProvenance は auditResults[i] が null (expert 失敗) を空 batch 扱いし index ずれを起こさない", () => {
  const experts = [{ name: "debug-expert" }, { name: "refactor-expert" }, { name: "optimize-expert" }];
  // 中央の refactor が null = expert 失敗
  const auditResults = [{ findings: [{ summary: "a" }] }, null, { findings: [{ summary: "z" }] }];
  const out = fns.flatWithProvenance(auditResults, experts);
  assert.equal(out.length, 2);
  // optimize の ref は optimize-expert#0 (refactor が空でも index ずれない)
  assert.deepEqual(
    out.map((f) => f.finding_ref),
    ["debug-expert#0", "optimize-expert#0"]
  );
});

test("flatWithProvenance は findings が非配列の result を空 batch 扱いする", () => {
  const experts = [{ name: "debug-expert" }];
  const auditResults = [{ findings: "not-an-array" }];
  const out = fns.flatWithProvenance(auditResults, experts);
  assert.equal(out.length, 0);
});

// ---- normalizeArgs: 必須フィールドの fail-fast ----
test("normalizeArgs は mode 不正 / experts 空 / scope 欠落 / today 欠落で throw する", () => {
  assert.throws(() => na.run({}), /mode must be 'normal' or 'from-issue'/);
  assert.throws(() => na.run({ mode: "normal" }), /experts must be a non-empty array/);
  assert.throws(
    () => na.run({ mode: "normal", experts: [{ name: "debug-expert", model: "sonnet" }] }),
    /scope is required/
  );
  assert.throws(
    () => na.run({ mode: "normal", experts: [{ name: "debug-expert", model: "sonnet" }], scope: "src/" }),
    /today.*required/
  );
});

test("normalizeArgs は from-issue mode で from_issue_body 欠落を検出する", () => {
  assert.throws(
    () =>
      na.run({
        mode: "from-issue",
        experts: [{ name: "debug-expert", model: "sonnet" }],
        scope: "src/",
        today: "2026-06-02",
      }),
    /from-issue mode requires args.from_issue_body/
  );
});

test("normalizeArgs は正しい normal mode args をそのまま返す", () => {
  const out = na.run({
    mode: "normal",
    experts: [{ name: "debug-expert", model: "sonnet" }],
    scope: "src/",
    today: "2026-06-02",
  });
  assert.equal(out.mode, "normal");
  assert.equal(out.scope, "src/");
});
