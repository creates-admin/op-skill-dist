/**
 * 機能概要:
 *   op-run フェーズ1-2 clustering の案出しを judge-panel 化する Dynamic Workflow (ADR-0014 Wave A、ADR-0009 L157)。
 *   「どう束ね並列化するか」の単発推論 (clustering.md Step4-6 = grouping / confidence / expert アサイン) を
 *   N 案を別角度で並列生成 → JS 採点 → opus evaluator で ranked 化する案 fan-out に置き換える。
 *   2 phase を実行する:
 *     1. generate (案出し): N angle (標準 / risk-first / throughput-first ...) を flat 並列 spawn (sonnet 既定)。
 *                          各 angle が enriched issues を入力に候補 ClusterPlan (clusters[]) を独立生成する。
 *     2. evaluate (評価)  : JS で各候補を多次元採点 (conflict_exposure / parallelism / balance / confidence / cap)
 *                          → opus evaluator が score vector + 候補を見て recommended_angle + rationale を確定。
 *   workflow は **ranked 候補 + score + 推奨のみ return** する。**確定 (どの案を採るか) は controller + 人間 gate**
 *   (ExitPlanMode / --auto は recommended 自動選択) が行う (ADR-0009 L158 境界、案出し=workflow / 確定=司令官+人間)。
 *
 * 作成意図:
 *   clustering は「単発 / 不可逆 / 深い推論」で 1 案しか起こさず、低 tier model で品質劣化する (ADR-0009 L20)。
 *   depth は controller の effort pin (PR #611) + opus evaluator (model pin) が、breadth は本 judge-panel (N 案) が担う。
 *   ADR-0011 review (観点 fan-out) の「調査/ゲート分離」を向き反転 (案 fan-out) で再利用: 案出しは sonnet で安く広く、
 *   opus evaluator が score vector を見て tradeoff を裁定する (throughput vs risk は文脈依存ゆえ機械総和では決まらない)。
 *
 * 注意点:
 *   - 全 phase exploration-only。コードを編集・commit・push しない (案出しのみ)。
 *   - workflow は shell-out 不可 (ADR-0009): `op cluster max-parallel` は呼べない。JS 採点は純 proxy のみ。
 *     正確な density-based 並列度は controller が選定後に既存フロー (フェーズ1-2-f / 2-B) で算出する。
 *   - Step1-3 (file/module/category 抽出) は controller が prep 実施し enriched issues として args 注入する
 *     (3 angle が同一入力を共有 = 公平比較)。workflow は Step4-6 (grouping) のみ担う。
 *   - **args は Workflow tool から JSON 文字列で到着する** (reference_workflow_tool_api_gotchas)。normalizeArgs() で parse。
 *   - REAL_API 準拠: export const meta (pure literal 第一文) / phase() は body 冒頭のみ / 非決定 API 不使用。
 *   - candidate の clusters[] は op-core ClusterPlan schema (cluster_id/issues[]/primary_runner/post_check_expert/
 *     files[]/global_conflict_files[]/confidence/needs_serialization) に一致させる (controller が選定案をそのまま manifest 化)。
 */

export const meta = {
  name: "op-run-judge-clustering",
  description:
    "op-run フェーズ1-2 clustering judge-panel (ADR-0014 Wave A): N 案を別角度 (標準/risk-first/throughput-first) で並列生成 (sonnet) → JS 多次元採点 → opus evaluator で ranked 化し、候補 ClusterPlan + score + 推奨を返す。確定 (案選定) と max-parallel 算出・claim・起票は controller 保持 (案出し=workflow / 確定=司令官+人間 gate)",
  phases: [{ title: "generate" }, { title: "evaluate" }],
};

// candidate 1 件 = 1 angle が生成する ClusterPlan。clusters[] は op-core ClusterPlan schema に一致させる。
const candidatePlanSchema = {
  type: "object",
  required: ["angle", "clusters"],
  properties: {
    angle: { type: "string" },
    angle_rationale: { type: "string" },
    clusters: {
      type: "array",
      items: {
        type: "object",
        required: ["cluster_id", "issues", "primary_runner", "confidence", "needs_serialization"],
        properties: {
          cluster_id: { type: "string" },
          issues: { type: "array", items: { type: "number" } },
          primary_runner: { type: "string" },
          post_check_expert: { type: ["string", "null"] },
          files: { type: "array", items: { type: "string" } },
          global_conflict_files: { type: "array", items: { type: "string" } },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
          needs_serialization: { type: "boolean" },
          group_rationale: { type: "string" },
        },
      },
    },
  },
};

