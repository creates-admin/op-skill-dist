# Model Selection: Phase × Expert × Complexity → Model

OP skill が spawn する expert にどの model を割り当てるかの正本。**Phase × Expert × complexity の 3 軸** で決める。OP-managed Mode では controller が §6 のフローで決めた値を `Agent({ model })` に渡す (agent frontmatter の `model:` は Direct Mode の default としてのみ使われる)。

---

## §1 model 階層 (Opus / Sonnet / Haiku)

| Model | 具体 version (唯一正本) | 強み | 適用フェーズの特徴 |
|---|---|---|---|
| **Fable** | Fable 5 | 最難度の write タスク向け escalation 先 (高コスト) | **自動選択しない (opt-in 専用)**。write phase (op-run apply / op-codev implement) で §7.2 の人間承認を得た spawn のみ |
| **Opus** | Opus 4.8 | cross-cutting 推論、仮説立て、全体調和判断、空間認識的推論 | 単発 / 判断不可逆 / 深い推論 / design 系生成・統合。**worker 自動選択の天井** (§7.2 F1) |
| **Sonnet** | Sonnet 4.6 | pattern マッチ + 軽い推論、rubric 適用、既存パターン模倣 | 広域並列 audit / routine 実装 / 検出系 |
| **Haiku** | Haiku 4.5 | 形式照合、決定論的検査 | false negative 許容ケース (test rubric 適用等) のみ |

- 具体 version は本表のみに書く。他の箇所は論理名 (`Opus` / `Sonnet` / `Haiku`) で参照する。
- Fable は §5 mapping の値域に入らない。`--quality high` の昇格も Opus で止まる。read-only spawn では承認があっても禁止 (§7.2 F3)。
- design 系 (designer / ux-ui-audit) の検出フェーズに Haiku を使わない (false negative リスク)。

---

## §2 task_complexity 区分 (op-run 実装フェーズ向け)

| 区分 | 意味 | 例 |
|---|---|---|
| `routine` | 既存パターン直適用 | token / rename / 典型 null チェック / clippy 修正 |
| `extension` | 既存パターン拡張 | 既存 endpoint に field 追加、既存 hook の拡張 |
| `design` | 新規設計含む | 新規 feature 設計 / 新規 domain object / 新規 workflow |
| `integration` | silent fork 統合 / cross-module 横断 | 重複実装の統合点設計、多 module 同期変更、migration 同時実装 |
| `api-design` | API 契約 / 後方互換 / 拡張点判断 | 公開 API 変更、契約設計、命名規約決定 |

- Issue 単位の属性。cluster の model は dominant complexity (最も重い Issue) で決まる (集約規則: `clustering.md`)。
- Issue 起票時 (op-plan / op-architect / op-scan / op-patrol) に本文へ書くか、無ければ op-run controller が clustering 時に Issue 本文から判定する。spawn schema の `task_complexity:` に格納する。

---

## §3 区画 complexity 区分 (op-scan / op-patrol audit 向け)

| 区分 | 意味 |
|---|---|
| `single` | 単純 CRUD / 形式的 component / fixture / config |
| `typical` | 標準的 service / view / hook |
| `complex` | concurrent / state machine / domain logic が重い / 多依存 |
| `critical` | auth / payment / migration / 中心 API / core service |

- `critical` は `op-config.yaml` の **domain_tag** で明示する。
- `complex` は §4 機械シグナル + LLM 軽判断の組合せ (例: `cyclomatic >= 15 OR dep_centrality >= top10%`)。
- `single` / `typical` は残余。

---

## §4 複雑度シグナル

| シグナル | 計算方法 | 用途 |
|---|---|---|
| `loc` | ファイル行数 (空行 / コメント除く) | typical / complex 境界 |
| `cyclomatic` | 関数 cyclomatic complexity の最大値 | complex 判定の主要シグナル |
| `churn_30d` | 直近 30 日の変更 commit 数 | complex / critical 候補抽出 |
| `dep_centrality` | import graph 中心性 (in-degree + out-degree) | critical 候補抽出 |
| `bug_history` | commit message から bug 修正 / hotfix 履歴抽出 | critical 候補抽出 |
| `domain_tag` | project config で手動指定 (`auth / payment / migration / core`) | critical 確定 |

