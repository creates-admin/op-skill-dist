/**
 * 機能概要:
 *   op-plan の計画立案 (Issue 分解) を judge-panel 化する Dynamic Workflow (ADR-0014 Wave B、ADR-0009 L157)。
 *   「自然言語要望をどう Issue に分解するか」の単発推論 (op-plan フェーズ4) を N 案を別角度で並列生成
 *   → JS guardrail 採点 → opus evaluator で ranked 化する案 fan-out に置き換える。2 phase:
 *     1. generate (案出し): N angle (MVP-first / risk-first / asset-reuse-first ...) を flat 並列 spawn (sonnet 既定)。
 *                          各 angle が clarified requirement + asset audit を入力に候補分解 (issues[]) を独立生成。
 *     2. evaluate (評価)  : JS で構造 guardrail 採点 (reuse_ratio / mvp_ratio / dependency 健全性) → opus evaluator が
 *                          coverage / coherence / risk handling を裁定し recommended_angle + rationale を確定。
 *   workflow は **ranked 候補 + score + 推奨のみ return** する。**確定 (どの分解を採るか) は controller + 人間 gate**
 *   (op-plan フェーズ6 ExitPlanMode / 起票は controller) が行う (ADR-0009 L158、案出し=workflow / 確定=司令官+人間)。
 *
 * 作成意図:
 *   op-plan の計画は「自然言語→分解」で Wave A の clustering より subjective ゆえ、JS は guardrail に留め opus evaluator
 *   を主裁定にする (ADR-0014 決定2: op-plan = opus-heavy + JS guardrail)。depth は controller effort pin (PR #611) +
 *   opus evaluator (model pin) が、breadth は本 judge-panel (N 分解案) が担う。ADR-0011 調査/ゲート分離の向き反転。
 *
 * 注意点:
 *   - 全 phase exploration-only。コード変更・commit・起票しない (案出しのみ)。起票は controller フェーズ7。
 *   - workflow は shell-out 不可 (ADR-0009): dedup (op scan dedup) / 起票 (gh issue create) は controller が選定後に実施。
 *   - hearing (フェーズ1 深掘り) は interactive ゆえ controller が prep 実施し clarified requirement として args 注入する
 *     (workflow agent は user に質問できない。3 angle が同一入力を共有 = 公平比較)。
 *   - **args は Workflow tool から JSON 文字列で到着する** (reference_workflow_tool_api_gotchas)。normalizeArgs() で parse。
 *   - REAL_API 準拠: export const meta (pure literal 第一文) / phase() は body 冒頭のみ / 非決定 API 不使用。
 *   - candidate.issues[] は op-plan フェーズ4 Issue draft 骨格 (pr-templates.md 指示書フル版) の planning 前駆。
 *     controller が選定案を フェーズ4 draft → フェーズ5 enrichment → フェーズ6 承認へ流す。
 */

export const meta = {
  name: "op-plan-judge",
  description:
    "op-plan 計画立案 judge-panel (ADR-0014 Wave B): 自然言語要望の Issue 分解を N 案 (MVP-first/risk-first/asset-reuse-first) で並列生成 (sonnet) → JS guardrail 採点 → opus evaluator で ranked 化し、候補分解 + score + 推奨を返す。確定 (分解選定) と dedup・enrichment・起票は controller 保持 (案出し=workflow / 確定=司令官+人間 gate)",
  phases: [{ title: "generate" }, { title: "evaluate" }],
};

// candidate 1 件 = 1 angle が生成する Issue 分解案。issues[] は op-plan フェーズ4 draft の planning 前駆。
const planCandidateSchema = {
  type: "object",
  required: ["angle", "issues"],
  properties: {
    angle: { type: "string" },
    approach_rationale: { type: "string" },
    issues: {
      type: "array",
      items: {
        type: "object",
        required: ["title", "domain", "scope_summary", "expert"],
        properties: {
          title: { type: "string" },
          domain: { type: "string", enum: ["feature", "refactor", "debug", "optimize", "security", "ux-ui", "design"] },
          scope_summary: { type: "string" },
          files: { type: "array", items: { type: "string" } },
          expert: { type: "string" },
          depends_on: { type: "array", items: { type: "number" } }, // 0-based の issue index 参照 (順序/直列依存)
          reuses_existing: { type: "boolean" }, // asset audit の既存資産を再利用するか
          is_mvp: { type: "boolean" }, // 最小 shippable 集合に含まれるか
        },
      },
    },
  },
};

