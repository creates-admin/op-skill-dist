/**
 * 機能概要:
 *   op-spec-patrol の canonical spec **domain drift 専任** audit + 起票前 refute の Dynamic Workflow
 *   (ADR-0017 W3)。op-patrol-audit.js を構造の手本にする。
 *   - audit  stage: controller が `op spec-patrol score` で選んだ feature (区画) ごとに spec-expert を
 *                   並列 spawn し、正本 ⟷ code を 3 者照合させて **domain drift** finding
 *                   (diff_type=spec_stale / code_deviation、必要なら cross-feature 矛盾) を集約して返す
 *                   (read-only / exploration-only)。各 feature に 1 spec-expert (op-patrol の region×expert
 *                   fan-out とは違い、spec drift は feature 単位の 3 者照合なので expert 軸を持たない)。
 *   - refute stage: severity High/Critical の domain finding を **同 spec-expert の別インスタンス skeptic**
 *                   で反証する。**spec drift は捏造リスクが本質** (ADR-0017 決定12: 捏造禁止) なので
 *                   **default = refuted** (op-scan/op-patrol の security 非対称とは逆。証拠で確証できた時のみ confirmed)。
 *
 * 作成意図:
 *   機械 drift (broken-link / paths-overlap / cite / index) は `op spec-patrol {check-links,list-specs,
 *   cite-downgrade,rebuild-index}` が決定論的に検出するので **workflow には入れない**。本 workflow は
 *   LLM 判断が要る domain drift (正本の決定/不変則が code 実態と食い違う、issue 前提が事実と不一致) 専任。
 *   op-scan/op-patrol で確立した起票前 refute を default-on で同梱するが、trust 方向が逆 (default refuted)。
 *
 * 注意点:
 *   - audit / refute とも exploration-only。コードや正本を編集・commit・push しない (commits_added を出さない)。
 *   - feature 選定 (spec-patrol score) / severity gate / dedup / 起票 (op-spec worklist へ queue) /
 *     Spec Patrol Ledger 更新 は **controller (SKILL.md) 保持** (本 workflow は spawn と集約のみ、不変則 7/8)。
 *   - 機械 drift は CLI 担当ゆえ audit prompt で明示的に「対象外」と宣言する (二重検出 / silent fork 防止)。
 *   - 動的値 (features / spec_path / code_scope / today / run_id) は全て args 注入 (F2 対策)。
 *   - **args は Workflow tool から JSON 文字列で到着する** (op-patrol-audit 実測)。normalizeArgs() で parse する。
 *   - refute trust model: REFUTE_SCHEMA (evidence_excerpt minLength:1 / reread_performed 必須) +
 *     controller-side 照合 (drop 方向)。決定論照合が無いため近似 gate (限界は SKILL.md / 完了報告に明示)。
 *     feature isolation は finding_ref (`<feature>#<idx>`) で保持。
 *   - REAL_API 準拠: export const meta (pure literal 第一文) / phase() は body 冒頭のみ (stage callback 内で呼ばない) /
 *     非決定 API (現在時刻取得・乱数生成・引数なしの日付生成) 不使用 (today は args 注入)。
 */

export const meta = {
  name: "op-spec-patrol-audit",
  description:
    "canonical spec (.claude/rules/) の domain drift を spec-expert で監査 + 起票前 refute する Dynamic Workflow (ADR-0017 W3)。feature ごとに spec-expert を並列 spawn し正本⟷code を 3 者照合 (spec_stale / code_deviation / premise_mismatch) → High/Critical を同 spec-expert 別インスタンス skeptic で反証 (default=refuted、捏造リスクが本質ゆえ)。機械 drift (broken-link / paths-overlap / cite / index) は CLI (op spec-patrol) 側で決定論検出するため対象外。feature 選定 / severity gate / dedup / 起票 (op-spec worklist) / Ledger 更新 は controller 保持。refute は enrichment cross-review とは別レイヤー",
  phases: [{ title: "audit" }, { title: "refute" }],
};

