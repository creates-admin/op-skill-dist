/**
 * 機能概要:
 *   op-run 探知 (discover) フェーズの Dynamic Workflow (ADR-0009 Phase C / C1)。
 *   controller が cluster ごとに事前 provision した base_sha worktree で investigation reader を
 *   並列 spawn し、files_likely_to_modify / risk_files / needs_serialization を含む investigation
 *   report を controller へ返す。**controller はこの戻り値で Stage2 競合検出・density 再計算・
 *   serialization partition を行う (= barrier はここ、apply pipeline には埋めない)**。
 *
 * 作成意図:
 *   現行 SKILL.md 2-A-2 の single-message Agent 並列 spawn + Monitor 待ちを Workflow へ移行。
 *   explore を apply pipeline に内蔵すると Stage2 barrier が消え clustering.md L36/L487 が必須化する
 *   二段階競合検出が成立しないため、discover を独立 workflow に分離して controller-visible barrier を残す。
 *
 * 注意点:
 *   - exploration-only。reader は編集・commit・push しない (commits_added を出さない)。
 *   - worktree は controller が事前確定 (案B′)。reader は input 注入の worktree_path に cd して Read のみ。
 *   - **args は Workflow tool から JSON 文字列で到着する (段階1.5 実測)**。normalizeArgs() で parse する。
 *     動的値 (base_sha / worktree_path / cluster) は全て args 注入 (F2 対策、agent の改変余地を消す)。
 *   - REAL_API 準拠: export const meta (pure literal) / top-level agent・parallel / 非決定 API 不使用。
 */

export const meta = {
  name: "op-run-discover",
  description:
    "op-run 探知フェーズ: cluster ごとに事前 provision 済 base_sha worktree で investigation reader を並列 spawn し、files_likely_to_modify を含む investigation report を controller へ返す。controller はこの集約結果で Stage2 競合検出・density 再計算・serialization partition を行う (barrier はここ)",
  phases: [{ title: "discover" }],
};

// investigation report schema — 現行 SKILL.md 2-A-2 の report JSON 契約に整合。
// files_likely_to_modify / risk_files / needs_serialization が controller の Stage2 partition の入力。
const investigationSchema = {
  type: "object",
  required: ["cluster_id", "files_likely_to_modify", "worktree_path", "needs_serialization"],
  properties: {
    issue: { type: "number" },
    cluster_id: { type: "string" },
    suspected_root_cause: { type: "string" },
    files_read: { type: "array", items: { type: "string" } },
    files_likely_to_modify: { type: "array", items: { type: "string" } },
    risk_files: { type: "array", items: { type: "string" } },
    needs_serialization: { type: "boolean" },
    reason: { type: "string" },
    worktree_path: { type: "string" },
  },
};

// args は Workflow tool から JSON 文字列で到着する (段階1.5 実測) → parse + 入力検証。
const input = normalizeArgs();

phase("discover");

// --- plugin scoped-name: Workflow agent() の agentType は plugin 登録名 (op-skill:<name>) で解決する ---
// built-in (general-purpose/Explore/Plan) は plugin component でないため bare 維持。data (expert 名等) は
// bare 正本、spawn 境界でのみ前置する (skills/_shared/expert-spawn.md「Plugin scoped-name 規約」)。
const BUILTIN_AGENTS = new Set(["general-purpose", "Explore", "Plan"]);
const scopedAgentType = (n) => (n && !BUILTIN_AGENTS.has(n) ? `op-skill:${n}` : n);
log(`op-run-discover: ${input.clusters.length} clusters (base ${input.base_sha} @ ${input.base_ref})`);

// 全 cluster を 1 turn 内で並列発火 (controller 人為 cap は撤廃、runtime の min(16,cores-2) が透過キューイング)。
const reports = (
  await parallel(
    input.clusters.map((cluster) => () =>
      agent(buildDiscoverPrompt(cluster, input), {
        label: `discover ${cluster.id}`,
        phase: "discover",
        schema: investigationSchema,
        agentType: scopedAgentType(cluster.expert),
        model: cluster.model,
      })
    )
  )
).filter(Boolean);

