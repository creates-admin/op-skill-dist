/**
 * 機能概要:
 *   op-architect の設計判断 (アーキ提案) を judge-panel 化する Dynamic Workflow (ADR-0014 Wave C、ADR-0009 L157)。
 *   「主要選択肢 2-4 個を提示し司令官が単一推奨する」単発推論 (op-architect フェーズ3-1) を、
 *   **whole-architecture 案 fan-out** に置き換える: ADR-worthy 論点を 1 回の panel でまとめて扱い、
 *   各 angle が「全論点を貫く一貫したアーキ・ナラティブ」を 1 案ずつ生成する (per-論点 でなく architecture 単位)。
 *   2 phase:
 *     1. generate (案出し): N angle (simplicity / extensibility / robustness ...) を flat 並列 spawn (sonnet 既定)。
 *                          各 angle が project_context + ADR-worthy topics[] を入力に、**全論点へ一貫 bias で決定**を下した
 *                          完全アーキ案 (decisions[]) を独立生成する。
 *     2. evaluate (評価)  : JS は構造 guardrail (coverage = 全論点を漏れなく決定したか + ADR-readiness) のみ。
 *                          優劣 (アーキ方針の良し悪し) は subjective ゆえ opus evaluator が完全主導で裁定し、
 *                          recommended_angle + rationale + **per-論点 graft 提案** を確定する。
 *   workflow は **ranked 候補 + score + 推奨のみ return** する。**確定 (どのアーキを採るか) は controller + 人間 gate**
 *   (op-architect フェーズ3-1 の論点対話) が行う (ADR-0009 L158、案出し=workflow / 確定=司令官+人間)。
 *
 * 作成意図:
 *   アーキ方針の優劣は 3 サーフェス中最も subjective ゆえ JS guardrail を最薄にし opus evaluator を主裁定にする
 *   (ADR-0014 決定2: op-architect = opus-heavy / 決定3: whole-architecture 粒度を user 確定)。
 *   whole-architecture には固有の利点がある: 各 ADR の「Alternatives Considered」を、**他 angle 案が同一論点に
 *   下した決定**で自動充填できる (simplicity 案採用 → robustness/extensibility 案の同論点決定が不採用案の素材)。
 *   depth は controller effort pin (PR #611) + opus evaluator (model pin)、breadth は本 judge-panel (N アーキ案) が担う。
 *
 * 注意点:
 *   - 全 phase exploration-only。コード変更・commit・ADR 起票しない (案出しのみ)。ADR 起票は controller フェーズ3-2。
 *   - workflow は shell-out 不可 (ADR-0009): ADR 採番 / git add / commit は controller が選定後に実施。
 *   - 論点抽出 (フェーズ2) と ADR-worthy 粒度ゲート (フェーズ3-0) は interactive prep ゆえ controller が実施し、
 *     ADR-worthy 論点だけを topics[] として args 注入する (workflow agent は user に質問できない。N angle が同一入力を共有 = 公平比較)。
 *   - **args は Workflow tool から JSON 文字列で到着する** (reference_workflow_tool_api_gotchas)。normalizeArgs() で parse。
 *   - REAL_API 準拠: export const meta (pure literal 第一文) / phase() は body 冒頭のみ / 非決定 API 不使用。
 *   - agentType は general-purpose (op-architect 既存 research subagent と同じ。アーキ判断は cross-cutting で単一 expert に属さない)。
 *   - candidate.decisions[] は op-architect フェーズ3-2 ADR ドラフト (Context/Decision/Consequences/Alternatives) の前駆。
 */

export const meta = {
  name: "op-architect-judge",
  description:
    "op-architect 設計判断 judge-panel (ADR-0014 Wave C): ADR-worthy 論点群を whole-architecture でまとめ、N 案 (simplicity/extensibility/robustness-biased) を別 bias で並列生成 (sonnet) → JS は構造 guardrail (coverage/ADR-readiness) のみ → opus evaluator が完全主導で ranked 化し、候補アーキ + score + 推奨 + per-論点 graft 提案を返す。確定 (アーキ選定) と ADR 採番・起票は controller 保持 (案出し=workflow / 確定=司令官+人間 gate)",
  phases: [{ title: "generate" }, { title: "evaluate" }],
};