// audit finding schema。spec-expert の diff_summary (expert-spec/SKILL.md §4) を domain drift finding 用に
// findings 配列へ正規化した object で受ける (StructuredOutput は object 返却が安全)。
// 機械 drift (broken-link/paths-overlap/cite/index) は含めない (CLI 担当)。diff_type は 3 値のみ。
const SPEC_DRIFT_SCHEMA = {
  type: "object",
  required: ["findings"],
  properties: {
    // 正本そのものの状態 (spec-expert の spec_state)。集約時の参考情報。
    spec_state: { type: "string", enum: ["exists", "stale", "missing"] },
    findings: {
      type: "array",
      items: {
        type: "object",
        required: ["feature", "diff_type", "severity", "spec_says", "code_reality", "source", "evidence_grade"],
        properties: {
          feature: { type: "string" },
          // domain drift の 3 型のみ (機械 drift は CLI 担当ゆえ enum に含めない)。
          diff_type: { type: "string", enum: ["spec_stale", "code_deviation", "premise_mismatch"] },
          severity: { type: "string", enum: ["critical", "high", "medium", "low", "n/a"] },
          severity_reason: { type: "string" },
          // 正本が言っていること / code の実態 (spec-expert diff_summary)。
          spec_says: { type: "string" },
          code_reality: { type: "string" },
          // file::symbol で示す (行番号でなく、ADR-0017 _schema.md)。
          source: { type: "string" },
          evidence: { type: "string" },
          evidence_grade: { type: "string", enum: ["direct", "inferred", "requires_runtime"] },
          // どちらに寄せるかの方向ヒント (spec を直す / code を直す / 人間判断)。controller が起票時に使う。
          suggested_direction: { type: "string" },
          // cross-feature 矛盾 (照合中に気づいた他 feature への依存・矛盾、任意)。
          cross_feature: { type: ["string", "null"] },
        },
      },
    },
    // 判断不能を spec-expert が返した場合 (任意)。controller が human へ回す。
    needs_human_decision: { type: "object" },
  },
};

// refute verdict schema。finding 単位の skeptic 判定。evidence_excerpt は minLength:1 で空証拠を構造 block。
// finding_ref で controller が verdict↔finding を keying する。op-patrol-audit.js の refuteVerdictSchema を
// spec drift 用に調整 (security 非対称 field は持たない = spec drift は逆方向 default refuted)。
const REFUTE_SCHEMA = {
  type: "object",
  required: ["finding_ref", "verdict", "refuted", "reason", "evidence_excerpt", "reread_performed"],
  properties: {
    finding_ref: { type: "string" },
    verdict: { type: "string", enum: ["confirmed", "refuted", "downgrade"] },
    refuted: { type: "boolean" },
    // verdict=downgrade で必須 (audit より低い severity)。confirmed/refuted では省略可。
    confirmed_severity: { type: "string", enum: ["critical", "high", "medium", "low", "n/a"] },
    reason: { type: "string" },
    // 再 Read した実コード片 / 正本該当節 (生のまま)。空不可。
    evidence_excerpt: { type: "string", minLength: 1 },
    // 'file:line-line' または '<spec_path>:<section>' (controller が literal 照合する anchor)。
    evidence_location: { type: "string" },
    reread_performed: { type: "boolean" },
    // confirmed のために必要: 「正本と code が実際に食い違う」ことを実証する積極的証拠が示せたか。
    drift_confirmed_by_evidence: { type: "boolean" },
    needs_human_decision: { type: "object" },
  },
};

// args は Workflow tool から JSON 文字列で到着する → parse + 入力検証。
const input = normalizeArgs();

phase("audit");

