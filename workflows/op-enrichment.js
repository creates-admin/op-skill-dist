/**
 * 機能概要:
 *   enrichment 層 (issue-enrichment.md §5/§6/§7) の起票前 review を Dynamic Workflow へ移行
 *   (ADR-0009 Phase C / C4)。per-Issue invocation。3 phase:
 *   - design-plan : UI 影響時 (design_depth != none) のみ designer-expert を役スコープで連鎖 spawn
 *                   (token-curation→component-selection→layout-composition→(motion-spec)、ADR-0012 多役 pipeline) →
 *                   統合 Design Plan を ux-ui-audit-expert (gate Mode) で PASS/PASS_WITH_NOTES/BLOCK 判定。
 *                   BLOCK は required_changes[].target_role から遡及開始役を決め cache で前役文脈を温存して再生成、
 *                   連続 3 回 BLOCK で result:blocked (design_plan_block)。役は config 駆動 (design_roles、controller 注入)。
 *   - cross-review: 検出 expert 以外の関連 expert (controller が §6 担当表で解決し注入) を
 *                   read-only で **並列 spawn (index-zip、filter しない)** → judge (block>changes_requested>approve
 *                   の最大集約)。changes_requested は Critical/High を本文へ statement 統合 (integrate agent) →
 *                   max_review_loops 内で再 cross-review。block は result:blocked (cross_review_block)。
 *   - integrate  : 4 marker 埋込 + Medium/Low → post_create_comments 分離 + §8 Output contract 一式を組立てて返す。
 *
 * 作成意図:
 *   現行 issue-enrichment.md §5/§6 の controller 直接 Agent spawn を Workflow へ移行 (context 節約)、
 *   かつ judge (cross-review 集約) を決定論化する (ADR-0009 L156)。enrichment 層の §2 DO
 *   (Critical/High 本文反映 / Medium/Low の post_create_comments 分離 / marker 4 種埋込) は
 *   本 workflow が担う (= §8 Output contract を直接組立てて返す)。
 *
 * 注意点:
 *   - severity gate / fingerprint dedup / collision gate (§7.5) / gh issue create / manual_review_bucket 退避は
 *     **controller 保持** (§2 DON'T + ADR-0009 制約2: workflow script は fs/process/gh 不可)。本 workflow は spawn と集約・本文組立のみ。
 *   - gate / cross-review / integrate spawn は **model:"opus" 固定** (§5 L207-218、--quality low でも維持)。本 workflow は audit stage を持たない。
 *     design 役 pipeline (token→component→layout→motion) のみ **役別 model** (ADR-0012 Wave4、検出役 sonnet / 生成役 opus)。
 *     正本値は op-config-schema.md §9 / model-selection.md §5.4.1、controller が role_models で注入。
 *     未注入時は ROLE_MODEL_FALLBACK (検出役 sonnet / 生成役 opus、#676 で全役 opus から保守化) に倒し、未知役は opus 安全網。
 *     controller 注入 (role_models[role]) は最優先で勝つため foundation 不在時の token-curation Opus 昇格は保持される。
 *   - **args は Workflow tool から JSON 文字列で到着** (C1 段階1.5 実測) → normalizeArgs() で parse。
 *     with_design_plan / with_cross_review は controller が auto→bool 解決済 ("auto" 文字列は渡さない、D11)。
 *     task_complexity / UI 影響判定は controller pre-step (§4)、cross_review_experts は §6 担当表で controller が解決 (D11/D2)。
 *   - **ADR-0012 design 多役**: design_depth (none|light|full) / design_roles[] / foundation_exists / role_models は
 *     controller pre-step (issue-enrichment.md §4/§7.6 が canonical) が解決し args 注入。workflow 側は heuristic を持たない。
 *     これらは optional + normalizeArgs default 補完 (必須 throw しない = 旧 caller 無破壊、design_depth 未注入は with_design_plan から導出)。
 *   - **§10 Failure modes 挙動を完全保存** (D8): designer/gate 失敗→non-strict は continue (design-plan failed) /
 *     gate BLOCK 3連続→design_plan_block 強制中断 / cross-review 一部失敗→non-strict 残り集約・strict spawn_failure_strict /
 *     cross-review block→cross_review_block 強制中断 / max_loops 超→non-strict enriched・strict max_loops_exceeded /
 *     予期せぬ例外→try/catch で result:blocked fail-safe (reason:unexpected_error)。
 *   - cross-review は **index-zip 維持** (filter(Boolean) しない、D7): null spawn を失敗 reviewer として特定し strict 判定に使う。
 *   - op-architect 向け **additive 戻り値** design_plan (markdown) + apply_expert (with_cross_review:false 経路)。
 *   - REAL_API 準拠: export const meta (pure literal 第一文) / phase() は body 冒頭で 1 回のみ (stage callback 内で呼ばない、
 *     以降は agent opts.phase で grouping) / 非決定 API (現在時刻取得・乱数生成・引数なしの日付生成) 不使用 (today は args 注入)。
 */

export const meta = {
  name: "op-enrichment",
  description:
    "enrichment 起票前 review (issue-enrichment.md §5/§6/§7) の Dynamic Workflow。UI 影響時の Design Plan 生成→gate (BLOCK retry 最大3) + cross-review 並列→judge 集約 (max_review_loops) + Critical/High 本文統合 + §8 Output contract 組立。severity gate / dedup / collision gate / gh issue create は controller 保持。全 spawn opus 固定。refute (op-scan/op-patrol) とは別レイヤー",
  // ADR-0012: design-plan を役 phase に静的展開 (meta は pure literal、式禁止)。未使用 phase が残っても無害。
  phases: [
    { title: "token-curation" },
    { title: "component-selection" },
    { title: "layout-composition" },
    { title: "motion-spec" },
    { title: "gate" },
    { title: "cross-review" },
    { title: "integrate" },
  ],
};

// #676: role_models 未注入時 (op-config なし等) の役別既定 model。controller 注入 (a.role_models[role]) が最優先で勝つため、
//       foundation 不在時の token-curation Opus 昇格 (model-selection.md §5.4.1) は注入経路で保持される。
//       本マップは「設定漏れ時に全役 Opus へ倒す」旧 fallback を、検出役=sonnet / 生成役=opus に保守化したもの (op-config-schema.md §9 role_models と同値)。
//       未知役は呼び出し側の `|| "opus"` 安全網に倒す。
const ROLE_MODEL_FALLBACK = {
  "token-curation": "sonnet", // 既存 token を semantic role に割当 = 検出 (foundation 不在時は controller が opus 昇格注入)
  "component-selection": "sonnet", // 既存コンポーネント選定 = 検出
  "layout-composition": "opus", // visual hierarchy / 統合 = 生成
  "motion-spec": "opus", // motion 設計 = 生成
};

// Design Plan 生成 (designer-expert Architect Mode) の戻り。Markdown を object でラップ (StructuredOutput は object 返却が安全)。
const designPlanSchema = {
  type: "object",
  required: ["design_plan_markdown"],
  properties: {
    design_plan_markdown: { type: "string", minLength: 1 },
    apply_expert: { type: ["string", "null"] }, // designer-expert | feature-expert (op-architect 向け)
    design_assumptions: { type: "array", items: { type: "string" } },
    needs_human_decision: { type: ["object", "null"] },
  },
};