// candidate 1 件 = 1 angle が全 ADR-worthy 論点に一貫 bias で下した完全アーキ案。
// decisions[] は op-architect フェーズ3-2 ADR ドラフトの前駆 (1 decision → 1 ADR)。
const archCandidateSchema = {
  type: "object",
  required: ["angle", "decisions"],
  properties: {
    angle: { type: "string" },
    architecture_summary: { type: "string" }, // 全体方針のナラティブ (この angle がアーキ全体をどう形作ったか)
    coherence_note: { type: "string" }, // 全 decision が同一 bias で一貫している説明 (whole-architecture の肝)
    claude_md_alignment: { type: "string" }, // 対象 project の CLAUDE.md / 規約との整合 (該当すれば)
    decisions: {
      type: "array",
      items: {
        type: "object",
        required: ["topic", "decision", "rationale", "consequences"],
        properties: {
          topic: { type: "string" }, // args.topics[].topic と完全一致させる (coverage 検証キー)
          decision: { type: "string" }, // この論点への決定 (1-3 文、ADR Decision 節前駆)
          rationale: { type: "string" }, // なぜこの決定か (angle bias を反映)
          tradeoffs: { type: "string" }, // 受け入れる代償
          consequences: {
            type: "object",
            required: ["positive", "negative"],
            properties: {
              positive: { type: "array", items: { type: "string" } },
              negative: { type: "array", items: { type: "string" } },
            },
          },
          alternatives_rejected: {
            // この angle が検討して不採用にした案 (ADR Alternatives Considered 前駆。他 angle 案と併せ充填)
            type: "array",
            items: {
              type: "object",
              required: ["option", "why_rejected"],
              properties: { option: { type: "string" }, why_rejected: { type: "string" } },
            },
          },
        },
      },
    },
  },
};

// evaluate: opus evaluator がアーキ候補を比較し recommended を確定する裁定。
// graft_proposals = whole-architecture 固有: ある案を全体採用しつつ特定論点を別案から graft する提案。
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
    graft_proposals: {
      // 推奨アーキを全体採用しつつ、特定論点だけ別 angle の決定を採る提案 (任意、controller が人間に提示)
      type: "array",
      items: {
        type: "object",
        required: ["topic", "from_angle", "why"],
        properties: { topic: { type: "string" }, from_angle: { type: "string" }, why: { type: "string" } },
      },
    },
    synthesis_notes: { type: "string" },
  },
};

// 標準 angle カタログ (op-config で上書き可)。op-architect = 設計判断の decision-bias 軸 (user 確定 Wave C)。
const DEFAULT_ANGLES = [
  { key: "simplicity-biased", focus: "YAGNI / 抽象最小 / 差し替え容易を最優先。今すぐ必要な構造だけを選び、将来の不確実な拡張に投資しない。CLAUDE.md『形式美より実務可読性・デバッグ容易性』整合 (継承2段まで / ネスト制限 / 過剰抽象禁止)" },
  { key: "extensibility-biased", focus: "将来の拡張 seam を優先。後から変更コストの高い境界 (module / interface / データ境界) に拡張点を用意する。ただし over-engineering は evaluator が裁定するので、拡張に値する根拠を明示する" },
  { key: "robustness-biased", focus: "失敗モード / 安全境界 / データ整合を優先。エラー経路・部分故障・不正入力・並行性・永続化の壊れ方を先に潰す設計を選ぶ。運用耐性と回復可能性を重視する" },
];

const input = normalizeArgs();

phase("generate");
log(
  `op-architect-judge (ADR-0014 Wave C, whole-architecture): ${input.topics.length} ADR-worthy 論点 ` +
    `[${input.topics.map((t) => t.topic).slice(0, 4).join(" / ")}${input.topics.length > 4 ? " ..." : ""}] / ` +
    `${input.angles.length} angle(s) [${input.angles.map((a) => a.key).join(", ")}] models gen=${input.models.generate}/eval=${input.models.evaluate}`
);

