---
name: op-spec-patrol
description: canonical spec (.claude/rules/) を警備員的に巡回するスキル (ADR-0017 W3)。`op spec-patrol score` で feature を選定し、機械 drift (broken-link / paths-overlap / cite / index) は CLI が決定論検出。うち安全に確定する索引再生成 (rebuild-index) と cite 降格 (cite-downgrade) のみ dry-run→--apply で auto-fix し、broken-link / paths-overlap は検出のみ (修正先は人間判断ゆえ報告 / queue)。domain drift (正本⟷code の意味的乖離) は op-spec-patrol-audit workflow で spec-expert 監査 + refute する。domain confirmed は op-spec cultivation queue へ回す (本 wave は起票しない)。「op-spec-patrol」「正本巡回」「spec patrol」「canonical spec 監査」等のキーワードで起動。
---

<!--
schema_version: 1
last_breaking_change: 2026-06-21
notes: v1 (2026-06-21) — ADR-0017 W3 新設。canonical spec 巡回 skill。CLI (op spec-patrol、IU1/IU2 = 機械 drift
       決定論検出 + 安全 fix (索引再生成 / cite 降格) の dry-run→--apply auto-fix) と workflow (op-spec-patrol-audit、IU3 = domain drift の spec-expert
       監査 + refute) を束ねる orchestration。機械 fix は不変則7 第3例外 (op-sweep / op-spec に次ぐ)。
       domain confirmed drift は op-spec の drift-driven entry が拾う cultivation queue へ回す (本 wave は起票せず
       Spec Patrol Ledger に記録 + 提示まで)。Direct + autonomous(--auto) の 2 mode。
-->

# op-spec-patrol: canonical spec の警備員的巡回 (ADR-0017 W3)

/**
 * 機能概要: 対象 repo の正本 (.claude/rules/<feature>.md) を、op-patrol と同じく警備員的に巡回する skill。
 *           `op spec-patrol score` で「次に見るべき正本」を選び、2 種の drift を別経路で扱う:
 *           - 機械 drift (broken-link / paths-overlap / cite / index) = CLI が決定論検出。うち安全に確定する
 *             索引再生成 (rebuild-index) と cite 降格 (cite-downgrade) のみ dry-run → --apply で auto-fix
 *             (op-sweep と同性質の機械判定 housekeeping mutation)。broken-link / paths-overlap は検出のみ
 *             (修正先 = link 先 / paths 調整は人間判断ゆえ auto-fix せず Phase 5 で報告 / queue)。
 *           - domain drift (正本の決定/不変則が code 実態と意味的に食い違う) = op-spec-patrol-audit workflow が
 *             spec-expert で正本⟷code を 3 者照合 + 起票前 refute し、confirmed のみを op-spec cultivation queue へ回す。
 * 作成意図: ADR-0017 W3。正本は「起こして終わり」では腐る (code が進むと wrong-premise の発生源になる)。
 *           op-patrol が「変更されない古いコード領域」を巡回するのと同型で、本 skill は「追従漏れした正本」を巡回する。
 *           機械照合できる drift は CLI で安く確定し、LLM 判断が要る domain drift だけを workflow に回すことで、
 *           cost / ノイズを抑えつつ正本の信頼性を保つ。
 * 注意点: 機械 fix は CLAUDE.md 不変則 7 の第 3 例外 (後述「不変則 7 例外宣言」節)。domain drift は本 skill では
 *           **正本を書き換えない** (正本 write は op-spec が human align を経て行う = ADR-0017 W2 例外)。
 *           本 wave は domain drift を **issue 起票しない** (Spec Patrol Ledger 記録 + 提示まで、scope 限定。理由は Phase 5)。
 */

## Invocation Mode (Direct / autonomous)

- **Direct Mode** (既定): 人間が `op-spec-patrol` で直接起動。各フェーズで plan を提示し、機械 fix の適用 (Phase 3) と
  domain drift の queue 化 (Phase 5) の前に承認 gate を置く。
