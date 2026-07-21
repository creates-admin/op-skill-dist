/**
 * 機能概要:
 *   汎用 investigation fan-out workflow (Issue #645)。曖昧な「調べて直したい」横断調査を構造化する。
 *   1 phase (survey):
 *   - goal/axes/preset で **調査軸 (axis)** を解決し、軸ごとに investigator を `parallel()` spawn する。
 *     各 investigator は repo を read-only 調査し、survey 向け **構造化 findings** を schema で返す。
 *   - 全 axis の findings を flat 化し `detected_by` (axis 名) / `finding_ref` (`<axis_id>:<name>#<idx>`) を付与する。
 *   - 戻り値 `{ findings[], coverage_notes }`。**判定・順位付け・確定はしない** (確定は呼び出し側 controller / 人間)。
 *   汎用土台 (goal/axes パラメータ化) + op-skill 用 preset (op-skill-migration、4 軸) を同梱する。
 *
 * 作成意図:
 *   op-plan は goal-driven な「起票→分解→enrichment→op-run」は強いが、曖昧な「調べて直したい」要望に対する
 *   多軸 discovery ができない (既存は op-scan-audit=コードバグ特化 / op-explore-render=UI 試作 のみ)。直近の
 *   op-skill 移行監査 (CLI化余地 / Workflow化未達 / 不要 md) で露呈し、司令官が opus 3 並列の bespoke 調査で代替した。
 *   これを構造化した共通土台が無いため新設する。骨格は op-scan-audit.js を踏襲する
 *   (normalizeArgs / flatWithProvenance / scanFindingSchema / parallel spawn パターンを流用)。
 *
 * 注意点 (silent fork 防止 = 最重要、op-survey ≠ op-run-discover ≠ op-scan-audit):
 *   - **op-survey** = 汎用横断調査。曖昧な goal/preset から axis を立て、構造化 findings を返すだけ (判定しない)。
 *   - **op-run-discover** = op-run 実装フェーズ専用の cluster 探知。investigationSchema (files_likely_to_modify /
 *     needs_serialization) を返し、Stage2 競合検出のための investment であって横断調査ではない。
 *   - **op-scan-audit** = コードバグ特化の観点別 audit (canonical scan-finding + 起票前 refute)。
 *     流用するのは schema/helper であって役割ではない。
 *   - 判定・確定・順位付けを workflow に持たせない (findings を返すだけ。確定は controller / 人間)。
 *     `aggregateVerdict` (最重値集約) 等の判定ロジックは流用禁止 (op-explore-render 決定E と同じ規律)。
 *   - 新 active expert 0 (ADR-0012/0013 原則)。investigator は既存 agentType を流用
 *     (既定 general-purpose、構造軸は preset で refactor-expert 等を指定可)。
 *   - ADR 不採用の根拠: 新 cross-skill capability だが op-explore(ADR-0013)/judge-panel(ADR-0014) と異なり、
 *     既存 workflow パターン (op-scan-audit) の踏襲 + 既存配布 (ADR-0010) に乗るため ADR 不採用
 *     (op-plan フェーズ2-2「ADR なしで進める」+ 根拠記録)。境界定義は本 header + README に記録する。
 *   - exploration-only。コードを編集・commit・push しない (commits_added を出さない)。
 *   - **args は Workflow tool から JSON 文字列で到着する** (C1/C2 段階1.5 実測)。normalizeArgs() で parse する。
 *   - REAL_API 準拠: export const meta (pure literal 第一文) / phase() は body 冒頭のみ (stage callback 内で呼ばない) /
 *     非決定 API (現在時刻取得・乱数生成・引数なしの日付生成) 不使用 (タイムスタンプは args 注入、ランダム性は index で)。
 */

export const meta = {
  name: "op-survey",
  description:
    "汎用 investigation fan-out workflow (Issue #645): 曖昧な横断調査を goal/axes/preset で調査軸に分解し、軸ごとに investigator を read-only 並列 spawn → findings を flat 化し detected_by/finding_ref を付与して { findings, coverage_notes } を返す。判定・順位付け・確定はしない (確定は controller / 人間)。op-skill-migration preset (4 軸) 同梱。新 active expert 0",
  phases: [{ title: "survey" }],
};