// Phase generate: N angle を flat 並列で独立生成 (失敗 angle は filter せず index 保持、空 batch 扱い)。
// 各 angle は全 ADR-worthy 論点へ一貫 bias で決定を下した完全アーキ案 (whole-architecture) を返す。
const rawCandidates = await parallel(
  input.angles.map((angle) => () =>
    agent(buildGeneratePrompt(angle, input), {
      label: `generate:${angle.key}`,
      phase: "generate",
      schema: archCandidateSchema,
      agentType: "general-purpose",
      model: input.models.generate,
    })
  )
);

// 採点前に candidate を構造検証。coverage (全論点を漏れなく決定したか) と必須 field を確認し、不正は drop して可視化する。
const topicKeys = input.topics.map((t) => String(t.topic).trim());
const candidates = [];
const dropped = [];
input.angles.forEach((angle, idx) => {
  const c = rawCandidates[idx];
  if (!c || !Array.isArray(c.decisions)) {
    dropped.push({ angle: angle.key, reason: "generator returned no decisions" });
    return;
  }
  const problem = validateArchCandidate(c, topicKeys);
  if (problem) {
    dropped.push({ angle: c.angle || angle.key, reason: problem });
    return;
  }
  candidates.push({ ...c, score: computeArchScore(c) });
});

// 全 candidate が drop → controller が単発 fallback できるよう構造化エラーを返す。
if (candidates.length === 0) {
  return { ok: false, reason: "all candidates invalid", dropped, candidates: [], recommended: null };
}

// JS default ranking (total 降順、弱 guardrail = ADR-readiness のみ)。opus evaluator が方針優劣で上書き裁定する。
const jsRanked = candidates.slice().sort((a, b) => b.score.total - a.score.total).map((c) => c.angle);

phase("evaluate");
const verdictRaw = await agent(buildEvaluatePrompt(candidates, jsRanked, input), {
  label: "evaluate",
  phase: "evaluate",
  schema: evaluatorSchema,
  agentType: "general-purpose",
  model: input.models.evaluate,
});

// evaluator agent の spawn 失敗 (null 戻り) を未ガード deref で uncaught throw させない。
// generate 側 (最高コストの N 並列 spawn) は完了済のため、ここで throw すると生成済 candidates が全喪失する。
// null 時は JS default ranking (jsRanked) へ degrade する空 verdict にフォールバックし、下流の幻覚 angle
// ガード (jsRanked[0] 矯正) にそのまま乗せる (generate 側の if(!c) null 構造化処理と対称)。
const verdict = verdictRaw || { recommended_angle: null, rationale: "evaluator agent が応答せず JS default ranking に degrade", ranking: [], graft_proposals: [], synthesis_notes: "" };

// evaluator の推奨が実在 angle でなければ JS top に矯正 (幻覚 angle / evaluator 失敗ガード)。
const validAngles = new Set(candidates.map((c) => c.angle));
const recommendedAngle = validAngles.has(verdict.recommended_angle) ? verdict.recommended_angle : jsRanked[0];

// controller はこの戻り値で フェーズ3-1 (人間選定 + graft) / フェーズ3-2 (ADR batch draft) へ。
return {
  ok: true,
  topics: topicKeys,
  recommended: {
    angle: recommendedAngle,
    architecture: candidates.find((c) => c.angle === recommendedAngle),
    corrected: recommendedAngle !== verdict.recommended_angle,
  },
  candidates: candidates.map((c) => ({
    angle: c.angle,
    architecture_summary: c.architecture_summary || "",
    coherence_note: c.coherence_note || "",
    claude_md_alignment: c.claude_md_alignment || "",
    decisions: c.decisions,
    score: c.score,
  })),
  js_ranking: jsRanked,
  evaluator: {
    recommended_angle: verdict.recommended_angle,
    rationale: verdict.rationale,
    ranking: verdict.ranking,
    graft_proposals: Array.isArray(verdict.graft_proposals) ? verdict.graft_proposals : [],
    synthesis_notes: verdict.synthesis_notes || "",
  },
  dropped,
};