// Design Plan gate (ux-ui-audit-expert gate Mode) の verdict。
const gateVerdictSchema = {
  type: "object",
  required: ["verdict"],
  properties: {
    verdict: { type: "string", enum: ["PASS", "PASS_WITH_NOTES", "BLOCK"] },
    gate_report_markdown: { type: "string" },
    // ADR-0012: 文字列 or {target_role, change} object (どの役から再生成するか)。後方互換 additive。
    required_changes: { type: "array", items: { type: ["string", "object"] } }, // BLOCK 時の再作成指示
    audit_notes: { type: "string" }, // PASS_WITH_NOTES 時の追記
    needs_human_decision: { type: ["object", "null"] },
  },
};

// cross-review (関連 expert read-only review) の戻り。findings は severity でルーティング (Critical/High→本文 / Medium/Low→post_create_comments)。
const crossReviewSchema = {
  type: "object",
  required: ["review_result", "findings"],
  properties: {
    review_result: { type: "string", enum: ["approve", "changes_requested", "block"] },
    findings: {
      type: "array",
      items: {
        type: "object",
        required: ["severity", "category", "summary"],
        properties: {
          severity: { type: "string", enum: ["critical", "high", "medium", "low"] },
          category: { type: "string" },
          summary: { type: "string" },
          suggested_change: { type: "string" },
        },
      },
    },
    needs_human_decision: { type: ["object", "null"] },
  },
};

// integrate (Critical/High 指摘を本文へ自然文統合する review-mode agent) の戻り。merged_body は空不可。
const integrateSchema = {
  type: "object",
  required: ["merged_body"],
  properties: {
    merged_body: { type: "string", minLength: 1 },
    critical_high_addressed: { type: "integer" },
  },
};

// ===== ADR-0012 design 多役 pipeline の役別 schema (token→component→layout→motion)。各役戻りを object で wrap し StructuredOutput 強制。=====

// token-curation 役 (foundation 役=add+normalize / per-feature 役=参照のみ、決定2-bis)。semantic_roles を後役が消費する。
const tokenCurationSchema = {
  type: "object",
  required: ["semantic_roles", "token_fragment_markdown"],
  properties: {
    semantic_roles: {
      type: "array",
      items: {
        type: "object",
        required: ["role"],
        properties: {
          role: { type: "string", minLength: 1 }, // 例: color-warning / spacing-card-gap
          token_ref: { type: "string" }, // canonical foundation token 名
          normalized: { type: "boolean" }, // foundation 役が正規化追加した token か
          scale: { type: "string" }, // 準拠 scale (color/space/radius/typography...)
        },
      },
    },
    token_fragment_markdown: { type: "string", minLength: 1 }, // ### Tokens to Use 節の断片
  },
};

// component-selection 役。token-curation の semantic role を consumes_roles で参照。未定義参照は workflow JS が contract error 化。
const componentSelectionSchema = {
  type: "object",
  required: ["components", "component_fragment_markdown"],
  properties: {
    components: {
      type: "array",
      items: {
        type: "object",
        required: ["name"],
        properties: {
          name: { type: "string", minLength: 1 },
          consumes_roles: { type: "array", items: { type: "string" } }, // token-curation の role を参照
        },
      },
    },
    component_fragment_markdown: { type: "string", minLength: 1 }, // ### Components to Use 節の断片
  },
};

// motion-spec 役 (条件付き)。layout-composition の統合 md に ### Motion Strategy 節を追記する additive layer。
const motionSpecSchema = {
  type: "object",
  required: ["design_plan_markdown"],
  properties: {
    design_plan_markdown: { type: "string", minLength: 1 }, // Motion Strategy 節を追記した統合 md 全文
    motion_tokens: { type: "array", items: { type: "string" } },
    needs_human_decision: { type: ["object", "null"] },
  },
};
// 注: layout-composition 役は designPlanSchema を再利用する (統合 md 1 本 = designPlanSchema と同形、silent fork 回避)。

// args は Workflow tool から JSON 文字列で到着する (C1 段階1.5 実測) → parse + 入力検証。
const input = normalizeArgs();

phase("token-curation");

// --- plugin scoped-name: Workflow agent() の agentType は plugin 登録名 (op-skill:<name>) で解決する ---
// built-in (general-purpose/Explore/Plan) は plugin component でないため bare 維持。data (expert 名等) は
// bare 正本、spawn 境界でのみ前置する (skills/_shared/expert-spawn.md「Plugin scoped-name 規約」)。
const BUILTIN_AGENTS = new Set(["general-purpose", "Explore", "Plan"]);
const scopedAgentType = (n) => (n && !BUILTIN_AGENTS.has(n) ? `op-skill:${n}` : n);
log(
  `op-enrichment: severity=${input.issue_draft.severity} ui=${input.options.with_design_plan} ` +
    `cross_review=${input.options.with_cross_review} reviewers=${input.cross_review_experts.length} ` +
    `max_loops=${input.options.max_review_loops} strict=${input.options.strict} today=${input.today}`
);

