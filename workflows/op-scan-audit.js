export const meta = {
  name: "op-scan-audit",
  description:
    "op-scan 観点別 audit (expert を並列 spawn → canonical scan-finding 集約) + 起票前 refute (normal mode の High/Critical を同 domain 別インスタンス skeptic で偽陽性反証)。severity gate / dedup / 起票は controller 保持",
  phases: [{ title: "audit" }, { title: "refute" }],
};

// canonical scan-finding (expert-spawn.md)。必須は共通 5 field のみ、domain extension は additive。
const scanFindingSchema = {
  type: "object",
  required: ["findings"],
  properties: {
    findings: {
      type: "array",
      items: {
        type: "object",
        required: ["title", "severity", "domain", "files", "evidence_grade"],
        properties: {
          title: { type: "string" },
          severity: { type: "string", enum: ["critical", "high", "medium", "low", "n/a"] },
          severity_reason: { type: "string" },
          domain: {
            type: "string",
            enum: ["debug", "refactor", "optimize", "security", "ux-ui", "design", "test", "feature"],
          },
          files: { type: "array", items: { type: "string" } },
          symbols: { type: "array", items: { type: "string" } },
          summary: { type: "string" },
          evidence: { type: "string" },
          evidence_grade: { type: "string", enum: ["direct", "inferred", "requires_runtime"] },
          recommended_runner: { type: "string" },
          post_check_expert: { type: ["string", "null"] },
        },
      },
    },
  },
};

const refuteVerdictSchema = {
  type: "object",
  required: ["finding_ref", "verdict", "refuted", "reason", "evidence_excerpt", "reread_performed", "supports_claim"],
  properties: {
    finding_ref: { type: "string" },
    verdict: { type: "string", enum: ["confirmed", "refuted", "downgrade"] },
    refuted: { type: "boolean" },
    // verdict=downgrade で必須
    confirmed_severity: { type: "string", enum: ["critical", "high", "medium", "low", "n/a"] },
    reason: { type: "string" },
    evidence_excerpt: { type: "string", minLength: 1 },
    // 'file:line-line'
    evidence_location: { type: "string" },
    reread_performed: { type: "boolean" },
    supports_claim: { type: "boolean" },
    evidence_grade_observed: { type: "string", enum: ["direct", "inferred", "requires_runtime"] },
    // security の refuted で必須
    security_unreachable_proof: { type: "string" },
    needs_human_decision: { type: "object" },
  },
};

const input = normalizeArgs();

phase("audit");

// agentType は plugin scoped 名 (op-skill:<name>)。built-in は bare。
const BUILTIN_AGENTS = new Set(["general-purpose", "Explore", "Plan"]);
const scopedAgentType = (n) => (n && !BUILTIN_AGENTS.has(n) ? `op-skill:${n}` : n);
log(
  `op-scan-audit: mode=${input.mode} experts=${input.experts.length} scope=${input.scope} today=${input.today}`
);
if (input.fable_guard_corrections.length)
  log(
    `[fable-guard] read-only spawn への fable 指定を opus へ矯正: ${input.fable_guard_corrections.join(", ")} (model-selection.md §7.2)`
  );

// filter(Boolean) しない: expert と index で zip する。
const auditResults = await parallel(
  input.experts.map((e) => () =>
    agent(buildAuditPrompt(e, input), {
      label: `audit ${e.name}`,
      phase: "audit",
      schema: scanFindingSchema,
      agentType: scopedAgentType(e.name),
      model: e.model,
    })
  )
);

const findings = flatWithProvenance(auditResults, input.experts);

// from-issue mode は refute しない。Medium 以下も対象外。
const refuteTargets =
  input.mode === "from-issue"
    ? []
    : findings.filter((f) => ["high", "critical"].includes(f.severity));

const verdicts = (
  await parallel(refuteTargets.map((f) => () => runRefute(f, input)))
).filter(Boolean);

return {
  mode: input.mode,
  scope: input.scope,
  today: input.today,
  findings,
  verdicts,
};

// stage callback 内で phase() を呼ばない。
async function runRefute(finding, a) {
  return await agent(buildRefutePrompt(finding, a), {
    label: `refute ${finding.finding_ref}`,
    phase: "refute",
    schema: refuteVerdictSchema,
    agentType: scopedAgentType(finding.detected_by),
    model: "opus",
  });
}

