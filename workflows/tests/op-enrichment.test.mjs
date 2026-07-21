/**
 * 機能概要:
 *   op-enrichment.js (起票前 review 基盤、C4) の純関数 logic harness。
 *   Issue #608: verdict 集約 (block>changes_requested>approve) と severity 振り分け
 *   (Critical/High=本文反映 / Medium/Low=post_create_comments) の閾値・優先順位の回帰を
 *   決定的に検出する。
 *
 * 注意点:
 *   - 本体 op-enrichment.js は改変しない (_extract.mjs が runtime 非干渉でソースから切り出す)。
 *   - 非決定 API は assertion に持ち込まない (固定入力→固定出力)。
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { loadPureFns, loadNormalizeArgs, loadConsts } from "./_extract.mjs";

const fns = loadPureFns("op-enrichment.js", {
  functions: [
    "aggregateVerdict",
    "splitFindings",
    "collectBlockFindings",
    "buildLabels",
    "embedDesignPlan",
    "embedEnrichmentMarkers",
    // RVW-003: design pipeline の contract 検証 + retry 回帰点 index 計算の純関数
    "validateRoleConsumption",
    "resolveRetryStartIndex",
    // #647: escalation reason → human_action_required の文言マッピング
    "blockedHumanAction",
    // Issue #757: severity / UI 影響 / task_complexity による cross-review reviewer 数 gating
    "resolveReviewers",
  ],
});

// RVW-004 準拠: loadNormalizeArgs はトップレベルで一度だけ呼ぶ (副作用なし・純評価なので毎回構築する必要がない)
const na = loadNormalizeArgs("op-enrichment.js");

// ---- aggregateVerdict: block > changes_requested > approve の最重値 ----
test("aggregateVerdict は block を最優先で返す", () => {
  assert.equal(
    fns.aggregateVerdict([{ review_result: "approve" }, { review_result: "block" }, { review_result: "changes_requested" }]),
    "block"
  );
});

test("aggregateVerdict は block 無しなら changes_requested を返す", () => {
  assert.equal(
    fns.aggregateVerdict([{ review_result: "approve" }, { review_result: "changes_requested" }]),
    "changes_requested"
  );
});

test("aggregateVerdict は全 approve なら approve を返す", () => {
  assert.equal(fns.aggregateVerdict([{ review_result: "approve" }, { review_result: "approve" }]), "approve");
});

test("aggregateVerdict は空配列で approve を返す (review 0 件)", () => {
  assert.equal(fns.aggregateVerdict([]), "approve");
});

// ---- splitFindings: severity で Critical/High と Medium/Low に振り分け ----
test("splitFindings は critical/high を criticalHigh に、それ以外を mediumLow に振り分ける", () => {
  const reviews = [
    {
      reviewer: "security-expert",
      findings: [
        { severity: "critical", category: "auth", summary: "s1" },
        { severity: "medium", category: "naming", summary: "s2", suggested_change: "rename" },
      ],
    },
    {
      reviewer: "review-expert",
      findings: [
        { severity: "high", category: "io", summary: "s3" },
        { severity: "low", category: "style", summary: "s4" },
      ],
    },
  ];
  const { criticalHigh, mediumLow } = fns.splitFindings(reviews);
  assert.equal(criticalHigh.length, 2);
  assert.equal(mediumLow.length, 2);
  // Critical/High は reviewer を保持
  assert.equal(criticalHigh[0].reviewer, "security-expert");
  assert.equal(criticalHigh[1].reviewer, "review-expert");
  // Medium/Low は suggested_change を優先、無ければ summary
  assert.equal(mediumLow[0].body, "rename");
  assert.equal(mediumLow[1].body, "s4");
  assert.equal(mediumLow[0].severity, "medium");
});

test("splitFindings は findings 欠落の review を空扱いする", () => {
  const { criticalHigh, mediumLow } = fns.splitFindings([{ reviewer: "x" }]);
  assert.equal(criticalHigh.length, 0);
  assert.equal(mediumLow.length, 0);
});

test("splitFindings は high を criticalHigh 側に入れる (閾値が high|critical = 反転回帰の検出点)", () => {
  const reviews = [{ reviewer: "r", findings: [{ severity: "high", category: "c", summary: "s" }] }];
  const { criticalHigh, mediumLow } = fns.splitFindings(reviews);
  assert.equal(criticalHigh.length, 1);
  assert.equal(mediumLow.length, 0);
});

// ---- collectBlockFindings: block reviewer の findings、無ければ全 Critical/High ----
test("collectBlockFindings は block を返した reviewer の findings を集める", () => {
  const reviews = [
    {
      reviewer: "security-expert",
      review_result: "block",
      findings: [{ severity: "critical", category: "auth", summary: "blk" }],
    },
    {
      reviewer: "review-expert",
      review_result: "approve",
      findings: [{ severity: "high", category: "io", summary: "ok" }],
    },
  ];
  const out = fns.collectBlockFindings(reviews);
  assert.equal(out.length, 1);
  assert.equal(out[0].summary, "blk");
  assert.equal(out[0].reviewer, "security-expert");
});

test("collectBlockFindings は block reviewer が居なければ全 Critical/High にフォールバックする", () => {
  const reviews = [
    {
      reviewer: "review-expert",
      review_result: "changes_requested",
      findings: [
        { severity: "high", category: "io", summary: "h1" },
        { severity: "low", category: "style", summary: "l1" },
      ],
    },
  ];
  const out = fns.collectBlockFindings(reviews);
  // block reviewer 無し → splitFindings(...).criticalHigh = high のみ
  assert.equal(out.length, 1);
  assert.equal(out[0].summary, "h1");
});

// ---- buildLabels: pro-<expert> ラベル群 (検出 + apply/post-check 役を兼ねる cross-reviewer のみ、#642) ----
test("buildLabels は apply/post-check 役の cross-reviewer (applies_or_post_checks=true) のみ pro- を付与する (#642 UI 経路維持)", () => {
  // UI 経路: feature 検出 + designer (apply) + ux-ui-audit (post-check) + security (品質レビューのみ)。
  const a = {
    issue_draft: { recommended_runner: "feature-expert" },
    options: { with_cross_review: true },
    cross_review_experts: [
      { name: "designer-expert", applies_or_post_checks: true },
      { name: "ux-ui-audit-expert", applies_or_post_checks: true },
      { name: "security-expert", applies_or_post_checks: false },
    ],
  };
  // designer / ux-ui-audit は付与、security (品質レビュー役) は付けない。
  assert.deepEqual(fns.buildLabels(a), ["pro-feature-expert", "pro-designer-expert", "pro-ux-ui-audit-expert"]);
});

test("buildLabels は純粋な品質レビュー役の cross-reviewer に pro- を付けない (#642 非 UI 経路の noise 抑止)", () => {
  // 非 UI 経路: refactor 検出 + debug/test cross-review (いずれも品質レビュー役のみ)。
  const a = {
    issue_draft: { recommended_runner: "refactor-expert" },
    options: { with_cross_review: true },
    cross_review_experts: [
      { name: "debug-expert", applies_or_post_checks: false },
      { name: "test-expert", applies_or_post_checks: false },
    ],
  };
  // 検出 expert のみ。pro-debug-expert / pro-test-expert は付けない (#642 のバグ本体)。
  assert.deepEqual(fns.buildLabels(a), ["pro-refactor-expert"]);
});

test("buildLabels は applies_or_post_checks 未注入の cross-reviewer を false 扱いで付けない (#642 旧 caller 安全側)", () => {
  // flag 未注入 (旧 caller) の reviewer は default false = ラベルを付けない安全側に倒す。
  const a = {
    issue_draft: { recommended_runner: "debug-expert" },
    options: { with_cross_review: true },
    cross_review_experts: [{ name: "review-expert" }, { name: "security-expert" }],
  };
  assert.deepEqual(fns.buildLabels(a), ["pro-debug-expert"]);
});

test("buildLabels は with_cross_review=false なら cross_review_experts を含めない", () => {
  const a = {
    issue_draft: { recommended_runner: "feature-expert" },
    options: { with_cross_review: false },
    cross_review_experts: [{ name: "review-expert", applies_or_post_checks: true }],
  };
  assert.deepEqual(fns.buildLabels(a), ["pro-feature-expert"]);
});

test("buildLabels は検出 expert と一致する apply/post-check cross-reviewer を 1 つに dedup する", () => {
  const a = {
    issue_draft: { recommended_runner: "security-expert" },
    options: { with_cross_review: true },
    cross_review_experts: [{ name: "security-expert", applies_or_post_checks: true }],
  };
  assert.deepEqual(fns.buildLabels(a), ["pro-security-expert"]);
});

// ---- embedDesignPlan / embedEnrichmentMarkers: 本文整形 ----
test("embedDesignPlan は本文末尾に Design Plan 節を追記する", () => {
  const out = fns.embedDesignPlan("本文", "プラン内容");
  assert.match(out, /^本文/);
  assert.match(out, /## 🎨 Design Plan/);
  assert.match(out, /プラン内容/);
});

test("embedEnrichmentMarkers は本文冒頭に 4 種 marker を prepend する", () => {
  const out = fns.embedEnrichmentMarkers("本文", {
    loops: 2,
    designStatus: "generated",
    crossStatus: "passed",
  });
  assert.match(out, /^<!-- op-enriched: true -->/);
  assert.match(out, /<!-- op-enrichment-loops: 2 -->/);
  assert.match(out, /<!-- op-enrichment-design-plan: generated -->/);
  assert.match(out, /<!-- op-enrichment-cross-review: passed -->/);
  // 本文は marker の後ろに残る
  assert.match(out, /本文$/);
});

test("embedEnrichmentMarkers は cross-review failed (#647 b-2 graceful degrade) を marker 化する", () => {
  // 全 reviewer spawn 失敗の non-strict graceful degrade では crossStatus="failed" が流れ込む。
  // この値が op-enrichment-cross-review marker に正しく埋め込まれることを保証する
  // (enum 値 "failed" は enrichment.rs CANONICAL_VALUES と一致、schema-check / marker-lint pass の前提)。
  const out = fns.embedEnrichmentMarkers("本文", {
    loops: 1,
    designStatus: "generated",
    crossStatus: "failed",
  });
  assert.match(out, /<!-- op-enrichment-cross-review: failed -->/);
  // Design Plan が救われている (designStatus は failed でなく generated を保つ = 巻き添え破棄しない)
  assert.match(out, /<!-- op-enrichment-design-plan: generated -->/);
  assert.match(out, /本文$/);
});

// ---- validateRoleConsumption: component 役が参照する role が token 役に存在するか検証 (RVW-003) ----
test("validateRoleConsumption は token 役の semantic_roles を参照する component を pass する", () => {
  const tokenOut = { semantic_roles: [{ role: "primary-action" }, { role: "navigation" }] };
  const compOut = { components: [{ name: "Button", consumes_roles: ["primary-action"] }] };
  // 全 role が定義済み → contract error なし
  assert.equal(fns.validateRoleConsumption(tokenOut, compOut), null);
});

test("validateRoleConsumption は未定義 role を参照する component を contract error として返す", () => {
  const tokenOut = { semantic_roles: [{ role: "primary-action" }] };
  // component が token に存在しない role を参照
  const compOut = { components: [{ name: "Card", consumes_roles: ["primary-action", "unknown-role"] }] };
  const err = fns.validateRoleConsumption(tokenOut, compOut);
  assert.ok(typeof err === "string", "contract error は文字列を返すはず");
  assert.match(err, /unknown-role/);
  assert.match(err, /contract error/);
});

test("validateRoleConsumption は複数の未定義 role を全て error に含める", () => {
  const tokenOut = { semantic_roles: [{ role: "a" }] };
  const compOut = { components: [{ name: "X", consumes_roles: ["b", "c"] }] };
  const err = fns.validateRoleConsumption(tokenOut, compOut);
  assert.match(err, /b/);
  assert.match(err, /c/);
});

test("validateRoleConsumption は tokenOut が null のとき null を返す (token 役 skip 時は検証なし)", () => {
  assert.equal(fns.validateRoleConsumption(null, { components: [] }), null);
  assert.equal(fns.validateRoleConsumption(undefined, { components: [] }), null);
});

test("validateRoleConsumption は semantic_roles が配列でないとき null を返す", () => {
  // token 役が semantic_roles を持たない (古い形式 / role 構成次第) は skip
  assert.equal(fns.validateRoleConsumption({ semantic_roles: null }, { components: [] }), null);
});

test("validateRoleConsumption は components が空のとき null を返す (参照なし)", () => {
  const tokenOut = { semantic_roles: [{ role: "a" }] };
  assert.equal(fns.validateRoleConsumption(tokenOut, { components: [] }), null);
});

// ---- resolveRetryStartIndex: required_changes の target_role から最早 retry 開始 index を返す (RVW-003) ----
test("resolveRetryStartIndex は target_role の最小 index を返す", () => {
  // ADR-0012 design pipeline: token=0 / component=1 / layout=2 / motion=3
  const roles = ["token-curation", "component-selection", "layout-composition", "motion-spec"];
  // component と motion の 2 箇所修正要求 → 最小は component (index 1)
  const changes = [{ target_role: "motion-spec" }, { target_role: "component-selection" }];
  assert.equal(fns.resolveRetryStartIndex(roles, changes), 1);
});

test("resolveRetryStartIndex は target_role が 1 件のとき正確に index を返す", () => {
  const roles = ["token-curation", "component-selection", "layout-composition"];
  const changes = [{ target_role: "layout-composition" }];
  assert.equal(fns.resolveRetryStartIndex(roles, changes), 2);
});

test("resolveRetryStartIndex は target_role が roles に無いとき layout-composition index にフォールバック", () => {
  const roles = ["token-curation", "component-selection", "layout-composition"];
  // 存在しない role → layoutIdx=2 にフォールバック
  const changes = [{ target_role: "nonexistent-role" }];
  assert.equal(fns.resolveRetryStartIndex(roles, changes), 2);
});

test("resolveRetryStartIndex は requiredChanges が空/null のとき layout-composition index を返す", () => {
  const roles = ["token-curation", "component-selection", "layout-composition"];
  assert.equal(fns.resolveRetryStartIndex(roles, []), 2);
  assert.equal(fns.resolveRetryStartIndex(roles, null), 2);
});

test("resolveRetryStartIndex は layout-composition が roles に無いとき 0 を返す (最終フォールバック)", () => {
  const roles = ["token-curation", "component-selection"];
  // layout-composition が存在しない → index 0 へ最終フォールバック
  assert.equal(fns.resolveRetryStartIndex(roles, [{ target_role: "unknown" }]), 0);
});

// ---- #676 ROLE_MODEL_FALLBACK: 役別 model 既定 (検出役 sonnet / 生成役 opus、旧 全役 opus からの保守化) ----
// 注: ROLE_MODEL_FALLBACK は async runRolePipeline 内 (`a.role_models[role] || ROLE_MODEL_FALLBACK[role] || "opus"`)
//     でのみ消費され、pure-fn / runtime spawn を経由しないと値ベースで検証できない。マップ定義自体は
//     top-level const なので _extract の loadConsts でソースから決定的に切り出して値を固定する
//     (runtime spawn を test 化せず、#676 の役別 model 既定の回帰だけを捕捉する coverage 範囲)。
test("ROLE_MODEL_FALLBACK は検出役=sonnet / 生成役=opus に保守化されている (#676 全役 opus からの回帰検出点)", () => {
  const { ROLE_MODEL_FALLBACK } = loadConsts("op-enrichment.js", ["ROLE_MODEL_FALLBACK"]);
  // 検出役 (既存 token/component の割当・選定) は sonnet
  assert.equal(ROLE_MODEL_FALLBACK["token-curation"], "sonnet");
  assert.equal(ROLE_MODEL_FALLBACK["component-selection"], "sonnet");
  // 生成役 (visual hierarchy 統合 / motion 設計) は opus
  assert.equal(ROLE_MODEL_FALLBACK["layout-composition"], "opus");
  assert.equal(ROLE_MODEL_FALLBACK["motion-spec"], "opus");
});

// ---- normalizeArgs: 必須フィールド fail-fast + design additive 補完 ----
test("normalizeArgs は issue_draft 欠落 / 必須サブフィールド欠落で throw する", () => {
  assert.throws(() => na.run({}), /issue_draft \(object\) required/);
  assert.throws(
    () => na.run({ issue_draft: { title: "t" } }),
    /issue_draft\.body required/
  );
});

test("normalizeArgs は options の型不正を検出する", () => {
  const baseDraft = {
    title: "t",
    body: "b",
    severity: "high",
    domain: "test",
    recommended_runner: "test-expert",
  };
  // with_design_plan は boolean か 'gate_only'
  assert.throws(
    () => na.run({ issue_draft: baseDraft, options: { with_design_plan: "yes" } }),
    /with_design_plan must be boolean or 'gate_only'/
  );
  // max_review_loops は正整数
  assert.throws(
    () =>
      na.run({
        issue_draft: baseDraft,
        options: { with_design_plan: false, with_cross_review: false, max_review_loops: 0, strict: false },
      }),
    /max_review_loops must be a positive integer/
  );
});

test("normalizeArgs は design_depth/design_roles を additive に default 補完する (旧 caller 無破壊)", () => {
  const out = na.run({
    issue_draft: {
      title: "t",
      body: "b",
      severity: "high",
      domain: "test",
      recommended_runner: "test-expert",
    },
    options: { with_design_plan: false, with_cross_review: false, max_review_loops: 3, strict: false },
    task_complexity: "moderate",
    today: "2026-06-02",
  });
  // with_design_plan=false → design_depth=none
  assert.equal(out.design_depth, "none");
  // gate_only=false
  assert.equal(out.gate_only, false);
  // foundation_exists default false
  assert.equal(out.foundation_exists, false);
  // cross_review_experts は配列補完
  assert.deepEqual(out.cross_review_experts, []);
});

// ---- blockedHumanAction: escalation reason → 人間向け文言 (#647 全滅 non-strict 誤ラベル回帰) ----
test("blockedHumanAction は spawn_failure_strict で strict を外す案内を返す (strict 専用、不変)", () => {
  const msg = fns.blockedHumanAction("spawn_failure_strict");
  assert.match(msg, /strict/);
});

test("blockedHumanAction は unexpected_error で strict 関連の矛盾した案内を含まない (#647 try/catch fail-safe)", () => {
  // unexpected_error は workflow body の try/catch fail-safe (予期せぬ例外) が使う non-strict 経路。
  // (#647 b-2 で全滅 non-strict は graceful degrade=enriched に変わり blocked を返さなくなったが、
  //  try/catch fail-safe は引き続き non-strict でも発火しうる。) non-strict ユーザーに「strict を外す」と
  //  案内すると矛盾するため、unexpected_error の文言には strict への言及が無いことを保証する (誤ラベル回帰の検出点)。
  const msg = fns.blockedHumanAction("unexpected_error");
  assert.ok(typeof msg === "string" && msg.length > 0);
  assert.doesNotMatch(msg, /strict/, "unexpected_error の文言に strict を含めない (non-strict 経路で矛盾するため)");
});

test("blockedHumanAction は未知 reason で汎用フォールバック文言を返す", () => {
  const msg = fns.blockedHumanAction("__unknown__");
  assert.ok(typeof msg === "string" && msg.length > 0);
  assert.doesNotMatch(msg, /strict/);
});

// ---- resolveReviewers: severity / UI 影響 / task_complexity による reviewer 数 gating (Issue #757) ----

test("resolveReviewers は Critical/High severity で全 reviewer を返す (フル review 維持、回帰検出点)", () => {
  // Critical / High は reviewer 削減の対象外。全 reviewer をそのまま返すことを保証する。
  const reviewers = [{ name: "security-expert" }, { name: "debug-expert" }];
  const a = {
    issue_draft: { severity: "critical" },
    options: { with_design_plan: false },
    task_complexity: "routine",
    cross_review_experts: reviewers,
  };
  assert.deepEqual(fns.resolveReviewers(a), reviewers);
});

test("resolveReviewers は Medium 以下 ∩ 非 UI ∩ routine で先頭 1 reviewer のみ返す (low-cost 経路、新動作)", () => {
  // 低コスト経路: severity=medium / with_design_plan=false / task_complexity=routine → 先頭 1 件のみ spawn する。
  const reviewers = [{ name: "debug-expert" }, { name: "test-expert" }];
  const a = {
    issue_draft: { severity: "medium" },
    options: { with_design_plan: false },
    task_complexity: "routine",
    cross_review_experts: reviewers,
  };
  const result = fns.resolveReviewers(a);
  assert.equal(result.length, 1);
  assert.equal(result[0].name, "debug-expert");
});