try {
  // ===== Phase A: Design Plan 生成→gate (UI 影響時のみ、§5) =====
  let designPlan = null;
  let designStatus = "skipped";
  let applyExpert = null;
  let designPlanAlreadyInBody = false; // gate_only: 提示済 Design Plan は body に既存 = 再 embed しない
  let gateOnlyNotes = null; // gate_only PASS_WITH_NOTES の audit notes (body へ追記)

  if (input.gate_only) {
    // ADR-0013 決定C: op-explore handoff。提示済 Design Plan を再生成せず ux-ui-audit gate だけ実行する (二重課金回避)。
    const gp = await runGateOnlyDesignPlan(input);
    if (gp.blocked) {
      return assembleBlocked(input, gp.reason, gp.blocking_findings, {
        design_plan_status: gp.reason === "design_plan_block" ? "blocked" : "failed",
        cross_review_status: "skipped",
        loops_executed: 0,
      });
    }
    if (gp.fallback) {
      // 本文に `## 🎨 Design Plan` 節が無い → 通常生成にフォールバック (auto 相当)。
      const dp = await runDesignPlanLoop(input);
      if (dp.blocked) {
        return assembleBlocked(input, dp.reason, dp.blocking_findings, {
          design_plan_status: dp.reason === "design_plan_block" ? "blocked" : "failed",
          cross_review_status: "skipped",
          loops_executed: 0,
        });
      }
      designStatus = dp.status;
      designPlan = dp.design_plan_markdown;
      applyExpert = dp.apply_expert;
    } else {
      designStatus = gp.status; // "gate_only" | "failed"
      designPlanAlreadyInBody = true; // 提示済 plan は body に既存
      gateOnlyNotes = gp.audit_notes || null;
      applyExpert = gp.apply_expert || null;
      designPlan = gp.design_plan_markdown; // additive 返却用 (op-architect 互換)
    }
  } else if (input.options.with_design_plan && input.design_depth !== "none") {
    // design_depth==='none' は UI 影響なし = 役 0 (marker pass-through、ADR-0012 決定6)。
    const dp = await runDesignPlanLoop(input);
    if (dp.blocked) {
      return assembleBlocked(input, dp.reason, dp.blocking_findings, {
        design_plan_status: dp.reason === "design_plan_block" ? "blocked" : "failed",
        cross_review_status: "skipped",
        loops_executed: 0,
      });
    }
    designStatus = dp.status; // "generated" | "failed"
    designPlan = dp.design_plan_markdown; // failed (designer 失敗) なら null
    applyExpert = dp.apply_expert;
  }

  // Design Plan を本文へ埋込 (cross-review reviewers が見られるよう Phase B の前に embed、§6)。
  // gate_only は提示済 plan が既に body にあるため再 embed しない (重複防止)。audit notes だけ追記する。
  let body = input.issue_draft.body;
  if (designPlan && !designPlanAlreadyInBody) body = embedDesignPlan(body, designPlan);
  if (gateOnlyNotes) body = `${body}\n\n### Audit Notes\n\n${gateOnlyNotes}`;

  // ===== Phase B: cross-review 並列→judge→integrate ループ (§6/§7) =====
  let crossStatus = "skipped";
  let loopsExecuted = 0;
  let criticalHighAddressed = 0;
  let postComments = [];
  let mediumLowCount = 0;
  if (input.options.with_cross_review) {
    const cr = await runCrossReviewLoop(input, body);
    if (cr.blocked) {
      return assembleBlocked(input, cr.reason, cr.blocking_findings, {
        design_plan_status: designStatus,
        cross_review_status: "blocked",
        loops_executed: cr.loops_executed || 0,
      });
    }
    body = cr.body;
    crossStatus = cr.status;
    loopsExecuted = cr.loops_executed;
    criticalHighAddressed = cr.critical_high_addressed;
    postComments = cr.post_create_comments;
    mediumLowCount = cr.medium_low_count;
  }

  // ===== Phase C: marker 埋込 + §8 Output contract 組立 (§8/§9) =====
  // 進捗 grouping のみ目的の dummy spawn は行わない (integrate は本文 mutation がある cross-review loop 内で実施済)。
  const finalBody = embedEnrichmentMarkers(body, {
    loops: loopsExecuted,
    designStatus,
    crossStatus,
  });

  return {
    result: "enriched",
    enriched_issue: {
      title: input.issue_draft.title,
      body: finalBody,
      labels_to_add: buildLabels(input),
      task_complexity: input.task_complexity,
    },
    post_create_comments: postComments,
    review_summary: {
      loops_executed: loopsExecuted,
      critical_high_addressed: criticalHighAddressed,
      medium_low_count: mediumLowCount,
      design_plan_status: designStatus,
      cross_review_status: crossStatus,
    },
    escalation_report: null,
    // --- additive (op-architect 向け、標準 3 caller は無視、§12 非破壊) ---
    design_plan: designPlan,
    apply_expert: applyExpert,
  };
} catch (e) {
  // §10 fail-safe (D8): 予期せぬ例外は result:blocked で人間判断に倒す。
  return {
    result: "blocked",
    escalation_report: {
      reason: "unexpected_error",
      blocking_findings: [],
      human_action_required: `enrichment workflow で予期せぬ例外: ${String(e && e.message ? e.message : e)}`,
    },
    review_summary: {
      loops_executed: 0,
      critical_high_addressed: 0,
      medium_low_count: 0,
      design_plan_status: "failed",
      cross_review_status: "skipped",
    },
  };
}

// ===== stage 関数 (phase() は body 冒頭で宣言済み。stage 内では呼ばず agent opts.phase で grouping = parallel race 回避) =====

// Design Plan を token-curation→component-selection→layout-composition→(motion-spec) の役スコープ
// designer-expert 連鎖で生成し、統合後 ux-ui-audit gate を 1 回かける (ADR-0012 決定2)。
// BLOCK 時は required_changes[].target_role から遡及開始役を決め、cache で前役文脈を保持したまま再生成する。
// pipeline()/parallel() は使わない — 役は 1 draft 内の直列依存連鎖 (fan-out ではない)。§5 判定マトリクス + §10 失敗ハンドリング保存。
async function runDesignPlanLoop(a) {
  const roles = a.design_roles; // controller 注入 (normalizeArgs default 補完済)
  const cache = {}; // 役戻りを round 跨ぎで保持 (前役文脈の継承、BLOCK 再生成時の断絶回避)
  let prevRequiredChanges = null;
  let startIndex = 0; // BLOCK 遡及開始役 index (純整数演算のみ)

  for (let round = 1; round <= 3; round++) {
    const built = await runRolePipeline(a, roles, cache, startIndex, prevRequiredChanges, round);
    if (built.blocked) return built; // strict spawn 失敗 / 未定義 role 参照 contract error
    if (built.failed) return built; // non-strict spawn 失敗 → failed (Plan は cache の範囲)

    // 統合後 gate 1 回 (layout/motion 役の design_plan_markdown を検証)。
    const gate = await agent(buildGatePrompt(a, built.design_plan_markdown), {
      label: `gate #${round}`,
      phase: "gate",
      schema: gateVerdictSchema,
      agentType: scopedAgentType("ux-ui-audit-expert"),
      model: "opus",
    });
    // §10: gate spawn 失敗 → non-strict は no-gate で埋込 continue (failed marker、Plan は保持) / strict は中断
    if (!gate) {
      if (a.options.strict) return { blocked: true, reason: "spawn_failure_strict" };
      return { status: "failed", design_plan_markdown: built.design_plan_markdown, apply_expert: built.apply_expert };
    }
    if (gate.verdict !== "BLOCK") {
      // PASS / PASS_WITH_NOTES → 確定 (§5 判定マトリクス)
      let md = built.design_plan_markdown;
      if (gate.verdict === "PASS_WITH_NOTES" && gate.audit_notes) {
        md = `${md}\n\n### Audit Notes\n\n${gate.audit_notes}`;
      }
      return { status: "generated", design_plan_markdown: md, apply_expert: built.apply_expert };
    }
    // BLOCK → target_role から遡及開始 index を決め、cache で前役を温存して再生成 (4-e)
    prevRequiredChanges = Array.isArray(gate.required_changes) ? gate.required_changes : [];
    startIndex = resolveRetryStartIndex(roles, gate.required_changes);
  }
  // 連続 3 回 BLOCK → 強制中断 (strict 無関係、§5 / §10)
  return { blocked: true, reason: "design_plan_block", blocking_findings: [] };
}

// 役を startIndex から末尾まで逐次 await で連結。cache に戻りを残し round 跨ぎで前役文脈を継承する。
// 成功時 {design_plan_markdown, apply_expert} / spawn 失敗時 {blocked|failed} を返す。
async function runRolePipeline(a, roles, cache, startIndex, prevRequiredChanges, round) {
  for (let i = startIndex; i < roles.length; i++) {
    const role = roles[i];
    const out = await agent(buildRolePrompt(a, role, cache, prevRequiredChanges), {
      label: `design:${role} #${round}`,
      phase: role,
      schema: roleSchema(role),
      agentType: scopedAgentType("designer-expert"),
      model: a.role_models[role] || ROLE_MODEL_FALLBACK[role] || "opus", // 役別 model (config 駆動、controller 注入最優先)
    });
    // §10: designer-expert spawn 失敗 → non-strict は failed (Plan は cache 範囲) / strict は中断
    if (!out) {
      if (a.options.strict) return { blocked: true, reason: "spawn_failure_strict" };
      const layout = cache["layout-composition"];
      return {
        failed: true,
        status: "failed",
        design_plan_markdown: layout ? layout.design_plan_markdown : null,
        apply_expert: layout ? (layout.apply_expert ?? null) : null,
      };
    }
    cache[role] = out;
    // 役間 contract: component が未定義 semantic role を参照したら contract error (gate 任せにしない)
    if (role === "component-selection") {
      const err = validateRoleConsumption(cache["token-curation"], out);
      if (err) return { blocked: true, reason: "design_plan_block", blocking_findings: [{ summary: err }] };
    }
  }
  // 最終統合 md = motion-spec があればそれ (layout を畳んで Motion 節追記済)、なければ layout-composition
  const finalOut = cache["motion-spec"] || cache["layout-composition"];
  if (!finalOut) {
    // 役構成異常 (layout 不在) — 構造上起きないが型安全に failed
    return { failed: true, status: "failed", design_plan_markdown: null, apply_expert: null };
  }
  return { design_plan_markdown: finalOut.design_plan_markdown, apply_expert: finalOut.apply_expert ?? null };
}

