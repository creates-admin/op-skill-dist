/**
 * 機能概要:
 *   op-explore (ADR-0013) playground `full` モードの core エンジン。N パターンの UI 試作を
 *   **構造的拘束セット**で発散生成 (新規 fan-out) し、decision-matrix を **順位付けせず構造化のみ** で返す。
 *   2 phase:
 *   - generate : controller が割当てた (or default カタログの) N 個の互いに非重複な拘束セットを designer-expert に
 *                並列 spawn し、各案の自己完結 HTML 本文 + craft notes + state 網羅 + 「他案が取らない構造的賭け」を返す。
 *                token-curation 相当の foundation は art-direction 共通入力として 1 回共有 (削減構造、§11)。
 *   - judge    : decision-matrix を 1 体で生成。**順位を付けない** (aggregateVerdict 流用禁止 = CI grep gate)。
 *                各案の dimension 別 事実差異 + 強み/弱み + 「この状況ならこの案」条件 + 案間 craft 距離 (mode collapse 可視化) +
 *                「この比較で judge が判断していないこと」節を返す。
 *
 * 作成意図:
 *   ADR-0009 制約1 = workflow は実行中の人間入力を取れない → 「生成は workflow / 選択は controller 対話」に分離する。
 *   judge は「正解判定器」でなく「観察を誘導する index 生成器」(MLLM-人間 correlation 0.428 = HTML を Read するだけでは
 *   craft 実体を捉えられない)。**最終選択は人間** (構想の核 = 人間の選択権)。op-enrichment.js からは役 schema 定数の
 *   「形を揃える」発想のみ流用し、runRolePipeline (serial) / aggregateVerdict (最重値) / splitFindings は流用しない (silent fork 回避)。
 *
 * 注意点:
 *   - workflow は fs / process / gh 不可。HTML は **agent が文字列で返し controller が `.playground/<id>/` に書く**。
 *   - args は JSON 文字列で到着する (normalizeArgs の JSON.parse シム必須)。raw `args.` 直接参照禁止。
 *   - judge は順位付け禁止 (order / total score / best / 勝者語彙を出さない)。craft 軸に Pugh +/0/- を付けない (事実差異のみ)。
 *   - 全役 Opus 固定が既定 (ADR-0013 決定K、model-selection.md §5.4.2)。
 *   - self_critique は Wave4 (default off)。`N=3 ∩ self_critique on` は budget hard cap で拒否 (normalizeArgs でクランプ)。
 */

export const meta = {
  name: "op-explore-render",
  description:
    "op-explore playground full モード (ADR-0013 決定H/I): N パターンの UI 試作を構造的拘束セットで発散生成 (designer-expert 並列 spawn、自己完結 HTML を返却) し、decision-matrix を順位付けせず構造化のみで返す。判定 (どの案を採用するか) は controller 対話 (人間) に残す。aggregateVerdict (最重値集約) は流用禁止。全役 Opus 既定 (決定K)。",
  phases: [{ title: "generate" }, { title: "judge" }],
};

// ── 構造的拘束軸 (ADR-0013 決定I: 形容詞ラベルでなく discrete 非重複値で発散する。形容詞差は mode collapse を起こす) ──
const CONSTRAINT_AXES = ["typography", "layout", "color", "density", "decoration"];

// controller が constraint_sets を渡さない場合の default 発散カタログ (互いに非重複)。
const DEFAULT_CONSTRAINT_SETS = [
  {
    key: "editorial-air",
    typography: "serif 見出し + humanist sans 本文",
    layout: "非対称 (黄金比的) グリッド",
    color: "monochrome + 1 accent",
    density: "余白多め editorial",
    decoration: "余白だけで秩序",
  },
  {
    key: "dense-utility",
    typography: "geometric sans 統一",
    layout: "左右対称モジュラーグリッド",
    color: "低彩度 + semantic アクセント",
    density: "高密度業務",
    decoration: "罫線で秩序",
  },
  {
    key: "bold-contrast",
    typography: "特大 display 見出し + sans 本文",
    layout: "中央集約 + ヒーロー",
    color: "高彩度 vs くすみのコントラスト",
    density: "中庸",
    decoration: "影で奥行き",
  },
];

