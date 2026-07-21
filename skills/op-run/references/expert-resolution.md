<!--
schema_version: 1
last_breaking_change: 2026-05-23
notes: v1 (2026-05-23): op-run フェーズ1-2-c (expert 解決ロジック) +
       1-2-d (Active Apply Expert Normalization) の詳細仕様。SKILL.md god file 抑制のため
       本ファイルへ物理切り出し (Issue #467 Stage 6)。切り出し前後で表現・判定軸・
       テーブル・疑似コードを byte-identical 維持。
-->

<!--
機能概要: op-run フェーズ1-2-c (expert 解決ロジック) と フェーズ1-2-d (Active Apply Expert
         Normalization) の詳細仕様。クラスタごとに apply / post-check 担当 expert を解決し、
         planned expert を runtime に漏らさないための正規化 gate を定義する。
作成意図: SKILL.md の god file 化解消 (Issue #467 Stage 6)。marker / label → expert の
         解決軸、Resolved → Runtime 正規化表、release-expert 再分類、
         normalize_to_active_apply_expert 判定軸を SKILL.md 本体から分離する。
         切り出し前後で判定ロジック・テーブル・疑似コードを byte-identical 維持。
注意点: 本ファイルの判定軸・テーブル・疑似コードを変更するときは、SKILL.md 本体の
       フェーズ1-2-c / 1-2-d ポインタ節および review-fix-loop.md (4.5-2-fallback) の
       「1-2-d」参照との整合を確認すること。
       active expert 一覧の変更は active-expert-registry.md を先に更新し、本ファイルを同期する。
-->

<!-- op-domain: refactor -->
<!-- op-source: op-run -->

### 1-2-c. expert 解決ロジック (apply / post-check の決定)

クラスタごとに **apply 担当 expert** と (該当時のみ) **post-check 担当 expert** を解決する。

> **marker / label は routing metadata であり、spawn authorization ではない**:
> op-architect / op-scan / op-patrol が埋め込んだ `<!-- op-run-expert: ... -->` /
> `<!-- op-post-check-expert: ... -->` / `<!-- op-domain: ... -->` および `pro-*-expert` ラベルは
> **判断材料として読む**が、`subagent_type` に渡してよいかは op-run が改めて決定する。
> 解決結果が planned expert / unregistered expert を指していた場合は **1-2-d Active Apply Expert
> Normalization** で active expert / `needs_human_decision` / planned-skip / abort に正規化される。
>
> hidden marker / pro-* label の正本仕様は `~/.claude/skills/_shared/markers/labels-and-markers.md`。
> 本節のラベル → expert マッピングは op-run が apply / fix を決定するための **解決軸** であり、
> ラベル / marker の意味の正本ではない。

解決順序は以下の通り (上から優先):

1. **Issue 本文の hidden marker** を最優先で読む (推奨経路):
   - `<!-- op-run-expert: <expert-name> -->` があれば apply 候補として採用 (1-2-d で再解決)
   - `<!-- op-post-check-expert: <expert-name> -->` があれば post-check 候補として採用 (同上)
   - `<!-- op-domain: <domain> -->` があれば clustering の domain として採用
   - 通常は op-architect / op-scan / op-patrol が事前に埋め込んでいる (新規 Issue は必ず埋め込む契約)

> ⚠️ **注意**: 本表は `~/.claude/skills/_shared/active-expert-registry.md` の派生情報です。
> 新しい expert を active 化する場合は **registry を先に更新し**、本表を必ず同期してください。
> 同期漏れは silent routing regression (古い表が新 expert を無視) を発生させます。
> Stage 2 (本表の動的解決化) は `op run expert-resolve` primitive 完成後に実施します。

2. **ラベルベース解決** (marker が無い古い Issue / 人間立て Issue 用 fallback):

   | ラベルの組み合わせ | apply 担当 | post-check 担当 |
   |-----------------|-----------|----------------|
   | `pro-ux-ui-audit-expert` のみ | **`designer-expert`** (ux-ui-audit-expert は実装しない) | `ux-ui-audit-expert` |
   | `pro-designer-expert` のみ | `designer-expert` | UI ファイルを触るなら `ux-ui-audit-expert` |
   | `pro-designer-expert` + `pro-ux-ui-audit-expert` | `designer-expert` | `ux-ui-audit-expert` |
   | `pro-feature-expert` | `feature-expert` | UI ファイルを触るなら `ux-ui-audit-expert` |
   | `pro-debug-expert` | `debug-expert` | null (フェーズ4 の global review (review-expert) は別途必ず実施) |
   | `pro-refactor-expert` | `refactor-expert` | `null` / `ux-ui-audit-expert` / `security-expert` の 3 値のみ。両方必要なら Issue 分割。それ以外の検証 follow-up は gotchas / global review (フェーズ4) に逃がす |
   | `pro-optimize-expert` | `optimize-expert` | — |
   | `pro-security-expert` | **`security-expert`** または `debug-expert` (Issue 内容に応じて) | **`security-expert`** (post-check で深掘り再監査必須) |
   | `pro-test-expert` | `test-expert` | — |
   | `pro-env-expert` | **planned** (Issue 上は `env-expert` として解決される)。直接 spawn せず、後段の **1-2-d. Active Apply Expert Normalization** で `debug-expert` / `refactor-expert` / `needs_human_decision` に正規化する | **planned** (post-check は spawn せず planned skip。詳細は 3.5-D 節) |

   > **`pro-env-expert` の取り扱い**:
   > `pro-env-expert` は env domain の routing label であり、`env-expert` を runtime で
   > 直接 spawn してよいことを意味しない。`env-expert` は planned expert のため、
   > marker / label / domain 推定のいずれから解決された場合でも、Task spawn 前に必ず
   > **1-2-d. Active Apply Expert Normalization** を通して active expert に置換する。

   > **重要**: `pro-ux-ui-audit-expert` ラベルだけが付いた Issue を `apply 担当 = ux-ui-audit-expert`
   > と解決してはいけない。ux-ui-audit-expert は実装を持たない警備員 agent。**ラベルは「post-check
   > を担当する」意味で付与されているだけ**で、apply 担当は必ず `designer-expert` に解決する。

   #### 二重ラベル時の明示解決 (refactor + security / refactor + ux-ui)

   marker が無く、refactor が他ラベルと組み合わさっている場合、`_shared/clustering.md` の priority
   表 (`security > debug > refactor > ...`) を素直に適用すると誤ルーティングするため、以下を **個別に固定** する。

   | ラベルの組み合わせ | category | apply 担当 | post-check 担当 |
   |-----------------|---------|-----------|----------------|
   | `pro-refactor-expert` + `pro-security-expert` | refactor | `refactor-expert` | `security-expert` |
   | `pro-refactor-expert` + `pro-ux-ui-audit-expert` | refactor | `refactor-expert` | `ux-ui-audit-expert` |

   理由: これらの組合せでは、second label は apply ではなく **post-check 専任**として付与されている。
   priority 表を機械的に適用すると security / ux-ui に流れて apply 担当が取り違えられる。
   marker が付いている Issue では (1) が優先されるため本固定は marker 欠落 Issue に対する fallback として効く。

3. **ドメイン推定** (marker / ラベルどちらも無い場合):
   - 本文の hidden marker `<!-- op-domain: ux-ui -->` → apply: `designer-expert`、post-check: `ux-ui-audit-expert`
   - clustering で category = ux-ui → apply: `designer-expert`、post-check: `ux-ui-audit-expert`
   - その他は clustering.md の category → expert マッピングに従う

**post-check が解決された場合は必ずフェーズ3.5 を実行する。** apply の expert が
designer-expert / feature-expert で、かつ frontend / UI ファイルを触る場合は、
marker / ラベルが無くても **ux-ui-audit-expert を post-check に付与する** (silent な UX 退化を防ぐ)。

### 1-2-d. Active Apply Expert Normalization (planned expert を runtime に漏らさない)

/**
 * 機能概要: 1-2-c の expert 解決結果 (cluster.expert) を、Task spawn 前に必ず
 *           active expert へ正規化する。planned expert を直接 spawn しないための gate。
 * 作成意図: marker / label / domain 推定経由で解決された expert に planned expert
 *           (env-expert / release-expert / compatibility-expert 等) や op-run routing 対象外の
 *           Utility Worker (spec-expert / scout) が入った場合に、Task の `subagent_type` に
 *           そのまま渡すと spawn 失敗 / 契約違反になる。
 *           routing metadata (Issue 上の表記) と runtime spawn 許可を構造的に分離する。
 * 注意点: planned expert を fallback destination にしてはいけない。
 *         release-expert は env-expert の fallback 先にしない (release / installer /
 *         updater / distribution 方針判断は `needs_human_decision` に倒す)。
 */

> **Runtime expert resolution contract (op-run の最終解決責任)**:
>
> Runtime expert resolution MUST return one of:
>
> - an active expert listed in `~/.claude/skills/_shared/active-expert-registry.md`,
> - the internal enum `needs_human_decision` (snake_case sentinel; the GitHub label
>   counterpart is `needs:human-decision` and is applied separately at the label boundary),
> - a documented planned-skip marker (例: 3.5-D の `<!-- op-planned-post-check-skipped: env-expert -->`),
> - or abort.
>
> It MUST NOT return a planned expert (env-expert / release-expert / compatibility-expert)
> as a spawn target.
> It MUST NOT return an op-run-routing-excluded Utility Worker (spec-expert / scout) as a spawn target
> (spec-expert normalizes to feature-expert; see the 1-2-d normalization table below).
> It MUST NOT return an unregistered expert as a spawn target.
>
> Marker / label は判断材料として参考にしてよいが、spawn authorization の根拠としては
> `active-expert-registry.md` の登録のみを採用する (Issue / PR marker は routing metadata only)。
> op-scan / op-patrol が埋め込んだ marker / label を **そのまま信用せず**、op-run が本ステップで
> 必ず再解決する。

OP runtime は **planned expert を直接 spawn してはならない**。フェーズ1-2-c で解決された
`cluster.expert` をフェーズ2-A / 2-C の Task spawn (`subagent_type`) に渡す **前に**、
本ステップで必ず active expert へ正規化する。

#### 内部 enum と GitHub label の対応 (変換境界)

本 SKILL では「runtime 内部処理で使う sentinel / pseudo-code / dispatch / 関数戻り値」と
「GitHub Issue / PR に付ける label 名」を **別の表記** として分けて扱う。

```
Internal enum (snake_case, sentinel / return value / dispatch key)
  needs_human_decision

GitHub label (colon, applied via `gh pr edit --add-label` / `--remove-label`)
  needs:human-decision
  needs:human-decision-followup
  needs:spec-decision
  needs:boundary-decision
  needs:triage
```

変換は **label を付ける / 外す境界** でのみ行う。具体的には:

- 内部 enum `needs_human_decision` を返した結果を PR に反映するときは
  `apply_security_post_check_labels $PR needs_human_decision` のような helper 経由で
  `needs:human-decision` ラベルを付ける (helper 内部の case 文がここで colon 形式に変換する)
- 逆方向 (label を読み取って内部状態を作る) のときは `gh issue list --label "needs:human-decision"`
  で colon 形式を query し、bucket 判定用の boolean に落としたあとは内部では `needs_human_decision`
  enum / `manual_review_bucket` flag として扱う

**どちらに該当するかの判別**:

- bash 変数比較・代入・case 文・`subagent_type` 戻り値・pseudo-code 内の dispatch key で
  使う場合 → **内部 enum (snake_case)** `needs_human_decision`
- `gh pr edit --add-label` / `--remove-label` の引数・label 一覧 markdown table・label query
  jq filter で使う場合 → **GitHub label (colon)** `needs:human-decision`

#### 対象 expert の判定

正規化対象 (planned expert) と正規化後の active expert の定義は、いずれも本 SKILL に
正本を持たない。正本は以下を参照する:

- planned expert 一覧と取り扱い方針: `~/.claude/skills/_shared/planned-experts.md`
- active expert 一覧 (canonical runtime registry):
  `~/.claude/skills/_shared/active-expert-registry.md`

> agent 名から `skills/expert-<agent-name>/` のような skill path を機械生成してはならない
> (対応関係は不規則。例: `designer-expert` → `expert-design`、
> `ux-ui-audit-expert` → `expert-ux-ui-audit`)。
> registry と agent frontmatter が矛盾した場合は contract error として停止する (op-run は自動補正しない)。
> registry を canonical として扱い、人間が registry / frontmatter のどちらを直すか判断する。

#### planned expert ごとの判定軸 (op-run 固有の解決ロジック)

planned expert lifecycle / 取り扱い方針の正本は `~/.claude/skills/_shared/planned-experts.md`。
本節は op-run が apply / fix runtime spawn を解決するときに適用する **判定軸の早見** であり、
正本ではない。`planned-experts.md` と矛盾した場合は正本側を優先する。

- `env-expert`:
  - OSV / dependency vulnerability / supply-chain risk / secret leak / credential exposure /
    permission risk → `security-expert` (`planned-experts.md` の env substitute 一覧に列挙された
    security 領域。dependency 由来でも実体が脆弱性 / 供給網リスク / 機密漏洩のときは
    debug-expert ではなく security-expert に倒す)
  - dependency / package / toolchain / build environment / local setup failure → `debug-expert`
  - config 構造整理 / 重複 setup logic / 保守性悪化の解消 → `refactor-expert`
  - release / installer / updater / distribution 方針判断 → `needs_human_decision`
- `release-expert`: **fallback destination 禁止**。`needs_human_decision` に倒す。build / packaging /
  artifact / config 構造が主題の場合は「release-expert の fallback」ではなく **誤分類の再分類** として
  `debug-expert` / `refactor-expert` に付け直す (下記「誤分類の再分類」節参照)
- `compatibility-expert`: 互換性 / 退行検証が主題 → `debug-expert`、API surface / module 構造の整理が
  主題 → `refactor-expert`、互換ポリシー判断が主題 → `needs_human_decision`
- `spec-expert`: 仕様確定済みの実装が主目的 → `feature-expert`、仕様 ambiguity が主題 →
  `needs_human_decision` / `blocked`

active fallback 先が決定できない / Issue 主題が方針判断主体の場合は `needs_human_decision` とし、
Task spawn を行わない。司令官は当該 Issue / PR にコメントを残し、人間レビューに回す。

##### release-expert と誤分類された finding の再分類

review-expert / specialist が `recommended_fix_expert: release-expert` を返した finding のうち、
主題が **release 方針判断ではなく** build / packaging failure や artifact / release script / config
構造問題である場合は、`release-expert` の fallback としてではなく **そもそもの分類が誤っている** ものとして
spawn 前に domain を再分類する。

| 主題 | 再分類先 |
|------|---------|
| build / packaging failure | `debug-expert` |
| artifact / release script / config 構造整理 | `refactor-expert` |
| release / installer / updater / distribution / signing / versioning policy / release strategy | `needs_human_decision` |
| 判断不能 | `needs_human_decision` |

「fallback」と「再分類」は別物として扱う:

- **fallback (禁止)**: `release-expert` を起点に `debug-expert` / `refactor-expert` に倒す
- **再分類 (許可)**: `release-expert` と誤分類された finding を、実体に基づいて
  `debug-expert` / `refactor-expert` domain に **付け直す** (release-expert は経路上に存在しない)

再分類した場合は canonical schema の optional field に記録する (詳細は `expert-spawn.md` の schema 節)。

```yaml
recommended_fix_expert: debug-expert       # 再分類後の active expert
reclassified_from: release-expert          # 元の (誤分類された) 提案
reclassified_to: debug-expert              # 再分類後 (= recommended_fix_expert と一致)
reclassification_reason: "build / packaging failure のため release 方針判断ではなく debug domain と判定"
```

review / PR metadata にも `reclassified_from: release-expert` を残し、後追い可能にする。

#### Resolved → Runtime 正規化表 (op-run 固有の判定軸)

| Resolved expert | Runtime apply expert | Condition |
|---|---|---|
| `security-expert` | `security-expert` | active expert のためそのまま spawn (Phase 2 以降) |
| `env-expert` | `security-expert` | OSV / dependency vulnerability / supply-chain risk / secret leak / credential exposure / permission risk (`planned-experts.md` の env substitute 一覧と整合) |
| `env-expert` | `debug-expert` | dependency / package / toolchain / build / local environment failure (脆弱性 / 機密漏洩を含まない) |
| `env-expert` | `refactor-expert` | config 構造 / setup 重複 / 保守性 issue |
| `env-expert` | `needs_human_decision` | release / installer / updater / distribution 方針判断 |
| `release-expert` | `needs_human_decision` | planned expert のため runtime spawn しない / fallback destination 禁止。build / packaging / artifact / config 構造が主題なら release-expert の fallback ではなく `debug-expert` / `refactor-expert` に **再分類** する (上記「release-expert と誤分類された finding の再分類」節参照) |
| `compatibility-expert` | `debug-expert` | planned のため active fallback |
| `spec-expert` | `feature-expert` | Utility Worker (op-spec 専用、op-run routing 対象外) のため op-run では active fallback。仕様 ambiguity が主題なら `needs_human_decision` |
| unknown / missing expert | `needs_human_decision` | active fallback 先が不明 |

#### 疑似コード

```pseudo
# 1-2-c で解決済み
resolved_expert = resolve_from_marker_or_label_or_domain(issue)

# planned expert を active expert に正規化
# 内部 enum return は snake_case (needs_human_decision)。
# label への変換は post-check helper / controller の label 境界で colon 形式に切り替える。
active_apply_expert = normalize_to_active_apply_expert(
  expert = resolved_expert,
  domain = issue.domain,
  issue_body = issue.body,
  labels = issue.labels
)

# normalize_to_active_apply_expert の判定優先 (env-expert resolved の場合):
#   1. issue_body / labels に security signal を含むか?
#        keywords: "OSV", "dependency vulnerability", "supply-chain", "secret leak",
#                  "credential exposure", "permission risk", "vulnerab", "CVE-",
#                  "GHSA-", "advisory"
#        labels  : pro-security-expert / op-domain: security marker
#        → return "security-expert" (active, Phase 2 以降そのまま spawn)
#   2. config 構造整理 / 重複 setup logic / 保守性悪化 → return "refactor-expert"
#   3. release / installer / updater / distribution / signing / versioning policy 判断
#        → return "needs_human_decision" (内部 enum)
#   4. それ以外の dependency / toolchain / build / local environment failure
#        → return "debug-expert"
# release-expert / compatibility-expert / spec-expert は本表 (1-2-d) に従う。

if active_apply_expert == "needs_human_decision":
  # Task spawn しない (planned expert を fallback で潰せないケース)
  # ここでは内部 enum (snake_case) で比較する。PR / Issue 側に label を付ける場合は
  # apply_*_post_check_labels helper 経由で `needs:human-decision` (colon) を付与する。
  leave_comment_on_issue(
    "This issue requires human decision before op-run can apply changes. "
    "Resolved expert was planned (env-expert / release-expert 等) and no "
    "active fallback is appropriate (release / installer / updater / "
    "distribution policy decision)."
  )
  mark_cluster_as_human_review_required()
  skip_spawn()
  return

# active fallback 適用後の expert のみ Task spawn に使用する。
# Agent tool の subagent_type には plugin scoped 名 (op-skill:<name>) を渡す。
# active_apply_expert は bare のまま比較・override・表示に使い、前置は spawn 境界でのみ適用する
# (expert-spawn.md「Plugin scoped-name 規約」)。
spawn_task(subagent_type = "op-skill:" + active_apply_expert)
```

#### 適用タイミング

本正規化は以下の **すべての spawn 経路** に適用する。

- フェーズ2-A 探知フェーズ (`subagent_type: cluster.expert` を呼ぶ前)
- フェーズ2-C 修正フェーズ (`subagent_type: cluster.expert` を呼ぶ前)
- フェーズ4.5 Review Fix Loop (`recommended_fix_expert` を `subagent_type` に渡す前)

司令官は **正規化後の expert** (`active_apply_expert`) を `cluster.expert` に上書きしてから
以降のフェーズに進める。クラスタの実行プラン提示時は **正規化後** の expert 名を表示する
(ユーザーが planned expert 名を見て混乱するのを防ぐ)。

> `cluster.expert` / 表示名 / payload の `expert` field は **bare 名のまま**保持する。
> plugin scoped 名 (`op-skill:<name>`) への前置は **Agent tool の `subagent_type` を渡す瞬間だけ**
> 適用する (ClusterOrchestrator の apply / review spawn 含む)。正本は
> `_shared/expert-spawn.md`「Plugin scoped-name 規約」。