// ---- 純関数 helpers (段階1.5 logic harness で検証する) ----

// アーキ candidate の構造妥当性検証。coverage (全 ADR-worthy 論点を漏れなく & 余計なく決定) + decision 必須 field を確認。
// 問題があれば理由文字列を、無ければ null を返す (controller の単発 fallback 判断材料)。
function validateArchCandidate(candidate, topicKeys) {
  const decisions = candidate.decisions;
  if (!Array.isArray(decisions) || decisions.length === 0) return "decisions array is empty";

  const decidedTopics = new Set();
  for (let i = 0; i < decisions.length; i++) {
    const d = decisions[i];
    if (!d.topic || !d.decision || !d.rationale) return `decision[${i}] missing required field (topic/decision/rationale)`;
    if (!d.consequences || !Array.isArray(d.consequences.positive) || !Array.isArray(d.consequences.negative))
      return `decision[${i}] missing consequences.positive/negative`;
    const key = String(d.topic).trim();
    if (!topicKeys.includes(key)) return `decision[${i}] topic "${key}" is not an ADR-worthy 論点 (hallucinated)`;
    if (decidedTopics.has(key)) return `topic "${key}" decided more than once`;
    decidedTopics.add(key);
  }
  // coverage: 全 ADR-worthy 論点が漏れなく決定されていること (whole-architecture の必須条件)。
  for (const key of topicKeys) {
    if (!decidedTopics.has(key)) return `ADR-worthy 論点 "${key}" has no decision (incomplete architecture)`;
  }
  return null;
}

// アーキ candidate の guardrail 採点 (純 JS、最薄)。op-architect は方針優劣が subjective ゆえ JS で品質は測れない。
// coverage は validate で 1.0 保証済なので、total は ADR-readiness (alternatives + tradeoffs を備えた decision の割合) のみ。
// これは「ADR の Alternatives Considered / Trade-offs を充填できる素材を持つか」という構造 signal で、品質裁定は opus evaluator が主導する。
function computeArchScore(candidate) {
  const decisions = candidate.decisions;
  const n = decisions.length || 1;

  // adr_readiness: ADR ドラフトに必要な素材 (不採用案 1 件以上 + tradeoffs 記載) を備えた decision の割合。
  const ready = decisions.filter(
    (d) => Array.isArray(d.alternatives_rejected) && d.alternatives_rejected.length >= 1 && d.tradeoffs && String(d.tradeoffs).trim()
  ).length;
  const adrReadiness = ready / n;
  // claude_md_aligned: CLAUDE.md 整合の言及がある candidate か (info のみ、total に入れない。整合の質は opus 裁定)。
  const claudeAligned = !!(candidate.claude_md_alignment && String(candidate.claude_md_alignment).trim());
  const hasCoherence = !!(candidate.coherence_note && String(candidate.coherence_note).trim());

  // 弱 default total = adr_readiness のみ (op-architect は subjective ゆえ JS で測れる客観的 good は ADR-readiness だけ)。
  // total が拮抗/同点なら js_ranking は退化するが、それで正しい (opus evaluator が方針優劣で裁定する)。
  const total = round3(adrReadiness);

  return {
    topic_count: decisions.length,
    adr_readiness: round3(adrReadiness),
    claude_md_aligned: claudeAligned,
    has_coherence_note: hasCoherence,
    total,
  };
}

function round3(x) {
  return Math.round(x * 1000) / 1000;
}

