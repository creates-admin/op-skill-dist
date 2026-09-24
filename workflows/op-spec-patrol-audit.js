export const meta = {
  name: "op-spec-patrol-audit",
  description:
    "canonical spec (.claude/rules/) の domain drift を spec-expert で監査 + 起票前 refute する。feature ごとに spec-expert を並列 spawn し正本⟷code を照合 (spec_stale / code_deviation / premise_mismatch) → High/Critical を別インスタンス skeptic で反証 (default=refuted)。機械 drift (broken-link / paths-overlap / cite / index) は CLI (op spec-patrol) 担当で対象外。feature 選定 / severity gate / dedup / 起票 / Ledger 更新は controller 保持",
  phases: [{ title: "audit" }, { title: "refute" }],
};

// spec-expert の diff_summary (expert-spec/SKILL.md §4) を domain drift finding に正規化したもの。
const SPEC_DRIFT_SCHEMA = {
  type: "object",
  required: ["findings"],
  properties: {
    spec_state: { type: "string", enum: ["exists", "stale", "missing"] },
    findings: {
      type: "array",
      items: {
        type: "object",
        required: ["feature", "diff_type", "severity", "spec_says", "code_reality", "source", "evidence_grade"],
        properties: {
          feature: { type: "string" },
          diff_type: { type: "string", enum: ["spec_stale", "code_deviation", "premise_mismatch"] },
          severity: { type: "string", enum: ["critical", "high", "medium", "low", "n/a"] },
          severity_reason: { type: "string" },
          spec_says: { type: "string" },
          code_reality: { type: "string" },
          // file::symbol (行番号でなく)
          source: { type: "string" },
          evidence: { type: "string" },
          evidence_grade: { type: "string", enum: ["direct", "inferred", "requires_runtime"] },
          // spec を直す / code を直す / 人間判断
          suggested_direction: { type: "string" },
          cross_feature: { type: ["string", "null"] },
        },
      },
    },
    needs_human_decision: { type: "object" },
  },
};

const REFUTE_SCHEMA = {
  type: "object",
  required: ["finding_ref", "verdict", "refuted", "reason", "evidence_excerpt", "reread_performed"],
  properties: {
    finding_ref: { type: "string" },
    verdict: { type: "string", enum: ["confirmed", "refuted", "downgrade"] },
    refuted: { type: "boolean" },
    // verdict=downgrade で必須
    confirmed_severity: { type: "string", enum: ["critical", "high", "medium", "low", "n/a"] },
    reason: { type: "string" },
    evidence_excerpt: { type: "string", minLength: 1 },
    // 'file:line-line' または '<spec_path>:<section>'
    evidence_location: { type: "string" },
    reread_performed: { type: "boolean" },
    // confirmed に必要
    drift_confirmed_by_evidence: { type: "boolean" },
    needs_human_decision: { type: "object" },
  },
};

const input = normalizeArgs();

phase("audit");

// agentType は plugin scoped 名 (op-skill:<name>)。built-in は bare。
const BUILTIN_AGENTS = new Set(["general-purpose", "Explore", "Plan"]);
const scopedAgentType = (n) => (n && !BUILTIN_AGENTS.has(n) ? `op-skill:${n}` : n);
log(
  `op-spec-patrol-audit: features=${input.features.length} run_id=${input.run_id} today=${input.today}`
);

// filter(Boolean) しない: features と index で zip する。
const auditResults = await parallel(
  input.features.map((f) => () =>
    agent(buildAuditPrompt(f, input), {
      label: `audit ${f.feature}`,
      phase: "audit",
      schema: SPEC_DRIFT_SCHEMA,
      agentType: scopedAgentType("spec-expert"),
      model: "opus",
    })
  )
);

const features = regroupByFeature(input.features, auditResults);

// Medium 以下は refute 対象外。
const refuteTargets = [];
features.forEach((ft) => {
  ft.findings.forEach((f) => {
    if (["high", "critical"].includes(f.severity)) refuteTargets.push(f);
  });
});

const verdicts = (
  await parallel(refuteTargets.map((f) => () => runRefute(f, input)))
).filter(Boolean);

return attachVerdicts(input, features, verdicts);

// stage callback 内で phase() を呼ばない。
async function runRefute(finding, a) {
  return await agent(buildRefutePrompt(finding, a), {
    label: `refute ${finding.finding_ref}`,
    phase: "refute",
    schema: REFUTE_SCHEMA,
    agentType: scopedAgentType("spec-expert"),
    model: "opus",
  });
}

