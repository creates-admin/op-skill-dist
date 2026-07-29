<!--
schema_version: 1
last_breaking_change: 2026-07-29
notes: v1 (2026-07-29): ADR-0029 Wave B1 (controller 層 progressive disclosure) で
       skills/op-plan/SKILL.md §4-judge (計画 judge-panel 詳細) と §6-6
       (EnterPlanMode/ExitPlanMode 利用不可環境フォールバック) から verbatim 分離。
       いずれも「有効/無効 config gate」または「tool 未定義時のみ発火」する分岐であり、
       本文の主経路 (毎回・必ず・順序が重要) には該当しないため references 候補。
-->

<!--
機能概要: op-plan フェーズ4 の計画 judge-panel (ADR-0014 Wave B) の workflow 呼出詳細と、
         フェーズ -1/6 の EnterPlanMode / ExitPlanMode tool 利用不可環境でのフォールバック
         挙動をまとめた参照ファイル。
作成意図: judge-panel は `planning_judge_panel.enabled` (既定 true) で config gated な
         opt-out 可能機能、EnterPlanMode/ExitPlanMode フォールバックは tool 未提供という
         稀な環境分岐であり、いずれも SKILL.md 本文の主経路そのものではない (ADR-0029 決定2)。
         2 つの独立した特殊経路を 1 ファイルにまとめ、references ファイル数の肥大化を避けた。
注意点: 内容変更時は schema_version を bump し、SKILL.md フェーズ4 (4-judge) /
       フェーズ6 (6-6) の pointer 側 `(>=N)` を確認する。
-->

# op-plan 計画 judge-panel の詳細 + EnterPlanMode/ExitPlanMode フォールバック

## 計画 judge-panel (案出し、ADR-0014 Wave B)

**いつ読むか**: フェーズ4 (Issue draft 作成) 開始時、`planning_judge_panel.enabled` が
無効化されていない限り毎回参照する。workflow 呼出の args 組立・戻り値の扱いを確認するときに読む。

要望の **Issue 分解** (どう Issue に割るか / 順序 / MVP 切り出し) を、N 案を別角度で並列生成 → evaluator が
比較選定する judge-panel に置き換える。**案出し=workflow / 確定=司令官+人間 gate** (ADR-0009「目標アーキ: スイート全体の fan-out / verify 点マッピング」表。op-plan は
自動モードを持たないため確定は常に フェーズ6 の人間 gate)。

**有効条件 (op-config gated)**: `planning_judge_panel.enabled` (既定 `true`)。`false` または workflow が `ok:false`
(全候補不正) を返した場合は、**従来の単発分解** (4-1 以降を司令官が 1 案で実施) にフォールバックする (機能停止しない)。

**司令官 prep**: フェーズ1 hearing memo を `requirement` (summary / clarifications / constraints)、フェーズ2 判定を
`adr_decision`、フェーズ3 feature-expert audit (reusable_assets / pattern_to_follow / reuse_opportunities) を
`asset_audit` として組む (hearing は interactive ゆえ workflow に渡す前に controller が深掘り済にする)。

**op-survey 由来の `asset_audit` 補完**: フェーズ2.5 で survey を実行した場合は、`aggregateSurveyFindings()` の
戻り値を `asset_audit` にマージする (フェーズ3 audit 結果で上書きはしない。survey 結果は補完情報として追加)。
survey 未実行の場合は `asset_audit` はフェーズ3 の feature-expert audit 結果のみから構成する。

`pattern_to_follow` キーが survey 由来と feature-expert 由来の両方に存在した場合は、上書きせず
**配列連結** (spread) でマージしどちらの情報も失わない (`asset_audit.pattern_to_follow =
[...(featureAudit.pattern_to_follow || []), ...(surveyAudit?.pattern_to_follow || [])]`、
survey 未実行時は `surveyAudit` は `null`)。

**workflow 呼出**:

```javascript
const planJudgeRaw = Workflow({
  name: 'op-plan-judge',
  args: {
    requirement,                             // { summary, clarifications, constraints }
    asset_audit,                             // フェーズ3 audit
    adr_decision,                            // フェーズ2 判定
    candidate_count: PJP_CANDIDATE_COUNT,    // op-config (既定 1)
    // angles 省略可: workflow が mvp-first/risk-first/asset-reuse-first を default
    models: { generate: PJP_GEN_MODEL, evaluate: PJP_EVAL_MODEL },  // model-selection §5.1: generate=Sonnet / evaluate=Opus
  },
})
const planJudge = planJudgeRaw.result ?? planJudgeRaw;  // chat-controller は `.result` にラップ (_shared/workflow-calling.md §2)
// = { ok, recommended:{angle, plan:{issues[]}, corrected}, candidates:[{angle, issues, score}], js_ranking, evaluator:{recommended_angle, rationale, ranking}, dropped }
```

呼び出し規約 (preflight / `.result.*` unwrap / args 渡し) は `_shared/workflow-calling.md` に従う。

**戻り値の扱い**:

- `ok:false` → フォールバック (従来単発分解)。`dropped` を warning に出す。
- `ok:true` → `recommended.plan.issues[]` (= 分解された issue: title / domain / scope_summary / files / expert /
  depends_on / reuses_existing / is_mvp) を **フェーズ4 の Issue 群として採用**。各 issue に 4-1 (domain 判定) /
  4-2 (骨格) / 4-4 (fingerprint + dedup) を **per-issue で適用**する (workflow は分解=planning までで、骨格化・dedup・
  起票は controller)。ranked 代替案 (`candidates` の他 angle) は **フェーズ6 で提示**し、人間が別 angle を選べる。
- 選定後の フェーズ5 enrichment は **採用分解の各 issue** に対して実施する。フェーズ6 で人間が代替 angle を選んだ場合は
  その分解で enrichment をやり直す (op-plan は自動進行しないため再 enrichment コストは許容)。

---

## EnterPlanMode / ExitPlanMode が利用できない環境

**いつ読むか**: フェーズ -1 で `EnterPlanMode` 呼び出しが tool 未定義エラーで失敗したとき、
またはユーザーが承認 prompt に No を返したときのみ読む。通常の plan mode 遷移が成功する
セッションではこの節を読む必要はない。

Claude Code のバージョンによっては `EnterPlanMode` / `ExitPlanMode` tool が提供されない場合がある
(古い CLI バージョン / 特殊環境 / tool listing から除外されている場合など)。
司令官はフェーズ -1 で `EnterPlanMode` 呼び出しが **tool 未定義エラー** で失敗した場合
(tool listing に EnterPlanMode が存在しない、または ToolSearch で取得不能)、
v1 互換のフォールバック挙動に退避する:

- フェーズ 0-6 を **SKILL.md 内の規律のみ** で read-only 進行 (機能停止はしない、規律のみで進める)
- フェーズ 6 では `ExitPlanMode` を呼ばず、従来の対話プレビュー
  (司令官が `この内容で起票しますか? 1.起票する 2.修正要求 3.キャンセル` を表示する形式) に退避
- ユーザーには「Claude Code のバージョンに `EnterPlanMode` tool がないため、
  v1 互換動作で続行します (SKILL.md 規律レベルの read-only 保証)」と通知

tool 自体は存在するが フェーズ -1 で **ユーザーが承認 prompt に No を返した** 場合は、
-1.1 節のフォールバックに従う (= 同じく v1 互換の対話プレビューに退避)。
