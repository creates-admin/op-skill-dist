# Model Selection: Phase × Expert × Complexity → Model

OP skill が spawn する expert にどの model を割り当てるかの正本。OP-managed Mode では controller が §6 のフローで決めた値を
`Agent({ model })` に渡す (agent frontmatter の `model:` は Direct Mode の default としてのみ使われる)。
`Agent({ model })` には論理名 (`opus` / `sonnet` / `fable`) を渡す。

## §1 model 階層

- worker の自動選択は Sonnet / Opus の 2 段で、天井は Opus (§7.2 F1)。
- Fable は自動選択しない。write phase (op-run apply / op-codev implement) で §7.2 の人間承認を得た spawn のみ。
- Haiku はどの mapping にも出ない。

## §2 task_complexity 区分 (op-run 実装フェーズ向け)

| 区分 | 意味 | 例 |
|---|---|---|
| `routine` | 既存パターン直適用 | token / rename / 典型 null チェック / clippy 修正 |
| `extension` | 既存パターン拡張 | 既存 endpoint に field 追加、既存 hook の拡張 |
| `design` | 新規設計含む | 新規 feature 設計 / 新規 domain object / 新規 workflow |
| `integration` | silent fork 統合 / cross-module 横断 | 重複実装の統合点設計、多 module 同期変更、migration 同時実装 |
| `api-design` | API 契約 / 後方互換 / 拡張点判断 | 公開 API 変更、契約設計、命名規約決定 |

- Issue 単位の属性。cluster の model は dominant complexity (最も重い Issue) で決まる (集約規則: `clustering.md`)。
- Issue 起票時 (op-plan / op-architect / op-scan / op-patrol) に本文へ書くか、無ければ op-run controller が clustering 時に Issue 本文から判定する。

## §3 区画 complexity 区分 (op-scan / op-patrol audit 向け)

| 区分 | 意味 |
|---|---|
| `single` | 単純 CRUD / 形式的 component / fixture / config |
| `typical` | 標準的 service / view / hook |
| `complex` | concurrent / state machine / domain logic が重い / 多依存 |
| `critical` | auth / payment / migration / 中心 API / core service |

- `critical` は `op-config.yaml` の `domain_tags` で path 指定された区画。`complex` は `domain_tags` の `complex` 指定か controller の判断。
  それ以外は `typical` (単純なものは `single`)。

## §4 (欠番)

## §5 Phase × Expert × complexity → model mapping

値域は Opus / Sonnet のみ。どの組合せも Fable に解決しない。

### §5.1 主表 (Phase 単位)

| spawn | model |
|---|---|
| op-scan / op-patrol の audit | §5.2 |
| op-run apply | §5.3 |
| op-run post-check (フェーズ3.5) | Opus |
| op-run global review (フェーズ4) | Opus (narrow opt-down 例外は §7.1) |

### §5.2 scan / patrol audit (区画 complexity × expert)

- `complex` / `critical` 区画は Opus、`single` / `typical` は Sonnet。
- test-expert は区画によらず Sonnet。
- feature-expert (op-scan `--include-feature` 時のみ audit に登場) は §5.3 と同じ規則 (未判定は Sonnet)。

### §5.3 op-run 実装 (expert × task_complexity)

- `design` / `integration` / `api-design` は Opus、`routine` / `extension` は Sonnet。全 apply expert 共通 (ux-ui-audit-expert は apply しない)。
- cluster の dominant task_complexity で cluster 全体の model を決める (Issue ごとに切り替えない)。

## §5.5 code-review effort-level 自動派生

controller は apply spawn の `code_review_effort` を次で決め、apply spawn prompt に渡す。値は `expert-spawn.md` 修正完了報告 schema の
`code_review_effort` に入り、agent は `Skill({skill: "op-skill:op-code-review", args: "effort: <effort>"})` で呼ぶ
(`auto` / `null` なら effort 引数なし = skill 既定 high)。invoke 手順の正本は `apply-completion-checklist.md` §2。

1. `task_complexity ∈ {design, integration, api-design}` または区画 `critical` → `high`
2. `task_complexity = extension` または区画 `complex` → `medium`
3. `task_complexity = routine` かつ区画 `single` / `typical` → `low`
4. 両方未判定 → `medium`
5. Issue / cluster に `code_review_effort:` の明示があればそれを最終値にする
6. model degrade が発生していれば 1 段降格
7. 決められなければ `auto` として spawn する。controller から受け取っていない agent は `code_review_effort: null` を書く

