/**
 * 機能概要:
 *   op-scan 観点別 audit + 起票前 refute の Dynamic Workflow (ADR-0009 Phase C / C2)。
 *   - audit  stage: controller が確定した expert list を region.audit_model で並列 spawn し、
 *                   canonical scan-finding (expert-spawn.md) を集約して返す (read-only / exploration-only)。
 *   - refute stage: normal mode の High/Critical finding ごとに **同 domain の別インスタンス skeptic** を
 *                   spawn し、引用 file:line を再 Read して偽陽性 / severity 過大 / 起票不適格を反証する。
 *                   verdict (confirmed/refuted/downgrade) を controller へ返し、controller が
 *                   フェーズ1.5 で verdict 適用 → severity gate → dedup → enrichment → 起票 を行う。
 *
 * 作成意図:
 *   現行 SKILL.md フェーズ1 の single-message Agent 並列 spawn (run_in_background) + Monitor 待ちを
 *   Workflow へ移行 (context 節約)。同時に implementation-order.md C2 の新規項目「起票前 adversarial-verify
 *   (refute) stage」を同梱し、偽陽性を severity gate / dedup / enrichment (最大 8 spawn/Issue) の前で潰す。
 *   refute は enrichment の cross-review (§6) とは別レイヤー (refute = 個別 code finding の偽陽性除去 /
 *   cross-review = issue_draft 全体の品質 review、C4 の領分)。本 workflow は cross-review を持たない。
 *
 * 注意点:
 *   - audit / refute とも exploration-only。コードを編集・commit・push しない (commits_added を出さない)。
 *   - severity gate / dedup / bulk-group / enrichment 呼び出し / 直列 gh issue create は **controller 保持**
 *     (本 workflow は spawn と集約のみ。不変則 7/8)。
 *   - 動的値 (scope / experts / model / today / from-issue 元 Issue 本文) は全て args 注入 (F2 対策)。
 *   - **args は Workflow tool から JSON 文字列で到着する (C1 段階1.5 実測)**。normalizeArgs() で parse する。
 *   - refute の trust model: refuteVerdictSchema (evidence_excerpt minLength:1 / reread_performed 必須) +
 *     controller-side literal 照合 (drop 方向) + verdict↔severity 整合。決定論照合が無いため近似 gate であり
 *     証明ではない (限界は SKILL.md / 完了報告に明示)。
 *   - **security 非対称ルール (D7)**: security の Critical/High を refuted にするには到達不可の積極的証拠
 *     (security_unreachable_proof) を必須化し、default を confirmed に倒す (false-negative 防止)。他 domain は対称 skeptic。
 *   - REAL_API 準拠: export const meta (pure literal 第一文) / phase() は body 冒頭のみ (stage callback 内で呼ばない) /
 *     非決定 API (現在時刻取得・乱数生成・引数なしの日付生成) 不使用 (today は args 注入)。
 */

export const meta = {
  name: "op-scan-audit",
  description:
    "op-scan 観点別 audit (region.audit_model で expert 並列 spawn → canonical scan-finding 集約) + 起票前 refute (normal mode の High/Critical を同 domain 別インスタンス skeptic で偽陽性反証)。severity gate / dedup / bulk-group / enrichment / 直列 gh issue create は controller 保持。refute は enrichment cross-review とは別レイヤー",
  phases: [{ title: "audit" }, { title: "refute" }],
};

// audit finding schema。canonical scan-finding (expert-spawn.md) を findings 配列に入れた object で受ける
// (StructuredOutput は object 返却が安全)。item.required は cross-domain 共通の最小 5 field のみ hard 強制し
// (D4: false negative を避けるため null-drop を最小化)、domain extension (refactor / security 等) は additive。
// controller が転写時に domain ごとの完全性を reject する (SKILL.md L420/L444 の既存経路)。
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
          // 残りの canonical field / domain extension は additive (forward-compat、controller が転写時検証)
        },
      },
    },
  },
};

// refute verdict schema。finding 単位の skeptic 判定。evidence_excerpt は minLength:1 で空証拠を構造 block。
// finding_ref で controller が verdict↔finding を keying する (op-fingerprint は controller フェーズ2-2 で採番)。
const refuteVerdictSchema = {
  type: "object",
  required: ["finding_ref", "verdict", "refuted", "reason", "evidence_excerpt", "reread_performed", "supports_claim"],
  properties: {
    finding_ref: { type: "string" },
    verdict: { type: "string", enum: ["confirmed", "refuted", "downgrade"] },
    refuted: { type: "boolean" },
    // verdict=downgrade で必須 (audit より低い severity)。confirmed/refuted では省略可。
    confirmed_severity: { type: "string", enum: ["critical", "high", "medium", "low", "n/a"] },
    reason: { type: "string" },
    // 再 Read した実コード片 (自然文要約でなく生コード)。空不可。
    evidence_excerpt: { type: "string", minLength: 1 },
    // 'file:line-line' (controller が literal 照合する anchor)。
    evidence_location: { type: "string" },
    reread_performed: { type: "boolean" },
    supports_claim: { type: "boolean" },
    evidence_grade_observed: { type: "string", enum: ["direct", "inferred", "requires_runtime"] },
    // security 非対称 (D7): security の refuted で必須。到達不可の積極的証拠。
    security_unreachable_proof: { type: "string" },
    needs_human_decision: { type: "object" },
  },
};

