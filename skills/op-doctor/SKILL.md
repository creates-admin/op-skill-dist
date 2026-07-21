---
name: op-doctor
description: コードでなく「環境・依存・toolchain・lockfile・CI・OSV」の repo 健康診断を行う独立 OP skill。env inventory / command matrix (build・test・lint・audit の存在) / 依存 + OSV summary / lockfile 整合 / toolchain drift / CI-local 不一致 の 6 項目を診断し、OP Doctor Report (人間可読) + Critical/High のみ recommended Issue を起票する。Direct Mode 固定。「op-doctor」「健康診断」「環境診断」「doctor」「依存チェック」「toolchain」「lockfile」等のキーワードで起動。
---

<!--
schema_version: 1
last_breaking_change: 2026-06-21
notes: v1 (2026-06-21) — 初版。ADR-0005 (docs/adr/0005-op-doctor-skill.md, Accepted) に基づく新規作成。
       env-expert は active 化せず、op CLI primitive (決定論 inventory) + security-expert (OSV, active) +
       debug-expert (build/command 失敗, active) の substitute-MVP で先行する。
       op doctor primitive 実装と診断フロー配線・CLAUDE.md/implementation-order/markers 反映は別 Issue (#778/#779)。
       本 SKILL.md は薄い orchestrator 正本として後続 Issue が依拠する仕様を確定する。
       severity gate / enrichment / dedup / marker / label は op-scan の既存正本を参照する (新正本を作らない)。
-->

<!--
機能概要: op-doctor は「repo の環境健全性」を診断する独立 OP skill。op-scan/op-patrol が
         コードの欠陥を見るのに対し、本 skill は環境・依存・toolchain・lockfile・CI を見る
         (検出対象集合は disjoint)。6 項目を診断し OP Doctor Report を出力、Critical/High のみ
         recommended Issue を起票する。
作成意図: roadmap §8.1 (Phase 3 / P0) の op-doctor 未達を breadth 再開の一環で降ろす (ADR-0005)。
         env-expert (planned) を待たず、op CLI primitive + 既存 active expert (security-expert /
         debug-expert) の substitute-MVP で MVP を先行させる。CLAUDE.md §17.1 (需要証明前に
         active expert を増やさない) が責務配置の根拠。
注意点: Direct Mode 固定 (人間起動、診断結果の解釈は相談的)。env-expert は spawn しない
         (planned-experts.md の substitute 規約に従い、metadata でも「将来候補」表現に留める)。
         決定論ロジック (toolchain/lockfile/command inventory) は op-tools primitive (op doctor *) に
         外出しし、SKILL.md は薄い orchestrator に保つ。severity rubric / enrichment / dedup /
         marker / label は op-scan の既存正本を参照し、本 SKILL.md 内に再定義しない (Single Canonical Source Rule)。
         本 v1 は仕様正本。op doctor primitive 実装・診断フロー配線・CLAUDE.md/markers 反映は別 Issue。
-->

# op-doctor: 環境・依存・toolchain の repo 健康診断

/**
 * 機能概要: repo の環境健全性 (env inventory / command matrix / 依存+OSV / lockfile 整合 /
 *           toolchain drift / CI-local 不一致) を診断し、OP Doctor Report を出力、
 *           Critical/High のみ recommended Issue を起票する独立 OP skill。
 * 作成意図: op-scan/op-patrol が見ない「環境」を診断する入口を作る (ADR-0005)。
 *           env-expert を active 化せず substitute-MVP で先行する。
 * 注意点: Direct Mode 固定。env-expert を runtime spawn しない。
 *         決定論部分は op doctor primitive に外出し、severity gate 等は op-scan 正本を流用。
 */

repo の **環境健全性** を診断し、OP Doctor Report を出力する。
コードの欠陥は見ない (それは op-scan / op-patrol の責務)。
**Issue 起票はユーザー承認後のみ。** 診断自体は環境を変更しない (read-only)。

---

## 位置づけ (既存 OP skill との境界)

```text
op-scan    = コードの問題検出・Issue 指示書化 (severity rubric = コード欠陥)
op-patrol  = コードの巡回監視
op-doctor  = 環境・依存・toolchain・lockfile・CI の repo 健康診断 (コードを見ない)
```

op-doctor は **コードの欠陥を見ない**。逆に op-scan/op-patrol は **環境を見ない**。
両者は検出対象集合が disjoint であり、責務は重ならない (ADR-0005 「位置づけ」節)。

| 処理 | 担当 |
|------|------|
| コードのバグ / 構造 / 性能 / 脅威 / 体験 / 意匠の検出 | op-scan / op-patrol |
| toolchain version / 必須コマンドの存在 / lockfile 整合 / CI-local 不一致 / OSV summary | **op-doctor (本 skill)** |
| auto/* branch / 失敗 worktree / stale 資産の後始末 | op-sweep / op-cleanup |

---

## 実行モード (Direct Mode 固定)

op-doctor は **Direct Mode 固定** (人間起動。診断結果の解釈は相談的)。
Invocation Mode の判定契約は `skills/_shared/invocation-mode.md` に従う。
op-* skill から自動 spawn される OP-managed 経路は持たない。

| オプション | 型 | デフォルト | 説明 |
|-----------|---|-----------|------|
| *(なし)* | — | — | 6 項目を診断し OP Doctor Report を表示、Critical/High は起票候補として提示 (起票はユーザー承認後) |
| `--auto` | flag | false | Critical/High を自動起票 (重複除外あり)。起票条件は op-scan の auto-policy に準拠 |
| `--check <項目>` | string | all | 診断項目を限定 (例: `--check deps,lockfile`。項目名は下記「診断 6 項目」) |
| `--no-enrichment` | flag | false | enrichment 層を skip (旧挙動互換、`issue-enrichment.md` 参照) |

> `--auto` 起票は op-scan と同じ severity gate + auto-policy (8 条件 AND) を流用する。
> 環境固有の起票ルールを本 SKILL.md に新設しない。

---

## 診断 6 項目 (ADR-0005「op-doctor skill の責務」)

| # | 項目 (`--check` 名) | 内容 | 主担当 |
|---|--------------------|------|--------|
| 1 | `env` | env inventory: toolchain version / 必須コマンドの存在 | op CLI primitive (決定論) |
| 2 | `commands` | command matrix: build・test・lint・audit コマンドの存在 | op CLI primitive (決定論) |
| 3 | `deps` | 依存 + OSV summary: 依存脆弱性 / supply-chain risk | security-expert (active) |
| 4 | `lockfile` | lockfile 整合: package manager / lockfile の不整合 | op CLI primitive (決定論) |
| 5 | `toolchain` | toolchain drift: 宣言と実体の version 乖離 | op CLI primitive (決定論) + 深い推論は debug-expert |
| 6 | `ci-local` | CI-local 不一致: CI で使うコマンドと local で使えるコマンドの差 | op CLI primitive (command matrix 比較) + 失敗 RCA は debug-expert |

決定論 inventory (項目 1/2/4/5/6 の機械収集) は **expert 推論を要さない**ため、
SKILL.md の bash fence に書かず `op doctor *` primitive (read-only JSON) に外出しする
(ADR-0005「op CLI primitive 化の境界」/ CLAUDE.md bash fence convention / implementation-order.md)。
build/test/lint/audit コマンドの **失敗時 RCA** と toolchain 互換の **深い推論** のみ
debug-expert を spawn する。OSV/依存脆弱性は security-expert を spawn する。

---

## expert 構成 (substitute-MVP / env-expert を spawn しない)

op-doctor は env-expert (planned) を runtime spawn しない。
`skills/_shared/planned-experts.md` の env-expert substitute をそのまま採用する (ADR-0005「substitute-MVP」)。

| 構成要素 | 役割 | 状態 |
|---------|------|------|
| **op CLI primitive** (`op doctor *`) | toolchain version / lockfile consistency / command 存在の **決定論 inventory** → JSON を返す | op-tools 方向 (別 Issue で段階実装) |
| **security-expert** (active) | OSV / 依存脆弱性 / supply-chain risk | runtime spawn 可 |
| **debug-expert** (active) | build / command / CI job 失敗の根本原因、toolchain 互換の深い推論 | runtime spawn 可 |
| **needs_human_decision** | tool install policy / org policy 等は人間に倒す | 構造化返却 |

### env-expert を spawn target に書かない (planned 規約)

- env-expert は **planned のまま** (active 化しない、ADR-0005「env-expert の状態」)。
- runtime spawn target として記述しない。`skills/_shared/active-expert-registry.md` の
  active expert (security-expert / debug-expert) と op CLI primitive 経由でのみ環境診断を賄う。
- op-doctor の Issue / Report で env-expert に触れる場合も、routing metadata では
  **「将来候補」表現**に留める (`planned-experts.md` の spawn 前 normalize 規約)。
  もし routing 値に env-expert が現れた場合は spawn 前に substitute へ normalize する
  (詳細は `skills/_shared/runtime-contract.md` の判定優先順位)。
- substitute で **精度不足が常態化** した実測が得られたときに限り、env-expert active 化を
  別 ADR / CLAUDE.md §17.1 基準で再検討する (ADR-0005「例外条件」)。

---

## OP Doctor Report (出力)

診断結果は人間可読な **OP Doctor Report** として提示する。
Critical/High の finding のみ recommended Issue 起票候補とする (medium 以下は Report に記すが起票しない)。

Report の構成 (人間可読):

```text
=== OP Doctor Report ===
対象 repo: <owner/repo>  診断日時: <RFC3339>

[1] env inventory ........... OK | WARN | FAIL
[2] command matrix .......... OK | WARN | FAIL
[3] deps + OSV summary ...... OK | WARN | FAIL
[4] lockfile 整合 ........... OK | WARN | FAIL
[5] toolchain drift ......... OK | WARN | FAIL
[6] CI-local 不一致 ......... OK | WARN | FAIL

--- Critical / High findings (起票候補) ---
- [High] <summary> (項目: deps, 担当: security-expert)
- [Critical] <summary> (項目: ci-local, 担当: debug-expert)

--- Medium / Low (起票しない、参考) ---
- [Medium] <summary>

起票するには承認してください ([y/N])。--auto では重複除外して自動起票します。
========================
```

---

## 起票 gate (op-scan 正本を流用 / 新正本を作らない)

> **正本を増やさない (Single Canonical Source Rule, CLAUDE.md 不変則 1)。**
> severity rubric / enrichment / dedup / marker / label は op-scan の既存正本を参照する。
> op-doctor SKILL.md 内に再定義しない (ADR-0005「正本を増やさない」)。

| 概念 | 流用する正本 |
|------|------------|
| severity 判定 (Critical/High のみ起票) | `skills/_shared/severity-rubric.md` |
| 起票前 enrichment (Design Plan / cross-review) + 起票前 review 不変則 (不変則 8) | `skills/_shared/issue-enrichment.md` |
| 重複判定 (open Issue との dedup) | `skills/_shared/dedup-policy.md` |
| `--auto` 自動起票の 8 条件 AND | `skills/_shared/auto-policy.md` |
| hidden marker (op-domain / op-source / op-run-expert 等) | `skills/_shared/markers/labels-and-markers.md` |

起票時の基本契約:

- **Critical / High のみ** 起票する (severity-rubric.md に従う)。Medium 以下は Report に記すのみ。
- 起票前に enrichment 層を必ず通す (`--no-enrichment` で opt-out 可、CLAUDE.md 不変則 8)。
- open Issue と重複するものは起票しない (dedup-policy.md)。
- `--auto` は auto-policy.md の 8 条件 AND を満たすもののみ自動起票。
- `requires_runtime` / `inferred` / `low confidence` は `manual_review_bucket` に保持する (起票しない)。

### op-source marker の扱い (依存: 配線 Issue で正本登録)

起票する Issue の hidden marker は `markers/labels-and-markers.md` を正本とする。
ただし **`op-source` の canonical 値リストに `op-doctor` はまだ登録されていない**
(現状: op-scan / op-patrol / op-architect / op-run / op-merge / op-plan / op-report)。
`op-source: op-doctor` の追加と CLAUDE.md / markers 反映は **別 Issue (配線, #778 系)** の責務であり、
本 SKILL.md (仕様正本) では新値を勝手に canonical 化しない (Single Canonical Source Rule)。
配線 Issue 完了までは、op-doctor 起票 Issue の op-source は配線 Issue で確定する値に従う
(暫定回避を本 SKILL.md に書かない)。

---

## 起動コマンド

```text
/op-doctor                          # 6 項目を診断し OP Doctor Report 表示 → 承認後に Critical/High 起票
/op-doctor --auto                   # Critical/High を自動起票 (重複除外、auto-policy 準拠)
/op-doctor --check deps,lockfile    # 診断項目を限定 (deps + lockfile のみ)
/op-doctor --no-enrichment          # enrichment 層を skip (旧挙動互換)
```

---

## フロー (薄い orchestrator)

> 本 v1 で **primitive 呼び出し → expert 深掘り → enrichment → 起票** を一気通貫で配線する (#778)。
> 決定論 inventory は `op doctor *` primitive (read-only JSON) に外出しし、SKILL.md は薄い
> orchestrator に保つ。severity gate / enrichment / dedup / marker は既存正本への pointer に留め、
> 本節に再定義しない (Single Canonical Source Rule, CLAUDE.md 不変則 1)。
> `op-source: op-doctor` の canonical 値登録は #779 の責務 (上記「op-source marker の扱い」節)。

| フェーズ | 処理 | 担当 |
|---------|------|------|
| 0. 環境確認 | gh 認証 / git 状態 / `_shared/*.md` schema_version チェック (version-check.md 手順) | controller |
| 1. 決定論 inventory | `op doctor env` で toolchain / lockfile / command を JSON 収集 → 派生診断 (toolchain drift / ci-local) を inventory から導出 | op CLI primitive + controller |
| 2. expert 深掘り | deps+OSV → security-expert spawn / build・command 失敗の RCA → debug-expert spawn (該当 finding があるときのみ) | security-expert / debug-expert |
| 3. Report 整形 | inventory + expert 所見を OP Doctor Report に整形、severity 判定 (severity-rubric.md) | controller |
| 4. 起票 gate | Critical/High を enrichment 経由で起票候補化、承認後 (or --auto) に起票 (dedup-policy / auto-policy) | controller |

### フェーズ 1: 決定論 inventory (`op doctor` primitive)

`op doctor env` を read-only で呼び、6 項目のうち決定論で収集できるものを JSON envelope で取得する。
**判定 (severity / OK・WARN・FAIL) は primitive 側でしない** — 生データのみ返るので、controller が
Report 整形時 (フェーズ3) に判定する (`op doctor env` の implementation note: severity 判定は SKILL 側の責務)。

```text
op doctor env [--dir <path>]   # toolchains[] / lockfiles[] / commands[] を JSON envelope で返す (read-only)
```

| 診断項目 (`--check` 名) | inventory ソース | 導出方法 |
|------------------------|------------------|---------|
| `env` (toolchain version / 必須コマンド存在) | `op doctor env` の `toolchains[]` (name/present/version) | そのまま |
| `commands` (build・test・lint・audit の存在) | `op doctor env` の `commands[]` (name/category/present) | そのまま |
| `lockfile` (lockfile 存在) | `op doctor env` の `lockfiles[]` (name/present) | そのまま |
| `toolchain` (drift: 宣言 vs 実体の version 乖離) | `toolchains[].version` + repo の version 宣言 (rust-toolchain / .nvmrc 等) | controller が突き合わせ (深い互換推論は debug-expert) |
| `ci-local` (CI で使うコマンド vs local で使えるコマンドの差) | `commands[].present` (PATH 存在確認) + CI 定義 (`.github/workflows`) のコマンド | controller が command matrix を比較 (失敗 RCA は debug-expert) |
| `deps` (依存 + OSV summary) | — (決定論 primitive 対象外) | フェーズ2 で security-expert が担当 |

> **`present` の意味論**: `toolchains[].present` と `commands[].present` は**別の概念**を指す。
> - `toolchains[].present` = **動作確認済み version 取得可** (version probe が exit 0 かつ出力あり)。
>   壊れた shim が PATH にあっても version 取得が失敗すれば false。
> - `commands[].present` = **PATH 上の存在確認のみ** (spawn 成功。exit code は問わない)。
> 同一ツール (例: 壊れた flutter shim) に対して `toolchains[flutter].present=false` / `commands[flutter].present=true`
> になる場合があるが、これは矛盾ではなく 2 つの field が異なる概念を表す設計による。
> controller は両 field を目的に応じて使い分けること (`toolchains[]` = 動作確認、`commands[]` = PATH 到達確認)。

> **primitive 名を仮定しない**: 現状 `op doctor env` 1 本が toolchain/lockfile/command inventory を返す
> (#777 実装)。`toolchain` / `ci-local` の派生診断は専用 primitive を持たず、controller が `env` の
> 生データから導出する。将来 `op doctor commands` / `op doctor ci-local` 等が追加されたら本表の inventory
> ソースを差し替える (それまでは `op doctor *` 粒度で表現し、未実装 primitive 名を SKILL.md に書かない)。

### フェーズ 2: expert 深掘り (該当 finding があるときのみ spawn)

決定論 inventory で判定できない領域のみ active expert を spawn する。**env-expert は spawn しない**
(planned のまま。上記「expert 構成」節 + ADR-0005「substitute-MVP」)。spawn schema は
`skills/_shared/expert-spawn.md` の canonical 契約に従う (`invocation_mode` / 完了報告の `commits_added` 等)。

| トリガー | spawn する expert (active) | 渡す入力 |
|---------|---------------------------|---------|
| 依存 / OSV / supply-chain risk を診断したい (項目 `deps`) | **security-expert** | 依存マニフェスト + lockfile path、OSV summary 観点 |
| build / test / lint / audit コマンドが失敗する / toolchain 互換の深い推論が要る (項目 `commands` / `toolchain`) | **debug-expert** | 失敗コマンドと出力、`op doctor env` の toolchain inventory |
| tool install policy / org policy 等の方針判断 | spawn せず `needs_human_decision` で人間に倒す | — |

- spawn は **該当 finding があるときのみ** (inventory が clean なら expert を呼ばない = 無駄 spawn を避ける)。
- env-expert の値が routing metadata に現れた場合は spawn 前に substitute へ normalize する
  (`skills/_shared/runtime-contract.md` の判定優先順位 / `planned-experts.md` の spawn 前 normalize 規約)。

### フェーズ 3: Report 整形 + severity 判定

inventory (フェーズ1) + expert 所見 (フェーズ2) を統合して OP Doctor Report (上記「OP Doctor Report」節の
書式) に整形する。各 finding の severity は `skills/_shared/severity-rubric.md` で判定する (本節に再定義しない)。

#### graceful degrade (ツール不在 repo)

OSV / audit ツール (`cargo audit` / `pnpm audit` 等) が PATH に無い repo では、`commands[].present=false` が
返る (PATH 存在確認で false = PATH 不在)。この場合 **該当診断項目を skip し、Report に「skipped (ツール不在)」と明記**する (診断失敗として
FAIL にしない)。op-doctor は他 app repo でも走るため、toolchain 不在環境でも panic せず「未検出」を返す
(`op doctor env` の panic-free 契約と整合)。

```text
[3] deps + OSV summary ...... SKIPPED (cargo audit / pnpm audit が PATH に無い)
```

### フェーズ 4: 起票 gate (既存正本を流用)

Critical/High の finding のみ起票候補とする。**起票ルールはすべて既存正本への pointer** (上記「起票 gate」
節の表に従う):

- severity gate (Critical/High のみ): `severity-rubric.md`
- 起票前 enrichment (`--no-enrichment` で opt-out、不変則 8): `issue-enrichment.md`
- open Issue dedup: `dedup-policy.md`
- `--auto` の 8 条件 AND: `auto-policy.md`
- hidden marker: `markers/labels-and-markers.md` (`op-source: op-doctor` の登録は #779)

Direct Mode 固定のため、`--auto` 以外では **ユーザー承認後にのみ** 起票する。`requires_runtime` /
`inferred` / `low confidence` は起票せず `manual_review_bucket` に保持する。

---

## 参照ドキュメント

| ファイル | 役割 | バージョン要件 |
|---------|------|--------------|
| `skills/_shared/severity-rubric.md` | severity 判定 (Critical/High のみ起票) の正本 | `(>=4)` |
| `skills/_shared/issue-enrichment.md` | 起票前 enrichment (Design Plan / cross-review) + 不変則 8 の正本 | `(>=2)` |
| `skills/_shared/dedup-policy.md` | 重複判定 (open Issue dedup) の正本 | `(>=3)` |
| `skills/_shared/auto-policy.md` | `--auto` 自動起票の 8 条件 AND の正本 | `(>=3)` |
| `skills/_shared/planned-experts.md` | env-expert の planned 状態 + substitute 規約 (本 skill が依拠) | `(>=3)` |
| `skills/_shared/active-expert-registry.md` | active expert (security-expert / debug-expert) の正本 | `(>=3)` |
| `skills/_shared/markers/labels-and-markers.md` | hidden marker / label の名前と semantics | `(>=9)` |
| `skills/_shared/runtime-contract.md` | runtime spawn 境界 / planned expert normalize 規約 | `(>=2)` |
| `skills/_shared/invocation-mode.md` | Direct / OP-managed mode 判定契約 | `(>=1)` |
| `skills/_shared/version-check.md` | schema_version pin チェック手順 | `(>=3)` |
| `docs/adr/0005-op-doctor-skill.md` | op-doctor 設計判断 / 責務配置 / substitute-MVP (Accepted) | — |

起動時 (フェーズ0) に `skills/_shared/version-check.md` の手順に従い、
上記 `(>=N)` 条件を満たすか確認する。mismatch は warning 表示して続行可否を確認する
(CLAUDE.md 不変則 2、自動失敗させない)。