- シグナルを機械計算する CLI は未提供。controller は `op-config.yaml` の `domain_tags` と LLM の軽推論で `area_complexity` / `task_complexity` を判定する。
- 閾値の schema と default は `op-config-schema.md` §3 `complexity_thresholds` / §4 `domain_tags`。

---

## §5 Phase × Expert × complexity → model mapping

本節の値域は Opus / Sonnet / Haiku のみ (§7.2 F1)。どの組合せも `Fable` に解決しない。

### §5.1 主表 (Phase 単位)

| Phase | Sub-phase | 並列度 | 判断不可逆性 | model |
|---|---|---|---|---|
| op-plan | hearing / ADR 要否 (対話) | 単発 | 高 | **Opus** (司令官-side 推論、effort pin) |
| op-plan | 計画分解 | 単発 | 高 | **Opus** (司令官-side 推論) |
| op-architect | アーキ案 | 単発 | 高 | **Opus** (司令官-side 推論) |
| op-architect | ADR 起草 / 初期 Issue 生成 | 単発 | 高 | **Opus** |
| op-scan | audit (expert 並列) | 区画 × N expert | 中 | §5.2 参照 |
| op-scan | 統合 gate (severity / dedup / 起票判断) | 単発 | 高 | **Opus** |
| op-patrol | 区画 audit | 区画 × N expert | 中 | §5.2 参照 |
| op-patrol | 統合 gate | 単発 | 高 | **Opus** |
| op-run | clustering | 単発 | 高 | **Opus** (司令官-side 推論、advisory guard) |
| op-run | apply (実装) | cluster × N | 中 | §5.3 参照 |
| op-run | post-check (フェーズ 3.5) | 単発 (PR 毎) | 高 | **Opus** |
| op-run | global review (フェーズ 4) | 単発 (PR 毎) | 最高 | **Opus** (※narrow opt-down 例外あり、§7.1) |
| op-merge | 監査 / コンフリクト解消 / 解消レビュー | PR 毎 | 高 | **Opus** (監査・順序決定は司令官 model) |

- global review: base は Opus。§7.1 の 5 条件 AND を満たす狭い PR のみ §6 step 2a で Sonnet へ opt-down する。
- op-run clustering: 司令官 model が最上位 tier でなければ warning を出す (hard fail しない)。

### §5.2 scan / patrol audit (区画 complexity × expert)

| 区画 complexity | debug / refactor / security / optimize / designer / ux-ui | test |
|---|---|---|
| `single` | Sonnet | Sonnet |
| `typical` | Sonnet | Sonnet |
| `complex` | **Opus** | Sonnet |
| `critical` | **Opus** | Sonnet |

- test-expert は rubric 中心のため Sonnet 維持。
- designer / ux-ui-audit の検出に Haiku を使わない。
- `complex` / `critical` の判定は op-patrol の区画選定ロジックを §3 / §4 で拡張したものを使う。
- feature-expert (op-scan `--include-feature` 時のみ audit に登場) は §5.3 に fallback する (`design` / `integration` / `api-design` → Opus、`routine` / `extension` → Sonnet、未判定は §9 暫定値 `extension` → Sonnet)。

### §5.3 op-run 実装 (expert × task_complexity)

| Expert | routine / extension | design / integration / api-design |
|---|---|---|
| feature-expert | Sonnet | **Opus** (silent fork 統合は特に深い推論) |
| refactor-expert | Sonnet | **Opus** (architecture debt / 責務境界) |
| debug-expert | Sonnet | **Opus** (根本原因 / 並行性 / spec 解釈) |
| optimize-expert | Sonnet | **Opus** (algorithm 改善) |
| security-expert | Sonnet | **Opus** (到達経路チェーン仮説) |
| test-expert | Sonnet | **Opus** (test 設計戦略) |
| designer-expert | Sonnet (token 適用のみ) | **Opus** (層構成 / 全体調和) |
| ux-ui-audit-expert | (実装しない / post-check 専門) | (実装しない / post-check 専門) |