// evaluate: opus evaluator が分解候補を比較し recommended を確定する裁定 (Wave A と同形)。
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
        properties: { angle: { type: "string" }, rank: { type: "number" }, assessment: { type: "string" } },
      },
    },
    synthesis_notes: { type: "string" },
  },
};

// 標準 angle カタログ (op-config で上書き可)。op-plan = 分解戦略の角度。
const DEFAULT_ANGLES = [
  { key: "mvp-first", focus: "最小 shippable な分解。コア価値を満たす最小 Issue 集合を is_mvp=true で切り出し、付加要素は follow-up Issue に分離する" },
  { key: "risk-first", focus: "不確実性の高い部分を前倒し。技術的未知・依存の重い部分を早い Issue (depends_on 浅い) に置き、de-risk を優先する" },
  { key: "asset-reuse-first", focus: "既存資産再利用を最大化。asset audit の reusable_assets / pattern を活かし新規実装を最小化する (reuses_existing=true を増やす、feature-expert 思想)" },
];

const input = normalizeArgs();

phase("generate");

// --- plugin scoped-name: Workflow agent() の agentType は plugin 登録名 (op-skill:<name>) で解決する ---
// built-in (general-purpose/Explore/Plan) は plugin component でないため bare 維持。data (expert 名等) は
// bare 正本、spawn 境界でのみ前置する (skills/_shared/expert-spawn.md「Plugin scoped-name 規約」)。
const BUILTIN_AGENTS = new Set(["general-purpose", "Explore", "Plan"]);
const scopedAgentType = (n) => (n && !BUILTIN_AGENTS.has(n) ? `op-skill:${n}` : n);
log(
  `op-plan-judge (ADR-0014 Wave B): requirement="${(input.requirement.summary || "").slice(0, 50)}" / ` +
    `${input.angles.length} angle(s) [${input.angles.map((a) => a.key).join(", ")}] models gen=${input.models.generate}/eval=${input.models.evaluate}`
);

// Phase generate: N angle を flat 並列で独立生成 (失敗 angle は filter せず index 保持、空 batch 扱い)。
const rawCandidates = await parallel(
  input.angles.map((angle) => () =>
    agent(buildGeneratePrompt(angle, input), {
      label: `generate:${angle.key}`,
      phase: "generate",
      schema: planCandidateSchema,
      agentType: scopedAgentType("feature-expert"),
      model: input.models.generate,
    })
  )
);

// 採点前に candidate を構造検証。不正 candidate は drop し可視化する。
const candidates = [];
const dropped = [];
input.angles.forEach((angle, idx) => {
  const c = rawCandidates[idx];
  if (!c || !Array.isArray(c.issues)) {
    dropped.push({ angle: angle.key, reason: "generator returned no issues" });
    return;
  }
  const problem = validatePlanCandidate(c);
  if (problem) {
    dropped.push({ angle: c.angle || angle.key, reason: problem });
    return;
  }
  candidates.push({ ...c, score: computePlanScore(c) });
});

// 全 candidate が drop → controller が単発 fallback できるよう構造化エラーを返す。
if (candidates.length === 0) {
  return { ok: false, reason: "all candidates invalid", dropped, candidates: [], recommended: null };
}

// JS default ranking (total 降順、弱 guardrail)。opus evaluator が coverage/coherence で上書き裁定する。
const jsRanked = candidates.slice().sort((a, b) => b.score.total - a.score.total).map((c) => c.angle);

phase("evaluate");
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

// controller はこの戻り値で フェーズ6 (人間選定) / 起票へ。選定分解を フェーズ4 draft → enrichment へ流す。
return {
  ok: true,
  recommended: {
    angle: recommendedAngle,
    plan: candidates.find((c) => c.angle === recommendedAngle),
    corrected: recommendedAngle !== verdict.recommended_angle,
  },
  candidates: candidates.map((c) => ({ angle: c.angle, approach_rationale: c.approach_rationale || "", issues: c.issues, score: c.score })),
  js_ranking: jsRanked,
  evaluator: { recommended_angle: verdict.recommended_angle, rationale: verdict.rationale, ranking: verdict.ranking, synthesis_notes: verdict.synthesis_notes || "" },
  dropped,
};

// ---- 純関数 helpers (段階1.5 logic harness で検証する) ----