// component 役 consumes_roles が token 役 semantic_roles の部分集合かを検証。外れたら contract error 文字列を返す。
// gate に流す前に workflow JS 側で止める (未定義 role が静かに layout へ流れる + spawn 1 往復無駄を防ぐ)。
function validateRoleConsumption(tokenOut, compOut) {
  if (!tokenOut || !Array.isArray(tokenOut.semantic_roles)) return null; // token 役 skip 時 (役構成次第) は検証なし
  const defined = new Set(tokenOut.semantic_roles.map((r) => r.role));
  const referenced = (compOut.components || []).flatMap((c) => c.consumes_roles || []);
  const missing = [...new Set(referenced.filter((r) => !defined.has(r)))];
  return missing.length > 0
    ? `component 役が未定義 semantic role を参照: ${missing.join(", ")} (token-curation の semantic_roles に存在しない、contract error)`
    : null;
}

// role → StructuredOutput schema の dispatch (data-driven、if ネスト回避)。layout は designPlanSchema を再利用。
function roleSchema(role) {
  const map = {
    "token-curation": tokenCurationSchema,
    "component-selection": componentSelectionSchema,
    "layout-composition": designPlanSchema,
    "motion-spec": motionSpecSchema,
  };
  return map[role] || designPlanSchema;
}

// required_changes の target_role から「最も早い役 index」を求める (純整数、非決定 API 不使用)。
// target_role 不明時は integrator (layout-composition) から再生成 (motion があれば後続で再実行)。
function resolveRetryStartIndex(roles, requiredChanges) {
  let min = roles.length;
  (requiredChanges || []).forEach((rc) => {
    const tag = typeof rc === "object" && rc ? rc.target_role : null;
    const idx = tag ? roles.indexOf(tag) : -1;
    if (idx >= 0 && idx < min) min = idx;
  });
  if (min < roles.length) return min;
  const layoutIdx = roles.indexOf("layout-composition");
  return layoutIdx >= 0 ? layoutIdx : 0;
}

// cross-review の reviewer 数を severity / UI 影響 / task_complexity で削減する gating 関数 (§6 cost-control)。
// 「Medium 以下 ∩ 非 UI ∩ routine / extension」= 低コスト経路: 最初の 1 reviewer のみ実行する。
// Critical / High または UI 影響 (with_design_plan 有効) または design / integration / api-design 経路はフル review を維持する。
// 作成意図: Issue #757。with_cross_review=true 強制時でも実際の spawn 数を抑えるワークフロー内 gating。
//           controller pre-step の auto 経路 (severity high+ のみ有効) とは別レイヤーの追加削減。
function resolveReviewers(a) {
  const isHighSeverity = a.issue_draft.severity === "critical" || a.issue_draft.severity === "high";
  const hasUiImpact = a.options.with_design_plan === true || a.options.with_design_plan === "gate_only";
  const isComplexTask = ["design", "integration", "api-design"].includes(a.task_complexity);

  // フル review が必要な条件のいずれかに該当 → 全 reviewer を返す (現行動作を維持)
  if (isHighSeverity || hasUiImpact || isComplexTask) return a.cross_review_experts;

  // 低コスト経路: reviewer を先頭 1 件に削減 (配列が空の場合はそのまま返す)
  if (a.cross_review_experts.length === 0) return a.cross_review_experts;
  return [a.cross_review_experts[0]];
}

// cross-review を並列 spawn (index-zip) → judge → changes_requested は integrate → max_review_loops 内ループ。§6/§7/§10。
async function runCrossReviewLoop(a, initialBody) {
  let body = initialBody;
  let loopsExecuted = 0;
  let criticalHighAddressed = 0;
  let changedAtLeastOnce = false;
  // Medium/Low 指摘は round 跨ぎで累積 (changes_requested round の指摘が approve round で消えないよう、dedup して保持)。
  const allMediumLow = [];
  const seenML = new Set();
  const addMediumLow = (arr) => {
    arr.forEach((m) => {
      const key = `${m.severity}|${m.category}|${m.body}`;
      if (!seenML.has(key)) {
        seenML.add(key);
        allMediumLow.push(m);
      }
    });
  };
  const maxLoops = a.options.max_review_loops;
  // §6 cost-control gating: severity / UI 影響 / task_complexity で reviewer 数を削減する (Issue #757)。
  // 低コスト経路 (Medium 以下 ∩ 非 UI ∩ routine / extension) は先頭 1 reviewer のみ spawn する。
  // index-zip は削減後のリストに対して適用するため、元の cross_review_experts は変更しない。
  const activeReviewers = resolveReviewers(a);
  for (let loop = 1; loop <= maxLoops; loop++) {
    loopsExecuted = loop;
    // index-zip 維持 (filter しない、D7): reviewer↔結果を index で対応させ null=失敗 reviewer を特定する。
    const raw = await parallel(
      activeReviewers.map((rv) => () =>
        agent(buildCrossReviewPrompt(a, body, rv), {
          label: `xreview ${rv.name} L${loop}`,
          phase: "cross-review",
          schema: crossReviewSchema,
          agentType: scopedAgentType(rv.name),
          model: "opus",
        })
      )
    );
    const reviews = [];
    const failed = [];
    activeReviewers.forEach((rv, i) => {
      if (raw[i]) reviews.push({ ...raw[i], reviewer: rv.name });
      else failed.push(rv.name);
    });
    // §10: cross-review 一部 spawn 失敗 → strict は spawn_failure_strict 中断 / non-strict は残りで集約
    if (failed.length > 0 && a.options.strict) {
      return { blocked: true, reason: "spawn_failure_strict", blocking_findings: failed.map((n) => ({ reviewer: n, summary: "spawn 失敗 (strict)" })), loops_executed: loopsExecuted };
    }
    if (reviews.length === 0) {
      // 全 reviewer 失敗 (non-strict): ここは L477 (failed.length>0 && strict) を素通りした non-strict 確定経路。
      // #647 (B/b-2 graceful degrade): blocked で中断せず、Phase A 生成済み Design Plan を救って enriched を返す。
      // body には既に Design Plan が embed 済 (Phase B 前)。cross_review_status: "failed" marker で「review 不能のまま
      // 起票した」ことを可視化し、黙って un-reviewed issue を起票する masking を回避する (CLAUDE.md 不変則3:
      // non-strict は自動フローを停止しない)。strict 全滅は L477 で先行中断するためこの経路に来ない。
      return {
        body,
        status: "failed",
        loops_executed: loopsExecuted,
        critical_high_addressed: 0,
        post_create_comments: allMediumLow,
        medium_low_count: allMediumLow.length,
      };
    }

    const overall = aggregateVerdict(reviews);
    // §10: cross-review block → 強制中断 (strict 無関係)
    if (overall === "block") {
      return { blocked: true, reason: "cross_review_block", blocking_findings: collectBlockFindings(reviews), loops_executed: loopsExecuted };
    }
    const split = splitFindings(reviews);
    addMediumLow(split.mediumLow);
    if (overall === "approve") {
      return {
        body,
        status: changedAtLeastOnce ? "passed_with_changes" : "passed",
        loops_executed: loopsExecuted,
        critical_high_addressed: criticalHighAddressed,
        post_create_comments: allMediumLow,
        medium_low_count: allMediumLow.length,
      };
    }
    // overall === "changes_requested": Critical/High を本文統合 (§7/§8.1)
    if (split.criticalHigh.length > 0) {
      const integ = await agent(buildIntegratePrompt(a, body, split.criticalHigh), {
        label: `integrate L${loop}`,
        phase: "integrate",
        schema: integrateSchema,
        agentType: scopedAgentType(a.issue_draft.recommended_runner || "feature-expert"),
        model: "opus",
      });
      if (integ && integ.merged_body) {
        body = integ.merged_body;
        criticalHighAddressed += Number.isInteger(integ.critical_high_addressed)
          ? integ.critical_high_addressed
          : split.criticalHigh.length;
        changedAtLeastOnce = true;
      }
    }
    if (loop >= maxLoops) {
      // §10: max_review_loops 到達後も changes_requested → strict は max_loops_exceeded / non-strict は enriched
      if (a.options.strict) {
        return { blocked: true, reason: "max_loops_exceeded", blocking_findings: split.criticalHigh, loops_executed: loopsExecuted };
      }
      return {
        body,
        status: "passed_with_changes",
        loops_executed: loopsExecuted,
        critical_high_addressed: criticalHighAddressed,
        post_create_comments: allMediumLow,
        medium_low_count: allMediumLow.length,
      };
    }
    // loops 残あり → 本文反映済 body で再 cross-review (Phase 4 から再実行)
  }
  // 到達しない (loop 内で必ず return) が型安全のため
  return { body, status: "passed_with_changes", loops_executed: loopsExecuted, critical_high_addressed: criticalHighAddressed, post_create_comments: allMediumLow, medium_low_count: allMediumLow.length };
}