- cluster の dominant task_complexity が `design` / `integration` / `api-design` なら cluster 全体を Opus で回す (Issue ごとに切り替えない)。

### §5.4 design 系の重要な但し書き

designer-expert / ux-ui-audit-expert は「検出」と「生成・統合」で別軸:

| 用途 | task の本質 | model |
|---|---|---|
| op-scan / op-patrol で **design system 逸脱検出** | token mismatch / spacing 違反など pattern マッチ | Sonnet |
| op-architect の **design 初期方針** | design intent の言語化 | **Opus** |
| op-run の **複雑 component 実装** | layout 設計 / interaction design | **Opus** |
| op-run の **既存 token 適用だけの実装** | 単純な置換 | Sonnet |
| post-check (designer / ux-ui-audit) | apply 結果が design intent に沿うか統合判定 | **Opus** |

---

## §5.5 code-review effort-level 自動派生

controller は apply spawn の `code_review_effort` を §2 / §3 / §7 の既存軸から派生させる (新規軸は増やさない)。値は `expert-spawn.md` 修正完了報告 schema の `code_review_effort` に入り、agent は `Skill({skill: "op-skill:op-code-review", args: "effort: <effort>"})` で呼ぶ。`auto` / `null` なら effort 引数なしで呼ぶ (skill 既定 = high)。invoke 手順の正本は `apply-completion-checklist.md` §2。

### §5.5.1 派生表 (canonical mapping)

| 判定主体 | 条件 | effort-level |
|---|---|---|
| controller (apply spawn 直前) | `task_complexity ∈ {design, integration, api-design}` または `area_complexity = critical` | `high` |
| controller | `task_complexity = extension` または `area_complexity = complex` | `medium` (= default、未指定相当) |
| controller | `task_complexity = routine` かつ `area_complexity ∈ {single, typical}` | `low` |
| controller | `--quality high` 指定時 | 上記から **1 段昇格** (low→medium / medium→high / high→xhigh) |
| controller | `--quality low` 指定時 | 上記から **1 段降格** (high→medium / medium→low / low→low 維持) |
| controller | `--quality low` でも review-expert / post-check spawn は降格しない | `high` 維持 |
| Issue / cluster | 明示 `code_review_effort:` annotation がある場合 | 明示値を採用 (override) |
| degrade 時 | Opus → Sonnet degrade 時 | 1 段降格 |

運用値は `low` / `medium` / `high` (+ `--quality high` 昇格時の `xhigh`)。`auto` は effort を確定できなかった場合の sentinel (引数なし invoke)。

### §5.5.2 評価順序 (上書き順)

後の step が前を上書きする:

| step | 操作 | 入力 | 結果 |
|---|---|---|---|
| 1. base mapping | §5.5.1 表の最初の 3 行を引く | task_complexity / area_complexity | base effort |
| 2. quality flag | `--quality` 行を適用 (high → 昇格 / low → 降格) | flag 値 | flag-adjusted effort |
| 3. review / post-check 例外 | review-expert / post-check spawn は `--quality low` でも `high` 維持 | spawn 種別 | flag-protected effort |
| 4. explicit override | Issue / cluster に `code_review_effort:` 明示があれば最終値とする | annotation | overridden effort |
| 5. degrade 反映 | degrade が発生していれば 1 段降格 | degrade 有無 | final effort |
| 6. spawn | 確定値を `code_review_effort` として apply spawn prompt に渡す | final effort | agent 側 `Skill` 引数 |

### §5.5.3 unset / 暫定値

| 状況 | 挙動 |
|---|---|
| `task_complexity` / `area_complexity` 共に unset (未判定 + `op-config.yaml` なし) | `extension` ∩ `typical` 相当の base = `medium` (§9.1 と整合) |
| controller logic bug 等で effort を出せない | `auto` (= 引数なし) として spawn し warning ログ |
| agent が controller から effort を受領していない | `code_review_effort: null` を完了報告に書き、引数なしで invoke |

---

## §6 controller の決定フロー

OP-managed mode で controller が model を決める手順。step を直列に実行し、**後の step が前の step を上書き**する。最終値を `Agent({ model: ... })` に渡す:

| step | 操作 | 入力 | 結果 |
|---|---|---|---|
| 1. base lookup | §5 mapping を Phase × Expert × complexity で引く | task_complexity / 区画 complexity | base model (Opus / Sonnet / Haiku のみ) |
| 2. quality flag | `--quality` flag / `OP_QUALITY` env を適用 (§7) | flag 値 | flag-adjusted model (昇格は Opus 止まり) |
| 2a. narrow opt-down | **global review (review-expert) のみ**。§7.1 の 5 条件 AND を満たす狭い PR を Sonnet へ opt-down | PR LOC / sensitive glob / `--quality` / kill switch / degrade | opt-down-adjusted model |
| 2b. Fable escalation gate | **write phase (op-run apply / op-codev implement) のみ**。§7.2 の候補条件を満たす spawn を人間に提案し、**承認された場合のみ** Fable へ昇格 (既定は非承認 = Opus 維持) | 難度シグナル / 対話可否 / kill switch / degrade | escalated model (承認時のみ `fable`) |
| 3. explicit override | Issue / cluster に手動 model 指定があれば最終決定値とする。**値域は `opus` / `sonnet` / `haiku` のみ — `fable` は無効値** (§7.2 F6) | annotation | final model |
| 4. spawn | 確定値を spawn 引数に渡す | final model | `Agent({ model: ... })` |

- §7 の Opus 維持例外 (review-expert / post-check は `--quality low` でも Opus) は step 2 の内部で適用する。
- step 2a は review-expert spawn のみに適用する。step 3 の `model_overrides.review-expert: opus` があれば opt-down は打ち消される。
- step 2b は write phase spawn のみ。read-only spawn では評価しない (§7.2 F3)。無応答 / 曖昧 = 非承認。step 3 は 2b の結果を上書きできるが `fable` は書けない。

### Direct Mode (人間が直接 expert を呼ぶ場合)

- 上記フローは適用されず、`agents/<expert>.md` frontmatter の `model:` が default になる (現状: 全 active expert が `sonnet`)。
- Opus を使うには `Agent({ subagent_type: "...", model: "opus" })` を明示する。
- mode の判別は `_shared/invocation-mode.md`。

---

## §7 `--quality` flag 仕様

| flag 値 | 挙動 |
|---|---|
| `--quality high` | §5 mapping のすべての Sonnet 割当を **Opus に強制昇格**。**昇格は Opus で止まり Fable には到達しない** (§7.2 F2) |
| `--quality balanced` (default) | §5 mapping に従う |
| `--quality low` | §5 mapping のすべての Opus 割当を **Sonnet に強制降格** |

`--quality low` でも以下は **Opus 維持**:

- op-run global review (`review-expert`、フェーズ 4) — ただし §7.1 narrow opt-down の条件を満たす狭い PR は Sonnet
- op-run post-check (フェーズ 3.5 の post-check 担当)
- op-scan / op-patrol 統合 gate

環境変数でも指定可 (`OP_QUALITY=high` 等)。優先順位は flag > env > default。

---

## §7.1 review-expert narrow opt-down (狭い条件での Sonnet 化)

review-expert の base mapping (Opus) を維持しつつ、狭い PR に限り Sonnet へ opt-down する例外。default 有効。判定は op-run controller のフェーズ 4 (実装: `op-run/references/global-review-spawn.md` §4-1-b)。見逃しは sensitive glob / kill switch (`OP_REVIEW_OPT_DOWN_DISABLE=1`) / 30 日振り返り (§7.1.5) で抑える。

### §7.1.1 narrow opt-down 5 条件 (AND)

すべて true で **Sonnet**、1 つでも false で **Opus 維持**:

1. `LOC ≤ 100` (`+` `-` 合計、除外 glob 適用後、§7.1.2)
2. `sensitive_files_touched == 0` (§7.1.3 glob 不該当)
3. `--quality high` が指定されていない
4. `OP_REVIEW_OPT_DOWN_DISABLE=1` kill switch が立っていない
5. 当該 run で model degrade が発生していない

### §7.1.2 LOC 計測の正規化

