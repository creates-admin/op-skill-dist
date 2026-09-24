export const meta = {
  name: "op-patrol-audit",
  description:
    "op-patrol 区画別観点別 audit (region ごとに area→expert を並列 spawn → canonical scan-finding を region 単位に集約) + 起票前 refute (High/Critical を同 domain 別インスタンス skeptic で偽陽性反証)。region 選定 / severity gate / dedup / 起票 / Patrol Ledger 更新は controller 保持",
  phases: [{ title: "audit" }, { title: "refute" }],
};

// canonical scan-finding (expert-spawn.md)。op-scan-audit と同一 schema。
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

// op-scan-audit と同一 schema。
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
  `op-patrol-audit: regions=${input.regions.length} run_id=${input.run_id} today=${input.today}`
);
if (input.fable_guard_corrections.length)
  log(
    `[fable-guard] read-only spawn への fable 指定を opus へ矯正: ${input.fable_guard_corrections.join(", ")} (model-selection.md §7.2)`
  );

// region × expert を flat に並列 spawn。filter(Boolean) しない: tasks と index で zip する。
const tasks = [];
input.regions.forEach((region) => {
  region.expert_list.forEach((expert) => {
    tasks.push({ region, expert });
  });
});

const auditResults = await parallel(
  tasks.map((t) => () =>
    agent(buildAuditPrompt(t.expert, t.region, input), {
      label: `audit ${t.region.id}:${t.expert.name}`,
      phase: "audit",
      schema: scanFindingSchema,
      agentType: scopedAgentType(t.expert.name),
      model: t.expert.model,
    })
  )
);

const regions = regroupByRegion(input.regions, tasks, auditResults);

// Medium 以下は refute 対象外。
const refuteTargets = [];
regions.forEach((rg) => {
  rg.findings.forEach((f) => {
    if (["high", "critical"].includes(f.severity)) refuteTargets.push(f);
  });
});

const verdicts = (
  await parallel(refuteTargets.map((f) => () => runRefute(f, input)))
).filter(Boolean);

return attachVerdicts(input, regions, verdicts);

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

// finding_ref = `<region_id>:<expert>#<idx>`。null result (expert 失敗) は空 batch 扱い。
function regroupByRegion(regionDefs, tasks, auditResults) {
  const byRegion = new Map();
  regionDefs.forEach((r) => byRegion.set(r.id, []));
  tasks.forEach((t, ti) => {
    const result = auditResults[ti];
    const batch = result && Array.isArray(result.findings) ? result.findings : [];
    const arr = byRegion.get(t.region.id);
    batch.forEach((f, fi) => {
      arr.push({
        ...f,
        detected_by: t.expert.name,
        region_id: t.region.id,
        finding_ref: `${t.region.id}:${t.expert.name}#${fi}`,
      });
    });
  });
  return regionDefs.map((r) => ({ region_id: r.id, area: r.area, findings: byRegion.get(r.id) }));
}

// verdict を finding_ref で region に再配分し、region ごとの audit_report 統計を付ける。
function attachVerdicts(a, regions, verdicts) {
  const vByRef = new Map();
  verdicts.forEach((v) => {
    if (v && v.finding_ref) vByRef.set(v.finding_ref, v);
  });
  const outRegions = regions.map((rg) => {
    const rgVerdicts = [];
    rg.findings.forEach((f) => {
      const v = vByRef.get(f.finding_ref);
      if (v) rgVerdicts.push(v);
    });
    const regionDef = a.regions.find((r) => r.id === rg.region_id) || {};
    const criticalCount = rg.findings.filter((f) => f.severity === "critical").length;
    const highCount = rg.findings.filter((f) => f.severity === "high").length;
    const refutedCount = rgVerdicts.filter((v) => v.verdict === "refuted").length;
    return {
      region_id: rg.region_id,
      area: rg.area,
      findings: rg.findings,
      verdicts: rgVerdicts,
      audit_report: {
        area: rg.area,
        risk_score: typeof regionDef.risk_score === "number" ? regionDef.risk_score : null,
        stale_score: typeof regionDef.stale_score === "number" ? regionDef.stale_score : null,
        findings_count: rg.findings.length,
        critical_count: criticalCount,
        high_count: highCount,
        refuted_count: refutedCount,
      },
    };
  });
  const sum = (fn) => outRegions.reduce((n, r) => n + fn(r), 0);
  return {
    today: a.today,
    run_id: a.run_id,
    regions: outRegions,
    summary: {
      regions_count: outRegions.length,
      findings_total: sum((r) => r.findings.length),
      critical_total: sum((r) => r.audit_report.critical_count),
      high_total: sum((r) => r.audit_report.high_count),
      refuted_total: sum((r) => r.audit_report.refuted_count),
    },
  };
}