// evaluate: opus evaluator が score vector + 候補を見て確定する裁定。
const evaluatorSchema = {
  type: "object",
  required: ["recommended_angle", "rationale", "ranking"],
  properties: {
    recommended_angle: { type: "string" },
    rationale: { type: "string" },
    ranking: {
      type: "array",
      items: {
        type: "object",
        required: ["angle", "rank"],
        properties: {
          angle: { type: "string" },
          rank: { type: "number" },
          assessment: { type: "string" },
        },
      },
    },
    // runner-up からの良い grouping の graft 提案 (任意。controller が選定後に検討する材料)。
    synthesis_notes: { type: "string" },
  },
};

// 標準 angle カタログ (op-config で上書き可能、controller が args.angles で注入)。
// key = enum / focus = generator prompt 強調用 1 行。
const DEFAULT_ANGLES = [
  { key: "standard", focus: "(module, category) の自然な直積。clustering.md Step4 の決定論的 baseline を踏襲する保守案" },
  { key: "risk-first", focus: "global_conflict_files への露出を最小化。衝突ファイルを触る cluster を孤立・直列化し安全性を最大化" },
  { key: "throughput-first", focus: "並列度を最大化。需要があれば小さく多数の cluster に割り、直列依存を最小化して wall-clock を縮める" },
];

const input = normalizeArgs();

phase("generate");

// --- plugin scoped-name: Workflow agent() の agentType は plugin 登録名 (op-skill:<name>) で解決する ---
// built-in (general-purpose/Explore/Plan) は plugin component でないため bare 維持。data (expert 名等) は
// bare 正本、spawn 境界でのみ前置する (skills/_shared/expert-spawn.md「Plugin scoped-name 規約」)。
const BUILTIN_AGENTS = new Set(["general-purpose", "Explore", "Plan"]);
const scopedAgentType = (n) => (n && !BUILTIN_AGENTS.has(n) ? `op-skill:${n}` : n);
log(
  `op-run-judge-clustering (ADR-0014 Wave A): ${input.issues.length} issue(s) / ${input.angles.length} angle(s) ` +
    `[${input.angles.map((a) => a.key).join(", ")}] models gen=${input.models.generate}/eval=${input.models.evaluate}`
);

// Phase generate: N angle を flat 並列で独立生成 (失敗 angle は filter せず index 保持、空 batch 扱い)。
const rawCandidates = await parallel(
  input.angles.map((angle) => () =>
    agent(buildGeneratePrompt(angle, input), {
      label: `generate:${angle.key}`,
      phase: "generate",
      schema: candidatePlanSchema,
      agentType: scopedAgentType("feature-expert"),
      model: input.models.generate,
    })
  )
);

// 採点前に candidate を検証 (全 issue が過不足なく割当てられているか)。不正 candidate は drop し可視化する。
const issueNumbers = input.issues.map((i) => i.number);
const candidates = [];
const dropped = [];
input.angles.forEach((angle, idx) => {
  const c = rawCandidates[idx];
  if (!c || !Array.isArray(c.clusters)) {
    dropped.push({ angle: angle.key, reason: "generator returned no clusters" });
    return;
  }
  const problem = validateCandidate(c, issueNumbers);
  if (problem) {
    dropped.push({ angle: c.angle || angle.key, reason: problem });
    return;
  }
  candidates.push({ ...c, score: computeScore(c, input.global_conflict_files, input.cap) });
});

// 全 candidate が drop した場合は controller が単発 fallback できるよう構造化エラーを返す (silent 成功を防ぐ)。
if (candidates.length === 0) {
  return { ok: false, reason: "all candidates invalid", dropped, candidates: [], recommended: null };
}

// JS default ranking (total 降順)。opus evaluator はこれを参考に tradeoff を裁定する。
const jsRanked = candidates.slice().sort((a, b) => b.score.total - a.score.total).map((c) => c.angle);

phase("evaluate");
// Phase evaluate: opus evaluator が score vector + 候補を見て recommended_angle を確定する。
const verdictRaw = await agent(buildEvaluatePrompt(candidates, jsRanked, input), {
  label: "evaluate",
  phase: "evaluate",
  schema: evaluatorSchema,
  agentType: scopedAgentType("feature-expert"),
  model: input.models.evaluate,
});

