/**
 * 機能概要:
 *   op-plan-judge.js (op-plan 計画立案 judge-panel、ADR-0014 Wave B) の純関数 logic harness。
 *   Issue #608: validate (依存範囲/自己依存/循環) と依存グラフ解析 (hasCycle / longestDepChain) と
 *   guardrail score の回帰を決定的に検出する。
 *
 * 注意点:
 *   - 本体 op-plan-judge.js は改変しない (_extract.mjs が runtime 非干渉でソースから切り出す)。
 *   - 非決定 API は assertion に持ち込まない (固定入力→固定出力)。
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { loadPureFns, loadNormalizeArgs } from "./_extract.mjs";

const fns = loadPureFns("op-plan-judge.js", {
  functions: ["validatePlanCandidate", "hasCycle", "computePlanScore", "longestDepChain", "round3"],
});

// RVW-004 準拠: loadNormalizeArgs はトップレベルで一度だけ呼ぶ (副作用なし・純評価なので毎回構築する必要がない)
const na = loadNormalizeArgs("op-plan-judge.js", { consts: ["DEFAULT_ANGLES"] });

// issue helper (depends_on は他 issue の index 参照)
function issue(over = {}) {
  return { title: "t", domain: "feature", scope_summary: "s", expert: "feature-expert", ...over };
}

// ---- validatePlanCandidate ----
test("validatePlanCandidate は正しい分解で null を返す", () => {
  const candidate = { issues: [issue(), issue({ depends_on: [0] })] };
  assert.equal(fns.validatePlanCandidate(candidate), null);
});

test("validatePlanCandidate は issues 空で文字列を返す", () => {
  assert.match(fns.validatePlanCandidate({ issues: [] }), /issues array is empty/);
});

test("validatePlanCandidate は必須フィールド欠落を検出する", () => {
  const candidate = { issues: [{ title: "t" }] };
  assert.match(fns.validatePlanCandidate(candidate), /missing required field/);
});

test("validatePlanCandidate は depends_on の範囲外 index を検出する", () => {
  const candidate = { issues: [issue({ depends_on: [5] })] };
  assert.match(fns.validatePlanCandidate(candidate), /depends_on 5 out of range/);
});

test("validatePlanCandidate は自己依存を検出する", () => {
  const candidate = { issues: [issue({ depends_on: [0] })] };
  assert.match(fns.validatePlanCandidate(candidate), /depends on itself/);
});

test("validatePlanCandidate は依存循環を検出する", () => {
  // issue0 → issue1 → issue0 の循環
  const candidate = { issues: [issue({ depends_on: [1] }), issue({ depends_on: [0] })] };
  assert.match(fns.validatePlanCandidate(candidate), /dependency cycle detected/);
});

// ---- hasCycle ----
test("hasCycle は非循環グラフで false、循環で true を返す", () => {
  // 0→1→2 (鎖、循環なし)
  assert.equal(fns.hasCycle([{ depends_on: [1] }, { depends_on: [2] }, {}]), false);
  // 0→1→2→0 (循環)
  assert.equal(fns.hasCycle([{ depends_on: [1] }, { depends_on: [2] }, { depends_on: [0] }]), true);
  // 依存なしは false
  assert.equal(fns.hasCycle([{}, {}]), false);
});

// ---- longestDepChain ----
test("longestDepChain は最長依存鎖長を返す", () => {
  // 0←1←2←3 (3 が最長 3 hop)
  const issues = [{}, { depends_on: [0] }, { depends_on: [1] }, { depends_on: [2] }];
  assert.equal(fns.longestDepChain(issues), 3);
  // 依存なしは 0
  assert.equal(fns.longestDepChain([{}, {}]), 0);
  // 分岐 (2 が 0,1 両方に依存 → 1 hop)
  assert.equal(fns.longestDepChain([{}, {}, { depends_on: [0, 1] }]), 1);
});

// ---- computePlanScore ----
test("computePlanScore は reuse_ratio を total に使い、mvp_ratio は info のみ (total に入れない)", () => {
  const candidate = {
    issues: [
      { reuses_existing: true, is_mvp: true },
      { reuses_existing: false, is_mvp: false },
    ],
  };
  const score = fns.computePlanScore(candidate);
  // reuse 1/2 = 0.5 が total (mvp_ratio は total に加点しない = Wave B Ladder4 の逆転回帰防止点)
  assert.equal(score.reuse_ratio, 0.5);
  assert.equal(score.total, 0.5);
  assert.equal(score.mvp_ratio, 0.5);
  assert.equal(score.has_mvp, true);
});

test("computePlanScore は全 reuse の候補に total=1 を与える", () => {
  const candidate = { issues: [{ reuses_existing: true }, { reuses_existing: true }] };
  assert.equal(fns.computePlanScore(candidate).total, 1);
});

test("computePlanScore は dependency_depth を集計する", () => {
  const candidate = { issues: [{}, { depends_on: [0] }] };
  assert.equal(fns.computePlanScore(candidate).dependency_depth, 1);
});

// ---- normalizeArgs ----
test("normalizeArgs は requirement.summary 欠落で throw する", () => {
  assert.throws(() => na.run({}), /requirement.summary.*required/);
});

test("normalizeArgs は asset_audit / adr_decision / angles / models を default 補完する", () => {
  const out = na.run({ requirement: { summary: "新機能を追加したい" } });
  assert.deepEqual(out.asset_audit, {});
  assert.deepEqual(out.adr_decision, { needed: false });
  assert.ok(Array.isArray(out.angles) && out.angles.length > 0);
  assert.equal(out.models.generate, "sonnet");
  assert.equal(out.models.evaluate, "opus");
});

// ---- #676 candidate_count 既定 3→1 の回帰検出 (value-agnostic な length>0 では既定 1 を固定できない) ----
test("normalizeArgs は candidate_count 未注入時 angles を 1 案に保守化する (#676 既定 3→1 の回帰検出点)", () => {
  // candidate_count も angles も注入しない既定経路。#676 で spawn コスト削減のため既定案数 1 に保守化。
  const out = na.run({ requirement: { summary: "新機能を追加したい" } });
  assert.equal(out.angles.length, 1, `既定 candidate_count=1 で angles は 1 案 (実際: ${out.angles.length})`);
});

test("normalizeArgs は candidate_count: 3 注入で angles を 3 案に展開する (override 経路の保持)", () => {
  // controller が candidate_count=3 を注入すると override 経路が勝つ (a.candidate_count を尊重)。
  const out = na.run({ requirement: { summary: "新機能を追加したい" }, candidate_count: 3 });
  assert.equal(out.angles.length, 3, `candidate_count=3 で angles は 3 案 (実際: ${out.angles.length})`);
});