// ===== helpers =====

// review_result を block > changes_requested > approve の最大値で集約 (§7)。
function aggregateVerdict(reviews) {
  if (reviews.some((r) => r.review_result === "block")) return "block";
  if (reviews.some((r) => r.review_result === "changes_requested")) return "changes_requested";
  return "approve";
}

// 全 review の findings を severity で Critical/High (本文反映) と Medium/Low (post_create_comments) に振り分ける (§7)。
function splitFindings(reviews) {
  const criticalHigh = [];
  const mediumLow = [];
  reviews.forEach((r) => {
    (r.findings || []).forEach((f) => {
      if (f.severity === "critical" || f.severity === "high") {
        criticalHigh.push({ ...f, reviewer: r.reviewer });
      } else {
        mediumLow.push({ severity: f.severity, category: f.category, body: f.suggested_change || f.summary });
      }
    });
  });
  return { criticalHigh, mediumLow };
}

// block を返した reviewer の findings (なければ全 Critical/High) を escalation_report.blocking_findings 用に収集。
function collectBlockFindings(reviews) {
  const out = [];
  reviews
    .filter((r) => r.review_result === "block")
    .forEach((r) => (r.findings || []).forEach((f) => out.push({ ...f, reviewer: r.reviewer })));
  return out.length > 0 ? out : splitFindings(reviews).criticalHigh;
}

// 検出 expert + **apply / post-check 役を兼ねる** cross-reviewer の pro-* ラベル群 (§8 labels_to_add、#642)。
// 純粋な品質レビュー役 (apply も post-check もしない cross-reviewer) には pro-* を付けない:
// pro-* は「この expert の作業 (apply/post-check) が必要」の signal であり、品質 review の provenance は
// 本文・集約コメントで担保される。reviewer が apply/post-check 役かは controller が §6 担当表の意味論から
// `cross_review_experts[].applies_or_post_checks` (bool) で注入する。未注入 (旧 caller) は false=ラベル付けない
// 安全側に倒す (over-label がバグ本体のため、迷ったら付けない方向 = noise を出さない)。
function buildLabels(a) {
  const set = [];
  const add = (name) => {
    if (name && !set.includes(`pro-${name}`)) set.push(`pro-${name}`);
  };
  add(a.issue_draft.recommended_runner);
  if (a.options.with_cross_review) {
    a.cross_review_experts.forEach((rv) => {
      if (rv.applies_or_post_checks === true) add(rv.name);
    });
  }
  return set;
}

// Design Plan Markdown を本文末尾に ## 🎨 Design Plan 節として埋込 (§8.1、op-architect フェーズ5-1 と同節名)。
function embedDesignPlan(body, md) {
  return `${body}\n\n## 🎨 Design Plan\n\n${md}\n`;
}

// enrichment marker 4 種を本文冒頭に prepend (§9。caller の op-domain 等 marker と同ブロック扱い)。
function embedEnrichmentMarkers(body, m) {
  const markers = [
    "<!-- op-enriched: true -->",
    `<!-- op-enrichment-loops: ${m.loops} -->`,
    `<!-- op-enrichment-design-plan: ${m.designStatus} -->`,
    `<!-- op-enrichment-cross-review: ${m.crossStatus} -->`,
  ].join("\n");
  return `${markers}\n${body}`;
}

// result:blocked の §8 Output を組立てる (起票しない / escalation_report 提示)。
function assembleBlocked(a, reason, blockingFindings, summaryStatus) {
  return {
    result: "blocked",
    escalation_report: {
      reason,
      blocking_findings: blockingFindings || [],
      human_action_required: blockedHumanAction(reason),
    },
    review_summary: {
      loops_executed: summaryStatus.loops_executed || 0,
      critical_high_addressed: 0,
      medium_low_count: 0,
      design_plan_status: summaryStatus.design_plan_status,
      cross_review_status: summaryStatus.cross_review_status,
    },
  };
}

function blockedHumanAction(reason) {
  const map = {
    design_plan_block: "Design Plan が連続 3 回 BLOCK。UI 設計方針を人間が見直すか op-architect で再設計する。",
    cross_review_block: "cross-review で block 指摘あり。Issue 方向性を人間が再検討する。",
    spawn_failure_strict: "strict モードで expert spawn が失敗。再実行するか strict を外す。",
    max_loops_exceeded: "strict モードで max_review_loops 内に収束せず。指摘を反映して再起票するか strict を外す。",
    unexpected_error: "enrichment workflow で予期せぬ例外。手動で確認する。",
  };
  return map[reason] || "enrichment が中断。人間が確認する。";
}