// evaluator agent の spawn 失敗 (null 戻り) を未ガード deref で uncaught throw させない。
// generate 側 (最高コストの N 並列 spawn) は完了済のため、ここで throw すると生成済 candidates が全喪失する。
// null 時は JS default ranking (jsRanked) へ degrade する空 verdict にフォールバックし、下流の幻覚 angle
// ガード (jsRanked[0] 矯正) にそのまま乗せる (generate 側の if(!c) null 構造化処理と対称)。
const verdict = verdictRaw || { recommended_angle: null, rationale: "evaluator agent が応答せず JS default ranking に degrade", ranking: [], synthesis_notes: "" };

// evaluator の推奨が実在 angle でなければ JS top に矯正 (幻覚 angle / evaluator 失敗ガード)。
const validAngles = new Set(candidates.map((c) => c.angle));
const recommendedAngle = validAngles.has(verdict.recommended_angle) ? verdict.recommended_angle : jsRanked[0];

// controller はこの戻り値で ExitPlanMode (人間選定) / --auto (recommended 自動採択) → 選定案で claim/max-parallel/discover へ。
return {
  ok: true,
  recommended: {
    angle: recommendedAngle,
    plan: candidates.find((c) => c.angle === recommendedAngle),
    corrected: recommendedAngle !== verdict.recommended_angle,
  },
  candidates: candidates.map((c) => ({ angle: c.angle, angle_rationale: c.angle_rationale || "", clusters: c.clusters, score: c.score })),
  js_ranking: jsRanked,
  evaluator: { recommended_angle: verdict.recommended_angle, rationale: verdict.rationale, ranking: verdict.ranking, synthesis_notes: verdict.synthesis_notes || "" },
  dropped,
};

// ---- 純関数 helpers (段階1.5 logic harness で検証する) ----

// candidate の構造妥当性検証。全 issue が過不足なく 1 回ずつ割当てられているか / cap 超過が無いか。
// 問題があれば理由文字列を、無ければ null を返す (controller の単発 fallback 判断材料)。
function validateCandidate(candidate, issueNumbers) {
  const seen = new Map();
  let total = 0;
  for (const cl of candidate.clusters) {
    if (!Array.isArray(cl.issues)) return `cluster ${cl.cluster_id} has no issues array`;
    for (const n of cl.issues) {
      seen.set(n, (seen.get(n) || 0) + 1);
      total += 1;
    }
  }
  const expected = new Set(issueNumbers);
  // 重複割当 (同一 issue が複数 cluster)
  for (const [n, count] of seen) {
    if (count > 1) return `issue #${n} assigned to ${count} clusters (duplicate)`;
    if (!expected.has(n)) return `issue #${n} not in input issue set (hallucinated)`;
  }
  // 欠落 (入力 issue が未割当)
  for (const n of issueNumbers) {
    if (!seen.has(n)) return `issue #${n} missing from all clusters`;
  }
  if (total !== issueNumbers.length) return `assigned ${total} != input ${issueNumbers.length}`;
  return null;
}

// candidate の多次元採点 (純 JS proxy、CLI 非依存)。total は default 重み付き総和 (evaluator/人間が tradeoff を上書き可)。
// 各次元は 0..1 正規化 (high better へ揃える)。conflict/serialization/cap は「低いほど良い」を 1-x で反転。
function computeScore(candidate, globalConflictFiles, cap) {
  const clusters = candidate.clusters;
  const n = clusters.length || 1;
  const gcf = new Set(globalConflictFiles || []);

  // conflict_exposure: global_conflict_files に触れる cluster の割合 (低いほど良い)。
  const touchingConflict = clusters.filter((c) => (c.files || []).some((f) => gcf.has(f)) || (c.global_conflict_files || []).length > 0).length;
  const conflictExposure = touchingConflict / n;

  // parallelism: 並列安全 (needs_serialization=false) な cluster の割合 (高いほど良い)。
  const parallelSafe = clusters.filter((c) => !c.needs_serialization).length;
  const parallelism = parallelSafe / n;

  // confidence_ratio: high confidence cluster の割合 (高いほど良い)。
  const highConf = clusters.filter((c) => c.confidence === "high").length;
  const confidenceRatio = highConf / n;

  // cap_violations: 上限 (default 5) 超過 cluster 数。1 件でもあると減点。
  const capLimit = cap || 5;
  const capViolations = clusters.filter((c) => (c.issues || []).length > capLimit).length;
  const capCompliance = 1 - Math.min(1, capViolations / n);

  // balance: cluster サイズの均等度。1 - (stddev/mean) を 0..1 にクランプ (1 巨大 cluster + 多数 tiny を減点)。
  const sizes = clusters.map((c) => (c.issues || []).length);
  const balance = sizeBalance(sizes);

  // default 総和 (重みは neutral quality 観点。tradeoff の最終裁定は opus evaluator + 人間)。
  const total =
    0.28 * parallelism +
    0.24 * (1 - conflictExposure) +
    0.2 * confidenceRatio +
    0.16 * balance +
    0.12 * capCompliance;

  return {
    cluster_count: clusters.length,
    conflict_exposure: round3(conflictExposure),
    parallelism: round3(parallelism),
    confidence_ratio: round3(confidenceRatio),
    cap_violations: capViolations,
    balance: round3(balance),
    total: round3(total),
  };
}