// --- plugin scoped-name: Workflow agent() の agentType は plugin 登録名 (op-skill:<name>) で解決する ---
// built-in (general-purpose/Explore/Plan) は plugin component でないため bare 維持。data (expert 名等) は
// bare 正本、spawn 境界でのみ前置する (skills/_shared/expert-spawn.md「Plugin scoped-name 規約」)。
const BUILTIN_AGENTS = new Set(["general-purpose", "Explore", "Plan"]);
const scopedAgentType = (n) => (n && !BUILTIN_AGENTS.has(n) ? `op-skill:${n}` : n);
log(
  `op-spec-patrol-audit: features=${input.features.length} run_id=${input.run_id} today=${input.today}`
);

// ---- audit stage: feature ごとに spec-expert を read-only 並列 spawn ----
// 各 spawn は {spec_state, findings:[spec-drift]} を返す。filter(Boolean) しない (index zip のため)。
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

// features ↔ auditResults を index で zip し、feature 単位に集約 + provenance / finding_ref 付与。
const features = regroupByFeature(input.features, auditResults);

// ---- refute stage: 全 feature の High/Critical domain finding を同 spec-expert 別インスタンス skeptic で反証 ----
// Medium 以下は severity gate で落ちるため skip。spec patrol は反復巡回のため取りこぼしは次回再検出。
const refuteTargets = [];
features.forEach((ft) => {
  ft.findings.forEach((f) => {
    if (["high", "critical"].includes(f.severity)) refuteTargets.push(f);
  });
});

const verdicts = (
  await parallel(refuteTargets.map((f) => () => runRefute(f, input)))
).filter(Boolean);

// controller はこの戻り値で verdict 適用 → severity gate → dedup → 起票 (worklist queue) → Ledger 更新 を行う。
return attachVerdicts(input, features, verdicts);

// ---- stage 関数 (phase() は body 冒頭で宣言済み。stage 内では呼ばない = parallel race 回避) ----
async function runRefute(finding, a) {
  return await agent(buildRefutePrompt(finding, a), {
    label: `refute ${finding.finding_ref}`,
    phase: "refute",
    schema: REFUTE_SCHEMA,
    agentType: scopedAgentType("spec-expert"), // 同 worker の別インスタンス。skeptic 性は prompt で代替
    model: "opus", // 起票可否=不可逆 gate のため Opus 固定 (op-patrol-audit と整合)
  });
}

// ---- helpers ----

// audit 結果 (raw、未 filter) を features と index で zip し、feature 単位に集約。
// 各 finding に detected_by(=spec-expert) + feature + finding_ref (`<feature>#<idx>`) を付与する。
// auditResults[i] が null (spawn 失敗) の場合は空 batch 扱い (index ずれを起こさない、op-patrol-audit と同方式)。
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

// verdict を finding_ref で feature に再配分 + feature ごとの audit_report 統計を生成。
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

// ---- args 正規化 + 入力アサーション (Workflow input には schema 強制が無いため entry で fail-fast) ----
function normalizeArgs() {
  const a = typeof args === "string" ? JSON.parse(args) : args;
  if (!a) throw new Error("op-spec-patrol-audit: args missing");
  if (!Array.isArray(a.features) || a.features.length === 0)
    throw new Error("op-spec-patrol-audit: args.features must be a non-empty array");
  if (!a.today)
    throw new Error("op-spec-patrol-audit: args.today (YYYY-MM-DD) required (agent 側 date 実行禁止 = F2 対策)");
  if (!a.run_id) throw new Error("op-spec-patrol-audit: args.run_id is required");
  for (const f of a.features) {
    if (!f.feature || !f.spec_path)
      throw new Error(`op-spec-patrol-audit: feature ${f.feature || "?"} missing feature/spec_path`);
  }
  return a;
}