function normalizeArgs() {
  const a = typeof args === "string" ? JSON.parse(args) : args;
  if (!a) throw new Error("op-patrol-audit: args missing");
  if (!Array.isArray(a.regions) || a.regions.length === 0)
    throw new Error("op-patrol-audit: args.regions must be a non-empty array");
  if (!a.today)
    throw new Error("op-patrol-audit: args.today (YYYY-MM-DD) required");
  if (!a.run_id) throw new Error("op-patrol-audit: args.run_id is required");
  // read-only spawn は fable 禁止 (model-selection.md §7.2)。opus へ矯正して記録する。
  a.fable_guard_corrections = [];
  for (const r of a.regions) {
    if (!r.id || !r.area)
      throw new Error(`op-patrol-audit: region ${r.id || "?"} missing id/area`);
    if (!Array.isArray(r.expert_list) || r.expert_list.length === 0)
      throw new Error(`op-patrol-audit: region ${r.id} expert_list must be a non-empty array`);
    for (const e of r.expert_list) {
      if (!e.name || !e.model)
        throw new Error(`op-patrol-audit: region ${r.id} expert ${e.name || "?"} missing name/model`);
      if (e.model === "fable") {
        e.model = "opus";
        a.fable_guard_corrections.push(`${r.id}:${e.name}`);
      }
    }
  }
  return a;
}