// finding_ref = `<feature>#<idx>`。null result (spawn 失敗) は空 batch 扱い。
function regroupByFeature(featureDefs, auditResults) {
  return featureDefs.map((def, di) => {
    const result = auditResults[di];
    const batch = result && Array.isArray(result.findings) ? result.findings : [];
    const findings = batch.map((f, fi) => ({
      ...f,
      detected_by: "spec-expert",
      feature: def.feature,
      finding_ref: `${def.feature}#${fi}`,
    }));
    const spec_state = result && typeof result.spec_state === "string" ? result.spec_state : null;
    return { feature: def.feature, spec_path: def.spec_path, spec_state, findings };
  });
}

// verdict を finding_ref で feature に再配分し、feature ごとの audit_report 統計を付ける。
function attachVerdicts(a, features, verdicts) {
  const vByRef = new Map();
  verdicts.forEach((v) => {
    if (v && v.finding_ref) vByRef.set(v.finding_ref, v);
  });
  const outFeatures = features.map((ft) => {
    const ftVerdicts = [];
    ft.findings.forEach((f) => {
      const v = vByRef.get(f.finding_ref);
      if (v) ftVerdicts.push(v);
    });
    const driftCount = ft.findings.length;
    const confirmedCount = ftVerdicts.filter((v) => v.verdict === "confirmed").length;
    const refutedCount = ftVerdicts.filter((v) => v.verdict === "refuted").length;
    return {
      feature: ft.feature,
      spec_path: ft.spec_path,
      spec_state: ft.spec_state,
      findings: ft.findings,
      verdicts: ftVerdicts,
      audit_report: {
        feature: ft.feature,
        drift_count: driftCount,
        confirmed_count: confirmedCount,
        refuted_count: refutedCount,
      },
    };
  });
  const sum = (fn) => outFeatures.reduce((n, f) => n + fn(f), 0);
  return {
    today: a.today,
    run_id: a.run_id,
    features: outFeatures,
    summary: {
      features_count: outFeatures.length,
      findings_total: sum((f) => f.findings.length),
      confirmed_total: sum((f) => f.audit_report.confirmed_count),
      refuted_total: sum((f) => f.audit_report.refuted_count),
    },
  };
}

function normalizeArgs() {
  const a = typeof args === "string" ? JSON.parse(args) : args;
  if (!a) throw new Error("op-spec-patrol-audit: args missing");
  if (!Array.isArray(a.features) || a.features.length === 0)
    throw new Error("op-spec-patrol-audit: args.features must be a non-empty array");
  if (!a.today)
    throw new Error("op-spec-patrol-audit: args.today (YYYY-MM-DD) required");
  if (!a.run_id) throw new Error("op-spec-patrol-audit: args.run_id is required");
  for (const f of a.features) {
    if (!f.feature || !f.spec_path)
      throw new Error(`op-spec-patrol-audit: feature ${f.feature || "?"} missing feature/spec_path`);
  }
  return a;
}

function buildAuditPrompt(f, a) {
  return [
    "invocation_mode: op_managed",
    "",
    "あなたは spec-expert です。canonical spec (正本) の **domain drift** を read-only で監査してください。",
    "op-spec-patrol から呼ばれた OP-managed Mode 起動です。質問で停止しない。",
    "共通宣言 (invocation_mode / 質問禁止 / 必読 checklist / commits_added):",
    "`~/.claude/skills/_shared/spawn-prompt-common.md` §1〜§4 を参照。",
    "本フェーズは patrol (exploration-only) のため commits_added: [] が正解 (commit / 正本 write は行わない)。",
    "You must not ask interactive questions. Do not stop and wait for commander or user replies.",
    "",
    "【実行日 (op-spec-patrol が注入)】",
    `today: ${a.today} (agent 側で日付推測 / date 実行をしない)`,
    `run_id: ${a.run_id}`,
    "",
    "【監査対象 feature】",
    `- feature: ${f.feature}`,
    `- 正本 (spec): ${f.spec_path}`,
    `- code scope (paths): ${JSON.stringify(f.paths || [])}`,
    `- 照合 code 範囲: ${JSON.stringify(f.code_scope || f.paths || [])}`,
    `- status: ${f.status || "(unknown)"}`,
    f.target_issues && f.target_issues.length
      ? `- 紐づく issue (前提照合対象): ${JSON.stringify(f.target_issues)}`
      : "- 紐づく issue: なし",
    "",
    "【あなたの仕事 = domain drift 専任の 3 者照合】",
    "正本 (.claude/rules/<feature>.md) と real code を Read で突き合わせ、以下の **domain drift** を検出する:",
    "- spec_stale: 正本の決定/不変則が古く、code が新しい挙動に進んでいる (正本が追従漏れ)",
    "- code_deviation: code が正本の決定/不変則を破っている",
    "- premise_mismatch: 紐づく issue の前提が実コードと食い違う (target_issues がある時のみ)",
    "各 finding は spec_says (正本が言っていること) ⟷ code_reality (code の実態) + source (file::symbol) を必ず示す。",
    "行番号でなく **ファイル + シンボル名 / 節** で示す。",
    "",
    "【対象外】",
    "以下の **機械 drift は CLI (op spec-patrol) が決定論的に検出するので報告しない**:",
    "- broken-link (`[[feature/section]]` の dead feature / dead section)",
    "- paths-overlap (正本間 paths の disjoint 違反)",
    "- cite (出典欠落 [human] の降格)",
    "- index (constitution Part 2 索引表の stale / 新規 feature)",
    "あなたは **LLM 判断が要る domain の意味的乖離だけ** を見る (機械照合できるものは CLI に委ねる)。",
    "",
    "【方針】",
    "- 正本も code も変更しない (Read / Grep / Glob のみ)。正本 write は controller (op-spec) のみが human align 後に行う。",
    "- Critical / High のみ報告。Medium 以下は無視。",
    "- 判定基準は ~/.claude/skills/_shared/severity-rubric.md。",
    "- 「可能性がある」「〜かもしれない」は禁止。spec_says ⟷ code_reality を実コード/実正本で示せる時のみ報告。",
    "- `[code]` を主張する前に必ず該当ソースを Read 確認する (捏造禁止)。確認できなければ報告しない。",
    "- どちらが正か (spec/code) を勝手に決めない。判断不能は finding の suggested_direction に '人間判断' と記し、",
    "  全体が判断不能なら needs_human_decision を返す。",
    "",
    "【出力契約】",
    "SPEC_DRIFT_SCHEMA に従う JSON object を返す: {spec_state, findings:[{feature, diff_type, severity,",
    "spec_says, code_reality, source, evidence_grade, suggested_direction, cross_feature?}]}。",
    "検出 0 件は {\"spec_state\": \"...\", \"findings\": []}。JSON 以外のテキストは付けない。",
    `各 finding の feature には "${f.feature}" を入れる。`,
  ].join("\n");
}