- **autonomous Mode** (`--auto`): 機械 fix は gated に自動適用、domain drift は Spec Patrol Ledger に記録するのみ
  (起票しない本 wave 方針ゆえ、`--auto` でも破壊的アクションは機械 fix の自動 apply に限る)。

詳細契約は `~/.claude/skills/_shared/invocation-mode.md` を参照。

---

## 不変則 7 例外宣言 (ADR-0017 W3 — op-sweep / op-spec に次ぐ第 3 例外)

> **CLAUDE.md 不変則 7 (Review / Apply / Post-check の責務分離) に以下の例外を宣言する。**
>
> op-spec-patrol skill は **機械 drift のうち fix が機械的に確定するものの auto-fix** (索引再生成 / cite 降格) を
> 機械判定で確定する mutation 責務を持つ (Phase 3)。これは op-sweep (機械判定 housekeeping mutation) /
> op-spec (human align 後の正本 write) に次ぐ第 3 の例外。
>
> 「人間判断を要する finding」と「機械的に確定する apply」を混ぜないという不変則 7 の本質は守られる:
> - **fix が機械的に確定するものだけ auto-fix する**。`op spec-patrol {rebuild-index,cite-downgrade} --apply`
>   が決定論的に生成 / 適用し、人間判断は介在しない (op-sweep と同性質)。broken-link (check-links) /
>   paths-overlap (list-specs) は **機械検出のみ** — 修正先 (link 先 / paths 調整) は人間判断ゆえ auto-fix せず報告 / queue に残す。
> - **domain drift (正本⟷code の意味的乖離) は auto-fix しない**。spec-expert 監査 + refute を経た confirmed drift も、
>   本 skill では正本を書き換えず **op-spec の cultivation queue へ回す** (正本 write は op-spec が human align 後に行う)。
> - したがって本 skill は「機械的に確定する mutation」と「人間判断を要する align」を分離している。
>
> **この例外は op-spec-patrol に限る**。他 OP skill は引き続き不変則 7 に従い audit と apply を分離する。

---

## フェーズ構成

### Phase 0: preflight

1. **git / gh capability**: `git rev-parse --show-toplevel` / `gh auth status` (op-patrol Phase 0 と同基準)。
2. **op binary 鮮度**: `op --version` を確認。未 install / stale (op-tools/ の最新 commit より古い) なら
   `cd op-tools && cargo install --path crates/op` を案内して停止 (CLI が無いと機械 drift 検出ができない)。
3. **`.claude/rules` 検出**: 正本ディレクトリの存在確認。無ければ「正本が無い repo」として stop
   (op-spec で正本を起こしてから巡回する旨を案内)。
4. **Spec Patrol Ledger pull**: `op spec-patrol ledger pull --issue <N>` (または事前に `--auto-find` 相当で
   `op-spec-patrol` label の Issue を解決) で前回の area_state (feature → last_patrolled_at / scan_count) を取得。
   Ledger Issue が無ければ `op spec-patrol ledger init` を案内 (label `op-spec-patrol` + `op-state` + `do-not-close`)。

### Phase 1: feature (区画) 選定

1. `op spec-patrol score --rules-dir .claude/rules --json` を実行。Phase 0 で取得した area_state の
   `last_patrolled_at` を feature ごとに `--last-patrolled-at <feature>=<RFC3339>` で注入する
   (巡回直後の feature の penalty を効かせ、未巡回 / 古い feature を上位に出す)。
2. 戻り `details.specs` (spec_score 降順 rank 済み) から budget で top-N feature を選ぶ。
3. **Direct**: 選定 feature + score 内訳を plan として提示し承認を得る。**`--auto`**: そのまま続行。

### Phase 2: 機械 drift 検出 (dry-run、read-only)

