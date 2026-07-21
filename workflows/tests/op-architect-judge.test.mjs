/**
 * 機能概要:
 *   op-architect-judge.js (op-architect 設計判断 judge-panel、ADR-0014 Wave C) の純関数 logic harness。
 *   Issue #608: validate (論点 coverage / hallucination / 重複決定) と ADR-readiness score の回帰を
 *   決定的に検出する。
 *
 * 注意点:
 *   - 本体 op-architect-judge.js は改変しない (_extract.mjs が runtime 非干渉でソースから切り出す)。
 *   - 非決定 API は assertion に持ち込まない (固定入力→固定出力)。
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { loadPureFns, loadNormalizeArgs } from "./_extract.mjs";

const fns = loadPureFns("op-architect-judge.js", {
  functions: ["validateArchCandidate", "computeArchScore", "round3"],
});

// RVW-004 準拠: loadNormalizeArgs はトップレベルで一度だけ呼ぶ (副作用なし・純評価なので毎回構築する必要がない)
const na = loadNormalizeArgs("op-architect-judge.js", { consts: ["DEFAULT_ANGLES"] });

// decision helper (consequences は positive/negative 配列が必須)
function decision(topic, over = {}) {
  return {
    topic,
    decision: "採用する",
    rationale: "理由",
    consequences: { positive: ["p"], negative: ["n"] },
    ...over,
  };
}

// ---- validateArchCandidate: 全 ADR-worthy 論点を漏れなく決定 ----
test("validateArchCandidate は全論点を 1 回ずつ決定していれば null を返す", () => {
  const candidate = { decisions: [decision("storage"), decision("auth")] };
  assert.equal(fns.validateArchCandidate(candidate, ["storage", "auth"]), null);
});

test("validateArchCandidate は decisions 空で文字列を返す", () => {
  assert.match(fns.validateArchCandidate({ decisions: [] }, ["x"]), /decisions array is empty/);
});

test("validateArchCandidate は必須フィールド / consequences 欠落を検出する", () => {
  // rationale 欠落
  assert.match(
    fns.validateArchCandidate({ decisions: [{ topic: "x", decision: "d" }] }, ["x"]),
    /missing required field/
  );
  // consequences 欠落
  assert.match(
    fns.validateArchCandidate({ decisions: [{ topic: "x", decision: "d", rationale: "r" }] }, ["x"]),
    /missing consequences/
  );
});

test("validateArchCandidate は ADR-worthy でない論点 (hallucinated) を検出する", () => {
  const candidate = { decisions: [decision("imaginary")] };
  assert.match(fns.validateArchCandidate(candidate, ["storage"]), /is not an ADR-worthy 論点 \(hallucinated\)/);
});

test("validateArchCandidate は同一論点の二重決定を検出する", () => {
  const candidate = { decisions: [decision("storage"), decision("storage")] };
  assert.match(fns.validateArchCandidate(candidate, ["storage"]), /decided more than once/);
});

test("validateArchCandidate は未決定の論点 (coverage 欠落) を検出する", () => {
  const candidate = { decisions: [decision("storage")] };
  assert.match(
    fns.validateArchCandidate(candidate, ["storage", "auth"]),
    /"auth" has no decision \(incomplete architecture\)/
  );
});

// ---- computeArchScore: ADR-readiness (alternatives + tradeoffs を持つ decision の割合) ----
test("computeArchScore は alternatives_rejected + tradeoffs を持つ decision の割合を adr_readiness=total にする", () => {
  const candidate = {
    decisions: [
      decision("storage", { alternatives_rejected: ["B案"], tradeoffs: "速度 vs 容量" }),
      decision("auth", {}), // 素材なし
    ],
  };
  const score = fns.computeArchScore(candidate);
  // 2 件中 1 件が ready = 0.5
  assert.equal(score.adr_readiness, 0.5);
  assert.equal(score.total, 0.5);
  assert.equal(score.topic_count, 2);
});

test("computeArchScore は全 decision が素材を持つ候補に total=1 を与える", () => {
  const candidate = {
    decisions: [decision("storage", { alternatives_rejected: ["B"], tradeoffs: "t" })],
  };
  assert.equal(fns.computeArchScore(candidate).total, 1);
});

test("computeArchScore は claude_md_alignment / coherence_note の有無を info で返す", () => {
  const candidate = {
    decisions: [decision("storage")],
    claude_md_alignment: "ネスト 2 階層を守る",
    coherence_note: "全決定が単一データフローに整合",
  };
  const score = fns.computeArchScore(candidate);
  assert.equal(score.claude_md_aligned, true);
  assert.equal(score.has_coherence_note, true);
});

// ---- normalizeArgs ----
test("normalizeArgs は topics 空 / topic 非文字列で throw する", () => {
  assert.throws(() => na.run({}), /topics\[\].*is required/);
  assert.throws(() => na.run({ topics: [{ topic: "" }] }), /topic must be a non-empty string/);
});

test("normalizeArgs は project_context / angles / models を default 補完する", () => {
  const out = na.run({ topics: [{ topic: "storage" }] });
  assert.deepEqual(out.project_context, {});
  assert.ok(Array.isArray(out.angles) && out.angles.length > 0);
  assert.equal(out.models.generate, "sonnet");
  assert.equal(out.models.evaluate, "opus");
});

// ---- #676 candidate_count 既定 3→1 の回帰検出 (value-agnostic な length>0 では既定 1 を固定できない) ----
test("normalizeArgs は candidate_count 未注入時 angles を 1 案に保守化する (#676 既定 3→1 の回帰検出点)", () => {
  // candidate_count も angles も注入しない既定経路。#676 で spawn コスト削減のため既定案数 1 に保守化。
  const out = na.run({ topics: [{ topic: "storage" }] });
  assert.equal(out.angles.length, 1, `既定 candidate_count=1 で angles は 1 案 (実際: ${out.angles.length})`);
});

test("normalizeArgs は candidate_count: 3 注入で angles を 3 案に展開する (override 経路の保持)", () => {
  // controller が candidate_count=3 を注入すると override 経路が勝つ (a.candidate_count を尊重)。
  const out = na.run({ topics: [{ topic: "storage" }], candidate_count: 3 });
  assert.equal(out.angles.length, 3, `candidate_count=3 で angles は 3 案 (実際: ${out.angles.length})`);
});