- `+` `-` 合計 (insertions + deletions)
- 除外 glob: `**/*.lock`, `**/*.svg|png|jpg|webp`, `**/snapshot/**`, `**/__snapshots__/**`, `**/generated/**`, `vendor/**`, `node_modules/**`, `target/**`, `dist/**`, `build/**`
- test ファイルは含める
- 取得: `op pr view <N> --include files` + `git diff --shortstat "origin/${OP_RUN_BASE_REF}...HEAD" -- <files>`
- 100 files 超過時は Opus 維持
- 除外後ファイルが空 (lock/generated のみ) や rename only は `LOC=0` (Sonnet 化 OK)

### §7.1.3 センシティブ glob (強制 Opus)

以下にマッチするファイルが 1 つでも含まれる PR は Opus を維持する。Default (削除不可、`op-config.yaml` の `review_opt_down_sensitive_paths` で追加のみ可):

- DB: `**/migrations/**`, `**/*.sql`, `**/schema.*`, `**/*.prisma`
- 認証・権限: `**/auth/**`, `**/authentication/**`, `**/authorization/**`, `**/security/**`, `**/crypto/**`, `**/iam/**`, `**/permissions/**`, `**/capabilities/**`, `src-tauri/capabilities/**`, `src-tauri/tauri.conf.json`
- release: `**/release/**`, `**/installer/**`, `**/updater/**`, `**/scripts/release*`, `**/.github/workflows/**`
- 正本・実装: `skills/_shared/**`, `agents/*.md`, `op-tools/crates/**`
- license / secret: `LICENSE*`, `**/COPYRIGHT*`, `**/NOTICE*`, `**/.env*`, `**/secrets/**`
- version manifest: `**/Cargo.toml`, `**/package.json`, `**/pubspec.yaml`, `**/Cargo.lock`, `VERSION`
- `op-config.yaml` の `domain_tags[tag=critical]` で指定された path

`model_overrides.review-expert: opus` を明示すると narrow opt-down を完全停止できる (§6 step 3)。

#### sensitive glob の investigate-phase 例外 (doc-only small)

sensitive glob に該当しても、以下の AND を満たす PR は investigate (lens-audit) phase のみ Sonnet にできる。verify / gate / backstop は Opus、lens floor は full 7-lens のまま。

1. `sensitive_files_touched != 0`
2. `CUMULATIVE_NONDOC == 0` — cumulative diff (`origin/${OP_RUN_BASE_REF}...HEAD`) の非 doc ファイル数が 0 (doc = `.md` / `docs/` のみ。`op-tools/crates/**` は非 doc 扱い)
3. `LOC ≤ OP_REVIEW_SMALL_MAX_LOC` (既定 100、§7.1.2 の正規化を再利用)
4. §7.1.1 の条件 3〜5 (`--quality high` なし / kill switch なし / degrade なし) を満たす

満たすとき `SENSITIVE_INVESTIGATE_SONNET=1`。REVIEW_MODEL 自体は Opus のまま (escape hatch 互換)。実装は `global-review-spawn.md` §4-1-b (判定) / §4-2-a-pre (investigate-only 差し替え)。Security lens の見落とし差が実測で出たら、Security lens のみ investigate を Opus に戻す (tunable)。

### §7.1.4 `--quality` flag との相互作用

| 状況 | `high` | balanced (default) | `low` |
|---|---|---|---|
| small ∩ non-sensitive | Opus | **Sonnet (opt-down 発動)** | **Sonnet** |
| small ∩ sensitive | Opus | Opus | Opus |
| large | Opus | Opus | Opus (§7 既存例外) |

- `small ∩ non-sensitive ∩ --quality low` は §7 の「`--quality low` でも review-expert は Opus 維持」を解除して Sonnet になる。
- narrow opt-down は model 軸であり、§5.5.2 step 3 の effort `high` 維持 (effort 軸) とは独立。model が Sonnet でも effort は high のまま渡る。

### §7.1.5 計測 / 撤退条件

人間が手動で振り返る (Sonnet 群 vs Opus 群)。指標: false-negative 比率 (merge → 7 日内に同 module で `op:blocking-finding` Issue 発生) / needs-fix サイクル数の中央値 / review_round ≥ 2 到達率 / post-merge revert・hotfix 7 日内発生率。