// ---- args 正規化 + 入力アサーション ----
function normalizeArgs() {
  const a = typeof args === "string" ? JSON.parse(args) : args;
  if (!a || !Array.isArray(a.topics) || a.topics.length === 0)
    throw new Error("op-architect-judge: args.topics[] (ADR-worthy 論点、controller フェーズ3-0 粒度ゲート後) is required");
  for (const t of a.topics) {
    if (!t || typeof t.topic !== "string" || !t.topic.trim())
      throw new Error("op-architect-judge: each topics[].topic must be a non-empty string");
  }
  a.project_context = a.project_context || {};
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

// ---- prompt builders (op-architect 方法論本体は SKILL.md / ADR テンプレに委譲、JS に再掲しない) ----

// generate: 1 angle 専任の whole-architecture 案出し。全 ADR-worthy 論点へ一貫 bias で決定を下す。
function buildGeneratePrompt(angle, a) {
  const topicLines = a.topics
    .map((t, i) => `  ${i + 1}. [topic="${String(t.topic).trim()}"] ${t.why_adr_worthy || ""}${t.hearing_notes ? " — ヒアリング: " + t.hearing_notes : ""}`)
    .join("\n");
  return [
    "invocation_mode: op_managed",
    `あなたは op-architect の設計判断 judge-panel **${angle.key} angle 専任**の案出し担当です。OP-managed Mode 起動。質問で停止しない。`,
    "共通宣言: ~/.claude/skills/_shared/spawn-prompt-common.md §1〜§4。本フェーズは exploration-only (コード変更・ADR 起票しない、案出しのみ)。",
    "",
    "【あなたの仕事】下記の ADR-worthy 論点を **全部まとめて 1 つの一貫したアーキ案** として設計する (whole-architecture)。",
    "論点ごとにバラバラに決めるのではなく、**あなたの angle の bias を全論点に一貫して効かせ**、互いに整合する 1 セットの決定を下す。",
    `【あなたの angle = ${angle.key}】`,
    `方針: ${angle.focus}`,
    "",
    "【ADR-worthy 論点 (controller がフェーズ2 抽出 + フェーズ3-0 粒度ゲートで ADR 化対象と確定済。topic キーは厳密一致させる)】",
    topicLines,
    "",
    "【project context (controller フェーズ1 種別判定 + ヒアリング結果。N angle 共通入力)】",
    JSON.stringify(a.project_context),
    "",
    "【設計方法論 (正本)】",
    "- 各論点は後で ADR (MADR ベース: Context / Decision / Consequences / Alternatives Considered) になる。decision はその Decision 節、",
    "  consequences は Consequences 節、alternatives_rejected は Alternatives Considered 節の素材になる。",
    "- 対象 project の CLAUDE.md / 既存規約を最優先層として尊重する (judge-panel は project 規約を上書きしない)。",
    "  CLAUDE.md に反する決定は出さない。整合する点は claude_md_alignment に明記する。",
    "- **ただし論点間の決定をどう束ねるかは angle の bias で最適化してよい** (それが本 panel の目的)。",
    "",
    "【厳守する制約】",
    "- topics[] の **全論点に過不足なく 1 つずつ** 決定を下す (論点を落とさない。逆に与えられていない論点を勝手に足さない)。",
    "- 各 decision の topic は上記 topic キーと **文字列完全一致** させる (coverage 検証キー。表記揺れは contract violation)。",
    "- coherence_note で「全 decision がなぜ一貫しているか」を必ず説明する (whole-architecture の肝)。",
    "- alternatives_rejected には、あなたがその論点で検討して不採用にした案を 1 件以上挙げる (ADR Alternatives Considered の素材)。",
    "",
    "【出力 (archCandidateSchema)】",
    "- angle: あなたの angle key (" + angle.key + ")",
    "- architecture_summary: 全体方針のナラティブ (2-4 行)",
    "- coherence_note: 全 decision が同一 bias で一貫している説明 (2-4 行)",
    "- claude_md_alignment: 対象 project の CLAUDE.md / 規約との整合 (該当すれば。無ければ簡潔に)",
    "- decisions[]: topic (厳密一致) / decision (1-3 文) / rationale / tradeoffs / consequences{positive[], negative[]} / alternatives_rejected[]{option, why_rejected}",
    "",
    "archCandidateSchema で返却する。JSON 以外のテキストを付けない。",
  ].join("\n");
}

// evaluate: opus evaluator。アーキ候補を coverage / coherence / 方針適合 / CLAUDE.md 整合で裁定し recommended を確定する。
function buildEvaluatePrompt(candidates, jsRanked, a) {
  const summaries = candidates.map((c) => ({
    angle: c.angle,
    architecture_summary: c.architecture_summary || "",
    coherence_note: c.coherence_note || "",
    claude_md_alignment: c.claude_md_alignment || "",
    score: c.score,
    decisions: c.decisions.map((d) => ({
      topic: d.topic,
      decision: d.decision,
      rationale: d.rationale,
      tradeoffs: d.tradeoffs || "",
      negative: (d.consequences && d.consequences.negative) || [],
    })),
  }));
  return [
    "invocation_mode: op_managed",
    "あなたは op-architect 設計判断 judge-panel の **evaluator (裁定担当)** です。OP-managed Mode 起動。質問で停止しない。",
    "共通宣言: ~/.claude/skills/_shared/spawn-prompt-common.md §1〜§4。exploration-only (案を選ぶだけ、ADR 起票しない)。",
    "",
    "【あなたの仕事】複数 angle が出した whole-architecture 候補 (全 ADR-worthy 論点への一貫決定セット) を比較し、",
    "この project に最適な 1 案を推奨する。**確定はしない (最終決定は司令官 + 人間 gate の論点対話)。ranked 推奨と根拠を出す**。",
    "",
    "【裁定の原則 (op-architect は方針優劣が subjective ゆえ JS score は最薄 guardrail。あなたが完全に主裁定者)】",
    "- JS score (adr_readiness / total) は **ADR ドラフトの素材が揃っているかという構造 signal に過ぎない**。total を鵜呑みにしない。",
    "  全 candidate は coverage (全論点を決定) を満たして渡されている。優劣は **あなたが方針の質で判断する**。",
    "- 最重要は **coherence** (全論点の決定が同一 bias で一貫し互いに整合するか。whole-architecture の肝) と",
    "  **project 適合** (この project の性質・規模・寿命・運用前提に bias が合っているか。例: 短命な検証なら simplicity、",
    "  長期運用 / 多人数なら extensibility や robustness)。",
    "- **CLAUDE.md / 既存規約整合** は強い制約。規約に反するアーキは推奨しない (claude_md_alignment を吟味する)。",
    "- 次に各論点 decision の妥当性 (rip-and-replace コスト / データ・認証・セキュリティ境界の扱い / 失敗モード)。",
    "- **whole-architecture 固有**: ある案を全体採用しつつ、特定論点だけ別 angle の決定の方が優れるなら graft_proposals に出す",
    "  (例: simplicity 案を採るが永続化論点だけ robustness 案の決定を graft)。winner + runner-up の良い決定を組み合わせる材料。",
    "",
    "【project context】",
    JSON.stringify(a.project_context),
    "",
    `【JS default ranking (total=adr_readiness 降順、最薄 guardrail・参考)】${JSON.stringify(jsRanked)}`,
    "",
    "【アーキ候補 (各 angle の architecture_summary / coherence_note / 全論点 decisions + JS score)】",
    JSON.stringify(summaries),
    "",
    "【出力 (evaluatorSchema)】",
    "- recommended_angle: 推奨する 1 案の angle key (候補に実在するもの)",
    "- rationale: なぜその案か (3-6 行。coherence / project 適合 / CLAUDE.md 整合 / 各論点決定をどう裁定したか)",
    "- ranking: 全 angle を rank (1=最良) + assessment (1 行) で順位付け",
    "- graft_proposals: 推奨案を全体採用しつつ特定論点を別案から graft する提案 (任意){topic, from_angle, why}",
    "- synthesis_notes: その他 controller が人間提示に使える補足 (任意)",
    "",
    "evaluatorSchema で返却する。JSON 以外のテキストを付けない。",
  ].join("\n");
}
