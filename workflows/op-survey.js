export const meta = {
  name: "op-survey",
  description:
    "汎用 investigation fan-out workflow: 曖昧な横断調査を goal/axes/preset で調査軸に分解し、軸ごとに investigator を read-only 並列 spawn → findings を flat 化し detected_by/finding_ref を付与して { findings, coverage_notes } を返す。判定・順位付け・確定はしない (確定は controller / 人間)。op-skill-migration preset (4 軸) 同梱",
  phases: [{ title: "survey" }],
};

// preset 名指定時に AXIS_PRESETS[preset] が axes として展開される。
const AXIS_PRESETS = {
  "op-skill-migration": [
    {
      id: "cli-migration",
      title: "CLI 化余地 (bash fence → op CLI primitive)",
      agentType: "refactor-expert",
      focus:
        "SKILL.md / references / _shared の bash code fence のうち、op CLI primitive 化できる箇所を洗い出す。",
      how:
        "`op-tools/docs/implementation-order.md` の trigger 表と `op-tools/crates/op/src/commands/` の実在 subcommand を突合し、" +
        "既存 primitive で置換可能か / 新 primitive が要るかを区別する。gh CLI glue は op::fetch ラップ方針 (op-tools ADR-0005) に照らす。",
    },
    {
      id: "workflow-migration",
      title: "Workflow 化未達 (inline Agent 並列 spawn の残存)",
      agentType: "refactor-expert",
      focus:
        "SKILL.md にインライン `Agent` 並列 spawn のまま残る fan-out (Dynamic Workflows 未移行) を洗い出す。",
      how:
        "fan-out 箇所が workflows/op-*.js へ移行済みか / SKILL.md に巨大インライン spawn prompt が残るかを確認する。",
    },
    {
      id: "dead-md",
      title: "陳腐化 md (完了済 作業指示書 / 削除予定 spec / orphan references)",
      agentType: "general-purpose",
      focus:
        "live 参照がゼロになった陳腐化 md (完了済の作業指示書 / 削除予定 spec / どこからも参照されない references) を洗い出す。",
      how:
        "候補 md について grep で repo 全体の live 参照を確認し、参照ゼロ (= orphan) を確証してから挙げる。完了済を示す注記 / README も根拠にする。",
    },
    {
      id: "doc-drift",
      title: "ドキュメント乖離 (ADR Status / implementation-order status / stale 注記)",
      agentType: "general-purpose",
      focus:
        "実装と doc の乖離を洗い出す: 実装済だが ADR が `Status: Proposed` のまま / implementation-order.md の status drift (✅/☐) / stale な注記。",
      how:
        "ADR の Status と実装の実在を突合し、implementation-order.md の trigger 表の ✅/☐ と実コードの実在を突合する。",
    },
  ],
};

// scan-finding を骨格に axis 必須・recommended_action 追加・severity/domain を optional 化したもの。
const surveyFindingSchema = {
  type: "object",
  required: ["findings"],
  properties: {
    findings: {
      type: "array",
      items: {
        type: "object",
        required: ["title", "files", "evidence", "axis"],
        properties: {
          axis: { type: "string" },
          title: { type: "string" },
          severity: { type: "string", enum: ["critical", "high", "medium", "low", "n/a"] },
          domain: { type: "string" },
          files: { type: "array", items: { type: "string" } }, // file:line 形式
          symbols: { type: "array", items: { type: "string" } },
          summary: { type: "string" },
          evidence: { type: "string" }, // 引用 excerpt
          confidence: { type: "string", enum: ["high", "medium", "low"] },
          recommended_action: { type: "string" },
        },
      },
    },
    coverage_note: { type: "string" },
  },
};

const input = normalizeArgs();

phase("survey");