撤退条件:

- Sonnet false-negative 比率が Opus 群の **1.5 倍 + 絶対値 5%** を超える → `op-config.yaml` に `model_overrides.review-expert: opus` を site-wide で書く
- post-merge hotfix が 30 日内 3 件以上 → 即時 `OP_REVIEW_OPT_DOWN_DISABLE=1`、root cause 分析後に解除

### §7.1.7 lens-modular per-phase model

op-run フェーズ4 review は 4 phase (prep → 7 lens 並列調査 → adversarial-verify → opus 最終ゲート) で、model は phase で分離する。

| phase | model | 根拠 |
|-------|-------|------|
| prep (base-first digest) / lens-audit (7 lens 調査) | **§7.1 narrow opt-down 結果** (`investigate`)。sensitive ∩ doc-only small は Sonnet (§7.1.3 investigate 例外) | recall フェーズ。小・非 sensitive PR は Sonnet、sensitive / large / `--quality high` は Opus |
| adversarial-verify (High/Critical refute) | **Opus 固定** | 偽陽性の深い反証推論 |
| synthesize (最終ゲート: 権威 verdict + backstop gap-check) | **Opus 固定** | 最終 verdict 判定 + 調査の見落としを独立に拾う |

- sensitive glob 該当 PR (`skills/_shared/**` / `agents/*.md` / `op-tools/crates/**` 等) は、doc-only small 例外を除き全 phase Opus。
- gate-critical lens を cheap 化して refuter で backstop する設計は採らない (refute は false-positive しか落とせない。false-negative の backstop は最終ゲートの gap-check)。
- controller (op-run) が per-phase model を解決し Workflow `args.models{investigate,verify,gate}` に注入する (実装: `global-review-spawn.md` §4-2-a-pre)。

---

## §7.2 Fable escalation gate (自動 spawn 禁止 / 人間承認 opt-in)

`Fable` は §5 mapping の値域外の escalation tier。controller が自動で選ぶことはない。

### §7.2 F1 — worker 自動選択の天井は Opus (不変則)

- controller が spawn する expert の model は、自動決定の結果として Opus を超えない。
- §5 mapping / §7 `--quality` / §9.2 degrade からの復帰のいずれでも Fable は出力されない。
- controller は難度を理由に単独で Fable を選んではならない。難度の見立ては提案の材料であり、決定は F5 の人間承認。

### §7.2 F2 — 昇格 ladder は Opus で止まる

`--quality high` / `OP_QUALITY=high` / `quality_defaults.level: high` の昇格は `Haiku → Sonnet → Opus` で打ち止め。`Opus → Fable` の段は無い。§5.5 の effort ladder (`low → medium → high → xhigh`) は別軸。

### §7.2 F3 — read-only (非 write) spawn は Fable 禁止 (hard、承認があっても不可)

「read-only」= repo のコードを変更しない spawn (文章生成も含む)。Fable を許すのは worktree でコードを書き commit する spawn だけ。以下では F4 の候補判定自体を行わず §5 mapping の結果で spawn する:

| 経路 | 該当 spawn |
|---|---|
| op-scan / op-patrol | audit (パターン1)、統合 gate |
| refute | skeptic spawn (`refute-contract.md`) |
| op-run | investigation (`op-run-discover`)、post-check / aux post-check (フェーズ3.5)、global review 全 phase (prep / lens-audit / adversarial-verify / synthesize) |
| Utility Worker | `spec-expert` (op-spec / op-spec-patrol)、`scout` (op-report) |
| op-codev | Step A (explore)、Step C (verify)、Review 選択 2 (review-expert 7-lens) |
| op-explore / デザインモック | designer-expert の既存 design system 要約 (`design-mock.md`) |

global review の payload schema (`review_finding.model_used`) は `["opus", "sonnet"]` のみで、`fable` は schema validation で落ちる。

### §7.2 F4 — 提案してよい候補条件 (write phase 限定)

Fable を提案できるのは次の 2 経路の write spawn のみ:

- op-run フェーズ 2 の **apply spawn** (cluster 単位、`op-run/SKILL.md` 1-2-g)
- op-codev フェーズ 3 の **Step B (implement)** (IU 単位、`op-codev/SKILL.md` 3-B-gate)

提案の必要条件 (AND。1 つでも欠ければ提案せず Opus で続行):

1. base model (§6 step 1〜2 の結果) が Opus (= `task_complexity ∈ {design, integration, api-design}`)
2. 対話経路である (`--auto` / 非対話一括経路では提案しない → F7)
3. kill switch 不在 — `OP_FABLE_DISABLE=1` が立っておらず、`op-config.yaml` の `fable_escalation.enabled` が `false` でない
4. 当該 run で model degrade が発生していない (→ F8)
5. 難度シグナル D1〜D6 のうち 2 つ以上が立っている

| id | 難度シグナル | 判定材料 |
|---|---|---|
| D1 | cross-module 横断 — 変更候補が 3 module 以上 または 10 file 以上に跨る | cluster.files / IU の scope_files |
| D2 | 契約変更 — 公開 API / 後方互換 / migration 同時実装 (`task_complexity: api-design`) | Issue 本文 |
| D3 | silent fork 統合 — 重複実装の統合点設計 (`task_complexity: integration`) | Issue 本文 / investigation report |
| D4 | 並行性 / 状態機械 / トランザクション整合 が本質に絡む | Issue 本文 / (実施済なら) investigation report の risks |
| D5 | §7.1.3 の sensitive glob に該当するファイルを変更する | files 一覧 |
| D6 | 再挑戦 — 同 cluster / IU で `review_round >= 2` または `requires_redo: true` が発生済 | review state / post-check 返却 |

**例外 (人間起点)**: ユーザーが自分から「この作業は Fable で」と明示した場合は、D 条件を問わず F5 の承認済みとして扱う。F3 の read-only 禁止は解除されない。

提案は各 skill の gate でのみ行う:

- **op-run**: plan gate 直前の 1-2-g で **1 run 1 回**。実行開始後に候補条件を満たしても追加提案しない。Opus のまま完走し、完了報告に「次 run では Fable 昇格が有効な可能性」を 1 行残す。
- **op-codev**: Checkpoint A 直後の 3-B-gate で **IU ごと** (Checkpoint B 差し戻しによる Step B 再実行時も再通過してよい)。

### §7.2 F5 — 承認 protocol

- 提示は 2 択、既定は Opus 維持: `1. Opus のまま続行 (既定) / 2. Fable へ昇格`
- 提示の必須項目: 対象 spawn の識別子 (op-run = cluster id / op-codev = IU 名) と担当 expert / base model (Opus) と昇格後 (Fable) / 立った難度シグナル (D id と 1 行根拠) / コストが上振れる旨 (定性で可) / 承認 scope
- 提示手段: op-run は `AskUserQuestion` (plan gate 前)、op-codev は Checkpoint の会話ターン。
- **無応答 / 曖昧な返答は非承認**として Opus で続行する。
- **承認 scope**: 提示した spawn 単位 (cluster / IU) の write spawn のみ、同 session 内。同 cluster / IU の review-fix loop に伴う再 apply は引き継ぐ。他の cluster / IU へ横展開しない。read-only spawn には適用されない (F3)。
- **記録**: plan file / PR 本文 / 完了サマリに「<scope-id>: <expert> を Fable へ昇格 (承認済み)」を自然文で 1 行明記する。

### §7.2 F6 — config / env から Fable を選ぶことはできない

- `op-config.yaml` の `model_overrides.*: fable` は無効値。controller は無視し、`fable_config_override_ignored_warning` を spawn metadata に記録して §5 mapping の値で spawn する。
- `quality_defaults` / `OP_QUALITY` からも Fable は選べない (F2)。
- 提案を止める方向の設定のみ可: `fable_escalation.enabled: false` / `OP_FABLE_DISABLE=1`。

### §7.2 F7 — 非対話 / `--auto` 経路

提案せず Opus で続行する (停止しない)。plan / 実行 report に次の 1 行を記録する:

```text
[fable-gate] --auto (非対話) のため escalation 提案を skip しました。全 worker は Opus 天井で実行します。
```