// cluster サイズの均等度 (0..1、高いほど均等)。空/単一は 1。
function sizeBalance(sizes) {
  if (sizes.length <= 1) return 1;
  const mean = sizes.reduce((a, b) => a + b, 0) / sizes.length;
  if (mean === 0) return 1;
  const variance = sizes.reduce((a, b) => a + (b - mean) * (b - mean), 0) / sizes.length;
  const cv = Math.sqrt(variance) / mean; // 変動係数
  return Math.max(0, 1 - Math.min(1, cv));
}

function round3(x) {
  return Math.round(x * 1000) / 1000;
}

// ---- args 正規化 + 入力アサーション (entry で fail-fast) ----
function normalizeArgs() {
  const a = typeof args === "string" ? JSON.parse(args) : args;
  if (!a || !Array.isArray(a.issues) || a.issues.length === 0)
    throw new Error("op-run-judge-clustering: args.issues must be a non-empty array");
  a.issues.forEach((i) => {
    if (typeof i.number !== "number") throw new Error("op-run-judge-clustering: each issue requires a numeric number");
  });
  a.global_conflict_files = Array.isArray(a.global_conflict_files) ? a.global_conflict_files : [];
  a.cap = typeof a.cap === "number" && a.cap > 0 ? a.cap : 5;
  // angles: controller が op-config から注入。未注入時は DEFAULT_ANGLES を candidate_count で切る。
  // #676: spawn コスト削減で既定案数を 1 に保守化 (Sonnet 1 案 + Opus 1 評価 = 2 spawn)。
  //       complexity 高区画は op-config で candidate_count を 3 に上げられる (override 経路は a.candidate_count を尊重)。
  if (!Array.isArray(a.angles) || a.angles.length === 0) {
    const n = typeof a.candidate_count === "number" && a.candidate_count > 0 ? a.candidate_count : 1;
    a.angles = DEFAULT_ANGLES.slice(0, Math.min(n, DEFAULT_ANGLES.length));
  }
  // models: controller が解決し注入 (generate=sonnet 既定 / evaluate=opus 既定)。未注入は legacy fallback。
  if (!a.models) a.models = {};
  if (!a.models.generate) a.models.generate = "sonnet";
  if (!a.models.evaluate) a.models.evaluate = "opus";
  return a;
}

// ---- prompt builders (clustering 方法論本体は clustering.md 委譲 = Single Canonical Source、JS に rubric 二重記述しない) ----

// generate: 1 angle 専任の grouping 案出し。enriched issues を入力に angle の方針で clusters[] を組む。
function buildGeneratePrompt(angle, a) {
  return [
    "invocation_mode: op_managed",
    `あなたは op-run clustering の judge-panel **${angle.key} angle 専任**の案出し担当です。OP-managed Mode 起動。質問で停止しない。`,
    "共通宣言: ~/.claude/skills/_shared/spawn-prompt-common.md §1〜§4。本フェーズは exploration-only (コード変更・commit・push しない、案出しのみ)。",
    "",
    "【あなたの仕事】下記の enriched issues を、あなたの angle の方針で cluster に束ねる候補 ClusterPlan を 1 案つくる。",
    `【あなたの angle = ${angle.key}】`,
    `方針: ${angle.focus}`,
    "",
    "【clustering 方法論 (正本)】",
    "grouping は ~/.claude/skills/_shared/clustering.md の Step4-6 に従う (本 prompt に rubric を再掲しない)。要点のみ:",
    "- Step4: 原則 (module, category) で束ねる。1 cluster は最大 " + a.cap + " issue。",
    "- **hard 制約 (angle で曲げられない、clustering.md Step4 特例「例外なし」)**: category が refactor / optimize の issue は",
    "  **常に singleton (1 issue=1 PR)**。risk/throughput 最適化でもこれらを他 issue と merge しない。post-check 要否が異なる issue",
    "  (例: security post-check 要の feature と不要の refactor) も merge しない (merge すると post-check routing を失う)。",
    "- Step5: confidence (high/medium/low)。low または global_conflict_files に触れる cluster は needs_serialization=true。",
    "- Step6: category→expert マッピングで primary_runner を決める (review-expert/ux-ui-audit-expert/release-expert は primary 不可)。",
    "- **ただし grouping の束ね方・直列化の置き方は angle の方針で最適化してよい** (それが本 panel の目的)。",
    "",
    "【入力 enriched issues (controller が Step1-3 で file/module/category を抽出済。3 angle 共通入力)】",
    JSON.stringify(a.issues),
    "",
    "【global_conflict_files (これらを複数 cluster が触ると並列衝突。risk 判定の材料)】",
    JSON.stringify(a.global_conflict_files),
    "",
    "【厳守する制約】",
    "- 入力 issue を **過不足なく 1 回ずつ** どこかの cluster に割り当てる (欠落・重複割当は contract violation)。",
    "- 入力に無い issue 番号を作らない。",
    "- 各 cluster の files は当該 issue の files_declared の union。global_conflict_files に該当するものは cluster.global_conflict_files にも入れる。",
    "- needs_serialization は confidence=low または global_conflict_files 接触で true。",
    "",
    "【出力 (candidatePlanSchema)】",
    "- angle: あなたの angle key をそのまま (" + angle.key + ")",
    "- angle_rationale: この angle がどう grouping を形作ったか (2-4 行)",
    "- clusters[]: cluster_id (c1,c2,..) / issues[] / primary_runner / post_check_expert (null 可) / files[] / global_conflict_files[] / confidence / needs_serialization / group_rationale (なぜこの束ね方か 1-2 行)",
    "",
    "candidatePlanSchema で返却する。JSON 以外のテキストを付けない。",
  ].join("\n");
}