## §6 controller の決定フロー

step を直列に実行し、後の step が前を上書きする。最終値を `Agent({ model })` に渡す。

| step | 操作 |
|---|---|
| 1. base lookup | §5 mapping を引く (Opus / Sonnet のみ) |
| 2a. narrow opt-down | global review (review-expert) のみ。§7.1 の条件を満たす狭い PR を Sonnet へ |
| 2b. Fable escalation gate | write phase (op-run apply / op-codev implement) のみ。§7.2 の人間承認を得た場合だけ Fable (既定は Opus 維持) |
| 3. explicit override | Issue / cluster の手動 model 指定を最終値にする。値域は `opus` / `sonnet`。`fable` は無効値 (§7.2 F6) |

- step 2b は read-only spawn では評価しない (§7.2 F3)。step 3 は 2b の結果を上書きできるが `fable` は書けない。
- Direct Mode は上記を適用せず、`agents/<expert>.md` frontmatter の `model:` が default。Opus を使うには `Agent({ model: "opus" })` を明示する。

## §7 (欠番)

## §7.1 review-expert narrow opt-down (狭い条件での Sonnet 化)

review-expert の base (Opus) を狭い PR に限り Sonnet へ下げる。判定と実装は op-run の `references/global-review-spawn.md` §4-1-b。

### §7.1.1 narrow opt-down 条件 (AND)

すべて true で Sonnet、1 つでも false で Opus:

1. `LOC ≤ 100` (§7.1.2)
2. `sensitive_files_touched == 0` (§7.1.3)
3. kill switch `OP_REVIEW_OPT_DOWN_DISABLE=1` が立っていない
4. 当該 run で model degrade が発生していない

### §7.1.2 LOC 計測の正規化

- `+` `-` 合計 (insertions + deletions)。test ファイルは含める
- 除外 glob: `**/*.lock`, `**/*.svg|png|jpg|webp`, `**/snapshot/**`, `**/__snapshots__/**`, `**/generated/**`, `vendor/**`, `node_modules/**`, `target/**`, `dist/**`, `build/**`
- 100 files 超過時は Opus。除外後ファイルが空 (lock/generated のみ) や rename only は `LOC=0`

### §7.1.3 センシティブ glob (強制 Opus)

以下にマッチするファイルを 1 つでも含む PR は Opus を維持する:

- DB: `**/migrations/**`, `**/*.sql`, `**/schema.*`, `**/*.prisma`
- 認証・権限: `**/auth/**`, `**/authentication/**`, `**/authorization/**`, `**/security/**`, `**/crypto/**`, `**/iam/**`, `**/permissions/**`, `**/capabilities/**`, `src-tauri/capabilities/**`, `src-tauri/tauri.conf.json`
- release: `**/release/**`, `**/installer/**`, `**/updater/**`, `**/scripts/release*`, `**/.github/workflows/**`
- 正本・実装: `skills/_shared/**`, `agents/*.md`, `op-tools/crates/**`
- license / secret: `LICENSE*`, `**/COPYRIGHT*`, `**/NOTICE*`, `**/.env*`, `**/secrets/**`
- version manifest: `**/Cargo.toml`, `**/package.json`, `**/pubspec.yaml`, `**/Cargo.lock`, `VERSION`

sensitive でも、cumulative diff の非 doc ファイル数が 0 (doc = `.md` / `docs/` のみ。`op-tools/crates/**` は非 doc)、
`LOC ≤ OP_REVIEW_SMALL_MAX_LOC` (既定 100)、§7.1.1 の条件 3〜4 を満たす PR は investigate phase のみ Sonnet にできる
(`SENSITIVE_INVESTIGATE_SONNET=1`)。lens は 7-lens フルのまま。

### §7.1.7 phase 別 model

investigate (prep / lens-audit) は §7.1 の結果、adversarial-verify と synthesize (最終ゲート) は常に Opus。
controller が review-expert の spawn 入力 `models` に渡す (`global-review-spawn.md` 4-2-a-pre)。

## §7.2 Fable escalation gate (自動 spawn 禁止 / 人間承認 opt-in)

### §7.2 F1 — worker 自動選択の天井は Opus

