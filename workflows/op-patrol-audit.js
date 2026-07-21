/**
 * 機能概要:
 *   op-patrol 区画別観点別 audit + 起票前 refute の Dynamic Workflow (ADR-0009 Phase C / C3)。
 *   - audit  stage: controller が patrol_score / area 選定で確定した region (区画) ごとに、
 *                   area の性質に応じた expert を region.audit_model で並列 spawn し、
 *                   canonical scan-finding (expert-spawn.md) を region 単位に集約して返す (read-only / exploration-only)。
 *                   並列は flat (region, expert) pair で行い、index zip で region_id / detected_by / finding_ref を付与する。
 *   - refute stage: High/Critical finding ごとに **同 domain の別インスタンス skeptic** を spawn し、
 *                   引用 file:line を再 Read して偽陽性 / severity 過大 / 起票不適格を反証する。
 *                   verdict (confirmed/refuted/downgrade) を controller へ返し、controller が
 *                   フェーズ4.5 で verdict 適用 → severity gate → dedup → enrichment → 起票 → Ledger 更新 を行う。
 *
 * 作成意図:
 *   現行 SKILL.md フェーズ4 の single-message Agent 並列 spawn (run_in_background) + Monitor 30分待ちを
 *   Workflow へ移行 (context 節約 / Monitor timeout 機構の撤廃)。同時に C2 (op-scan) で確立した
 *   起票前 adversarial-verify (refute) stage を default-on で同梱し、偽陽性を Patrol Finding Policy /
 *   severity gate / dedup / enrichment (最大 8 spawn/Issue) の前で潰す。
 *   refute は enrichment の cross-review (§6) とは別レイヤー (refute = 個別 code finding の偽陽性除去 /
 *   cross-review = issue_draft 全体の品質 review、C4 の領分)。本 workflow は cross-review を持たない。
 *
 * 注意点:
 *   - audit / refute とも exploration-only。コードを編集・commit・push しない (commits_added を出さない)。
 *   - region 選定 (Patrol Ledger ロード / patrol_score / area 選定) / severity gate / dedup / bulk-group /
 *     enrichment 呼び出し / 直列 issue create / Patrol Ledger 更新 は **controller 保持** (本 workflow は spawn と集約のみ、不変則 7/8)。
 *   - 動的値 (regions / expert / model / today / run_id) は全て args 注入 (F2 対策)。
 *   - **args は Workflow tool から JSON 文字列で到着する (C1/C2 段階1.5 実測)**。normalizeArgs() で parse する。
 *   - refute の trust model: refuteVerdictSchema (evidence_excerpt minLength:1 / reread_performed 必須) +
 *     controller-side literal 照合 (drop 方向) + verdict↔severity 整合。決定論照合が無いため近似 gate であり
 *     証明ではない (限界は SKILL.md / 完了報告に明示)。region isolation は finding_ref (`<region_id>:<expert>#<idx>`) で保持。
 *   - **security 非対称ルール (D7)**: security の Critical/High を refuted にするには到達不可の積極的証拠
 *     (security_unreachable_proof) を必須化し、default を confirmed に倒す (false-negative 防止)。他 domain は対称 skeptic。
 *   - REAL_API 準拠: export const meta (pure literal 第一文) / phase() は body 冒頭のみ (stage callback 内で呼ばない) /
 *     非決定 API (現在時刻取得・乱数生成・引数なしの日付生成) 不使用 (today は args 注入)。
 */

export const meta = {
  name: "op-patrol-audit",
  description:
    "op-patrol 区画別観点別 audit (region ごとに area→expert を region.audit_model で並列 spawn → canonical scan-finding を region 単位に集約) + 起票前 refute (High/Critical を同 domain 別インスタンス skeptic で偽陽性反証)。region 選定 / severity gate / dedup / bulk-group / enrichment / 直列 issue create / Patrol Ledger 更新 は controller 保持。refute は enrichment cross-review とは別レイヤー",
  phases: [{ title: "audit" }, { title: "refute" }],
};

// audit finding schema。canonical scan-finding (expert-spawn.md) を findings 配列に入れた object で受ける
// (StructuredOutput は object 返却が安全)。item.required は cross-domain 共通の最小 5 field のみ hard 強制し
// (D4: false negative を避けるため null-drop を最小化)、domain extension (refactor / security 等) は additive。
// controller が転写時に domain ごとの完全性を reject する (op-scan と同一 schema、Single Canonical Source)。
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
// finding_ref で controller が verdict↔finding を keying する (op-fingerprint は controller フェーズ5 で採番)。
// op-scan-audit.js と同一 (Single Canonical Source、流用)。
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