`--auto` 側に事前承認の抜け道は作らない。最難度タスクは対話モードで実行して承認する。

### §7.2 F8 — degrade / unavailable との相互作用

| 状況 | 挙動 |
|---|---|
| 承認済み Fable spawn が rate limit / unavailable | **Opus へ degrade** し、PR 本文 / 完了サマリに自然文で記録する。Fable への自動再試行はしない (再承認も不要) |
| Opus が degrade 中 | Fable 昇格を提案しない (F4 条件 4) |
| 承認済み scope の再 apply (review-fix loop) | 承認を引き継ぐ。ただし degrade 発生時は当該 spawn は Opus |

---

## §8 関連 (canonical pointer)

- spawn schema (`model:` / `task_complexity:`) → `expert-spawn.md`。cluster 集約 → `clustering.md`。expert 別感度 → `active-expert-registry.md`「複雑度感度 (model selection summary)」節。
- `op-config.yaml` schema (thresholds / domain_tags / model_overrides / quality_defaults / fable_escalation / sensitive paths) → `op-config-schema.md`。
- controller 実装: narrow opt-down → `op-run/references/global-review-spawn.md` §4-1-b。Fable gate → `op-run/SKILL.md` 1-2-g / `op-codev/SKILL.md` 3-B-gate。

---

## §9 想定外時の挙動

### §9.1 暫定値が適用される状況

| 状況 | 挙動 |
|---|---|
| `task_complexity` が unset (未判定 Issue) | 暫定で `extension` 扱い、Sonnet で実装。post-check で見直し |
| `区画 complexity` が unset (`op-config.yaml` なし) | 暫定で `typical` 扱い、全 expert Sonnet。`area_complexity_unset_warning` を spawn metadata に記録 |
| **両方 unset** (新規プロジェクト + 未判定) | `extension` ∩ `typical` = 全 expert Sonnet。両 warning を spawn metadata に記録 |
| `model:` field を controller が出せない (logic bug 等) | §5 lookup → default 適用。`model_decision_failed_warning` を出す |
| Opus が rate limit / 不可用 | Sonnet に degrade、`model_degraded: true` を spawn metadata に記録。redo 判定は §9.2 |
| `model_overrides` / spawn 引数に `fable` が現れた (F6 違反) | 当該値を **無視** して §5 mapping の値で spawn し、`fable_config_override_ignored_warning` を記録。hard fail はしない |
| read-only spawn に `fable` が渡された (F3 違反) | contract error。**Opus に矯正して続行**し、`fable_readonly_violation_warning` を記録して人間に報告する (silent に受理しない) |
| 承認済み Fable が unavailable | Opus へ degrade (§7.2 F8)。Fable への自動再試行はしない |

### §9.2 degrade 時の redo 判定

| 発生箇所 | 判定主体 | 動作 |
|---|---|---|
| **apply spawn の degrade** (op-run フェーズ 2) | post-check expert (フェーズ 3.5) | `model_degraded: true` を確認し、品質懸念があれば `requires_redo: true` を返す。controller は Opus 復旧後に再 spawn する |
| **post-check / global review の degrade** (op-run フェーズ 3.5 / 4) | op-run controller | Opus 復旧まで `pro-reviewed` 付与を待つ |
| **scan / patrol audit の degrade** (op-scan / op-patrol) | OP skill controller | 起票 gate (Opus 単発) では degrade を許容せず、Opus 復旧まで起票を待つ。個別 audit spawn の degrade は warning として記録し結果は採用する |

controller は degrade を隠さない。`model_degraded` を spawn metadata に記録する。

---

## §10 schema 拡張時の運用

以下は consumer (OP skill / workflow / spawn テンプレ) の同時更新を要する契約変更として扱う:

- 既存 task_complexity 区分の意味変更・削除
- §5 mapping table の列・行削除
- `--quality` flag 値の挙動変更
- override 優先順位 / §6 controller 決定フローの変更
- **§7.2 の Fable 契約の緩和** (worker 天井 = Opus の解除 / F3 read-only 禁止の解除 / F6 config・env での事前承認の許可)。人間承認なしにコストが上振れる方向の変更であり、人間の明示判断なしに行わない