// 案間 craft 距離がこの閾値未満なら mode collapse (N 案が無難に収束) とみなし controller に再発散を促す。
const COLLAPSE_THRESHOLD = 0.35;

// ── 生成 agent の出力 schema (op-enrichment 役 schema と「形を揃える」: top-level const + JSON Schema) ──
const patternSchema = {
  type: "object",
  required: ["pattern_id", "constraint_set", "html", "craft_notes", "states_covered", "structural_bet"],
  properties: {
    pattern_id: { type: "string", minLength: 1 },
    constraint_set: { type: "object" },
    html: { type: "string", minLength: 1 }, // 自己完結 HTML 本文 (controller が `.playground/<id>/pattern-<pattern_id>.html` に書く)
    craft_notes: { type: "string" }, // 採用 token / scale / restraint と craft 上の意図
    states_covered: { type: "array", items: { type: "string" } }, // loading / error / empty / focus 等
    structural_bet: { type: "string" }, // 他案が取らない構造的賭け (diversity 強制)
  },
};

// ── judge の出力 schema (decision-matrix、順位なし。aggregateVerdict 由来の verdict / score 集約は持たない) ──
const decisionMatrixSchema = {
  type: "object",
  required: ["dimensions", "per_pattern", "craft_distance", "judge_not_judging"],
  properties: {
    dimensions: { type: "array", items: { type: "string" } }, // 差異 / トレードオフ / state 網羅 / foundation 整合 / craft 差異軸
    per_pattern: {
      type: "array",
      items: {
        type: "object",
        required: ["pattern_id", "dimension_observations", "conditions_for_choosing"],
        properties: {
          pattern_id: { type: "string" },
          dimension_observations: { type: "object" }, // {dimension: 事実差異記述}。craft 軸は +/0/- 禁止 (事実差異 + 観察ポインタのみ)
          strengths: { type: "array", items: { type: "string" } },
          weaknesses: { type: "array", items: { type: "string" } },
          conditions_for_choosing: { type: "string" }, // 「この状況ならこの案」条件付き記述 (順位でない)
        },
      },
    },
    craft_distance: {
      type: "object",
      required: ["score", "note"],
      properties: {
        score: { type: "number" }, // 0..1。案間の craft 多様性。小さいほど mode collapse
        note: { type: "string" },
      },
    },
    judge_not_judging: { type: "string", minLength: 1 }, // 「この比較で judge が判断していないこと」(taste 偽装の verification ceiling を明示)
  },
};

// ────────────────────────────────────────────────────────────────────────────
// entry (module scope)
// ────────────────────────────────────────────────────────────────────────────
const input = normalizeArgs();

phase("generate");

// --- plugin scoped-name: Workflow agent() の agentType は plugin 登録名 (op-skill:<name>) で解決する ---
// built-in (general-purpose/Explore/Plan) は plugin component でないため bare 維持。data (expert 名等) は
// bare 正本、spawn 境界でのみ前置する (skills/_shared/expert-spawn.md「Plugin scoped-name 規約」)。
const BUILTIN_AGENTS = new Set(["general-purpose", "Explore", "Plan"]);
const scopedAgentType = (n) => (n && !BUILTIN_AGENTS.has(n) ? `op-skill:${n}` : n);
log(
  `op-explore-render: ${input.constraint_sets.length} パターンを発散生成 (full, generate=${input.models.generate}, judge=${input.models.judge}` +
    (input.budget_note ? `, budget_clamp=on` : "") +
    `)`
);

const raw = await parallel(
  input.constraint_sets.map((cs, i) => () =>
    agent(buildGeneratePrompt(cs, i, input), {
      label: `generate:${cs.key || i}`,
      phase: "generate",
      schema: patternSchema,
      agentType: scopedAgentType("designer-expert"),
      model: input.models.generate,
    })
  )
);

const patterns = [];
const dropped = [];
raw.forEach((p, i) => {
  if (p && typeof p.html === "string" && p.html.length > 0) patterns.push(p);
  else dropped.push({ index: i, constraint_set: input.constraint_sets[i] });
});