// args は Workflow tool から JSON 文字列で到着する (C1/C2 段階1.5 実測) → parse + 入力検証。
const input = normalizeArgs();

phase("audit");

// --- plugin scoped-name: Workflow agent() の agentType は plugin 登録名 (op-skill:<name>) で解決する ---
// built-in (general-purpose/Explore/Plan) は plugin component でないため bare 維持。data (expert 名等) は
// bare 正本、spawn 境界でのみ前置する (skills/_shared/expert-spawn.md「Plugin scoped-name 規約」)。
const BUILTIN_AGENTS = new Set(["general-purpose", "Explore", "Plan"]);
const scopedAgentType = (n) => (n && !BUILTIN_AGENTS.has(n) ? `op-skill:${n}` : n);
log(
  `op-patrol-audit: regions=${input.regions.length} run_id=${input.run_id} today=${input.today}`
);

// ---- audit stage: region × expert を flat に read-only 並列 spawn ----
// flat (region, expert) pair。各 spawn は {findings:[scan-finding]} を返す。
// filter(Boolean) しない: tasks と結果を index で zip するため (finding に provenance が無く、null は空 batch 扱い)。
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

// tasks ↔ auditResults を index で zip し、region 単位に集約 + provenance / finding_ref 付与。
const regions = regroupByRegion(input.regions, tasks, auditResults);

// ---- refute stage: 全 region の High/Critical finding を同 domain 別インスタンス skeptic で反証 ----
// Medium 以下は severity gate で落ちるため skip。op-patrol は反復巡回のため取りこぼしは次回再検出。
const refuteTargets = [];
regions.forEach((rg) => {
  rg.findings.forEach((f) => {
    if (["high", "critical"].includes(f.severity)) refuteTargets.push(f);
  });
});

const verdicts = (
  await parallel(refuteTargets.map((f) => () => runRefute(f, input)))
).filter(Boolean);

// controller はこの戻り値で フェーズ4.5 (verdict 適用) → severity gate → dedup → enrichment → 起票 → Ledger 更新 を行う。
return attachVerdicts(input, regions, verdicts);

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

// audit 結果 (raw、未 filter) を tasks (region, expert) と index で zip し、region 単位に集約。
// 各 finding に detected_by + region_id + finding_ref (`<region_id>:<expert>#<idx>`) を付与する。
// auditResults[ti] が null (expert 失敗) の場合は空 batch 扱い (index ずれを起こさない、C2 と同方式)。
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

// verdict を finding_ref で region に再配分 + region ごとの audit_report 統計を生成。
// audit_report は完了報告での可視化用 (本 PR では Patrol Ledger には永続化しない、scope 外)。
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

// ---- args 正規化 + 入力アサーション (Workflow input には schema 強制が無いため entry で fail-fast) ----
function normalizeArgs() {
  const a = typeof args === "string" ? JSON.parse(args) : args;
  if (!a) throw new Error("op-patrol-audit: args missing");
  if (!Array.isArray(a.regions) || a.regions.length === 0)
    throw new Error("op-patrol-audit: args.regions must be a non-empty array");
  if (!a.today)
    throw new Error("op-patrol-audit: args.today (YYYY-MM-DD) required (agent 側 date 実行禁止 = F2 対策)");
  if (!a.run_id) throw new Error("op-patrol-audit: args.run_id is required");
  for (const r of a.regions) {
    if (!r.id || !r.area)
      throw new Error(`op-patrol-audit: region ${r.id || "?"} missing id/area`);
    if (!Array.isArray(r.expert_list) || r.expert_list.length === 0)
      throw new Error(`op-patrol-audit: region ${r.id} expert_list must be a non-empty array`);
    for (const e of r.expert_list) {
      if (!e.name || !e.model)
        throw new Error(`op-patrol-audit: region ${r.id} expert ${e.name || "?"} missing name/model`);
    }
  }
  return a;
}

