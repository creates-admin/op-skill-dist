<!--
schema_version: 2
last_breaking_change: 2026-05-16
機能概要: Issue draft を入力として UI 影響判定 / Design Plan 生成 + gate / cross-review / 統合修正
         を経由した「検証済み + Design Plan 付き Issue」を返す変換層の正本。
         op-scan / op-patrol / op-plan の 3 スキルから共通参照する。
作成意図: 「ADR 不要だが Issue 品質・UI 設計はほしい」中量級 Issue を底上げする共通基盤。
         Single Canonical Source Rule: 本ファイルが正本 (Design Plan + gate + cross-review)。
注意点: 本層は「起票前 (pre-create) 専用」。apply / 起票 / scope 推定 / severity 判定は呼び出し側担当。
notes: v2 据置 (2026-07-22, ADR-0024 Phase 3 第二波) — §7.5 に mcp channel の素材注記を additive 追加
       (`mcp__github__search_issues` 経由の `EXISTING` 取得)。非破壊のため schema_version 据え置き。
       v2 据置 (2026-06-03, #642/#647/#648) — labels_to_add pro-* 制限 / cross-review graceful degrade /
       a11y-only Design Plan skip carve-out。全 additive。
       v2 据置 (2026-05-31, C4) — §5/§6 を op-enrichment.js workflow へ移行。§7.6 canonical 化。
       v2 (2026-05-16) — §7.5 Cross-instance Collision Gate 追加 (破壊的変更、#38/#42 防止)。
       op-plan/SKILL.md は (>=2) 更新済み。op-scan/op-patrol/op-architect も (>=2) 参照済み。
       v1 (2026-05-11) — 新設。op-architect フェーズ 4.6 を本ファイルに集約。
-->

# Issue Enrichment 層

## 1. 目的

「Issue draft → 検証済み + Design Plan 付き Issue」変換層。op-scan / op-patrol / op-plan の
3 スキルから共通参照される canonical な Issue 補強パイプライン。

呼び出し側スキル:

- **op-scan** (通常実行 / `--from-issue` / `--auto`) — 検出 → issue_draft → enrichment → 起票
- **op-patrol** (通常実行 / `--auto`) — Patrol Ledger 巡回 → issue_draft → enrichment → 起票
- **op-plan** (対話) — 自然言語ヒアリング → issue_draft → enrichment → ユーザー承認 → 起票

本層自体は `gh issue create` を呼ばない。最終的な GitHub への投入は常に呼び出し側責務である。

---

## 2. 責務範囲 (DO / DON'T)

### DO

- **UI 影響判定** (拡張子 / path パターン / runner / domain による heuristic、§4 参照)
- **Design Plan 生成** (UI 影響 Issue のみ、designer-expert Architect Mode を spawn、§5 参照)
- **Design Plan gate** (ux-ui-audit-expert gate Mode を spawn、PASS / PASS_WITH_NOTES / BLOCK、§5 参照)
- **cross-review 並列実行** (検出 expert 以外の関連 expert に read-only review させる、§6 参照)
- **Critical/High 指摘の Issue 本文反映** (本文に自然に溶け込ませる、§8.1 参照)
- **Medium/Low 指摘の post_create_comments 分離** (本文を肥大化させない、§7 / §8.1 参照)
- **enrichment marker 4 種の埋め込み** (`op-enriched` / `op-enrichment-loops` /
  `op-enrichment-design-plan` / `op-enrichment-cross-review`、§9 参照)

### DON'T

- **Issue 起票自体** — `gh issue create` は呼び出し側が実行する。本層は文字列 (enriched_issue)
  を返すだけで GitHub 状態を変えない
- **scope 推定** — 呼び出し側が `scope_files` / `new_files` を done 済で渡す前提
- **severity 判定** — 呼び出し側が `severity_rubric.md` に従って既に done。本層は受け取った
  severity を加工しない (cross-review で発見された新規 finding は本文反映 or
  post_create_comments への振り分けに使うのみ)
- **実装 / apply** — 全 expert spawn は **read-only review モード**。本層は review-expert と
  同じ「修正 / commit / push 禁止」契約に従う
- **オリジナル Issue (元 Issue) の改変** — `--from-issue` 経路でも、元 Issue 本体は触らない
  (派生 Issue の起票のみ呼び出し側が行う)
- **人間との対話** — 本層は OP-managed Mode 専用の判定パイプライン。質問で停止しない。
  判断不能は `needs_human_decision` を構造化して呼び出し側に返す
  (`_shared/invocation-mode.md` の OP-managed Mode 契約に従う)

---

## 3. Input contract (呼び出し側が渡す)

呼び出し側スキルは本層を以下の構造で呼び出す (概念上の JSON / 実装上は司令官が文字列として
組み立てて expert spawn の prompt に渡す):

```json
{
  "issue_draft": {
    "title": "<簡潔なタイトル>",
    "body": "<指示書フル版 Markdown (pr-templates.md 準拠)>",
    "domain": "feature | refactor | debug | optimize | security | ux-ui | design",
    "recommended_runner": "<expert-name>",
    "scope_files": ["src/foo.vue", "src/bar.ts"],
    "new_files": ["src/baz.vue"],
    "severity": "critical | high | medium | low | n/a",
    "fingerprint": "<op-fingerprint 形式>"
  },
  "options": {
    "with_design_plan": "true | false | auto | gate_only",
    "with_cross_review": "true | false | auto",
    "max_review_loops": 2,
    "strict": false
  }
}
```

### options 各フィールドの意味

| field | 説明 | デフォルト |
|-------|------|-----------|
| `with_design_plan` | `auto` は §4 の UI 影響判定で自動分岐。`true` 強制有効 / `false` 強制 skip / `gate_only` は提示済 Design Plan を**再生成せず gate のみ** (op-explore handoff の二重課金回避、ADR-0013 決定C) | `auto` |
| `with_cross_review` | `auto` は severity high+ のみ実行 (§11 cost-control 参照)。`true` 強制 / `false` 強制 skip | `auto` |
| `max_review_loops` | review → 修正反映 → 再 review の最大ループ数 (初回を含む)。default 2 = 初回 + 再 review 1 回 | 2 |
| `strict` | true: 一部失敗 (designer-expert spawn 失敗 / cross-review 一部失敗) でも enrichment 中断。false: warning + 継続 (§10 参照) | false |

### 入力前提 (呼び出し側責務)

- `issue_draft.body` は **`pr-templates.md` の指示書フル版テンプレに準拠** していること
  (op-run が読める骨格を持つ)。本層は骨格の妥当性は検査しないが、最低限「タイトル」「背景」
  「success_criteria」「verification_steps」相当の節があることを期待する
- `severity` は `severity_rubric.md` の基準で判定済。本層は再判定しない
- `fingerprint` は `op-fingerprint:` 規約 (`<domain>:<normalized_title>:<primary_file>:<symbol>`)
  に従って組み立て済。dedup は呼び出し側 / op-merge で行う

**follow-up draft (op-scan `--from-merged-pr` 経路) の補足**:

op-scan `--from-merged-pr` モードが生成する follow-up Issue draft も本 input contract に従う。
ただし以下の特性を持つ:

- `severity` は default で **low / medium** (PASS_WITH_NOTES Notes 由来 / recommended_followup_experts 由来は medium 以下)
- `needs_human_decision` (boundary) 由来は **high** に昇格してよい
- `body` の「関連」節に親 PR URL を記録する (trace 用、optional)
- collision gate (§7.5) を必ず通す (既存 follow-up との重複検出が重要)
- `with_cross_review: auto` は severity high+ のみ有効 (low/medium の post-check Notes 由来は cross-review skip 推奨、cost 削減)

---

## 4. Phase 1: UI 影響判定

`with_design_plan = "auto"` のとき、本層は以下のいずれかが該当すれば **UI 影響あり** と判定し
Design Plan 生成フェーズへ進む。いずれにも該当しなければ Design Plan を skip し、Phase 4
(cross-review) へ直接進む。

### 判定条件 (OR、いずれか 1 つで「UI 影響あり」)

1. **拡張子マッチ** — `scope_files` または `new_files` に以下のいずれかを含む:
   - `*.vue` (Vue 3 SFC)
   - `*.tsx` / `*.jsx` (React / Solid 等)
   - `*.svelte`
   - `*.dart` (Flutter)
2. **path パターンマッチ** — `scope_files` または `new_files` に以下のいずれかの prefix を含む:
   - `pages/**` / `routes/**` / `views/**` — 画面エントリ
   - `components/**` — UI コンポーネント
   - `theme/**` / `tokens/**` / `styles/**` — Design Token / theme
   - (※ `src/` 単体マッチは禁止。Rust crate / Tauri backend を UI 扱いしない)
3. **runner マッチ** — `recommended_runner` が以下のいずれか:
   - `designer-expert`
   - `ux-ui-audit-expert`
4. **domain マッチ** — `issue_draft.domain` が以下のいずれか:
   - `ux-ui`
   - `design`

### carve-out: 非視覚的 markup / a11y 属性のみの既存ファイル fix (#648-A)

上記 OR 条件 1〜4 は「ファイルに触れたか / runner / domain」だけで判定し、**変更の性質 (視覚デザイン変更か /
属性追加のみか) を区別しない**。そのため `<label for>` / `id` 紐付け / `aria-*` 追加のような **視覚デザインを
伴わない a11y 属性・markup のみの既存ファイル修正**でも OR 条件 1 (拡張子) でヒットし、最低 light の Design Plan
(token-curation + layout-composition + ux-ui-audit gate の 3 spawn) が走ってしまう。これはコストと手数が過剰。

以下を **すべて満たす**場合に限り、OR 条件にヒットしても **UI 影響なし扱い (`design_depth = none`、Design Plan
skip)** とする carve-out を controller pre-step が適用する:

- `issue_draft` の title / scope (body の明示記述) が **「a11y 属性追加のみ」または「非視覚的 markup fix」と
  明示的に宣言**している (例: `for`/`id` 紐付け追加、`aria-label` 追加、`role` 付与、見た目を変えない semantic tag
  置換)。**heuristic で推測しない** — 明示宣言がない限り carve-out しない。
- `new_files` が空 (新規 surface = 新規画面を作らない。新規ファイルは視覚設計を伴う蓋然性が高いため carve-out 対象外)。
- `issue_draft.domain` が `ux-ui` / `design` でない (例: debug / feature / refactor に付随する a11y fix)。domain が
  ux-ui / design のものは視覚設計が主目的の蓋然性が高いため carve-out しない。

carve-out を適用したら marker は `op-enrichment-design-plan: skipped` を記録する (UI 影響なしと同じ扱い)。

> **under-trigger (false-skip) が最大リスク** (#648 想定リスク): 視覚デザインを伴う変更を markup-fix と誤判定して
> Design Plan を skip すると design 品質が落ちる。上記 3 条件は「明示宣言がある狭いケース」に意図的に限定し、
> **少しでも視覚変更 (スタイル / レイアウト / 新規 surface) が混ざる可能性があれば carve-out せず従来どおり発火
> (安全側)** とする。迷ったら発火が原則。carve-out 判定は controller pre-step の責務で、本 §4 が判定基準の正本
> (§7.6 は本節への参照に留める)。

### with_design_plan が "true" / "false" / "gate_only" 時の挙動

- `"true"` — UI 影響判定を skip して必ず Design Plan 生成に進む
- `"false"` — UI 影響判定を skip して Design Plan を生成しない。
  `op-enrichment-design-plan: skipped` を marker に記録
- `"gate_only"` (ADR-0013 決定C、op-explore handoff 用) — UI 影響判定を skip し、**Design Plan 生成役 pipeline (token-curation→…→layout) を走らせず**、
  `issue_draft.body` に既に提示済の `## 🎨 Design Plan` を入力として **ux-ui-audit gate だけ**を実行する (op-explore で確定済の Design Plan を
  再生成せず検証のみ = 二重課金回避)。gate が BLOCK なら通常の design_plan_block と同じ扱い。提示済 Design Plan が本文に無い場合は
  `auto` 相当 (UI 影響判定) にフォールバックする。**marker は新 enum 値を増やさず既存の `op-enrichment-design-plan: generated`**
  (= 本文に確定 Design Plan が存在し gate 通過済、downstream 意味は通常生成と同一) を記録する (marker schema 安定 = 不変則1)。

### 判定結果の記録

判定結果は内部 state として保持し、最終的な hidden marker
`op-enrichment-design-plan: generated | skipped | failed | blocked` で出力する (§9 参照)。
(gate_only モードで gate を通過した場合も、本文に確定 Design Plan が存在するため `generated` を記録する =
marker enum は 4 値で安定、ADR-0013 決定C は新 enum 値を増やさない。)

### Phase 1 と並行: task_complexity 推論

UI 影響判定と並行して、Issue 全体の **task_complexity** を推論する。task_complexity は op-run
apply フェーズで spawn する expert の model 選択に使われる Issue 単位メタデータ。

区分・mapping table・override 優先順位の正本は `_shared/model-selection.md` (>=1) の §2 を参照。
本ファイルは推論手順のみ規定する。

推論材料:

1. **issue_draft.body** の意味的読解 (Issue が「routine な置換」か「新規設計を伴う」か等)
2. **scope_files / new_files の数と多様性** (単一ファイル内修正 → `routine` / `extension` 寄り、
   多モジュール横断 → `integration` 寄り)
3. **既存資産の発見** (silent fork 候補 = 既存実装が見つかった → `integration` 寄り)
4. **API / 公開契約への影響** (公開 API 変更を含む → `api-design`)
5. **runner** が `feature-expert` で「新規 feature」を示唆する記述 → `design` 寄り

推論主体: 本 enrichment 層 (controller が Opus 単発で実施)。Phase 1 の判定と並列で実施可。
推論結果は Output contract の `enriched_issue.task_complexity` field に格納し、op-run 側が
spawn 時の model 決定に利用する (`expert-spawn.md` の model / task_complexity routing 節を参照)。

確信度が低い場合は暫定で `extension` を採用し、post-check で見直す (`model-selection.md` §9)。

### Phase 1 は controller pre-step (ADR-0009 Phase C / C4)

C4 以降、§4 の UI 影響判定 (`with_design_plan` を bool に解決) / cross-review 担当 expert の解決
(§6 担当表 → `cross_review_experts`) / task_complexity 推論 は、いずれも **controller が Workflow 呼出前に
解決して `op-enrichment.js` の args に注入する pre-step** である (heuristic / 単発判断で spawn を伴わないため
workflow に二重化しない、Single Canonical Source)。workflow には解決済の bool / expert list / task_complexity
が渡り、workflow 内では条件分岐のみ行う。controller オーケストレーション順序は §7.6 を参照。

### Phase 1 additive: design_depth / design_roles / foundation_exists / design-spike (ADR-0012)

`with_design_plan` を bool 解決する true 枝で、controller は以下も pre-step で**追加解決**し `op-enrichment.js`
の args に注入する (heuristic / 単発判断で spawn を伴わないため workflow に二重化しない、Single Canonical Source)。
閾値・役リスト・役別 model の正本は `op-config-schema.md §9 design`:

1. **`design_depth` (none | light | full)** — 導出主軸は severity でなく「**新規 surface か / foundation 既存か**」
   (新規画面は欠陥でなく不在のため severity 軸では漏れる)。**全組み合わせを網羅する表** (未定義組を残さない、#648):

   | UI 影響 | task_complexity | foundation | design_depth |
   |---------|-----------------|------------|--------------|
   | なし (§4 OR 非該当) | — | — | **none** (役 0) |
   | なし扱い (§4 carve-out: 明示宣言された a11y-attribute-only / 非視覚 markup fix、#648-A) | — | — | **none** (役 0、Design Plan skip) |
   | あり | routine / extension | 既存 | **light** |
   | あり | routine / extension | 不在 | **light** (低 complexity は foundation 不在でも full は過剰。foundation 整備は手順6.5 の `op:foundation-precondition` 先行起票で別扱い = #648 fallthrough 解決) |
   | あり | design / integration / api-design | 既存 (既存 surface 拡張) | **full** |
   | あり | design / integration / api-design | 既存 (新規 surface) | **full** |
   | あり | design / integration / api-design | 不在 | **full** |

   要約: `light = UI 影響 ∩ task_complexity ∈ {routine, extension}` (foundation 既存/不在を問わず light) /
   `full = UI 影響 ∩ task_complexity ∈ {design, integration, api-design}` (新規 surface か foundation 不在かを問わず full)。
   旧記述の `routine/extension ∩ foundation 不在` の fallthrough は **light に確定** (低 complexity を foundation 不在だけで
   full に昇格させない)。op-scan/op-patrol `--auto` は `auto_full_downgrade_to_light` で full を light に丸める (throughput ガード)。
2. **`design_roles` (list)** — design_depth から派生 (full = `[token-curation, component-selection,
   layout-composition]` / light = `[token-curation, layout-composition]`)。`motion-spec` は
   full ∩ `config.motion_enabled=true` ∩ `motion-patterns.md` 着地済 のとき `design_roles` 末尾に追加 (ADR-0012 Wave4)。
   **「motion 使用画面」の判定は designer (motion-spec 役) へ委譲**する: controller は静的に「この画面が motion を使うか」を
   確実に判定できないため、`motion_enabled=true ∩ full` で役を追加し、motion が不要な画面では motion-spec 役が
   最小 (または「motion 不要」と明記した) `### Motion Strategy` 節を出す。これにより controller heuristic を増やさず
   AI が確実に担える ①② tokenized motion の安全圏に倒す (`motion_enabled=false` の間は従来通り 3 役、motion 役ゼロ)。
3. **`foundation_exists` (bool)** — controller 側で `theme/` `tokens/` `tailwind.config*` / vuetify +
   `components/Button` 等を **read-only grep し bool だけ注入**する。grep を workflow に置くと ADR-0009 の
   fs/process 不可制約に抵触するため、必ず controller 側で実行する (§7.6 手順3)。
   この bool は `op-enrichment.js` の token-curation 役の権限分岐 (参照のみ / add+normalize) と、役別 model の
   `token-curation` 昇格判定 (下記 5) の双方に効く。
5. **`role_models` (object、ADR-0012 Wave4)** — 役別 model を controller が pre-step で解決し注入する。正本値は
   `op-config-schema.md §9 role_models` (既定: 検出役 `token-curation`/`component-selection`=sonnet、生成役
   `layout-composition`/`motion-spec`=opus)、決定規則・昇格は `model-selection.md §5.4.1`。controller は op-config 既定 +
   op-config.yaml override + `--quality` 段階調整 + **`foundation_exists=false` のとき `token-curation` を opus 昇格**
   (add+normalize=生成) を適用した最終 map を注入する。未注入時は `op-enrichment.js` が `ROLE_MODEL_FALLBACK`
   (検出役 `token-curation`/`component-selection`=sonnet、生成役 `layout-composition`/`motion-spec`=opus、未知役は `|| "opus"` 安全網)
   に倒す (#676 で全役 opus から役別化、`op-config-schema.md §9 role_models` と同値)。controller 注入 (`role_models[role]`) は
   最優先で勝つため、foundation 不在時の `token-curation` opus 昇格は注入経路で保持される。
4. **design-spike トリガ** — `design_depth=full ∩ ③④ bespoke (orchestrated / spring / novel)` が必要と判定した
   ケースで、workflow が `needs_human_decision(decision_type: "design")` を返す契約 (ADR-0012 決定7)。受領は非対称:
   op-plan = ExitPlanMode 選択肢に翻訳 / op-architect = 受け口のみ / op-scan・op-patrol `--auto` = `manual_review_bucket`
   退避 (既存 §7.1 block 非対称を再利用)。foundation 不在時の foundation-build 先行起票は `op:foundation-precondition`
   ラベル (merge 非blocking の tracking、`op:blocking-finding` は使わない、§7.6 手順6.5)。

---

## 5. Phase 2-3: Design Plan 生成 + gate

### 実行機構: op-enrichment.js workflow (ADR-0009 Phase C / C4)

Design Plan 生成 + gate は **Dynamic Workflow `workflows/op-enrichment.js` の `design-plan` phase が実行する**
(controller の直接 `Agent` spawn から移行、ADR-0009 Phase C / C4)。司令官は §7.6 の controller
オーケストレーション順序に従い `Workflow({name:'op-enrichment', args:{...}})` を呼ぶだけで、workflow が
designer-expert (Architect Mode) → ux-ui-audit-expert (gate Mode) の spawn と BLOCK retry を内部で行う。
UI 影響ありと判定された Issue のみ実行する (判定は controller pre-step、§4)。

**model 指定**: 全 enrichment spawn は **`model: "opus"` 固定** (Issue 単位 1 回・判断不可逆な起票前 gate のため、
`model-selection.md` §5.1「enrichment は常に Opus」)。`--quality low` でも維持する
(workflow が `agent()` の model に opus リテラルを渡す)。spawn 経路の canonical schema は
`_shared/expert-spawn.md` のパターン 1 (read-only audit) と同等。

spawn prompt 本文 (designer Architect / ux-ui-audit gate の文面) は `workflows/op-enrichment.js` の
`buildDesignPlanPrompt` / `buildGatePrompt` に移送済 (本ファイルに重複保持しない、ADR-0009 削除ポリシー)。
op-architect フェーズ 4.6 も本 workflow を呼ぶ (C4 で統一、本ファイルが Design Plan 生成 + gate ロジックの
**唯一の正本**。op-architect 側に重複定義 / 逆方向 pointer は書かない)。

### Design Plan 生成 (Phase 2、designer-expert Architect Mode)

workflow が `designer-expert` を Architect Mode で spawn し、issue_draft (title / scope_files / new_files /
body 内 success_criteria) + プロジェクト種別 (controller が `project-profile.md` から注入) を渡して
Design Plan Markdown を生成させる。出力フォーマットは `~/.claude/skills/expert-design/SKILL.md` の
「Design Plan 出力フォーマット」(User Goal / Current UX-UI Problem / Design Intent / Components to Use /
Tokens to Use / Applicable States / Layout Strategy / Accessibility Requirements / Implementation
Boundaries / Verification。正規テンプレは `pr-templates.md`「op-architect / op-run: Design Plan」)。
判断不能時は `design_assumptions[]` + `needs_human_decision` (decision_type: design) を返し、Plan は
出力可能範囲に留める (free-form question 禁止)。生成された Design Plan は workflow が enriched_issue.body
の `## 🎨 Design Plan` 節に埋め込む (op-architect 経路は additive 戻り値 `design_plan` で受領)。

### Design Plan gate (Phase 3、ux-ui-audit-expert gate Mode)

workflow が `ux-ui-audit-expert` を gate Mode で spawn し、Design Plan を独立検証して
PASS / PASS_WITH_NOTES / BLOCK を返す。検証 6 観点 (正本は `~/.claude/skills/expert-ux-ui-audit/SKILL.md`
gate モード節): (1) 次の行動が明確になる設計か (2) 必須 UI state が網羅されているか
(3) エラー復帰導線が設計されているか (4) 業務フローに合った画面構成か (5) accessibility 要件が十分か
(6) 見た目に寄りすぎていないか。出力は `pr-templates.md`「op-architect: UX/UI Audit Gate Result」
テンプレ準拠の Markdown。情報不足時は `needs_human_decision` を使う (free-form question 禁止)。

### 判定に応じた処理

| 判定 | 本層の動作 |
|------|-----------|
| **PASS** | Design Plan を確定し、enriched_issue.body に埋め込む準備に進む。marker は `op-enrichment-design-plan: generated` |
| **PASS_WITH_NOTES** | Notes を Design Plan 末尾に `### Audit Notes` として追記し、確定。marker は `op-enrichment-design-plan: generated` (PASS と同等扱い、追記情報のみ差分) |
| **BLOCK** | Required Changes を designer-expert に返して Design Plan を再作成 (Phase 2 から再実行)。同一 Issue で **連続 3 回 BLOCK** が続いたら enrichment 中断、`result: blocked` で escalation_report を返却。marker は `op-enrichment-design-plan: blocked` |

### 失敗ハンドリング

- **designer-expert spawn 失敗** — strict=false なら warning + Design Plan を skip して継続
  (marker は `op-enrichment-design-plan: failed`)。strict=true なら enrichment 中断
- **ux-ui-audit-expert gate 失敗** — strict=false なら warning + Design Plan を no-gate で
  埋め込み継続 (marker は `op-enrichment-design-plan: failed`)。strict=true なら中断
- 詳細は §10 Failure modes 参照

---

## 6. Phase 4: cross-review

`with_cross_review` が真 (`"true"` または `"auto"` 時の有効化条件を満たす) のとき、
**検出 expert 以外の関連 expert** を並列 spawn して **read-only review モード** で
Issue 全体 (本文 + Design Plan 埋め込み済) をレビューさせる。

### cross-review 担当表 (Single Source — 本ファイル内で完結)

| 検出 expert (recommended_runner) | cross-review 担当 (並列 spawn) |
|---------------------------------|--------------------------------|
| `feature-expert` (UI 影響時)    | `designer-expert` + `ux-ui-audit-expert` + `security-expert` |
| `feature-expert` (非 UI)        | `security-expert` + `refactor-expert` |
| `refactor-expert`                | `debug-expert` + `test-expert` |
| `security-expert`                | `debug-expert` + `refactor-expert` |
| `optimize-expert`                | `debug-expert` + `refactor-expert` |
| `debug-expert`                   | `refactor-expert` + `test-expert` |
| `designer-expert`                | `ux-ui-audit-expert` + `feature-expert` |
| `ux-ui-audit-expert`             | `designer-expert` + `feature-expert` |

※ `test-expert` は active expert registry 上 active。`release-expert` / `env-expert` /
`compatibility-expert` は planned のため cross-review 担当に **指定しない** (`_shared/planned-experts.md` 参照)。
`spec-expert` は active (Utility Worker / op-spec 専用) だが cross-review pool (active primary expert) の外であり、
同じく cross-review 担当に指定しない。

**cross_review_experts の各要素の形 (controller が args 注入)**: `{ name, applies_or_post_checks }`。

- `name` — 上表の cross-review 担当 expert 名 (必須)。
- `applies_or_post_checks` (bool、optional、default false、#642) — その reviewer が当該 Issue の **apply 役**
  (例: UI 経路の `designer-expert` が Design Plan を実装する) または **post-check 役**
  (`issue_draft.post_check_expert` に一致、例: `ux-ui-audit-expert` / `security-expert`) を **兼ねる**なら true。
  純粋な品質レビュー役 (例: refactor 検出時の `debug-expert` / `test-expert`) は false。これは `labels_to_add` の
  `pro-*` 付与可否にのみ効く (§8、apply/post-check 役のみ pro-* を付け、品質レビュー役の noise ラベルを抑止)。
  cross-review の実行 (spawn / judge / 統合) 自体には影響しない。controller の解決手順は §7.6 手順3。

### 実行機構 + spawn prompt

cross-review は **`workflows/op-enrichment.js` の `cross-review` phase が並列 spawn する** (controller が
上記担当表で解決した reviewer list を Workflow args `cross_review_experts` に注入、§7.6)。各 reviewer は
read-only review モード (apply / 修正 / commit / push 禁止、review-expert と同じ責務) で Issue 全体
(本文 + Design Plan 埋込済) をレビューし、以下を返す:

```
{
  "review_result": "approve | changes_requested | block",
  "findings": [
    { "severity": "critical | high | medium | low", "category": "<short_label>",
      "summary": "<1-2 sentence>", "suggested_change": "<本文への反映文案 or 別 Issue 化提案>" }
  ],
  "needs_human_decision": null | { "decision_type": "...", "question": "..." }
}
```

レビュー観点 (success_criteria 十分性 / scope_files の漏れ・過剰 / success-failure path カバレッジ /
domain-specific [security なら 8 観点等] / silent fork リスク) と spawn prompt 本文は
`workflows/op-enrichment.js` の `buildCrossReviewPrompt` に移送済 (本ファイルに重複保持しない、ADR-0009 削除ポリシー)。

workflow は reviewer↔結果を **index-zip で対応付け** (filter(Boolean) しない)、null spawn を失敗 reviewer として
特定する (strict 判定で `spawn_failure_strict` に使う、§10)。judge (集約) は §7 の最大集約を workflow が決定論実装する。

### auto モードの cross-review 有効化条件

`with_cross_review = "auto"` のとき、cross-review は **severity が `high` または `critical`**
の Issue のみ実行する (`medium` / `low` / `n/a` は skip)。これは cost-control (§11) と
ノイズ削減のため。

### with_cross_review=true 時の reviewer 数 gating (Issue #757、ワークフロー内 cost-control)

`with_cross_review = true` (強制有効) の場合でも、ワークフロー内で以下の条件に基づき
reviewer 数を削減する (`resolveReviewers` 関数、`op-enrichment.js`):

| 条件 | reviewer 数 |
|------|------------|
| severity が `critical` または `high` | フル (§6 担当表の全 reviewer) |
| UI 影響あり (`with_design_plan=true` または `gate_only`) | フル |
| `task_complexity` が `design` / `integration` / `api-design` | フル |
| 上記いずれにも該当しない (Medium 以下 ∩ 非 UI ∩ routine / extension) | **先頭 1 reviewer のみ** |

低コスト経路では `cross_review_experts` の先頭 1 件のみ spawn し、残りはスキップする。
Critical/High または UI 影響または高複雑度の Issue は現行どおりフル review を維持する
(**必ず強くする方向には変えない**)。

この gating は controller pre-step の auto 有効化条件 (severity high+) とは別レイヤーで、
`with_cross_review=true` 強制時のワークフロー内追加削減を目的とする。

### 一部 expert spawn 失敗時

- strict=false: 失敗した expert の review を warning として記録し、残った expert の結果で判定を進める
- strict=true: enrichment 中断、`result: blocked` で escalation_report 返却
- 詳細は §10 Failure modes 参照

---

## 7. Phase 5: review 統合 + Issue 修正

cross-review が返した全 review を統合し、全体判定と本文修正を行う。

**実行機構 (C4)**: 本節の judge (最大集約) / Critical/High 本文統合 / max_review_loops ループは
**`workflows/op-enrichment.js` の `cross-review` / `integrate` phase が内部で実行する** (本文統合は §2 DO で
enrichment 層の責務、workflow は read-only review agent が生成した Issue 本文 string を組み立てるのみで
repo / GitHub は触らない)。workflow は §8 Output contract 一式を組立てて controller へ返し、controller は
collision gate → 起票 を行う (§7.6)。以下は workflow が決定論実装する集約・ループ意味論の正本記述。

### 全体判定 (最大値で集約)

各 review の `review_result` を以下の優先度 (高 → 低) で集約し、**最も厳しい結果** を全体判定とする:

1. `block` — いずれか 1 つでも block → 全体 block
2. `changes_requested` — block なし + いずれかが changes_requested → 全体 changes_requested
3. `approve` — 全員 approve → 全体 approve

### 全体判定別の処理

| 全体判定 | 動作 |
|---------|------|
| **approve** | enrichment 完了。enriched_issue を呼び出し側に返却 |
| **changes_requested** | Critical/High 指摘を本文に統合反映 (§8.1 のポリシーに従い自然文で溶け込ませる) → max_review_loops が残っていれば再 cross-review (Phase 4 から再実行)。残っていなければ `result: enriched` で完了 (max_loops 到達は strict 時のみ block 化、§10 参照) |
| **block** | enrichment 中断、`result: blocked` で escalation_report 返却。Issue は起票しない |

### Medium / Low 指摘の扱い

Critical/High 指摘のみ Issue 本文に反映する。**Medium/Low 指摘は本文反映せず**、起票後コメント用
(`post_create_comments[]`) に分離して呼び出し側に返す。呼び出し側は `gh issue create` 成功後に
これらを `gh issue comment` で投稿する。

これにより本文の肥大化を避け、人間レビュー時に Critical/High が埋もれないようにする。

### review ループの上限

`options.max_review_loops` (default 2) は **「初回 review + 再 review (1 回まで)」を含めた合計回数**
を意味する。default 2 のとき:

- ループ 1: 初回 cross-review → changes_requested なら本文修正
- ループ 2: 再 cross-review → 判定確定 (approve / changes_requested / block)

ループ 2 で再び changes_requested の場合の挙動は §10 (max_loops 到達後) に従う。

### 7.1 起票前 review であることの明示 (重要不変則)

enrichment 層は **`gh issue create` の前に走る pre-create review**。GitHub に立った後の Issue に
レビューコメントを追加するモードではない。

この不変則は **すべての呼び出し経路で守られる**:

| 呼び出し経路 | 挙動 |
|-------------|------|
| op-scan 通常実行 | detect → issue_draft → enrichment → enriched で起票 |
| **op-scan `--from-issue`** | 元 Issue 取得 → 派生 issue_draft 生成 → enrichment → enriched で **派生 Issue** 起票 (元 Issue 本体は触らない) |
| **op-scan `--auto`** | 人間承認 gate は skip するが enrichment 自体は走る。block 判定なら **起票せず `manual_review_bucket` へ記録** (`_shared/auto-policy.md` 準拠) |
| op-patrol 通常実行 | detect → issue_draft → enrichment → enriched で起票 |
| op-patrol `--auto` | op-scan --auto と同じ挙動 |
| op-plan 対話 | issue_draft → enrichment → ユーザー承認 gate → 承認後起票 |

→ 「起票してからレビュー」というモードは存在しない。block されたら起票自体がキャンセルされる。

`--auto` モードでも block 判定で自動起票しない理由: enrichment 層は **品質ゲート** であり、
auto モードはそのゲートをスキップするための機構ではない (auto モードは **人間承認** をスキップ
するだけ)。block を auto で素通しすると、op-run が壊れた Issue を拾う risk が生じるため、
auto モードでも block 判定時は `manual_review_bucket` に退避し、人間レビューを待つ。

→ 本不変則は本ファイルが正本である `--auto` 経路の挙動規定であり、`_shared/auto-policy.md`
の 8 条件 (severity / evidence_grade / files / etc.) とは別レイヤー (本層の品質ゲートは
auto-policy 8 条件を **満たした後** に走る最終 gate)。

---

### 7.5 Cross-instance Collision Gate (v2 追加)

#### 目的

複数の op-run instance / 複数の Issue 起票タイミングが並列動作するとき、**同種実装を要求する
Issue が重複起票される collision** を起票直前に検出して防ぐ。

実害事例 (#38 / #42): `op scan bulk-group` subcommand を要求する 2 件の Issue が別々の op-run
instance で並列実装され、PR #69 と PR #61 が merge 競合した。いずれの起票経路にも横断検索 gate
がなかったことが根本原因。

本 gate は §7.1 と同じ「**起票直前に走る pre-create review**」の一部として位置づける。
`gh issue create` の直前に評価し、block / warn / clear を返す。

**bypass 禁止**: `--no-enrichment` flag で全 enrichment を skip した場合でも、本 gate は別
レイヤーとして必ず実行する (collision gate は enrichment skip の対象外)。

---

#### 入力

| フィールド | 内容 |
|-----------|------|
| `draft_fingerprint` | 新 Issue draft の `op-fingerprint` 値 (4-seg 文字列) |
| `draft_title` | 新 Issue draft のタイトル (正規化前の生文字列) |
| `draft_expert` | 新 Issue draft の `op-run-expert` 値 (例: `feature-expert`) |
| `draft_primary_file` | `op-fingerprint` の 3 セグメント目 (primary_file) |
| `draft_symbol` | `op-fingerprint` の 4 セグメント目 (symbol) |

---

#### 処理: Query 1〜4

gate は以下の 4 クエリを順に評価する。**先行クエリが block なら後続クエリは skip** する。

```bash
# 共通: open Issue を最大 100 件取得 (collision gate 専用の 1 回 gh 呼び出し)
EXISTING=$(gh issue list --state open --label auto-report \
  --json number,title,body,labels --limit 100)
```

`OP_GITHUB_CHANNEL=mcp` (Cloud) では本 fence (`gh issue list`) を実行せず、`github-channel.md` §6
の手順 (`mcp__github__search_issues`、raw body に hidden marker が生存) で取得した JSON を
`EXISTING` として用いる。`issue_read` / `list_issues` の返却 body は marker が sanitize されるため
素材にしない。

##### Query 1: 直接 fingerprint 一致 → block

新 Issue draft の `op-fingerprint` と、既存 open Issue の同 marker が **完全一致** した場合:

```
判定: block
理由: 重複起票確実 (fingerprint = <domain>:<normalized_title>:<primary_file>:<symbol> が完全一致)
```

`EXISTING` から `<!-- op-fingerprint: <VALUE> -->` を抽出し、draft の fingerprint と文字列完全一致で比較する。

##### Query 2: primary_file + symbol 一致 → warn

新 draft の `draft_primary_file:draft_symbol` (4-seg fingerprint の最後 2 segment) と、
既存 Issue の fingerprint から復元した同部分が **完全一致** した場合:

```
判定: warn
理由: 同一実装ファイル + 同一関数/シンボルを対象とする Issue が既に存在 (設計差で fingerprint 全体は別だが実装競合リスク高)
```

ただし `draft_primary_file` が **god file** (複数 Issue で必然的に多 hit するファイル、例:
`op-tools/crates/op/src/commands/scan.rs`) の場合、symbol 一致を AND 条件に入れることで誤検知を
抑制する (symbol が空文字の場合は god file 判定を除外してもよい)。

実害事例で #38 と #42 は fingerprint の symbol 部分が異なるため Query 1 では hit しなかったが、
`primary_file` 部分は `skills/_shared/issue-enrichment.md` 系で重なり得るため Query 2 で warn
になる想定。

##### Query 3: normalized_title 類似度 → warn

新 draft の `draft_title` を normalize (kebab-case 化 + 動詞抽出 + ツール名抽出) した値と、
既存 Issue のタイトルの normalize 値を比較し、以下の **両条件** を AND で満たした場合:

- **Levenshtein 距離 ≤ 3** (Phase 2 で `op-core::dedup` の `levenshtein()` に CLI 化予定、
  Phase 1 では LLM judge で評価)
- **既知の同義語パターン** が一致 (例: `subcommand 実装` ↔ `CLI 化` ↔ `機能追加` / 同ツール名)

両条件 AND にする理由: Levenshtein 単独では短い汎用 verb (`add` / `fix` / `update`) で誤検知が
多発するため、同義語パターン辞書を AND 条件に加えて精度を確保する。

```
判定: warn
理由: タイトルが類似した Issue が既に存在 (Levenshtein 距離 N + 同義語パターン一致)
```

##### Query 4: 同 expert + 同 primary_file 集中 → warn

新 draft の `draft_expert` + `draft_primary_file` の組合せが、既存 open Issue 群で **3 件以上**
同時 hit した場合:

```
判定: warn
理由: 同 expert が同ファイルを対象とする Issue が集中 (実装責務の集中、scope 整理を推奨)
```

---

#### 判定 (block / warn / clear)

| 判定 | 条件 | enrichment / 起票の挙動 |
|------|------|------------------------|
| **block** | Query 1 が hit | Issue 起票を停止。enrichment 結果に `collision_gate: blocked` を付与。人間に「既存 Issue #N と fingerprint 完全一致。起票を見送るか scope 縮小せよ」を提示する |
| **warn** | Query 2 / 3 / 4 のいずれかが hit (Query 1 は非 hit) | Issue 起票は続行。本文末尾に `<!-- op-collision-warning -->` block を追加し、`needs:triage` / `op:potential-collision` ラベルを付与する |
| **clear** | いずれの Query も hit なし | 通常起票。enrichment 結果に `collision_gate: clear` を付与 |

**`--auto` モードの block 判定**: §7.1 の不変則に従い、block 判定でも `--auto` は素通りしない。
`manual_review_bucket` へ退避し、人間レビューを待つ。

---

#### 出力 (enrichment 結果への追加フィールド)

```json
{
  "collision_gate": {
    "verdict": "block | warn | clear",
    "query_hits": ["query_1", "query_2"],
    "similar_issues": [38, 42],
    "similar_reason": "fingerprint 一致 / primary_file + symbol 一致 / normalized_title 距離 2 / expert 集中",
    "gate_version": 1
  }
}
```

`verdict: warn` 時は Output contract (§8) の `enriched_issue.body` 末尾に以下の marker を付加する:

```html
<!-- op-collision-warning -->
query_hit: <query_2 | query_3 | query_4>
similar_issues: [#<N1>, #<N2>]
similar_reason: <"primary_file 一致" | "normalized_title 距離 2" | "expert 集中" 等>
warned_at: <ISO8601>
gate_version: 1
```

また `enriched_issue.labels_to_add` に `needs:triage` と `op:potential-collision` を追加する。

---

#### 反映先

本 gate は以下のすべての呼び出し経路で必ず実行する (§7.1 の呼び出し経路表を継承):

| 呼び出し経路 | gate 実行タイミング |
|-------------|-------------------|
| op-scan 通常実行 | enrichment 完了直後・`gh issue create` 直前 |
| op-scan `--from-issue` | 同上 |
| op-scan `--auto` | 同上 (block 時は `manual_review_bucket` 退避) |
| op-patrol 通常実行 | 同上 |
| op-patrol `--auto` | 同上 |
| op-plan 対話 | enrichment 完了直後・ExitPlanMode 提示前 (block 時はユーザーに提示して停止) |
| `--no-enrichment` flag あり | enrichment 本体を skip しても本 gate は別レイヤーで実行 |

#### intra-batch (同一 run の draft 同士) の重複チェック (#644-D)

Query 1〜4 は **既存 open Issue** との照合のみで、**同一 run で起票しようとしている draft 同士**の重複は
見ない。多 finding を 1 run で起票する場合 (実害: 2026-06-02 に #628/#629 が同じ `merge/verify.rs` を指した) は、
controller が **起票前に batch 内 fingerprint 重複も確認する**:

- batch 内の draft 群について、`op-fingerprint` 完全一致 (intra-batch Query 1 相当) があれば **block** し、
  同一実装を要求する draft を 1 件に統合するか別概念であることを controller が判断する。
- 同 expert + 同 `primary_file` が batch 内に **3 件以上**集中 (intra-batch Query 4 相当) したら **warn** し、
  scope 整理を促す。
- 判定は controller 責務 (起票直前、§7.6 手順 6 の collision gate と同タイミングで batch 内も走らせる)。
  別概念と判断したら分離継続してよい (`op-fingerprint` の symbol 部分が異なれば別 finding)。

**Phase 2 対応 (本 Issue 範囲外)**: Phase 2 で `op gate issue-collision-check --draft-body <FILE>
--repo <OWNER/NAME>` として CLI 化する。Levenshtein 距離計算は
`op-tools/crates/op-core/src/dedup.rs` の `levenshtein()` helper (既存実装) を再利用する。
intra-batch チェック (#644-D) も同 CLI に `--batch-fingerprints <FILE>` 引数で取り込む候補とする。

---

## 7.6 controller オーケストレーション順序 (ADR-0009 Phase C / C4)

enrichment の実行機構を `op-enrichment.js` workflow へ移行したことで、起票前フローは controller (各呼び出し側
SKILL.md の司令官) と workflow に分かれる。**この順序の正本は本節 1 箇所**とし、3 SKILL.md は本節への pointer に
留める (Single Canonical Source、SKILL.md 側へ再分散させない):

```
controller (op-scan / op-patrol / op-plan / op-architect):
  1. severity gate (Critical/High 絞り込み、op-scan/op-patrol)  ← controller 保持
  2. fingerprint dedup (起票候補の重複除外)                      ← controller 保持
  3. [pre-step §4/§6] with_design_plan(bool) / cross_review_experts / task_complexity /
       design_depth / design_roles (motion_enabled∩full で motion-spec 末尾追加) / foundation_exists(軽量 grep→bool) /
       role_models(op-config §9 + override + --quality + foundation_exists=false で token-curation opus 昇格) を解決
       (ADR-0012、§4 Phase 1 additive 1〜5)。
       design_depth 解決時は §4 carve-out (#648-A) を適用する: 明示宣言された a11y-attribute-only / 非視覚 markup fix
       (∩ new_files 空 ∩ domain≠ux-ui/design) は OR 条件ヒットでも `design_depth=none` (判定基準の正本は §4、ここは参照)。
       cross_review_experts の各 reviewer には **`applies_or_post_checks` (bool) を §6 担当表の意味論から付与**する
       (#642): その reviewer が当該 Issue の apply 役 (例: UI 経路の designer-expert) または post-check 役
       (`issue_draft.post_check_expert` に一致、例: ux-ui-audit-expert / security-expert) を兼ねるなら true、
       純粋な品質レビュー役 (例: refactor 検出時の debug/test) なら false。labels_to_add の pro-* 付与可否に効く (§8)。
  4. Workflow({name:'op-enrichment', args:{issue_draft, options, cross_review_experts, task_complexity, today, project_type, design_depth, design_roles, foundation_exists, role_models}})
  5. §8 Output contract を受領 (result: enriched | blocked)
       - blocked → 起票せず escalation_report を提示 (--auto は manual_review_bucket 退避、§7.1)
  6. [post] §7.5 Cross-instance Collision Gate (gh issue list 横断検索)  ← controller 保持 (workflow は gh 不可)
  6.5 [post ADR-0012] foundation_exists==false ∩ 新規 surface → foundation-build Issue を op:foundation-precondition
       ラベル付きで先行起票 (対話 caller のみ。auto は manual_review_bucket)。enforcement は planning-time human
       ordering (op-plan ExitPlanMode 2 段提示 / op-architect skeleton 直後 milestone)。merge gate でなく順序の
       tracking marker (op:blocking-finding は使わない = gate 21 footgun 回避)  ← controller 保持
  7. gh issue create (1 draft = 1 invocation、直列) + labels_to_add 付与   ← controller 保持
  8. post_create_comments[] を 1 Issue = 1 集約コメントに束ねて gh issue comment で投稿 (起票成功後、§8.2 consolidation)  ← controller 保持
```

**境界の根拠**:
- **workflow が担う** (§2 DO の実行機構): Design Plan 生成→gate (BLOCK retry) / cross-review 並列→judge /
  Critical/High 本文統合 / Medium/Low の post_create_comments 分離 / 4 marker 埋込 / §8 enriched_issue 組立。
- **controller が保持** (§2 DON'T + ADR-0009 制約: workflow script は fs/process/gh 不可): severity gate / dedup /
  §7.5 collision gate (gh I/O・`--no-enrichment` でも bypass 不可の別レイヤー) / gh issue create / manual_review_bucket 退避。
- collision gate を controller 保持にすることで、enrichment 本体 (Design Plan/cross-review) を skip しても
  collision gate は必ず走る不変則 (§7.1 / §7.5) を構造的に保証する。

> **`--no-enrichment` 時**: controller は手順 4-5 (workflow 呼出) を skip し issue_draft をそのまま使うが、
> 手順 6 (§7.5 collision gate) は **必ず実行する** (bypass 不可、§7.5)。

### 7.6.1 chat-controller が Workflow tool を呼ぶときの運用 note (#644)

手順 4 の `Workflow({name:'op-enrichment', args})` は **chat Claude (controller) が Workflow tool を呼ぶ**経路で動く。
in-script の named workflow とは戻り値・複数 draft の扱いが異なるため、以下を守る。

- **(A) 戻り値は `.result.*` を掘る**: chat-controller が Workflow tool を呼ぶと background task として起動し、
  task-notification の出力ファイルに `{ summary, logs, result: { ...§8 Output contract }, agentCount }` 形式で
  **`result` でラップ**されて返る。controller は `out.result.enriched_issue` / `out.result.post_create_comments` /
  `out.result.review_summary` を読む (`.enriched_issue` 直アクセスは空振りする)。
- **(B) 複数 draft の委譲経路**: op-enrichment は **per-Issue invocation** (1 draft = 1 呼び出し)。chat-controller が
  N draft を enrichment する場合は **per-draft で Workflow tool を N 回呼ぶ** (N 通知を容認する) のが blessed な既定経路。
  N 通知を 1 通知に束ねたい場合のみ、controller が薄い fan-out wrapper workflow を **その場で自作してよい**が、
  per-Issue の op-enrichment 契約 (本節 §7.6) は変えない (wrapper は op-enrichment を N 回呼ぶだけの薄い層に留める)。
- **(C) body 受け渡し**: per-draft で Workflow tool を呼ぶ場合、`issue_draft.body` は **args に JSON 文字列**として
  渡せば backtick / code fence もそのまま入る (問題なし、推奨)。(B) の fan-out wrapper に body を埋め込む場合は、
  markdown の backtick が **template literal と衝突**するため、template literal ではなく **single-quote 行配列**で
  body を組み立てる (`['行1', '行2', ...].join('\n')`)。per-draft 直渡しを選べばこの衝突は起きない。

---

## 8. Output contract (呼び出し側に返す)

```json
{
  "result": "enriched | blocked",
  "enriched_issue": {
    "title": "<入力 title を必要に応じ調整>",
    "body": "<指示書フル版 + Design Plan (UI 影響時) + Critical/High 反映済 + hidden markers>",
    "labels_to_add": ["pro-ux-ui-audit-expert", "pro-security-expert", "..."],
    "task_complexity": "routine | extension | design | integration | api-design"
  },
  "post_create_comments": [
    {
      "severity": "medium | low",
      "category": "<short_label>",
      "body": "<起票後コメント本文 (Markdown)>"
    }
  ],
  "review_summary": {
    "loops_executed": 1,
    "critical_high_addressed": 3,
    "medium_low_count": 5,
    "design_plan_status": "generated | skipped | failed | blocked",
    "cross_review_status": "passed | passed_with_changes | failed | blocked | skipped"
  },
  "escalation_report": {
    "reason": "design_plan_block | cross_review_block | max_loops_exceeded | spawn_failure_strict",
    "blocking_findings": [],
    "human_action_required": "<1-2 sentence>"
  }
}
```

### 各フィールドの責務

- **`result`** — `enriched` なら呼び出し側はそのまま `gh issue create`、`blocked` なら起票せず
  escalation_report を人間に提示 (`--auto` 時は `manual_review_bucket` 退避)
- **`enriched_issue.title`** — 入力 title をそのまま、もしくは review で title 修正提案があった
  ときに調整した最終 title
- **`enriched_issue.body`** — 指示書フル版 Markdown。UI 影響時は `## Design Plan` 節を含む。
  hidden marker は本文冒頭に配置 (§9 参照)
- **`enriched_issue.labels_to_add`** — 検出 expert (`recommended_runner`) + **apply / post-check 役を兼ねる
  cross-reviewer** の `pro-*` ラベル群 (#642)。`pro-*` は「この expert の作業 (apply / post-check) が必要」を
  意味する signal であり、**純粋な品質レビュー役 (apply も post-check もしない cross-reviewer) には付けない**。
  - 例 (UI 経路): feature-expert 検出 + designer (apply 役) + ux-ui-audit (post-check 役) + security cross-review
    → `pro-feature-expert` + `pro-designer-expert` + `pro-ux-ui-audit-expert` (designer/ux-ui-audit は apply/post-check
    役なので付与。security は純粋な品質レビューなら付与しない)
  - 例 (非 UI 経路): refactor-expert 検出 + debug / test cross-review (いずれも品質レビュー役のみ)
    → `pro-refactor-expert` のみ (`pro-debug-expert` / `pro-test-expert` は付けない)
  - reviewer が apply / post-check 役かは **controller が §6 担当表の意味論から
    `cross_review_experts[].applies_or_post_checks` (bool) で workflow に注入**する (§7.6 手順3)。workflow は
    この flag を見るだけで heuristic を持たない。flag 未注入 (旧 caller) の reviewer は `false` 扱い = ラベルを
    付けない安全側に倒す (over-label がバグ本体のため、迷ったら付けない = noise を出さない)。
  - op-run の実 routing は marker (`op-run-expert` / `op-post-check-expert`) 優先で壊れない。ラベルは人間 /
    filter の判断材料なので、品質レビュー役の `pro-*` を外すことで「debug/test 作業が必要」という誤認 noise を減らす。
- **`enriched_issue.task_complexity`** — Phase 1 と並行で推論した task_complexity 区分。op-run apply
  フェーズが spawn 時の model 選択に利用する。区分の意味は `_shared/model-selection.md` (>=1) §2
  を参照。確信度低時の暫定値は `extension`
- **`post_create_comments`** — Medium/Low 指摘の起票後投稿用。空配列でも返す。**投稿は 1 件 = 1 コメントではなく
  controller が 1 Issue = 1 集約コメントに束ねる** (consolidation 規約は §8.2、spam 防止)
- **`review_summary`** — 監査ログ / debug 目的のメタ情報。`loops_executed` は実行された
  cross-review ループ数 (Design Plan gate は含めない)
- **`escalation_report`** — `result == "blocked"` のときのみ意味を持つ。`enriched` のときは
  null または省略

### C4 additive 拡張 (workflow 化に伴う非破壊追加、§12 基準で非破壊)

- **`escalation_report.reason`** に `unexpected_error` を追加 (workflow body の try/catch fail-safe、§10)。
  既存 enum (`design_plan_block` / `cross_review_block` / `max_loops_exceeded` / `spawn_failure_strict`) は不変。
- **op-architect 向け additive 戻り値** `design_plan` (確定 Design Plan の Markdown 文字列) / `apply_expert`
  (`designer-expert` | `feature-expert`) を workflow が返す。標準 3 caller (op-scan/op-patrol/op-plan) は
  enriched_issue.body 埋込済の Design Plan を使うため無視してよい。op-architect フェーズ 4.6 は
  `with_cross_review: false` で呼び、この 2 field でフェーズ 5-1 本文埋込 / `op-run-expert` marker 転写を行う。

### 8.1 Issue 本文の書き方ポリシー (自然文許容)

enrichment 層は **テンプレ厳格化スキルではない**。`enriched_issue.body` は以下の方針で生成する:

- `_shared/pr-templates.md` の指示書フル版テンプレを **骨格** として使う (op-run が読める保証)
- ただし各セクションの **内部記述は自然文で OK** (箇条書き強制 / セクション順序強制 /
  過度な定型句 / 機械生成感を出さない)
- Design Plan セクションは「**UI 影響時のみ存在**」(条件分岐 OK、§4 の判定通り)
- cross-review 指摘の反映は **本文に自然に溶け込ませる** (「Cross-Review Result:」のような
  独立節を強制しない、ただし hidden marker で機械可読性は確保)
- 起票後コメント (Medium/Low 指摘) は別投稿 (`post_create_comments`) → 本文の肥大化を避ける
- Critical/High 指摘の反映先は **該当する既存節** (例: success_criteria への追加、scope_files
  への追加、verification_steps への追加)。新節を生やすのは反映先が既存節に収まらない場合のみ

→ 「自然に読める Issue + 機械が読める marker」の二層構造。テンプレに過度に縛ると Issue が
読みにくくなり、人間レビューでの違和感検出能力が落ちる。

### 8.2 post_create_comments の consolidation / cap 規約 (#643)

`post_create_comments[]` は Medium/Low 指摘を 1 件 1 要素で返すが、**起票後の投稿は controller が
1 Issue = 1 集約コメントに束ねる**。件数制御がないと 1 Issue に大量の個別コメントが付き spam になる
(実害: 2026-06-02 op-scan で 1 Issue に 12 件返却)。投稿方針を以下に正本化する。

**責務分担** (§7.6 境界): consolidation は **controller の責務** (gh I/O を伴うため workflow には置かない、
§2 DON'T)。enrichment workflow は `post_create_comments[]` を分離して返すまでが責務で、束ね方は関与しない。

**consolidation 規約 (controller)**:

- 1 Issue の `post_create_comments[]` を **1 コメントに集約**して投稿する (`gh issue comment` を 1 回)。
- 集約コメントは **severity / category 別セクション**でまとめ、各指摘の severity・category・本文を欠落させない
  (情報ロスなし)。
- 集約コメント冒頭に「**Critical/High は本文に統合済み**。本コメントは Medium/Low の参考指摘」と明記し、
  本文との二重掲載に見えないようにする。
- `post_create_comments` が空配列なら投稿しない。

**cap 規約 (enrichment workflow、no-silent-cap)**:

- Medium/Low を返す件数に soft cap (default 上位 **10 件**) を設けてよい。cap を適用したら **省略件数を
  可視化**する (集約コメント末尾に「他 M 件省略」を明記、silent truncation 禁止 = no-silent-cap 原則)。
- cap は「総量を抑える」目的であり、severity / category の偏りで重要指摘が落ちないよう、cap 適用時は
  Medium を Low より優先して残す。

**caller 別**:

- **op-scan** (normal / `--from-issue` / `--from-merged-pr`): 上記 consolidation を適用 (1 Issue = 1 集約コメント)。
- **op-plan**: 同様に 1 Issue = 1 集約コメントに束ねる。
- **op-patrol**: `post_create_comments` を **投稿しない** (Critical/High only 方針を維持、`op-patrol/SKILL.md §5.5-4`)。
  enrichment が返してきても無視するため consolidation は不要 (空配列扱いと同等)。
- **op-architect**: フェーズ4.6 は `with_cross_review: false` で呼ぶため `post_create_comments` は空配列。

---

## 9. Hidden marker

`enriched_issue.body` の冒頭 (タイトル直後 / 既存 marker 群と同じブロック内) に以下 4 種の
HTML コメント marker を追加する。Phase 2 で `op-tools/crates/op-core/src/markers/enrichment.rs`
に対応する Rust 型が追加される (`SCHEMA_VERSION: u32 = 2` / `PROSE_SOURCE: "_shared/issue-enrichment.md"`)。
Phase 2 時点の schema_version (2) と coordinate する (ADR-0003 silent fork 防止)。

```html
<!-- op-enriched: true -->
<!-- op-enrichment-loops: <N> -->
<!-- op-enrichment-design-plan: generated | skipped | failed | blocked -->
<!-- op-enrichment-cross-review: passed | passed_with_changes | failed | blocked | skipped -->
```

### 各 marker の意味と value 集合

#### `op-enriched: true`

- **意味**: 本層を通過した Issue であることのマーキング。op-merge / op-run / その他 OP skill
  が「未 enrichment Issue」と「enriched Issue」を識別するために使う
- **value 集合**: `true` のみ (false を埋めない方針 — 未 enrichment Issue は marker 自体を
  持たない)

#### `op-enrichment-loops: <N>`

- **意味**: 実行された cross-review ループ数 (Design Plan gate は含めない、§7 参照)
- **value 集合**: 非負整数 (例: `0` (cross-review skip) / `1` / `2`)
- **format**: 整数のみ、空文字 / 負数 / 非整数は schema-check で error

#### `op-enrichment-design-plan: <status>`

- **意味**: Design Plan 生成 + gate の最終 status
- **value 集合**:
  - `generated` — designer-expert + ux-ui-audit gate が PASS / PASS_WITH_NOTES で完了
  - `skipped` — UI 影響なし or `with_design_plan = "false"` で skip
  - `failed` — spawn 失敗 + strict=false で warning 継続 (Plan を Issue に埋め込めなかった)
  - `blocked` — gate BLOCK 3 連続 (本層全体の result は `blocked`)

#### `op-enrichment-cross-review: <status>`

- **意味**: cross-review の最終 status (全 expert を集約した最大値、§7 の集約ルールに従う)
- **value 集合**:
  - `passed` — 全 expert approve
  - `passed_with_changes` — Critical/High 指摘を本文に反映後 approve に収束 (changes_requested
    から修正反映 → 再 review で approve になったケースを含む)
  - `failed` — **全 reviewer spawn 失敗の non-strict graceful degrade** (review signal ゼロ = 品質未確認のまま
    生成済み Design Plan を救って起票、本層全体の result は `enriched`、#647 b-2)。`blocked` と異なり起票は進むが、
    cross-review が機能しなかったことをこの marker で可視化する (un-reviewed 起票の masking 回避)
  - `blocked` — いずれかの expert が block (本層全体の result は `blocked`)
  - `skipped` — `with_cross_review = "false"` or auto で severity 不足により skip

### 注意点

- 4 marker は **全て 1 Issue あたり 1 件ずつ** 埋め込む (`op-enriched: true` を持つなら
  残り 3 件も必須)
- value enum は Rust 側 `MarkerSchema::ALLOWED_VALUES` と一致させる (ADR-0003 silent fork 防止)。
  prose 側の表記と Rust 側の表記がズレた場合は `op core schema-check --lens rust-drift` で
  finding が上がる

詳細な marker schema (name / owner / consumer / core semantics) は Phase 2 完了後に
`_shared/markers/labels-and-markers.md` に追記される (本 Phase 1 では markers/labels-and-markers.md
は触らない)。

---

## 10. Failure modes

enrichment 層は **部分失敗を許容する** (デフォルト)。`options.strict = true` のとき、
部分失敗でも全体を中断する。

| 失敗種別 | デフォルト (strict=false) | strict=true |
|---------|--------------------------|-------------|
| designer-expert spawn 失敗 | warning + Design Plan skip、enrichment continue。marker: `op-enrichment-design-plan: failed` | enrichment 中断、`result: blocked` / `reason: spawn_failure_strict` |
| ux-ui-audit gate spawn 失敗 | warning + Design Plan を no-gate で埋め込み continue。marker: `op-enrichment-design-plan: failed` | 同上 |
| ux-ui-audit gate BLOCK 連続 3 回 | enrichment 中断 (strict 関係なく)、`result: blocked` / `reason: design_plan_block`。BLOCK は意図的な品質判定であり warning にできない | 同左 |
| cross-review expert 一部 spawn 失敗 (生存 reviewer あり) | warning + 残った review 結果で集約判定。`review_summary` に失敗 expert を記録 | enrichment 中断、`reason: spawn_failure_strict` |
| cross-review 全 reviewer spawn 失敗 (`reviews.length === 0`) | **graceful degrade** (#647 b-2): 生成済み Design Plan を救い `result: enriched` で起票継続。`review_summary.cross_review_status: "failed"` + marker `op-enrichment-cross-review: failed` で「review 不能のまま起票した」ことを可視化 (un-reviewed 起票の masking 回避)。non-strict は自動フローを止めない思想 (不変則3) に整合 | enrichment 中断、`reason: spawn_failure_strict` (= 一部失敗 strict と同経路で先行中断、strict はこの全滅経路に来ない) |
| cross-review が block を返した | enrichment 中断 (strict 関係なく)、`result: blocked` / `reason: cross_review_block` | 同左 |
| max_review_loops 到達後も changes_requested | `result: enriched` で完了 (現状のループ結果を採用、本文反映済の Critical/High はそのまま) | `result: blocked` / `reason: max_loops_exceeded` |
| 上記いずれも該当しない予期せぬ panic / 例外 | warning ログ出力 + `result: blocked` で fail-safe (人間判断に倒す) | 同左 |

### 注意点

- **strict=false でも block 判定 (Design Plan gate BLOCK / cross-review block) は強制中断**
  する。block は「品質的に不適格」を意味する明示的判断であり、warning に降格できない
- **strict=true は cost が読めない Issue 起票を防ぐためのオプション**。default は false
  (運用継続性優先)
- 失敗時の marker 値は §9 の enum 集合に従う。Rust 型側で許容されていない値を埋めると
  `op core schema-check --lens rust-drift` で error
- **(C4) workflow 挙動保存の不変則**: 本表 8 mode の挙動は `workflows/op-enrichment.js` が**完全保存**する
  (workflow 化は実行機構の差替であり §10 挙動を変えない = §12 基準で非破壊)。具体的には: cross-review の
  spawn 失敗は **index-zip で失敗 reviewer を特定**し (filter で握り潰さない)、non-strict は生存 reviewer で集約・
  strict は `spawn_failure_strict` 中断。**生存 reviewer がゼロ (全滅) の non-strict** は `result: enriched` で
  起票を継続し (生成済み Design Plan を救う graceful degrade、#647 b-2)、`cross_review_status: "failed"` +
  marker `op-enrichment-cross-review: failed` で review 不能を可視化する (strict 確定経路ではないので
  `spawn_failure_strict` は使わず、起票継続が non-strict の「自動フローを止めない」思想に整合)。block 判定
  (gate BLOCK 3連続 / cross-review block) は strict 無関係で即 `result: blocked`。「上記いずれも該当しない
  予期せぬ panic / 例外」は workflow body の **try/catch** が捕捉し `result: blocked` / `reason: unexpected_error`
  で fail-safe する (§8 additive)。これらは段階1.5 logic harness で全 mode を回帰検証する。

---

## 11. Cost-control

enrichment 層は **expert spawn を伴うため計算コストが高い**。以下のデフォルトで cost を抑制する:

| 項目 | デフォルト | 説明 |
|------|-----------|------|
| Design Plan 生成 | UI 影響時のみ | §4 の判定に該当しない Issue では designer-expert / ux-ui-audit を spawn しない |
| cross-review (`with_cross_review = "auto"`) | severity `high` 以上のみ | medium / low / n/a の Issue では cross-review を skip |
| `max_review_loops` | 2 | 初回 + 再 review 1 回まで。3 回目の再 review は走らない |
| 各 expert spawn timeout | 60 秒 | timeout は失敗扱い (§10 strict / non-strict ルール) |
| 並列度 | cross-review は最大 3 並列 | §6 担当表上、最大 3 expert を並列 spawn |

### 1 Issue あたりの最大 spawn 数 (default、design_depth 別、ADR-0012)

ADR-0012 で Design Plan 生成が役連鎖 (token-curation → component-selection → layout-composition → (motion-spec))
に分解されたため、Design Plan フェーズの spawn 数は `design_depth` / `design_roles` の長さで決まる
(pre-ADR-0012 の flat 見積り「Design Plan 2」は廃止し、以下に置換):

| design_depth | Design Plan 役 | gate | Design Plan 計 |
|---|---|---|---|
| `full` (motion_enabled=false) | 3 (token/component/layout) | +1 ux-ui-audit | **4 spawn** |
| `full` (motion_enabled=true)  | 4 (+motion-spec) | +1 | **5 spawn** |
| `light` | 2 (token/layout) | +1 | **3 spawn** |
| `none` | 0 (Design Plan skip) | 0 | **0 spawn** |

- 役連鎖は逐次 (serial)。BLOCK retry は `resolveRetryStartIndex` で遡及開始役のみ再 spawn (最悪 design_plan_loop 3 round)。
- cross-review は `cross_review_experts.length` (最大 3) × `max_review_loops` (default 2)。

組み合わせの上限例:

- UI 影響あり + severity high+ + full: Design Plan 4〜5 + cross-review 3×2 = **最大 10〜11 spawn**
- UI 影響あり + severity high+ + light: Design Plan 3 + cross-review 3×2 = **最大 9 spawn**
- UI 影響なし + severity high+: cross-review 2×2 = **最大 4 spawn**
- severity medium 以下: 0 spawn (本層は marker のみ埋め込んで pass-through)

### op-explore playground を重ねた場合の worst-case と hard cap (ADR-0013 決定I)

op-explore (phase -1 発散スキル、ADR-0013) は `playground_mode (none | thin | full)` で本 enrichment の
**前段**に N パターン視覚生成を挟む。playground spawn は enrichment の役連鎖とは別レイヤー
(`workflows/op-explore-render.js`、gating は op-explore SKILL.md controller pre-step が正本) だが、
**spawn cost 上限の正本は本節に集約する** (Single Cost Ledger。`playground_mode` 自体は enrichment が消費しない
直交軸ゆえ §3/§4 options には足さない = 決定F)。

- **playground_mode=none**: 追加 spawn 0 (そのまま op-plan→enrichment へ)。大多数。
- **playground_mode=thin**: 司令官が designer-expert を **1 体手動 spawn** (+1)。
- **playground_mode=full**: N パターン並列生成 (`max_patterns` default 2 / **絶対上限 3**) + decision-matrix judge 1。

**worst-case 絶対値** = `full × N=3 × 役連鎖 + self-critique 1 pass ≒ 16 spawn` = 現行 enrichment 上限 8 の **2 倍**:

| 内訳 | spawn |
|------|-------|
| token-curation (全 pattern 1 回**共有**、foundation 共通) | 1 |
| art-direction 分岐 = layout/component 層のみ N=3 倍 | 約 6〜9 |
| decision-matrix judge (順位なし・構造化のみ) | 1 |
| mode collapse 時の再発散 1 回分 | +N (最大 +3) |
| self-critique refine 1 pass (Wave4、default **off**) | +N |

- **hard cap (拒否条件)**: `N=3 ∩ self-critique on` は budget 超過として**拒否**する (どちらか一方に絞る)。
  `max_patterns` 未注入時は `pattern_count=1` の安全側 default。`auto` caller (op-scan/op-patrol 由来) は
  `full → thin/none` に downgrade する (playground は Direct 専用、防御的明示)。
- **削減構造 (必須前提)**: token-curation (foundation token) は **全 pattern で 1 回だけ共有**し、art-direction 分岐は
  **layout/component 層のみ N 倍**する。token-curation を pattern ごとに回すと N 倍コストが foundation に乗り
  「コスト削減機構がコストを生む」自己矛盾を踏むため禁止。
- mode collapse (N 案が無難に収束) 時の再発散 1 回分も budget に含める (上記表の +N)。

### 過剰 cost 検出時の対応

呼び出し側スキルは、enrichment 実行前に「enrichment cost > 期待値」と判断したら
`with_design_plan = "false"` / `with_cross_review = "false"` で本層を呼び出すか、本層を
skip して直接起票することができる (本層は呼び出し義務を呼び出し側に課さない)。

---

## 12. schema_version pin

本ファイルの schema_version は **2 (v2 bump: 2026-05-16, §7.5 追加)** で固定する。
`_shared/version-check.md` の段階移行プロトコルに従い、破壊的変更が発生した時点で bump する。

### 本ファイルの schema_version を要求する呼び出し側 SKILL.md

各 SKILL.md は「参照ドキュメント」節で `(>=N) _shared/issue-enrichment.md` を pin する。

> **(>=1) → (>=2) 移行は C4 (ADR-0009 Phase C) で全清算済**。C4 で §5/§6 を `op-enrichment.js` workflow へ
> 移行する際、4 caller 全ての pin を `(>=2)` へ統一した。schema_version は **2 のまま据置** (spawn 機構の差替 +
> additive 拡張は §12 基準で非破壊、§10 挙動は workflow が保存)。

- `skills/op-plan/SKILL.md` **(>=2)** — 更新済み (2026-05-16)
- `skills/op-scan/SKILL.md` **(>=2)** — C4 で更新済
- `skills/op-patrol/SKILL.md` **(>=2)** — C4 で更新済
- `skills/op-architect/SKILL.md` **(>=2)** — C4 で更新済 (フェーズ 4.6 を本ファイル + `op-enrichment.js` への
  委譲に書換、Design Plan 生成→gate を workflow 経由に統一)

### 破壊的変更の判定基準

`_shared/version-check.md` L46-58 に従う。本ファイルの場合は具体的に以下を破壊的変更と扱う:

- Input contract (`issue_draft` / `options`) の必須 field 削除 / rename / 型変更
- Output contract (`result` / `enriched_issue` / `post_create_comments` / `review_summary` /
  `escalation_report`) の必須 field 削除 / rename / 型変更
- §9 marker 4 種の name / value enum の削除 / rename / 縮小 (追加は非破壊)
- §4 UI 影響判定の条件削減 (条件追加は非破壊)
- §6 cross-review 担当表からの expert 削除 (追加は非破壊)
- §10 Failure modes の挙動変更 (warning → 中断、または逆方向)

追加 / 拡張 (新 option / 新 marker / 新 review 担当 / etc.) は **非破壊** として扱い、
schema_version は bump しない (note 行のみ追記)。

---

## 13. 参照する既存正本

各エントリの `(>=N)` は本ファイルが前提とする最低 schema_version。

- `~/.claude/skills/_shared/expert-spawn.md` **(>=11)** — subagent prompt 規約 / canonical
  spawn schema。Design Plan / cross-review の spawn は C4 で `workflows/op-enrichment.js` の
  `agent()` 呼出へ移行したが、prompt 規約 (read-only audit パターン 1、OP-managed Mode) は本契約に従う
- `~/.claude/skills/_shared/active-expert-registry.md` **(>=2)** — spawn 対象 expert の単一
  正本。本ファイル §6 の cross-review 担当表は本 registry の active expert (9 体) のみを使う
- `~/.claude/skills/_shared/planned-experts.md` — planned (未実装) expert 一覧。
  spec / release / env / compatibility は cross-review 担当に **指定しない**
- `~/.claude/skills/_shared/markers/labels-and-markers.md` **(>=4)** — marker / label 名の
  正本。本ファイル §9 で定義する enrichment 系 4 marker の name / owner / consumer / core
  semantics の entry は **Phase 2 で本ファイルから別 PR で追記** される予定 (本 Phase 1 では
  追記しない、schema_version は据え置き)
- `~/.claude/skills/_shared/severity-rubric.md` **(>=1)** — severity 判定の正本。本ファイルは
  受け取った severity を再判定しないが、cross-review で新規発見した finding を Critical /
  High / Medium / Low に分類する際の判断基準として参照する
- `~/.claude/skills/_shared/pr-templates.md` **(>=8)** — Issue 本文の指示書フル版テンプレ
  (骨格)。Design Plan / UX/UI Audit Gate Result の Markdown テンプレも本ファイルから参照
- `~/.claude/skills/_shared/auto-policy.md` **(>=1)** — `--auto` モードでの起票判定 8 条件。
  本ファイル §7.1 で block 判定時に `manual_review_bucket` へ退避する規約と整合する
- `~/.claude/skills/_shared/invocation-mode.md` — Direct / OP-managed Mode 判定。本ファイルが
  spawn する全 expert は OP-managed Mode 起動を明示する
- `~/.claude/skills/_shared/runtime-contract.md` — runtime spawn 境界 / routing metadata 規約。
  本ファイルの spawn 経路は runtime-contract.md の active expert 限定原則に従う
- `~/.claude/skills/_shared/model-selection.md` **(>=1)** — Phase × Expert × complexity → model
  mapping の正本。本ファイルの Phase 1 並行 task_complexity 推論と Output `enriched_issue.task_complexity`
  field は本 pointer 先の §2 を参照する (区分定義・暫定値・推論材料の正本)
- **`skills/op-architect/SKILL.md` フェーズ 4.6** — Design Plan 生成 + gate を呼び出す caller の 1 つ。
  **C4 で本ファイル + `workflows/op-enrichment.js` への委譲に refactor 済** (`with_cross_review: false` で
  Workflow を呼び、additive 戻り値 `design_plan` / `apply_expert` を受領)。Design Plan 生成 + gate ロジックの
  **正本は本ファイル** (op-architect 側に重複定義は持たない、逆方向 pointer は書かない)。
  op-architect は Dynamic Workflows capability preflight を持つ (workflow 不可環境では hard-fail)。

### 本ファイルが正本となる範囲 (Single Canonical Source Rule)

以下の概念は本ファイルが単一正本である:

- Issue Enrichment 層の Input / Output contract
- UI 影響判定の heuristic (拡張子 / path pattern / runner / domain)
- Design Plan + gate の spawn 契約 (op-architect から移植、Phase 3 以降は op-architect 側が
  本ファイルを参照)
- cross-review 担当表 (検出 expert → review 担当 2-3 expert のマッピング)
- enrichment 系 4 marker の name / value enum / 意味
- Failure modes と strict / non-strict 切り替えポリシー

これらに関する他ファイルの記述は **本ファイルへの pointer / summary に限定** する
(重複定義禁止、Single Canonical Source Rule)。

---

## 14. 履歴

- **2026-05-16**: schema_version 2。§7.5 Cross-instance Collision Gate を追加 (Refs #80)。
  op-plan / op-scan / op-patrol の Issue 起票直前に fingerprint 横断検索 gate を必須化。
  Query 1 (fingerprint 完全一致 → block) / Query 2 (primary_file + symbol 一致 → warn) /
  Query 3 (normalized_title 類似度 → warn) / Query 4 (expert + file 集中 → warn) の 4 クエリで
  cross-instance collision を検出する。`--no-enrichment` flag でも gate は bypass 不可。
  op-plan/SKILL.md の参照を (>=2) に更新済み。op-scan/op-patrol/op-architect/SKILL.md も更新済み。
- **2026-05-11**: schema_version 1 で初版。`docs/proposals/2026-05-10-issue-enrichment-and-op-plan.md`
  Phase 1 として作成。op-architect フェーズ 4.6 (Design Plan + gate) を本ファイルに移植し、
  cross-review (検出 expert 以外の関連 expert による read-only review) を新規追加。
  op-architect 側の pointer 化は Phase 3 で実施予定。Phase 2 (CLI Rust marker 追加) と
  coordinate するため schema_version: 1 を初版として固定。
