<!--
schema_version: 4
last_breaking_change: 2026-06-14
notes: v4 (2026-06-14, Refs #720) — §7.1.3 に「investigate-phase 例外 (doc-only small)」を追加。
       **破壊的変更の所在**: 「sensitive glob 該当 = 全 phase Opus 強制」という既存 behavioral invariant を
       investigate (lens-audit) phase に限り意図的に解除する (§7.1.4 と同型の invariant 解除)。
       sensitive ∩ doc-only (CUMULATIVE_NONDOC==0) ∩ small (LOC≤OP_REVIEW_SMALL_MAX_LOC) ∩ --quality≠high
       ∩ kill switch 不在 ∩ degrade 不在 を満たす狭い PR に限り investigate (lens-audit) phase のみ Sonnet へ
       解除できる例外条項を新設 (§10「model 選択の Opus 保証 invariant を narrow 条件で解除」に相当)。
       REVIEW_MODEL 自体は Opus 据置 (escape hatch 互換)、verify/gate/backstop は Opus 固定、lens floor も
       full 7-lens 維持。§7.1.7 per-phase model table に同例外を反映。
       consumer (global-review-spawn.md) の pin を (>=4) に同期すること。
       bash 実装は global-review-spawn.md §4-1-b (判定) / §4-2-a-pre (investigate-only 差し替え)。
       本番化は Issue #720 の Ladder4 recall 実証を merge gate とする。
       v3 (2026-05-23) — §7.1「review-expert narrow opt-down」新設 (Refs #493)。
       review-expert は §5.1 主表で全 PR 無条件 Opus 固定、§7 で `--quality low` でも
       Opus 維持の merge gate 例外保護を受けていた。v3 では base mapping (Opus) は維持しつつ、
       「LOC≤100 ∩ 非センシティブ glob 不該当 ∩ --quality high 不指定 ∩ kill switch 不在 ∩
       degrade 不在」の 5 条件 AND を満たす **狭い** PR に限り Sonnet へ opt-down する例外節
       (§7.1〜§7.1.6) を additive に追加。§6 controller 決定フローに step 2a (narrow opt-down 評価)
       を挿入。**破壊的変更の所在**: §7.1.4 で `small ∩ non-sensitive ∩ --quality low` を Sonnet
       にする挙動が、現行 §7 L312-317 の「`--quality low` でも review-expert は Opus 維持」という
       既存 invariant を small∩non-sensitive PR に限り意図的に解除する (§10「--quality flag 値の
       挙動変更」に該当)。consumer (op-run / expert-spawn.md) の pin を (>=3) に同期すること。
       v2 (2026-05-21) — §5.5「code-review effort-level 自動判定」新設 (Refs #367)。
       Claude Code v2.1.146 で /simplify が /code-review に rename + optional effort-level 引数追加。
       本ファイルが既に持つ task_complexity / area_complexity / --quality の 3 軸から effort-level
       (low / medium / high) を **派生** させる canonical mapping を新規節として追加。
       既存軸の定義 (§2 / §3 / §4 / §7) は変更しない (新規軸を増やさず組合せで派生)。
       expert-spawn.md v16 の `code_review_effort` field が本節の派生値を転写する。
       v1 (2026-05-13) — OP skill 軍の model 選択 (Opus / Sonnet / Haiku、具体 version は §1) の canonical 正本。
       Phase × Expert × complexity の 3 軸 mapping、task_complexity / 区画 complexity 区分、
       複雑度シグナル定義、--quality flag 仕様、override 優先順位を集約する。
       本ファイルは markdown 仕様のみ提供し、CLI 化 (op-core 翻訳) は別 Phase に倒す。
       Single Canonical Source Rule に従い、model 選択ルールの正本は本ファイルのみ。
       expert-spawn.md / issue-enrichment.md / active-expert-registry.md からは pointer 参照とする。
-->

# Model Selection: Phase × Expert × Complexity → Model

/**
 * 機能概要: OP skill 軍 (op-plan / op-scan / op-patrol / op-architect / op-run / op-merge) が
 *           各フェーズで spawn する expert subagent に対し、Opus / Sonnet / Haiku のどれを
 *           model として割り当てるかを決める canonical 正本。
 * 作成意図: agent frontmatter の model: sonnet 固定では、判断不可逆性が高い review / post-check や
 *           design 系の生成・統合フェーズで品質が頭打ちになる。一方で全 Opus 化は op-scan の
 *           広域並列 audit で並列爆発する。Phase × Expert × complexity の 3 軸で decision table 化し、
 *           「単発 × 不可逆 × 深い推論」のみ Opus に集中させる分業を定義する。
 * 注意点: 本ファイルは仕様正本。CLI / Rust 翻訳は別 Phase (op-core にて `op model decide` を実装予定)。
 *         model 決定は controller の直列フロー (§6 を参照): mapping lookup → --quality → explicit override → spawn。
 *         agent frontmatter の model: は Direct Mode の default として残し、OP-managed Mode では
 *         controller が決定した値が渡される (frontmatter は無視される)。本 PR は仕様 canonical 化のみで、
 *         SKILL.md の Agent spawn テンプレへの `model:` field 注入は follow-up Phase (§11 参照)。
 */

OP skill 軍が spawn する expert に対し、どの model (Opus / Sonnet / Haiku、具体 version は §1) を割り当てるかの
canonical 正本。**Phase × Expert × complexity の 3 軸** で割当を決める。

---

## §1 model 階層 (Opus / Sonnet / Haiku)

3 model を以下の役割で使い分ける:

| Model | 具体 version (唯一正本) | 強み | 適用フェーズの特徴 |
|---|---|---|---|
| **Opus** | Opus 4.8 | cross-cutting 推論、仮説立て、全体調和判断、空間認識的推論 | 単発 / 判断不可逆 / 深い推論 / design 系生成・統合 |
| **Sonnet** | Sonnet 4.6 | pattern マッチ + 軽い推論、rubric 適用、既存パターン模倣 | 広域並列 audit / routine 実装 / 検出系 |
| **Haiku** | Haiku 4.5 | 形式照合、決定論的検査 | 慎重利用 — false negative 許容ケース (test rubric 適用等) のみ |

> **Single Canonical Source Rule (model tier の具体 version)**: 本 §1 table の「具体 version」列が
> model tier の minor version の **唯一の正本**。本ファイルの他節 / 他ファイルは minor version を
> 書かず、論理名 (`Opus` / `Sonnet` / `Haiku`) のみで参照する。将来の model bump は本 table 1 行の
> 更新のみで完結させ、参照箇所の churn を構造的にゼロにする (案A、Refs #561)。
> 論理名がどの version を指すかは常に本 §1 を参照する。

**design 系 (designer / ux-ui-audit) の検出フェーズに Haiku を使うのは false negative リスクで避ける**
(視覚 / token 違反検出にも空間認識的推論の下支えが必要なため)。

---

## §2 task_complexity 区分 (op-run 実装フェーズ向け)

op-run で cluster 化された Issue を実装する際の task 複雑度区分:

| 区分 | 意味 | 例 |
|---|---|---|
| `routine` | 既存パターン直適用 | token / rename / 典型 null チェック / clippy 修正 |
| `extension` | 既存パターン拡張 | 既存 endpoint に field 追加、既存 hook の拡張 |
| `design` | 新規設計含む | 新規 feature 設計 / 新規 domain object / 新規 workflow |
| `integration` | silent fork 統合 / cross-module 横断 | 重複実装の統合点設計、多 module 同期変更、migration 同時実装 |
| `api-design` | API 契約 / 後方互換 / 拡張点判断 | 公開 API 変更、契約設計、命名規約決定 |

task_complexity は **Issue 単位の属性**であり、cluster 全体で揃うとは限らない。cluster の **dominant
complexity** (最も重い Issue の complexity) が cluster 全体の model を決める。

推論主体: `issue-enrichment.md` の手順 (Opus 単発) が Issue body / 既存資産 / 影響範囲から推論し、
spawn schema の `task_complexity:` field に格納する。

---

## §3 区画 complexity 区分 (op-scan / op-patrol audit 向け)

監視対象の区画 (file / module / directory) の複雑度区分:

| 区分 | 意味 |
|---|---|
| `single` | 単純 CRUD / 形式的 component / fixture / config |
| `typical` | 標準的 service / view / hook |
| `complex` | concurrent / state machine / domain logic が重い / 多依存 |
| `critical` | auth / payment / migration / 中心 API / core service |

判定主体:

- `critical` は **domain_tag** (project 設定 `op-config.yaml`) で明示する。
- `complex` は **§4 機械シグナル + LLM 軽判断** の組合せ (例: `cyclomatic >= 15 OR dep_centrality >= top10%`)。
- `single` / `typical` は残余として割当てる。

---

## §4 複雑度シグナル (op-core 計算定義)

区画 complexity を機械的に推定するためのシグナル定義。**現状は markdown 仕様のみ**、op-core での
実装は別 Phase (`op metric area <path>` で JSON 出力する予定):

| シグナル | 計算方法 | 用途 |
|---|---|---|
| `loc` | ファイル行数 (空行 / コメント除く) | typical / complex 境界 |
| `cyclomatic` | 関数 cyclomatic complexity の最大値 | complex 判定の主要シグナル |
| `churn_30d` | 直近 30 日の変更 commit 数 | complex / critical 候補抽出 |
| `dep_centrality` | import graph 中心性 (in-degree + out-degree) | critical 候補抽出 |
| `bug_history` | commit message から bug 修正 / hotfix 履歴抽出 | critical 候補抽出 |
| `domain_tag` | project config で手動指定 (`auth / payment / migration / core`) | critical 確定 |

閾値は project ごとに `op-config.yaml` で指定する。schema 定義・デフォルト値・記述例の正本は
`_shared/op-config-schema.md (>=1)` §3 `complexity_thresholds` / §4 `domain_tags` を参照。

---

## §5 Phase × Expert × complexity → model mapping

> 本節以降の `Opus` / `Sonnet` / `Haiku` は論理名 (minor version 省略)。具体 version は §1 table を参照。

### §5.1 主表 (Phase 単位)

| Phase | Sub-phase | 並列度 | 判断不可逆性 | model |
|---|---|---|---|---|
| op-plan | hearing / ADR 要否 (対話) | 単発 | 高 | **Opus** (司令官-side 推論、effort pin) |
| op-plan | 計画分解 案出し (judge-panel generate、ADR-0014 Wave B) | N 案並列 | 高 | **Sonnet** (breadth) |
| op-plan | 計画分解 評価 (judge-panel evaluate、ADR-0014 Wave B) | 単発 | 高 | **Opus** (depth、coverage/coherence/risk 裁定) |
| op-plan | 計画分解 fallback (単発、judge-panel 無効/ok:false 時) | 単発 | 高 | **Opus** (司令官-side 推論) |
| op-architect | アーキ案出し (judge-panel generate、ADR-0014 Wave C、whole-architecture) | N 案並列 | 高 | **Sonnet** (breadth、安く広く N アーキ案) |
| op-architect | アーキ評価 (judge-panel evaluate、ADR-0014 Wave C) | 単発 | 高 | **Opus** (depth、coherence/project 適合/CLAUDE.md 整合 裁定。最も subjective ゆえ JS guardrail 最薄) |
| op-architect | アーキ案 fallback (単発、judge-panel 無効/ok:false/ADR-worthy 論点<2 時) | 単発 | 高 | **Opus** (司令官-side 推論) |
| op-architect | ADR 起草 / 初期 Issue 生成 | 単発 | 高 | **Opus** |
| op-scan | audit (expert 並列) | 区画 × N expert | 中 | §5.2 参照 |
| op-scan | 統合 gate (severity + enrichment) | 単発 | 高 | **Opus** |
| op-patrol | 区画 audit | 区画 × N expert | 中 | §5.2 参照 |
| op-patrol | 統合 gate | 単発 | 高 | **Opus** |
| enrichment (issue-enrichment.md) | Design Plan 生成 | 単発 (Issue 毎) | 高 | **Opus** |
| enrichment | ux-ui-audit gate | 単発 (Issue 毎) | 中 | **Opus** |
| enrichment | cross-review (検出 expert 以外) | 単発 (Issue 毎) | 中 | **Opus** |
| op-run | clustering 案出し (judge-panel generate、ADR-0014) | N 案並列 | 高 | **Sonnet** (breadth、安く広く N 案) |
| op-run | clustering 評価 (judge-panel evaluate、ADR-0014) | 単発 | 高 | **Opus** (depth、tradeoff 裁定) |
| op-run | clustering fallback (単発グルーピング、judge-panel 無効/ok:false 時) | 単発 | 高 | **Opus** (司令官-side 推論、§5.1 advisory guard) |
| op-run | apply (実装) | cluster × N | 中 | §5.3 参照 |
| op-run | post-check (フェーズ 3.5) | 単発 (PR 毎) | 高 | **Opus** |
| op-run | global review (フェーズ 4) | 単発 (PR 毎) | 最高 (merge gate) | **Opus** (※narrow opt-down 例外あり、§7.1) |
| op-merge | 対話マージ | 単発 (司令官) | 高 | (司令官 model に従う) |

> **※ global review の narrow opt-down (§7.1)**: review-expert の base mapping は本表どおり
> **Opus** を維持する。ただし §7.1 の 5 条件 AND (LOC≤100 ∩ 非センシティブ ∩ `--quality high`
> 不指定 ∩ kill switch 不在 ∩ degrade 不在) をすべて満たす **狭い** PR に限り、§6 controller 決定
> フロー step 2a で Sonnet へ opt-down する。large / sensitive / `--quality high` PR は従来どおり
> Opus。判定主体は op-run controller (フェーズ 4)。詳細は §7.1。

> **※ op-run clustering の judge-panel と advisory guard (ADR-0014)**: clustering (= どの Issue を
> 束ねて並列実行するかのグルーピング決定) は単発・不可逆・深い推論で、従来は **司令官自身の推論**
> ゆえ「Opus で spawn」を直接強制できなかった。**judge-panel (1-2-judge) 有効時**は、グルーピングを
> N 案 (Sonnet generate) + Opus evaluate に分業し、**depth は opus evaluator (model pin) + 司令官
> effort pin (`effort: max`、PR #611) が構造的に担保**する (= #561 の clustering opus 単発 pin の
> 上位互換。pin 不要化を op-run wave で検討)。この場合 advisory guard は **情報提供のみ**。
> judge-panel が **無効 / `ok:false` でフォールバック**した単発グルーピング時のみ、本表の Opus 前提と
> advisory guard (司令官 model が最上位 tier でない場合に warning、hard fail しない) の警告意義が残る。
> 実装は `op-run/SKILL.md` フェーズ1 (1-2-judge / 1-2-0)、本 §5.1 が model 正本。clustering.md は pointer。

### §5.2 scan / patrol audit (区画 complexity × expert)

| 区画 complexity | debug / refactor / security / optimize / designer / ux-ui | test |
|---|---|---|
| `single` | Sonnet | Sonnet |
| `typical` | Sonnet | Sonnet |
| `complex` | **Opus** | Sonnet |
| `critical` | **Opus** | Sonnet |

注:

- test-expert は対象複雑度の影響を受けにくい (test 観点は rubric 中心) ので **Sonnet 維持**。
- designer / ux-ui-audit の検出に **Haiku を使ってはならない** (false negative リスク)。
- 区画全体を Opus 化すると並列爆発する。`complex` / `critical` のみ Opus、残りは Sonnet にして並列度を制御。
- `complex` / `critical` の判定主体は `op-patrol` の区画選定ロジック (リスク重み × 腐敗度) を §3 / §4 で拡張した
  ものを使う。
- **feature-expert** は op-scan の `--include-feature` 使用時のみ audit に登場する。本表に列を設けない
  代わりに、§5.3 (op-run 実装) の expert × task_complexity table に fallback する (audit 対象 Issue の
  task_complexity が `design` / `integration` / `api-design` なら Opus、`routine` / `extension` なら Sonnet)。
  enrichment 未通過の場合は §9 暫定値 (`extension` → Sonnet) を適用。

### §5.3 op-run 実装 (expert × task_complexity)

| Expert | routine / extension | design / integration / api-design |
|---|---|---|
| feature-expert | Sonnet | **Opus** (silent fork 統合は特に深い推論) |
| refactor-expert | Sonnet | **Opus** (architecture debt / 責務境界) |
| debug-expert | Sonnet | **Opus** (根本原因 / 並行性 / spec 解釈) |
| optimize-expert | Sonnet | **Opus** (algorithm 改善) |
| security-expert | Sonnet | **Opus** (attack chain 仮説) |
| test-expert | Sonnet | **Opus** (test 設計戦略) |
| designer-expert | Sonnet (token 適用のみ) | **Opus** (層構成 / 全体調和) |
| ux-ui-audit-expert | (実装しない / post-check 専門) | (実装しない / post-check 専門) |

注:

- **feature-expert は「常に Sonnet」ではない**。silent fork 統合 / cross-module 横断 / API 設計判断を
  含む Issue では深い推論が要り、Opus が必須。
- cluster の dominant task_complexity が `design` / `integration` / `api-design` であれば、cluster 全体を
  Opus で回す (cluster 内 Issue ごとに model を切替えるとコスト管理が複雑化するため)。

### §5.4 design 系の重要な但し書き

designer-expert / ux-ui-audit-expert は **「検出」と「生成・統合」で別軸**:

| 用途 | task の本質 | model |
|---|---|---|
| op-scan / op-patrol で **design system 逸脱検出** | token mismatch / spacing 違反など pattern マッチ | Sonnet |
| enrichment の **Design Plan 生成** | visual hierarchy / spacing rhythm / 全体調和 | **Opus** |
| op-architect の **design 初期方針** | design intent の言語化 | **Opus** |
| op-run の **複雑 component 実装** | layout 設計 / interaction design | **Opus** |
| op-run の **既存 token 適用だけの実装** | 単純な置換 | Sonnet |
| post-check (designer / ux-ui-audit) | apply 結果が design intent に沿うか統合判定 | **Opus** |

理由: design 系は rubric 適用に見えて、空間認識的推論 (spacing / alignment / rhythm の全体最適) と
暗黙の design intent 把握が支配的で、Opus が顕著に強い領域。

#### §5.4.1 enrichment design 多役 pipeline の役別 model (ADR-0012 Wave4)

`op-enrichment.js` の design-plan フェーズは Design Plan 生成を token-curation → component-selection →
layout-composition → (motion-spec) の役に分解する (ADR-0012 決定2)。上の「Design Plan 生成 = Opus」を
**役単位で「検出寄り = Sonnet / 生成・統合 = Opus」に細分化**する (検出は cheap broad、生成は Opus 集中で
コストを下げる。review lens-modular の調査/ゲート分離と同じ思想)。役別 model の正本値は `op-config-schema.md §9 role_models`、
controller が pre-step で解決し `op-enrichment.js` の args (`role_models`) に注入する (`issue-enrichment.md §7.6`)。

| 役 | task の本質 | 既定 model |
|---|---|---|
| `token-curation` (foundation 既存 = 参照のみ) | 既存 canonical token を semantic role に割当 = 検出/選定 | Sonnet |
| `token-curation` (foundation 不在 = add+normalize) | 不在 token を scale 整合で正規化追加 = 生成 (foundation authority) | **Opus** (controller が `foundation_exists=false` で昇格) |
| `component-selection` | 既存コンポーネント選定 (silent fork 回避) = 検出/選定 | Sonnet |
| `layout-composition` | visual hierarchy / spacing rhythm / 統合 Design Plan = 生成・統合 | **Opus** |
| `motion-spec` | motion 設計 (①② tokenized / ③④ human escalate) = 生成 (空間・時間推論) | **Opus** |
| gate (`ux-ui-audit-expert`) | 統合 Design Plan の独立検証 = 統合判定 (§5.4 post-check 行と整合) | **Opus** |

- **未注入時の役別 fallback (#676 で全役 opus から保守化)**: controller が `role_models` を注入しない (op-config なし等) 場合、
  `op-enrichment.js` は `ROLE_MODEL_FALLBACK` (検出役 `token-curation` / `component-selection` = Sonnet、生成役
  `layout-composition` / `motion-spec` = Opus、未知役は `|| "opus"` 安全網) に倒す (`role_models[role] || ROLE_MODEL_FALLBACK[role] || "opus"`)。
  controller 注入 (`role_models[role]`) は最優先で勝つため、foundation 不在時の `token-curation` Opus 昇格は注入経路で保持される。
  検出役を Sonnet 既定にすることで、設定漏れ時の検出役まで高コスト側に倒れていた旧挙動を解消し、品質 (生成役 = Opus 維持) を保ちつつ cost も保守化される。
- **foundation 不在の昇格**: `token-curation` は `foundation_exists=false` のとき add+normalize 権限を持ち生成寄りになるため、
  controller が Sonnet → Opus に昇格する (`issue-enrichment.md §7.6` 手順3)。`--quality high` は全役 1 段昇格、`--quality low` でも
  生成役 (layout / motion) と gate は Opus 維持 (merge 方向性に効く検証は降格しない、§7 と同方針)。

#### §5.4.2 op-explore (playground) の design 系 spawn は全役 Opus 固定 (ADR-0013 決定K)

`op-explore` (発散 / discovery、ADR-0013) の design 生成系 spawn (thin の designer-expert / `op-explore-render.js` の
N パターン生成 + de-AI craft + decision-matrix judge / Wave5 エンジンの content 生成) は **全役 `opus` を既定**とし、
上の §5.4.1 の per-role「検出役 (token-curation / component-selection) = Sonnet」割当ては **op-explore の craft 文脈では採らない**。

- **根拠**: craft / taste は **ceiling 課題** (ADR-0013 決定I)。floor 検出と違い最高モデルでないと天井が出ない。
  §5.4.1 の Sonnet 割当ては enrichment design pipeline の floor 検出向け cost 最適化であり、発散・craft・art-direction の質を
  最優先する op-explore では quality > cost。"design fast" でも **速さのためにモデルを落とさない** (Fast mode は Opus のまま高速出力)。
- **cost との整合**: 「**安いモデル**」でなく「**少ない spawn**」で抑える — Wave5 のエンジン/データ分離 (per-session を data 生成に圧縮) と
  `issue-enrichment.md §11` の spawn hard cap (worst-case 16) が総コストを抑える。
- **適用範囲 = op-explore 限定**: §5.4.1 の本番 enrichment design pipeline (`op-enrichment.js` の `role_models` 検出役 = Sonnet) は
  **現状維持** (Opus-first へ揃えない)。日常の起票経路は cost 影響が大きく、craft ceiling を要する op-explore とは要件が異なるため線引きする。

---

## §5.5 code-review effort-level 自動派生

Claude Code v2.1.146 (2026-05-21) で `/simplify` が `/code-review` に rename され、
optional な `effort-level` 引数 (`/code-review low|medium|high|xhigh|max`) が追加された。
本節は controller (apply spawn を発行する OP skill) が effort-level を **既存軸の組合せから派生**
させる canonical mapping を定義する。新規軸 (`code_review_complexity` 等) は **増やさない** —
本節は §2 (`task_complexity`) / §3 (`area_complexity`) / §7 (`--quality`) の組合せからの派生のみを
定義する (Single Canonical Source Rule、scope creep を避ける)。

派生値は `expert-spawn.md (>=16)` 修正完了報告 schema の `code_review_effort` field に格納され、
agent は `Skill({skill: "code-review", args: "<effort>"})` で呼ぶ。`auto` または `null` の場合は
引数なしで `Skill({skill: "code-review"})`。

### §5.5.1 派生表 (canonical mapping)

| 判定主体 | 条件 | effort-level |
|---|---|---|
| controller (apply spawn 直前) | `task_complexity ∈ {design, integration, api-design}` または `area_complexity = critical` | `high` |
| controller | `task_complexity = extension` または `area_complexity = complex` | `medium` (= default、未指定相当) |
| controller | `task_complexity = routine` かつ `area_complexity ∈ {single, typical}` | `low` |
| controller | `--quality high` 指定時 | 上記から **1 段昇格** (low→medium / medium→high / high→xhigh) |
| controller | `--quality low` 指定時 | 上記から **1 段降格** (high→medium / medium→low / low→low 維持) |
| controller | `--quality low` でも merge-blocking spawn (review-expert / post-check) は降格しない | `high` 維持 |
| Issue / cluster | 明示 `code_review_effort:` annotation がある場合 | 明示値を採用 (override) |
| degrade 時 | Opus → Sonnet degrade と同じ流れで `code_review_effort_degraded: true` を marker 化 | 1 段降格 |

### §5.5.2 評価順序 (上書き順)

`code_review_effort` は以下の step を直列に評価し、後の step が前を上書きする (§6 controller 決定
フローと同じパターン):

| step | 操作 | 入力 | 結果 |
|---|---|---|---|
| 1. base mapping | §5.5.1 表の最初の 3 行 (task_complexity / area_complexity の組合せ) を引く | task_complexity / area_complexity | base effort |
| 2. quality flag | §5.5.1 表の `--quality` 行を適用 (high → 昇格 / low → 降格) | flag 値 | flag-adjusted effort |
| 3. merge-blocking 例外 | review-expert / post-check spawn は §7 同様 `--quality low` でも `high` 維持 | spawn 種別 | flag-protected effort |
| 4. explicit override | Issue / cluster に `code_review_effort:` 明示があれば最終値とする | annotation | overridden effort |
| 5. degrade 反映 | Opus → Sonnet 等の degrade が発生していれば §5.5.1 末尾行で 1 段降格 | degrade marker | final effort |
| 6. spawn | 確定値を `code_review_effort` として apply spawn prompt に渡す | final effort | agent 側 `Skill` 引数 |

### §5.5.3 unset / 暫定値

| 状況 | 挙動 |
|---|---|
| `task_complexity` / `area_complexity` 共に unset (enrichment 未通過 + `op-config.yaml` なし) | `extension` ∩ `typical` 相当の base = `medium` を採用 (§9.1 暫定値節と整合) |
| controller logic bug 等で effort を出せない | `auto` (= 引数なし) として spawn し warning ログ |
| agent が controller から effort を受領していない | `code_review_effort: null` を完了報告に書き、引数なしで invoke |

### §5.5.4 値域と将来拡張

本 PR 初版で実運用に用いるのは **`low` / `medium` / `high` の 3 値のみ**。
`xhigh` / `max` は将来 `--quality ultra` 等の新規 flag を導入した際の予約値とし、現状の派生表では
`--quality high` 昇格時の `high → xhigh` 枠のみが値域に登場する (運用は段階的に開放)。
`auto` は controller / agent の双方が effort を確定できなかった場合の sentinel (引数なし invoke)。

### §5.5.5 関連 schema

- `expert-spawn.md (>=16)` 修正完了報告 schema: `code_review_effort` field
- `apply-completion-checklist.md (>=3)` §2「code-review skill 名と effort-level」節
- `op-tools/op-core` への `op model decide --effort` 拡張は **本 PR scope_out** (Phase 1 follow-up Issue
  で別途、`op-tools/docs/implementation-order.md` を参照)

---

## §6 controller の決定フロー

OP-managed mode で controller (op-* skill) が model を決定する手順。step を直列に実行し、
**後の step が前の step を上書き** する。最終値を `Agent({ model: ... })` に渡す:

| step | 操作 | 入力 | 結果 |
|---|---|---|---|
| 1. base lookup | §5 mapping を Phase × Expert × complexity で引く | task_complexity / 区画 complexity | base model |
| 2. quality flag | `--quality` flag / `OP_QUALITY` env を適用 (§7) | flag 値 | flag-adjusted model |
| 2a. narrow opt-down | **global review (review-expert) のみ**。§7.1 の 5 条件 AND を満たす狭い PR を Sonnet へ opt-down (§7.1) | PR LOC / sensitive glob / `--quality` / kill switch / degrade | opt-down-adjusted model |
| 3. explicit override | Issue / cluster に手動 model 指定があれば最終決定値とする (例: 緊急対応で明示昇格) | annotation | final model |
| 4. spawn | 確定値を spawn 引数に渡す | final model | `Agent({ model: ... })` |

直列フローのため、「優先順位リスト」ではなく「上書き順序」として読む。例:

- `--quality low` が指定されていても、step 3 で Issue に `model: opus` 明示があれば最終 Opus
- step 2 の `--quality` flag が無ければ step 1 の base がそのまま step 2a / 3 / 4 へ流れる
- ただし §7 の merge gate 維持例外 (review-expert / post-check は `--quality low` でも Opus) は
  step 2 内部で適用される (controller が flag を無視して Opus に固定する)
- **step 2a は global review (review-expert) spawn にのみ適用される** narrow exception。
  step 2 で Opus に固定された review-expert を、§7.1 の 5 条件 AND を満たす狭い PR に限って
  Sonnet に opt-down する。step 3 の explicit override (`model_overrides.review-expert: opus`) が
  あれば step 2a の opt-down は打ち消される (override が最終決定値)。post-check / enrichment 層 spawn
  には step 2a を適用しない (review-expert 以外は §7 の merge gate 維持例外がそのまま生きる)

### Direct Mode (人間が直接 expert を呼ぶ場合)

controller を介さないため上記フローは適用されない:

- `agents/<expert>.md` frontmatter の `model:` が default になる (現状: 全 9 active expert が `sonnet`)
- 「OP-managed mode で常に Opus」と本ファイル §5.1 に記載された expert (review-expert 等) でも、
  Direct Mode では frontmatter の `sonnet` が使われる。意図して Opus を使うには
  `Agent({ subagent_type: "...", model: "opus" })` を明示
- OP-managed mode と Direct Mode の挙動分離は `_shared/invocation-mode.md` を参照

---

## §7 `--quality` flag 仕様

OP skill 共通の品質モード切替:

| flag 値 | 挙動 |
|---|---|
| `--quality high` | §5 mapping のすべての Sonnet 割当を **Opus に強制昇格**。CI で品質最優先する場合 |
| `--quality balanced` (default) | §5 mapping に従う |
| `--quality low` | §5 mapping のすべての Opus 割当を **Sonnet に強制降格**。CI 量産で速度・コスト最優先 |

`--quality low` でも以下は **Opus 維持** (merge gate / 起票 gate の品質を絶対に下げないため):

- op-run global review (`review-expert`、フェーズ 4) — **ただし §7.1 narrow opt-down 例外あり**。
  large / sensitive / `--quality high` PR は本 list どおり Opus 維持。`--quality low` であっても
  §7.1 の 5 条件 AND を満たす狭い PR (small ∩ non-sensitive) に限り Sonnet へ opt-down する
  (v3 で意図的に追加した破壊的例外、§7.1.4 参照)
- op-run post-check (`security-expert` / `ux-ui-audit-expert` 等の post-check 担当、フェーズ 3.5)
- enrichment 層 spawn (`designer-expert` Architect Mode / `ux-ui-audit-expert` gate Mode /
  cross-review 各 expert、`issue-enrichment.md` §5 spawn 規約参照)
- op-scan / op-patrol 統合 gate (severity 判定 + enrichment 呼び出し、§5.1 主表参照)

環境変数経由でも上書き可能 (`OP_QUALITY=high` 等)。flag と env の優先順位は flag > env > default。

---

## §7.1 review-expert narrow opt-down (狭い条件での Sonnet 化)

<!--
機能概要: review-expert (global review、フェーズ4) を「小規模 ∩ 非センシティブ ∩ 品質最優先でない」
         狭い PR に限って Sonnet に opt-down する例外条項。base mapping (Opus) は維持する。
作成意図: 全 PR 無条件 Opus は 1 行 typo PR でも 1000 行 schema PR でも同一コストになる。review
         surface が小さく非センシティブな PR では Sonnet で 7 lens 監査の実用精度を維持できる。
注意点: shadow mode は経由せず default 有効 (本番化)。見逃しは sensitive glob / kill switch /
       30 日手動振り返りの 3 層で抑える。判定主体は op-run controller (フェーズ4、§4-1-b)。
-->

review-expert は §5.1 主表で全 PR 無条件 Opus (merge gate の最後の砦) として設計された "層 A"
expert であり、§7 で `--quality low` でも Opus 維持の例外保護を受ける。本節は、その base mapping を
維持しつつ、**狭い条件に限り Sonnet へ opt-down** する例外を canonical に定義する。

判定は op-run controller のフェーズ 4 で実行する (実装は `op-run/references/global-review-spawn.md`
§4-1-b)。**運用方針 (確定)**: shadow mode は経由せず、5 条件 AND を **default 有効** で本番化する。
見逃しリスクは (a) sensitive glob による Opus 強制、(b) kill switch (`OP_REVIEW_OPT_DOWN_DISABLE=1`)、
(c) 30 日後の手動振り返り (§7.1.5) の 3 層で抑える。

### §7.1.1 narrow opt-down 5 条件 (AND)

すべて true で **Sonnet**、いずれか 1 つでも false で **Opus 維持**:

1. `LOC ≤ 100` (`+` `-` 合計、除外 glob 適用後、§7.1.2)
2. `sensitive_files_touched == 0` (§7.1.3 glob 不該当)
3. `--quality high` が指定されていない
4. `OP_REVIEW_OPT_DOWN_DISABLE=1` 環境変数 kill switch が立っていない
5. `model_degraded` marker が残存していない (degrade 進行中の merge gate 強化と整合)

### §7.1.2 LOC 計測の正規化

- `+` `-` 合計 (insertions + deletions)
- 除外 glob: `**/*.lock`, `**/*.svg|png|jpg|webp`, `**/snapshot/**`, `**/__snapshots__/**`,
  `**/generated/**`, `vendor/**`, `node_modules/**`, `target/**`, `dist/**`, `build/**`
- test ファイルは **含める** (test-heavy PR で Sonnet 化が偏ると spec lens の品質低下リスク)
- 取得手段: `gh pr view --json files` + `git diff --shortstat "origin/${OP_RUN_BASE_REF}...HEAD" -- <files>`
- 100 files 超過時は safety default で Opus 維持 (gh pr view ページング + ARG_MAX 懸念回避)
- 除外後ファイルが空 (lock/generated のみの PR) は `LOC=0` とみなす (軽量変更なので Sonnet 化 OK)
- rename only PR は `--shortstat` 上 `LOC=0` (review 観点でも軽量なので Sonnet 化 OK)

### §7.1.3 センシティブ glob (強制 Opus)

以下の glob にマッチするファイルが 1 つでも含まれる PR は **Opus を強制維持**する。
Default (内蔵、削除不可、`op-config.yaml` の `review_opt_down_sensitive_paths` で **追加** のみ可):

- `**/migrations/**`, `**/*.sql`, `**/schema.*`, `**/*.prisma`
- `**/auth/**`, `**/authentication/**`, `**/authorization/**`
- `**/security/**`, `**/crypto/**`, `**/iam/**`, `**/permissions/**`, `**/capabilities/**`
- `src-tauri/capabilities/**`, `src-tauri/tauri.conf.json`
- `**/release/**`, `**/installer/**`, `**/updater/**`, `**/scripts/release*`, `**/.github/workflows/**`
- `skills/_shared/**`, `agents/*.md` (canonical 正本そのもの)
- `op-tools/crates/**` (Rust 実装 / ADR はアーキ判断を含む)
- `LICENSE*`, `**/COPYRIGHT*`, `**/NOTICE*`
- `**/.env*`, `**/secrets/**`
- `**/Cargo.toml`, `**/package.json`, `**/pubspec.yaml`, `**/Cargo.lock`, `VERSION` (version manifest。version-bump PR が
  small tier に落ちて Release lens が skip されるのを防ぐ recall 強化、#721 / #682 item4)
- `op-config.yaml` の `domain_tags[tag=critical]` で指定された path

「project 単位 escape hatch」として `model_overrides.review-expert: opus` を明示すると
narrow opt-down を完全停止できる (§6 step 3 explicit override の優先順位を維持)。

#### sensitive glob の investigate-phase 例外 (doc-only small、#720)

上記「sensitive glob 該当 = 全 phase Opus 強制」の invariant に、**investigate (lens-audit) phase に限った
behavioral exception** を 1 つ設ける。sensitive glob に該当しても、以下の **AND** を満たす PR は
investigate phase のみ Sonnet に段階下げできる (verify / gate / 最終 backstop は Opus を維持、lens floor も不変)。

`CUMULATIVE_NONDOC = doc-only かつ lines_changed ≤ N かつ 変更先が既存機能の補足のみ`:

1. `sensitive_files_touched != 0` (本節 glob 該当 = 通常なら全 phase Opus)
2. `CUMULATIVE_NONDOC == 0` — cumulative diff (`origin/${OP_RUN_BASE_REF}...HEAD`) の非 doc ファイル数が 0。
   doc-only = `.md` / `docs/` のみ。`op-tools/crates/**` にマッチした時点で非 doc 扱い (conservative)。
   これが「変更先が既存機能の補足のみ (= doc / コメント相当の追補) で、振る舞いを変えない」ことの機械判定。
3. `LOC ≤ OP_REVIEW_SMALL_MAX_LOC` (既定 100、§7.1.2 の LOC 正規化を再利用 = small tier)
4. `--quality high` が指定されていない
5. `OP_REVIEW_OPT_DOWN_DISABLE=1` kill switch が立っていない
6. `model_degraded` marker が残存していない

満たすとき investigate のみ Sonnet (`SENSITIVE_INVESTIGATE_SONNET=1`)。**REVIEW_MODEL 自体は Opus のまま**
据え置く (`model_overrides.review-expert: opus` escape hatch 互換を壊さない)。詳細は §7.1.7、bash 実装は
`op-run/references/global-review-spawn.md` §4-1-b (判定) / §4-2-a-pre (investigate-only 差し替え)。

> **設計根拠**: ADR-0011 のコア「調査は安く広く、判定は Opus ゲートに集中」を sensitive doc-only small に適用する。
> investigate を Sonnet にしても **breadth は full 7-lens を維持** (lens floor は sensitive=full のまま不変)、
> Opus gate の cumulative-diff backstop が見落とし (false-negative) を回収する。op-skill self-referential repo
> では全 PR が sensitive glob 該当のため、doc-only small refactor の investigate を毎回 Opus にするコストが
> review-expert subagent 使用の最大要因だった (要因1 = sensitive 自動 Opus、ADR-0015 Consequences L129)。
>
> **最大 recall リスクと tunable 撤退経路**: Security lens の Sonnet 見落としは targeted backstop では残留
> リスク (ADR-0011 L160-162)。doc-only 限定で攻撃面が薄く許容するが、Ladder4 recall e2e で 7-lens フル
> (全 Opus) vs investigate-sonnet の見落とし High/Critical 差が出たら **Security lens のみ investigate を Opus 床へ
> 戻す** (本例外を Security に適用しない tunable)。本例外の本番化は Issue #720 の Ladder4 実証を merge gate とする。

### §7.1.4 `--quality` flag との相互作用 (破壊的変更の所在)

| 状況 | `high` | balanced (default) | `low` |
|---|---|---|---|
| small ∩ non-sensitive | Opus | **Sonnet (opt-down 発動)** | **Sonnet** |
| small ∩ sensitive | Opus | Opus | Opus |
| large | Opus | Opus | Opus (§7 既存例外) |

**重要 (意図的破壊変更の明示)**: `small ∩ non-sensitive ∩ --quality low` を Sonnet にする挙動は、
§7 L312-317 の「`--quality low` でも review-expert は Opus 維持」という **既存 invariant を
small∩non-sensitive PR に限り意図的に解除** する破壊的変更である (§10「`--quality` flag 値の挙動変更」
に該当 → schema_version v3 bump で正当化)。op-run / `expert-spawn.md` の consumer が「small PR の
`--quality low` は Opus」を前提にしている可能性があるため、両ファイルの pin を `(>=3)` に同期する。

**code_review_effort との独立性 (§5.5.2 との関係明示)**: 本 narrow opt-down は **model 判定**であり、
§5.5.2 の `code_review_effort` 評価 (effort-level) とは独立した軸である。§5.5.2 step 3 の
「review-expert は `--quality low` でも effort `high` 維持」という merge-blocking 例外は effort の話で
あり、引き続き適用される (model が Sonnet になっても effort は high のまま渡る)。両者を混同しないこと。

### §7.1.5 計測 / 撤退条件

**観測インフラの現状 (正直に明記)**: op-merge は現状 false-negative を自動集計する機械可読ログを
持たない。よって以下の指標は **人間が 30 日後に手動で振り返る** 運用とする。op-merge ログの構造化
自動集計は別 Issue (scope_out) とする。

手動観測指標 (Sonnet 群 vs Opus 群):

- false-negative 比率 (merge → 7 日内に同 module で `op:blocking-finding` Issue 発生)
- needs-fix → fix → re-review-approve サイクル数の中央値
- review_round ≥ 2 到達率 (小規模 PR)
- post-merge revert / hotfix 7 日内発生率

撤退条件 (kill switch を前面に):

- Sonnet false-negative 比率が Opus 群の **1.5 倍 + 絶対値 5%** を超えると判断
  → `model_overrides.review-expert: opus` を `op-config.yaml` に site-wide で書く
- **post-merge hotfix が 30 日内 3 件以上** → 即時 `OP_REVIEW_OPT_DOWN_DISABLE=1` kill switch、
  root cause 分析後に解除

### §7.1.6 shadow mode (設計のみ、default OFF)

精度懸念が顕在化した場合の後付け observability オプションとして設計だけ残す (現状 **未実装 / default OFF**)。
shadow mode は「opt-down 判定では Sonnet を選ぶが、実 spawn は Opus で行い、Sonnet が出したであろう
判定との差分を marker に記録する」観測モードを想定する。op-merge ログの構造化自動集計 (§7.1.5 の
観測インフラ) が整った時点で有効化を検討する。本 v3 では default 本番化 + kill switch を採用したため、
shadow mode は経由しない。

### §7.1.7 lens-modular per-phase model (ADR-0011)

ADR-0011 (review lens-modular fan-out = ADR-0009 Phase C closeout) で op-run フェーズ4 review が 4 phase
(prep → 7 lens 並列調査 → adversarial-verify → opus 最終ゲート) へ展開された。model は **phase で分離**する
(lens identity の固定マップにしない。narrow split は breadth を下げるが reasoning depth は下げないため)。

| phase | model | 根拠 |
|-------|-------|------|
| prep (base-first digest) / lens-audit (7 lens 調査) | **§7.1 narrow opt-down 結果** (`investigate`)。**sensitive ∩ doc-only small は Sonnet** (#720 §7.1.3 investigate 例外) | 広く安く candidate を surface する recall フェーズ。小・非 sensitive PR は Sonnet、§7.1.3 sensitive / large / `--quality high` は Opus。ただし sensitive でも doc-only small は investigate のみ Sonnet (lens floor=full 維持、#720) |
| adversarial-verify (High/Critical refute) | **Opus 固定** | 偽陽性の深い反証推論 (精度要) |
| synthesize (最終ゲート: 権威 verdict + backstop gap-check) | **Opus 固定** | merge gate の consequential 判定 + 調査の見落とし (false-negative) を独立に拾う核 |

要点:

- **investigate は §7.1 narrow opt-down にそのまま従う** (5 条件 AND を満たせば Sonnet)。verify / gate は常に Opus。
- **narrow opt-down が Opus を強制する PR (sensitive glob = `skills/_shared/**` / `agents/*.md` /
  `op-tools/crates/**` 等、§7.1.3) は investigate も Opus = 全 phase Opus**。本 op-skill repo の canonical
  変更 PR は self-referential でこれに該当する (節約は下流の非 sensitive PR で効く)。
  - **例外 (#720)**: その sensitive PR が **doc-only small** (`CUMULATIVE_NONDOC==0` ∩ LOC≤small) なら
    investigate のみ Sonnet へ段階下げできる (§7.1.3「investigate-phase 例外」)。verify / gate / backstop は
    Opus 固定のまま、lens floor も full 7-lens を維持する (model 軸の段階下げであり lens 軸は触らない)。
- **gate-critical lens を cheap 化して refuter で backstop する設計は採らない**: refute は過剰検出 (false-positive)
  を落とすだけで見落とし (false-negative) を救えない。見落としの backstop は **opus 最終ゲートの独立 gap-check** が
  担う (ADR-0011 決定5 / 決定C)。
- controller (op-run) が per-phase model を解決し Workflow `args.models{investigate,verify,gate}` に注入する。
  実装は `op-run/references/global-review-spawn.md` §4-2-a-pre。boundary (Sonnet 調査の recall が十分か) は
  Ladder4 e2e で実測校正し、不足なら Security 調査を Opus 床へ戻す (tunable)。

---

## §8 関連 (canonical pointer)

- spawn schema (`model:` / `task_complexity:` field 定義) → `expert-spawn.md`
- task_complexity 推論手順 (Issue draft → `enriched_issue.task_complexity`) → `issue-enrichment.md`
  §4「Phase 1: UI 影響判定」内の「Phase 1 と並行: task_complexity 推論」節、および §8 Output contract
- cluster 単位 task_complexity 集約ルール (Issue 群 → cluster dominant) → `clustering.md`「入力と出力」節
- 各 expert の複雑度感度・base model → `active-expert-registry.md`「複雑度感度 (model selection summary)」節
- 区画スコアリング (リスク × 腐敗度) → `op-patrol/SKILL.md`
  - `op-patrol` は本ファイル §3 / §4 を audit_model 出力に拡張する
- `op-config.yaml` schema 定義 (complexity_thresholds / domain_tags / model_overrides / quality_defaults /
  review_opt_down_sensitive_paths) → `op-config-schema.md` (>=1)
- review-expert narrow opt-down の sensitive glob 追加設定 (`review_opt_down_sensitive_paths`) →
  `op-config-schema.md` (>=1)
- narrow opt-down 判定の controller 実装 (5 条件 AND の bash) → `op-run/references/global-review-spawn.md` §4-1-b
- `model_degraded` hidden marker (degrade 発生記録) → `markers/labels-and-markers.md` の
  「Spawn Metadata Markers」節
- 複雑度シグナルの op-core 実装 → `op-tools/` (別 Phase、§11 参照)
- runtime spawn boundary contract (本ファイルを正本リストに含む) → `runtime-contract.md` §1

---

## §9 想定外時の挙動

### §9.1 暫定値が適用される状況

| 状況 | 挙動 |
|---|---|
| `task_complexity` が unset (enrichment 未通過 Issue) | 暫定で `extension` 扱い、Sonnet で実装。post-check で見直し |
| `区画 complexity` が unset (`op-config.yaml` なし) | 暫定で `typical` 扱い、全 expert Sonnet。`area_complexity_unset_warning` を spawn metadata に記録 |
| **両方 unset** (新規プロジェクト + enrichment 未通過) | `extension` ∩ `typical` の組合せ = 全 expert Sonnet。両 warning を spawn metadata に記録 |
| `model:` field を controller が出せない (logic bug 等) | §5 lookup → default 適用。`model_decision_failed_warning` を出す |
| Opus が rate limit / 不可用 | Sonnet に degrade、`model_degraded: true` を spawn metadata に記録。redo 判定は §9.2 |

### §9.2 degrade 時の redo 判定

degrade は spawn 種別ごとに **判定主体と動作** が異なる:

| 発生箇所 | 判定主体 | 動作 |
|---|---|---|
| **apply spawn の degrade** (op-run フェーズ 2) | post-check expert (フェーズ 3.5) | `model_degraded: true` を確認し、品質懸念があれば `requires_redo: true` を返す。op-run controller は redo 要求を受けて Opus 復旧後に再 spawn する |
| **post-check / global review の degrade** (op-run フェーズ 3.5 / 4) | op-run controller | merge-blocking state として扱う (`runtime-contract.md` §11 categories と整合)。Opus 復旧まで `pro-reviewed` 付与を待つ。`--quality low` でも本 expert は Opus 維持される §7 例外との整合 |
| **scan / patrol audit の degrade** (op-scan / op-patrol) | OP skill controller | 起票 gate (Opus 単発) では degrade を許容せず、Opus 復旧まで起票を待つ。個別 audit spawn (Sonnet/Opus) の degrade は warning として記録し、結果は採用する |

controller は degrade を黙って隠さない。`model_degraded` は spawn metadata に記録し、将来的には
hidden marker (`markers/*.md` への追加、本 PR scope_out、§11 follow-up) へ昇格する。

---

## §10 schema 拡張時の運用

本ファイルの schema_version を bump する破壊的変更の例:

- 既存 task_complexity 区分の意味変更・削除
- §5 mapping table の列・行削除
- `--quality` flag 値の挙動変更
- override 優先順位 / §6 controller 決定フローの変更

非破壊的変更 (版上げ不要):

- 新規 task_complexity 区分追加
- §5 mapping table の行追加 (新規 expert 追加に伴う)
- 例 / 注釈の追加・補強
- §9 暫定挙動の追加

破壊的変更時は `_shared/version-check.md` の段階移行プロトコルに従う。

---

## §11 本 PR の scope と follow-up

本 PR は **markdown 仕様の canonical 化 + spawn テンプレへの `model:` field 注入** までを scope に
含む。実 spawn 経路に `model:` field が組み込まれたため、本仕様は「死に仕様」ではなく機能する仕様。

### 本 PR 取り込み済み

- `_shared/model-selection.md` (>=1) canonical 正本の新設
- 各 OP skill SKILL.md の `Agent({...})` spawn テンプレへの `model:` field 注入
  (op-run apply / post-check / global review、op-scan / op-patrol audit、enrichment 経由 spawn)
- `_shared/expert-spawn.md` の 3 spawn パターン例 (scan / apply / review) に `model:` field 追加
- `_shared/clustering.md` cluster schema への `task_complexity` field + dominant 集約ルール
- `_shared/op-config-schema.md` (>=1) 新設 (`op-config.yaml` schema 正本)
- `_shared/markers/labels-and-markers.md` への `<!-- op-model-degraded -->` marker 追加
- `_shared/runtime-contract.md` §1 Canonical Sources への pointer 追記
- `_shared/active-expert-registry.md` 複雑度感度 summary 節の追加

### 残 follow-up (別 PR、Rust 実装系)

| 項目 | 担当 Phase |
|---|---|
| op-tools/op-core での `op metric area` (複雑度シグナル計算) CLI 実装 | op-tools Phase 1 |
| op-tools/op-core での `op model decide` (decision table 適用) CLI 実装 | op-tools Phase 1 |
| `op-config.yaml` の Rust parse / validate 実装 | op-tools Phase 1 |
| clustering.md `task_complexity` field の Rust types 反映 | op-tools Phase 1 |
| 複雑度シグナルが揃うまでの暫定 fallback (LLM 推論 only / config 任せ) | controller 側既存実装で吸収可 |

### 現状の挙動

各 spawn テンプレに `model: <value>` の埋め込み式が入った状態。実 controller logic
(`cluster.model` / `region.audit_model` を計算する step) は op-run / op-scan / op-patrol が
`model-selection.md` §6 controller 決定フローを実装する責務として持つ。本 PR はその参照経路と
spawn 時の field 渡し方を確定させた。

複雑度シグナル (`loc` / `cyclomatic` / `churn` / `dep_centrality`) を機械計算する `op` CLI が
未実装な間は、controller が `op-config.yaml` の `domain_tags` と LLM の軽推論を組み合わせて
`area_complexity` / `task_complexity` を判定する。これは `op-tools Phase 1` の `op metric area`
が完成した時点で機械シグナルベースに切り替わる。