// op-skill-migration preset の調査軸カタログ。各 axis は investigator prompt の核 (focus / how) と
// 既定 agentType を持つ。preset 名指定時に AXIS_PRESETS[preset] が axes として展開される。
// 構造軸 (cli-migration / workflow-migration) は refactor-expert、md 系は general-purpose を既定にする
// (新 active expert を増やさない = ADR-0012/0013 原則)。
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
        "既存 primitive で置換可能か / 新 primitive が要るかを区別する。gh CLI glue は op::fetch ラップ方針 (ADR-0005) に照らす。",
    },
    {
      id: "workflow-migration",
      title: "Workflow 化未達 (inline Agent 並列 spawn の残存)",
      agentType: "refactor-expert",
      focus:
        "SKILL.md にインライン `Agent` 並列 spawn のまま残る fan-out / Dynamic Workflows 移行 wave の roadmap drift を洗い出す。",
      how:
        "ADR-0009 Phase C (C1-C4) の移行対象に対し、workflows/op-*.js へ移行済みか / SKILL.md に巨大インライン spawn prompt が残るかを確認する。",
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

// survey finding schema。op-scan-audit.js の scanFindingSchema (canonical scan-finding) を骨格にし、
// survey 向けに調整する: (1) `axis` を必須追加 (どの調査軸で検出したか) (2) `recommended_action` を追加
// (修正/削除/CLI化 等の推奨アクション、自然文) (3) `severity` を optional 化 (survey は全件 severity 評価
// ではない。doc drift 等は severity に乗らない) (4) `domain` も optional (横断調査は単一 domain に収まらない)。
// item.required は survey の最小骨格 (title / files / evidence / axis) のみ hard 強制し、残りは additive
// (forward-compat、controller が転写時に必要なら検証する)。
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
          axis: { type: "string" }, // どの調査軸 (axis.id) で検出したか
          title: { type: "string" },
          // severity は optional (doc drift 等は severity に乗らない)。付ける場合は canonical enum に従う。
          severity: { type: "string", enum: ["critical", "high", "medium", "low", "n/a"] },
          // domain も optional (横断調査は単一 domain に収まらない)。
          domain: { type: "string" },
          files: { type: "array", items: { type: "string" } }, // file:line 形式
          symbols: { type: "array", items: { type: "string" } },
          summary: { type: "string" },
          evidence: { type: "string" }, // 引用 excerpt
          confidence: { type: "string", enum: ["high", "medium", "low"] },
          recommended_action: { type: "string" }, // 修正/削除/CLI化 等の推奨アクション (自然文)
          // 残りの canonical field は additive (forward-compat、controller が転写時に検証)
        },
      },
    },
    // 当該軸で「調べたが該当なし」「調べきれなかった範囲」を自然文で残す (取りこぼし可視化、判定はしない)。
    coverage_note: { type: "string" },
  },
};

// args は Workflow tool から JSON 文字列で到着する (C1/C2 段階1.5 実測) → parse + 入力検証。
const input = normalizeArgs();

phase("survey");

// --- plugin scoped-name: Workflow agent() の agentType は plugin 登録名 (op-skill:<name>) で解決する ---
// built-in (general-purpose/Explore/Plan) は plugin component でないため bare 維持。axis の agentType data は
// bare 正本 (AXIS_PRESETS/normalizeAxis)、spawn 境界でのみ前置する (skills/_shared/expert-spawn.md「Plugin scoped-name 規約」)。
const BUILTIN_AGENTS = new Set(["general-purpose", "Explore", "Plan"]);
const scopedAgentType = (n) => (n && !BUILTIN_AGENTS.has(n) ? `op-skill:${n}` : n);
log(
  `op-survey: goal="${truncate(input.goal, 60)}" axes=${input.axes.length} ` +
    `preset=${input.preset || "(none)"} source=${input.axis_source}`
);

// ---- survey stage: axis ごとに investigator を read-only 並列 spawn (各 investigator が {findings:[...]} を返す) ----
// filter(Boolean) しない: axis↔結果を index で zip するため (finding に detected_by が無く、null は空 batch 扱い)。
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

// 全 finding を flat 化 + provenance (detected_by = axis.id) + finding_ref (<axis_id>:<name>#<idx>) を付与。
const findings = flatWithProvenance(surveyResults, input.axes);

// coverage_notes: 各 axis が「調べた範囲 / 該当なし / 調べきれなかった範囲」を残す (判定でなく取りこぼし可視化)。
const coverageNotes = collectCoverageNotes(surveyResults, input.axes);

// controller / 人間はこの戻り値で findings を確定 (起票 / 修正 / 棄却) する。workflow は判定しない。
return {
  goal: input.goal,
  preset: input.preset,
  axis_source: input.axis_source,
  findings,
  coverage_notes: coverageNotes,
};

// ---- helpers ----

// survey 結果 (raw、未 filter) を axis と index で zip し、各 finding に detected_by + finding_ref を付与する。
// surveyResults[i] が null (investigator 失敗) の場合は空 batch 扱い (index ずれを起こさない)。
// finding_ref は `<axis_id>:<name>#<idx>` 形 (op-patrol-audit の region-grouped と同じ provenance 規律)。
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