if (patterns.length === 0) {
  // 全 pattern drop = 構造化エラー return (throw すると controller が recovery できない)。
  return {
    ok: false,
    reason: "all patterns invalid (designer-expert spawn 失敗 or 空 HTML)",
    patterns: [],
    decision_matrix: null,
    dropped,
    mode_collapse: false,
    merged_context: input.merged_context,
    budget_note: input.budget_note,
  };
}

phase("judge");
const matrix = await agent(buildJudgePrompt(patterns, input), {
  label: "judge",
  phase: "judge",
  schema: decisionMatrixSchema,
  agentType: scopedAgentType("designer-expert"),
  model: input.models.judge,
});

const modeCollapse =
  patterns.length >= 2 &&
  !!matrix &&
  !!matrix.craft_distance &&
  typeof matrix.craft_distance.score === "number" &&
  matrix.craft_distance.score < COLLAPSE_THRESHOLD;

return {
  ok: true,
  patterns,
  decision_matrix: matrix,
  dropped,
  mode_collapse: modeCollapse, // true なら controller は拘束セットを振り直して再発散 (1 回、§11 budget 内)
  merged_context: input.merged_context, // 回答 round を畳んだ context (取りこぼし防止)
  budget_note: input.budget_note, // hard cap クランプが起きた場合の説明 (null なら未発火)
};

// ────────────────────────────────────────────────────────────────────────────
// pure helpers (function 宣言 = hoisting。normalizeArgs は module scope で先頭呼び出しされる)
// ────────────────────────────────────────────────────────────────────────────

function normalizeArgs() {
  const a = typeof args === "string" ? JSON.parse(args) : args;
  if (!a || typeof a !== "object") throw new Error("op-explore-render: args must be an object");
  if (!a.session_id || typeof a.session_id !== "string")
    throw new Error("op-explore-render: args.session_id (string) required (controller が mint)");
  if (!a.requirement) throw new Error("op-explore-render: args.requirement required (フェーズ1 ヒアリング要約)");

  // model: 全役 Opus 既定 (ADR-0013 決定K)。controller 注入で上書き可。
  if (!a.models || typeof a.models !== "object") a.models = {};
  if (!a.models.generate) a.models.generate = "opus";
  if (!a.models.judge) a.models.judge = "opus";

  // pattern_count: 未注入時 default 2、絶対上限 3 (controller が 3 にクランプ)。
  let n = typeof a.pattern_count === "number" && a.pattern_count > 0 ? Math.floor(a.pattern_count) : 2;
  if (n > 3) n = 3;
  a.pattern_count = n;

  // self_critique hard cap (ADR-0013 決定I): `N=3 ∩ self_critique on` は budget 超過で拒否 → self_critique を off にクランプ。
  a.self_critique = a.self_critique === true;
  a.budget_note = null;
  if (a.pattern_count >= 3 && a.self_critique) {
    a.self_critique = false;
    a.budget_note = "N=3 ∩ self_critique は hard cap (worst-case 16 spawn 超過) で拒否 → self_critique を off にクランプ";
  }
  // 注: self_critique の refine pass 自体は Wave4 (default off)。Wave3 では flag 受け口 + hard cap のみ。

  // constraint_sets: controller 割当が無ければ default カタログから N 個 (互いに非重複)。
  if (!Array.isArray(a.constraint_sets) || a.constraint_sets.length === 0) {
    a.constraint_sets = DEFAULT_CONSTRAINT_SETS.slice(0, Math.min(n, DEFAULT_CONSTRAINT_SETS.length));
  } else {
    a.constraint_sets = a.constraint_sets.slice(0, n);
  }

  if (!a.art_direction || typeof a.art_direction !== "object") a.art_direction = {};
  if (!Array.isArray(a.exemplars)) a.exemplars = [];

  // 回答 round を畳む (round 跨ぎ取りこぼし防止)。
  a.merged_context = foldAnswerRounds(a.prior_rounds);
  return a;
}