// args は Workflow tool から JSON 文字列で到着する (C1 段階1.5 実測) → parse + 入力検証。
const input = normalizeArgs();

phase("audit");

// --- plugin scoped-name: Workflow agent() の agentType は plugin 登録名 (op-skill:<name>) で解決する ---
// built-in (general-purpose/Explore/Plan) は plugin component でないため bare 維持。data (expert 名等) は
// bare 正本、spawn 境界でのみ前置する (skills/_shared/expert-spawn.md「Plugin scoped-name 規約」)。
const BUILTIN_AGENTS = new Set(["general-purpose", "Explore", "Plan"]);
const scopedAgentType = (n) => (n && !BUILTIN_AGENTS.has(n) ? `op-skill:${n}` : n);
log(
  `op-scan-audit: mode=${input.mode} experts=${input.experts.length} scope=${input.scope} today=${input.today}`
);

// ---- audit stage: expert を read-only 並列 spawn (各 expert が {findings:[scan-finding]} を返す) ----
// filter(Boolean) しない: expert↔結果を index で zip するため (finding に detected_by が無く、null は空 batch 扱い)。
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

// 全 finding を flat 化 + provenance (detected_by) + finding_ref (verdict 突合キー) を付与。
const findings = flatWithProvenance(auditResults, input.experts);

// ---- refute stage: normal mode の High/Critical finding を同 domain 別インスタンス skeptic で反証 ----
// from-issue mode は人間 Issue の正規化のため refute skip (偽陽性除去は不適切)。Medium 以下は severity gate で落ちるため skip。
const refuteTargets =
  input.mode === "from-issue"
    ? []
    : findings.filter((f) => ["high", "critical"].includes(f.severity));

const verdicts = (
  await parallel(refuteTargets.map((f) => () => runRefute(f, input)))
).filter(Boolean);

// controller はこの戻り値で フェーズ1.5 (verdict 適用) → severity gate → dedup → enrichment → 起票 を行う。
return {
  mode: input.mode,
  scope: input.scope,
  today: input.today,
  findings,
  verdicts,
};

// ---- stage 関数 (phase() は body 冒頭で宣言済み。stage 内では呼ばない = parallel race 回避) ----
async function runRefute(finding, a) {
  return await agent(buildRefutePrompt(finding, a), {
    label: `refute ${finding.finding_ref}`,
    phase: "refute",
    schema: refuteVerdictSchema,
    agentType: scopedAgentType(finding.detected_by), // 同 domain の別インスタンス (D6)。skeptic 性は prompt で代替
    model: "opus", // 起票可否=不可逆 gate のため Opus 固定 (D5、enrichment 行と整合)
  });
}

// ---- helpers ----

// audit 結果 (raw、未 filter) を expert と index で zip し、各 finding に detected_by + finding_ref を付与。
// auditResults[i] が null (expert 失敗) の場合は空 batch 扱い (index ずれを起こさない)。
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

// ---- args 正規化 + 入力アサーション (Workflow input には schema 強制が無いため entry で fail-fast) ----
function normalizeArgs() {
  const a = typeof args === "string" ? JSON.parse(args) : args;
  if (!a) throw new Error("op-scan-audit: args missing");
  if (a.mode !== "normal" && a.mode !== "from-issue")
    throw new Error("op-scan-audit: args.mode must be 'normal' or 'from-issue'");
  if (!Array.isArray(a.experts) || a.experts.length === 0)
    throw new Error("op-scan-audit: args.experts must be a non-empty array");
  if (!a.scope) throw new Error("op-scan-audit: args.scope is required");
  if (!a.today)
    throw new Error("op-scan-audit: args.today (YYYY-MM-DD) required (agent 側 date 実行禁止 = F2 対策)");
  for (const e of a.experts) {
    if (!e.name || !e.model)
      throw new Error(`op-scan-audit: expert ${e.name || "?"} missing name/model`);
  }
  if (a.mode === "from-issue" && !a.from_issue_body)
    throw new Error("op-scan-audit: from-issue mode requires args.from_issue_body");
  return a;
}

