<!--
schema_version: 3
last_breaking_change: 2026-05-16
notes: 参照先変更メモ (2026-06-14): model-selection.md が v3 → v4 に bump (Refs #720)。
       §7.1.3 に「sensitive ∩ doc-only small → investigate-phase のみ Sonnet」例外を追加。
       「sensitive glob 該当 = 全 phase Opus 強制」という既存 behavioral invariant を investigate phase に
       限り意図的に解除する破壊的変更 (§7.1.4 と同型の invariant 解除、§10 該当)。
       consumer の global-review-spawn.md (op-run/references) の pin を (>=4) に同期。
       参照先変更メモ (2026-05-23): model-selection.md が v2 → v3 に bump (Refs #493)。
       §7.1 review-expert narrow opt-down 新設。`--quality low` でも review-expert を Opus 維持する
       既存 invariant を small∩non-sensitive PR に限り意図的に解除する破壊的変更 (§10「--quality flag 値の
       挙動変更」)。consumer の op-run/SKILL.md / expert-spawn.md の pin を (>=3) に同期。
       global-review-spawn.md (op-run/references) は v1 → v2 に bump (§4-1-b 新設) だが本表は _shared/** のみ
       追跡するため新行追加不要 (additive policy)。
       参照先変更メモ (2026-05-21): expert-spawn.md が v15 → v16 に bump (Refs #367)。
       Claude Code v2.1.146 で /simplify が /code-review に rename されたのを反映し、
       修正完了報告 schema を `simplify_*` → `code_review_*` に rename + 新規 `code_review_effort`
       field 追加。v14 / v15 完了報告 (旧 simplify_* フィールド) は warning + auto-translate で受理
       (backward-compat、deprecation 期間 = 1 release)。
       参照先変更メモ (2026-05-21): apply-completion-checklist.md が v2 → v3 に bump (Refs #367)。
       apply-completion-verify.md が v1 → v2 に bump (Refs #367)。
       model-selection.md が v1 → v2 に bump + §5.5 (code-review effort-level 自動派生) 新設 (Refs #367)。
       追加メモ (2026-05-20): installed op binary 鮮度確認節を追加 (Refs #249)。
       新節追加のみ (既存節無変更) のため schema_version は bump せず。
       op-* SKILL.md フェーズ0 が本節を pointer 参照する (Single Canonical Source Rule)。
       追加メモ (2026-06-03): 鮮度確認の比較元 path を op-tools/ 全体から
       op-tools/crates/ + Cargo.toml/Cargo.lock に絞る bugfix (Refs #641)。docs-only commit (ADR 等) の
       false-drift warning を解消。pointer 参照契約は不変 (gate の呼び方・引数は変わらない) のため
       schema_version bump せず。各 OP skill SKILL.md の引用文も op-tools/crates に追従。
       参照先変更メモ (2026-05-17): clustering.md が v4 → v5 に bump (Refs #119)。
       directory hint (per-directory / per-module slicing) を Step 2 に追加。additive のため既存クラスタ結果は変わらない。
       参照先変更メモ (2026-05-17): expert-spawn.md が v12 → v13 に bump (Refs #120)。
       investigation report に e2e_verification_plan / 修正完了報告に simplify_* field を追加。
       deprecation 期間 = 1 release。旧 v12 prompt は warning 止め (自動失敗なし)。
       参照先変更メモ (2026-05-16): issue-enrichment.md が v1 → v2 に bump (Refs #80)。
       op-plan/SKILL.md は (>=2) に更新済み。op-scan/SKILL.md 等は wave 別 PR で対応、v1 でも warning 止まり。
       v3 (2026-05-16) — 起動時チェック手順節 (フェーズ0) に「主語: OP skill / commander 専用」注釈を追加。
       同節内の挙動表の見出しも「OP skill / commander が実行する場合」と明記し、
       expert subagent は末尾の「Invocation Mode との関係」節を参照することを明示。
       --auto 停止ルール (commander 向け) と version_check_warning 続行ルール (subagent 向け) が
       同一ファイル内で矛盾なく共存できるよう主体を分離した。
       v2 (2026-05-04) — Invocation Mode 整合。schema mismatch 時のユーザー確認責務を
       「OP skill / commander のみ」に限定。OP-managed Mode の expert subagent は version mismatch を
       検出してもユーザーに質問せず、`version_check_warning` として返すか、渡された prompt の方針に従う。
       詳細は `_shared/invocation-mode.md` を参照。
       v1 初版: version-check 仕組み自体のメタ仕様。schema_version 0 は欠番。
-->

# _shared/ schema_version 整合性チェック

/**
 * 機能概要: op-* SKILL.md 起動時に、依存する _shared/*.md の schema_version が
 *           SKILL.md 側の requires pin を満たしているかを検査する手順を定義する。
 * 作成意図: pr-templates / expert-spawn / clustering 等の共有層を変更すると、
 *           参照する全 op-* に無告知で波及していた。版を pin して破壊的変更を可視化する。
 * 注意点: mismatch でも自動失敗はさせない。warning + ユーザー確認に留め、
 *         「このバージョンで進めてよいか」をユーザー判断に委ねる。
 *         破壊的変更は別ファイル並列稼働 (例: pr-templates-v2.md) で SKILL.md ごとに移行する。
 */

op-* スキル群が参照する `_shared/*.md` は HTML コメントによるメタデータ block で版を表明する。
SKILL.md 側は「参照ドキュメント」節で `(>=N)` 形式の最低版を指定する。
本ドキュメントは検査手順と mismatch 時の対応を定義する。

---

## メタデータ block の形式

各 `_shared/*.md` (本ファイルと `ROADMAP.md` を除く) は冒頭に以下を記述する:

```markdown
<!--
schema_version: 1
last_breaking_change: 2026-05-03
notes: 短い変更経緯
-->

# <タイトル>
...
```

| フィールド | 意味 |
|----------|------|
| `schema_version` | 整数。破壊的変更で +1 する (新規セクション追加・既存テンプレ拡張は含めない) |
| `last_breaking_change` | YYYY-MM-DD。最後に schema_version を上げた日付 |
| `notes` | 1〜2 行で版変更の経緯。後から版差分を追跡する手がかり |

非破壊的変更 (typo 修正・例追加・既存節の補強) は版を上げない。
破壊的変更の判定基準:

- 既存セクションを削除した
- 既存テンプレの必須フィールドを変更・削除した
- 既存テンプレの hidden marker 仕様を変更した
- 既存ルールの優先順位を変更した
- 引数名・キー名を変更した

---

## SKILL.md 側の requires pin

各 `op-*/SKILL.md` の「## 参照ドキュメント」節で、依存する `_shared/*.md` ごとに最低版を指定する:

```markdown
## 参照ドキュメント

各エントリの `(>=N)` は本 SKILL.md が前提とする最低 schema_version。
起動時 (フェーズ0) に各ファイルの冒頭 `schema_version` を読み、満たさない場合は
`_shared/version-check.md` の手順に従い warning + 続行可否確認。

- `~/.claude/skills/_shared/expert-spawn.md` (>=1) — 説明
- `~/.claude/skills/_shared/pr-templates.md` (>=1) — 説明
- `~/.claude/skills/_shared/active-expert-registry.md` (>=2) — active expert の runtime-spawnable canonical registry
...
```

`(>=N)` は最低版のみで上限は指定しない。後方互換のある拡張は自動で取り込まれる前提。

`active-expert-registry.md` も通常の `_shared/*.md` と同じく schema_version チェック対象とする。
agent / skill 対応表は runtime routing に直接影響するため、参照する OP skill は `(>=N)` pin を持つ。

---

## 起動時チェック手順 (フェーズ0)

> **主語: OP skill / commander 専用ルール**
> 本節の手順と挙動 (ユーザー確認・`--auto` 停止) は **OP skill (op-scan / op-run / op-merge /
> op-patrol / op-architect) が main context として実行する際** に適用される。
> OP skill から spawn された expert subagent には適用されない — subagent の取り扱いは
> 本ファイル末尾の「Invocation Mode との関係」節を参照。

司令官 (main Claude) は SKILL.md のフェーズ0 (環境確認) の直後に以下を実行する:

1. 「## 参照ドキュメント」節を Read で取得し、各 `(>=N)` を抽出する
2. 各 `_shared/*.md` の冒頭 (offset 1, limit 6 程度) を Read で取得し、`schema_version` を読み取る
3. `actual_version < required_min` のものがあれば mismatch として一覧化する

判定結果に応じた挙動 (OP skill / commander が実行する場合):

| 状態 | 挙動 |
|------|------|
| 全 pass | 黙って次フェーズへ |
| mismatch (1 件以上) | warning 表示 + 続行可否をユーザーに確認 (--auto モードでも一旦停止) |
| メタデータ block なし | warning 表示 (`schema_version 未表明`) + 続行可否確認 |

mismatch 時の warning フォーマット例:

```
[op-run] _shared 整合性 warning:
  - pr-templates.md: requires >=2, found 1 (schema_version が古い可能性)
  - clustering.md:   requires >=1, found 1 (OK)

このまま続行しますか? (yes/no)
- yes: 動作不整合の責任はユーザーが負う
- no:  pr-templates.md を更新するか、SKILL.md の pin を見直す
```

`--auto` モードでも mismatch 検出時は停止する。整合性失敗を黙ってスキップしてはならない。
(注: 本ルールは OP skill / commander 専用。expert subagent の `--auto` 相当挙動は「Invocation Mode との関係」節を参照)

---

## 破壊的変更の運用 (並列ファイル稼働)

`schema_version` を上げる破壊的変更を行う場合、いきなり既存ファイルを置き換えない。
新旧 SKILL.md が同じ context で動いている可能性があるため、以下の段階移行を採る。

### 段階1: 新版を別ファイルとして併走

```
_shared/
  pr-templates.md       (schema_version: 1)  — 既存
  pr-templates-v2.md    (schema_version: 2)  — 新版を別ファイルで導入
```

新版 SKILL.md は `pr-templates-v2.md (>=2)` を参照、旧 SKILL.md はそのまま `pr-templates.md (>=1)` を参照する。

### 段階2: 全 SKILL.md が新版に追従

すべての SKILL.md の参照を `-v2.md` に切り替える。

### 段階3: 旧版を削除

旧 `pr-templates.md` を削除し、`pr-templates-v2.md` を `pr-templates.md` にリネーム。
全 SKILL.md の参照を元のファイル名に戻す。

この 3 段階を経ることで、移行途中の SKILL.md が壊れない。
小規模な破壊的変更 (1 セクションのみ) は段階1 を省略して直接版を上げてもよいが、
その場合は ROADMAP.md に明記し、影響を受ける全 SKILL.md を同じ commit で更新する。

---

## 版を上げない方が良い変更

以下は schema_version を上げず、`last_breaking_change` も触らない:

- typo / 表現の調整
- 既存セクション内の例追加
- コメント追加
- 既存ルールの言い換え (意味が変わらない範囲)
- 新規セクション追加 (既存依存先が壊れない)

迷ったら版を上げる側に倒す。後方互換の保証は SKILL.md の `(>=N)` で表現される。

---

## 例外: ROADMAP.md と universal-design.md

- `ROADMAP.md` は管理ドキュメントのため schema_version 不要。op-* は参照しない。
- `universal-design.md` は `ux-ui-audit-expert` (検出基準) と `designer-expert` (設計指針) が参照する想定。
  op-* SKILL.md からは直接参照されないが、将来の参照に備え schema_version を持つ。

---

## チェックを省略してよい場面

以下では起動時チェックを省略してもよい:

- `--from-issue` のような委譲呼び出し (呼び出し元の SKILL.md がチェック済み)
- 同一 context で既に同じ SKILL.md が実行済み (重複チェックは無意味)

ただし context が再開された場合 (compaction 後など) は再チェックする。

---

## CI schema-check 統合 (pin drift の自動可視化)

> **適用範囲**: `.github/workflows/op-tools-ci.yml` の `schema-check` job が自動実行する。
> op-tools/** または skills/** に変更がある PR / push / schedule / workflow_dispatch で動く。
> 本節は CI 統合の pointer のみ。実装は workflow ファイルを参照。

### 概要 (Issue #404)

`op core schema-check` を PR ごとに CI で実行し、prose-meta / rust-drift / skill-pin / prose-example
の 4 lens で drift 件数を `$GITHUB_STEP_SUMMARY` に可視化する。

`--strict` は使用しない。`R-SKILL-PIN-AHEAD = info` は forward-compat OK なため、
block にすると schema_version bump PR が毎回 28+ ファイル更新必須になり過剰となる。
目的は「drift が増えている」trend の可視化のみ。

### CI が blocking する条件

`stats.errors_total >= 1` の場合のみ CI を fail させる (blocking severity のみ)。
warnings / info は CI を通過させ、PR Summary で trend 観察に使う。

### 手動実行

```bash
# repo root から実行
cd op-tools
cargo build --release -p op
./target/release/op core schema-check --repo-root ..
```

または installed binary がある場合:

```bash
op core schema-check
```

### 参照

- CI 実装: `.github/workflows/op-tools-ci.yml` の `schema-check` job
- spec: `op-tools/docs/specs/schema-check.md`
- 関連 Issue: #404 (CI 統合)、#382 (28+18 file pin drift の発端)

---

## installed op binary 鮮度確認 (フェーズ0 補助 gate)

> **適用範囲**: OP skill (op-scan / op-patrol / op-run / op-merge / op-architect / op-plan) の
> フェーズ0 で `_shared/*.md` 整合性チェックの直後に **任意 (warning のみ)** で実行する。
> hard fail にはしない (offline / WIP 開発を阻害しない)。

### 背景

`op --version` は従来 `op 0.1.0` のみを返していたため、installed binary と op-tools source の
鮮度不一致が **検出不能** だった。controller が 1 日古い installed binary を使って
op-tools 最新 source の新機能を「未実装」と誤認する drift が発生する (Issue #249)。

Issue #249 で `op --version` に build metadata 露出 (`op 0.1.0 (commit <sha>, built <ts>)`) と
`op version --json` 構造化サブコマンドが追加された。本節はその活用手順 = 鮮度 verify gate を定義する。

### 手順

```bash
# 1) installed binary の git_sha を取得 (--json なしの古い installed は fallback 経路)
INSTALLED_SHA="$(op version --json 2>/dev/null | jq -r '.details.git_sha' 2>/dev/null || echo 'unknown')"

# 2) op-tools source の最新 commit SHA (短縮 7 桁) を取得
# repo root から実行する前提。サブディレクトリで動かす場合は git rev-parse --show-toplevel で root に上がる
# 比較元 path は binary 挙動に影響する範囲に絞る (Issue #641): op-tools/docs (ADR markdown 等) だけの
# commit は binary を変えないため鮮度基準に含めない。crates/ (binary 本体) + Cargo.toml/Cargo.lock
# (workspace 直下の依存定義 = binary に影響しうる) のみを対象にして false-drift warning を防ぐ。
SOURCE_SHA="$(git log --format='%h' -n1 -- op-tools/crates/ op-tools/Cargo.toml op-tools/Cargo.lock 2>/dev/null || echo 'unknown')"

# 3) 比較 (どちらかが unknown なら warning、不一致でも warning)
if [ "$INSTALLED_SHA" = "unknown" ] || [ "$SOURCE_SHA" = "unknown" ]; then
  echo "[version-check] installed op binary 鮮度: 不明 (--json 不在の古い binary か git 履歴なし環境)"
  echo "  → cargo install --path op-tools/crates/op で最新化を推奨"
elif [ "$INSTALLED_SHA" != "$SOURCE_SHA" ]; then
  echo "[version-check] installed op binary が op-tools/crates source と不一致 (installed=$INSTALLED_SHA, source=$SOURCE_SHA)"
  echo "  → cargo install --path op-tools/crates/op で再ビルドを推奨"
fi
```

### 判定ルール

| 状態 | 挙動 |
|------|------|
| installed `git_sha` = source `git_sha` | 黙って次へ |
| installed `git_sha` ≠ source `git_sha` | warning + `cargo install --path op-tools/crates/op` を案内 |
| installed が `op version --json` 非対応 (古い) | warning + 同上案内 (`fallback 経路`) |
| repo に op-tools/ が存在しない (OP skill repo 外) | gate skip |

### 不変則

- **hard fail にしない**: warning のみ。`--auto` モードでも停止しない (offline 対応)
- **古い installed の fallback**: `op version --json` が無い installed は `INSTALLED_SHA=unknown` 経路に倒し、続行する (chicken-and-egg 回避)
- **OP skill 専用**: 本 gate は OP skill / commander 主体。OP-managed Mode の expert subagent は本 gate を実行しない (Invocation Mode との関係節を参照)
- **任意 gate**: フェーズ0 整合性チェックと違い、本 gate を呼ばない SKILL.md があっても schema_version mismatch にはならない (新規追加なので)

### 自動テストについて

warning 経路の自動テストは shell 環境差異が大きく難しいため、本節は手動 verify 手順として doc に明記する。
op binary 側の機能 (`op --version` / `op version --json`) は op-tools の単体テスト (`tests/cli_version.rs`) で
covered (Issue #249 apply 時)。

---

## Invocation Mode との関係 (重要)

schema mismatch 時の **ユーザー続行可否確認は OP skill / commander の責務**。
OP-managed Mode の expert subagent は version mismatch を検出してもユーザーに質問しない。

| 主体 | mode | mismatch 検出時の挙動 |
|------|------|---------------------|
| OP skill (op-scan / op-run / op-merge / op-patrol / op-architect) | Direct Mode 相当 | warning + ユーザー確認 (本ドキュメントの上記手順) |
| Direct で起動された expert (人間が直接呼ぶ) | Direct Mode | ユーザーに mismatch を提示し、続行可否を確認してよい |
| OP skill から spawn された expert subagent | OP-managed Mode | ユーザーに質問しない。下記いずれかで返す |

### OP-managed Mode の expert subagent の取り扱い

mismatch を検出しても、subagent は質問で停止しない。以下のいずれかで返す:

1. spawn prompt に明示的な version_check 方針 (続行 / 中断) があればそれに従う
2. それ以外は完了報告に `version_check_warning` を含めて続行する
   ```yaml
   version_check_warning:
     ref: "<対象ファイル>"
     required_min: <N>
     actual: <M>
     impact: "<想定される影響>"
   ```
3. mismatch が apply の安全性に直接影響する場合のみ、`needs_human_decision` で
   「中断 / 強行 / spawn 元で再判定」を選択肢として返し、stop はせず audit を続行する

つまり expert subagent は mismatch を **commander に伝える** 責務のみを負い、
ユーザー確認は OP skill 側で行う。

---

## _shared ファイル 現行 schema_version 一覧 (current_version 集約)

<!--
機能概要: _shared/ 配下全ファイルの現行 schema_version を 1 箇所に集約する。
作成意図: expert-spawn.md に散在していた (>=N) 表記の「N とは何か」を調べるために
         各ファイルを個別 Read しなければならなかった。一覧化で参照コストを削減する。
注意点: 各ファイルを変更した際は本表を合わせて更新すること (Single Canonical Source Rule)。
       schema_version の正本は各ファイル冒頭の HTML コメント — 本表は集約用 summary。
-->

| ファイル | current_version | last_breaking_change |
|---------|-----------------|----------------------|
| `expert-spawn.md` | 16 | 2026-05-21 |
| `pr-templates.md` | 13 | 2026-05-17 |
| `labels-and-markers.md` (markers/) | 8 | 2026-05-22 |
| `active-expert-registry.md` | 3 | 2026-05-08 |
| `clustering.md` | 6 | 2026-05-21 |
| `runtime-contract.md` | 2 | 2026-05-07 |
| `apply-completion-checklist.md` | 4 | 2026-05-24 |
| `apply-completion-verify.md` | 3 | 2026-05-24 |
| `severity-rubric.md` | 4 | 2026-05-05 |
| `dedup-policy.md` | 3 | 2026-05-05 |
| `auto-policy.md` | 3 | 2026-05-04 |
| `common-setup.md` | 3 | 2026-05-29 |
| `issue-enrichment.md` | 2 | 2026-05-16 |
| `planned-experts.md` | 3 | 2026-06-20 |
| `universal-design.md` | 2 | 2026-05-03 |
| `worktree-ops.md` | 3 | 2026-05-21 |
| `post-check-markers.md` (markers/) | 2 | 2026-05-17 |
| `ux-ui-markers.md` (markers/) | 2 | 2026-05-17 |
| `merge-gate-markers.md` (markers/) | 2 | 2026-05-07 |
| `invocation-mode.md` | 1 | 2026-05-04 |
| `model-selection.md` | 4 | 2026-06-14 |
| `op-config-schema.md` | 1 | 2026-05-13 |
| `pr-meta-helpers.md` | 1 | 2026-05-17 |
| `project-profile.md` | 1 | 2026-05-03 |
| `runtime-verification.md` | 1 | 2026-05-03 |
| `github-channel.md` | 2 | 2026-07-22 |
| `claim-markers.md` (markers/) | 1 | 2026-05-17 |
| `patrol-markers.md` (markers/) | 2 | 2026-07-23 |
| `review-markers.md` (markers/) | 2 | 2026-07-23 |
| `security-markers.md` (markers/) | 1 | 2026-05-06 |
| `version-check.md` | 3 | 2026-05-16 |

> **additive-only policy**: 上記テーブルの更新と新行追加は schema_version の bump を要しない。
> schema_version が変わるのは breaking change (既存フィールドの削除 / 型変更 / marker 仕様変更 / 必須化) のみ。
> 詳細は `expert-spawn.md` の `additive_only_policy` 節を参照。

> **参照側 pin 規約 (Issue #382)**: 参照側 SKILL.md / references / agents は `expert-spawn.md` /
> `apply-completion-checklist.md` の version 数値を `(>=N)` 形式で pin しない。これらは非 blocking warning で
> 低価値かつ、pin すると bump のたびに ~28 ファイルを sync する追従コストが残るため。両ファイルの現行版は
> 本集約節 (上記 current_version テーブル) が唯一の正本であり、参照側は純粋な pointer (ファイル参照のみ) とする。
> これにより将来の bump で参照側が再 drift しない。