// agentType は plugin scoped 名 (op-skill:<name>)。built-in は bare。
const BUILTIN_AGENTS = new Set(["general-purpose", "Explore", "Plan"]);
const scopedAgentType = (n) => (n && !BUILTIN_AGENTS.has(n) ? `op-skill:${n}` : n);
log(
  `op-survey: goal="${truncate(input.goal, 60)}" axes=${input.axes.length} ` +
    `preset=${input.preset || "(none)"} source=${input.axis_source}`
);
if (input.fable_guard_corrections.length)
  log(
    `[fable-guard] read-only spawn への fable 指定を opus へ矯正: ${input.fable_guard_corrections.join(", ")} (model-selection.md §7.2)`
  );

// filter(Boolean) しない: axes と index で zip する。
const surveyResults = await parallel(
  input.axes.map((axis, i) => () =>
    agent(buildSurveyPrompt(axis, i, input), {
      label: `survey ${axis.id}`,
      phase: "survey",
      schema: surveyFindingSchema,
      agentType: scopedAgentType(axis.agentType || input.default_agent_type),
      model: input.model,
    })
  )
);

const findings = flatWithProvenance(surveyResults, input.axes);

const coverageNotes = collectCoverageNotes(surveyResults, input.axes);

return {
  goal: input.goal,
  preset: input.preset,
  axis_source: input.axis_source,
  findings,
  coverage_notes: coverageNotes,
};

// finding_ref = `<axis_id>:<title>#<idx>`。null result (investigator 失敗) は空 batch 扱い。
function flatWithProvenance(surveyResults, axes) {
  const out = [];
  axes.forEach((axis, ai) => {
    const result = surveyResults[ai];
    const batch = result && Array.isArray(result.findings) ? result.findings : [];
    batch.forEach((f, fi) => {
      out.push({ ...f, detected_by: axis.id, finding_ref: `${axis.id}:${f.title || "finding"}#${fi}` });
    });
  });
  return out;
}

// null result (investigator 失敗) は failure note を残す。
function collectCoverageNotes(surveyResults, axes) {
  return axes.map((axis, ai) => {
    const result = surveyResults[ai];
    if (!result) {
      return { axis: axis.id, note: "(investigator が結果を返さなかった = spawn 失敗 / 空応答。再実行候補)" };
    }
    return { axis: axis.id, note: result.coverage_note || "(coverage_note なし)" };
  });
}

function truncate(s, max) {
  const str = typeof s === "string" ? s : String(s == null ? "" : s);
  return str.length > max ? str.slice(0, max) + "…" : str;
}

// axis 解決の優先順位: axes 明示 > preset 名 > goal 導出。
function normalizeArgs() {
  const a = typeof args === "string" ? JSON.parse(args) : args;
  if (!a || typeof a !== "object") throw new Error("op-survey: args must be an object");
  if (!a.repo_root) throw new Error("op-survey: args.repo_root is required");
  if (!a.goal || typeof a.goal !== "string")
    throw new Error("op-survey: args.goal (string) is required (調査の目的)");

  if (!a.model) a.model = "sonnet";
  // read-only spawn は fable 禁止 (model-selection.md §7.2)。opus へ矯正して記録する。
  a.fable_guard_corrections = [];
  if (a.model === "fable") {
    a.model = "opus";
    a.fable_guard_corrections.push("investigator");
  }
  if (!a.default_agent_type) a.default_agent_type = "general-purpose";

  a.axes = resolveAxes(a);
  if (!Array.isArray(a.axes) || a.axes.length === 0)
    throw new Error("op-survey: 調査軸 (axes) を解決できませんでした (axes / preset / goal のいずれかが必要)");
  return a;
}