// append-only な回答 round を畳む。後の round が earlier confirmed を silent に落とさない (取りこぼし防止)。
function foldAnswerRounds(rounds) {
  const merged = { confirmed: [], rejected: [], reactions: [], open_questions: [], conflicts: [] };
  if (!Array.isArray(rounds) || rounds.length === 0) return merged;
  const seenConfirmed = new Set();
  const seenRejected = new Set();
  rounds.forEach((r) => {
    if (!r || typeof r !== "object") return;
    (r.confirmed || []).forEach((c) => {
      const k = String(c);
      if (!seenConfirmed.has(k)) {
        seenConfirmed.add(k);
        merged.confirmed.push(c);
      }
    });
    (r.rejected || []).forEach((x) => {
      const k = String(x);
      if (!seenRejected.has(k)) {
        seenRejected.add(k);
        merged.rejected.push(x);
      }
    });
    (r.reactions || []).forEach((rx) => merged.reactions.push({ round: r.round, ...rx }));
  });
  // open_questions = 最新 round (解決済は confirmed へ移っている前提)。
  const last = rounds[rounds.length - 1];
  merged.open_questions = last && Array.isArray(last.open_questions) ? last.open_questions.slice() : [];
  // confirmed と rejected の双方に現れる項目は矛盾として可視化 (silent に後勝ちさせない)。
  merged.conflicts = merged.confirmed.filter((c) => seenRejected.has(String(c)));
  return merged;
}

function constraintSetLines(cs) {
  return CONSTRAINT_AXES.filter((ax) => cs && cs[ax]).map((ax) => `  - ${ax}: ${cs[ax]}`).join("\n");
}

function exemplarLines(input) {
  if (!input.exemplars.length) {
    return "  (視覚 exemplar なし — generic 回帰に注意。craft 原則を自力で言語化し restraint を効かせよ)";
  }
  return input.exemplars
    .map((e) => `  - ${typeof e === "string" ? e : e.ref || ""}${e && e.craft_principle ? ` (craft 原則: ${e.craft_principle})` : ""}`)
    .join("\n");
}

function buildGeneratePrompt(cs, i, input) {
  const ad = input.art_direction;
  const mc = input.merged_context;
  return [
    "invocation_mode: op_managed",
    "",
    "あなたは designer-expert です。op-explore (playground full) から呼ばれた OP-managed Mode 起動です。",
    "質問で停止せず、不足は assumptions を置いて続行し、required schema (patternSchema) の JSON を返してください。",
    "",
    "共通宣言 (invocation_mode / 質問禁止 / 必読 checklist / commits_added): `~/.claude/skills/_shared/spawn-prompt-common.md (>=1)` §1〜§4 を参照。",
    "本作業は試作生成 (exploration-only) のため commits_added は対象外 (workflow 内で commit しない)。",
    "必読: `~/.claude/skills/expert-design/references/visual-craft-tiers.md` (craft floor / Tier)、",
    "      `~/.claude/skills/expert-design/references/visual-quality-rubric.md` (Hard blockers)。",
    "",
    `## 要望 (session ${input.session_id})`,
    typeof input.requirement === "string" ? input.requirement : JSON.stringify(input.requirement),
    "",
    "## art-direction (purpose / tone / differentiation)",
    `  - purpose: ${ad.purpose || "(未指定)"}`,
    `  - tone: ${ad.tone || "(未指定)"}`,
    `  - differentiation: ${ad.differentiation || "(未指定)"}`,
    "",
    `## この案 (pattern ${i + 1}) の構造的拘束セット [${cs.key || i}]`,
    "以下の拘束を厳守して発散する。他案と互いに非重複な構造的な賭けにすること:",
    constraintSetLines(cs) || "  (拘束未指定 — 自力で他案と非重複な構造を選べ)",
    "",
    "## exemplar (calibration、craft の縮尺)",
    exemplarLines(input),
    "",
    "## これまでの回答 round (取りこぼさず反映)",
    `  - confirmed (確定済): ${mc.confirmed.length ? mc.confirmed.join(" / ") : "(なし)"}`,
    `  - rejected (却下済、繰り返さない): ${mc.rejected.length ? mc.rejected.join(" / ") : "(なし)"}`,
    `  - open_questions: ${mc.open_questions.length ? mc.open_questions.join(" / ") : "(なし)"}`,
    "",
    "## 出力する HTML の要件",
    "- 自己完結 (外部依存ゼロ・CDN 参照なし・`<script src=\"http` / `<link href=\"http` を含めない)。`file://` 直開きで描画されること。",
    "- craft floor を厳守: token bypass (生値直書き) / 任意値乱発 / equal-weight (階層なし) / accent 過多 / semantic 色の装飾流用 を避ける。",
    "- 該当する state (loading / error / empty / focus 等) を含める。",
    "- diversity 強制: structural_bet に「他案が取らない構造的な賭けを 1 つ」必ず含める。",
    "- anti-slop: generic な管理画面テンプレに流れない。art-direction 拘束を実際に効かせる。",
    "- セキュリティ: 本番 credential / 実 API endpoint / 実 PII を埋めない (mock のみ)。",
    "",
    "## 返却 (patternSchema)",
    "pattern_id (拘束 key 由来の短い id) / constraint_set (この案の拘束) / html (自己完結 HTML 本文全体) /",
    "craft_notes (採用 scale・token・restraint と意図) / states_covered (含めた state) / structural_bet (他案が取らない賭け)。",
    "JSON 以外のテキストを付けない。",
  ].join("\n");
}

