<!--
schema_version: 1
last_breaking_change: 2026-07-29
notes: v1 (2026-07-29): ADR-0029 Wave B1 (controller 層 progressive disclosure) で
       skills/op-plan/SKILL.md フェーズ2.5 (§2.5-1〜§2.5-3) から verbatim 分離。
       auto-detect heuristic (investigation 型要望の判定) は「毎回・必ず通る」条件を
       満たさない (2.5-1 auto-detect heuristic に hit した場合のみ発火) ため references 候補。
       §2.5-4 (aggregateSurveyFindings の javascript fence) は
       `workflows/tests/op-plan.test.mjs` の sync-check が
       `skills/op-plan/SKILL.md` を固定 path で読み fence を抽出する構造のため、
       本ファイルへは移動せず SKILL.md 本文に残置している (分離対象外)。
-->

<!--
機能概要: op-plan フェーズ2.5 (op-survey discovery) のうち、investigation 型要望の
         auto-detect 判定 (2.5-1) / override フラグ (2.5-2) / Workflow 呼び出し手順 (2.5-3)
         の詳細仕様。
作成意図: フェーズ2.5 は「曖昧・横断的な要望で調査が必要」と判定されたときのみ発火する
         特殊経路 (auto-detect skip がデフォルトの安全側)。SKILL.md 本文の god file 化を
         抑制するため、判定ロジック・override フラグ・Workflow 呼び出し手順を分離する
         (ADR-0029 決定2)。
注意点: §2.5-4 (aggregateSurveyFindings) は本ファイルではなく SKILL.md 本文に残る
       (workflows/tests/op-plan.test.mjs の sync-check が SKILL.md 固定 path から
       javascript fence を抽出するため)。本ファイルの内容を変更した場合、
       schema_version を bump し SKILL.md フェーズ2.5 の pointer 側 `(>=N)` を確認する。
-->

# op-plan フェーズ2.5 op-survey discovery — auto-detect / override / Workflow 呼び出し

**いつ読むか**: op-plan フェーズ2 完了後、要望が investigation 型 (「調べて / 洗い出し / 棚卸し /
監査 / どこに〜があるか / 全部探して」等) かどうかを判定するとき、または `--survey` /
`--no-survey` フラグの挙動を確認するときのみ読む。goal-driven な通常要望ではこの節は読まずに
フェーズ3 へ進んでよい。

**op-explore vs op-survey の違い**: op-explore は「何を作るか」を発散させる phase -1 の UI 試作ツール (ADR-0013)。
op-survey は **既存 repo の多軸横断調査** (「調べて直したい」横断 investigation) を構造化するツール。
op-plan の前段として動作し、発見した findings を `asset_audit` に整形して op-plan-judge に注入する。

### 2.5-1. auto-detect heuristic

controller はフェーズ1 のヒアリング結果を読み、要望が **investigation 型** かを判定する:

- **起動条件 (investigation 型)**: 語彙「調べて / 洗い出し / 棚卸し / 監査 / どこに〜があるか / 全部探して」を含み、
  **具体 target（単一 file / feature / symbol）が指定されていない**
- **skip 条件 (通常 goal)**: 具体 file / feature / scope が名指しされた goal-driven 要望
- **迷ったら skip**: 判定が曖昧な場合は通常フローへ進む (誤作動より漏れのほうが安全)

**config gating** (`op-config.yaml` の `op_survey` セクション、後述):

- `op_survey.enabled: false` → auto-detect / override を問わず survey を skip して フェーズ3 へ進む
- `op_survey.auto_detect: false` → auto-detect をしない。`--survey` 明示時のみ起動する
- 未設定時は `enabled: true` / `auto_detect: true` (既定)

> **現状 (op-tools Phase 1 前)**: `op_survey` の YAML→env bridge は未配線のため、config 値は読まれず
> default (`enabled:true` / `auto_detect:true`) で動作する。`enabled:false` 等の override が実際に効くのは
> bridge 配線後 (op-config-schema.md §13 実装状況 参照)。config gating の仕様記述自体は将来配線時の仕様として正しい。

### 2.5-2. override フラグ (誤作動の安全弁)