// 各 axis の coverage_note を集約する。null result (investigator 失敗) は failure note を残し
// 取りこぼしを可視化する (axis と index で zip)。
function collectCoverageNotes(surveyResults, axes) {
  return axes.map((axis, ai) => {
    const result = surveyResults[ai];
    if (!result) {
      return { axis: axis.id, note: "(investigator が結果を返さなかった = spawn 失敗 / 空応答。再実行候補)" };
    }
    return { axis: axis.id, note: result.coverage_note || "(coverage_note なし)" };
  });
}

// ログ用の安全な切り詰め (非決定 API 不使用、純関数)。
function truncate(s, max) {
  const str = typeof s === "string" ? s : String(s == null ? "" : s);
  return str.length > max ? str.slice(0, max) + "…" : str;
}

// ---- args 正規化 + 入力アサーション (Workflow input には schema 強制が無いため entry で fail-fast) ----
// axis 解決の優先順位 (Issue #645 やること1): axes 明示 → それを使う / preset 名 → AXIS_PRESETS から展開 /
// 両方無し → goal から導出 (investigator が goal を読んで軸を立てる単一 axis を立てる)。
function normalizeArgs() {
  const a = typeof args === "string" ? JSON.parse(args) : args;
  if (!a || typeof a !== "object") throw new Error("op-survey: args must be an object");
  if (!a.repo_root) throw new Error("op-survey: args.repo_root is required");
  if (!a.goal || typeof a.goal !== "string")
    throw new Error("op-survey: args.goal (string) is required (調査の目的)");

  // model: investigator は調査 (read-only discovery) のため既定 sonnet (探索並列は安価に。ceiling 課題でないため)。
  if (!a.model) a.model = "sonnet";
  // axis が agentType を持たない場合の既定。新 active expert を増やさない (general-purpose)。
  if (!a.default_agent_type) a.default_agent_type = "general-purpose";

  a.axes = resolveAxes(a);
  if (!Array.isArray(a.axes) || a.axes.length === 0)
    throw new Error("op-survey: 調査軸 (axes) を解決できませんでした (axes / preset / goal のいずれかが必要)");
  return a;
}

// axis 解決ロジック (純関数、test 対象)。axis_source を併せて確定する (provenance 可視化)。
function resolveAxes(a) {
  // 1) axes 明示 → 正規化して使う
  if (Array.isArray(a.axes) && a.axes.length > 0) {
    a.axis_source = "explicit";
    return a.axes.map((ax, i) => normalizeAxis(ax, i));
  }
  // 2) preset 名指定 → 同梱 preset の axis セットを使う
  if (a.preset) {
    const preset = AXIS_PRESETS[a.preset];
    if (!preset) {
      const known = Object.keys(AXIS_PRESETS).join(", ");
      throw new Error(`op-survey: 未知の preset "${a.preset}" (既知: ${known || "(なし)"})`);
    }
    a.axis_source = `preset:${a.preset}`;
    return preset.map((ax, i) => normalizeAxis(ax, i));
  }
  // 3) axes / preset 共に無し → goal から軸を導出する単一 investigator を立てる
  //    (investigator が goal を読んで自身で 2〜4 軸に分けて調査する。workflow 側で goal を機械分解しない)。
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

// axis を正規化する (id 欠落時は index 由来の id を振る。純関数、test 対象)。
function normalizeAxis(ax, i) {
  if (!ax || typeof ax !== "object") return { id: `axis-${i}`, title: `軸 ${i}`, focus: "", how: "" };
  return {
    id: ax.id || `axis-${i}`,
    title: ax.title || ax.id || `軸 ${i}`,
    focus: ax.focus || "",
    how: ax.how || "",
    agentType: ax.agentType, // 未指定なら spawn 時に default_agent_type にフォールバック
  };
}

// survey investigator prompt: read-only 横断調査。axis の focus / how を埋め込み、survey findings schema で返させる。
// 判定・順位付けはさせない (findings を返すだけ)。コードを変更させない。
function buildSurveyPrompt(axis, i, a) {
  const lines = [
    "invocation_mode: op_managed",
    "",
    `あなたは ${axis.agentType || a.default_agent_type} です。op-survey (汎用 investigation fan-out) から呼ばれた OP-managed Mode 起動です。`,
    "リポジトリを read-only で横断調査し、構造化 findings を返してください。",
    "",
    "共通宣言 (invocation_mode / 質問禁止 / 必読 checklist / commits_added):",
    "`~/.claude/skills/_shared/spawn-prompt-common.md (>=1)` §1〜§4 を参照。",
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
    "coverage_note には「調べた範囲 / 該当なし / 調べきれなかった範囲」を自然文で残す (取りこぼし可視化)。",
    "",
    "【完了条件】",
    "検出が 0 件でも coverage_note を付けて {\"findings\": []} を返す。JSON 以外のテキストは付けない。",
  ];
  return lines.filter((l) => l !== "").join("\n");
}