// survey findings を asset_audit フィールドに射影する (op-plan フェーズ2.5 → フェーズ3/4 の橋渡し)。
// 作成意図: SKILL.md §2.5-4 prescriptive fence の正本実装をここに移管し二重定義を解消する (Issue #735)。
//   SKILL.md fence は教育目的で残し、実装の single source of truth は本関数とする。
// 挙動: survey は判定しないため controller がフィールド転写のみ行う。
function aggregateSurveyFindings(surveyResult) {
  if (!surveyResult || !Array.isArray(surveyResult.findings)) {
    return null; // survey 未実行 / 失敗時は null → op-plan-judge args に注入しない
  }
  const findings = surveyResult.findings;

  // files_likely_to_modify: 全 finding の files を flat 化 + dedup
  const files_likely_to_modify = [...new Set(findings.flatMap(f => f.files || []))];

  // reusable_assets: survey findings から抽出した再利用可能資産 (情報源 = op-survey)。
  // フェーズ3 feature-expert audit が出力する reuse_opportunities (情報源 = feature-expert) とは
  // 情報源が異なるため別フィールドとして asset_audit にマージする (上書きしない)。
  const reusable_assets = findings
    .filter(f => /再利用|流用|reuse|流用可/i.test(f.recommended_action || ''))
    .map(f => ({ title: f.title, files: f.files || [] }));

  // pattern_to_follow: findings から「手本」「パターン」「参照」を含む finding の files を抽出
  const pattern_to_follow = findings
    .filter(f => /手本|パターン|参照|pattern|template/i.test(f.recommended_action || f.title || ''))
    .map(f => f.files || [])
    .flat();

  return {
    files_likely_to_modify,
    reusable_assets,
    pattern_to_follow,
    survey_findings_count: findings.length,
    coverage_notes: surveyResult.coverage_notes || [],
    // raw findings を保存 (op-plan-judge が詳細を参照できるよう)
    raw_survey_findings: findings,
  };
}

// 分解 candidate の構造妥当性検証。issue 必須 field / depends_on の index 範囲 / 循環依存を確認。
// 問題があれば理由文字列を、無ければ null を返す (controller の単発 fallback 判断材料)。
function validatePlanCandidate(candidate) {
  const issues = candidate.issues;
  if (!Array.isArray(issues) || issues.length === 0) return "issues array is empty";
  for (let i = 0; i < issues.length; i++) {
    const it = issues[i];
    if (!it.title || !it.domain || !it.scope_summary || !it.expert) return `issue[${i}] missing required field (title/domain/scope_summary/expert)`;
    const deps = Array.isArray(it.depends_on) ? it.depends_on : [];
    for (const d of deps) {
      if (typeof d !== "number" || d < 0 || d >= issues.length) return `issue[${i}] depends_on ${d} out of range`;
      if (d === i) return `issue[${i}] depends on itself`;
    }
  }
  if (hasCycle(issues)) return "dependency cycle detected";
  return null;
}

// depends_on の有向グラフに循環があるか (DFS、純関数)。
function hasCycle(issues) {
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = issues.map(() => WHITE);
  const visit = (i) => {
    color[i] = GRAY;
    const deps = Array.isArray(issues[i].depends_on) ? issues[i].depends_on : [];
    for (const d of deps) {
      if (color[d] === GRAY) return true;
      if (color[d] === WHITE && visit(d)) return true;
    }
    color[i] = BLACK;
    return false;
  };
  for (let i = 0; i < issues.length; i++) {
    if (color[i] === WHITE && visit(i)) return true;
  }
  return false;
}

// 分解 candidate の guardrail 採点 (純 JS、弱 signal)。total は default 順位付けの参考で、裁定は opus evaluator が主導。
// op-plan は subjective ゆえ JS で coverage/coherence は測れない → reuse / mvp / 依存健全性の構造 signal に留める。
function computePlanScore(candidate) {
  const issues = candidate.issues;
  const n = issues.length || 1;

  // reuse_ratio: 既存資産再利用 issue の割合 (CLAUDE.md 再利用ファースト思想、高いほど良い = 唯一の monotonic-good signal)。
  const reuseRatio = issues.filter((it) => it.reuses_existing).length / n;
  // mvp_ratio / has_mvp: MVP に含まれる issue の割合 (info のみ、total に入れない)。
  // **注意 (Wave B Ladder4 で判明)**: 高い mvp_ratio は「良い」を意味しない。適切な MVP scoping は付加要素を
  // follow-up に defer する (= mvp_ratio が下がる) のが正しい実践ゆえ、mvp_ratio を total の加点にすると
  // 「全部 MVP にした (scoping しなかった) 案」を優遇する逆転が起きる。MVP scoping の質は subjective ゆえ
  // opus evaluator の裁定に委ね、JS total には含めない。
  const mvpRatio = issues.filter((it) => it.is_mvp).length / n;
  const hasMvp = issues.some((it) => it.is_mvp);
  // dependency_depth: 最長依存鎖 (順序設計の signal、info のみ。浅い=良いとは限らないため total に入れない)。
  const depDepth = longestDepChain(issues);

  // 弱 default total = reuse_ratio のみ (op-plan は subjective ゆえ JS で測れる客観的 good は再利用度だけ)。
  // total が拮抗/同点なら js_ranking は退化するが、それで正しい (opus evaluator が coverage/coherence で裁定する)。
  const total = round3(reuseRatio);

  return {
    issue_count: issues.length,
    reuse_ratio: round3(reuseRatio),
    mvp_ratio: round3(mvpRatio),
    has_mvp: hasMvp,
    dependency_depth: depDepth,
    total,
  };
}