function buildAuditPrompt(e, region, a) {
  return [
    "invocation_mode: op_managed",
    "",
    `あなたは ${e.name} です。${region.area} を read-only で巡回監査してください。`,
    "op-patrol から呼ばれた OP-managed Mode 起動です。",
    "あなたはこのコードを書いていません。警備員として外部視点で監査します。",
    "",
    "共通宣言 (invocation_mode / 質問禁止 / 必読 checklist / commits_added):",
    "`~/.claude/skills/_shared/spawn-prompt-common.md` §1〜§4 を参照。",
    "本フェーズは patrol (exploration-only) のため commits_added: [] が正解 (commit は行わない)。",
    "You must not ask interactive questions. Do not stop and wait for commander or user replies.",
    "",
    "【実行日 (op-patrol が注入)】",
    `today: ${a.today}`,
    "`first_detected_at` / `last_seen_at` 等の日付には本値を使う (`date` 実行や推測をしない)。",
    "",
    "【巡回コンテキスト】",
    `- 区画: ${region.area}`,
    `- 前回巡回: ${region.last_scanned_at || "初回"}`,
    `- 巡回理由: ${region.selection_reason || "(patrol_score 上位)"}`,
    `- run_id: ${a.run_id}`,
    "",
    "【方針】",
    "- コードを変更しない (Read / Grep / Glob のみ)",
    "- **Patrol Finding Policy を厳守** (後述)",
    "- Critical / High のみ報告。Medium 以下は完全に無視",
    "- 判定基準は ~/.claude/skills/_shared/severity-rubric.md",
    "- スタック前提は ~/.claude/skills/_shared/project-profile.md",
    "  (Rust / Flutter / Vue / Tauri 主戦場、それ以外は推測しない)",
    "- CLAUDE.md 規約に従うコードを「規約が間違っている」と批判しない",
    "- 「可能性がある」「〜かもしれない」は禁止",
    "  到達経路 + 影響範囲を示せる場合のみ evidence_grade=requires_runtime + reproduction_hint で High 起票可",
    "",
    "【Patrol Finding Policy (op-scan より厳しい、完全禁止)】",
    "- 好みのリファクタ提案 / 命名・スタイルの好み",
    "- 将来不安だけの指摘 (到達経路・影響範囲が示せない)",
    "- Medium / Low の起票 (severity-rubric の Critical / High 定義を厳格適用)",
    "- 根拠の薄いセキュリティ指摘 (「あるかも」の量産)",
    "- 全体設計の大改修提案 (巡回スコープ外)",
    "- 未読箇所の推測指摘 (警備員は見たものだけ報告する)",
    "許可 (Critical/High に限り): データ消失・破壊への到達経路 / 認証・権限・パス検証の明確な抜け /",
    "確実に再現するクラッシュ・無限ループ / 観測可能な race condition / ファイル上書き・任意 IO /",
    "queue 詰まり・dead worker / IPC・Tauri command 境界の入力検証漏れ / 主要導線を完全に塞ぐ UX 障害 /",
    "構造的 false pass を生むテスト / design token・共通 component bypass の蔓延 (画面横断で観測可能) /",
    "同一用途 UI が複数実装に分裂しユーザーに同じ操作と認識されない (操作ミスの実害が観測可能)。",
    "designer-expert は加えて: 主観・好み / 単発の余白ズレ / 未定義領域での主観提案 / ux-ui-audit 領域への侵食 を完全禁止",
    "(許可は『観測可能な design system 破綻』のみ)。",
    "**「報告しない判断」を恐れない。警備員は「異常なし」を報告できる。**",
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
    "op-patrol はこれを Issue 本文の `<!-- op-run-expert: ... -->` / `<!-- op-post-check-expert: ... -->` に転写する。",
    "これらは routing recommendation であり spawn authorization ではない",
    "(op-run が `_shared/runtime-contract.md` の判定優先順位で実 spawn 先を再解決する)。",
    "",
    "domain → 標準値:",
    "- debug / optimize / test: recommended_runner = 自分自身、post_check_expert = null",
    "- refactor: recommended_runner = \"refactor-expert\"、post_check_expert は 3 値のみ",
    "    (\"security-expert\" : file IO / path / shell / external input / permission / secret / updater 系、",
    "     \"ux-ui-audit-expert\" : UI state / 操作導線 / 復帰可能性 / a11y / 視覚的 component 系、null : 上記外)。",
    "    両方必要に見える場合は Issue を分割する (1 Issue = 1 post-check)。",
    "    compatibility / release / test / designer / review-expert は post_check_expert に書かない。",
    "- security: recommended_runner = \"security-expert\" (op-run の判定で debug-expert に回ることもある)、",
    "    post_check_expert = \"security-expert\"。canonical schema 拡張 (security / threat_model / usable_security / post_check) を必須出力とする。",
    "- feature: recommended_runner = \"feature-expert\"、UI 影響あれば post_check_expert = \"ux-ui-audit-expert\"",
    "- ux-ui (ux-ui-audit-expert): recommended_runner = \"designer-expert\"、post_check_expert = \"ux-ui-audit-expert\"",
    "- design (designer-expert): recommended_runner = \"designer-expert\"、UI files を触るなら post_check_expert = \"ux-ui-audit-expert\"",
    "",
    "【designer-expert の非 frontend area での挙動】",
    "designer-expert は area に UI surface (Vue / React / Svelte / Flutter Widget / pages /",
    "components / theme / token / style / scss / tailwind / vuetify / material theme 定義 等) が",
    "存在しない場合、即座に {\"findings\": []} を返す。",
    "",
    "【完了条件】",
    "area 内のコードを Read / Grep で巡回し、Patrol Finding Policy に該当する指摘を全て返す。",
    "検出が 0 件の場合は {\"findings\": []} を返す。JSON 以外のテキストは付けない。",
  ].join("\n");
}

function buildRefutePrompt(f, a) {
  const isSecurity = f.domain === "security";
  const lines = [
    "invocation_mode: op_managed",
    "",
    `あなたは ${f.detected_by} の **別インスタンス (skeptic mode)** です。`,
    "op-patrol の起票前 refute (反証) フェーズから呼ばれた OP-managed Mode 起動です。",
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
    "op-patrol の Patrol Finding Policy (好み / 将来不安だけ / 未読推測 / 根拠の薄い security は起票不適格) も refuted 方向の判断材料とする。",
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