// audit prompt: spec-expert を domain drift 監査用に起動する。機械 drift は CLI 担当ゆえ対象外と明示。
// spec-expert は read-only で 正本 ⟷ code を 3 者照合し diff_summary を返す (expert-spec/SKILL.md §4)。
function buildAuditPrompt(f, a) {
  return [
    "invocation_mode: op_managed",
    "",
    "あなたは spec-expert です。canonical spec (正本) の **domain drift** を read-only で監査してください。",
    "op-spec-patrol から呼ばれた OP-managed Mode 起動です。質問で停止しない。",
    "共通宣言 (invocation_mode / 質問禁止 / 必読 checklist / commits_added):",
    "`~/.claude/skills/_shared/spawn-prompt-common.md (>=1)` §1〜§4 を参照。",
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
    "行番号でなく **ファイル + シンボル名 / 節** で示す (行番号は変わりうる、ADR-0017 _schema.md)。",
    "",
    "【対象外 (重要、二重検出防止)】",
    "以下の **機械 drift は CLI (op spec-patrol) が決定論的に検出するので報告しない**:",
    "- broken-link (`[[feature/section]]` の dead feature / dead section)",
    "- paths-overlap (正本間 paths の disjoint 違反)",
    "- cite (出典欠落 [human] の降格)",
    "- index (constitution Part 2 索引表の stale / 新規 feature)",
    "あなたは **LLM 判断が要る domain の意味的乖離だけ** を見る (機械照合できるものは CLI に委ねる)。",
    "",
    "【方針】",
    "- 正本も code も変更しない (Read / Grep / Glob のみ)。正本 write は controller (op-spec) のみが human align 後に行う。",
    "- Critical / High のみ報告。Medium 以下は完全に無視 (op-patrol と同じ severity gate)。",
    "- 判定基準は ~/.claude/skills/_shared/severity-rubric.md。",
    "- 「可能性がある」「〜かもしれない」は禁止。spec_says ⟷ code_reality を実コード/実正本で示せる時のみ報告。",
    "- `[code]` を主張する前に必ず該当ソースを Read 確認する (捏造禁止、ADR-0017 決定12)。確認できなければ報告しない。",
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

// refute prompt: finding ごとの独立 skeptic。引用 source 再 Read 必須 + 実コード片/正本片 evidence_excerpt 必須。
// **spec drift は捏造リスクが本質 (ADR-0017 決定12) なので default = refuted** (security 非対称とは逆)。
function buildRefutePrompt(f, a) {
  return [
    "invocation_mode: op_managed",
    "",
    "あなたは spec-expert の **別インスタンス (skeptic mode)** です。",
    "op-spec-patrol の起票前 refute (反証) フェーズから呼ばれた OP-managed Mode 起動です。",
    "正本も code も変更しない (Read / Grep / Glob のみ)。質問で停止しない。",
    "共通宣言: `~/.claude/skills/_shared/spawn-prompt-common.md (>=1)` §1〜§4。",
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
    "★【skeptic default (spec drift は捏造リスクが本質、ADR-0017 決定12)】",
    "**default = refuted**。confirmed にするには、正本と code が実際に食い違うことを示す",
    "**積極的証拠 (drift_confirmed_by_evidence: true + evidence_excerpt の実引用)** が必要。",
    "証拠不十分 / 自然文だけ / 再 Read で乖離を実証できない場合は **refuted に倒す**。",
    "(spec drift の偽陽性は『正本を誤って書き換える』本末転倒を招くため、不確実なら confirmed にしない。",
    " これは op-scan/op-patrol の security 非対称 (default confirmed) とは **逆方向** であることに注意。)",
    "",
    "判定基準: ~/.claude/skills/_shared/severity-rubric.md。",
    "CLAUDE.md 規約に準拠したコードを「正本違反」として批判しない (規約準拠は refuted 方向)。",
    "機械 drift (broken-link / paths-overlap / cite / index) はそもそも本 refute の対象外 (CLI 担当) ゆえ refuted。",
    "",
    `finding_ref には "${f.finding_ref}" を転写する。`,
    "判断不能なら needs_human_decision を返す。REFUTE_SCHEMA で返却する。JSON 以外のテキストを付けない。",
  ].join("\n");
}