選定 feature を含む `.claude/rules` 全体に対し、CLI を **dry-run** で実行して機械 drift を可視化する:

- `op spec-patrol list-specs --json` — paths overlap (正本間 disjoint 違反、Error / block)
- `op spec-patrol check-links --json` — dead feature / dead section / dangling op-spec-ref
- `op spec-patrol cite-downgrade --json` (dry-run、--apply 無し) — 出典欠落 [human] の降格予定 (mutations)
- `op spec-patrol rebuild-index --json` (dry-run、--apply 無し) — 索引表の再生成差分 (changed / planned_constitution)

findings を集約して提示する。**これらは決定論検出ゆえ confidence が高い** (LLM 判断不要)。

### Phase 3: 機械 auto-fix (不変則 7 第 3 例外、op-sweep 流の dry-run→--apply gate)

Phase 2 の dry-run 結果のうち **機械的に確定するもの** を `--apply` で適用する:

- `op spec-patrol rebuild-index --apply --yes` — constitution Part 2 索引表を再生成して書き込む
  (既存 概要 列は feature キーで保全、新 feature は placeholder、削除 feature は drop)。
- `op spec-patrol cite-downgrade --apply --yes` — 出典欠落 [human] を `[?] TODO: needs-human` に in-place 降格。

**Direct**: 承認後に適用。**`--auto`**: gated 自動適用。**機械判定で確定するものだけ。人間判断は介在しない**
(op-sweep と同性質)。broken-link / paths-overlap は **fix を自動生成しない** (link 先 / paths の調整は人間判断ゆえ
Phase 5 で domain queue 側に提示するか、findings として報告に残す)。

### Phase 4: domain drift 監査 (op-spec-patrol-audit workflow)

選定 feature を `op-spec-patrol-audit` workflow に渡す (Workflow tool):

```
Workflow({ name: "op-spec-patrol-audit", args: JSON.stringify({
  today: "<YYYY-MM-DD>", run_id: "<run id>",
  features: [{ feature, spec_path, paths:[...], code_scope:[...], status, target_issues:[...] }]  // = Phase 1 選定
})})
```

workflow は feature ごとに spec-expert を spawn し正本⟷code を 3 者照合 (audit) → High/Critical を skeptic で反証
(refute、**default=refuted**: spec drift は捏造リスクが本質ゆえ実引用で実証できた時のみ confirmed)。
戻り `.result.features[].findings` / `.result.features[].verdicts` を受け取り、**verdict=confirmed のみ採用**する
(refuted / downgrade は drop + 完了報告で可視化)。機械 drift (broken-link 等) は workflow 対象外 (CLI 担当)。

### Phase 5: action split / route

- **機械 drift**: Phase 3 で適用済み (索引再生成 / cite 降格)。残った機械 finding (paths-overlap / broken-link で
  自動 fix しなかったもの) は完了報告に残す。
- **domain confirmed drift**: **op-spec の cultivation queue へ回す**。

  > **本 wave (W3 IU4) は domain drift を issue 起票しない (scope 限定)。** 理由:
  > 起票には severity gate / dedup / enrichment が絡み、op-spec の drift-driven entry mode が既に
  > 「git log staleness + status で stale 正本を seed する」cultivation 入口を持つ (op-spec/SKILL.md §1-0)。
  > op-spec-patrol は confirmed domain drift を **Spec Patrol Ledger に drift として記録 + 完了報告で提示**するに留め、
  > 人間が `op-spec` を起動した時に drift-driven entry がそれを拾って 3 者照合 → human align → 正本 write する。
  > enrichment / severity-gate / 自動起票への踏み込みは後続 wave に委ねる (不変則 8 と混線させない)。

### Phase 6: Spec Patrol Ledger 更新

`op spec-patrol ledger push --issue <N> --checkpoint-id <id> --updated-feature <feature>=<今日 RFC3339> [--drift-count <feature>=<drift_type>:<count> ...]`
で巡回した feature の last_patrolled_at / scan_count を checkpoint として記録する。
これが次回 Phase 1 の `--last-patrolled-at` 注入元になる。