// axis_source も併せて確定する。
function resolveAxes(a) {
  if (Array.isArray(a.axes) && a.axes.length > 0) {
    a.axis_source = "explicit";
    return a.axes.map((ax, i) => normalizeAxis(ax, i));
  }
  if (a.preset) {
    const preset = AXIS_PRESETS[a.preset];
    if (!preset) {
      const known = Object.keys(AXIS_PRESETS).join(", ");
      throw new Error(`op-survey: 未知の preset "${a.preset}" (既知: ${known || "(なし)"})`);
    }
    a.axis_source = `preset:${a.preset}`;
    return preset.map((ax, i) => normalizeAxis(ax, i));
  }
  // goal から軸を導出する単一 investigator (軸分解は investigator に任せる)。
  a.axis_source = "goal-derived";
  return [
    normalizeAxis(
      {
        id: "goal-survey",
        title: "goal からの横断調査",
        focus: "goal を読んで調査軸を自分で 2〜4 個立て、それぞれを read-only で調査する。",
        how: "goal が指す範囲を repo map から特定し、各軸の findings を 1 つの findings 配列にまとめて返す。",
      },
      0
    ),
  ];
}

// id 欠落時は index 由来の id を振る。
function normalizeAxis(ax, i) {
  if (!ax || typeof ax !== "object") return { id: `axis-${i}`, title: `軸 ${i}`, focus: "", how: "" };
  return {
    id: ax.id || `axis-${i}`,
    title: ax.title || ax.id || `軸 ${i}`,
    focus: ax.focus || "",
    how: ax.how || "",
    agentType: ax.agentType, // 未指定なら default_agent_type
  };
}

function buildSurveyPrompt(axis, i, a) {
  const lines = [
    "invocation_mode: op_managed",
    "",
    `あなたは ${axis.agentType || a.default_agent_type} です。op-survey (汎用 investigation fan-out) から呼ばれた OP-managed Mode 起動です。`,
    "リポジトリを read-only で横断調査し、構造化 findings を返してください。",
    "",
    "共通宣言 (invocation_mode / 質問禁止 / 必読 checklist / commits_added):",
    "`~/.claude/skills/_shared/spawn-prompt-common.md` §1〜§4 を参照。",
    "本フェーズは investigation (exploration-only) のため commits_added: [] が正解 (commit は行わない)。",
    "You must not ask interactive questions. Do not stop and wait for commander or user replies.",
    "",
    "【方針】",
    "- コードを変更しない (Read / Grep / Glob と git log / git diff / git ls-files のみ使用)",
    "- 静的証拠ベースで報告する (引用 file:line + excerpt)。「可能性がある」「テストすれば分かる」は禁句",
    "- **判定・順位付け・確定はしない** (findings を列挙するだけ。確定は呼び出し側 controller / 人間が行う)",
    "- スタック前提は ~/.claude/skills/_shared/project-profile.md に従う",
    "",
    `【調査の全体目的 (goal)】`,
    a.goal,
    "",
    `【あなたの担当 axis: ${axis.id}】`,
    `- 観点: ${axis.title}`,
    axis.focus ? `- focus: ${axis.focus}` : "",
    axis.how ? `- 調べ方: ${axis.how}` : "",
    "",
    "【出力契約 (surveyFindingSchema)】",
    "findings 配列を入れた JSON object を返す (検出 0 件は {\"findings\": [], \"coverage_note\": \"...\"})。",
    "各 finding には以下を入れる:",
    `- axis: "${axis.id}" (担当 axis を転写する)`,
    "- title: 1 行要約",
    "- files: 該当箇所を file:line 形式の配列で (証拠の所在)",
    "- evidence: 引用 excerpt (実コード片 / 実 md 片。自然文要約だけは不可)",
    "- recommended_action: 推奨アクション (修正 / 削除 / CLI化 / Workflow化 / Status 更新 等、自然文)",
    "- severity (optional): 危険度。doc drift 等 severity に乗らないものは省略してよい",
    "- confidence (optional): 確信度 (high / medium / low)",
    "- domain (optional): 該当する場合の領域",
    "coverage_note には「調べた範囲 / 該当なし / 調べきれなかった範囲」を自然文で残す。",
    "",
    "【完了条件】",
    "検出が 0 件でも coverage_note を付けて {\"findings\": []} を返す。JSON 以外のテキストは付けない。",
  ];
  return lines.filter((l) => l !== "").join("\n");
}