判定誤作動に備え、ユーザーは起動時フラグで auto-detect を上書きできる:

- `--survey`: auto-detect に関わらず survey を強制起動 (`op_survey.enabled: false` の場合は config が優先され起動しない)
- `--no-survey`: auto-detect に関わらず survey を skip して フェーズ3 へ直接進む

override フラグがない場合は 2.5-1 の heuristic に従う。
`op_survey.enabled: false` が設定されている場合は、`--survey` フラグの有無を問わず survey は封じられる (config 設定が最優先)。
このとき `--survey` が明示されていれば、`--survey が指定されましたが op_survey.enabled:false のため survey を skip します (config 優先)` とユーザーに通知する (silent skip を避ける)。

### 2.5-3. survey 起動: Workflow 呼び出し

**有効条件** (以下をすべて満たすとき survey を起動する):

1. `op_survey.enabled != false` (config)
2. auto-detect hit または `--survey` 指定
3. `--no-survey` が指定されていない

> **bridge 未配線中の有効条件 1 の実際の動作**: §2.5-1 の bridge 未配線注記を参照 — 条件 1 は
> 常に `true` として扱われる (default: enabled)。

起動時の `Workflow` 呼び出し:

```javascript
// goal は フェーズ1 で確定したヒアリングメモの要約。
// op-skill repo の場合は op-skill-migration preset を使う (4 軸の定義済み調査)。
// それ以外の repo では axes / goal-derived でカスタム調査する。
// IS_OP_SKILL_REPO は controller が Workflow 呼出前に確定させる pre-step ロジック:
//   controller は repo_root に skills/ と workflows/ の両ディレクトリが存在するかを
//   確認し、両方あれば op-skill repo と判定する。
//   確認方法 (2 択):
//     A. Claude Code Glob tool: `Glob(pattern='skills/', cwd=repo_root)` で存在確認
//     B. Node.js: `import { existsSync } from 'fs'; existsSync(path.join(repo_root, 'skills'))` 等
//   'glob' npm パッケージを使う場合は `import { glob } from 'glob'` で import する。
//   確認できない / 両方は揃わない場合は false (goal-derived fallback) として動作し機能停止しない。
const surveyResultRaw = Workflow({
  name: 'op-survey',
  args: {
    repo_root: process.cwd(),         // または op-run の repo 絶対パス
    goal: HEARING_GOAL_SUMMARY,       // フェーズ1 ヒアリングメモの 1〜2 行要約
    preset: IS_OP_SKILL_REPO ? 'op-skill-migration' : undefined,
    // 汎用 repo は axes / goal-derived を使う (preset なし → goal-derived に fallback)
    model: OP_SURVEY_INVESTIGATOR_MODEL, // op_survey.models.investigator (既定 sonnet)
  },
})
const surveyResult = surveyResultRaw.result ?? surveyResultRaw;  // chat-controller は `.result` にラップ (_shared/workflow-calling.md §2)
// 戻り値 (unwrap 後): { goal, preset, axis_source, findings[], coverage_notes[] }
```

呼び出し規約 (preflight / `.result.*` unwrap / args 渡し) は `_shared/workflow-calling.md` に従う。

**起動成功時のユーザー通知** (auto-detect 経由の場合):

- 「investigation 型要望と判定したため op-survey discovery を実行します (--no-survey で無効化可)」とユーザーに通知する
- `--survey` 明示起動の場合は通知不要 (ユーザーが意図的に指定したため)

**フォールバック** (いずれもフェーズ3 へ進む点は共通。機能停止しない):

- 取得失敗 (`Workflow` 呼び出しが例外を送出。op-survey.js に `ok` フィールドはなく失敗は throw のみ) → 「survey を取得できませんでした。通常フローで継続します」とユーザーに通知する
- 正常完了・該当なし (例外なく完了したが `findings` が空) → 「survey は完了しましたが該当 finding はありませんでした。通常フローで継続します」とユーザーに通知する (取得失敗ではないため文言を区別する)

続き (§2.5-4 aggregateSurveyFindings、survey findings → asset_audit への射影) は
`skills/op-plan/SKILL.md` フェーズ2.5 本文を参照 (javascript fence の sync-check 制約のため本文残置)。