// ===== args 正規化 + 入力アサーション (Workflow input には schema 強制が無いため entry で fail-fast) =====
function normalizeArgs() {
  const a = typeof args === "string" ? JSON.parse(args) : args;
  if (!a) throw new Error("op-enrichment: args missing");
  const d = a.issue_draft;
  if (!d || typeof d !== "object") throw new Error("op-enrichment: args.issue_draft (object) required");
  for (const k of ["title", "body", "severity", "domain", "recommended_runner"]) {
    if (!d[k]) throw new Error(`op-enrichment: issue_draft.${k} required`);
  }
  const o = a.options;
  if (!o || typeof o !== "object") throw new Error("op-enrichment: args.options (object) required");
  if (o.with_design_plan !== true && o.with_design_plan !== false && o.with_design_plan !== "gate_only")
    throw new Error(
      "op-enrichment: options.with_design_plan must be boolean or 'gate_only' (controller が auto→bool 解決、D11 / ADR-0013 決定C)"
    );
  if (typeof o.with_cross_review !== "boolean")
    throw new Error("op-enrichment: options.with_cross_review must be boolean (controller が auto→bool 解決、D11)");
  if (!Number.isInteger(o.max_review_loops) || o.max_review_loops < 1)
    throw new Error("op-enrichment: options.max_review_loops must be a positive integer");
  if (typeof o.strict !== "boolean") throw new Error("op-enrichment: options.strict must be boolean");
  if (!a.task_complexity) throw new Error("op-enrichment: args.task_complexity required (controller pre-step、D11)");
  if (!a.today)
    throw new Error("op-enrichment: args.today (YYYY-MM-DD) required (agent 側 日付実行禁止 = F2 対策)");
  if (!Array.isArray(a.cross_review_experts)) a.cross_review_experts = [];
  if (o.with_cross_review && a.cross_review_experts.length === 0)
    throw new Error("op-enrichment: with_cross_review=true には cross_review_experts (controller が §6 担当表で解決) が必須");
  for (const rv of a.cross_review_experts) {
    if (!rv.name) throw new Error("op-enrichment: cross_review_experts[].name required");
    // #642: apply/post-check 役か (pro-* ラベル付与可否)。controller 注入の optional bool。未注入は false 安全側。
    if (rv.applies_or_post_checks !== true) rv.applies_or_post_checks = false;
  }
  // ===== ADR-0012 additive: design 系は optional + default 補完 (必須 throw 禁止 = 旧 caller 無破壊) =====
  // design_depth 未注入時は with_design_plan から導出 (true→full で旧 caller も Design Plan を失わない、false→none)。
  if (!a.design_depth) a.design_depth = o.with_design_plan ? "full" : "none";
  if (!Array.isArray(a.design_roles) || a.design_roles.length === 0) {
    a.design_roles =
      a.design_depth === "light"
        ? ["token-curation", "layout-composition"]
        : ["token-curation", "component-selection", "layout-composition"]; // full 既定 3 役 (none でも参照されないが補完)
  }
  if (!a.role_models || typeof a.role_models !== "object") a.role_models = {};
  if (typeof a.foundation_exists !== "boolean") a.foundation_exists = false; // controller 注入の fallback (foundation 不在扱い)
  // ADR-0013 決定C: with_design_plan='gate_only' = 提示済 Design Plan を再生成せず gate のみ (op-explore handoff)。
  a.gate_only = o.with_design_plan === "gate_only";
  return a;
}

// ===== gate_only (ADR-0013 決定C): 提示済 Design Plan を再生成せず ux-ui-audit gate だけ実行する =====
// 役 pipeline (token→…→layout) を走らせない。BLOCK は再生成できない (= gate_only の主旨) ため design_plan_block で人間へ。
async function runGateOnlyDesignPlan(a) {
  const provided = extractDesignPlan(a.issue_draft.body);
  if (!provided) return { fallback: true }; // 本文に `## 🎨 Design Plan` 節が無い → 通常生成へフォールバック
  const gate = await agent(buildGatePrompt(a, provided), {
    label: "gate (gate_only)",
    phase: "gate",
    schema: gateVerdictSchema,
    agentType: scopedAgentType("ux-ui-audit-expert"),
    model: "opus",
  });
  if (!gate) {
    if (a.options.strict) return { blocked: true, reason: "spawn_failure_strict" };
    return { status: "failed", design_plan_markdown: provided, apply_expert: null, audit_notes: null };
  }
  if (gate.verdict === "BLOCK") {
    const rc = Array.isArray(gate.required_changes) ? gate.required_changes : [];
    const blocking = rc.map((c) =>
      typeof c === "string" ? { summary: c } : { summary: c.summary || c.change || JSON.stringify(c) }
    );
    return { blocked: true, reason: "design_plan_block", blocking_findings: blocking };
  }
  // gate_only 成功は marker 上「generated」に収める (本文に確定 Design Plan が存在し gate 通過済 =
  // 既存 4 値の generated と downstream 意味が同一。新 enum 値を増やさない = 不変則1 / marker schema 安定、ADR-0013 決定C)。
  return {
    status: "generated",
    design_plan_markdown: provided,
    apply_expert: null,
    audit_notes: gate.verdict === "PASS_WITH_NOTES" ? gate.audit_notes || null : null,
  };
}