function buildJudgePrompt(patterns, input) {
  const summary = patterns
    .map((p, i) => `### 案 ${i + 1} [${p.pattern_id}]\n- structural_bet: ${p.structural_bet || ""}\n- craft_notes: ${p.craft_notes || ""}\n- states_covered: ${(p.states_covered || []).join(", ")}`)
    .join("\n\n");
  return [
    "invocation_mode: op_managed",
    "",
    "あなたは designer-expert です。op-explore (playground full) の judge として呼ばれた OP-managed Mode 起動です。",
    "あなたの役目は **正解判定器ではなく、人間の観察を誘導する index 生成器** です (HTML を Read するだけでは craft 実体は捉えられない = MLLM-人間 correlation 0.428)。",
    "",
    "共通宣言: `~/.claude/skills/_shared/spawn-prompt-common.md (>=1)` §1〜§4 を参照。",
    "必読: `~/.claude/skills/expert-design/references/visual-craft-tiers.md`、`visual-quality-rubric.md`。",
    "",
    "## 厳守 (ADR-0013 決定H/I)",
    "- **順位を付けない**。order / total score / best / 勝者 / おすすめ第1位 などの語彙を一切出さない。",
    "- craft 方向性軸には Pugh +/0/- を **付けない**。事実差異の記述 + 「ここを見よ」の観察ポインタに限定する (主観 craft 軸への +/0/- は taste を測れるかの偽装)。",
    "- floor 軸 (state 網羅 / a11y / foundation 整合 = 客観) のみ事実として可否を述べてよい。",
    "- 冒頭近くに **案間 craft 距離** (craft_distance.score = 0..1、小さいほど無難に収束) を出し mode collapse を可視化する。全案が似ているなら note にそう書く。",
    "- 末尾に `judge_not_judging` = 「この比較で judge が判断していないこと」を必ず明示する (例: 実際の描画の心地よさ / 色の調和の体感 / 最終的にどれが良いか)。",
    "",
    `## 要望 (session ${input.session_id})`,
    typeof input.requirement === "string" ? input.requirement : JSON.stringify(input.requirement),
    "",
    "## 案",
    summary,
    "",
    "## 返却 (decisionMatrixSchema)",
    "dimensions (差異 / トレードオフ / state 網羅 / foundation 整合 / craft 差異 等の評価軸) /",
    "per_pattern (各案の dimension_observations = 軸ごとの事実差異記述、strengths/weaknesses、conditions_for_choosing = 「この状況ならこの案」) /",
    "craft_distance ({score, note}) / judge_not_judging。",
    "JSON 以外のテキストを付けない。",
  ].join("\n");
}
