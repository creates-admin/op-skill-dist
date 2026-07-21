/**
 * 機能概要:
 *   op-explore-render.js (op-explore playground full モード、ADR-0013) の純関数 logic harness。
 *   Issue #608: 回答 round 畳み込み (foldAnswerRounds: dedup / 取りこぼし防止 / conflict 可視化) と
 *   normalizeArgs の budget hard cap (N=3 ∩ self_critique 拒否) の回帰を決定的に検出する。
 *
 * 注意点:
 *   - op-explore は judge を順位付けしない (ADR-0013 決定I)。集約系の純関数は foldAnswerRounds のみ。
 *   - 本体 op-explore-render.js は改変しない (_extract.mjs が runtime 非干渉でソースから切り出す)。
 *   - 非決定 API は assertion に持ち込まない (固定入力→固定出力)。
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { loadPureFns, loadNormalizeArgs } from "./_extract.mjs";

const fns = loadPureFns("op-explore-render.js", {
  functions: ["foldAnswerRounds"],
});
// RVW-004 準拠: loadNormalizeArgs はトップレベルで一度だけ呼ぶ (副作用なし・純評価なので毎回構築する必要がない)
const na = loadNormalizeArgs("op-explore-render.js", { consts: ["DEFAULT_CONSTRAINT_SETS"], functions: ["foldAnswerRounds"] });

// ---- foldAnswerRounds: round 跨ぎ dedup / 取りこぼし防止 / conflict 可視化 ----
test("foldAnswerRounds は空/非配列で空 merged を返す", () => {
  const m = fns.foldAnswerRounds(undefined);
  assert.deepEqual(m, { confirmed: [], rejected: [], reactions: [], open_questions: [], conflicts: [] });
  assert.deepEqual(fns.foldAnswerRounds([]).confirmed, []);
});

test("foldAnswerRounds は confirmed を round 跨ぎで dedup する", () => {
  const rounds = [
    { round: 1, confirmed: ["ダークモード", "カード型"] },
    { round: 2, confirmed: ["カード型", "余白広め"] },
  ];
  const m = fns.foldAnswerRounds(rounds);
  // カード型 は 1 回だけ (dedup)、append 順保持
  assert.deepEqual(m.confirmed, ["ダークモード", "カード型", "余白広め"]);
});

test("foldAnswerRounds は earlier confirmed を後 round が silent に落とさない (取りこぼし防止)", () => {
  const rounds = [{ round: 1, confirmed: ["A"] }, { round: 2, confirmed: ["B"] }];
  const m = fns.foldAnswerRounds(rounds);
  // round1 の A が残る (後勝ちで消えない)
  assert.ok(m.confirmed.includes("A"));
  assert.ok(m.confirmed.includes("B"));
});

test("foldAnswerRounds は confirmed と rejected の双方に現れる項目を conflict に出す", () => {
  const rounds = [
    { round: 1, confirmed: ["青基調"] },
    { round: 2, rejected: ["青基調"] },
  ];
  const m = fns.foldAnswerRounds(rounds);
  // confirmed にも rejected にもある → conflict 可視化 (silent に後勝ちさせない)
  assert.deepEqual(m.conflicts, ["青基調"]);
});

test("foldAnswerRounds は open_questions に最新 round のものだけを採る", () => {
  const rounds = [
    { round: 1, open_questions: ["q1"] },
    { round: 2, open_questions: ["q2", "q3"] },
  ];
  const m = fns.foldAnswerRounds(rounds);
  assert.deepEqual(m.open_questions, ["q2", "q3"]);
});

test("foldAnswerRounds は reactions に round 番号を付与して累積する", () => {
  const rounds = [
    { round: 1, reactions: [{ target: "x", sentiment: "like" }] },
    { round: 2, reactions: [{ target: "y", sentiment: "dislike" }] },
  ];
  const m = fns.foldAnswerRounds(rounds);
  assert.equal(m.reactions.length, 2);
  assert.equal(m.reactions[0].round, 1);
  assert.equal(m.reactions[1].round, 2);
});

// ---- normalizeArgs: session_id/requirement 必須 + budget hard cap ----
test("normalizeArgs は session_id / requirement 欠落で throw する", () => {
  assert.throws(() => na.run({}), /session_id \(string\) required/);
  assert.throws(() => na.run({ session_id: "s" }), /requirement required/);
});

test("normalizeArgs は pattern_count を 1..3 にクランプし model を opus default にする", () => {
  const out = na.run({ session_id: "s", requirement: { summary: "r" }, pattern_count: 9 });
  // 絶対上限 3 にクランプ
  assert.equal(out.pattern_count, 3);
  // 全役 opus 既定 (ADR-0013 決定K)
  assert.equal(out.models.generate, "opus");
  assert.equal(out.models.judge, "opus");
});

test("normalizeArgs は N=3 ∩ self_critique を hard cap で off にクランプし budget_note を出す", () => {
  const out = na.run({ session_id: "s", requirement: { summary: "r" }, pattern_count: 3, self_critique: true });
  // N=3 ∩ self_critique は budget 超過で拒否 → off
  assert.equal(out.self_critique, false);
  assert.match(out.budget_note, /hard cap/);
});

test("normalizeArgs は N=2 ∩ self_critique は許容する (hard cap 非該当)", () => {
  const out = na.run({ session_id: "s", requirement: { summary: "r" }, pattern_count: 2, self_critique: true });
  assert.equal(out.self_critique, true);
  assert.equal(out.budget_note, null);
});
