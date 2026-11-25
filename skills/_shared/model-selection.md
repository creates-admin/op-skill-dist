# Model Selection: Phase × Expert × Complexity → Model

OP skill が spawn する expert にどの model を割り当てるかの正本。OP-managed Mode では controller が §6 のフローで決めた値を
`Agent({ model })` に渡す (agent frontmatter の `model:` は Direct Mode の default としてのみ使われる)。
`Agent({ model })` には論理名 (`opus` / `sonnet` / `fable`) を渡す。

## §1 model 階層

- worker の自動選択は Sonnet / Opus の 2 段で、天井は Opus (§7.2 F1)。
- Fable は自動選択も提案もしない。人間が自分から指定した write spawn のみ (§7.2)。
- Haiku はどの mapping にも出ない。

## §2 task_complexity 区分 (apply 向け)

| 区分 | 意味 | 例 |
|---|---|---|
| `routine` | 既存パターン直適用 | token / rename / 典型 null チェック / clippy 修正 |
| `extension` | 既存パターン拡張 | 既存 endpoint に field 追加、既存 hook の拡張 |
| `design` | 新規設計含む | 新規 feature 設計 / 新規 domain object / 新規 workflow |
| `integration` | silent fork 統合 / cross-module 横断 | 重複実装の統合点設計、多 module 同期変更、migration 同時実装 |
| `api-design` | API 契約 / 後方互換 / 拡張点判断 | 公開 API 変更、契約設計、命名規約決定 |

- Issue 単位の属性。複数 Issue をまとめて 1 体に渡すときは最も重い Issue で決める。
- Issue 起票時 (op-plan / op-architect / op-scan / op-patrol) に本文へ書くか、無ければ apply を spawn する controller が Issue 本文から判定する。

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
| apply | §5.3 |

### §5.2 scan / patrol audit (区画 complexity × expert)

- `complex` / `critical` 区画は Opus、`single` / `typical` は Sonnet。
- test-expert は区画によらず Sonnet。
- feature-expert (op-scan `--include-feature` 時のみ audit に登場) は §5.3 と同じ規則 (未判定は Sonnet)。

### §5.3 apply (expert × task_complexity)

- `design` / `integration` / `api-design` は Opus、`routine` / `extension` は Sonnet。全 apply expert 共通 (ux-ui-audit-expert は apply しない)。
- 1 体に複数 Issue を渡すときは最も重い task_complexity で決める (Issue ごとに切り替えない)。

## §5.5 code-review effort-level 自動派生

controller は apply spawn の `code_review_effort` を次で決め、apply spawn prompt に渡す。値は `expert-report-schemas.md` 修正完了報告 schema の
`code_review_effort` に入り、agent は built-in の `code-review` skill に渡す (`auto` / `null` なら `high`)。
invoke 手順の正本は `apply-completion-checklist.md` §2。

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
| 2. Fable | write spawn のみ。人間が自分から指定した場合だけ Fable (§7.2) |
| 3. explicit override | Issue / cluster の手動 model 指定を最終値にする。値域は `opus` / `sonnet`。`fable` は無効値 (§7.2 F6) |

- step 2 は read-only spawn では評価しない (§7.2 F3)。step 3 は 2 の結果を上書きできるが `fable` は書けない。
- Direct Mode は上記を適用せず、`agents/<expert>.md` frontmatter の `model:` が default。Opus を使うには `Agent({ model: "opus" })` を明示する。

## §7 (欠番)

## §7.2 Fable (自動 spawn 禁止 / 人間の指定だけ)

### §7.2 F1 — worker 自動選択の天井は Opus

- controller が spawn する expert の model は、自動決定の結果として Opus を超えない。§5 mapping・degrade からの復帰のいずれでも Fable は出ない。
- controller は難度を理由に Fable を選ばず、提案もしない。

### §7.2 F3 — read-only (非 write) spawn は Fable 禁止 (承認があっても不可)

read-only = repo のコードを変更しない spawn (文章生成も含む)。Fable を許すのは worktree でコードを書き commit する spawn だけ。

| 経路 | 該当 spawn |
|---|---|
| op-scan / op-patrol | audit (パターン1) |
| refute | skeptic spawn (`refute-contract.md`) |
| Utility Worker | `spec-expert` (op-spec / op-spec-patrol)、`scout` (op-report / op-intake) |
| op-explore / デザインモック | designer-expert の既存 design system 要約 (`design-mock.md`) |

`review_finding.model_used` の schema は `["opus", "sonnet"]` のみ。

### §7.2 F4 — 人間の指定

- 人間が自分から「この作業は Fable で」と指定した write spawn だけを Fable にする (F3 は解除されない)。
- 指定の scope はその作業の write spawn のみ (同 session 内の再 apply を含む)。他へ横展開しない。
- PR 本文 / 完了サマリに「<scope-id>: <expert> を Fable で実行 (人間の指定)」を 1 行書く。
- `OP_FABLE_DISABLE=1` か `op-config.yaml` の `fable_escalation.enabled: false` なら指定があっても Opus で続け、その旨を伝える。

### §7.2 F6 — config / env から Fable を選ぶことはできない

- 手動 model 指定の `fable` は無効値。無視して §5 mapping の値で spawn する。
- 設定できるのは止める方向だけ (`fable_escalation.enabled: false` / `OP_FABLE_DISABLE=1`)。

### §7.2 F8 — degrade / unavailable

- 指定された Fable が rate limit / unavailable なら Opus へ degrade し、PR 本文 / 完了サマリに記録する。Fable への自動再試行はしない。

## §9 想定外時の挙動

### §9.1 暫定値と矯正

| 状況 | 挙動 |
|---|---|
| `task_complexity` が unset | `extension` 扱い (Sonnet) |
| 区画 complexity が unset (`op-config.yaml` なし) | `typical` 扱い (Sonnet) |
| Opus が rate limit / 不可用 | Sonnet に degrade し、PR 本文 / 完了報告に明記する |
| 手動 model 指定 / spawn 引数に `fable` (F6 違反) | 無視して §5 mapping の値で spawn する |
| read-only spawn に `fable` が渡された (F3 違反) | Opus に矯正して続行し、人間に報告する |