// audit prompt: 現行 SKILL.md フェーズ4 spawn テンプレ (L663-738) を verbatim 移植。
// scope→area、巡回コンテキスト (前回巡回 / 巡回理由 / run_id) を注入。Patrol Finding Policy は
// workflow spawn された agent が SKILL.md を見られないため本 prompt に inline で埋め込む。
function buildAuditPrompt(e, region, a) {
  return [
    "invocation_mode: op_managed",
    "",
    `あなたは ${e.name} です。${region.area} を read-only で巡回監査してください。`,
    "op-patrol から呼ばれた OP-managed Mode 起動です。",
    "あなたはこのコードを書いていません。警備員として外部視点で監査します。",
    "",
    "共通宣言 (invocation_mode / 質問禁止 / 必読 checklist / commits_added):",
    "`~/.claude/skills/_shared/spawn-prompt-common.md (>=1)` §1〜§4 を参照。",
    "本フェーズは patrol (exploration-only) のため commits_added: [] が正解 (commit は行わない)。",
    "You must not ask interactive questions. Do not stop and wait for commander or user replies.",
    "",
    "【実行日 (op-patrol が注入)】",
    `today: ${a.today}`,
    "architecture_debt finding 等の `first_detected_at` / `last_seen_at` には本値を使用すること",
    "(agent 側で日付推測 / `date` 実行をしない)。既存 Issue 突合による累積値の上書きは op-patrol の",
    "責務であり、agent は本日の暫定値のみ返す。",
    "",
    "【巡回コンテキスト】",
    `- 区画: ${region.area}`,
    `- 前回巡回: ${region.last_scanned_at || "初回"}`,
    `- 巡回理由: ${region.selection_reason || "(patrol_score 上位)"}`,
    `- run_id: ${a.run_id}`,
    "",
    "【方針】",
    "- コードを変更しない (Read / Grep / Glob のみ)",
    "- **Patrol Finding Policy を厳守** (後述、op-scan より厳しい)",
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
    "canonical schema の `recommended_runner` (apply 担当) と `post_check_expert` (post-check 担当、",
    "不要なら null) を全検出に必ず含める。op-patrol はこれを Issue 本文の hidden marker",
    "`<!-- op-run-expert: ... -->` / `<!-- op-post-check-expert: ... -->` に転写する。",
    "これらは routing recommendation であり apply/fix の spawn authorization ではない",
    "(op-run が `_shared/runtime-contract.md` の判定優先順位で実 spawn 先を再解決する)。",
    "",
    "domain → 標準値:",
    "- debug / optimize / test: recommended_runner = 自分自身、post_check_expert = null",
    "- refactor: recommended_runner = \"refactor-expert\"、post_check_expert は Phase 1 の硬い制限で 3 値のみ",
    "    (\"security-expert\" : file IO / path / shell / external input / permission / secret / updater 系、",
    "     \"ux-ui-audit-expert\" : UI state / 操作導線 / 復帰可能性 / a11y / 視覚的 component 系、null : 上記外)。",
    "    両方必要に見える場合は Issue を分割する (1 Issue = 1 post-check)。",
    "    compatibility / release / test / designer は post_check_expert に書かない。review-expert も指定不可 (global review 専任)。",
    "- security: recommended_runner = \"security-expert\" (op-run の判定で debug-expert に回ることもある)、",
    "    post_check_expert = \"security-expert\"。canonical schema 拡張 (security / threat_model / usable_security / post_check) を必須出力とする。",
    "- feature: recommended_runner = \"feature-expert\"、UI 影響あれば post_check_expert = \"ux-ui-audit-expert\"",
    "- ux-ui (ux-ui-audit-expert): recommended_runner = \"designer-expert\"、post_check_expert = \"ux-ui-audit-expert\"",
    "- design (designer-expert): recommended_runner = \"designer-expert\"、UI files を触るなら post_check_expert = \"ux-ui-audit-expert\"",
    "",
    "【designer-expert の非 frontend area での挙動】",
    "designer-expert は area に UI surface (Vue / React / Svelte / Flutter Widget / pages /",
    "components / theme / token / style / scss / tailwind / vuetify / material theme 定義 等) が",
    "存在しない場合、即座に {\"findings\": []} を返す (area→expert マッピングで誤って呼ばれた場合の安全弁)。",
    "",
    "【完了条件】",
    "area 内のコードを Read / Grep で巡回し、Patrol Finding Policy に該当する指摘を全て返す。",
    "検出が 0 件の場合は {\"findings\": []} を返す。JSON 以外のテキストは付けない。",
  ].join("\n");
}

// refute prompt: finding ごとの独立 skeptic。引用 file:line 再 Read 必須 + 実コード片 evidence_excerpt 必須。
// security domain は非対称 (D7): default=confirmed、refuted にするには security_unreachable_proof 必須。
// op-scan-audit.js と同一ロジック (流用、op-patrol 文言に調整)。
function buildRefutePrompt(f, a) {
  const isSecurity = f.domain === "security";
  const lines = [
    "invocation_mode: op_managed",
    "",
    `あなたは ${f.detected_by} の **別インスタンス (skeptic mode)** です。`,
    "op-patrol の起票前 refute (反証) フェーズから呼ばれた OP-managed Mode 起動です。",
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
    "op-patrol の Patrol Finding Policy (好み / 将来不安だけ / 未読推測 / 根拠の薄い security は起票不適格) も refuted 方向の判断材料とする。",
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