// 最長依存鎖長 (DFS メモ化、純関数)。循環は validate で除外済の前提。
function longestDepChain(issues) {
  const memo = issues.map(() => -1);
  const depth = (i) => {
    if (memo[i] >= 0) return memo[i];
    const deps = Array.isArray(issues[i].depends_on) ? issues[i].depends_on : [];
    let best = 0;
    for (const d of deps) best = Math.max(best, depth(d) + 1);
    memo[i] = best;
    return best;
  };
  let max = 0;
  for (let i = 0; i < issues.length; i++) max = Math.max(max, depth(i));
  return max;
}

function round3(x) {
  return Math.round(x * 1000) / 1000;
}

// ---- args 正規化 + 入力アサーション ----
function normalizeArgs() {
  const a = typeof args === "string" ? JSON.parse(args) : args;
  if (!a || !a.requirement || typeof a.requirement.summary !== "string" || !a.requirement.summary)
    throw new Error("op-plan-judge: args.requirement.summary (string) is required (controller hearing prep)");
  a.asset_audit = a.asset_audit || {};
  a.adr_decision = a.adr_decision || { needed: false };
  // #676: spawn コスト削減で既定案数を 1 に保守化 (controller 注入 a.candidate_count を尊重する override 経路は不変)。
  if (!Array.isArray(a.angles) || a.angles.length === 0) {
    const n = typeof a.candidate_count === "number" && a.candidate_count > 0 ? a.candidate_count : 1;
    a.angles = DEFAULT_ANGLES.slice(0, Math.min(n, DEFAULT_ANGLES.length));
  }
  if (!a.models) a.models = {};
  if (!a.models.generate) a.models.generate = "sonnet";
  if (!a.models.evaluate) a.models.evaluate = "opus";
  return a;
}

// ---- prompt builders (op-plan 方法論本体は SKILL.md / pr-templates / issue-enrichment 委譲、JS に再掲しない) ----

// generate: 1 angle 専任の分解案出し。clarified requirement + asset audit を入力に issues[] を組む。
function buildGeneratePrompt(angle, a) {
  return [
    "invocation_mode: op_managed",
    `あなたは op-plan の計画 judge-panel **${angle.key} angle 専任**の案出し担当です。OP-managed Mode 起動。質問で停止しない。`,
    "共通宣言: ~/.claude/skills/_shared/spawn-prompt-common.md §1〜§4。本フェーズは exploration-only (コード変更・起票しない、案出しのみ)。",
    "",
    "【あなたの仕事】下記の clarified requirement を、あなたの angle の方針で実装 Issue 群に分解する候補を 1 案つくる。",
    `【あなたの angle = ${angle.key}】`,
    `方針: ${angle.focus}`,
    "",
    "【分解方法論 (正本)】",
    "Issue 骨格は ~/.claude/skills/_shared/pr-templates.md の指示書フル版、domain/expert 判定は op-plan/SKILL.md フェーズ4 +",
    "clustering.md Step6 に従う (本 prompt に rubric を再掲しない)。要点:",
    "- 各 issue に domain (feature/refactor/debug/optimize/ux-ui/design/security) と expert (category→expert マッピング) を付す。",
    "- refactor / optimize は 1 issue=1 PR を意識し過大束ねしない。UI 影響 issue は domain=ux-ui/design または feature+UI影響。",
    "- depends_on で issue 間の順序/直列依存を 0-based index で表す (循環禁止)。",
    "- **ただし分解の粒度・順序・MVP 切り出しは angle の方針で最適化してよい** (それが本 panel の目的)。",
    "",
    "【clarified requirement (controller が hearing 深掘り済。3 angle 共通入力)】",
    JSON.stringify(a.requirement),
    "",
    "【asset audit (controller フェーズ3 feature-expert の既存資産調査。asset-reuse-first の主材料)】",
    JSON.stringify(a.asset_audit),
    "",
    "【ADR 判定 (controller フェーズ2)】",
    JSON.stringify(a.adr_decision),
    "",
    "【厳守する制約】",
    "- requirement を **過不足なくカバー** する分解にする (要望の一部を落とさない。逆に要望外の過剰実装を足さない)。",
    "- depends_on は 0-based の issue index のみ参照 (範囲外・自己参照・循環は contract violation)。",
    "- reuses_existing は asset audit の資産を実際に使う issue で true。is_mvp は最小 shippable 集合の issue で true。",
    "",
    "【出力 (planCandidateSchema)】",
    "- angle: あなたの angle key (" + angle.key + ")",
    "- approach_rationale: この angle がどう分解を形作ったか (2-4 行)",
    "- issues[]: title / domain / scope_summary (この issue が何を実装するか 1-2 文) / files[] (主対象、推定可) / expert / depends_on[] / reuses_existing / is_mvp",
    "",
    "planCandidateSchema で返却する。JSON 以外のテキストを付けない。",
  ].join("\n");
}