- controller が spawn する expert の model は、自動決定の結果として Opus を超えない。§5 mapping・degrade からの復帰のいずれでも Fable は出ない。
- controller は難度を理由に単独で Fable を選ばない。難度の見立ては提案の材料であり、決定は F5 の人間承認。

### §7.2 F3 — read-only (非 write) spawn は Fable 禁止 (承認があっても不可)

read-only = repo のコードを変更しない spawn (文章生成も含む)。Fable を許すのは worktree でコードを書き commit する spawn だけ。

| 経路 | 該当 spawn |
|---|---|
| op-scan / op-patrol | audit (パターン1) |
| refute | skeptic spawn (`refute-contract.md`) |
| op-run | investigation (`op-run-discover`)、post-check / aux post-check、global review 全 phase |
| Utility Worker | `spec-expert` (op-spec / op-spec-patrol)、`scout` (op-report) |
| op-codev | Step A (explore)、Step C (verify)、Review 選択 2 (review-expert) |
| op-explore / デザインモック | designer-expert の既存 design system 要約 (`design-mock.md`) |

`review_finding.model_used` の schema は `["opus", "sonnet"]` のみ。

### §7.2 F4 — 提案してよい候補条件 (write phase 限定)

提案できるのは op-run の apply spawn (`op-run/SKILL.md` 1-2-g、1 run 1 回) と op-codev の Step B (`op-codev/SKILL.md` 3-B-gate、IU ごと) のみ。
提示の文面と手段は各 skill に従う。条件 (AND):

1. base model が Opus (= `task_complexity ∈ {design, integration, api-design}`)
2. 対話経路である (`--auto` では提案しない → F7)
3. `OP_FABLE_DISABLE=1` が無く、`op-config.yaml` の `fable_escalation.enabled` が `false` でない
4. 当該 run で model degrade が発生していない
5. 難度シグナル D1〜D6 のうち 2 つ以上が立つ

| id | 難度シグナル |
|---|---|
| D1 | 変更候補が 3 module 以上 または 10 file 以上 |
| D2 | 公開 API / 後方互換 / migration 同時実装 (`api-design`) |
| D3 | 重複実装の統合点設計 (`integration`) |
| D4 | 並行性 / 状態機械 / トランザクション整合が本質に絡む |
| D5 | §7.1.3 の sensitive glob に該当するファイルを変更する |
| D6 | 同 cluster / IU で `review_round >= 2` が発生済 |

ユーザーが自分から「この作業は Fable で」と明示した場合は D 条件を問わず承認済みとして扱う (F3 は解除されない)。

### §7.2 F5 — 承認 protocol

- 2 択で既定は Opus 維持。無応答・曖昧な返答は非承認。
- 承認 scope は提示した cluster / IU の write spawn のみ (同 session 内、同 cluster / IU の review-fix loop の再 apply を含む)。他へ横展開しない。
- plan file / PR 本文 / 完了サマリに「<scope-id>: <expert> を Fable へ昇格 (承認済み)」を 1 行書く。

### §7.2 F6 — config / env から Fable を選ぶことはできない

- 手動 model 指定の `fable` は無効値。無視して §5 mapping の値で spawn する。
- 設定できるのは提案を止める方向だけ (`fable_escalation.enabled: false` / `OP_FABLE_DISABLE=1`)。

### §7.2 F7 — 非対話 / `--auto` 経路

提案せず Opus で続行し (停止しない)、plan / 実行 report に skip した旨を 1 行書く。`--auto` に事前承認の抜け道は作らない。

### §7.2 F8 — degrade / unavailable

- 承認済み Fable が rate limit / unavailable なら Opus へ degrade し、PR 本文 / 完了サマリに記録する。Fable への自動再試行はしない。
- Opus が degrade 中は Fable を提案しない。

## §9 想定外時の挙動

### §9.1 暫定値と矯正

| 状況 | 挙動 |
|---|---|
| `task_complexity` が unset | `extension` 扱い (Sonnet) |
| 区画 complexity が unset (`op-config.yaml` なし) | `typical` 扱い (Sonnet) |
| Opus が rate limit / 不可用 | Sonnet に degrade し、PR 本文 / 完了報告に明記する |
| 手動 model 指定 / spawn 引数に `fable` (F6 違反) | 無視して §5 mapping の値で spawn する |
| read-only spawn に `fable` が渡された (F3 違反) | Opus に矯正して続行し、人間に報告する |
