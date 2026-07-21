/**
 * 機能概要:
 *   op-run-judge-clustering.js (op-run フェーズ1-2 clustering judge-panel、ADR-0014 Wave A) の
 *   純関数 logic harness。Issue #608: validate (issue 過不足/重複/cap) と多次元 score 計算の回帰を
 *   決定的に検出する。
 *
 * 注意点:
 *   - 本体 op-run-judge-clustering.js は改変しない (_extract.mjs が runtime 非干渉でソースから切り出す)。
 *   - 非決定 API は assertion に持ち込まない (固定入力→固定出力)。
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { loadPureFns, loadNormalizeArgs } from "./_extract.mjs";

const fns = loadPureFns("op-run-judge-clustering.js", {
  functions: ["validateCandidate", "computeScore", "sizeBalance", "round3"],
});

// RVW-004 準拠: loadNormalizeArgs はトップレベルで一度だけ呼ぶ (副作用なし・純評価なので毎回構築する必要がない)
const na = loadNormalizeArgs("op-run-judge-clustering.js", { consts: ["DEFAULT_ANGLES"] });

// ---- validateCandidate: 全 issue が過不足なく 1 回ずつ割当 ----
test("validateCandidate は全 issue が 1 回ずつ割当てられていれば null を返す", () => {
  const candidate = { clusters: [{ cluster_id: "c1", issues: [1, 2] }, { cluster_id: "c2", issues: [3] }] };
  assert.equal(fns.validateCandidate(candidate, [1, 2, 3]), null);
});

test("validateCandidate は同一 issue が複数 cluster に割当 (重複) を検出する", () => {
  const candidate = { clusters: [{ cluster_id: "c1", issues: [1, 2] }, { cluster_id: "c2", issues: [2] }] };
  assert.match(fns.validateCandidate(candidate, [1, 2]), /assigned to 2 clusters \(duplicate\)/);
});

test("validateCandidate は入力に無い issue (hallucinated) を検出する", () => {
  const candidate = { clusters: [{ cluster_id: "c1", issues: [1, 99] }] };
  assert.match(fns.validateCandidate(candidate, [1]), /#99 not in input issue set/);
});

test("validateCandidate は未割当 issue (欠落) を検出する", () => {
  const candidate = { clusters: [{ cluster_id: "c1", issues: [1] }] };
  assert.match(fns.validateCandidate(candidate, [1, 2]), /#2 missing from all clusters/);
});

test("validateCandidate は issues 配列でない cluster を検出する", () => {
  const candidate = { clusters: [{ cluster_id: "c1" }] };
  assert.match(fns.validateCandidate(candidate, [1]), /has no issues array/);
});

// ---- sizeBalance: 変動係数ベース均等度 ----
test("sizeBalance は空/単一 cluster で 1 を返す", () => {
  assert.equal(fns.sizeBalance([]), 1);
  assert.equal(fns.sizeBalance([5]), 1);
});

test("sizeBalance は均等なサイズで 1、偏ったサイズで低い値を返す", () => {
  // 完全均等 (cv=0) → 1
  assert.equal(fns.sizeBalance([2, 2, 2]), 1);
  // 偏り (1, 1, 10) は cv 大 → 低い均等度
  const skewed = fns.sizeBalance([1, 1, 10]);
  assert.ok(skewed < 1, `偏り均等度は 1 未満 (実際: ${skewed})`);
  assert.ok(skewed >= 0, "0 以上にクランプ");
});

// ---- computeScore: 多次元採点の方向性 (高いほど良いへ正規化) ----
test("computeScore は並列安全・低 conflict・high confidence の候補に高い total を与える", () => {
  // 良い候補: 全 parallel-safe / conflict 無し / high confidence / 均等
  const good = {
    clusters: [
      { issues: [1], needs_serialization: false, confidence: "high", files: ["a.rs"] },
      { issues: [2], needs_serialization: false, confidence: "high", files: ["b.rs"] },
    ],
  };
  // 悪い候補: 直列化必須 / conflict 接触 / low confidence
  const bad = {
    clusters: [
      { issues: [1], needs_serialization: true, confidence: "low", files: ["shared.rs"] },
      { issues: [2], needs_serialization: true, confidence: "low", files: ["shared.rs"] },
    ],
  };
  const gScore = fns.computeScore(good, [], 5);
  const bScore = fns.computeScore(bad, ["shared.rs"], 5);
  assert.ok(gScore.total > bScore.total, `良い候補 total(${gScore.total}) > 悪い候補 total(${bScore.total})`);
  // 良い候補は parallelism=1 / conflict_exposure=0 / confidence_ratio=1
  assert.equal(gScore.parallelism, 1);
  assert.equal(gScore.conflict_exposure, 0);
  assert.equal(gScore.confidence_ratio, 1);
  // 悪い候補は conflict 接触 1.0 / parallelism 0
  assert.equal(bScore.conflict_exposure, 1);
  assert.equal(bScore.parallelism, 0);
});

test("computeScore は cap 超過 cluster を cap_violations として数える", () => {
  const candidate = {
    clusters: [{ issues: [1, 2, 3, 4, 5, 6], needs_serialization: false, confidence: "high", files: [] }],
  };
  const score = fns.computeScore(candidate, [], 5);
  assert.equal(score.cap_violations, 1);
});

test("round3 は小数第3位で丸める", () => {
  assert.equal(fns.round3(0.123456), 0.123);
  assert.equal(fns.round3(1), 1);
});

// ---- normalizeArgs: 必須フィールド fail-fast + default 補完 ----
test("normalizeArgs は issues 空 / number 非数で throw する", () => {
  assert.throws(() => na.run({}), /issues must be a non-empty array/);
  assert.throws(() => na.run({ issues: [{ number: "1" }] }), /requires a numeric number/);
});

test("normalizeArgs は cap / angles / models を default 補完する", () => {
  const out = na.run({ issues: [{ number: 1 }] });
  assert.equal(out.cap, 5);
  assert.deepEqual(out.global_conflict_files, []);
  assert.equal(out.models.generate, "sonnet");
  assert.equal(out.models.evaluate, "opus");
  assert.ok(Array.isArray(out.angles) && out.angles.length > 0);
});

// ---- #676 candidate_count 既定 3→1 の回帰検出 (value-agnostic な length>0 では既定 1 を固定できない) ----
test("normalizeArgs は candidate_count 未注入時 angles を 1 案に保守化する (#676 既定 3→1 の回帰検出点)", () => {
  // candidate_count も angles も注入しない既定経路。#676 で既定案数 1 (Sonnet 1 案 + Opus 1 評価 = 2 spawn) に保守化。
  const out = na.run({ issues: [{ number: 1 }] });
  assert.equal(out.angles.length, 1, `既定 candidate_count=1 で angles は 1 案 (実際: ${out.angles.length})`);
});

test("normalizeArgs は candidate_count: 3 注入で angles を 3 案に展開する (override 経路の保持)", () => {
  // controller (op-config 高 complexity 区画) が candidate_count=3 を注入すると override 経路が勝つ。
  const out = na.run({ issues: [{ number: 1 }], candidate_count: 3 });
  assert.equal(out.angles.length, 3, `candidate_count=3 で angles は 3 案 (実際: ${out.angles.length})`);
});