// null result (expert 失敗) は空 batch 扱い。
function flatWithProvenance(auditResults, experts) {
  const out = [];
  experts.forEach((e, ei) => {
    const result = auditResults[ei];
    const batch = result && Array.isArray(result.findings) ? result.findings : [];
    batch.forEach((f, fi) => {
      out.push({ ...f, detected_by: e.name, finding_ref: `${e.name}#${fi}` });
    });
  });
  return out;
}

function normalizeArgs() {
  const a = typeof args === "string" ? JSON.parse(args) : args;
  if (!a) throw new Error("op-scan-audit: args missing");
  if (a.mode !== "normal" && a.mode !== "from-issue")
    throw new Error("op-scan-audit: args.mode must be 'normal' or 'from-issue'");
  if (!Array.isArray(a.experts) || a.experts.length === 0)
    throw new Error("op-scan-audit: args.experts must be a non-empty array");
  if (!a.scope) throw new Error("op-scan-audit: args.scope is required");
  if (!a.today) throw new Error("op-scan-audit: args.today (YYYY-MM-DD) required");
  // read-only spawn は fable 禁止 (model-selection.md §7.2)。opus へ矯正して記録する。
  a.fable_guard_corrections = [];
  for (const e of a.experts) {
    if (!e.name || !e.model)
      throw new Error(`op-scan-audit: expert ${e.name || "?"} missing name/model`);
    if (e.model === "fable") {
      e.model = "opus";
      a.fable_guard_corrections.push(`expert:${e.name}`);
    }
  }
  if (a.mode === "from-issue" && !a.from_issue_body)
    throw new Error("op-scan-audit: from-issue mode requires args.from_issue_body");
  return a;
}

function buildAuditPrompt(e, a) {
  const base = [
    "invocation_mode: op_managed",
    "",
    `あなたは ${e.name} です。${a.scope} を read-only で audit してください。`,
    "op-scan から呼ばれた OP-managed Mode 起動です。",
    "",
    "共通宣言 (invocation_mode / 質問禁止 / 必読 checklist / commits_added):",
    "`~/.claude/skills/_shared/spawn-prompt-common.md` §1〜§4 を参照。",
    "本フェーズは scan (exploration-only) のため commits_added: [] が正解 (commit は行わない)。",
    "You must not ask interactive questions. Do not stop and wait for commander or user replies.",
    "",
    "【実行日 (op-scan が注入)】",
    `today: ${a.today}`,
    "`first_detected_at` / `last_seen_at` 等の日付には本値を使う。`date` 実行や推測をしない。",
    "",
    "【方針】",
    "- コードを変更しない (Read / Grep / Glob のみ使用)",
    "- Critical / High の問題のみ報告。Medium 以下は無視",
    "- 判定基準は ~/.claude/skills/_shared/severity-rubric.md に従う",
    "- スタック前提は ~/.claude/skills/_shared/project-profile.md に従う",
    "  (Rust / Flutter / Vue / Tauri 主戦場、それ以外は推測しない)",
    "- 既存の問題が CLAUDE.md 規約に従っているなら指摘しない",
    "- 「可能性がある」「〜かもしれない」は原則禁止",
    "  ただし入力経路 / 到達条件 / 影響範囲が示せる場合は",
    '  evidence_grade = "requires_runtime" + reproduction_hint で High 起票可',
    "",
    "【出力契約】",
    "canonical schema (~/.claude/skills/_shared/expert-spawn.md) に従う scan-finding を",
    "**findings 配列に入れた JSON object** で返す (検出 0 件は {\"findings\": []})。",
    "全フィールドの必須性は同ドキュメントの「フィールドの必須性」表に準拠。",
    "severity の判定は severity-rubric.md の手順 (到達経路 → 観測可能な被害 → 分類) に従う。",
    "domain フィールドには自分自身の専門領域 (debug / refactor / optimize / security /",
    "ux-ui / design / test / feature のいずれか) を入れる。",
    "",
    "【recommended_runner / post_check_expert を必ず出力する】",
    "`recommended_runner` (apply 担当) と `post_check_expert` (post-check 担当、不要なら null) を全検出に含める。",
    "これらは routing recommendation であり spawn authorization ではない",
    "(op-run が `_shared/runtime-contract.md` の判定優先順位で実 spawn 先を再解決する)。",
    "",
    "refactor-expert の post_check_expert は 3 値のみ:",
    '  "security-expert" / "ux-ui-audit-expert" / null',
    "両方必要に見えるなら Issue を分割する (1 Issue = 1 post-check)。",
    "review-expert は post-check expert に指定不可。",
    "",
    "【designer-expert の非 frontend scope での挙動】",
    "designer-expert は scope に UI surface (Vue / React / Svelte / Flutter Widget / pages /",
    "components / theme / token / style / scss / tailwind / vuetify / material theme 定義 等) が",
    "存在しない場合、即座に findings: [] を返す。",
    "",
    "【完了条件】",
    "検出が 0 件の場合は {\"findings\": []} を返す。JSON 以外のテキストは付けない。",
  ];
  if (a.mode === "from-issue") {
    base.push(
      "",
      "【from-issue モード (元 Issue の正規化)】",
      `元 Issue: #${a.from_issue_number} ("${a.from_issue_title || ""}")`,
      "元 Issue 本文:",
      a.from_issue_body,
      "",
      "【追加指示 (op-scan controller 注入)】",
      a.extra_directives ||
        "(controller が extra_directives を注入。未注入は contract violation)"
    );
  }
  return base.join("\n");
}