// 本文から `## 🎨 Design Plan` 節を抽出する (embedDesignPlan と対称、次の H2 or EOF まで)。
function extractDesignPlan(body) {
  if (typeof body !== "string") return null;
  const marker = "## 🎨 Design Plan";
  const idx = body.indexOf(marker);
  if (idx < 0) return null;
  const after = body.slice(idx + marker.length);
  const nextH2 = after.search(/\n##\s/);
  const section = nextH2 >= 0 ? after.slice(0, nextH2) : after;
  const trimmed = section.trim();
  return trimmed.length > 0 ? trimmed : null;
}

// ===== prompt builders (issue-enrichment.md §5/§6 を verbatim 移植。SKILL.md 非参照前提で Policy を inline 埋込) =====

// 役別 prompt の共通組立 (共通ヘッダ + 役固有本体 roleBody + 前役 cache 注入 + 前回 gate Required Changes 注入)。
// 旧 buildDesignPlanPrompt の単発 Design Plan を ADR-0012 多役 pipeline に置換 (役は roleBody が分岐)。
function buildRolePrompt(a, role, cache, prevRequiredChanges) {
  const d = a.issue_draft;
  const lines = [
    "invocation_mode: op_managed",
    "",
    `あなたは designer-expert (role=${role}, Architect Mode) です。`,
    "Issue Enrichment 層 (Workflow) の design 多役 pipeline から呼ばれた OP-managed Mode 起動です。",
    "実装はしません (実装は後で op-run の designer-expert Run Mode が担います)。コードを変更しない (Read / Grep / Glob のみ)。",
    "出力は spec (Markdown / 構造化) のみで、実 token .ts / .vue は生成しない。",
    "",
    "You must not ask interactive questions. Do not stop and wait for commander or user replies.",
    '判断不能なら design_assumptions[] と needs_human_decision (decision_type: "design") で返す。Free-form question text は禁止。',
    "",
    `【実行日】today: ${a.today} (agent 側で日付を実行・推測しない)`,
    "",
    "【プロジェクト種別】",
    a.project_type || "(controller が project-profile.md から取得して注入。未注入時はリポジトリから推定)",
    "",
    "【マイルストーン (issue_draft 由来)】",
    `- title: ${d.title}`,
    `- domain: ${d.domain}`,
    `- recommended_runner: ${d.recommended_runner}`,
    `- scope_files: ${JSON.stringify(d.scope_files || [])}`,
    `- new_files: ${JSON.stringify(d.new_files || [])}`,
    "",
    "【issue_draft.body (success_criteria 抽出元)】",
    d.body,
    "",
  ];
  roleBody(role, a, cache).forEach((l) => lines.push(l));
  if (prevRequiredChanges && prevRequiredChanges.length > 0) {
    lines.push(
      "",
      "★【前回 gate の Required Changes (BLOCK → 再作成)】",
      "前回の統合 Design Plan は ux-ui-audit gate で BLOCK されました。あなたの役に関係する以下の指示を反映して再作成する:",
      ...prevRequiredChanges.map((c) => `- ${typeof c === "object" && c ? JSON.stringify(c) : c}`)
    );
  }
  return lines.join("\n");
}

// 役固有の依頼本体 (string[])。token 権限 / 前役 consume / 統合 / motion を dispatch table で分岐 (if ネスト回避)。
function roleBody(role, a, cache) {
  const tokenOut = cache["token-curation"];
  const compOut = cache["component-selection"];
  const layoutOut = cache["layout-composition"];
  const bodies = {
    "token-curation": () => [
      "【役割: token-curation (foundation token 整備)】",
      a.foundation_exists
        ? "このプロジェクトには foundation token system が既存です (foundation_exists=true)。あなたは per-feature 役 = 参照のみ。既存 canonical token を semantic role に割り当てる。新規 token の発明・追加はしない (ad-hoc #hex/px の token 化禁止)。不足は design_assumptions[]、foundation 拡張要は needs_human_decision で返す。"
        : "このプロジェクトには foundation token system が未整備です (foundation_exists=false)。あなたは foundation 役 = add + normalize 権限。不在の semantic token を既存 scale (color/spacing/radius/typography 等) に整合させ正規化して spec として追加してよい (実書込は op-run apply、ここは spec のみ)。ad-hoc 直値の token 化禁止、必ず scale 準拠 + semantic 命名。",
      "~/.claude/skills/expert-design/SKILL.md / references の token 整備方法論に従う。",
      "",
      "【出力 (tokenCurationSchema)】",
      "- semantic_roles[]: {role (例: color-warning / spacing-card-gap), token_ref (canonical token 名), normalized (正規化追加したか), scale (準拠 scale)}",
      "  後続の component-selection / layout-composition 役がこの role 名を消費する。命名は安定・一意にする。",
      "- token_fragment_markdown: pr-templates.md の Design Plan『### Tokens to Use』節の断片 (Markdown)。",
    ],
    "component-selection": () => [
      "【役割: component-selection (デザインコンポーネント選定)】",
      "前役 token-curation が定めた semantic role を消費し、画面に使う既存コンポーネントを選定する。",
      "既存資産を優先し silent fork を避ける (新規コンポーネント乱造禁止、既存 variant / prop で表現できないかを先に検討)。",
      "**未定義の semantic role を consumes_roles に書かない** (token-curation の semantic_roles に無い role は contract error で pipeline が停止する)。",
      "",
      "【前役 (token-curation) の出力】",
      `- semantic_roles: ${JSON.stringify((tokenOut && tokenOut.semantic_roles) || [])}`,
      "- token fragment:",
      (tokenOut && tokenOut.token_fragment_markdown) || "(token-curation 役なし)",
      "",
      "【出力 (componentSelectionSchema)】",
      "- components[]: {name, consumes_roles (token-curation の role を参照)}",
      "- component_fragment_markdown: pr-templates.md の Design Plan『### Components to Use』節の断片 (Markdown)。",
    ],
    "layout-composition": () => [
      "【役割: layout-composition (UI 画面設計 + 統合 = 最終 stage)】",
      "前役までの Tokens / Components 断片を畳み込み、**統合 Design Plan を Markdown 1 本**にまとめる。これが gate にかけられる最終成果物。",
      "~/.claude/skills/expert-design/SKILL.md の「Design Plan 出力フォーマット」+ ~/.claude/skills/_shared/pr-templates.md の「op-architect / op-run: Design Plan」テンプレに従い、以下を含める:",
      "- User Goal / Current UX/UI Problem / Design Intent",
      "- Components to Use / Tokens to Use / Applicable States",
      "  (UI 種別ごとに該当する state のみ列挙。該当しない state は not_applicable_reason を 1 行添える)",
      "- Layout Strategy / Accessibility Requirements / Implementation Boundaries / Verification",
      "節間整合を check する: component が token-curation の semantic role を正しく消費しているか、断片間に矛盾がないか。",
      "~/.claude/skills/expert-design/references/visual-quality-rubric.md の 5 軸で自己採点し、低い軸は Design Intent で補強する。",
      "",
      "【前役の出力 (統合元)】",
      `- Tokens (semantic_roles): ${JSON.stringify((tokenOut && tokenOut.semantic_roles) || [])}`,
      (tokenOut && tokenOut.token_fragment_markdown) || "(token fragment なし)",
      `- Components: ${JSON.stringify((compOut && compOut.components) || [])}`,
      (compOut && compOut.component_fragment_markdown) || "(component fragment なし、light 経路では token から直接統合)",
      "",
      "【出力 (designPlanSchema)】",
      "- design_plan_markdown: 上記断片を統合した Design Plan 全文 (Markdown)。空不可。",
      "- apply_expert: apply 担当 (designer-expert | feature-expert) を入れる (op-architect 経路で転写)。",
      "- design_assumptions[] / needs_human_decision: 判断不能・③④ bespoke animation 等で design-spike が要るときに使う。",
    ],
    "motion-spec": () => [
      "【役割: motion-spec (motion 設計 = 条件付き additive layer)】",
      "前役 layout-composition の統合 Design Plan に **『### Motion Strategy』節を追記**する (data-viz の Chart Strategy と同形式の additive)。",
      "~/.claude/skills/expert-design/references/motion-patterns.md に従う: motion token scale を使い、AI 到達ライン①② (宣言的 transition) を主とし、③④ (orchestrated / 物理 spring / novel) が必要なら design_assumptions + needs_human_decision (design-spike) で human に委ねる。",
      "性能ガード (transform / opacity のみ) と prefers-reduced-motion を必ず明記。Static Hard blocker に該当する設計は避ける。",
      "",
      "【統合元 (layout-composition の統合 Design Plan)】",
      (layoutOut && layoutOut.design_plan_markdown) || "(layout-composition 出力なし)",
      "",
      "【出力 (motionSpecSchema)】",
      "- design_plan_markdown: 上記統合 Design Plan に Motion Strategy 節を追記した **全文** (Markdown)。空不可。元の節は消さない。",
      "- motion_tokens[]: 使用する motion token (例: --motion-duration-fast)。",
      "- needs_human_decision: ③④ bespoke animation で design-spike が要るとき。",
    ],
  };
  return (bodies[role] || bodies["layout-composition"])();
}

// Design Plan gate prompt (§5 Phase 3、L282-314)。6 観点 (+ motion 時 観点7) で PASS/PASS_WITH_NOTES/BLOCK。
// ADR-0012 Wave4: design_roles に motion-spec を含む (= motion 役が走った) ときだけ観点7 を additive 提示する。
function buildGatePrompt(a, designPlanMarkdown) {
  const d = a.issue_draft;
  const motionInScope = Array.isArray(a.design_roles) && a.design_roles.includes("motion-spec");
  return [
    "invocation_mode: op_managed",
    "",
    "あなたは ux-ui-audit-expert (gate Mode) です。",
    "Issue Enrichment 層 (Workflow) から呼ばれた OP-managed Mode 起動です。",
    "designer-expert が作成した Design Plan を独立に検証し、PASS / PASS_WITH_NOTES / BLOCK の判定を返してください。",
    "コードを変更しない (Read / Grep / Glob のみ)。",
    "",
    "You must not ask interactive questions.",
    "Return one of: PASS / PASS_WITH_NOTES / BLOCK。Free-form question text は禁止。情報不足時は needs_human_decision を使う。",
    "",
    `【実行日】today: ${a.today} (agent 側で日付を実行・推測しない)`,
    "",
    "【マイルストーン】",
    `- title: ${d.title}`,
    "- success_criteria: 下記 Issue body / Design Plan から読み取ること",
    "",
    "【issue_draft.body】",
    d.body,
    "",
    "【Design Plan (designer-expert 出力)】",
    designPlanMarkdown,
    "",
    `【検証】~/.claude/skills/expert-ux-ui-audit/SKILL.md の gate モード節に従い ${motionInScope ? "7" : "6"} 観点をチェック:`,
    "1. 次の行動が明確になる設計か",
    "2. 必須 UI state が網羅されているか",
    "3. エラー復帰導線が設計されているか",
    "4. 業務フローに合った画面構成か",
    "5. accessibility 要件が十分か",
    "6. 見た目に寄りすぎていないか",
    // 観点7 (motion) は conditional additive (ADR-0012 Wave4)。Motion Strategy 節がなければ N/A。
    ...(motionInScope
      ? [
          "7. motion 安全性 (Design Plan に ### Motion Strategy 節がある場合のみ評価): 前庭障害トリガ (大きな視差・回転・ズーム) を含まず、prefers-reduced-motion fallback と性能ガード (transform/opacity のみ、layout-triggering プロパティを animate しない) を備えるか。motion 節が無ければ N/A (起票しない)。motion の質 (timing の自然さ) は完全静的では検証不能 = Static Hard blocker の有無のみ BLOCK 可。基準は ~/.claude/skills/expert-design/references/motion-patterns.md。",
        ]
      : []),
    "",
    "【出力】gateVerdictSchema で返す。",
    "- verdict: PASS / PASS_WITH_NOTES / BLOCK",
    "- BLOCK のときは required_changes[] に再作成のための具体的指示を必ず入れる (designer が次 round で反映する)。",
    '  各要素には target_role (token-curation | component-selection | layout-composition | motion-spec) を付けた object 形式が望ましい',
    '  (どの役から再生成すべきかを示す。例: {"target_role":"component-selection","change":"..."})。文字列のみでも可。',
    "- PASS_WITH_NOTES のときは audit_notes に追記内容を入れる",
    "- gate_report_markdown に ~/.claude/skills/_shared/pr-templates.md の「op-architect: UX/UI Audit Gate Result」テンプレ準拠の判定根拠を入れる",
  ].join("\n");
}

// cross-review prompt (§6、L359-395)。検出 expert 以外が read-only review。
function buildCrossReviewPrompt(a, body, rv) {
  const d = a.issue_draft;
  return [
    "invocation_mode: op_managed",
    "",
    `あなたは ${rv.name} (review Mode) です。`,
    "Issue Enrichment 層 (Workflow) から呼ばれた OP-managed Mode 起動です。",
    "以下の Issue draft (Design Plan 埋め込み済) を read-only でレビューし、本文の品質と方向性に対する指摘を crossReviewSchema で返してください。",
    "",
    "You must not ask interactive questions.",
    "apply / 修正 / commit / push は禁止 (review-expert と同じ責務、Read / Grep / Glob のみ)。判断不能なら needs_human_decision を使う。",
    "",
    `【実行日】today: ${a.today} (agent 側で日付を実行・推測しない)`,
    `【検出 expert (recommended_runner)】${d.recommended_runner} / 【severity】${d.severity} / 【domain】${d.domain}`,
    "",
    "【Issue draft (title + body + Design Plan)】",
    `# ${d.title}`,
    "",
    body,
    "",
    "【レビュー観点】自分の expert domain に基づいて以下を検証:",
    "- success_criteria が十分か",
    "- scope_files の漏れ / 過剰がないか",
    "- success / failure path のカバレッジが十分か",
    "- domain-specific な観点 (例: security なら 8 観点、test なら test plan の妥当性)",
    "- 既存資産の silent fork リスクがないか",
    "",
    "【出力 (crossReviewSchema)】",
    "- review_result: approve | changes_requested | block",
    "- findings[]: {severity (critical|high|medium|low), category, summary, suggested_change}",
    "  Critical/High は本文反映、Medium/Low は起票後コメントに分離される (severity を正確に付ける)。",
    "- block は「品質的に不適格」を意味する明示判断 (起票中断)。方向性 OK だが改善要なら changes_requested。",
    "- needs_human_decision: null | {decision_type, question}",
  ].join("\n");
}

// integrate prompt (§7/§8.1)。Critical/High 指摘を本文へ自然文で統合する read-only 編集 (repo は触らない、Issue 本文 string のみ生成)。
function buildIntegratePrompt(a, body, criticalHighFindings) {
  const d = a.issue_draft;
  return [
    "invocation_mode: op_managed",
    "",
    `あなたは ${d.recommended_runner || "feature-expert"} です。`,
    "Issue Enrichment 層 (Workflow) から呼ばれた OP-managed Mode 起動です。",
    "cross-review で挙がった Critical/High 指摘を、以下の Issue 本文に **自然文で統合反映** してください。",
    "",
    "【重要 — read-only】これは Issue 本文 (Markdown 文字列) の編集のみです。リポジトリのコード / ファイルは一切変更しない。",
    "commit / push / gh issue create はしない (それらは controller 責務)。merged_body に統合後の Issue 本文全文を返すだけ。",
    "You must not ask interactive questions.",
    "",
    "【統合ポリシー (§8.1)】",
    "- Critical/High 指摘の反映先は **該当する既存節** (success_criteria への追加 / 触ってよいファイルへの追加 / verification_steps への追加 等)。",
    "  新節を生やすのは反映先が既存節に収まらない場合のみ。",
    "- 「Cross-Review Result:」のような独立節を強制しない。本文に自然に溶け込ませる。",
    "- 既存の hidden marker (HTML コメント) / ## 🎨 Design Plan 節は保持する (消さない)。",
    "- 箇条書き強制 / 機械生成感を避け、人間が読みやすい自然文にする。",
    "",
    "【統合すべき Critical/High 指摘】",
    JSON.stringify(criticalHighFindings),
    "",
    "【現在の Issue 本文】",
    body,
    "",
    "【出力 (integrateSchema)】merged_body に統合後の Issue 本文全文 (Markdown) を入れる。critical_high_addressed に反映した指摘件数を入れる。",
  ].join("\n");
}
