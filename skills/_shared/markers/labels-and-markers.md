<!--
schema_version: 9
last_breaking_change: 2026-05-22
notes: v9 末尾 (2026-06-21) — op-source 値に op-spec を additive 追加 (ADR-0017 W5: op-spec が正本↔code gap から発行する derived issue の source)。schema_version は 9 のまま (additive、inline.rs SCHEMA_VERSION=9 と一致維持)。
       v9 末尾 (2026-06-21) — ADR-0017 W4: op-spec-ref marker を additive 登録 (consumer=op-run/op-codev、producer=op-spec/op-spec-patrol、linkage B の issue 端)。schema_version は 9 のまま据置 (additive、既存 marker の意味変更なし、doc 登録のみで inline.rs の検証対象 marker set には足さない = SCHEMA_VERSION=9 と一致維持)。
       v9 末尾 (2026-06-21) — op-depends-on 工程依存 marker (`<!-- op-depends-on: #N, #M -->`、inline-value) を additive 追加 (ADR-0019 op-loop 工程A、Owner=op-architect/op-plan、Consumer=op-loop / `op issue dep-graph`、merge 非blocking)。schema_version は 9 のまま (additive、dep_graph.rs SCHEMA_VERSION=9 と一致維持)。
       v9 末尾 (2026-06-21) — op-spec-patrol label + Spec Patrol Markers (`op-spec-patrol-run` / `op-spec-patrol-checkpoint`、fingerprint `spec-patrol-checkpoint:<fp>`) を additive 追加 (ADR-0017 W3、op-spec-patrol skill 新設)。schema_version は 9 のまま (additive、既存 marker / label の意味変更なし、inline.rs SCHEMA_VERSION=9 と一致維持)。
       v9 末尾 (2026-06-15) — op-source 値に op-report を additive 追加 (op-report skill 新設)。schema_version は 9 のまま (additive、inline.rs SCHEMA_VERSION=9 と一致維持)。
       v9 (2026-05-31) — op:foundation-precondition label を新設 (ADR-0012 Wave3)。additive。
       v8 (2026-05-22) — Label Canonical Table 新設 (Issue #396)。additive。
       v7 (2026-05-17) — Claim Markers 節追加 (op-claim / op-cluster-manifest / op:in-progress)。additive。
       v6 (2026-05-16) — op-post-check-meta の gate 判定フィールドを audit_result→post_check_result に統一。
       v5 (2026-05-16) — op-source 値リストに op-plan を追加。additive。
       v2〜v4: 旧版 changelog 省略 (git log 参照)。
       v1 (2026-05-06) — 新設。OP label / marker 名 + core semantics の正本ファイル。
       詳細 field schema は領域別 *-markers.md を参照 (followup #20 で分割完了済)。

機能概要:
  OP skill (op-architect / op-scan / op-patrol / op-run / op-merge) と expert agent 群が
  GitHub Issue / PR / review コメントに埋め込む hidden marker (`<!-- op-* -->`) と、
  Issue / PR に付与する label (`pro-*` / `needs:*` / `severity:*` 等) の正本一覧。

作成意図:
  これまで marker / label の正規定義が `pr-templates.md` / `expert-spawn.md` / `op-merge/SKILL.md`
  / `op-architect/SKILL.md` 等に分散しており、新規 marker 追加時に責任所在が曖昧だった。
  本ファイルを Single Canonical Source として、marker 名と core semantics の追加・廃止を一元管理する。

注意点:
  - 本ファイルは marker / label の **名前と core semantics の正本** であり、詳細 field schema や
    PR body 全文 example は持たない。詳細 field schema は領域別 `*-markers.md` を、PR body の
    実テンプレは `pr-templates.md` を参照する (Single Canonical Source Rule)。
  - 既存互換 marker / label は **削除せず deprecated 分類で保持** する。過去 PR / Issue の履歴を破壊しないため。
  - marker / label を新規追加する場合は本ファイル → 必要なら領域別 `*-markers.md` の詳細 schema → 必要なら
    `pr-templates.md` の bash テンプレ、の順で追加し、各ファイル間で意味が衝突しないか確認する。
-->

# Labels and Markers

This document is canonical for OP-related label names, marker names, marker
ownership, and core marker semantics.

Other files may define detailed marker schemas, PR body examples, and
procedure-specific usage, but must not introduce marker names or redefine core
semantics in conflict with this file.

This file is not required to contain every field of every structured marker.
It must contain every OP marker name currently used by active OP skills.

---

## 関連正本ファイル

| 概念 | 正本 |
|---|---|
| review 系 marker (`op-review-meta` / `op-review-finding` / `op-review-finding-direct` / `op-review-report` / `op-specialist-review-meta`) の field schema / enum / null 許可ルール / Direct Mode 契約 / 集約ルール / reclassification | `skills/_shared/markers/review-markers.md` |
| `op-post-check-meta` の共通 field schema / enum / 複数 post-check 共存 / stale 判定 | `skills/_shared/markers/post-check-markers.md` |
| security 系 marker (`op-security-post-check` / `op-security-requires-aux-post-check`) の usable_security / threat_model / aux post-check 状態遷移 / 8 観点 | `skills/_shared/markers/security-markers.md` |
| UX/UI 系 marker (`op-ux-ui-gate` / `op-ux-ui-audit`) の Design Plan gate / post-check 観点 / Applicable States 判定 | `skills/_shared/markers/ux-ui-markers.md` |
| patrol 系 marker (`op-patrol-run` / `op-patrol-checkpoint`) の Ledger コメント JSON schema / area_state 構造 / 命名規則 / state 復元手順 / parse fallback / compact 条件 | `skills/_shared/markers/patrol-markers.md` |
| manual override block (`op-manual-override`) の field schema / 必須要件 / validation rule / 監査追跡 | `skills/_shared/markers/merge-gate-markers.md` |
| claim 系 marker (`op-claim` / `op-cluster-manifest`) の field schema / TTL ルール / race 調停 / 除外条件 / `op claim` CLI との対応 | `skills/_shared/markers/claim-markers.md` |
| PR body / コメント bash gh HEREDOC テンプレ / human-readable example | `skills/_shared/pr-templates.md` |
| spawn prompt schema / expert-spawn 規約 | `skills/_shared/expert-spawn.md` |
| dedup / fingerprint 規約 | `skills/_shared/dedup-policy.md` |
| 自動起票 8 条件 (`--auto`) | `skills/_shared/auto-policy.md` |
| 重要度 (severity) ラベルの判定基準 | `skills/_shared/severity-rubric.md` |
| Active / Planned expert ライフサイクル | `skills/_shared/active-expert-registry.md` |
| runtime spawn 境界 / apply・post-check resolution / merge blocking | `skills/_shared/runtime-contract.md` |

詳細 schema をすべて本ファイルに移管しない。**本ファイルは name と core semantics の正本** であり、
field-level schema は上記領域別 `*-markers.md` に残す。PR body の実テンプレ (bash gh HEREDOC) は
`pr-templates.md` に残す。

---

## marker semantics の重要ルール (must-read)

以下は marker を扱う全 skill / agent が守る意味論的ルール (詳細は各 marker エントリの Not meaning も参照)。

1. `op-run-expert` / `op-scan-expert` / `op-post-check-expert` は **routing metadata であり spawn authorization ではない**。
   op-run の判定優先順位 (1-2-d / 1-8) と active fallback を経て最終 spawn 担当が決まる。
   planned expert (`env` / `compatibility` / `spec`) を直接 spawn 禁止。`release-expert` は fallback destination 禁止。
2. `op-review-meta` は review lifecycle metadata。単体では merge approval にならない。
   `pro-reviewed` ラベル + `reviewed_head_sha` 一致 + post-check gate を全通過が必要。
3. `op-security-post-check` 失敗・未解決は merge block に影響しうる (op-merge gate 14〜18 参照)。
4. **`op-planned-post-check-skipped` は単体では merge-blocking ではない**。
   op-merge は他の gate (security / ux-ui / review) と組み合わせて判断する。
5. **`op-manual-override` は無制限 bypass ではない**。`override_target` / approver / 理由 / follow-up Issue 必須。
   常用厳禁。**label-only bypass は構造的に禁止**: 対応 label + valid `<!-- op-manual-override -->` block の AND が必須。
   詳細は `skills/_shared/markers/merge-gate-markers.md (>=2)` を参照。

---

## marker entry format

各 marker は最低限以下の形式で登録する。

**省略ルール**: `Runtime spawn effect` / `Merge blocking effect` は値が「なし」の場合は**フィールドごと省略可**。
効果がある場合のみ記載する (デフォルト = なし)。

```md
### `<!-- op-example-marker: ... -->`

Owner / producer:
- ...

Consumer:
- ...

Meaning:
- ...

Not meaning:
- ...

Runtime spawn effect:  ← 省略可 (デフォルト = なし)
- ...

Merge blocking effect:  ← 省略可 (デフォルト = なし)
- ...
```

---

## Routing / Issue Markers

Issue / PR の routing metadata を表す marker 群。op-run / op-scan / op-patrol / op-architect が起票時に埋め、
op-run / op-merge / op-patrol が読み取って routing / dedup / 再分類に使う。

### `<!-- op-run-expert: <agent-name> -->`

Owner / producer:
- op-scan / op-patrol / op-architect (Issue 起票時)
- op-run (apply 時の clustering hint として参照)

Consumer:
- op-run (apply 担当 expert 解決の入力)
- op-merge (Issue 由来 routing の追跡)

Meaning:
- 元 Issue / 派生 Issue を「どの expert に apply / fix を任せたいか」の routing metadata。

Not meaning:
- spawn authorization ではない。op-run の判定優先順位 1-2-d / 1-8 を経て active fallback / planned 再分類が
  入る。planned expert (`env` / `compatibility` / `spec`) を runtime で直接 spawn する根拠にはしない。
  `release-expert` は fallback destination としても使用しない。

Runtime spawn effect:
- なし。最終 spawn 担当は op-run の解決ロジックが決める。

---

### `<!-- op-post-check-expert: <agent-name> -->`

Owner / producer:
- op-scan / op-patrol / op-architect / op-run

Consumer:
- op-run (post-check spawn の routing 入力)
- op-merge (post-check provenance / forge 検出)

Meaning:
- apply 後に走らせる post-check 担当 expert の routing metadata。

Not meaning:
- spawn authorization ではない。`review-expert` を post-check expert として指定してはならない
  (review-expert は global review 専任)。planned expert を直接 spawn しない。

Runtime spawn effect:
- なし。op-run 側で planned skip / `op-planned-post-check-skipped` 判定が入る。

Merge blocking effect:
- なし (この marker 単体では)。op-merge gate は post-check meta / label 側を見る。

---

### `<!-- op-scan-expert: <agent-name> -->`

Owner / producer:
- op-scan (観点別 audit 起票時)

Consumer:
- op-patrol / op-run / 人間 (Issue がどの観点 expert によって検出されたかの追跡)

Meaning:
- 観点 audit を行った scan 担当 expert の identity metadata。

Not meaning:
- apply / fix authorization ではない。検出した expert がそのまま apply するとは限らない。

---

### `<!-- op-architect-expert: <agent-name> -->`

Owner / producer:
- op-architect (初期構築 Issue / マイルストーン起票時)

Consumer:
- op-run (初期マイルストーン Issue の routing hint)
- 人間 (どの ADR / architect セッション由来か追跡)

Meaning:
- op-architect セッションで起票された Issue の origin metadata。

Not meaning:
- spawn authorization ではない。

---

### `<!-- op-domain: <domain> -->`

Owner / producer:
- op-scan / op-patrol / op-architect / op-run / expert agent

Consumer:
- op-run (clustering / routing)
- op-merge (post-check 必要性判定 / domain 別 gate)

Meaning:
- finding / Issue / PR の domain 分類。canonical 値: `debug` / `refactor` / `feature` / `optimize` /
  `test` / `design` / `ux-ui` / `security` / `env`。

Runtime spawn effect:
- 直接の spawn authorization ではないが、op-run の domain 別 routing の主要入力。

Merge blocking effect:
- domain 別 gate (例: `domain=security` → security post-check gate / `domain=design` or `ux-ui` →
  ux-ui-audit gate) の発動条件として使用される。

---

### `<!-- op-source: <skill-name> -->`

Owner / producer:
- op-scan / op-patrol / op-architect / op-run / op-merge / op-plan / op-report / op-spec

Consumer:
- 人間 / op-patrol (Issue / PR の出自追跡)
- dedup-policy (op-source ごとに重複判定挙動を分けるため)

Meaning:
- Issue / PR / review コメントを生成した skill の identity。canonical 値: `op-scan` / `op-patrol` /
  `op-run` / `op-merge` / `op-architect` / `op-plan` /
  `op-scan-from-merged-pr` / `op-report` / `op-spec`。
- `op-scan-from-merged-pr` — op-scan `--from-merged-pr` モード経由で起票された follow-up Issue。
- `op-report` — context 隔離型の単一 finding 調査確認 → 自動起票。scout 1体 spawn → 実在確認 gate (confirmed/not_confirmed/dup) → lite enrichment (dedup+collision のみ) → 起票。controller=op-report skill。
  親 PR の URL は Issue 本文「関連」節に記録される。
- `op-spec` — 正本 (`.claude/rules/<feature>.md`) cultivation で確認した正本↔code gap から発行する derived issue。consumer=op-run/op-loop、ADR-0017 W5 で追加。

Not meaning:
- expert の identity ではない (それは `op-*-expert` 系 marker)。

---

### `<!-- op-fingerprint: <domain>:<normalized_title>:<primary_file>:<symbol> -->`

Owner / producer:
- op-scan / op-patrol / op-architect (起票時に必須)

Consumer:
- op-scan / op-patrol (重複 Issue 抑止 / `seen_count` 更新)
- op-run / op-merge (Issue / PR の同一性確認)

Meaning:
- finding の重複判定キー。同一 fingerprint の Issue は重複として既存に集約。

Not meaning:
- 安定 hash ではなく semantic key。仕様変更時は normalization ルールごと bump する (詳細は `dedup-policy.md`)。

Runtime spawn effect:
- なし。ただし重複判定で起票自体を抑制するため、間接的に spawn 抑止に効く。

---

### `<!-- op-area: <area> -->`

Owner / producer:
- op-patrol (区画選定時)

Consumer:
- op-patrol (Patrol Ledger の `area:*` ラベル整合 / 巡回履歴記録)
- op-run (clustering hint)

Meaning:
- op-patrol の巡回区画 (module / feature / directory) 識別子。

Not meaning:
- ファイルシステム path そのものではない (`area:export` のような論理区画名)。

---

### `<!-- op-mode: <mode> -->`

Owner / producer:
- op-scan / op-run / op-merge

Consumer:
- 人間 (Issue / PR がどの mode (auto / manual / from-issue 等) で生成されたか追跡)

Meaning:
- skill 起動時の mode 表示。例: `op-scan --auto` / `op-scan --from-issue` / `op-run --auto` 等の出自を残す。

Not meaning:
- expert の invocation_mode (`direct` / `op_managed`) ではない。それは expert 側の spawn prompt header
  (`invocation_mode:`) で表現する。

---

### `<!-- op-finding-type: <type> -->`

Owner / producer:
- op-scan / op-patrol / expert agent (refactor-expert / spec-expert 系)

Consumer:
- op-run (apply 可否判定 / `manual_review_bucket` 振り分け)
- op-merge (`op:architecture-debt` / `op:staged-refactor` / `op:blocking-finding` 系判定)

Meaning:
- finding 種別の分類。canonical 値の例: `architecture_debt` / `staged_refactor` / `needs_spec_decision` /
  通常 finding。

Not meaning:
- severity ではない。

Runtime spawn effect:
- なし。ただし `needs_spec_decision` は apply 不可 (manual_review_bucket) として扱われる。

Merge blocking effect:
- `architecture_debt` で `blocking=true` の finding は `op:blocking-finding` ラベルと共に merge を止める。

---

### `<!-- op-refactor-debt-key: <stable-key> -->`

Owner / producer:
- refactor-expert / op-scan (`finding_type=architecture_debt` 起票時)
- op-patrol (`seen_count` / `last_seen_at` 更新時)

Consumer:
- op-patrol (architecture_debt Issue の追跡 / fingerprint 補助)
- op-run (apply 対象判定)

Meaning:
- architecture_debt Issue の安定追跡キー。`op-fingerprint` と独立に「同じ debt」を追跡するための識別子。

Not meaning:
- normalize 済みのファイルパスではない (refactor-expert が領域単位で命名する)。

Merge blocking effect:
- なし (本 marker 単体では)。`op:blocking-finding` 側で blocking 判定が出た場合のみ merge 停止。

---

### `<!-- op-derived-from: <issue-or-pr-ref> -->`

Owner / producer:
- op-scan (`--from-issue` 派生 Issue 起票時)
- op-run (PR 本文に Issue 由来を残す)

Consumer:
- op-merge (Issue クローズ判定の derive 関係追跡)
- 人間 (元 Issue の追跡)

Meaning:
- 元 Issue / PR から派生した Issue / PR の参照リンク。

Not meaning:
- duplicate marker ではない (それは fingerprint 経由)。

---

### `<!-- op-depends-on: #N, #M -->`

canonical example (lint clean):

<!-- op-depends-on: #806, #807 -->

Owner / producer:
- op-architect (Pass 2: title→実 issue 番号解決時に prose `## 依存` と同時に埋める)
- op-plan (judge-panel が返す構造化 `depends_on` を番号解決して埋める)

Consumer:
- op-loop (depends_on DAG の層を直列駆動する。フェーズ0 で `op issue dep-graph` 経由で消費)
- `op issue dep-graph` (複数 Issue の本 marker を読み DAG 構築 → topo-sort / cycle / 欠落検出)

Meaning:
- 当該工程 Issue が「先に完了すべき工程」(= 依存先) の Issue 番号群を機械可読で示す (ADR-0019 D1)。
- value は `#<整数>` のカンマ区切り。prose `## 依存 / - depends on #N` は人間向けに併存する正本ペア。

Not meaning:
- **merge-blocking ではない** (op:foundation-precondition と同じく gate に効かせない tracking marker)。
  層順の取り込みは op-loop の層間 human op-merge gate で行う (ADR-0019 D6、不変則7 尊重)。
- 依存が無い工程は本 marker を書かない (空 value は lint error)。

---

### `<!-- op-spec-ref: <feature>#<decision> -->`

canonical example:

<!-- op-spec-ref: op-sweep#decision-12 -->

Owner / producer:
- op-spec (cultivation で issue に verdict (✅/✏️) を付ける時、issue 本文へ張る = linkage B の issue 端、ADR-0017 決定9)
- op-spec-patrol (本 marker の dangling 検出のみ。`op spec-patrol check-links` で正本側の対象 feature/section が消えた dangling ref を報告する。本 marker を書き換えはしない)

Consumer:
- op-run (フェーズ1.5 トリアージ判定 = `op-spec-ref` の有無で「op-spec verdict 済みか」を安く判別し、未トリアージ複数なら soft nudge。plan lean 化では内容解説の委譲先として辿る、ADR-0017 OQ7 / 決定11)
- op-codev (実装着手時に binding な正本セクションを辿る)

Meaning:
- issue → binding な正本セクションへの双方向ポインタ (linkage B の issue 端、ADR-0017 決定9)。
- value は `<feature>#<decision>` (例: `op-sweep#decision-12`)。feature = `.claude/rules/<feature>.md` の feature キー、decision = その正本内の決定 / セクション anchor。
- 正本側の対は決定行の `([[feature/section]], realizes #NN)` (op-spec/SKILL.md L328)。1 本のリンクで provenance (どの決定から派生したか) と binding (実装時に読むべき正本) が同時に成立する。

Not meaning:
- routing marker ではない (op-domain / op-source が routing を担う)。本 marker は「正本への binding pointer」であり、cluster / domain 判定には使わない。
- **merge-blocking ではない / 必須 gate ではない**。op-run はこの marker が無い issue でもこれまで通り動ける (ADR-0017 決定11、後方互換)。
- `op-derived-from` とは別物 (あちらは issue⟷issue/PR の派生関係。本 marker は issue⟷正本セクションの binding)。

---

## Review Markers

review-expert (global review 専任) と specialist reviewer の出力に使われる marker 群。op-run フェーズ4 の
review lifecycle と op-merge gate が読み取る。

### `<!-- op-review-meta -->`

Owner / producer:
- review-expert (marker の内容生成者。7 lens review の結果を構造化して返す)
- ClusterOrchestrator (op-run controller が Agent tool で spawn) — review-expert が返す構造化結果を組み立て PR に投稿する。ADR-0016 決定7 (#744) により、投稿主体が op-run controller から CO に移管。

Consumer:
- op-run (review_round / max_review_fix_rounds の追跡 / Review Fix Loop 制御)
- op-merge gate 3a-3c / 5 (review_result / reviewed_head_sha / round の最終確認)
- op-merge gate 3i (op_run_session_id の forge 防止検証 — non-empty / != "unknown" を要求)
- op-merge フェーズ 1-1 (chain 起動時の PR filter — op_run_session_id で自 session の PR のみに絞り込む、本 Issue #208 で追加)

Meaning:
- review lifecycle metadata block。`review_result` (`approve` / `needs-fix` / `needs-specialist-review` /
  `blocked`) / `reviewed_head_sha` / `review_round` / `max_review_fix_rounds` / `global_review_expert` を含む。

Not meaning:
- review 単体での merge approval ではない。`pro-reviewed` ラベル付与と head_sha 一致が別途必要。

Runtime spawn effect:
- なし。op-run 側で `needs-fix` 系の場合は specialist expert 再 spawn を判定する。

Merge blocking effect:
- `review_result != approve` または `reviewed_head_sha != current head` の場合 op-merge は中断する
  (op-merge gate 3a〜3c / 5)。

---

### `<!-- op-review-finding -->`

Owner / producer:
- review-expert (finding の内容生成者。1 件ごとに 1 block を構造化して返す)
- ClusterOrchestrator (op-run controller が Agent tool で spawn) — review-expert が返す finding を PR コメントとして投稿する。ADR-0016 決定7 (#744) により、投稿主体が op-run controller から CO に移管。

Consumer:
- op-run (Review Fix Loop で specialist expert に handoff する入力)
- op-merge (`needs-fix` / `needs-specialist-review` / `blocked` finding が残っていないかの確認)

Meaning:
- machine-readable な review finding。`result` (`needs-fix` / `needs-specialist-review` / `blocked`) /
  `reviewed_round` / `reviewed_at` / 必要に応じた candidate specialist 等を含む。

Not meaning:
- approve finding は本 block を出さない (review_result=approve の時は finding 不要)。

Runtime spawn effect:
- なし。op-run 側で finding を読んで specialist 再 spawn を判定する。

Merge blocking effect:
- 本 finding が残ったまま re-review で解消されないと merge 不可。

---

### `<!-- op-review-finding-direct -->`

Owner / producer:
- review-expert in **Direct Mode only** (`evidence_grade: direct` を満たす finding に限定)

Consumer:
- 人間 (Direct Mode の review 結果を読むため)
- manual review tooling

Not consumer:
- op-run Review Fix Loop (finding 抽出は `<!-- op-review-finding -->` のみを対象とする)
- op-merge gate (merge blocking 根拠にしない)

Meaning:
- review-expert が **Direct Mode** で出した direct evidence finding。
- OP-managed Mode の `<!-- op-review-finding -->` と区別するための別 marker。

Not meaning:
- OP-managed の自動継続経路 (op-run Review Fix Loop / op-merge gate) の入力ではない。
- 推測 / 間接証拠 finding をこの marker で出してはならない。

Merge blocking effect:
- なし (Direct Mode 専用 marker のため)。

---

### `<!-- op-review-report -->`

Owner / producer:
- review-expert in **Direct Mode only** (review 結果のサマリ block)

Consumer:
- 人間 (PR 本文 / コメントで Direct Mode review 結果を読むため)
- manual review tooling

Not consumer:
- op-run Review Fix Loop
- op-merge gate (provenance / 続行可否の根拠にしない)

Meaning:
- review-expert が **Direct Mode** で出力する人間可読サマリ block。findings 数 /
  reviewed_head_sha / review_round 等。

Not meaning:
- machine-readable な lifecycle metadata ではない (それは OP-managed Mode の `<!-- op-review-meta -->`)。

---

### `<!-- op-specialist-review-meta -->`

Owner / producer:
- specialist reviewer expert (**active expert only**。
  `security-expert` / `debug-expert` / `feature-expert` / `test-expert` / `designer-expert` /
  `refactor-expert` / `optimize-expert` / `ux-ui-audit-expert` のいずれかが
  `needs-specialist-review` finding を引き受けた時)
- planned expert (`release-expert` / `compatibility-expert` / `env-expert`) は producer になれない。
  `spec-expert` は active だが op-spec 専用 Utility Worker (op-run の specialist review に参加しない) のため
  同じく producer になれない (詳細は `skills/_shared/planned-experts.md` /
  `skills/_shared/active-expert-registry.md` および `skills/_shared/markers/review-markers.md`)

Consumer:
- op-run (specialist review 結果の取り込み / Review Fix Loop 進行)
- op-merge (specialist review 通過確認)

Meaning:
- specialist review lifecycle metadata。元 finding / 担当 specialist / 結果を残す。

Not meaning:
- global review (review-expert) を置き換えるものではない。global review は review-expert 専任。

Merge blocking effect:
- specialist review が `needs-fix` / `blocked` のままなら merge 不可。

---

### `<!-- op-review-controller-meta -->`

Owner / producer:
- ClusterOrchestrator (op-run controller が Agent tool で spawn) — Review Fix Loop の terminal state を残す時のみ。
  ClusterOrchestrator が担当する前は op-run controller が書いていたが、ADR-0016 決定7 (#744) により CO に移管。

Consumer:
- op-merge (terminal blocked PR の継続停止根拠の追跡 / audit trail として参照)
- 人間 (review_round 上限超過の経緯追跡)

Meaning:
- Review Fix Loop の controller-side terminal state。`controller_result` /
  `reason` / `review_round` / `max_review_fix_rounds` / `controlled_at` / `controller` を含む。
- canonical `<!-- op-review-meta -->` (review-expert 出力) と独立して controller の
  terminal 判定を残すための別 marker。詳細 field schema は
  `skills/_shared/markers/review-markers.md` を参照。

Not meaning:
- review-expert の判定ではない (それは `<!-- op-review-meta -->`)。
- run 全体の controller metadata ではない (それは `<!-- op-run-controller-meta -->`)。

Merge blocking effect:
- 単独では merge をブロックしない。実 merge gate は `<!-- op-review-meta -->` の
  `review_result` と `pro-review-blocked` ラベルを根拠にする。本 marker は補助 audit trail。

---

## Post-check / Gate Markers

apply 後の domain-specific 再検証 (post-check) の result / metadata と、UX/UI / security gate の出力に
使われる marker 群。op-merge gate 11〜18 が読み取る。

### `<!-- op-post-check-meta -->`

Owner / producer:
- post-check 担当 expert (security-expert / ux-ui-audit-expert 等)

Consumer:
- op-run (post-check round 制御)
- op-merge (post-check 通過 gate / forge 検出)

Meaning:
- post-check lifecycle metadata block。`audit_result` (`PASS` / `PASS_WITH_NOTES` / `BLOCK` 等) /
  `post_check_result` (canonical 4 値: `pass` / `pass_with_notes` / `block` / `needs_human_decision`) /
  `post_check_expert` / `post_checked_head_sha` / `post_check_round` / 必要に応じた domain 固有フィールドを含む。

Not meaning:
- review-expert の出力ではない (それは `op-review-meta`)。

Merge blocking effect:
- `post_check_result != pass / pass_with_notes` または `post_checked_head_sha != current head` の場合
  op-merge は対象 gate (11〜18) で中断する。
  (注: `audit_result` は domain 固有 expert の出力フィールドとして残存するが、gate 判定の primary key は
  `post_check_result` (lower_case 4 値) であり `audit_result` は gate 条件には使わない。
  詳細は `post-check-markers.md` の「op-merge gate ルール」節を参照)

---

### `<!-- op-security-post-check -->`

Owner / producer:
- security-expert (security domain finding の post-check として apply 後に実施)

Consumer:
- op-merge gate 14〜18 (security 影響 PR の post-check provenance / 結果 / `legitimate_workflow_preserved` /
  `requires_aux_post_check` 判定)

Meaning:
- security post-check の本体 result block。直後の `op-post-check-meta` と組み合わせて security 固有
  フィールド (`security_result` / `finding_resolved` / `new_attack_surface_introduced` /
  `scope_out_violation` / `secret_or_path_leak_detected` / `workflow_preservation_result` /
  `legitimate_workflow_preserved` / `ux_impact` / `affected_user_capability` /
  `requires_aux_post_check` / `aux_post_check_experts` / `aux_post_check_status` 等) を表現する。

Runtime spawn effect:
- なし。ただし `requires_aux_post_check: true` の場合 op-run が ux-ui-audit-expert auxiliary post-check を
  spawn する判定の入力になる。

Merge blocking effect:
- 失敗・未解決 / forge / stale (`post_checked_head_sha != current head`) のままでは security 影響 PR は
  merge 不可 (op-merge gate 14〜18)。

---

### `<!-- op-security-requires-aux-post-check -->`

Owner / producer:
- security-expert / op-scan (security finding 起票時に UI / workflow 影響を予告する場合)

Consumer:
- op-run (auxiliary post-check として ux-ui-audit-expert を spawn する判定)
- op-merge gate 18 (aux post-check 通過確認)

Meaning:
- security mitigation が UI / workflow に影響する可能性があり、auxiliary post-check (通常 ux-ui-audit-expert)
  が必要であることを宣言する hidden marker。

Not meaning:
- security post-check 自体を skip する根拠ではない (本体は別途必要)。

Runtime spawn effect:
- op-run が auxiliary post-check spawn を判定するトリガー。

Merge blocking effect:
- 本 marker が立っているのに aux post-check が `required_pending` / `block` / `skipped` / `stale` /
  forge のままでは merge 不可 (op-merge gate 18)。

---

### `<!-- op-ux-ui-audit -->`

Owner / producer:
- ux-ui-audit-expert (UX/UI Audit Gate 出力 / apply 後の post-check / aux post-check)

Consumer:
- op-run (Design Plan gate 通過確認 / post-check spawn 制御)
- op-merge gate 11〜13 / 18 (UX/UI 影響 PR の post-check provenance / 結果 / aux post-check 判定)

Meaning:
- UX/UI 監査結果の本体 block。Design Plan gate 段階・apply 後 post-check 段階・security 由来 aux post-check
  段階のいずれでも使用される。直後の `op-post-check-meta` と組み合わせて結果を表現する。

Not meaning:
- design 系の Design Plan 自体ではない (それは Design Plan テンプレ + `op-design-plan-by`)。

Merge blocking effect:
- 失敗・未解決 / forge / stale のままでは UI 影響 PR は merge 不可 (op-merge gate 11〜13 / 18)。

---

### `<!-- op-ux-ui-gate -->`

Owner / producer:
- ux-ui-audit-expert (Design Plan に対する UX/UI Audit Gate Result 出力)

Consumer:
- op-architect / op-run (Design Plan gate の audit_result / blocking_count / notes_count を parse)

Meaning:
- machine-readable header block。Design Plan に対する gate 結果 (`audit_result` / `blocking_count` /
  `notes_count` 等) を表現する。

Not meaning:
- apply 後の post-check 結果ではない (それは `op-ux-ui-audit` + `op-post-check-meta`)。

Merge blocking effect:
- なし (Design Plan 段階の gate なので、PR 段階の merge gate には直接効かない。
  apply 後 post-check 側でブロック判定が再度行われる)。

---

### `<!-- op-planned-post-check-skipped -->`

Owner / producer:
- ClusterOrchestrator (op-run controller が Agent tool で spawn) — post-check 担当が planned expert (`env` / `compatibility` / `spec`) で spawn できない場合。フェーズ5.5 post-check dispatch を CO が担うため、ADR-0016 決定7 (#744) により CO に移管。

Consumer:
- op-merge (post-check 不在の理由を確認し、他 gate との組み合わせで判定)
- 人間 (planned expert が未実装である事実の追跡)

Meaning:
- 本来 post-check が必要だが、担当 expert が planned (未実装) のため skip した事実を残す marker。

Not meaning:
- 単体では merge-blocking ではない。op-merge は他の gate (security / ux-ui / review) と組み合わせて判断する。

Runtime spawn effect:
- なし。むしろ「spawn しなかった事実」を記録するもの。

Merge blocking effect:
- 単体では merge-blocking ではない。

---

## Controller / Run Markers

op-run controller / 設計プランナーが PR / Issue に埋める marker 群。run 単位の identity / fallback 状況を残す。

### `<!-- op-run -->`

Owner / producer:
- op-run (run 開始時 / PR 作成時)

Consumer:
- op-merge / op-patrol / 人間 (op-run 由来の PR / コメントの識別)

Meaning:
- op-run 由来であることを示す identity marker。

Not meaning:
- run 単位の一意 ID ではない (それは `op-run-id`)。

---

### `<!-- op-run-id: <run-id> -->`

Owner / producer:
- op-run controller (フェーズ 0-base で run id を確定)

Consumer:
- op-run controller (cluster / worktree / PR の run 単位の紐付け)
- op-merge (PR が同 run 内のどの cluster 由来か追跡)

Meaning:
- 単一 op-run 起動の一意 ID (例: `<base-sha>-<timestamp>` 形式)。

Not meaning:
- worktree task-id ではない (task-id は `<verb>-<short>-YYYYMMDD-HHMMSS-<cluster-id>`)。

---

### `<!-- op-run-controller-meta -->`

Owner / producer:
- op-run controller

Consumer:
- op-merge (run 全体の base ref / SHA / cluster サマリの参照)
- 人間 (run の経緯追跡)

Meaning:
- **run 単位**の controller metadata block。`OP_RUN_BASE_REF` / `OP_RUN_BASE_SHA` /
  cluster 数 / fallback 適用状況等を含む。
- **review terminal state は本 marker で記録しない** (それは `<!-- op-review-controller-meta -->`)。

Not meaning:
- review meta / post-check meta ではない。
- Review Fix Loop の terminal state ではない (それは `<!-- op-review-controller-meta -->`)。

---

### `<!-- op-fallback-applied -->`

Owner / producer:
- op-run controller (planned expert を active fallback に再分類した場合)

Consumer:
- op-merge / 人間 (どの planned domain がどの active expert に fallback したかの追跡)

Meaning:
- 本来 planned (`env` / `compatibility` / `spec`) として routing された Issue / PR が、active expert
  (`debug-expert` / `refactor-expert` / `feature-expert`) に再分類された事実を残す marker。

Not meaning:
- `release-expert` の fallback 結果としては付与しない (release-expert は fallback destination としても
  使用禁止。spawn 前に debug/refactor/`needs_human_decision` に再分類する)。

Runtime spawn effect:
- なし (むしろ fallback 適用後の事実を記録する)。

必須フィールド:

```text
<!-- op-fallback-applied -->
source_expert: env-expert | compatibility-expert | spec-expert | release-expert | <unregistered>
normalized_to: debug-expert | refactor-expert | feature-expert | security-expert | needs_human_decision
source_context: issue-routing | review-finding | post-check | other
source_id: <issue 番号 | finding id | null>
reason: <短い理由 1 行>
applied_at: <ISO8601>
controller: op-run
```

| フィールド | 型 | enum / 制約 | 説明 |
|---|---|---|---|
| `source_expert` | enum | planned expert 名 (`env-expert` / `compatibility-expert` / `release-expert`) / op-run 非対象 Utility Worker (`spec-expert`) / `<unregistered>` | どこから fallback されたか。`release-expert` は **fallback destination としては禁止**だが、誤って routing された source としては記録する。`spec-expert` は op-spec 専用 Utility Worker (op-run routing 対象外) だが、誤 routing 時の source として normalize される (`op-run-expert: spec-expert` → `feature-expert`) |
| `normalized_to` | enum | active apply expert 名 (`debug-expert` / `refactor-expert` / `feature-expert` / `security-expert`) または `needs_human_decision` | 正規化先。`release-expert` は不可 |
| `source_context` | enum | `issue-routing` / `review-finding` / `post-check` / `other` | fallback が発生した文脈 |
| `source_id` | string \| null | Issue 番号 / finding id (例: `RVW-001`)。`source_context = other` のとき null 可 | 紐付け識別子 |
| `reason` | string | 1 行 | なぜ active expert または `needs_human_decision` に倒したか |
| `applied_at` | string | ISO8601 | 正規化適用時刻 |
| `controller` | string | 必ず `op-run` | 出力者識別 |

---

### `<!-- op-design-plan-by: <agent-name> -->`

Owner / producer:
- designer-expert / feature-expert (UI 影響 Issue で Design Plan を埋め込む際)

Consumer:
- op-run (Design Plan gate の作者識別 / ux-ui-audit-expert への入力)
- op-merge (Design Plan provenance 追跡)

Meaning:
- Design Plan を作成した expert の identity。

Not meaning:
- apply 担当 expert を強制するものではない。

Merge blocking effect:
- なし (本 marker 単体では)。Design Plan の妥当性は ux-ui-audit-expert 側 gate が判定する。

---

## Override Markers

人間が明示承認した例外運用を表現する marker。常用厳禁。

### `<!-- op-manual-override -->`

Owner / producer:
- 人間 (PR / Issue コメントで明示承認時)

Consumer:
- op-merge gate 12〜13 / 15〜16 / 18 (UX/UI / security post-check skip + BLOCK の例外承認)
- 監査ログ / 人間 (override 履歴追跡)

Meaning:
- documented override procedure に従った例外承認 block。`override_target` (`pro-ux-ui-audit-manual-override`
  または `pro-security-post-check-manual-override`) / `approver` / `reason` / `followup_issue` /
  `overridden_at` / `reviewed_head_sha` (現在の PR `headRefOid` と一致必須) 全フィールド充足が必要。

Not meaning:
- 無制限 bypass ではない。`override_target` を伴わない単独付与は無効。
- **label 単独では gate を絶対に skip しない**。対応 label (`pro-ux-ui-audit-manual-override` /
  `pro-security-post-check-manual-override`) と本 block の AND 条件 (trusted-author 投稿 +
  `reviewed_head_sha` が現在の PR `headRefOid` と一致 + 全必須フィールド充足) が揃った場合のみ
  op-merge は gate を skip する。

Merge blocking effect:
- gate skip 効果を持つ。**ただし詳細な field 仕様 / `has_valid_manual_override` 判定 / validation rule は
  `skills/_shared/markers/merge-gate-markers.md (>=2)` を canonical 正本とする**。

---

## Patrol Markers

op-patrol が巡回履歴を Patrol Ledger Issue で管理する際に使用する marker 群。
**本節 entry は marker name / owner / consumer / 基本 meaning の正本** であり、JSON コメント全体構造 /
field 単位 schema / area_state レコード構造 / `run_id` / `checkpoint_id` 命名規則 / state 復元手順 /
parse fallback / compact 条件は `skills/_shared/markers/patrol-markers.md` を正本とする。
op-patrol の運用フェーズ進行 / gh コマンド / Ledger Issue 作成手順は `skills/op-patrol/SKILL.md` を参照。

### `<!-- op-patrol-run -->`

Owner / producer:
- op-patrol (1 巡回 run の開始時)

Consumer:
- op-patrol (Patrol Ledger Issue のコメントで巡回履歴を追跡)
- 人間 (どの巡回でどの区画を audit したかの追跡)

Meaning:
- 単一 op-patrol 起動の identity marker。

Not meaning:
- run 単位の checkpoint ではない (それは `op-patrol-checkpoint`)。

---

### `<!-- op-patrol-checkpoint -->`

Owner / producer:
- op-patrol (区画 audit 完了 / Issue 起票 / 既存 Issue update 時)

Consumer:
- op-patrol (Patrol Ledger Issue で `seen_count` / `last_seen_at` 更新の根拠)
- 人間 (区画ごとの最終巡回時刻の追跡)

Meaning:
- 区画単位の巡回 checkpoint metadata。`area` / `risk_trend` / `last_seen_at` 等を含む。

Not meaning:
- finding 自体ではない (finding は通常の `auto-report` Issue として起票される)。

---

## Spec Patrol Markers

op-spec-patrol (ADR-0017 W3、canonical spec 巡回) が巡回履歴を **Spec Patrol Ledger Issue** で管理する際に使用する
marker 群。op-patrol の Patrol Ledger とは **別個の Issue** (label `op-spec-patrol` + `op-state` + `do-not-close`)。
**本節 entry は marker name / owner / consumer / 基本 meaning の正本**。JSON コメント全体構造 / field 単位 schema /
area_state レコード構造 / `run_id` / `checkpoint_id` 命名規則 / state 復元手順は op-core::spec::ledger (Rust types) が
実装正本であり、運用フェーズ進行 / gh コマンドは `skills/op-spec-patrol/SKILL.md` を参照する。
patrol marker (`op-patrol-run` / `op-patrol-checkpoint`) と **prefix が衝突しない** よう `op-spec-patrol-*` を用いる。

### `<!-- op-spec-patrol-run -->`

Owner / producer:
- op-spec-patrol (1 巡回 run の記録時)

Consumer:
- op-spec-patrol (Spec Patrol Ledger Issue のコメントで巡回履歴 = どの feature をいつ巡回したかを追跡)
- 人間 (どの巡回でどの正本を監査したかの追跡)

Meaning:
- 単一 op-spec-patrol 起動の identity marker。`run_id` / `patrolled_features` / `drift_counts` 等を含む。

Not meaning:
- checkpoint (集約スナップショット) ではない (それは `op-spec-patrol-checkpoint`)。
- op-patrol の `op-patrol-run` とは別 (対象が canonical spec の domain drift であり、コードバグ巡回ではない)。

---

### `<!-- op-spec-patrol-checkpoint -->`

Owner / producer:
- op-spec-patrol (複数 run を集約した area_state スナップショット記録時)

Consumer:
- op-spec-patrol (Spec Patrol Ledger で `last_patrolled_at` / `scan_count` 更新の根拠。`op spec-patrol score` の
  `--last-patrolled-at` 注入元)
- 人間 (feature ごとの最終巡回時刻の追跡)

Meaning:
- feature 単位の巡回 checkpoint metadata。`area_state` (feature → {last_patrolled_at, scan_count, drift_counts, last_run_id})。
- 冪等性のため op-fingerprint 行 `<!-- op-fingerprint: spec-patrol-checkpoint:<fp> -->` を先頭に持つ
  (op-patrol の `patrol-checkpoint:<fp>` とは prefix が異なり衝突しない)。

Not meaning:
- domain drift finding 自体ではない (confirmed drift は op-spec cultivation queue へ回す。本 wave では起票しない)。

---

## Claim Markers

op-run が Issue pick up 時に書き込む claim / cluster manifest marker 群。
**本節 entry は marker name / owner / consumer / 基本 meaning の正本** であり、
詳細 field schema / TTL ルール / race 調停方式 / 除外条件 / `op claim` CLI との対応は
`skills/_shared/markers/claim-markers.md` を正本とする。
op-run/SKILL.md への claim 呼び出し挿入手順は C4 Issue 完了後に追記される (現在未実装)。

### `<!-- op-claim: ... -->`

Owner / producer:
- op-run (Issue pick up 直後。`op claim acquire` CLI 経由で書き込む)

Consumer:
- op-run (二重 pick up 防止 / TTL 超過検出)
- `op claim sweep` (stale claim の定期掃除)
- 人間 / op-merge (claim 状態の追跡)

Meaning:
- op-run が Issue を claim (占有) していることを示す hidden marker。
  `task_id` / `acquired_at` / `ttl_seconds` / `schema_version` を含む。
  `op:in-progress` label の付与と同時に Issue 本文 hidden marker block へ書き込む。
  詳細 field schema は `skills/_shared/markers/claim-markers.md (>=1)` を参照。

Not meaning:
- apply / fix 担当 expert の routing ではない (それは `op-run-expert` marker)。
- review 結果 / post-check 結果ではない。
- `op:in-progress` ラベルの付与そのものではない (label + marker の AND が claim の正体)。

Runtime spawn effect:
- なし (claim 状態の記録のみ)。

Merge blocking effect:
- なし。claim marker は PR ではなく Issue 本文に書かれるため、merge gate の対象外。

---

### `<!-- op-cluster-manifest: ... -->`

Owner / producer:
- op-run (cluster 確定後。クラスタ内の全 Issue 本文に書き込む)

Consumer:
- op-run (cluster 内の Issue 一覧確認 / 並列実装の紐付け)
- 人間 / op-merge (どの Issue が同一 run の同一 cluster に属するか追跡)

Meaning:
- op-run の単一クラスタに属する Issue 群を紐付ける manifest marker。
  `run_id` / `cluster_id` / `cluster_issues[]` / `acquired_at` / `schema_version` を含む。
  同一クラスタの全 Issue に同じ `cluster_id` が付与される。
  詳細 field schema は `skills/_shared/markers/claim-markers.md (>=1)` を参照。

Not meaning:
- `op-run-id` marker (PR 本文に書かれる run 単位の identity) とは独立。
- cluster manifest は Issue 本文に書かれ、PR 本文には書かれない。

Runtime spawn effect:
- なし (紐付け情報の記録のみ)。

---

## Reclassification / Auxiliary Markers

### `<!-- op-reclassified-from: <original-domain-or-expert> -->`

Owner / producer:
- `op-run` (apply/fix 時に finding の domain / expert を再分類した場合)
- `op-scan` / `op-patrol` (起票時に scan finding の expert を再分類した場合、任意)

Consumer:
- 人間 reviewer (audit trail 用)
- `op-merge` (再分類履歴を PR 解説に含める)

Meaning:
- canonical schema field `reclassified_from` / `reclassified_to` / `reclassification_reason` (定義元 = `_shared/expert-spawn.md`) の **PR コメント側 mirror**。
- 主に `release-expert` 由来 finding を `debug-expert` / `refactor-expert` / `security-expert` / `needs:human-decision` に再分類した経緯を残す目的。

Not meaning:
- reclassification の **第二正本ではない**。canonical は schema field 側 (`reclassified_from` 他)。
- 本 marker 単独で再分類が完了したと主張しない (`reclassified_to` / `reclassification_reason` も併記する想定)。

Runtime spawn effect:
- なし (informational)。spawn target の決定は再分類後の `recommended_runner` / `recommended_fix_expert` および `active-expert-registry.md` を参照する。

Merge blocking effect:
- 単体で merge-blocking ではない。再分類後の active expert の post-check / verification 結果に従う。

---

## Enrichment Markers

Issue Enrichment 層 (op-scan / op-patrol / op-plan の 3 skill が共通参照する `_shared/issue-enrichment.md`)
が emit する metadata marker 群。詳細 schema / 運用フローは `_shared/issue-enrichment.md` を正本とする。
本ファイルは marker name / owner / core meaning の最小情報のみを保持する (Single Canonical Source Rule)。

### `<!-- op-enriched: true -->`

Owner / producer:
- enrichment-layer (op-scan / op-patrol / op-plan が enrichment を適用した時に書き込む共通層)

Consumer:
- op-run / op-merge (enrichment 済 Issue / PR かを判定し、未 enrichment なら blocking する gate に組み込む)
- 人間 reviewer (Issue / PR が enrichment 済かの監査)

Meaning:
- Issue / PR body に enrichment 層が適用済かを示す。
- **value 集合: `true` のみ** (false を埋めない方針 — 未 enrichment Issue は marker 自体を持たない)。
  詳細は `_shared/issue-enrichment.md §9` を正本とする。

Runtime spawn effect:
- なし (informational metadata)。

Merge blocking effect:
- 単体では merge-blocking ではない。op-run / op-merge が他 gate と組み合わせて判定する。

---

### `<!-- op-enrichment-loops: <非負整数> -->`

Owner / producer:
- enrichment-layer (cross-review fix loop の実行回数を記録する)

Consumer:
- 人間 reviewer (enrichment のループ数追跡)
- op-merge (履歴 audit)

Meaning:
- cross-review fix loop が何回実行されたかの非負整数値。0 = enrichment 未実行 (skip)。

---

### `<!-- op-enrichment-design-plan: <generated | skipped | failed | blocked> -->`

Owner / producer:
- enrichment-layer (Design Plan 生成状況を記録)

Consumer:
- op-run / op-merge (Design Plan 状態を後続 gate に伝搬)
- 人間 reviewer

Meaning:
- Design Plan の生成結果を enum で表現する 4 値:
  - `generated`: Design Plan が正常に生成された
  - `skipped`: Design Plan が不要と判定された
  - `failed`: 生成試行は行ったが失敗した
  - `blocked`: 前提条件不足等で着手を blocking した

Merge blocking effect:
- 単体では merge-blocking ではない。

---

### `<!-- op-enrichment-cross-review: <passed | passed_with_changes | blocked | skipped> -->`

Owner / producer:
- enrichment-layer (cross-review (相互 review) の最終判定を記録)

Consumer:
- op-run / op-merge
- 人間 reviewer

Meaning:
- cross-review の最終判定を enum で表現する 4 値:
  - `passed`: 修正なしで通過
  - `passed_with_changes`: fix loop を経て通過
  - `blocked`: cross-review が blocking 判定で停止
  - `skipped`: cross-review を実行しなかった

Merge blocking effect:
- 単体では merge-blocking ではない。

---

## Deprecated / Compatibility Markers

現状なし。

---

# Labels

OP runtime 全体で使う GitHub label の正本一覧。詳細色 / 詳細運用は op-architect / op-merge / op-run の
SKILL.md および `pr-templates.md` の「ラベルカタログ」節 (本ファイルへの pointer に降格済み) を参照する。

**重要原則**: **既存互換 label は削除せず、deprecated / compatibility に分類して保持する**。
過去 PR / Issue で参照されている label を消すと履歴が壊れる。

---

## Label Categories (7 分類)

label は以下の 7 カテゴリに分類する。

1. Active PR review state labels (例: `pro-reviewed`, `pro-review-blocked`)
2. Active Issue routing labels (例: `pro-feature-expert`, `pro-debug-expert`)
3. Active post-check labels (例: `pro-ux-ui-audit-needs-fix`, `pro-security-post-check-skipped`)
4. Human-decision labels (`needs:human-decision` / `needs:human-decision-followup` /
   `needs:boundary-decision` / `needs:spec-decision` / `needs:triage`)
5. Specialist review labels (`needs-specialist-review`)
6. Deprecated / compatibility labels (現行で新規付与しないが履歴互換のため残す)
7. Historical / roadmap-only labels (roadmap でのみ言及される構想中 label)

---

## Spawn Metadata Markers

OP-managed mode で controller が spawn 時に記録する metadata 系 marker 群。`model-selection.md` §9.2 と
integral。

### `<!-- op-model-degraded: <expert>:<reason>:<phase> -->`

Owner / producer:
- ClusterOrchestrator (op-run controller が Agent tool で spawn) — apply / post-check / aux post-check / global review spawn 時に degrade を検知した場合。ADR-0016 決定7 (#744) により CO に移管。
- op-scan / op-patrol controller (audit spawn 時に degrade を検知した場合。scan/patrol は CO 経由でないため controller が引き続き担当)

Consumer:
- post-check expert (apply degrade の `requires_redo` 判定で参照)
- op-run controller (post-check / review degrade を merge-blocking state として扱う)
- op-merge (review degrade 残存時の gate 判定 / Opus 復旧待ち)

Value:
- `<expert>:<reason>:<phase>` 形式
  - `expert` — degrade 対象 expert (例: `review-expert`, `feature-expert`, `security-expert`)
  - `reason` — `rate_limit` / `unavailable` / `quota_exceeded` のいずれか
  - `phase` — `apply` / `post-check` / `aux-post-check` / `review` / `audit` のいずれか

Meaning:
- OP-managed mode で controller が Opus を要求したが、API 側の rate limit / unavailable で Sonnet に
  degrade した spawn を記録する。controller は degrade を黙って隠さない。
- `model-selection.md` §9.2 の degrade 挙動 (3 phase 区分の判定主体・動作) と一対一で対応する。

Not meaning:
- expert 自身の判断で model を変えた、ではない (controller が決定権を持つ)。
- Direct Mode の Sonnet 動作は degrade ではない (frontmatter default のため marker 記録対象外)。
- 単発の `--quality low` 適用結果は degrade ではない (ユーザー意図のため記録対象外)。

Runtime spawn effect:
- なし (記録 marker)。

Merge blocking effect:
- `phase: post-check` / `phase: review` の degrade は **merge-blocking** (op-merge が Opus 復旧と redo 完了を待つ)
- `phase: apply` の degrade は post-check の `requires_redo` 判定に渡される (post-check が品質懸念を返せば redo)
- `phase: audit` (scan / patrol) は merge gate 外。起票 gate (Opus 単発) は Opus 復旧で再実行

詳細仕様: `_shared/model-selection.md` §9.2 / `_shared/runtime-contract.md` §11 (Merge-Blocking State Categories) と整合。

### `model_used` / `model_decision_reason` (review-expert narrow opt-down 観測 field)

Owner / producer:
- ClusterOrchestrator (op-run controller が Agent tool で spawn) — フェーズ6 global review spawn 時、`global-review-spawn.md` §4-1-b の narrow opt-down 判定で確定。ADR-0016 決定7 (#744) により CO に移管。

Consumer:
- review-expert (渡された値を `<!-- op-review-meta -->` の任意 field にそのまま転写)
- 人間 (§7.1.5 の 30 日手動振り返りで Sonnet 群 / Opus 群を識別)

Value:
- `model_used` — `opus` / `sonnet` のいずれか (実 spawn に使われた model)
- `model_decision_reason` — narrow opt-down 判定の reason enum:
  - `narrow-opt-down` — 5 条件 AND を満たし Sonnet へ opt-down した
  - `default-opus` — opt-down 条件を満たさず Opus 維持 (具体 reason 不明 / 複合)
  - `large-pr-loc` — LOC > 100 で Opus 維持
  - `large-pr-file-count` — 変更ファイル数 > 100 (safety default) で Opus 維持
  - `sensitive-path` — sensitive glob 該当で Opus 維持
  - `quality-high` — `--quality high` 指定で Opus 維持
  - `kill-switch` — `OP_REVIEW_OPT_DOWN_DISABLE=1` で Opus 維持
  - `model-degraded` — degrade 進行中で Opus 維持

Meaning:
- review-expert spawn の model 決定根拠を観測可能にする。canonical 判定仕様は
  `model-selection.md` (>=3) §7.1、bash 実装は `global-review-spawn.md` §4-1-b。
- `<!-- op-review-meta -->` の任意 field として転写される (schema: `markers/review-markers.md`)。

Not meaning:
- 必須 field ではない (controller が値を渡さなければ review-expert は省略してよい)。
- op-merge gate には影響しない (任意 field、merge 判定には使わない)。

Runtime spawn effect:
- なし (観測 marker)。

Merge blocking effect:
- なし (任意 field)。

詳細仕様: `_shared/model-selection.md` (>=3) §7.1 / `_shared/markers/review-markers.md` の `op-review-meta` 任意 field 節。

---

## 1. Active PR Review State Labels

| Label | Owner | Consumer | Meaning | Merge blocking effect |
|---|---|---|---|---|
| `pro-reviewed` | op-run (フェーズ4 review-expert 通過後) | op-merge | review-expert global review 通過 PR (current head sha に対して approve)。op-merge 対象。 | 必要 (本 label 不在ではマージ不可)。 |
| `pro-review-needs-fix` | op-run (review_result=needs-fix / needs-specialist-review) | op-run (Review Fix Loop) / op-merge | review で修正必要が判明した PR。op-merge 対象外、Review Fix Loop で specialist expert に再委任。 | あり (このまま merge 不可)。 |
| `pro-review-fix-in-progress` | op-run (specialist expert に再委任中) | op-merge | specialist expert による Review Fix が進行中の PR。 | あり (このまま merge 不可)。 |
| `pro-review-stale` | op-run (review 後に head sha が進んだ場合) | op-run (再 review トリガー) / op-merge | review 完了後に head sha が進んだため再 review が必要な PR。 | あり (このまま merge 不可、再 review 必須)。 |
| `pro-review-blocked` | op-run (review_result=blocked) | op-merge / 人間 | loop 上限超過 / scope_out / 人間判断必要で自動継続不可と判定された PR。排他制御で他 review 系 label を全 remove。 | あり (人間判断待ち、merge 不可)。 |

---

## 2. Active Issue Routing Labels

apply / post-check 担当 expert を表す label。**完全形式 (`pro-<expert>-expert`) を使用し、
短縮形 (`pro-debug` 等) は使わない**。

| Label | Owner | Consumer | Meaning | Merge blocking effect |
|---|---|---|---|---|
| `pro-debug-expert` | op-scan / op-patrol / op-architect / op-run | op-run (apply 担当解決) | debug-expert (root cause / 不具合修正) 担当 Issue / PR。 | なし (routing only)。 |
| `pro-refactor-expert` | op-scan / op-patrol / op-architect / op-run | op-run | refactor-expert 担当 Issue / PR。 | なし (routing only)。 |
| `pro-feature-expert` | op-scan / op-patrol / op-architect / op-run | op-run | feature-expert 担当 Issue / PR。 | なし (routing only)。 |
| `pro-optimize-expert` | op-scan / op-patrol / op-run | op-run | optimize-expert 担当 Issue / PR。 | なし (routing only)。 |
| `pro-test-expert` | op-scan / op-patrol / op-run | op-run | test-expert 担当 Issue / PR。 | なし (routing only)。 |
| `pro-designer-expert` | op-architect / op-scan / op-patrol / op-run | op-run | designer-expert (Design Plan / 実装) 担当 Issue / PR。 | なし (routing only)。 |
| `pro-ux-ui-audit-expert` | op-architect / op-scan / op-patrol / op-run | op-run (post-check spawn) / op-merge | ux-ui-audit-expert (検出 / Design Plan gate / apply 後 post-check) 担当 Issue / PR。UI 影響あり Issue / PR には必ず付与。 | なし (本 label 単体では。post-check 結果は別 label / marker で判定)。 |
| `pro-security-expert` | op-scan / op-patrol / op-run | op-run (apply 兼 post-check) / op-merge | security-expert 担当 Issue / PR。基本 1 つで apply 兼 post-check。op-run 判定で apply を debug-expert に回す場合は `pro-debug-expert` + `pro-security-expert` の両方付与。 | なし (本 label 単体では)。 |
| `pro-env-expert` | op-scan / op-patrol / op-architect / op-run | op-run (active fallback / planned skip 判定) | env-expert (planned) 担当 routing label。env-expert 未実装期間中は apply を `debug-expert` / `refactor-expert` に active fallback。release / installer / distribution 方針判断は `release-expert` planned のため `needs_human_decision` に倒す。**planned expert を runtime fallback 先にしない**。 | なし。 |
| `auto-report` | op-scan / op-patrol | op-run (clustering 候補) / op-merge | op-scan / op-patrol が起票した自動 audit Issue。 | なし。 |
| `auto-fix` | op-run (PR 作成時) | op-merge / op-patrol | op-run が作成した自動 apply PR。 | なし。 |
| `op-architect` | op-architect | op-run (初期マイルストーン routing) | op-architect 由来の Issue / マイルストーン。 | なし。 |
| `op-patrol` | op-patrol | op-run / 人間 | op-patrol 起票 Issue。`auto-report` と併用。 | なし。 |
| `op-spec-patrol` | op-spec-patrol | op-spec-patrol / 人間 | op-spec-patrol の Spec Patrol Ledger Issue 識別 label (ADR-0017 W3)。`op-state` / `do-not-close` と併用し、`op spec-patrol ledger init` / `--auto-find` 相当の自動検索キーになる。op-patrol の Patrol Ledger とは別個の Issue。 | なし。 |
| `op-state` | op-patrol / op-run / op-spec-patrol | op-patrol / op-run / op-spec-patrol (Patrol Ledger / Spec Patrol Ledger 等の永続 Issue 識別) | op-* skill が state を保持する専用 Issue (Patrol Ledger / Spec Patrol Ledger 等)。 | なし。 |
| `do-not-close` | op-patrol / op-run / op-spec-patrol | op-merge / 人間 | 自動 close 禁止 Issue (Patrol Ledger / Spec Patrol Ledger 等の永続 Issue)。op-merge は本 label 付き Issue を close しない。 | なし (PR には付かない)。 |
| `patrol` | op-patrol | 人間 / op-run | op-patrol で起票したことを示す追加 label (`auto-report` と併用)。 | なし。 |
| `batch` | op-scan / op-patrol | op-run / 人間 | バッチ Issue (5 件以上同 bulk_group を 1 Issue 化)。 | なし。 |
| `derived-from-issue` | op-scan (`--from-issue` 派生時) | op-merge / 人間 | op-scan `--from-issue` 派生 Issue (元 Issue 1 件 → 派生 1 件の 1:1 対応)。 | なし。 |
| `derived-from-pr` | op-scan (`--from-merged-pr` 派生時) | op-merge / 人間 | op-scan `--from-merged-pr` により merged PR の残存リスクから派生起票された Issue。color: `0E8A16`。 | なし。 |
| `superseded-by-scan` | op-scan (`--from-issue` 元 Issue 側) | op-merge / 人間 | op-scan `--from-issue` で派生 Issue に置き換えられた元 Issue。 | なし。 |
| `requires-normalization` | op-run (`--auto` partial) | 人間 | op-run `--auto` モードで partial 判定され、人間レビューが必要な Issue。 | なし。 |
| `needs-clarification` | op-run (フェーズ1.5 insufficient 判定) | 人間 | op-run フェーズ1.5 insufficient 判定で人間に投げ返した Issue。 | なし。 |
| `milestone:initial` | op-architect | op-run / 人間 | op-architect 起票の初期マイルストーン Issue。 | なし。 |
| `module:*` | op-scan / op-patrol / op-architect | op-run (clustering の高優先度 hint) | モジュール分類 (例: `module:auth`)。 | なし。 |
| `area:*` | op-patrol | op-patrol (Patrol Ledger 区画整合) / op-run (clustering hint) | op-patrol の area 分類 (例: `area:export`)。 | なし。 |
| `severity:critical` | op-scan / op-patrol / 人間 | op-run / op-merge | 深刻度 Critical (現行正式表記)。 | なし (label 単体では merge ブロックなし、op-merge は別 gate で判定)。 |
| `severity:high` | op-scan / op-patrol / 人間 | op-run / op-merge | 深刻度 High (現行正式表記)。 | なし。 |
| `severity:medium` | op-scan / op-patrol / 人間 | op-run | 深刻度 Medium。 | なし。 |
| `severity:low` | op-scan / op-patrol / 人間 | op-run | 深刻度 Low。 | なし。 |
| `severity:n/a` | op-scan (`--from-issue` 由来 feature 追加要望等) | op-run | severity 概念に当てはまらない Issue。 | なし。 |
| `op:architecture-debt` | refactor-expert / op-scan | op-patrol / op-run | refactor-expert の `finding_type=architecture_debt` 起票 Issue。op-patrol が fingerprint で再検出して `seen_count` / `last_seen_at` を更新する追跡対象。 | なし (本 label 単体では)。 |
| `op:staged-refactor` | refactor-expert / op-scan | op-run | refactor-expert の `finding_type=staged_refactor` 起票 Issue。1 PR で 1 stage のみ実行。 | なし (本 label 単体では)。 |
| `op:blocking-finding` | refactor-expert (`blocking=true` finding) | op-run / op-merge | 新規変更が既存 architecture_debt を悪化させた場合に refactor-expert が `blocking=true` で返した finding。 | あり (本 label を持つ open Issue を `Fixes #N` で **少なくとも 1 件** 閉じない PR は op-merge gate 21 で停止)。 |
| `op:in-progress` | op-run (`op claim acquire` 経由で付与) | op-run (Issue 取得クエリで除外) / `op claim sweep` (stale 掃除) / 人間 | op-run が Issue を claim (占有) していることを示す label。`<!-- op-claim: ... -->` marker と同時に付与・削除する。Issue 取得クエリでは `-label:op:in-progress` で除外する。**除外条件**: `op-state` / `do-not-close` ラベル付き永続 Issue (Patrol Ledger #30 等) には付与しない。詳細は `skills/_shared/markers/claim-markers.md (>=1)` の「除外条件」節を参照。 | なし (merge gate 対象外。Issue 占有の記録のみ)。 |
| `op:foundation-precondition` | designer-expert / op-architect / op-plan | op-run (後続 wave スケジューリング) / 人間 (planning-time ordering) | foundation token system / base component が不在で、当該 feature Issue が着手前に foundation build Issue の完了を必要とすることを示す **tracking marker** (ADR-0012)。enforcement は merge gate ではなく planning-time human ordering (op-plan ExitPlanMode / op-architect milestone 配置)。op-run の `depends_on` 自動消費は未実装のため当面は順序の可視化のみ。 | **なし** (gate 21 footgun 回避のため意図的に merge-blocking 効果を持たせない。`op:blocking-finding` とは別 semantics)。 |

---

## 3. Active Post-check Labels

apply 後の domain 別 post-check 結果を表す label 群。op-merge gate 11〜18 が読み取る。

| Label | Owner | Consumer | Meaning | Merge blocking effect |
|---|---|---|---|---|
| `pro-ux-ui-audit-needs-fix` | op-run (UX/UI post-check BLOCK 時に付与) | op-run (designer-expert 再実装トリガー) / op-merge | UX/UI post-check で BLOCK 判定。designer-expert 再実装が必要、op-merge 対象外。 | あり (op-merge gate 11)。 |
| `pro-ux-ui-audit-skipped` | op-run (UX/UI post-check spawn 失敗時) | op-merge / 人間 | UX/UI post-check spawn 失敗で skip 状態。UI 影響 PR ではマージ不可 (再実行 or manual-override が必要)。 | あり (op-merge gate 12)。 |
| `pro-ux-ui-audit-manual-override` | 人間 (緊急対応 hotfix 等で skip / BLOCK の例外承認) | op-merge | UX/UI post-check skip / BLOCK を人間が明示承認した PR。`<!-- op-manual-override -->` block 必須。常用厳禁。**重要**: この label は **単独では gate を絶対に skip しない**。op-merge は対応する `<!-- op-manual-override -->` block (trusted-author 投稿、`reviewed_head_sha` が現在の PR `headRefOid` と一致、`approver` / `reason` / `followup_issue` / `overridden_at` 全フィールド充足) と AND 条件で揃った場合のみ skip する。詳細は `skills/_shared/markers/merge-gate-markers.md (>=2)` の **has_valid_manual_override** 節を canonical 正本として参照する。 | gate skip 効果 (op-merge gate 12〜13)。 |
| `pro-security-needs-fix` | op-run / security-expert (security post-check BLOCK 時) | op-run (apply 担当 expert 再実装トリガー) / op-merge | security post-check (3.5-B) で BLOCK 判定。apply 担当 expert 再実装が必要、op-merge 対象外。 | あり (op-merge gate 14)。 |
| `pro-security-post-check-skipped` | op-run (security post-check spawn 失敗時) | op-merge / 人間 | security post-check spawn 失敗で skip 状態。security 影響 PR ではマージ不可 (再実行 or manual-override が必要)。 | あり (op-merge gate 15)。 |
| `pro-security-post-check-manual-override` | 人間 (緊急対応 hotfix 等で skip / BLOCK の例外承認) | op-merge | security post-check skip / BLOCK を人間が明示承認した PR。`<!-- op-manual-override -->` block 必須。常用厳禁。**重要**: この label は **単独では gate を絶対に skip しない**。op-merge は対応する `<!-- op-manual-override -->` block (trusted-author 投稿、`reviewed_head_sha` が現在の PR `headRefOid` と一致、`approver` / `reason` / `followup_issue` / `overridden_at` 全フィールド充足) と AND 条件で揃った場合のみ skip する。詳細は `skills/_shared/markers/merge-gate-markers.md (>=2)` の **has_valid_manual_override** 節を canonical 正本として参照する。 | gate skip 効果 (op-merge gate 15〜18)。 |

---

## 4. Human-decision Labels

| Label | Owner | Consumer | Meaning | Merge blocking effect |
|---|---|---|---|---|
| `needs:human-decision` | op-scan / op-patrol / expert agent (`needs_human_decision.required: true`) | op-run (`manual_review_bucket` 振り分け) | finding の `needs_human_decision.required: true` (構造化 block) が含まれる Issue。`needs:human-decision-followup` が同時付与でない限り apply 不可。 | あり (Issue 段階で apply ブロック / PR 段階では人間承認待ち)。 |
| `needs:human-decision-followup` | op-scan / op-patrol / expert agent | op-run (`safe_first_step` のみ apply) | `needs_human_decision.required: true` かつ `can_continue_without_decision: true` の opt-out フラグ。判断は将来必要だが `safe_first_step` だけは現 PR で進めてよい Issue。 | partial。`safe_first_step` のみ apply 可、`blocked_actions[]` は厳守。 |
| `needs:boundary-decision` | op-scan / refactor-expert (`decision_type: "boundary"`) | op-run / 人間 | scattered tokens / directory 移動などで責務境界の合意が必要な Issue。**単独では apply を止めない** (`manual_review_bucket` には `needs:human-decision` の有無で判定する)。 | なし (本 label 単体では)。 |
| `needs:spec-decision` | op-scan / spec-expert (op-spec, `decision_type: "spec"`) | op-run / 人間 | public API / serialized format / IPC contract 変更など仕様判断が必要な Issue。`finding_type=needs_spec_decision` 由来は常に apply 不可 (`manual_review_bucket`)。 | あり (Issue 段階で apply ブロック)。 |
| `needs:triage` | op-patrol (`seen_count >= 3` または `affected_paths` 増加検出時) | 人間 | architecture_debt Issue に付与される人間判断によるトリアージ待ち label。 | なし (Issue 段階の人間判断待ち)。 |
| `pro-human-verified` | 人間 (op-merge gate 2b で `needs:human-decision-followup` 付き PR の判断完了時に明示付与) | op-merge (gate 2b) | `needs:human-decision-followup` 経路の PR に対して人間が判断を完了し、merge を明示承認したことを示すラベル。`needs:human-decision` + `needs:human-decision-followup` 両ラベルが付いた PR において本ラベルが **ない** と gate 2b で block される。**常用厳禁** — `needs:human-decision-followup` 経路以外の PR への付与禁止。解除条件: PR merge 完了後、または `needs:human-decision-followup` ラベル除去後に人間が手動除去する。詳細: `skills/op-merge/SKILL.md` L690-704 (gate 2b bash 実装、Refs PR #101)。色: `#0E8A16` (承認系・緑)。 | gate 2b block 解除効果 (`needs:human-decision-followup` と AND 条件で揃った場合のみ)。 |

---

## 5. Specialist Review Labels

| Label | Owner | Consumer | Meaning | Merge blocking effect |
|---|---|---|---|---|
| `needs-specialist-review` | review-expert (`review_result: needs-specialist-review`) / op-run | op-run (specialist expert に handoff) / op-merge | review-expert global review が specialist 判断を必要と判定した PR / finding。security-expert / debug-expert / designer-expert 等の active expert が specialist として再 review する (spec-expert は op-spec 専用 Utility Worker で specialist 候補にしない)。 | あり (specialist review が `approve` になるまで merge 不可)。 |

---

## 6. Deprecated / Compatibility Labels

新規付与禁止だが、過去 PR / Issue で参照されている可能性があるため読み取り互換のため残す label。

| Label | 状態 | 置換先 / 取り扱い |
|---|---|---|
| `pro-review-expert` | deprecated | global review 状態は `pro-reviewed` / `pro-review-needs-fix` / `pro-review-fix-in-progress` / `pro-review-stale` / `pro-review-blocked` の系列で表現する。op-scan / op-patrol / op-architect / op-run はこの label を付与しない。読み取り互換のみ。 |
| `pro-ux-audit` | deprecated | `pro-ux-ui-audit-expert` に統合済み。clustering 時に正規化して読む。新規付与禁止。 |
| `pro-ui-refactor` | deprecated | `pro-ux-ui-audit-expert` / `pro-designer-expert` に分離済み。clustering 時に正規化して読む。新規付与禁止。 |
| `pro-ux-ui-audit` | deprecated | 短縮形 (suffix `-expert` 抜け)。`pro-ux-ui-audit-expert` を使用。clustering 時に正規化して読む。新規付与禁止。 |
| `pro-designer` | deprecated | 短縮形 (suffix `-expert` 抜け)。`pro-designer-expert` を使用。clustering 時に正規化して読む。新規付与禁止。 |
| `pro-debug` / `pro-feature` / `pro-refactor` | deprecated (短縮形) | 完全形式 (`pro-<expert>-expert`) を使用。新規付与禁止。 |
| `pro-pull-requester` / `pro-reviewer` | deprecated | op-run に統合済み (旧 PR 作成者・レビュー担当の routing label)。`pro-<expert>-expert` 系列で表現する。clustering 時に正規化。新規付与禁止。 |
| `critical` | deprecated | `severity:critical` を使用。読み取り互換のみ。 |
| `high` | deprecated | `severity:high` を使用。読み取り互換のみ。 |

**取り扱い原則**:
- 上記 deprecated label を新規 Issue / PR / コメントで付与しない。
- clustering / dedup 時は正規化して active label と同一視して読み取る (`clustering.md` を参照)。
- 既存 Issue / PR から削除しない (履歴破壊を防ぐ)。

---

## 7. Historical / Roadmap-only Labels

planned expert (`planned-experts.md`) の active 化を見据えて roadmap / 設計文書で **言及のみ**
されている label。現時点で op-* skill が runtime で付与することはない。agent / skill 実装後に
Active Issue Routing Labels (§2) へ昇格する想定。

| Label | 状態 | 言及箇所 / 取り扱い |
|---|---|---|
| `pro-compatibility-expert` | roadmap-only (planned) | `skills/expert-refactor/references/post-check-policy.md` / `architecture-debt.md` で planned compatibility-expert active 化後の routing label として言及。`compatibility-expert` が active 化されるまで付与禁止。それまでは `debug-expert` (compatibility bug) / `refactor-expert` (API surface cleanup) に正規化して `pro-debug-expert` / `pro-refactor-expert` を付与する (`planned-experts.md` 参照)。 |
| `pro-release-expert` | roadmap-only (planned) | 同上。`release-expert` は **fallback destination としても使用禁止** (`planned-experts.md` 参照)。本 label を付与せず、build / packaging failure → `pro-debug-expert`、release script cleanup → `pro-refactor-expert`、signing risk → `pro-security-expert`、policy → `needs:human-decision` に再分類する。 |
| `pro-spec-expert` | roadmap-only (未使用) | `spec-expert` 用の op-run routing label。spec-expert は ADR-0017 W1b で active 化したが **op-spec 専用 Utility Worker (op-run routing 対象外)** であり、op-run は spec-expert を直接 spawn しないため本 routing label は引き続き不要 (付与禁止)。acceptance criteria が明確な実装は `pro-feature-expert`、仕様 ambiguity は `needs:human-decision` (`needs:spec-decision` でも可) に倒す。仕様の方向照合そのものは op-spec で扱う。 |

将来 roadmap 上で予告される label が増えた場合は本節に追記する (例: `op-doctor` 系の env-expert 連動 label
が agent 実装後に Historical → Active Issue Routing へ昇格する想定)。

---

## Label Canonical Table

<!--
機能概要: リポジトリに存在する全 OP 関連 GitHub label の name / color / description /
         creating_skills / used_by_gates を 1 表に集約した正本。
作成意図: 各 SKILL.md が NEEDED_LABELS 配列を bash fence にハードコードしていた silent fork を
         解消するための safe_first_step (Issue #396)。Stage 1 = 本表追加 / Stage 2 = SKILL.md pointer 化。
注意点: 本表の color 値は `gh label list --json name,color,description` 実態に合わせる (実態を変えない原則)。
         既存 label の name / color / description を本表で変更しない。差分があれば別 Issue で修正する。
         GitHub デフォルト label (bug / documentation / duplicate 等) は OP skill 管理外のため本表に含めない。
-->

本表は **OP skill 管理 label の唯一の定義表**。各 SKILL.md の `NEEDED_LABELS` 配列や
`gh label create` 呼び出しは、本表の `name` / `color` / `description` 列を参照することを推奨する
(Stage 2 pointer 化後は SKILL.md インライン定義を本表参照に置換する)。

**更新ルール**: label を新規追加する場合は本表 → `## marker / label を新規追加する場合の手順` の順で追加する。
**不変則**: 本表の `name` / `color` / `description` 値と `gh label list` 出力の差分は「本表を実態に合わせる」
(OP skill 側が実態を変えるのではなく、canonical 記録として現行実態を正確に反映する)。

### 凡例

| 列 | 説明 |
|---|---|
| `name` | GitHub label 名 (完全一致) |
| `color` | 6桁 hex (`gh label list` の実態値を使用) |
| `description` | label の説明文 |
| `creating_skills` | 本 label を runtime で付与する OP skill |
| `used_by_gates` | op-merge / op-run 等がどの gate / 判定で本 label を参照するか |

### 1. Active PR Review State Labels (Canonical)

| name | color | description | creating_skills | used_by_gates |
|------|-------|-------------|-----------------|---------------|
| `pro-reviewed` | `0E8A16` | review-expert が approve した PR | op-run (review通過後) | op-merge: PR filter (フェーズ1-1) / gate 3a-3c / gate 5 (required) |
| `pro-review-needs-fix` | `FF8800` | op-run: review-expert が same-pr 修正を要求している (Review Fix Loop 候補) | op-run (review_result=needs-fix) | op-merge: merge 不可 (Review Fix Loop 継続) |
| `pro-review-fix-in-progress` | `1D76DB` | op-run: Review Fix Loop の apply 中 (中間状態) | op-run (specialist 再委任時) | op-merge: merge 不可 |
| `pro-review-stale` | `FBCA04` | op-run: 新しい commit が積まれて既存 review が stale (再 review 待ち) | op-run (head sha 進行検出時) | op-merge: merge 不可 (再 review 必須) |
| `pro-review-blocked` | `D93F0B` | op-run: 自動修正不能 (Issue 再設計 / 人間判断 / loop 上限超過) | op-run (review_result=blocked) | op-merge: 人間判断待ち / merge 不可 |

### 2. Active Issue Routing Labels (Canonical)

| name | color | description | creating_skills | used_by_gates |
|------|-------|-------------|-----------------|---------------|
| `auto-report` | `0E8A16` | op-* skill が起票した自動 Issue | op-scan, op-patrol, op-plan, op-architect | op-run: clustering 候補識別 |
| `auto-fix` | `5319E7` | op-run が起票した自動 PR | op-run (PR作成時) | op-merge, op-patrol |
| `op-architect` | `5319E7` | created by op-architect | op-architect | op-run: 初期マイルストーン routing |
| `op-patrol` | `0e8a16` | op-patrol 系 | op-patrol | op-run / 人間 |
| `op-spec-patrol` | `0e8a16` | op-spec-patrol 系 (Spec Patrol Ledger Issue 識別、ADR-0017 W3) | op-spec-patrol | op-spec-patrol / 人間: Spec Patrol Ledger 自動検索 |
| `op-state` | `b60205` | op runtime state (Issue/Ledger) | op-patrol, op-run, op-spec-patrol | op-patrol / op-run / op-spec-patrol: 永続 Issue 識別 |
| `do-not-close` | `b60205` | このIssueは閉じない | op-patrol, op-run | op-merge: close 禁止 (Patrol Ledger 等) |
| `patrol` | `0e8a16` | op-patrol 起票 | op-patrol | 人間 / op-run (追加識別) |
| `batch` | `C5DEF5` | バッチ Issue (5 件以上同 bulk_group を 1 Issue 化) | op-scan, op-patrol | op-run / 人間 |
| `derived-from-issue` | `0e8a16` | op-scan --from-issue により派生起票された Issue | op-scan (`--from-issue`) | op-merge / 人間 |
| `derived-from-pr` | `0e8a16` | op-scan --from-merged-pr により merged PR の残存リスクから派生起票された Issue | op-scan (`--from-merged-pr`) | op-merge / 人間 |
| `superseded-by-scan` | `d4c5f9` | op-scan --from-issue により派生 Issue に置き換えられた | op-scan (`--from-issue`) | op-merge / 人間 |
| `requires-normalization` | `FBCA04` | op-run --auto モードで partial 判定され、人間レビューが必要な Issue | op-run (`--auto` partial) | 人間 |
| `milestone:initial` | `FBCA04` | initial milestone (op-architect) | op-architect | op-run / 人間 |
| `pro-debug-expert` | `0E8A16` | apply 担当: debug-expert | op-scan, op-patrol, op-architect, op-run | op-run: apply 担当解決 |
| `pro-refactor-expert` | `0E8A16` | apply 担当: refactor-expert | op-scan, op-patrol, op-architect, op-run | op-run: apply 担当解決 |
| `pro-feature-expert` | `1D76DB` | feature-expert 担当 (op-run routing) | op-scan, op-patrol, op-architect, op-run | op-run: apply 担当解決 |
| `pro-optimize-expert` | `0E8A16` | apply 担当: optimize-expert | op-scan, op-patrol, op-run | op-run: apply 担当解決 |
| `pro-test-expert` | `fbca04` | test-expert apply 担当 | op-scan, op-patrol, op-run | op-run: apply 担当解決 |
| `pro-designer-expert` | `5319E7` | designer-expert (Design Plan / 実装) 担当 Issue / PR | op-architect, op-scan, op-patrol, op-run | op-run: apply 担当解決 |
| `pro-ux-ui-audit-expert` | `5319E7` | ux-ui-audit-expert (検出 / Design Plan gate / apply 後 post-check) 担当 Issue / PR | op-architect, op-scan, op-patrol, op-run | op-run: post-check spawn / op-merge |
| `pro-security-expert` | `d93f0b` | security-expert apply 担当 | op-scan, op-patrol, op-run | op-run: apply 兼 post-check / op-merge |
| `pro-env-expert` | `5319E7` | env-expert (planned) 担当 routing label | op-scan, op-patrol, op-architect, op-run | op-run: active fallback / planned skip 判定 |
| `op:architecture-debt` | `5319e7` | architecture debt finding | refactor-expert, op-scan | op-patrol (fingerprint追跡) / op-run |
| `op:staged-refactor` | `5319e7` | staged refactor finding | refactor-expert, op-scan | op-run (1 PR 1 stage 制御) |
| `op:blocking-finding` | `B60205` | 新規変更が既存 architecture_debt を悪化させた refactor-expert blocking finding | refactor-expert (blocking=true) | op-run, op-merge: gate 21 (merge-blocking) |
| `op:in-progress` | `5319E7` | op-run instance が claim 中 (claim-markers.md schema) | op-run (`op claim acquire`) | op-run: Issue 取得クエリ除外 / `op claim sweep` |
| `op:foundation-precondition` | `C5DEF5` | foundation token/base component 不在で feature が build 待ち (tracking marker、merge 非blocking、ADR-0012) | designer-expert, op-architect, op-plan | op-run (後続 wave スケジューリング) / 人間 (planning ordering) |
| `severity:critical` | `B60205` | op-scan/op-patrol が起票する Critical severity | op-scan, op-patrol | op-run / op-merge: severity 判定 |
| `severity:high` | `D93F0B` | op-scan/op-patrol が起票する High severity | op-scan, op-patrol | op-run / op-merge: severity 判定 |
| `severity:medium` | `fbca04` | 中程度の問題 (op-scan / op-patrol 共通) | op-scan, op-patrol | op-run |
| `severity:low` | `c5def5` | 軽微な問題 (op-scan --from-merged-pr 等で起票) | op-scan, op-patrol | op-run |
| `severity:n/a` | `C5DEF5` | severity 概念に当てはまらない Issue (op-scan --from-issue 由来 feature 追加要望等) | op-scan | op-run |
| `module:op-run` | `BFD4F2` | module: op-run skill | op-scan, op-patrol, op-architect | op-run (clustering hint) |
| `module:op-tools` | `C5DEF5` | module: op-tools | op-scan, op-patrol, op-architect | op-run (clustering hint) |
| `module:shared` | `D4C5F9` | module: _shared / experts | op-scan, op-patrol, op-architect | op-run (clustering hint) |
| `module:op-merge` | `ededed` | module: op-merge skill | op-scan, op-patrol, op-architect | op-run (clustering hint) |
| `module:op-sweep` | `ededed` | module: op-sweep skill | op-scan, op-patrol, op-architect | op-run (clustering hint) |
| `module:_shared` | `ededed` | module: skills/_shared | op-scan, op-patrol, op-architect | op-run (clustering hint) |
| `area:_shared` | `1d76db` | skills/_shared contract layer | op-patrol | op-patrol (Patrol Ledger 区画整合) / op-run (clustering hint) |
| `area:op` | `1d76db` | op-tools/crates/op | op-patrol | op-patrol / op-run |
| `area:op-core` | `1d76db` | op-tools/crates/op-core | op-patrol | op-patrol / op-run |
| `area:op-run` | `BFD4F2` | op-patrol/op-scan area label for skills/op-run | op-patrol | op-patrol / op-run |
| `area:op-scan` | `BFD4F2` | op-patrol/op-scan area label for skills/op-scan | op-patrol | op-patrol / op-run |
| `area:op-architect` | `BFD4F2` | op-patrol/op-scan area label for skills/op-architect | op-patrol | op-patrol / op-run |

### 3. Active Post-check Labels (Canonical)

| name | color | description | creating_skills | used_by_gates |
|------|-------|-------------|-----------------|---------------|
| `pro-ux-ui-audit-needs-fix` | `fbca04` | ux-ui-audit-expert post-check BLOCK | op-run (UX/UI post-check BLOCK時) | op-merge: gate 11 (merge-blocking) |
| `pro-ux-ui-audit-skipped` | `ededed` | ux-ui-audit-expert post-check spawn failed / skipped | op-run (spawn失敗時) | op-merge: gate 12 (merge-blocking) |
| `pro-ux-ui-audit-manual-override` | `B60205` | UX/UI post-check skip / BLOCK を人間が明示承認した PR (常用厳禁) | 人間 (緊急対応時のみ) | op-merge: gate 12-13 (skip効果、block必須) |
| `pro-security-needs-fix` | `fbca04` | security-expert post-check BLOCK/NEEDS_HUMAN_DECISION | op-run / security-expert (BLOCK時) | op-merge: gate 14 (merge-blocking) |
| `pro-security-post-check-skipped` | `ededed` | security post-check spawn failed / skipped | op-run (spawn失敗時) | op-merge: gate 15 (merge-blocking) |
| `pro-security-post-check-manual-override` | `B60205` | security post-check skip / BLOCK を人間が明示承認した PR (常用厳禁) | 人間 (緊急対応時のみ) | op-merge: gate 15-18 (skip効果、block必須) |

### 4. Human-decision Labels (Canonical)

| name | color | description | creating_skills | used_by_gates |
|------|-------|-------------|-----------------|---------------|
| `needs:human-decision` | `FBCA04` | finding の needs_human_decision.required: true が含まれる Issue | op-scan, op-patrol, expert agent | op-run: manual_review_bucket / op-merge: apply block |
| `needs:human-decision-followup` | `fef2c0` | human decision (follow-up) | op-scan, op-patrol, expert agent | op-run: safe_first_step のみ apply 可 |
| `needs:boundary-decision` | `FBCA04` | scattered tokens / directory 移動などで責務境界の合意が必要な Issue | op-scan, refactor-expert | op-run / 人間 |
| `needs:spec-decision` | `FBCA04` | public API / serialized format / IPC contract 変更など仕様判断が必要な Issue | op-scan, spec-expert (op-spec) | op-run: apply block |
| `needs:triage` | `FBCA04` | architecture_debt Issue に付与される人間トリアージ待ち label | op-patrol (seen_count>=3) | 人間 |
| `needs-clarification` | `FBCA04` | op-run フェーズ1.5 insufficient 判定で人間に投げ返した Issue | op-run (フェーズ1.5) | 人間 |
| `pro-human-verified` | `0E8A16` | op-merge gate 2b: needs:human-decision-followup の明示承認ラベル (人間判断完了) | 人間 (gate 2b) | op-merge: gate 2b (block 解除、AND条件) |
| `needs-specialist-review` | `FBCA04` | review-expert global review が specialist 判断を必要と判定した PR / finding | review-expert, op-run | op-merge: merge 不可 (specialist review 待ち) |

### 5. Roadmap-only Labels (Canonical)

| name | color | description | status | 昇格条件 |
|------|-------|-------------|--------|---------|
| `pro-compatibility-expert` | (未作成) | compatibility-expert 担当 routing label | roadmap-only | compatibility-expert active 化後 |
| `pro-release-expert` | (未作成) | release-expert 担当 routing label | roadmap-only (付与禁止) | release-expert は fallback 禁止 |
| `pro-spec-expert` | (未作成) | spec-expert 担当 op-run routing label | roadmap-only (付与禁止) | spec-expert は active 化済だが op-spec 専用 Utility Worker (op-run 非 routing) のため不要 |

### op-architect 初期化で必要な NEEDED_LABELS (op-architect creating_skills)

op-architect が初期構築時に `gh label create` で作成すべき label の最小セット。本表の `creating_skills` に
`op-architect` が含まれる label のうち、**起票・routing に最低限必要なもの**:

```
auto-report, op-architect, pro-feature-expert, pro-designer-expert, pro-ux-ui-audit-expert, milestone:initial
```

> 注意: op-run / op-scan / op-patrol が追加する label (severity:* / area:* / module:* 等) は
> 各 skill が都度 `op issue ensure-labels` または `gh label create --force` で追加する。
> op-architect は初期 repo セットアップ用の最小セットのみ作成する。

---

## marker / label を新規追加する場合の手順

1. 本ファイルに marker / label entry を追加する (name / owner / consumer / meaning / not meaning /
   runtime spawn effect / merge blocking effect の最低限)。
2. 必要なら領域別 `*-markers.md` (review / post-check / security / ux-ui / merge-gate) に詳細 field
   schema / enum / validation rule を追加する。新領域なら新しい `<domain>-markers.md` を新設する。
3. 必要なら `pr-templates.md` に PR body / コメントの bash gh HEREDOC テンプレ / human-readable example を追加する。
4. 変更先ファイルの schema_version を bump する (本ファイル / 領域別 markers / pr-templates.md のうち
   実際に破壊的変更が入ったもの)。
5. 関連する SKILL.md / agent.md の参照ドキュメント節で `(>=N)` 表記を確認する。
6. clustering / dedup-policy / auto-policy / severity-rubric への影響を確認する。
7. 既存 deprecated label と意味が衝突しないか確認する (Single Canonical Source Rule)。

---

## 検証用 grep (新規変更時の self-check)

```bash
# 全 active marker が本ファイルに登録されているか
grep -R "<!-- op-" -n skills/op-* skills/_shared agents \
  | perl -ne 'print "$1\n" if /<!--\s*(op-[a-zA-Z0-9_-]+)/' \
  | sort -u

# 全 active label を再確認
grep -RhoE '\bpro-[a-zA-Z][a-zA-Z0-9_-]+|\bneeds:[a-zA-Z0-9_-]+' \
  skills/op-* skills/_shared agents | sort -u

# planned expert を runtime spawn / fallback に書いていないか
grep -nE 'subagent_type:.*(env|release|compatibility|spec)-expert' \
  skills/_shared/markers/labels-and-markers.md
grep -nE 'Agent\(\{.*(env|release|compatibility|spec)-expert' \
  skills/_shared/markers/labels-and-markers.md
```

---

## Lint Regression Examples

`op-tools/crates/op-core/tests/prose_examples.rs` が parse + lint clean を assert する canonical。
Rust struct schema 変更時に同期する (silent fork 防止、ADR-0003)。
inline 系はテンプレート (`<value>` 等) ではなく具体値で書く必要がある (extract_inline_values の仕様)。

### inline 系

<!-- op-domain: security -->
<!-- op-source: op-scan -->
<!-- op-fingerprint: security:sql-injection-in-query:api/query.py:run_query -->
<!-- op-mode: op_managed -->
<!-- op-derived-from: #42 -->
<!-- op-reclassified-from: env-expert -->
<!-- op-run-expert: debug-expert -->
<!-- op-post-check-expert: security-expert -->
<!-- op-scan-expert: security-expert -->
<!-- op-architect-expert: feature-expert -->
<!-- op-area: crates/op-core/src/markers -->
<!-- op-finding-type: architecture_debt -->
<!-- op-refactor-debt-key: refactor:scattered-tokens:src/api:format_currency -->
<!-- op-run: op-run -->
<!-- op-run-id: run-2026-05-09-001 -->
<!-- op-design-plan-by: designer-expert -->
<!-- op-planned-post-check-skipped: env-expert -->

### claim 系 (block-yaml)

<!-- op-claim:
  task_id: fix-auth-20260516-143052-c1
  acquired_at: 2026-05-16T14:30:52+09:00
  ttl_seconds: 14400
  schema_version: 1
-->

<!-- op-cluster-manifest:
  run_id: dbf4665bb7f1-20260516-143052
  cluster_id: c1
  cluster_issues: [42, 43, 44]
  acquired_at: 2026-05-16T14:30:52+09:00
  schema_version: 1
-->

### block-yaml 系 (run controller / fallback)

<!-- op-run-controller-meta -->
base_ref: main
base_sha: 1234567890abcdef1234567890abcdef12345678

<!-- op-fallback-applied -->
source_expert: env-expert
normalized_to: debug-expert
source_context: issue-routing
source_id: "null"
reason: env-expert is planned; fallback to debug-expert
applied_at: 2026-05-09T10:00:00Z
controller: op-run