// evaluate: opus evaluator。分解候補を coverage / coherence / risk handling で裁定し recommended を確定する。
function buildEvaluatePrompt(candidates, jsRanked, a) {
  const summaries = candidates.map((c) => ({
    angle: c.angle,
    approach_rationale: c.approach_rationale || "",
    score: c.score,
    issues: c.issues.map((it, i) => ({
      idx: i,
      title: it.title,
      domain: it.domain,
      expert: it.expert,
      scope_summary: it.scope_summary,
      depends_on: it.depends_on || [],
      reuses_existing: !!it.reuses_existing,
      is_mvp: !!it.is_mvp,
    })),
  }));
  return [
    "invocation_mode: op_managed",
    "あなたは op-plan 計画 judge-panel の **evaluator (裁定担当)** です。OP-managed Mode 起動。質問で停止しない。",
    "共通宣言: ~/.claude/skills/_shared/spawn-prompt-common.md §1〜§4。exploration-only (案を選ぶだけ、起票しない)。",
    "",
    "【あなたの仕事】複数 angle が出した Issue 分解候補を比較し、この要望に最適な 1 案を推奨する。",
    "**確定はしない (最終決定は司令官 + 人間 gate)。ranked 推奨と根拠を出す**。",
    "",
    "【裁定の原則 (op-plan は subjective ゆえ JS score は弱い guardrail。あなたが主裁定者)】",
    "- JS score (reuse_ratio / mvp_ratio / dependency_depth / total) は **構造 signal に過ぎない**。total (= reuse_ratio のみ) を鵜呑みにしない。",
    "  **mvp_ratio は descriptive な info で「高いほど良い」ではない**: 適切な MVP scoping は付加要素を follow-up に defer する",
    "  (= mvp_ratio が下がる) のが正しい。全 issue を MVP にした案が mvp scoping を怠っている可能性をむしろ疑う。",
    "  dependency_depth も「浅い=良い」とは限らない (risk-first は未知の前倒しで意図的に順序を組む)。",
    "- 最重要は **coverage** (要望を過不足なくカバーするか。落とし / 過剰実装が無いか) と **coherence** (分解の粒度が自然か、",
    "  1 issue が大きすぎ/小さすぎないか、依存順序が妥当か)。",
    "- 次に **risk handling** (不確実な部分が適切に切り出され順序付けされているか) と **reuse** (既存資産を活かし車輪の再発明をしないか)。",
    "- angle の方針が要望の性質に合っているか (例: 探索的要望は risk-first、定型機能は asset-reuse-first、MVP 検証目的は mvp-first) を考慮する。",
    "",
    "【要望 (clarified requirement)】",
    JSON.stringify(a.requirement),
    "",
    `【JS default ranking (total 降順、弱 guardrail・参考)】${JSON.stringify(jsRanked)}`,
    "",
    "【分解候補 (各 angle の issues + JS score)】",
    JSON.stringify(summaries),
    "",
    "【出力 (evaluatorSchema)】",
    "- recommended_angle: 推奨する 1 案の angle key (候補に実在するもの)",
    "- rationale: なぜその案か (3-6 行。coverage/coherence/risk/reuse をどう裁定したか、JS total と異なる場合はその理由)",
    "- ranking: 全 angle を rank (1=最良) + assessment (1 行) で順位付け",
    "- synthesis_notes: runner-up に良い分解 (特定 issue の切り方等) があれば controller が graft 検討する材料 (任意)",
    "",
    "evaluatorSchema で返却する。JSON 以外のテキストを付けない。",
  ].join("\n");
}