// controller はこの戻り値で Stage2 競合検出 → partition (parallel_clusters / serial_chains) を確定する。
return { base_sha: input.base_sha, base_ref: input.base_ref, ts: input.ts, reports };

// ---- args 正規化 + 入力アサーション (Workflow input には schema 強制が無いため entry で fail-fast) ----
function normalizeArgs() {
  const a = typeof args === "string" ? JSON.parse(args) : args;
  if (!a || !Array.isArray(a.clusters) || a.clusters.length === 0)
    throw new Error("op-run-discover: args.clusters must be a non-empty array");
  if (!a.base_sha || !a.base_ref)
    throw new Error("op-run-discover: args.base_sha and args.base_ref are required");
  for (const c of a.clusters) {
    if (!c.id || !c.expert || !Array.isArray(c.issues) || c.issues.length === 0)
      throw new Error("op-run-discover: each cluster needs id, expert, non-empty issues");
    if (!c.worktree_path)
      throw new Error(`op-run-discover: cluster ${c.id} missing pre-provisioned worktree_path`);
  }
  return a;
}

// 探知 reader への prompt。現行 SKILL.md 2-A-2 の investigation 指示を踏襲しつつ、
// worktree は controller provision 済 (cd するだけ) に変更。
function buildDiscoverPrompt(cluster, a) {
  const issuesLine = cluster.issues.map((n) => "#" + n).join(", ");
  return [
    "invocation_mode: op_managed",
    `あなたは ${cluster.expert}。op-run の investigation (探知) フェーズから呼ばれた OP-managed Mode 起動です。`,
    "以下のクラスタの **探知のみ** を実行してください。この段階では **コードを編集・コミット・push しない**。",
    "",
    "共通宣言 (invocation_mode / 質問禁止 / 必読 checklist / commits_added):",
    "`~/.claude/skills/_shared/spawn-prompt-common.md (>=1)` §1〜§4 を参照。",
    "本フェーズは investigation (exploration-only) のため commits_added は出さない (commit は行わない)。",
    "",
    "You must not ask interactive questions. Do not stop and wait for commander or user replies.",
    "If information is missing, return assumptions[] / needs_human_decision / blocked_actions[].",
    "Return the required investigation report (investigationSchema) only.",
    "",
    "【クラスタ概要】",
    `- クラスタ ID: ${cluster.id}`,
    `- 対象モジュール: ${cluster.module}`,
    `- Issue: ${issuesLine}`,
    `- 事前ファイル候補 (Issue 宣言): ${(cluster.files_declared || []).join(", ")}`,
    "共通の根本原因が潜んでいる可能性があります。全体把握 → 共通対策 → 個別の順で見立ててください。",
    "",
    "【作業環境 (controller provision 済・変更不可)】",
    `- 作業ディレクトリ: ${cluster.worktree_path} (この段階では編集しない、Read のみ)`,
    `- base ref: ${a.base_ref} / 起点 commit: ${a.base_sha}`,
    "",
    "【手順】",
    `1. cd ${cluster.worktree_path}`,
    "2. 各 Issue を `op issue view <N> --plain` で取得、本文の指示書節を把握",
    "3. 関連コードを Read して根本原因を仮説立て",
    "4. 修正対象になりそうなファイルを列挙 (依存マニフェスト・lockfile・shared component・DTO・schema も含める",
    "   = Stage2 競合検出の素材。Issue 本文に書かれていないファイルも含める)",
    "5. investigationSchema で返却する:",
    `   - cluster_id は "${cluster.id}" を転写`,
    "   - worktree_path は上記作業ディレクトリを転写",
    "   - files_likely_to_modify は実際に編集する可能性があるファイル全て",
    "   - risk_files は global_conflict_files に該当するもの",
    "   - 不明な場合は安全側に振り needs_serialization: true で報告",
    "",
    "【重要】exploration-only。編集・コミット・push は厳禁。Read と本文取得のみ。",
  ].join("\n");
}