confirmed drift (機械 drift の確定件数 / domain drift の confirmed 件数) があった feature は
`--drift-count <feature>=<drift_type>:<count>` で件数を渡す (例: `--drift-count op-sweep=error:2`)。
drift_type は severity / 種別を表す任意キー (例 `error` / `warn`)。previous-state の既存 drift_counts に累積される。
`--drift-count` 省略時は従来通り drift_counts は空 `{}` (後方互換)。drift を渡さないと checkpoint の
drift_counts が空のままになり、巡回履歴に drift 実績が残らない点に注意。

### Phase 7: 完了報告

- 巡回した feature 一覧 (score 内訳)
- 機械 drift: 検出件数 + auto-fix 適用結果 (rebuild-index / cite-downgrade)
- domain drift: confirmed / refuted の内訳、confirmed の cultivation queue 行き一覧 (op-spec で拾う候補)
- 自動 fix しなかった機械 finding (paths-overlap / broken-link) と人間判断が要る点
- Ledger 更新結果 (checkpoint id)
- 残存リスク (refute の近似 gate 限界 / 未巡回 feature)

> **正本を視覚的に俯瞰したいとき (任意)**: drift の関係や正本全体の繋がりを視覚的に確認したい場合は、
> 別 skill `/op-rules` で派生 HTML ビューア (`op rules render` / `op rules serve`、ADR-0020) を起動できる
> (索引・関係グラフ・provenance を read-only で俯瞰)。本 skill / ビューアいずれも正本は write しない
> (write は op-spec が human align 後に行う)。

---

## 制約

- **機械 fix は機械判定で確定するものだけ** (rebuild-index / cite-downgrade)。paths-overlap / broken-link の修正は
  人間判断ゆえ auto-fix しない (報告 / queue 提示に留める)。
- **正本を書き換えない** (domain drift)。正本 write は op-spec が human align 後に行う (ADR-0017 W2 例外)。
- **domain drift を本 wave では起票しない** (Spec Patrol Ledger 記録 + 提示まで)。enrichment / severity-gate / 自動起票に踏み込まない。
- CLI (op spec-patrol) が無い / stale なら停止 (機械 drift 検出は CLI 必須)。
- gh は CLI (ledger sub) のみ・op-core は触らない (ADR-0005)。

---

## 参照ドキュメント

- `~/.claude/skills/_shared/invocation-mode.md` (>=1) — Direct / OP-managed (autonomous) Mode 契約 + needs_human_decision 正規スキーマ
- `~/.claude/skills/_shared/markers/labels-and-markers.md` (>=9) — label (`op-spec-patrol` / `op-state` / `do-not-close`) + Spec Patrol Markers (`op-spec-patrol-run` / `op-spec-patrol-checkpoint`、fingerprint `spec-patrol-checkpoint:<fp>`) の名前と core semantics 正本
- `~/.claude/skills/_shared/version-check.md` (>=2) — schema_version 整合性チェック手順
- `op-tools/docs/adr/0017-canonical-spec-architecture.md` — ADR-0017 (canonical spec architecture)。W3 wave の正本
- 対象 repo の `.claude/rules/_schema.md` — 正本 authoring 規約 / provenance タグ / 捏造禁止 (定義の正本は ADR-0017 決定3)
- `skills/op-spec/SKILL.md` — domain drift の handoff 先。drift-driven entry mode が confirmed drift を cultivation queue として拾う
- `workflows/op-spec-patrol-audit.js` (`workflows/README.md` の呼び出し契約節) — Phase 4 で呼ぶ domain drift 監査 + refute workflow
- op-core::spec (Rust) / `op spec-patrol --help` — 機械 drift 検出 + auto-fix + score + ledger の CLI 実装正本