// audit prompt: 現行 SKILL.md フェーズ1 spawn テンプレ (L317-379) を verbatim 移植。
// from-issue mode では controller 組立の extra_directives を末尾結合 (severity 緩和 / 元 Issue 本文埋め込み)。
function buildAuditPrompt(e, a) {
  const base = [
    "invocation_mode: op_managed",
    "",
    `あなたは ${e.name} です。${a.scope} を read-only で audit してください。`,
    "op-scan から呼ばれた OP-managed Mode 起動です。",
    "",
    "共通宣言 (invocation_mode / 質問禁止 / 必読 checklist / commits_added):",
    "`~/.claude/skills/_shared/spawn-prompt-common.md (>=1)` §1〜§4 を参照。",
    "本フェーズは scan (exploration-only) のため commits_added: [] が正解 (commit は行わない)。",
    "You must not ask interactive questions. Do not stop and wait for commander or user replies.",
    "",
    "【実行日 (op-scan が注入)】",
    `today: ${a.today}`,
    "architecture_debt 等の累積 metadata (`first_detected_at` / `last_seen_at`) には",
    "本値を使用すること。agent 側で `date` コマンド実行や推測をしない。",
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
    "canonical schema の `recommended_runner` (apply 担当の routing recommendation) と",
    "`post_check_expert` (post-check 担当の routing recommendation、不要なら null) を全検出に必ず含める。",
    "これらは routing recommendation であり apply/fix の spawn authorization ではない",
    "(op-run が `_shared/runtime-contract.md` の判定優先順位で実 spawn 先を再解決する)。",
    "",
    "refactor-expert の post_check_expert は **Phase 1 の硬い制限で 3 値のみ**:",
    '  "security-expert" / "ux-ui-audit-expert" / null',
    "両方必要に見えるなら Issue を分割する (1 Issue = 1 post-check)。",
    "review-expert は post-check expert に指定不可 (global review 専任)。",
    "",
    "【designer-expert の非 frontend scope での挙動】",
    "designer-expert は scope に UI surface (Vue / React / Svelte / Flutter Widget / pages /",
    "components / theme / token / style / scss / tailwind / vuetify / material theme 定義 等) が",
    "存在しない場合、即座に findings: [] を返す。Rust CLI / server / DB / queue / migration / proto",
    "のみのスコープでは何も検出しない。",
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
      "【追加指示 (severity フィルタ緩和等、op-scan controller 注入)】",
      a.extra_directives ||
        "(controller が extra_directives を注入。未注入は contract violation)"
    );
  }
  return base.join("\n");
}

// refute prompt: finding ごとの独立 skeptic。引用 file:line 再 Read 必須 + 実コード片 evidence_excerpt 必須。
// security domain は非対称 (D7): default=confirmed、refuted にするには security_unreachable_proof 必須。
function buildRefutePrompt(f, a) {
  const isSecurity = f.domain === "security";
  const lines = [
    "invocation_mode: op_managed",
    "",
    `あなたは ${f.detected_by} の **別インスタンス (skeptic mode)** です。`,
    "op-scan の起票前 refute (反証) フェーズから呼ばれた OP-managed Mode 起動です。",
    "コードを変更しない (Read / Grep / Glob のみ)。質問で停止しない。",
    "共通宣言: `~/.claude/skills/_shared/spawn-prompt-common.md (>=1)` §1〜§4。",
    "",
    "【対象 finding (audit が検出、起票候補)】",
    JSON.stringify(f),
    "",
    `【実行日】today: ${a.today} (agent 側で date 実行・推測しない)`,
    "",
    "【あなたの仕事】この finding が **実在し起票に値するか** を反証で精査する。",
    "1. finding.files の引用 file:line を **必ず再 Read する** (該当行 ±20 行、または該当シンボル全体)。",
    "   reread_performed: true は実際に再 Read した場合のみ。再 Read せずに verdict を出すのは contract violation。",
    "2. reason には再 Read した **実コード片を evidence_excerpt に生のまま引用** し、それが finding の主張",
    "   (到達経路 / 観測可能な被害) を支持するか (supports_claim) を実コードで論証する。自然文要約のみは不可。",
    "3. evidence_location に再 Read した範囲を 'file:line-line' で記す (controller が literal 照合する)。",
    "",
    "【判定軸 (verdict)】",
    "- 偽陽性 (引用 file:line に主張の事象が存在しない / コードは読めたが主張の因果が成立しない) → verdict: refuted",
    "- severity 過大 (severity-rubric.md の到達経路→被害 test に照らし Critical/High より低い) → verdict: downgrade + confirmed_severity",
    "- evidence_grade が direct 以外 (requires_runtime / inferred) で Critical 申告、または inferred で起票不適格 → verdict: downgrade or refuted",
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
      "★【security 非対称ルール (D7、重要)】",
      "この finding は domain=security のため **default を confirmed に倒す**。",
      "security の Critical/High を refuted にするには、`security_unreachable_proof` に",
      "**到達不可であることの積極的証拠** (source→sink が到達しない / trust boundary で遮断される /",
      "required_user_action が成立しない 等を実コードで示す) を必ず記す。",
      "到達不可の積極的証拠を示せない場合は refuted にせず confirmed のままにする",
      "(security の取りこぼし = false negative は実害が大きいため、不確実なら confirmed)。"
    );
  } else {
    lines.push(
      "",
      "【skeptic default (非 security)】",
      "confirmed にするには上記の積極的証拠が必要。不確実 / 証拠不十分なら **refuted に倒す** (default refuted)。"
    );
  }
  lines.push(
    "",
    "判断不能なら needs_human_decision を返す。refuteVerdictSchema で返却する。JSON 以外のテキストを付けない。"
  );
  return lines.join("\n");
}