function buildRefutePrompt(f, a) {
  const isSecurity = f.domain === "security";
  const lines = [
    "invocation_mode: op_managed",
    "",
    `あなたは ${f.detected_by} の **別インスタンス (skeptic mode)** です。`,
    "op-scan の起票前 refute (反証) フェーズから呼ばれた OP-managed Mode 起動です。",
    "コードを変更しない (Read / Grep / Glob のみ)。質問で停止しない。",
    "共通宣言: `~/.claude/skills/_shared/spawn-prompt-common.md` §1〜§4。",
    "",
    "【対象 finding (audit が検出、起票候補)】",
    JSON.stringify(f),
    "",
    `【実行日】today: ${a.today} (agent 側で date 実行・推測しない)`,
    "",
    "【あなたの仕事】この finding が **実在し起票に値するか** を反証で精査する。",
    "1. finding.files の引用 file:line を **必ず再 Read する** (該当行 ±20 行、または該当シンボル全体)。",
    "   reread_performed: true は実際に再 Read した場合のみ。再 Read せずに verdict を出すのは contract violation。",
    "2. 再 Read した **実コード片を evidence_excerpt に生のまま引用** し、それが finding の主張",
    "   (到達経路 / 観測可能な被害) を支持するか (supports_claim) を reason で論証する。自然文要約のみは不可。",
    "3. evidence_location に再 Read した範囲を 'file:line-line' で記す。",
    "",
    "【判定軸 (verdict)】",
    "- 偽陽性 (引用 file:line に主張の事象が存在しない / 主張の因果が成立しない) → verdict: refuted",
    "- severity 過大 (severity-rubric.md の到達経路→被害 test に照らし Critical/High より低い) → verdict: downgrade + confirmed_severity",
    "- evidence_grade が direct 以外で Critical 申告、または inferred で起票不適格 → verdict: downgrade or refuted",
    "- 実在し severity 妥当 → verdict: confirmed",
    "",
    "判定基準: ~/.claude/skills/_shared/severity-rubric.md / スタック前提: project-profile.md /",
    "CLAUDE.md 規約に準拠したコードを「問題」として批判しない (規約準拠は refuted 方向)。",
    "",
    `finding_ref には "${f.finding_ref}" を転写する。`,
  ];
  if (isSecurity) {
    lines.push(
      "",
      "【security 非対称ルール】",
      "この finding は domain=security のため **default を confirmed に倒す**。",
      "refuted にするには `security_unreachable_proof` に **到達不可であることの積極的証拠**",
      "(source→sink が到達しない / trust boundary で遮断される / required_user_action が成立しない 等を実コードで示す) を記す。",
      "示せない場合・不確実な場合は confirmed のままにする。"
    );
  } else {
    lines.push(
      "",
      "【skeptic default (非 security)】",
      "confirmed にするには上記の積極的証拠が必要。不確実 / 証拠不十分なら **refuted に倒す**。"
    );
  }
  lines.push(
    "",
    "判断不能なら needs_human_decision を返す。refuteVerdictSchema で返却する。JSON 以外のテキストを付けない。"
  );
  return lines.join("\n");
}
