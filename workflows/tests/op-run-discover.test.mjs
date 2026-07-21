/**
 * 機能概要:
 *   op-run-discover.js (探知フェーズ、Stage2 barrier 供給) の純関数 logic harness。
 *   Issue #608: 集約系の純関数は本 script にほぼ無い (controller が reports で Stage2 競合検出を行う)。
 *   検証対象は entry の fail-fast = normalizeArgs() の必須フィールド検証のみ。
 *
 * 注意点:
 *   - buildDiscoverPrompt は文字列生成 (prompt) であり業務ロジックの分岐を持たないため harness 対象外。
 *   - 本体 op-run-discover.js は改変しない (_extract.mjs が runtime 非干渉でソースから切り出す)。
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { loadNormalizeArgs } from "./_extract.mjs";

const na = loadNormalizeArgs("op-run-discover.js");

test("normalizeArgs は clusters 空で throw する", () => {
  assert.throws(() => na.run({}), /clusters must be a non-empty array/);
  assert.throws(() => na.run({ clusters: [] }), /clusters must be a non-empty array/);
});

test("normalizeArgs は base_sha / base_ref 欠落で throw する", () => {
  assert.throws(
    () => na.run({ clusters: [{ id: "c1", expert: "debug-expert", issues: [1], worktree_path: "/w" }] }),
    /base_sha and .*base_ref are required/
  );
});

test("normalizeArgs は cluster の必須フィールド (id/expert/issues/worktree_path) 欠落を検出する", () => {
  const base = { base_sha: "abc", base_ref: "main" };
  // issues 空
  assert.throws(
    () => na.run({ ...base, clusters: [{ id: "c1", expert: "debug-expert", issues: [], worktree_path: "/w" }] }),
    /needs id, expert, non-empty issues/
  );
  // worktree_path 欠落
  assert.throws(
    () => na.run({ ...base, clusters: [{ id: "c1", expert: "debug-expert", issues: [1] }] }),
    /missing pre-provisioned worktree_path/
  );
});

test("normalizeArgs は正しい args をそのまま返す", () => {
  const a = {
    base_sha: "abc",
    base_ref: "main",
    clusters: [{ id: "c1", expert: "debug-expert", issues: [1, 2], worktree_path: "/w" }],
  };
  const out = na.run(a);
  assert.equal(out.base_sha, "abc");
  assert.equal(out.clusters.length, 1);
});