// evaluate: opus evaluator。JS score vector + 候補を見て tradeoff を裁定し recommended_angle を確定する。
function buildEvaluatePrompt(candidates, jsRanked, a) {
  // 候補は clusters の要約 + score を提示 (full clusters は冗長なので grouping 構造と score を中心に)。
  const summaries = candidates.map((c) => ({
    angle: c.angle,
    angle_rationale: c.angle_rationale || "",
    score: c.score,
    clusters: c.clusters.map((cl) => ({
      cluster_id: cl.cluster_id,
      issues: cl.issues,
      primary_runner: cl.primary_runner,
      confidence: cl.confidence,
      needs_serialization: cl.needs_serialization,
      touches_conflict: (cl.global_conflict_files || []).length > 0,
      group_rationale: cl.group_rationale || "",
    })),
  }));
  return [
    "invocation_mode: op_managed",
    "あなたは op-run clustering judge-panel の **evaluator (裁定担当)** です。OP-managed Mode 起動。質問で停止しない。",
    "共通宣言: ~/.claude/skills/_shared/spawn-prompt-common.md §1〜§4。exploration-only (案を選ぶだけ、コード変更しない)。",
    "",
    "【あなたの仕事】複数 angle が出した clustering 候補を比較し、この issue batch に最適な 1 案を推奨する。",
    "**確定はしない (最終決定は司令官 + 人間 gate)。あなたは ranked 推奨と根拠を出す**。",
    "",
    "【裁定の原則】",
    "- JS が出した多次元 score (parallelism / conflict_exposure / confidence_ratio / balance / cap_violations / total) は **客観指標**。",
    "  だが throughput と risk の tradeoff は **文脈依存** (この batch が global_conflict_files に多く触るなら risk-first が安全、",
    "  独立性が高いなら throughput-first が速い)。機械総和 (total) を鵜呑みにせず、batch の性質で重みを補正して裁定する。",
    "- score が拮抗するときは grouping の **意味的整合性** (同一 module/責務が自然に束なっているか、無理な相乗りが無いか) で割る。",
    "- 明らかに不安全な案 (global_conflict cluster を並列化している等) は total が高くても推奨しない。",
    "",
    `【JS default ranking (total 降順、参考)】${JSON.stringify(jsRanked)}`,
    "",
    "【候補 (各 angle の grouping 構造 + JS score)】",
    JSON.stringify(summaries),
    "",
    "【出力 (evaluatorSchema)】",
    "- recommended_angle: 推奨する 1 案の angle key (候補に実在するもの)",
    "- rationale: なぜその案か (3-6 行。tradeoff をどう裁定したか、JS total と異なる場合はその理由)",
    "- ranking: 全 angle を rank (1=最良) + assessment (1 行) で順位付け",
    "- synthesis_notes: runner-up に良い grouping があれば controller が graft 検討する材料 (任意)",
    "",
    "evaluatorSchema で返却する。JSON 以外のテキストを付けない。",
  ].join("\n");
}
