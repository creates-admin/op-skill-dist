/**
 * 機能概要:
 *   op-survey.js (汎用 investigation fan-out workflow、Issue #645) の純関数 logic harness。
 *   axis 解決 (resolveAxes: explicit / preset / goal-derived の優先順位) / provenance index-zip
 *   (flatWithProvenance: detected_by / finding_ref 付与、null 投資失敗の index ずれ防止) /
 *   coverage_notes 集約 / normalizeArgs の必須フィールド fail-fast の回帰を決定的に検出する。
 *
 * 注意点:
 *   - 本体 op-survey.js は改変しない (_extract.mjs が runtime 非干渉でソースから切り出す)。
 *   - 判定・順位付けは workflow に持たせない (findings を返すだけ) ため、集約系の純関数は
 *     flatWithProvenance / collectCoverageNotes のみ (op-explore-render と同じ「判定なし」規律)。
 *   - 非決定 API (Date / Math.random / performance.now) は assertion に持ち込まない (固定入力→固定出力)。
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { loadPureFns, loadNormalizeArgs } from "./_extract.mjs";

const fns = loadPureFns("op-survey.js", {
  functions: ["flatWithProvenance", "collectCoverageNotes", "truncate", "resolveAxes", "normalizeAxis"],
  consts: ["AXIS_PRESETS"],
});

// RVW-004 準拠: loadNormalizeArgs はトップレベルで一度だけ呼ぶ (副作用なし・純評価なので毎回構築する必要がない)。
// normalizeArgs は resolveAxes / normalizeAxis / AXIS_PRESETS に依存するため、先に取り込む。
const na = loadNormalizeArgs("op-survey.js", {
  consts: ["AXIS_PRESETS"],
  functions: ["normalizeAxis", "resolveAxes"],
});

// ---- flatWithProvenance: axes と index zip、detected_by + finding_ref 付与 ----
test("flatWithProvenance は detected_by に axis.id、finding_ref に <axis_id>:<title>#<idx> を付与する", () => {
  const axes = [{ id: "cli-migration" }, { id: "dead-md" }];
  const surveyResults = [
    { findings: [{ title: "fence A" }, { title: "fence B" }] },
    { findings: [{ title: "orphan spec" }] },
  ];
  const out = fns.flatWithProvenance(surveyResults, axes);
  assert.equal(out.length, 3);
  assert.deepEqual(
    out.map((f) => f.finding_ref),
    ["cli-migration:fence A#0", "cli-migration:fence B#1", "dead-md:orphan spec#0"]
  );
  assert.equal(out[0].detected_by, "cli-migration");
  assert.equal(out[2].detected_by, "dead-md");
  // 元 finding フィールドを保持
  assert.equal(out[1].title, "fence B");
});

test("flatWithProvenance は surveyResults[i] が null (investigator 失敗) を空 batch 扱いし index ずれを起こさない", () => {
  const axes = [{ id: "cli-migration" }, { id: "workflow-migration" }, { id: "doc-drift" }];
  // 中央の workflow-migration が null = investigator 失敗
  const surveyResults = [{ findings: [{ title: "a" }] }, null, { findings: [{ title: "z" }] }];
  const out = fns.flatWithProvenance(surveyResults, axes);
  assert.equal(out.length, 2);
  // doc-drift の ref は doc-drift:z#0 (workflow-migration が空でも index ずれない)
  assert.deepEqual(
    out.map((f) => f.finding_ref),
    ["cli-migration:a#0", "doc-drift:z#0"]
  );
});

test("flatWithProvenance は findings が非配列の result を空 batch 扱いし、title 欠落は 'finding' で埋める", () => {
  const axes = [{ id: "cli-migration" }, { id: "dead-md" }];
  const surveyResults = [{ findings: "not-an-array" }, { findings: [{ files: ["x:1"] }] }];
  const out = fns.flatWithProvenance(surveyResults, axes);
  assert.equal(out.length, 1);
  // title 欠落時は finding_ref に "finding" を使う (undefined を文字列化しない)
  assert.equal(out[0].finding_ref, "dead-md:finding#0");
});

// ---- collectCoverageNotes: axis ごとの coverage_note 集約 + 失敗可視化 ----
test("collectCoverageNotes は各 axis の coverage_note を集約し、null result を失敗 note で残す", () => {
  const axes = [{ id: "cli-migration" }, { id: "dead-md" }];
  const surveyResults = [{ coverage_note: "fence を全数確認した" }, null];
  const out = fns.collectCoverageNotes(surveyResults, axes);
  assert.equal(out.length, 2);
  assert.deepEqual(out[0], { axis: "cli-migration", note: "fence を全数確認した" });
  // null (失敗) は再実行候補として可視化
  assert.equal(out[1].axis, "dead-md");
  assert.match(out[1].note, /spawn 失敗|空応答|再実行/);
});

test("collectCoverageNotes は coverage_note 欠落を '(coverage_note なし)' で埋める", () => {
  const axes = [{ id: "doc-drift" }];
  const out = fns.collectCoverageNotes([{ findings: [] }], axes);
  assert.equal(out[0].note, "(coverage_note なし)");
});

// ---- truncate: ログ用切り詰め (純関数) ----
test("truncate は max 超過で末尾に省略記号を付け、null/非文字列を安全に扱う", () => {
  assert.equal(fns.truncate("abcdef", 3), "abc…");
  assert.equal(fns.truncate("ab", 5), "ab");
  assert.equal(fns.truncate(null, 5), "");
  assert.equal(fns.truncate(123, 5), "123");
});

// ---- normalizeAxis: id 欠落時の index 由来 id ----
test("normalizeAxis は id 欠落時に index 由来 id を振り、title/focus/how を補完する", () => {
  const ax = fns.normalizeAxis({ focus: "f", how: "h" }, 2);
  assert.equal(ax.id, "axis-2");
  assert.equal(ax.title, "軸 2");
  assert.equal(ax.focus, "f");
  // 非 object は安全に空 axis 化
  const empty = fns.normalizeAxis(null, 0);
  assert.equal(empty.id, "axis-0");
});

// ---- resolveAxes: 解決優先順位 explicit > preset > goal-derived ----
test("resolveAxes は axes 明示時に explicit を採り、それを正規化する", () => {
  const a = { axes: [{ id: "x", title: "X" }, { focus: "no-id" }], goal: "g" };
  const out = fns.resolveAxes(a);
  assert.equal(a.axis_source, "explicit");
  assert.equal(out.length, 2);
  assert.equal(out[0].id, "x");
  // id 欠落の 2 番目は index 由来
  assert.equal(out[1].id, "axis-1");
});

test("resolveAxes は preset 名指定時に AXIS_PRESETS から op-skill-migration の 4 軸を展開する", () => {
  const a = { preset: "op-skill-migration", goal: "g" };
  const out = fns.resolveAxes(a);
  assert.equal(a.axis_source, "preset:op-skill-migration");
  assert.equal(out.length, 4);
  assert.deepEqual(
    out.map((x) => x.id),
    ["cli-migration", "workflow-migration", "dead-md", "doc-drift"]
  );
  // 構造軸は refactor-expert agentType を保持する (新 active expert 0)
  assert.equal(out[0].agentType, "refactor-expert");
  assert.equal(out[2].agentType, "general-purpose");
});

test("resolveAxes は未知 preset で throw する", () => {
  assert.throws(() => fns.resolveAxes({ preset: "unknown-preset", goal: "g" }), /未知の preset/);
});

test("resolveAxes は axes/preset 共に無い時 goal-derived の単一軸を立てる", () => {
  const a = { goal: "曖昧な調査" };
  const out = fns.resolveAxes(a);
  assert.equal(a.axis_source, "goal-derived");
  assert.equal(out.length, 1);
  assert.equal(out[0].id, "goal-survey");
});

// ---- normalizeArgs: 必須フィールドの fail-fast + 既定値 + axis 解決 ----
test("normalizeArgs は repo_root / goal 欠落で throw する", () => {
  assert.throws(() => na.run({}), /repo_root is required/);
  assert.throws(() => na.run({ repo_root: "." }), /goal \(string\) is required/);
});

test("normalizeArgs は model 既定 sonnet / default_agent_type 既定 general-purpose を設定する", () => {
  const out = na.run({ repo_root: ".", goal: "調査", preset: "op-skill-migration" });
  assert.equal(out.model, "sonnet");
  assert.equal(out.default_agent_type, "general-purpose");
  assert.equal(out.axes.length, 4);
  assert.equal(out.axis_source, "preset:op-skill-migration");
});

test("normalizeArgs は goal のみ (axes/preset 無し) で goal-derived 単一軸を解決する", () => {
  const out = na.run({ repo_root: ".", goal: "曖昧な横断調査" });
  assert.equal(out.axis_source, "goal-derived");
  assert.equal(out.axes.length, 1);
});