function buildRefutePrompt(f, a) {
  return [
    "invocation_mode: op_managed",
    "",
    "あなたは spec-expert の **別インスタンス (skeptic mode)** です。",
    "op-spec-patrol の起票前 refute (反証) フェーズから呼ばれた OP-managed Mode 起動です。",
    "正本も code も変更しない (Read / Grep / Glob のみ)。質問で停止しない。",
    "共通宣言: `~/.claude/skills/_shared/spawn-prompt-common.md` §1〜§4。",
    "",
    "【対象 finding (audit が検出、起票候補の domain drift)】",
    JSON.stringify(f),
    "",
    `【実行日】today: ${a.today} (agent 側で date 実行・推測しない)`,
    "",
    "【あなたの仕事】この domain drift が **実在し起票に値するか** を反証で精査する。",
    "1. finding.source の file::symbol を **必ず再 Read する** (該当シンボル全体、±20 行)。",
    "   加えて finding.spec_says の根拠となる **正本該当節も再 Read する**。",
    "   reread_performed: true は実際に再 Read した場合のみ。再 Read せず verdict を出すのは contract violation。",
    "2. reason には、正本 (spec_says) と code (code_reality) が **実際に食い違っている** ことを示す",
    "   **実コード片 / 正本該当節を evidence_excerpt に生のまま引用** して論証する。自然文要約のみは不可。",
    "3. evidence_location に再 Read した範囲を 'file:line-line' または '<spec_path>:<section>' で記す。",
    "",
    "【判定軸 (verdict)】",
    "- 偽陽性 (正本と code は実は一致している / 主張の乖離が存在しない / 引用 source に主張の事象がない) → verdict: refuted",
    "- severity 過大 (severity-rubric.md に照らし Critical/High より低い) → verdict: downgrade + confirmed_severity",
    "- 実在し乖離が実証でき severity 妥当 → verdict: confirmed",
    "",
    "【skeptic default】",
    "**default = refuted**。confirmed にするには、正本と code が実際に食い違うことを示す",
    "**積極的証拠 (drift_confirmed_by_evidence: true + evidence_excerpt の実引用)** が必要。",
    "証拠不十分 / 自然文だけ / 再 Read で乖離を実証できない場合は **refuted に倒す**。",
    "",
    "判定基準: ~/.claude/skills/_shared/severity-rubric.md。",
    "CLAUDE.md 規約に準拠したコードを「正本違反」として批判しない (規約準拠は refuted 方向)。",
    "機械 drift (broken-link / paths-overlap / cite / index) は対象外ゆえ refuted。",
    "",
    `finding_ref には "${f.finding_ref}" を転写する。`,
    "判断不能なら needs_human_decision を返す。REFUTE_SCHEMA で返却する。JSON 以外のテキストを付けない。",
  ].join("\n");
}
