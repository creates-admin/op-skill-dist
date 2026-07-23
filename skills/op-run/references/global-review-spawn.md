<!--
schema_version: 3
last_breaking_change: 2026-05-31
notes: v3 additive (2026-07-23, ADR-0027 第六波 6b): §4-2-pre の review_round 導出を PR コメント走査 (awk) から
       `op review state pull` + jq (`[.details.state.attempts[].review_round] | max // 0`) へ全面置換。
       §4-2-b の approve/non-approve 両 path に state push (attempt payload) を配線。trusted-author 集合
       (§4-2-pre `TRUSTED_REVIEW_AUTHORS`) は「comment 監査ログの人間向け表示用として残るが機械判定には
       使わない」に降格 (ADR-0027「trust 境界の引き直し」節)。review-markers.md が 1→2 に breaking bump
       されたため、本ファイルの参照 pin を **(>=2)** に更新 (review-markers.md v2 = comment marker 群の
       監査ログ専用降格・state 文書が機械正本)。挙動は変わる (round 導出元の変更) が公開 field schema
       (op-review-meta/finding の記載項目) 自体は不変のため schema_version は据置。
       v3 additive (2026-06-14, Issue #723 = #682 item3 / RVW-003 解消): §4-2-a-pre2 の
       PROP_ENABLED / SMALL_MAX_LOC / MEDIUM_MAX_LOC 解決前に `eval "$(op model decide-review --emit-env)"` を
       挿入し、op-config.yaml の review.proportional_lens.{enabled,tiers} を controller に届ける YAML→env bridge を
       配線。primitive が env > config > ADR-0015 既定で解決して 3 env var を export するため、後続の
       `${OP_REVIEW_*:-default}` は既存 env override 優先 + 既定 fallback の意味を保持 (挙動非変更)。primitive 不在時は
       2>/dev/null||true で graceful degrade し従来既定へ。args 契約 / 公開 field schema 不変ゆえ schema_version 据置。
       v3 fix (2026-06-07, Issue #682 medium tier 到達性): §4-2-a-pre2 の lens gate から
       `|| [ "$REVIEW_MODEL" = "opus" ]` を除去し、lens 選択を REVIEW_SENSITIVE_TOUCHED + LOC tier のみに key する
       (lens/model 別軸 = ADR-0015 constraint 7 を mechanism として充足)。従来は §4-1-b narrow opt-down が LOC>100 で
       REVIEW_MODEL=opus にするため medium tier (101-500 LOC) が常に full へ倒れ medium 分岐が到達不能だった。
       本修正で non-sensitive medium PR が reduced lens (refactor +UX非該当時 workflow-ux のみ skip) を受ける。
       args 契約 / 公開 field schema 不変ゆえ schema_version 据置 (挙動 fix、op-run/SKILL.md pin >=3 と整合)。
       v3 additive (2026-06-07, ADR-0015 review depth proportional lens gating): §4-2-a に
       新サブ節 §4-2-a-pre2 (active lens / bundle 解決) を追加し、Workflow args に active_lens_keys /
       lens_bundles / carryover_findings を additive 注入する。lens 選択は controller 側 (§4-1-b 既算出値
       REVIEW_LOC_COUNT / REVIEW_SENSITIVE_TOUCHED を再利用)。floor/verdict/synthesize の判定ロジックと
       op-review-meta/finding 公開契約は不変、空配列 [] で従来 7-lens フルへ退行可能なため **挙動非変更の
       additive = schema_version bump せず v3 据置** (op-run/SKILL.md の pin >=3 と整合)。
       v3 additive (2026-06-15, ADR-0016): 全フェーズの実行主体が ClusterOrchestrator (Agent tool) に移管。
       schema_version 据置 (executor 移動のみ、contract / methodology 不変)。本ファイルの §4-1〜§4-2-b の
       全メソドロジー (worktree 作成 / narrow opt-down / round 算出 / lens 解決 / marker 組立) は
       ClusterOrchestrator フェーズ6 の pointer 参照先として live に維持。
       v3 (2026-05-31, ADR-0011 = ADR-0009 Phase C closeout): §4-2 を lens-modular 化。op-run-review.js が
       C1 thin (1 review-expert/PR が 7 lens 内部処理) から 4 phase (prep digest → 7 lens 並列調査 →
       High/Critical adversarial-verify → opus 最終ゲート) へ展開。2 つの破壊的変更を伴うため bump:
       (1) §4-2-a の Workflow args が単一 review_model から per-phase models{investigate,verify,gate} へ
           (investigate=REVIEW_MODEL=narrow opt-down 結果 / verify=gate=opus / sensitive PR は全 opus)。
       (2) op-review-meta / op-review-finding の **投稿主体が review-expert agent から controller へ移管**
           (新 §4-2-b)。workflow は marker を組まず構造化 reviews[] のみ返し、controller が単一 op-review-meta +
           連番 op-review-finding を組み立て Marker Publish Validate 後に 1 回投稿する (複数 meta による
           op-merge gate 破綻を構造排除、ADR-0011 決定6)。op-review-meta/finding の **公開 field schema は不変**
           (review-markers.md v1 据置)。op-run/SKILL.md の参照 pin を (>=3) に同期すること。
       v2 (2026-05-30, ADR-0009 Phase C / C1): §4-2 の spawn 機構を single-message Agent spawn +
       Monitor 待ちから Dynamic Workflow (`Workflow({name:'op-run-review', ...})`) 呼び出しへ差し替え。
       司令官保持 (§4-1 review worktree detach / §4-1-b narrow opt-down REVIEW_MODEL 確定 /
       §4-2-pre review_round 算出 / §4-2-pre-2 OP_RUN_SESSION_ID mint) は不変。
       review-expert の別 context 独立性 (不変則7: 修正/commit/push 禁止) と
       op-review-meta / op-review-finding の block 契約は不変のため schema_version は v2 据置
       (bump しない、L23 前例に倣う = 挙動非変更の機構差替)。C1 は thin (1 review-expert/PR が
       7 lens を内部処理)。lens-modular fan-out (lens 並列 + synthesizer + adversarial verify) は将来 wave。
       v2 (2026-05-23): §4-1-b「review_model 決定 (narrow opt-down judgment)」を §4-1 と §4-2 の間に
       新設 (Refs #493)。review-expert を 5 条件 AND (LOC≤100 ∩ 非センシティブ glob ∩ --quality high
       不指定 ∩ kill switch 不在 ∩ degrade 不在) を満たす狭い PR に限り Sonnet へ opt-down する (具体 version は model-selection.md §1)。
       §4-2 spawn template の `model: "opus"` を `model: "${REVIEW_MODEL}"` に変更し、review-expert に
       model_used / model_decision_reason を渡して op-review-meta に転写させる。canonical 仕様は
       `_shared/model-selection.md` (>=3) §7.1。op-run/SKILL.md の参照 pin を (>=2) に同期すること。
       v3 additive (2026-06-14, Refs #720): §4-1-b に sensitive ∩ doc-only small PR の investigate-phase
       Sonnet 段階下げ判定 (CUMULATIVE_NONDOC / SENSITIVE_INVESTIGATE_SONNET) を追加。§4-2-a-pre の
       investigate model 分岐に対応。canonical 仕様は `_shared/model-selection.md` (>=4) §7.1.3
       (v4 破壊的変更)。本ファイルの pin を (>=4) に更新すること。
       v2 fix (2026-05-23, RVW-001): §4-1-b `SENSITIVE_PATTERNS` が §7.1.3 の sensitive glob を
       取りこぼしていた件を修正 (非破壊・additive な安全強化)。top-level path 取りこぼし (先頭 `/` 前提)
       を `(^|/)` で両対応にし、authentication/authorization/crypto/permissions/secrets/*.prisma/
       schema.*/COPYRIGHT/NOTICE/top-level release|installer|updater|scripts/release を網羅。§7.1.3 を
       source of truth とする drift 防止コメントと網羅性 smoke test を追加。schema_version は据置 (v2 内修正)。
       v1 (2026-05-23): op-run フェーズ4 (Global Review) の詳細仕様。
       SKILL.md god file (~2668 行) 抑制のため本ファイルへ物理切り出し (Issue #464 Stage 3)。
       切り出し前後で bash 実装 / 判定基準 / review_round 算出 / spawn prompt 文言を byte-identical 維持。
-->

<!--
機能概要: op-run フェーズ3.5 (Post-check Dispatcher) の後に実施する global review の詳細仕様。
         review-expert を別 context (worktree 隔離) で spawn し、self-review バイアスを排除する。
         4-1 review worktree 作成 / 4-2 review-expert spawn (review_mode / review_round 確定込み) /
         4-3 レビュー結果統合 の 3 サブ節を集約する。
作成意図: SKILL.md の god file 化解消 (Issue #406 staged_refactor / #425 Stage 3)。
         review worktree 作成の bash 実装と review-expert spawn prompt、review_round 算出ロジック、
         OP_RUN_SESSION_ID 払い出し手順を SKILL.md 本体と byte-identical のまま分離する。
注意点: 本ファイルの bash 実装・review_round 算出・spawn prompt を変更するときは、必ず SKILL.md 本体の
       フェーズ3.5 (Post-check Dispatcher) / フェーズ4.5 (Review Fix Loop) との接続点と整合を確認する。
       Stage 4 (フェーズ4.5 review-fix-loop) / Stage 6 (Phase 1-2-c expert-resolution) は別 PR
       (Issue #465 / #467 参照)。
-->

<!-- op-domain: refactor -->
<!-- op-source: op-run -->

# op-run: Global Review (フェーズ4)

## フェーズ4: Global Review (別 context, review-expert)

`_shared/expert-spawn.md` のパターン3 (review) に従う。**self-review バイアス対策の核**。
review-expert は **監査専任**。修正・push は行わず、必要があれば op-run が specialist expert に再委任する (フェーズ4.5 Review Fix Loop)。

### 4-1. レビュー用 worktree を別途作成

apply に使った worktree とは **別の worktree** で **対象 PR の head SHA** を checkout する。
branch 名 `auto/${TASK_ID}` 固定だと、複数 PR 並列 review / re-review 時に別 PR の head を
review してしまう事故が起きるため、必ず `op pr view` から head ref / head SHA を解決する。

> **stale head の構造的回避 (#651)**: push 直後は GitHub 側 head ref が eventual consistency で
> 遅延し、`op pr view --include meta` の `head_ref_oid` が **push 前の古い SHA** を返すことがある。
> この stale SHA を review worktree の detach target にすると、古い commit をレビューする silent bug
> になる (既存の HEAD 一致 verify は **期待値自体が stale** なので stale 同士が一致してすり抜ける)。
> source of truth を **controller がローカルに push したブランチ SHA** (`auto/${TASK_ID}`) に置き、
> GitHub の head_ref_oid がそれに追従するまで poll してから worktree を作成する。

```bash
# OP_RUN_REPO はフェーズ0-base で export 済。review worktree path に使用 (_shared/worktree-ops.md:46 と同等)
REPO_NAME="${OP_RUN_REPO##*/}"

# --- source of truth = controller がローカルに push したブランチ SHA (#651) ---
# GitHub head_ref_oid は push 直後に遅延するため、ローカル branch (auto/${TASK_ID}) の SHA を
# 期待値として固定する。これにより後段の HEAD 一致 verify が「stale 同士の一致」ですり抜けない。
: "${TASK_ID:?TASK_ID must be set — 当該クラスタの apply task id (auto/<TASK_ID> branch の解決に必要)}"
EXPECTED_HEAD_SHA=$(git rev-parse --verify "refs/heads/auto/${TASK_ID}" 2>/dev/null || echo "")

# PR base / head ref / SHA を解決 (op pr view --include meta、fork owner フィールド込み = #579/#635)
PR_META=$(op pr view "$PR_NUMBER" --include meta)
BASE_REF=$(echo "$PR_META" | jq -r '.base_ref_name')
PR_HEAD_REF=$(echo "$PR_META" | jq -r '.head_ref_name')
PR_HEAD_SHA=$(echo "$PR_META" | jq -r '.head_ref_oid')

# --- GitHub head_ref_oid がローカル push SHA に追従するまで poll する (#651) ---
# ローカル branch が解決できた場合のみ poll する (fork PR 等で解決不能なら従来どおり GitHub 値を採る)。
if [ -n "$EXPECTED_HEAD_SHA" ]; then
  POLL_MAX=5      # 最大 5 回 (約 15s)。push 反映は通常数秒で収束する
  POLL_INTERVAL=3 # 秒。eventual consistency の追従待ち
  POLL_N=0
  while [ "$PR_HEAD_SHA" != "$EXPECTED_HEAD_SHA" ] && [ "$POLL_N" -lt "$POLL_MAX" ]; do
    sleep "$POLL_INTERVAL"
    POLL_N=$((POLL_N + 1))
    PR_META=$(op pr view "$PR_NUMBER" --include meta)
    PR_HEAD_SHA=$(echo "$PR_META" | jq -r '.head_ref_oid')
  done
  if [ "$PR_HEAD_SHA" != "$EXPECTED_HEAD_SHA" ]; then
    # poll 上限に達しても GitHub が追従しない → ローカル push SHA を真として採用する
    # (review 対象は controller が push した最新 commit。GitHub 反映遅延でレビューを止めない)。
    echo "⚠️ PR #${PR_NUMBER} head_ref_oid=${PR_HEAD_SHA} がローカル push SHA=${EXPECTED_HEAD_SHA} に poll 上限内で追従せず。ローカル push SHA を真として採用します。" >&2
    PR_HEAD_SHA="$EXPECTED_HEAD_SHA"
  fi
fi
# fork owner は #579/#635 envelope の head_repository_owner_login を使う (別 gh fetch を排除)。
PR_HEAD_REPO_OWNER=$(echo "$PR_META" | jq -r '.head_repository_owner_login // empty')

test -n "$BASE_REF" -a -n "$PR_HEAD_REF" -a -n "$PR_HEAD_SHA" || {
  echo "❌ PR #${PR_NUMBER} の baseRefName / headRefName / headRefOid が解決できませんでした" >&2
  exit 1
}

# base-first evidence の stale 防止。
# review-expert は origin/${BASE_REF} を読むため、必ず最新化する
# (release / develop / hotfix branch を base にする可能性があるため、ハードコード禁止)。
git fetch origin "$BASE_REF:refs/remotes/origin/$BASE_REF"

# 該当 head ref を fetch (rebase / force-push 直後の追従漏れを防ぐ)。
# 現行 flow は **同一 repo branch 前提**。fork PR は op-run の review worktree flow の対象外
# として明示停止する (内部運用前提)。fork 対応するには pull/${PR_NUMBER}/head fetch +
# head SHA detach に flow を拡張する必要があるが、現時点で要件が無いため未実装。
# fork 判定の owner は上の op pr view --include meta envelope (head_repository_owner_login、#635) を使う。
BASE_REPO_OWNER=$(op repo info | jq -r '.details.owner')
if [ -n "$PR_HEAD_REPO_OWNER" ] && [ "$PR_HEAD_REPO_OWNER" != "$BASE_REPO_OWNER" ]; then
  echo "❌ fork PR (#${PR_NUMBER}) は op-run review worktree flow の対象外です。" >&2
  echo "   head_owner=${PR_HEAD_REPO_OWNER} base_owner=${BASE_REPO_OWNER}" >&2
  echo "   fork 対応が必要なら pull/${PR_NUMBER}/head fetch + head SHA detach に flow を拡張してください。" >&2
  exit 1
fi

git fetch origin "$PR_HEAD_REF"

# review worktree は TASK_ID と PR 番号の両方で命名し、head SHA を直接 checkout する
# 命名規則 (op-merge cleanup と必ず一致させること): review-${TASK_ID}-pr-${PR_NUMBER}-<unix-ts>
# - TASK_ID: 当該クラスタの apply task id (PR 単位 cleanup の起点)
# - PR_NUMBER: 並列レビュー時の識別 / SHA 検証の根拠
REVIEW_WT="${HOME}/cwork/worktrees/${REPO_NAME}/review-${TASK_ID}-pr-${PR_NUMBER}-$(date +%s)"
git worktree add --detach "${REVIEW_WT}" "$PR_HEAD_SHA"

# HEAD 一致を最終 verify (review-expert に渡す reviewed_head_sha の根拠)。
# 期待値 $PR_HEAD_SHA は #651 の poll でローカル push SHA に固定済 (stale 同士の一致ですり抜けない)。
CURRENT_HEAD=$(git -C "${REVIEW_WT}" rev-parse HEAD)
test "$CURRENT_HEAD" = "$PR_HEAD_SHA" || {
  echo "❌ review worktree HEAD mismatch: expected=$PR_HEAD_SHA actual=$CURRENT_HEAD" >&2
  git worktree remove --force "${REVIEW_WT}" 2>/dev/null || true
  exit 1
}
```

> **重要**: branch 名ではなく **SHA detach checkout** にする。これでレビュー対象が固定され、
> review-expert が記録する `reviewed_head_sha` と op-merge の stale gate が常に整合する。
> 4-2 の Agent prompt 内 `【作業環境】PR ブランチ` には解決済みの `$PR_HEAD_REF` / `$PR_HEAD_SHA` を渡す。

### 4-1-b. review_model 決定 (narrow opt-down judgment)

司令官は review-expert spawn 前に、対象 PR が `model-selection.md` (>=4) §7.1 の narrow opt-down
5 条件 AND を満たすかを判定し、`REVIEW_MODEL` (`opus` / `sonnet`) と `REVIEW_MODEL_REASON` を確定させる。
判定の canonical 仕様は `_shared/model-selection.md` (>=4) §7.1 (5 条件 / LOC 正規化 / sensitive glob /
`--quality` 相互作用 / §7.1.3 investigate-phase 例外) を参照する。本節はその bash 実装を提供する。

> **部分 CLI 化済 / 残作業あり**: `op model decide-review` (Issue #723 / PR #733) は
> `review.proportional_lens.{enabled,tiers}` の YAML→env bridge 部分を実装済み。
> ただし本節 §4-1-b が担う **narrow opt-down (REVIEW_MODEL 決定) ロジックは含まない**。
> REVIEW_MODEL 決定の CLI 化は別 primitive 待ち (`op-tools/docs/implementation-order.md` 追跡対象、
> Issue #261 / #394 の op-run rewrite trigger)。下記約 35 行 bash はその部分の架け橋として引き続き使用する。

```bash
# §4-1-b. review_model 決定 (narrow opt-down judgment)
# canonical 仕様: _shared/model-selection.md (>=4) §7.1 / §7.1.3 (investigate-phase 例外)
# op model decide-review primitive 完成後に CLI 化予定 (op-tools/docs/implementation-order.md 追跡対象)
: "${OP_RUN_BASE_REF:?OP_RUN_BASE_REF must be set — フェーズ 0-base で確定}"
: "${REVIEW_WT:?REVIEW_WT must be set — 4-1 で確定済の review worktree}"
: "${PR_NUMBER:?PR_NUMBER must be set — 当該 PR 番号}"

# 不変則 4: 配列は使用前に初期化する
# PR 変更ファイル一覧は op pr view --include files の envelope (.files = path 文字列配列、#579/#635) を使う。
PR_FILES_ARR=()
mapfile -t PR_FILES_ARR < <(op pr view "$PR_NUMBER" --include files | jq -r '.files[]?')
PR_FILE_COUNT="${#PR_FILES_ARR[@]}"

if [ "$PR_FILE_COUNT" -gt 100 ]; then
  # 100 files 超過は ページング + ARG_MAX 懸念のため safety default で Opus 維持 (§7.1.2)
  export REVIEW_MODEL="opus"
  export REVIEW_MODEL_REASON="large-pr-file-count"
  # RVW-003: large PR こそ慎重 review が要るため proportional gating の入力を「7-lens フル」側 default に倒す。
  #   §4-2-a-pre2 の :? guard が unset で hard-fail するのを防ぎつつ、large 扱い (sensitive 相当) で
  #   全 lens 単独に倒す。不変則1: 別 fence (§4-2-a-pre2) から参照するため export 必須。
  export REVIEW_LOC_COUNT=99999             # large tier 超の値 (>medium_max_loc) で 7-lens 完全分割側へ
  export REVIEW_SENSITIVE_TOUCHED=1         # sensitive 扱い = §4-2-a-pre2 先頭分岐で 7-lens フルへ倒す
else
  # 除外 glob 適用後のファイルを配列で受ける (不変則 4: 配列初期化 + 不変則 2: quoted 展開)
  NON_EXCLUDED_ARR=()
  mapfile -t NON_EXCLUDED_ARR < <(printf '%s\n' "${PR_FILES_ARR[@]}" \
    | grep -Ev '(\.lock$|\.svg$|\.png$|\.jpg$|\.webp$|/snapshot/|/__snapshots__/|/generated/|/vendor/|/node_modules/|/target/|/dist/|/build/)' || true)

  if [ "${#NON_EXCLUDED_ARR[@]}" -eq 0 ]; then
    # RVW-002: 別 fence (§4-2-a-pre2) が :? guard で参照するため export 必須 (不変則1)。
    export REVIEW_LOC_COUNT=0   # 全ファイルが除外対象 (lock/generated のみ) → 軽量とみなす (§7.1.2)
  else
    # `--shortstat` は配列を quoted 展開する (不変則 2/4。unquoted は word-splitting / glob 展開を起こす)
    LOC_STAT=$(git -C "${REVIEW_WT}" diff --shortstat "origin/${OP_RUN_BASE_REF}...HEAD" -- "${NON_EXCLUDED_ARR[@]}")
    LOC_INS=$(printf '%s' "$LOC_STAT" | grep -oE '[0-9]+ insertion' | grep -oE '[0-9]+' || echo 0)
    LOC_DEL=$(printf '%s' "$LOC_STAT" | grep -oE '[0-9]+ deletion' | grep -oE '[0-9]+' || echo 0)
    # RVW-002: 別 fence (§4-2-a-pre2) が :? guard で参照するため export 必須 (不変則1)。
    export REVIEW_LOC_COUNT=$((LOC_INS + LOC_DEL))
  fi

  # sensitive glob (§7.1.3 内蔵 default。project 追加分は op-config.yaml review_opt_down_sensitive_paths)
  #
  # 【正本同期必須】本 regex は `_shared/model-selection.md` (>=4) §7.1.3 の sensitive glob 宣言を
  #   source of truth とし、その全カテゴリを **漏れなくカバー** すること。§7.1.3 に glob を追加・変更
  #   したら、本 regex も同時に更新して両者が乖離しないようにする (drift 防止)。
  #   §7.1.3 と本 regex の対応:
  #     - `**/{migrations,auth,authentication,authorization,security,crypto,iam,capabilities,permissions,release,installer,updater,secrets}/**`
  #       → `(^|/)(...)/`  ※top-level / ネスト両対応のため `/foo/` 前提を捨て `(^|/)foo/` にする
  #     - `**/*.sql` `**/*.prisma`                → `\.sql$` `\.prisma$`
  #     - `**/schema.*`                           → `(^|/)schema\.[^/]+$` (schema.<ext> filename のみ。schema_helpers.rs は非該当)
  #     - `src-tauri/tauri.conf.json`             → `(^|/)tauri\.conf\.json$`
  #     - `**/scripts/release*`                   → `(^|/)scripts/release`
  #     - `**/.github/workflows/**`               → `(^|/)\.github/workflows/`
  #     - `skills/_shared/**` `agents/*.md`       → `^skills/_shared/` `^agents/[^/]*\.md$`
  #     - `op-tools/crates/**`                    → `^op-tools/crates/`
  #     - `LICENSE*` `**/COPYRIGHT*` `**/NOTICE*` → `(^|/)LICENSE` `(^|/)COPYRIGHT` `(^|/)NOTICE`
  #     - `**/.env*` `**/secrets/**`              → `(^|/)\.env` / secrets は上の segment 群に含む
  #     - `**/Cargo.toml` `**/package.json`       → `(^|/)Cargo\.toml$` `(^|/)package\.json$` (version manifest、#721/#682 item4)
  #       `**/pubspec.yaml` `**/Cargo.lock` `VERSION` → `(^|/)pubspec\.yaml$` `(^|/)Cargo\.lock$` `(^|/)VERSION$`
  #       ※version-bump PR が small tier に落ちて Release lens が skip されるのを防ぐ recall 強化。
  #         Cargo.lock は §7.1.2 LOC 除外 glob 対象だが sensitivity 判定は別軸なので version manifest として効く。
  # 不変則 3 (single-quote): regex は single-quote で囲み word-splitting / glob 展開を防ぐ。
  SENSITIVE_PATTERNS='(^|/)(migrations|auth|authentication|authorization|security|crypto|iam|capabilities|permissions|release|installer|updater|secrets)/|\.sql$|\.prisma$|(^|/)schema\.[^/]+$|(^|/)tauri\.conf\.json$|(^|/)scripts/release|(^|/)\.github/workflows/|^skills/_shared/|^agents/[^/]*\.md$|^op-tools/crates/|(^|/)LICENSE|(^|/)COPYRIGHT|(^|/)NOTICE|(^|/)\.env|(^|/)Cargo\.toml$|(^|/)package\.json$|(^|/)pubspec\.yaml$|(^|/)Cargo\.lock$|(^|/)VERSION$'
  # 注: `grep -c` は no-match でも `0` を stdout 出力し exit 1 を返す。
  # `|| echo 0` を付けると no-match 時に "0\n0" の二重出力になり後続の `-eq 0` 算術比較が壊れて
  # 常に else (Opus) へ落ちる (narrow opt-down が無効化される) ため、exit code だけ `|| true` で握る。
  # RVW-002: 別 fence (§4-2-a-pre2) が :? guard で参照するため export 必須 (不変則1)。
  export REVIEW_SENSITIVE_TOUCHED=$(printf '%s\n' "${PR_FILES_ARR[@]}" | grep -cE "$SENSITIVE_PATTERNS" || true)
  # 念のため数値以外 (空) は 0 にフォールバック (PR_FILES_ARR が空のケース等)
  printf '%s' "$REVIEW_SENSITIVE_TOUCHED" | grep -Eq '^[0-9]+$' || export REVIEW_SENSITIVE_TOUCHED=0

  # 5 条件 AND (§7.1.1)
  if [ "$REVIEW_LOC_COUNT" -le 100 ] \
     && [ "$REVIEW_SENSITIVE_TOUCHED" -eq 0 ] \
     && [ "${OP_QUALITY:-balanced}" != "high" ] \
     && [ "${OP_REVIEW_OPT_DOWN_DISABLE:-0}" != "1" ] \
     && [ "${MODEL_DEGRADED:-0}" != "1" ]; then
    export REVIEW_MODEL="sonnet"
    export REVIEW_MODEL_REASON="narrow-opt-down"
  else
    export REVIEW_MODEL="opus"
    # 具体的 reason は条件ごとに出し分け (観測 / 撤退判断のため)
    if [ "$REVIEW_LOC_COUNT" -gt 100 ]; then
      export REVIEW_MODEL_REASON="large-pr-loc"
    elif [ "$REVIEW_SENSITIVE_TOUCHED" -ne 0 ]; then
      export REVIEW_MODEL_REASON="sensitive-path"
    elif [ "${OP_QUALITY:-balanced}" = "high" ]; then
      export REVIEW_MODEL_REASON="quality-high"
    elif [ "${OP_REVIEW_OPT_DOWN_DISABLE:-0}" = "1" ]; then
      export REVIEW_MODEL_REASON="kill-switch"
    elif [ "${MODEL_DEGRADED:-0}" = "1" ]; then
      export REVIEW_MODEL_REASON="model-degraded"
    else
      export REVIEW_MODEL_REASON="default-opus"
    fi
  fi

  # --- #720: sensitive doc-only small PR の investigate sonnet 段階下げ判定 ---
  # sensitive glob 該当 (= REVIEW_MODEL=opus) でも、doc-only かつ small (<=SMALL_MAX_LOC) なら
  # investigate (lens-audit) phase のみ sonnet に下げる (verify/gate/backstop は opus 維持、lens floor も不変)。
  # REVIEW_MODEL は opus のまま据置 = escape hatch (model_overrides.review-expert: opus) 互換を壊さない。
  # §4-2-a-pre が本フラグを見て REVIEW_INVESTIGATE_MODEL のみ分岐する。
  # 非doc=0 は cumulative diff (origin/OP_RUN_BASE_REF...HEAD、§4.5-5 #717 と同一の CUMULATIVE_NONDOC 算出) で測る。
  # doc-only 判定式の正本は model-selection.md §7.1.3。review-fix-loop.md §4.5-5 にも同式が存在する
  # (drift 防止: 変更時は両方更新すること)。
  # op-tools/crates/** にマッチした時点で非 doc 扱い (conservative、コメントのみ変更でも .rs touch なら opus 維持)。
  CUMULATIVE_NONDOC=$(git -C "${REVIEW_WT}" diff --name-only "origin/${OP_RUN_BASE_REF}...HEAD" \
    | grep -Ev '(\.md$|(^|/)docs/)' | wc -l | tr -d ' ')
  printf '%s' "$CUMULATIVE_NONDOC" | grep -Eq '^[0-9]+$' || CUMULATIVE_NONDOC=1
  SMALL_MAX_LOC="${OP_REVIEW_SMALL_MAX_LOC:-100}"
  if [ "$REVIEW_SENSITIVE_TOUCHED" -ne 0 ] \
     && [ "$REVIEW_LOC_COUNT" -le "$SMALL_MAX_LOC" ] \
     && [ "$CUMULATIVE_NONDOC" -eq 0 ] \
     && [ "${OP_QUALITY:-balanced}" != "high" ] \
     && [ "${OP_REVIEW_OPT_DOWN_DISABLE:-0}" != "1" ] \
     && [ "${MODEL_DEGRADED:-0}" != "1" ]; then
    export SENSITIVE_INVESTIGATE_SONNET=1
  else
    export SENSITIVE_INVESTIGATE_SONNET=0
  fi
fi
# >100 file safety default (上の if 枝) では SENSITIVE_INVESTIGATE_SONNET 未設定のため 0 に確定する
# (large PR は investigate も opus 維持 = §4-2-a-pre の :? guard で参照する前に明示)。
export SENSITIVE_INVESTIGATE_SONNET="${SENSITIVE_INVESTIGATE_SONNET:-0}"
```

> **project 単位 escape hatch**: `op-config.yaml` に `model_overrides.review-expert: opus` を明示
> すると narrow opt-down を完全停止できる (`model-selection.md` §6 step 3 explicit override)。
> §4-1-b の判定後、step 3 で override が効くため、本 bash は step 2a 相当の暫定値を出すだけでよい。
>
> **self-referential 性**: 本 op-skill repo の PR は `skills/_shared/**` / `agents/*.md` /
> `op-tools/crates/**` が sensitive glob に該当するため、canonical 正本を変更する PR の review は
> 常に Opus 維持になる (意図的。canonical 変更を Sonnet で review しない設計)。

#### 4-1-b smoke test (`SENSITIVE_PATTERNS` の §7.1.3 網羅性検証)

`SENSITIVE_PATTERNS` が `model-selection.md` (>=4) §7.1.3 の全 sensitive カテゴリを漏れなく
カバーすること (= sensitive PR は確実に Opus 維持されること) を確認する smoke test。
regex を変更したら、または §7.1.3 に glob を追加したら本 test を再実行する。
**全 sensitive path が match=1 (Opus)、全 non-sensitive path が match=0 (Sonnet 候補) なら PASS**。

```bash
# 4-1-b smoke test: §7.1.3 全カテゴリが Opus 判定になることを検証する
# 不変則 3 (single-quote): regex / path 配列は single-quote で word-splitting / glob 展開を防ぐ。
SENSITIVE_PATTERNS='(^|/)(migrations|auth|authentication|authorization|security|crypto|iam|capabilities|permissions|release|installer|updater|secrets)/|\.sql$|\.prisma$|(^|/)schema\.[^/]+$|(^|/)tauri\.conf\.json$|(^|/)scripts/release|(^|/)\.github/workflows/|^skills/_shared/|^agents/[^/]*\.md$|^op-tools/crates/|(^|/)LICENSE|(^|/)COPYRIGHT|(^|/)NOTICE|(^|/)\.env|(^|/)Cargo\.toml$|(^|/)package\.json$|(^|/)pubspec\.yaml$|(^|/)Cargo\.lock$|(^|/)VERSION$'

# 不変則 4: 配列は使用前に初期化する
SENSITIVE_CASES=()
SENSITIVE_CASES=(
  'release/build.rs'              # top-level release/ (旧 regex 取りこぼし)
  'installer/setup.nsi'           # top-level installer/ (旧 regex 取りこぼし)
  'updater/check.rs'              # top-level updater/ (旧 regex 取りこぼし)
  'scripts/release.sh'            # top-level scripts/release* (旧 regex 取りこぼし)
  'src/authentication/oidc.rs'    # authentication/ (旧 regex 取りこぼし)
  'src/authorization/policy.rs'   # authorization/ (旧 regex 取りこぼし)
  'src/crypto/aes.rs'             # crypto/ (旧 regex 取りこぼし)
  'src/permissions/grant.rs'      # permissions/ (旧 regex 取りこぼし)
  'secrets/keys.txt'              # secrets/ (旧 regex 取りこぼし)
  'prisma/schema.prisma'          # *.prisma (旧 regex 取りこぼし)
  'config/schema.json'            # schema.* (旧 regex 取りこぼし)
  'vendor/foo/COPYRIGHT'          # COPYRIGHT (旧 regex 取りこぼし)
  'vendor/foo/NOTICE'             # NOTICE (旧 regex 取りこぼし)
  'src/auth/login.rs'             # auth/ (既存カバー)
  'src/security/sanitize.rs'      # security/ (既存カバー)
  'src/iam/role.rs'               # iam/ (既存カバー)
  'src-tauri/capabilities/default.json' # capabilities/ (既存カバー)
  'src-tauri/tauri.conf.json'     # tauri.conf.json (既存カバー)
  'db/migrations/001_init.sql'    # migrations/ + *.sql (既存カバー)
  'LICENSE-MIT'                   # LICENSE* (既存カバー)
  '.env.production'               # .env* (既存カバー)
  'skills/_shared/model-selection.md'   # canonical (既存カバー)
  'agents/refactor-expert.md'     # agents/*.md (既存カバー)
  'op-tools/crates/op/src/main.rs'      # op-tools/crates (既存カバー)
  '.github/workflows/ci.yml'      # workflows (既存カバー)
  'Cargo.toml'                    # version manifest (#721/#682 item4)
  'crates/op/Cargo.toml'          # ネスト Cargo.toml (#721)
  'package.json'                  # version manifest (#721)
  'frontend/package.json'         # ネスト package.json (#721)
  'pubspec.yaml'                  # Flutter version manifest (#721)
  'Cargo.lock'                    # lockfile も version 整合の手掛り (#721)
  'VERSION'                       # 単独 VERSION ファイル (#721)
)
NONSENSITIVE_CASES=()
NONSENSITIVE_CASES=(
  'src/foo.rs'                    # 通常 source
  'README.md'                     # docs typo 修正等
  'lib/schema_helpers.rs'         # "schema" 部分一致だが schema.<ext> ではない → 非該当
  'docs/release-process.md'       # "release" 部分一致だが scripts/release でも /release/ でもない
  'src/preauth.rs'                # "auth" 部分一致だが auth/ segment ではない
  'src/version.rs'                # "VERSION" 部分一致だが VERSION ファイルではない → 非該当
  'docs/package.json.md'          # "package.json" 部分一致だが filename 末尾ではない → 非該当
)

SMOKE_FAIL=0
for p in "${SENSITIVE_CASES[@]}"; do
  printf '%s\n' "$p" | grep -qE "$SENSITIVE_PATTERNS" \
    && echo "OK  sensitive→Opus    : $p" \
    || { echo "FAIL sensitive取りこぼし: $p"; SMOKE_FAIL=1; }
done
for p in "${NONSENSITIVE_CASES[@]}"; do
  printf '%s\n' "$p" | grep -qE "$SENSITIVE_PATTERNS" \
    && { echo "FAIL 非sensitive誤Opus  : $p"; SMOKE_FAIL=1; } \
    || echo "OK  non-sensitive→Sonnet候補: $p"
done
[ "$SMOKE_FAIL" -eq 0 ] && echo "SMOKE PASS: §7.1.3 全カテゴリ網羅" || echo "SMOKE FAIL"
```

### 4-2. review-expert を別 context で spawn (post_check 結果に応じてモード分岐)

司令官は spawn 時に **review_mode** と **review_round** の 2 値を確定させ、prompt 内に明示する。

| review_mode | 適用条件 | Security/Abuse Lens の扱い |
|-------------|---------|---------------------------|
| `full` | 3.5-A (UX/UI post-check) のみ通過、または post_check_expert が null、または 3.5-B が legacy skip (security-expert agent 不在の異常状態) | 通常通り、7 lens フル監査 |
| `light-after-security-postcheck` | 3.5-B (security post-check) で PASS / PASS_WITH_NOTES を取得済み (aux post-check が必要なら aux も PASS / PASS_WITH_NOTES) | Security/Abuse Lens は **「PR 全体として新たな攻撃面が増えていないか」のみ軽く** に切り替え (深掘り再監査は security-expert が完了済み)。他 lens は通常通り |

`light-after-security-postcheck` の判定は **review state 文書** (ADR-0027 6b) から行う —
`op review state pull` の `.details.state.post_checks["security-expert"].audit_result` が
`PASS` または `PASS_WITH_NOTES` であることを確認する (state 不在 / entry 不在 / `SKIPPED` は
`full` に倒す fail-safe)。さらに `requires_aux_post_check: true` の場合は
`post_checks["ux-ui-audit-expert@aux"]` も PASS / PASS_WITH_NOTES を確認する。
実装 fence の正本は `cluster-orchestrator-directives.md` フェーズ5.5 (同判定の実行主体は
ClusterOrchestrator)。コメント上の `<!-- op-security-post-check -->` は人間向け監査ログであり
機械判定には使わない (review-markers.md v2)。

> **post-check SKIPPED と review_result の関係 (全体統一方針)**:
> 3.5-A / 3.5-B が **適用された上で SKIPPED** に倒れた PR
> (= `pro-ux-ui-audit-skipped` / `pro-security-post-check-skipped` が残った状態) でも、
> review-expert は SKIPPED ラベルだけを理由に `blocked` を返してはならない。
>
> review-expert はあくまで global review として、PR 全体のコード品質 / 仕様整合 /
> 回帰リスク / Security/Abuse Lens / Workflow/UX Lens を確認する。
>
> - PR 自体に merge blocker がなければ `review_result = approve` を返してよい
> - PR 自体に修正可能な問題があれば `needs-fix`
> - 専門判断が必要なら `needs-specialist-review`
> - scope_out / 人間判断 / Issue 再設計が必要なら `blocked`
>
> `pro-*-skipped` ラベルが残る PR の最終 merge 可否は op-merge gate 12〜16 が判断する。
> manual override は op-merge の例外運用であり、review-expert の `review_result` とは独立する。
> 詳細は `expert-review/references/result-decision.md` の「required post-check が SKIPPED のときの取り扱い」節。

#### 4-2-pre. review_round の計算 (司令官側、必須、ADR-0027 6b: state 文書ベース)

> **v2 移行 (ADR-0027 6b)**: review_round の機械正本は PR コメント走査ではなく
> `<!-- op-review-state -->` body 文書 (`op review state pull`) の `attempts[]`。
> comment 走査 (旧 awk 実装) は廃止した。comment 投稿 (`op pr comment` による
> `<!-- op-review-meta -->`) は人間向け監査ログとして引き続き行うが、機械判定はしない。

review-expert は spawn prompt 経由で渡された `review_round` を `<!-- op-review-meta -->` の
`review_round` フィールドに転写する (監査ログ用)。司令官は spawn 前に state 文書から前回 round を取得し、
インクリメントした値を prompt に渡す。テンプレ側で round を固定値として持たない (1 固定だと修正ループで毎回
round 1 が記録されてしまう問題を防ぐ)。

```bash
# === review_round の取得 (ADR-0027 6b: state 文書ベース) ===
# 算出方針 (canonical): review_round は **「PR 全体での review attempt 通算」** として扱う。
# - PREV_ROUND = state 文書 attempts[] の review_round の最大値 (= attempt 総数)
# - REVIEW_ROUND = PREV_ROUND + 1 (新規 attempt)
# 同一 review_round の重複 entry (apply_write は無条件 append のため起こりうる) の tie-break
# (= どちらを「その round の正」として finding 抽出等に使うか、reviewed_at 最新採用) は
# `op review state pull` / op-core 側の実装に内蔵されており、本 bash は max round の取得のみ行う。
#
# rationale (head SHA filter を round 算出から外している理由、旧設計からの継承):
#   - 「reviewed_head_sha == 現在 head」だけ算入すると、Review Fix Loop の fix commit で
#     head が変わるたびに過去 round が stale 扱いになり、PREV_ROUND が毎回 0 → REVIEW_ROUND が
#     永久に 1 のまま → max_review_fix_rounds の安全弁が一度も発火しない致命バグになる
#   - 「PR 全体の attempt 通算」に統一することで、round 1 → fix → round 2 → fix → round 3
#     の正しい遷移が成立する
#
# `reviewed_head_sha` の役割分担 (canonical、不変):
#   - **round 算出**: 使わない (本ロジック)
#   - **op-merge stale gate**: 「state 文書最新 attempt の reviewed_head_sha == current head」で merge を止める
#   - **finding 抽出 (4.5-2-pre)**: 「reviewed_head_sha == current head」で絞り、stale finding を apply に流さない
#
# TRUSTED_REVIEW_AUTHORS は **機械判定には使わない** (ADR-0027「trust 境界の引き直し」節)。
# comment 監査ログの人間向け表示 (誰が投稿したかを PR コメント上で分かりやすくする) 目的でのみ
# 残置する。フェーズ4.5-2-pre / フェーズ4.5-4 Review Fix Loop も同じ位置づけで参照する。
TRUSTED_REVIEW_AUTHORS_DEFAULT="github-actions[bot] claude-bot op-bot"
TRUSTED_REVIEW_AUTHORS="${OP_TRUSTED_REVIEW_AUTHORS:-$TRUSTED_REVIEW_AUTHORS_DEFAULT}"
REPO_OWNER=$(op repo info 2>/dev/null | jq -r '.details.owner // empty' || echo "")
[ -n "$REPO_OWNER" ] && TRUSTED_REVIEW_AUTHORS="${TRUSTED_REVIEW_AUTHORS} ${REPO_OWNER}"

# state pull: gh channel は fetch 内蔵。mcp channel は直前の fresh search_pull_requests 素材を
# REVIEW_STATE_INPUT_JSON に用意して --input-json で渡す (github-channel.md §4 の実行者責務)。
REVIEW_STATE_JSON=$(op review state pull --pr "$PR_NUMBER" \
  ${REVIEW_STATE_INPUT_JSON:+--input-json "$REVIEW_STATE_INPUT_JSON"})

# round 導出: attempts[].review_round の最大値。state 不在 (初回 review) は 0 → REVIEW_ROUND=1。
PREV_ROUND=$(printf '%s' "$REVIEW_STATE_JSON" \
  | jq '[.details.state.attempts[]?.review_round] | max // 0')

# 数値以外 (パース失敗等) は 0 扱いにフォールバック (安全側)
if ! printf '%s' "$PREV_ROUND" | grep -Eq '^[0-9]+$'; then
  PREV_ROUND=0
fi
REVIEW_ROUND=$((PREV_ROUND + 1))

# Review Fix Loop の上限管理 (フェーズ4.5 と整合)
# max_review_fix_rounds = 2 → 許可される review_round は 1..(MAX+1) = 1..3
# round 1: 初回 review / round 2: fix 1 回目後 re-review / round 3: fix 2 回目後 final re-review
# round > MAX+1 (= 4 以上) は規定外 spawn のため即 terminal blocked (review-expert は spawn しない)
MAX_REVIEW_FIX_ROUNDS=2
if [ "$REVIEW_ROUND" -gt "$((MAX_REVIEW_FIX_ROUNDS + 1))" ]; then
  echo "❌ review_round=${REVIEW_ROUND} は許可上限 (MAX+1=$((MAX_REVIEW_FIX_ROUNDS + 1))) を超過。pro-review-blocked を付与し自動継続を停止します。"

  # terminal state: ラベルを blocked に固定し、review 系の他ラベルを排他的に剥がす
  # apply_review_labels wrapper 経由で _op_run_apply_label_set を呼ぶ (直接 gh pr edit + 握り潰し禁止)
  apply_review_labels "$PR_NUMBER" blocked

  # terminal note を PR に残す (op-merge / 人間判断の手掛かり)
  # 注: review-expert が出す `<!-- op-review-meta -->` とは canonical schema が衝突する
  #     (reviewed_head_sha / reviewed_at / global_review_expert 不在、reviewer が op-run-controller)
  #     ため、controller 側の Review Fix Loop terminal state は **別 marker**
  #     `<!-- op-review-controller-meta -->` で記録する (run 全体の `<!-- op-run-controller-meta -->`
  #     とも別)。詳細 field schema は `_shared/markers/review-markers.md` 参照。
  #     op-merge は op-review-meta の最新値だけを review 判定根拠にする。
  CONTROLLED_AT="$(date -Iseconds)"
  # コメント投稿 (監査ログ、機械は読まない) は警告に留める (ラベル更新は apply_review_labels blocked で完了済み)
  if ! op pr comment "$PR_NUMBER" --body-file - <<NOTE; then
<!-- op-review-controller-meta -->
controller_result: blocked
reason: review_round_over_limit
review_round: ${REVIEW_ROUND}
max_review_fix_rounds: 2
controlled_at: ${CONTROLLED_AT}
controller: op-run

## ⛔ Review Fix Loop 上限超過 (op-run controller terminal state)

\`review_round=${REVIEW_ROUND}\` は許可上限 (\`max_review_fix_rounds + 1 = 3\`) を超過しました。
review-expert spawn は行わず、\`pro-review-blocked\` を付与して自動継続を停止します。
Issue 再設計 / scope 再定義 / 人間判断のいずれかが必要です。
NOTE
    echo "⚠️ PR #${PR_NUMBER} への terminal state コメント投稿が失敗しました (ラベル更新は完了済み)" >&2
  fi

  # state 文書側 (機械正本) にも controller terminal state を記録する (ADR-0027 6b)。
  # write_id は決定的キーのため再送は NO_OP で安全に冪等吸収される。
  CONTROLLER_PAYLOAD=$(jq -n --arg reason "review_round_over_limit" \
    --argjson round "$REVIEW_ROUND" --arg at "$CONTROLLED_AT" \
    '{kind:"controller", value:{controller_result:"blocked", reason:$reason, review_round:$round, controlled_at:$at}}')
  printf '%s' "$CONTROLLER_PAYLOAD" | op review state push --pr "$PR_NUMBER" \
    --apply-json - --write-id "${OP_RUN_SESSION_ID}-terminal" \
    --session "$OP_RUN_SESSION_ID" \
    ${REVIEW_STATE_INPUT_JSON:+--input-json "$REVIEW_STATE_INPUT_JSON"} \
    || echo "⚠️ PR #${PR_NUMBER} への state push (controller terminal) が失敗しました (コメント監査ログは完了済み)" >&2

  # この PR についての本フェーズはここで終了。review-expert spawn には進まない。
  # bash 単独実行ではなく op-run 司令官のループ内 step として扱う前提のため、
  # 当該 PR を review queue から外して次 PR の処理に進む (return / continue 相当)。
  # (司令官は本 block を「terminal controller state」として扱い、4-2 以降の Agent spawn を絶対に行わない)
  REVIEW_TERMINAL=1
else
  REVIEW_TERMINAL=0
fi

# 司令官は REVIEW_TERMINAL=1 のとき、4-2 (review-expert spawn) を実行せずに当該 PR の review フェーズを完了扱いとする。
# 並列で別 PR を review している場合は他 PR の処理は継続する。
if [ "$REVIEW_TERMINAL" = "1" ]; then
  echo "⏭️ PR #${PR_NUMBER}: review_round over limit. Skip review-expert spawn for this PR." >&2

  # ここで現在 PR の review フェーズを終了する。
  # 実装形態に応じて以下のいずれかを使う:
  # - per-PR loop 内なら continue   ← controller bash の標準実行文脈 (per-PR for ループ)
  # - 関数内なら return 0
  # - 単体スクリプトなら exit 0
  #
  # 重要:
  # この分岐後に 4-2 の review-expert Agent spawn へ進んではならない。
  # `|| true` で握り潰さない (上限超過は terminal state であり、失敗を隠すと無限 spawn に戻る)。
  continue
fi
```

実装時は `return` の失敗を `2>/dev/null` と `|| true` で握りつぶしてはならない
(関数外 return は失敗するうえに `|| true` で気づけず、4-2 の spawn まで進む事故が起きる)。
terminal state は **制御フロー**として扱い、当該 PR の 4-2 以降 (review-expert spawn) を
**物理的に実行しない**こと。

**この block は terminal controller state である。** REVIEW_TERMINAL=1 が立った PR について、
司令官は 4-2 以降 (review-expert の Agent spawn) を絶対に実行してはならない。
これは review-expert に「自分の判定で blocked にされる前提の round」を渡さないための物理的 gate でもある。

#### 4-2-pre. terminal blocked の表現方法 (canonical schema を偽造しない)

Review Fix Loop 上限超過時、op-run は **canonical `<!-- op-review-meta -->` を偽造しない**。
review-expert が出していない判定を canonical schema として PR に残すと、op-merge gate /
finding 抽出 (4.5-2-pre) / op-merge stale gate のいずれもが「review-expert が出した判定」と
誤って解釈してしまう。

統一表現:

| 層 | 表現 |
|---|------|
| canonical `<!-- op-review-meta -->` (review-expert が出した最新値) | そのまま残す。`review_result` は **needs-fix / needs-specialist-review のままでよい** (上書きしない) |
| `<!-- op-review-controller-meta -->` (op-run が追記する terminal note) | `controller_result: blocked` / `reason: review_round_over_limit` を記録 |
| label | 排他制御で `pro-review-blocked` を付与し、`pro-reviewed` / `pro-review-needs-fix` / `pro-review-fix-in-progress` / `pro-review-stale` を全 remove |

op-merge 側の解釈:
- gate 5 は「最新 op-review-meta の `review_result == approve`」を要求するため、
  needs-fix のままなら自動 reject される
- gate 1〜2 で `pro-reviewed` 不在 + `pro-review-blocked` 残存により merge を拒否する
- canonical schema は review-expert の判定だけを反映するので、forge 検出の精度が保たれる

これにより、controller の terminal state と review-expert の判定が常に独立に追跡できる。

このようにして算出した `REVIEW_ROUND` を、4-2 の Agent prompt 内に必ず展開する
(`【review_round】${REVIEW_ROUND}` の形で渡す)。

#### 4-2-pre-2. OP_RUN_SESSION_ID の払い出し (controller-only, review-expert spawn 前必須)

/**
 * 機能概要: review-expert spawn 前に op-run controller が OP_RUN_SESSION_ID を必ず確定させる。
 * 作成意図: review-expert / template / PR comment script 側で session id を生成してはならない契約を
 *           controller 起源で物理的に保証し、解体後に責務が割れないようにする。
 * 注意点: 1 回の op-run 実行中は review round をまたいでも同じ id を使い回す。spawn 後の prompt 内
 *         fallback 生成は禁止。controller 未払い出しのまま review-expert spawn に到達したら
 *         fail-fast し、controller 側のバグとして扱う。
 */

```bash
# 既に同 op-run 実行で払い出し済みなら使い回す。未設定なら controller がここで mint する。
if [ -z "${OP_RUN_SESSION_ID:-}" ]; then
  : "${PR_NUMBER:?PR_NUMBER is required to mint OP_RUN_SESSION_ID}"
  : "${PR_HEAD_SHA:?PR_HEAD_SHA must be resolved (4-1) before minting OP_RUN_SESSION_ID}"
  PR_SHORT_SHA="$(printf '%s' "$PR_HEAD_SHA" | cut -c1-8)"
  OP_RUN_SESSION_ID="oprun-$(date -u +%Y%m%dT%H%M%SZ)-pr${PR_NUMBER}-${PR_SHORT_SHA}"
fi

# controller 必須 contract: 空文字 / "unknown" は禁止。review-expert spawn 前に必ず確定していること。
if [ -z "$OP_RUN_SESSION_ID" ] || [ "$OP_RUN_SESSION_ID" = "unknown" ]; then
  echo "❌ OP_RUN_SESSION_ID must be minted by op-run controller before review-expert spawn." >&2
  exit 1
fi

export OP_RUN_SESSION_ID
```

review-expert / template / PR comment script は **OP_RUN_SESSION_ID を生成してはならない**。
spawn 後の prompt / template 内では `:?` の fail-fast guard だけを通し、未設定なら controller 側のバグとして扱う。

**ClusterOrchestrator (cluster-orchestrator-directives.md フェーズ6) が review-expert を Agent tool で spawn する**
(ADR-0016。`op-run-review` Dynamic Workflow は削除済み)。
ClusterOrchestrator は §4-1 / §4-1-b / §4-2-pre / §4-2-pre-2 で確定した値
(review worktree detach path・head SHA / REVIEW_MODEL・REVIEW_MODEL_REASON / REVIEW_ROUND /
OP_RUN_SESSION_ID) を §4-2-a で per-phase models{} に変換して review-expert spawn prompt に注入する。review-expert が PR ごとに
4 phase を実行し、**PR 単位の構造化 review 結果 (verdict + findings[]) を返す**。ClusterOrchestrator は §4-2-b で
op-review-meta / op-review-finding を組み立てて投稿する (workflow は marker を組まない、ADR-0011 決定6)。

> **lens-modular (ADR-0011、ADR-0009 Phase C closeout)**: workflow は PR ごとに
> prep (base-first digest 1 回) → lens-audit (7 lens を別 context で flat 並列調査、sonnet 既定) →
> adversarial-verify (High/Critical finding を同 lens 別インスタンス skeptic で反証、opus) →
> synthesize (opus 最終ゲートが JS 集約 + 権威 verdict + targeted backstop gap-check) の 4 phase を実行する。
> 全 lens worker / refuter / 最終ゲートは review-expert インスタンス・read-only・別 context
> (不変則7 を均一に維持)。調査=sonnet / verify+gate=opus の model 分離は §4-2-a で controller が解決し args 注入する。
> 旧 C1 thin (1 review-expert/PR が 7 lens 内部処理) は本 wave で廃止 (workflows/op-run-review.js v2)。

#### 4-2-a. per-phase model 解決 + review-expert spawn (ClusterOrchestrator)

ClusterOrchestrator は §4-1-b で確定した `REVIEW_MODEL` を per-phase model に変換し、確定済みの値を review-expert spawn prompt に渡す
(cluster-orchestrator-directives.md フェーズ6)。**spawn・別 context 隔離・4 phase 発火・判定集約は review-expert の責務**であり、
ClusterOrchestrator は review-expert の返却から `reviews[]` を §4-2-b の marker 組立と §4-3 のラベル遷移に渡す。

per-phase model 解決 (ADR-0011 決定5 = 調査/ゲート分離):

```bash
# §4-2-a-pre. per-phase model 解決 (ADR-0011 決定5)
# 調査 (prep + 7 lens-audit) は sonnet で広く安く / verify + gate は opus に集中。
# investigate は §4-1-b narrow opt-down の結果 (REVIEW_MODEL) をそのまま使う:
#   - sensitive glob / large PR / --quality high → REVIEW_MODEL=opus → investigate も opus (全 opus)
#   - narrow opt-down 適格 (小・非 sensitive) → REVIEW_MODEL=sonnet → investigate=sonnet
# verify / gate は High/Critical の偽陽性除去 + 権威 verdict + backstop ゆえ常に opus
# (gate-critical を cheap 化して refuter で backstop する設計は採らない = refute は false-positive しか落とせない)。
: "${REVIEW_MODEL:?REVIEW_MODEL must be set — §4-1-b で確定}"

# #720: sensitive doc-only small PR は investigate のみ sonnet に段階下げ (verify/gate は opus 維持)。
# REVIEW_MODEL は opus のまま (escape hatch 互換) なので、ここで investigate phase だけ差し替える。
# SENSITIVE_INVESTIGATE_SONNET の判定は §4-1-b (sensitive ∩ small ∩ 非doc=0 ∩ quality!=high ∩ kill switch 不在 ∩ degrade 不在)。
: "${SENSITIVE_INVESTIGATE_SONNET:?SENSITIVE_INVESTIGATE_SONNET must be set — §4-1-b で確定}"
if [ "$SENSITIVE_INVESTIGATE_SONNET" = "1" ]; then
  export REVIEW_INVESTIGATE_MODEL="sonnet"
else
  export REVIEW_INVESTIGATE_MODEL="$REVIEW_MODEL"
fi
# verify / gate は SENSITIVE_INVESTIGATE_SONNET に関係なく **常に opus 固定** (分岐の外、絶対不変)。
# model-selection.md §7.1.7 / 本ファイル L632「gate-critical を cheap 化して refuter で backstop する設計は採らない」。
export REVIEW_VERIFY_MODEL="opus"
export REVIEW_GATE_MODEL="opus"

# #650: investigate=opus で lens worker が StructuredOutput を非発行 (null) した場合の fallback model。
# investigate=opus のときは sonnet で自動リトライする (verify+gate は opus 維持、sensitivity 担保)。
# investigate=sonnet (narrow opt-down 適格) のときは sonnet 同士のため workflow 側でリトライしない。
# review-expert が models.investigate_fallback を未注入時 "sonnet" をデフォルトとする設計のため、
# 本変数は明示的に渡す推奨。(同一 model になる場合 = investigate=sonnet は workflow 側で安全にスキップされる)
if [ "$REVIEW_INVESTIGATE_MODEL" = "opus" ]; then
  export REVIEW_INVESTIGATE_FALLBACK_MODEL="sonnet"
else
  # investigate が sonnet の場合は同一 model を渡す (workflow が shouldRetryWithFallback=false で skip する)
  export REVIEW_INVESTIGATE_FALLBACK_MODEL="$REVIEW_INVESTIGATE_MODEL"
fi
```

> **#720 investigate sonnet 段階下げ (model 軸であり lens 軸ではない、絶対遵守)**:
> `SENSITIVE_INVESTIGATE_SONNET=1` は **investigate phase の model だけ** を sonnet に下げる。lens floor
> (§4-2-a-pre2 の active lens) は **不変**: sensitive PR は round1 で 7-lens フルを維持する (lens gate は
> `REVIEW_SENSITIVE_TOUCHED` に key するため、investigate model を下げても breadth は full 7-lens のまま)。
> つまり「full 7-lens を sonnet で広く調査し、opus gate が cumulative-diff backstop で見落としを回収する」構図
> (ADR-0011 決定5 の調査/ゲート分離をそのまま sensitive doc-only small に適用)。
> **verify / gate は常に opus 固定** (`REVIEW_VERIFY_MODEL` / `REVIEW_GATE_MODEL` は本フラグの分岐の外、
> model-selection.md §7.1.7)。最大 recall リスク (Security lens の sonnet 見落とし) は doc-only 限定で
> 攻撃面が薄く許容するが、Ladder4 で不足が出たら Security のみ investigate を opus 床へ戻す
> (model-selection.md §7.1.3 が tunable 明記)。

##### 4-2-a-pre2. active lens / bundle 解決 (ADR-0015 proportional lens gating、司令官保持)

司令官は PR の変更規模・リスクから **active lens 構成** (絞った lens 集合 + bundle ペア) を確定し、
ClusterOrchestrator が review-expert spawn 時の prompt に `active_lens_keys` / `lens_bundles` を注入する (cluster-orchestrator-directives.md フェーズ6)。**lens 数の流動化判定は ClusterOrchestrator 側**
(workflow は fs/process/gh 不可で diff 規模を測れない、ADR-0015 constraint 3)。判定の入力は §4-1-b で既に
算出済みの `REVIEW_LOC_COUNT` (除外 glob 適用後の LOC) と `REVIEW_SENSITIVE_TOUCHED` (sensitive glob hit 数)
を **再利用**する (二重計算しない)。op-config の `review.proportional_lens` (§6.2) を読んで enabled / tier 上書きを反映する。

> **lens selection と model selection は別軸** (ADR-0011 決定5 / ADR-0015 constraint 7)。本ブロックは active lens を
> 決めるだけで、model (§4-2-a-pre で確定済み) は変えない。**lens gate は `REVIEW_SENSITIVE_TOUCHED` に key し、
> `REVIEW_MODEL` には依存しない**。**sensitive PR は両方無効**: §4-1-b で `REVIEW_SENSITIVE_TOUCHED != 0` のとき
> model は opus になり、lens も本ブロック先頭分岐で 7-lens フルへ倒れる (両者が `REVIEW_SENSITIVE_TOUCHED` を
> 独立に参照する真の別軸)。non-sensitive medium PR (101-500 LOC) は model=opus (narrow opt-down) でも lens は
> medium tier (reduced) を受ける (Issue #682 で lens の model 結合を除去、constraint 7 を mechanism として充足)。

```bash
# §4-2-a-pre2. active lens / bundle 解決 (ADR-0015、司令官保持)
# 入力は §4-1-b 既算出値の再利用 (二重計算しない): REVIEW_LOC_COUNT / REVIEW_SENSITIVE_TOUCHED
: "${REVIEW_LOC_COUNT:?REVIEW_LOC_COUNT must be set — §4-1-b で確定}"
: "${REVIEW_SENSITIVE_TOUCHED:?REVIEW_SENSITIVE_TOUCHED must be set — §4-1-b で確定}"
: "${PR_NUMBER:?PR_NUMBER must be set — 当該 PR 番号 (medium tier の changed_files 判定に使う)}"

# RVW-004: bash 配列は export 不可で fence を跨げない (不変則4)。§4-1-b の PR_FILES_ARR は
# 本 fence では空になるため、medium tier の UX domain 判定に使う changed_files を本 fence で再取得する。
# 不変則4: 配列は使用前に初期化する。
PR_FILES_ARR=()
mapfile -t PR_FILES_ARR < <(op pr view "$PR_NUMBER" --include files | jq -r '.files[]?')

# RVW-005 / RVW-003 解消: 有効化 / tier 上書きは op-config.yaml または env var override で機能する。
#   op-config.yaml の review.proportional_lens.{enabled,tiers} を読む YAML→env bridge は **配線済**
#   (Issue #723、op model decide-review primitive)。下記 eval で primitive が env > config > ADR-0015 既定の
#   優先順位で解決し、OP_REVIEW_PROPORTIONAL_LENS / OP_REVIEW_SMALL_MAX_LOC / OP_REVIEW_MEDIUM_MAX_LOC を
#   export する。**既存 env var override は config より優先** (既存 bash 意味不変)。primitive が config を
#   読むことで per-project 無効化 (enabled: false → 全 7 lens フル) / tier 上書きが op-config.yaml から効く。
#   primitive が PATH に無い / 失敗した場合 (set -e でない前提) は下行の :-default が ADR-0015 既定で
#   fallback するため、bridge 不在でも従来挙動 (enabled=true / small<=100 / medium<=500) を保つ。
#   --config 省略時は primitive が cwd → 親方向に op-config.yaml を自動探索する。
eval "$(op model decide-review --emit-env 2>/dev/null || true)"
PROP_ENABLED="${OP_REVIEW_PROPORTIONAL_LENS:-true}"   # 無効化退行経路: OP_REVIEW_PROPORTIONAL_LENS=false → 全 7 lens フル
SMALL_MAX_LOC="${OP_REVIEW_SMALL_MAX_LOC:-100}"
MEDIUM_MAX_LOC="${OP_REVIEW_MEDIUM_MAX_LOC:-500}"

# RVW-009: core lens (security / spec / test-regression) は各 tier の REVIEW_ACTIVE_LENS_JSON literal が
#   single source of truth (下記分岐で直書き)。workflow 側 normalizeActiveLensKeys も core を強制合流するため
#   二重安全。以前あった未使用変数 CORE_LENS は JSON literal と drift する種だったため削除した。

# sensitive PR (REVIEW_SENSITIVE_TOUCHED != 0 = §4-1-b の sensitive glob hit / >100 file safety default) または
# proportional 無効 → 7-lens フル単独 (skip/bundle なし)。active_lens_keys / lens_bundles を未注入 (= workflow 既定の全 7 lens) に倒す。
# ★ lens gate は REVIEW_SENSITIVE_TOUCHED に key する (REVIEW_MODEL には依存しない = lens/model 別軸、ADR-0015 constraint 7)。
#   【再結合禁止 / Issue #682】かつて `|| [ "$REVIEW_MODEL" = "opus" ]` を gate に含めていたが、§4-1-b の
#   narrow opt-down が LOC>100 で REVIEW_MODEL=opus にするため medium tier (101-500 LOC) が常に full へ倒れ、
#   medium 分岐 (下記 elif) が到達不能だった。lens を model に結合すると constraint 7 違反 + medium 削減が死ぬため、
#   この gate に REVIEW_MODEL を再び混ぜてはならない。large (>MEDIUM_MAX_LOC) / >100 file は下記 LOC tier /
#   REVIEW_SENSITIVE_TOUCHED で full に倒れるため、model gate は不要。
#
# 【#717 ガード】sensitive force-full は SENSITIVE_DOC_DIFFERENTIAL!=1 のときのみ適用する。
#   SENSITIVE_DOC_DIFFERENTIAL=1 (= no-behavior-change doc-only refactor の round2+、判定は review-fix-loop.md §4.5-5)
#   のときは sensitive 分岐をバイパスし tier 別ロジックへ落とす。これにより round1 は無条件 full 7-lens を死守しつつ
#   (review-fix-loop.md §4.5-5 が REVIEW_ROUND>=2 を必須にする)、round2+ の差分化を解禁する。
#   差分化が解禁された round2+ の active_lens_keys は controller が review-fix-loop.md §4.5-5 の union ロジック
#   (前 round finding lens ∪ fix domain lens ∪ core 3) で確定して args 注入する。初回 round / 未設定は
#   SENSITIVE_DOC_DIFFERENTIAL=0 (sensitive force-full) に安全側で倒れる。
if [ "$PROP_ENABLED" != "true" ] || { [ "$REVIEW_SENSITIVE_TOUCHED" -ne 0 ] && [ "${SENSITIVE_DOC_DIFFERENTIAL:-0}" != "1" ]; }; then
  export REVIEW_ACTIVE_LENS_JSON='[]'    # 空 = workflow が全 7 lens 単独に倒す (退行回避経路 / sensitive フル)
  export REVIEW_LENS_BUNDLES_JSON='[]'
elif [ "$REVIEW_LOC_COUNT" -le "$SMALL_MAX_LOC" ]; then
  # small: core 3 lens 単独 (non-core skip)
  export REVIEW_ACTIVE_LENS_JSON='["security","spec","test-regression"]'
  export REVIEW_LENS_BUNDLES_JSON='[]'
elif [ "$REVIEW_LOC_COUNT" -le "$MEDIUM_MAX_LOC" ]; then
  # medium: core 3 + compatibility+release bundle (+ diff が UX 系 domain を触る場合のみ workflow-ux 単独)。
  # diff が UX domain (frontend / src/components / components / app / *.vue / *.tsx / *.svelte / *.astro 等) を触るかは
  # changed_files から判定する (§4-2-pre の comment 解析と同様。具体 glob は project-profile の UI path に揃える)。
  # components/ / app/ ディレクトリ (パス任意深度) および .svelte / .astro も対象に含める (#722 recall ギャップ修正)。
  REVIEW_UX_TOUCHED=$(printf '%s\n' "${PR_FILES_ARR[@]}" | grep -cE '(^|/)(src/components|src/pages|components|app|frontend)/|\.(vue|tsx|jsx|svelte|astro)$' || true)
  printf '%s' "$REVIEW_UX_TOUCHED" | grep -Eq '^[0-9]+$' || REVIEW_UX_TOUCHED=0
  if [ "$REVIEW_UX_TOUCHED" -ne 0 ]; then
    export REVIEW_ACTIVE_LENS_JSON='["security","spec","test-regression","compatibility","release","workflow-ux"]'
  else
    export REVIEW_ACTIVE_LENS_JSON='["security","spec","test-regression","compatibility","release"]'
  fi
  export REVIEW_LENS_BUNDLES_JSON='[["compatibility","release"]]'
else
  # large (>500 LOC): 7 lens 完全分割 (bundle なし)。全 lens を active に列挙する。
  export REVIEW_ACTIVE_LENS_JSON='["security","workflow-ux","test-regression","compatibility","release","spec","refactor-maintainability"]'
  export REVIEW_LENS_BUNDLES_JSON='[]'
fi
```

> **不変則 (ADR-0015、絶対遵守)**:
> - **core lens (`security`/`spec`/`test-regression`) は全 tier で必須 + 単独維持** (bundle 禁止)。
>   workflow 側 `normalizeActiveLensKeys` も core lens を強制合流するため二重安全。
> - **bundle に `security` を含めない (no-exceptions)**。許可ペアは `compatibility`+`release` /
>   `workflow-ux`+`refactor-maintainability` のみ (最大 2 lens、3 lens 以上禁止)。workflow 側
>   `normalizeLensBundles` も許可ペア表に無いペア / active でない lens / core 含むペアを却下する。
> - **sensitive PR は skip/bundle 無効 = 7-lens フル**。`REVIEW_SENSITIVE_TOUCHED != 0` で本ブロックの先頭分岐で
>   空に倒れる (= workflow が全 7 lens 単独に展開)。lens gate は `REVIEW_MODEL` ではなく `REVIEW_SENSITIVE_TOUCHED`
>   に key する (lens/model 別軸、Issue #682)。
>   **唯一の例外 (#717)**: `SENSITIVE_DOC_DIFFERENTIAL=1` (no-behavior-change doc-only refactor の round2+、
>   判定は `review-fix-loop.md` §4.5-5) のときだけ sensitive force-full をバイパスし、round1 full を死守した上で
>   round2+ を差分化する。round1 (`REVIEW_ROUND=1`) は §4.5-5 のガードにより必ず full 7-lens を維持する。
> - **medium tier (101-500 LOC、non-sensitive) は model=opus でも reduced lens を受ける** (#682 で到達性是正)。
>   medium が skip するのは `refactor-maintainability` (+ UX 非該当時 `workflow-ux`) のみで、これらは opus gate の
>   backstop gap-check が拾う (#674 small-tier Ladder4 で refactor の backstop 捕捉を実証済)。
> - tier 閾値は暫定。実装 PR の **Ladder4 recall 実測 (7-lens フル vs proportional の見落とし差ゼロ)** で校正する。

差分 lens 化 (Fix Loop 2 round 目以降) と carry-over (`carryover_findings`) の算出手順は
`review-fix-loop.md` を参照する (本節は初回 round の lens 構成のみを規定)。

- 全 lens worker / refuter / 最終ゲートは **別 context・独立 (不変則7)。修正・commit・push を行わない**。
  指摘は finding として残し、修正は op-run が specialist expert に再委任する (フェーズ4.5 Review Fix Loop)。
- `review_round` / `op_run_session_id` / `review_model` (→ models{}) / `review_model_reason` /
  `review_wt` (detach checkout) / `review_wt_head_sha` は **司令官が確定して args に注入する**。
  review-expert / workflow はこれらを **生成せず転写のみ** (session_id は ISO8601 由来の確定値、
  空文字 / "unknown" 禁止 = op-merge gate 3i / §4-2-b fail-fast の前提)。
- `review_mode` は §4-2 の判定 (full / light-after-security-postcheck) を PR ごとに渡す。
- op-review-meta / op-review-finding の **公開 field schema は不変**。投稿主体は controller
  (§4-2-b、ADR-0011 決定6)。**機械が読む正本は review-markers.md v2 (ADR-0027 6b) 以降
  `<!-- op-review-state -->` 文書側**であり、comment 投稿は人間向け監査ログに位置づけが変わった。

> **RVW-007 (active_lens_keys / lens_bundles の注入形式、絶対遵守)**: §4-2-a-pre2 の
> `REVIEW_ACTIVE_LENS_JSON` / `REVIEW_LENS_BUNDLES_JSON` は **JSON 配列リテラルを格納した bash 変数**。
> args へは **JSON 配列値として展開して注入する** (`"active_lens_keys": ["security","spec",...]`)。
> **文字列値として二重 quote しない** (`"active_lens_keys": "[\"security\",...]"` は NG)。文字列化すると
> workflow 側 `normalizeArgs` の JSON.parse 後も配列でなく文字列のままになり、`normalizeActiveLensKeys` の
> `Array.isArray(raw)` が false → 全 7 lens に silent 退行し proportional gating の節約が効かなくなる。
> SKILL.md §「フェーズ4」の `active_lens_keys: pr.active_lens_keys` (JS 配列) と同じ「配列値」を渡すこと。

```
// ClusterOrchestrator は §4-1〜§4-2-pre-2 で確定した値を review-expert spawn 時の prompt に渡す (cluster-orchestrator-directives.md フェーズ6)。
// 以下は渡すべき値の契約 (フィールド定義)。ADR-0016 後は Workflow 呼び出しではなく Agent tool での spawn に変わったが、
// フィールド定義はそのまま維持する (op-run-review.js は ADR-0016 で削除済み)。
// prs は review 対象 PR の配列。review_round / session_id / review_model は ClusterOrchestrator が払い出す (必須)。
// 注 (RVW-007): active_lens_keys / lens_bundles は JSON 配列値として注入する (文字列化しない)。
const reviewSpawnArgs = {  // 旧: Workflow({name: "op-run-review", args: {...}}) → ADR-0016 後は review-expert spawn の値の契約として読む
  args: {
    prs: [
      {
        number: PR_NUMBER,                 // 対象 PR 番号
        review_wt: REVIEW_WT,              // §4-1 で controller が detach checkout した review worktree path
        review_wt_head_sha: PR_HEAD_SHA,   // §4-1 で算出した head SHA (reviewed_head_sha の根拠)
        review_mode: REVIEW_MODE,          // §4-2 の判定: "full" | "light-after-security-postcheck"
        // ADR-0015 proportional lens gating (additive)。§4-2-a-pre2 で確定した値を注入する。
        // 空配列 [] は「全 7 lens 単独」= 従来挙動 (退行回避経路 / sensitive PR フル)。
        active_lens_keys: REVIEW_ACTIVE_LENS_JSON,   // §4-2-a-pre2: 絞った active lens (core 必須は workflow 側でも強制)
        lens_bundles: REVIEW_LENS_BUNDLES_JSON,      // §4-2-a-pre2: bundle ペア (最大 2 lens、core/security は不可)
        carryover_findings: [/* §4.5 差分 lens 化 (review-fix-loop.md)。初回 round は空 [] */],
        issues: [/* 当該 PR が close する Issue 番号 */],
      },
      // ... 並列対象の他 PR を同様に列挙する ...
    ],
    review_round: REVIEW_ROUND,                  // §4-2-pre で算出 (number、固定値にしない)
    session_id: OP_RUN_SESSION_ID,               // §4-2-pre-2 で controller が mint (空 / "unknown" 禁止)
    models: {                                    // §4-2-a-pre で解決 (ADR-0011 決定5)
      investigate: REVIEW_INVESTIGATE_MODEL,     // = REVIEW_MODEL (narrow opt-down 結果。sonnet 既定 / sensitive は opus)
      investigate_fallback: REVIEW_INVESTIGATE_FALLBACK_MODEL, // #650: investigate=opus null 時の fallback (sonnet)
      verify: REVIEW_VERIFY_MODEL,               // "opus" (High/Critical refute)
      gate: REVIEW_GATE_MODEL,                   // "opus" (権威 verdict + backstop)
    },
    review_model_reason: REVIEW_MODEL_REASON,    // §4-1-b の判定 reason (op-review-meta model_decision_reason に転写)
  },
};
// review-expert の返却: { review_round, session_id, reviews: [{ verdict, pr_number, review_round, op_run_session_id,
//   review_mode, reviewed_head_sha, review_worktree_head_sha, model_used, model_decision_reason, rationale,
//   findings: [{ id, result, severity, lens(表示形), scope, recommended_fix_expert, requires_post_check,
//                summary, file, evidence, detected_by_lenses, verify_verdict }] }] }
// verdict は approve / needs-fix / needs-specialist-review / blocked のいずれか。
// ClusterOrchestrator は reviews を §4-2-b で marker 化して投稿し、reviews[].verdict を §4-3 の apply_review_labels に渡す。
```

> **lens 7 観点 / verdict 判定 / refute / backstop の methodology は workflow 内 prompt が転写注入する**
> (ADR-0016 で削除済み)。詳細 rubric / review_result 判定 / evidence-policy (base-first / Step -1〜8) /
> sensitive glob / 独立性確保は `~/.claude/skills/expert-review/` skill (review-expert に自動プリロード、
> lens-catalog.md / result-decision.md / evidence-policy.md) が正本。op-review-meta · op-review-finding の
> field schema は `~/.claude/skills/_shared/markers/review-markers.md`、PR comment HEREDOC は
> `~/.claude/skills/_shared/pr-templates.md` を canonical source とする。
> 本ファイルは **司令官保持の確定値 (§4-1〜§4-2-a-pre) と workflow 呼び出し形 + marker 組立 (§4-2-b)** のみを規定する。

#### 4-2-b. controller marker 組立 + Marker Publish Validate + 投稿 (ADR-0011 決定6)

workflow は marker を組まず構造化 `reviews[]` を返す。司令官は PR ごとに **単一 op-review-meta + 連番
op-review-finding** を組み立て、`op core marker-lint --strict` で pass を確認してから `op pr comment` で
**1 回だけ**投稿する (人間向け監査ログ)。lens 並列で agent が分裂しても複数 op-review-meta による
comment の混線を構造排除する。投稿主体が controller 単一になるため `||fallback` で lint を握り潰さない
(block なら投稿を止める、memory `feedback_op_review_meta_reviewer_field_required`)。

> **v2 (ADR-0027 6b)**: op-merge gate 3a-3i/5 の入力は本節のコメント投稿ではなく、
> **`<!-- op-review-state -->` 文書への state push (attempt payload)** になった。
> comment 投稿と state push は両方行う (前者=人間向け監査ログ、後者=機械正本) が、
> 両者は独立した操作であり、comment 投稿の成否は state push の成否に影響しない。

**approve verdict は `op review publish-approval` (Issue #756) に集約する**。approve 時の marker 組立 /
marker-lint 自己検証 / コメント投稿 / `pro-reviewed` 付与 (= 他 review label 除去込みの atomic delta) /
**state push (attempt payload、ADR-0027 6b)** を 1 コマンドが atomic に担うため、controller は CLI を
1 回呼ぶだけにする (bash echo 手組みの drift / 手動補完を構造排除)。
needs-fix / needs-specialist-review / blocked は finding 連番を伴うため従来どおり controller が marker を組み、
コメント投稿後に `op review state push` を明示的に呼ぶ (下記 bash 参照)。

司令官は `Workflow()` 戻り値 `reviewOut.reviews` を一時 JSON ファイル (`REVIEWS_JSON`) に書き出してから本 block を実行する。

```bash
# §4-2-b. controller marker 組立 + Marker Publish Validate + 投稿 (ADR-0011 決定6 / #756 approve atomic 化)
# 司令官は reviewOut.reviews (JSON array) を REVIEWS_JSON が指す一時ファイルに書き出してから実行する。
: "${REVIEWS_JSON:?REVIEWS_JSON must point to a file containing reviewOut.reviews (JSON array)}"

REVIEW_COUNT=$(jq 'length' "$REVIEWS_JSON")
for i in $(seq 0 $((REVIEW_COUNT - 1))); do
  REV=$(jq -c ".[$i]" "$REVIEWS_JSON")
  PR_NUM=$(printf '%s' "$REV" | jq -r '.pr_number')
  VERDICT=$(printf '%s' "$REV" | jq -r '.verdict')
  RV_HEAD_SHA=$(printf '%s' "$REV" | jq -r '.reviewed_head_sha')
  RV_WT_HEAD_SHA=$(printf '%s' "$REV" | jq -r '.review_worktree_head_sha')
  RV_ROUND=$(printf '%s' "$REV" | jq -r '.review_round')
  RV_SESSION=$(printf '%s' "$REV" | jq -r '.op_run_session_id')
  RV_MODEL=$(printf '%s' "$REV" | jq -r '.model_used')
  RV_MODEL_REASON=$(printf '%s' "$REV" | jq -r '.model_decision_reason // "default-opus"')
  RV_RATIONALE=$(printf '%s' "$REV" | jq -r '.rationale // ""')

  # ---- approve path: op review publish-approval に集約 (#756) ----
  # marker 組立 / marker-lint 自己検証 / コメント投稿 / pro-reviewed 付与 (= apply_review_labels 相当の
  # review approve delta) を 1 コマンドが atomic に行う。fail-closed (marker-lint fail で投稿せず非0 exit)。
  # op-run は --source-hint review-comment を使う (op-codev の pr-comment と歴史的使い分け、検証は同一)。
  if [ "$VERDICT" = "approve" ]; then
    op review publish-approval \
      --pr "$PR_NUM" \
      --session "$RV_SESSION" \
      --reviewer review-expert \
      --verdict approve \
      --review-round "$RV_ROUND" \
      --reviewed-head-sha "$RV_HEAD_SHA" \
      --review-worktree-head-sha "$RV_WT_HEAD_SHA" \
      --model-used "$RV_MODEL" \
      --model-decision-reason "$RV_MODEL_REASON" \
      --source-hint review-comment \
      --rationale "$RV_RATIONALE"
    continue
  fi

  # ---- non-approve path: finding 連番を伴うため controller が marker を組む (従来どおり) ----
  # op-review-meta block (header 形式・末尾空行で block 終端、review-markers.md L67-79) +
  # op-review-finding block を連番で出す (inline 形式、review-markers.md L191-205)。
  REVIEW_BODY_FILE=$(mktemp /tmp/op-review-body-XXXXXX.md)
  {
    echo "<!-- op-review-meta -->"
    echo "review_result: ${VERDICT}"
    echo "reviewed_head_sha: ${RV_HEAD_SHA}"
    echo "reviewed_at: $(date -Iseconds)"
    echo "reviewer: review-expert"
    echo "review_round: ${RV_ROUND}"
    echo "max_review_fix_rounds: 2"
    echo "global_review_expert: review-expert"
    echo "review_comment_origin: op-run"
    echo "op_run_session_id: ${RV_SESSION}"
    echo "review_worktree_head_sha: ${RV_WT_HEAD_SHA}"
    echo "model_used: ${RV_MODEL}"
    echo "model_decision_reason: ${RV_MODEL_REASON}"
    echo ""
    echo "## 🤖 review-expert lens-modular global review: ${VERDICT}"
    echo ""
    echo "${RV_RATIONALE}"
    echo ""
    echo "### Findings"
    FCOUNT=$(printf '%s' "$REV" | jq '.findings | length')
    for j in $(seq 0 $((FCOUNT - 1))); do
      F=$(printf '%s' "$REV" | jq -c ".findings[$j]")
      echo ""
      echo "<!-- op-review-finding"
      echo "id: $(printf '%s' "$F" | jq -r '.id')"
      echo "result: $(printf '%s' "$F" | jq -r '.result')"
      echo "severity: $(printf '%s' "$F" | jq -r '.severity')"
      echo "lens: $(printf '%s' "$F" | jq -r '.lens')"
      echo "scope: $(printf '%s' "$F" | jq -r '.scope')"
      echo "recommended_fix_expert: $(printf '%s' "$F" | jq -r '.recommended_fix_expert // "null"')"
      echo "requires_post_check: $(printf '%s' "$F" | jq -r '.requires_post_check // "null"')"
      echo "-->"
      F_SUM=$(printf '%s' "$F" | jq -r '.summary // ""')
      F_FILE=$(printf '%s' "$F" | jq -r '.file // ""')
      echo "${F_SUM}${F_FILE:+ (${F_FILE})}"
    done
    echo ""
    echo "---"
    echo "🤖 review-expert lens-modular global review (op-run、ADR-0011)"
  } > "$REVIEW_BODY_FILE"

  # Marker Publish Validate (publish 前 fail-fast、||fallback 禁止)。decision を jq で pass 確認する。
  LINT_DECISION=$(op core marker-lint --body-file "$REVIEW_BODY_FILE" --source-hint review-comment --strict 2>/dev/null | jq -r '.decision // "error"')
  if [ "$LINT_DECISION" != "pass" ]; then
    echo "❌ PR #${PR_NUM}: op-review-meta/finding の marker-lint が pass しません (decision=${LINT_DECISION})。投稿を中止します。" >&2
    rm -f "$REVIEW_BODY_FILE"
    exit 1
  fi

  op pr comment "$PR_NUM" --body-file "$REVIEW_BODY_FILE"
  rm -f "$REVIEW_BODY_FILE"

  # state push (attempt payload、ADR-0027 6b、機械正本)。write_id は決定的キーで再送 NO_OP 安全。
  # payload は flatten 形式 (attempt の各 field を top-level に置く。value:{} ラッパは
  # CLI (ApplyJsonPayload::Attempt = newtype) が受理しない — 正は review/state.rs。
  # value ラッパを使うのは controller / specialist_review payload のみ)。
  ATTEMPT_PAYLOAD=$(printf '%s' "$REV" | jq -c --arg reviewer "review-expert" --arg at "$(date -Iseconds)" \
    '{kind:"attempt", review_round:.review_round, review_result:.verdict,
      reviewed_head_sha:.reviewed_head_sha, reviewed_at:$at, reviewer:$reviewer,
      review_worktree_head_sha:.review_worktree_head_sha,
      findings:[.findings[]? | {id, result, severity, lens, scope,
        recommended_fix_expert, requires_post_check, summary, file, evidence}]}')
  printf '%s' "$ATTEMPT_PAYLOAD" | op review state push --pr "$PR_NUM" \
    --apply-json - --write-id "${RV_SESSION}-r${RV_ROUND}-attempt" --session "$RV_SESSION" \
    ${REVIEW_STATE_INPUT_JSON:+--input-json "$REVIEW_STATE_INPUT_JSON"} \
    || echo "❌ PR #${PR_NUM}: state push (attempt) が失敗しました。op-merge / Review Fix Loop の入力が更新されません。" >&2

  # ラベル遷移 (§4-3)。verdict を apply_review_labels に渡す。
  apply_review_labels "$PR_NUM" "$VERDICT"
done
```

> **marker 形式の正本同期 (#583 教訓)**: op-review-meta は header 形式 (marker 自己完結行 + 後続 YAML、
> 空行で block 終端)、op-review-finding は inline 形式 (`<!-- op-review-finding` で開き `-->` で閉じる) を厳守する
> (形式取り違えで parser が空 span 化し gate 3a/4/5 が誤 block した教訓)。field 一覧の正本は
> `_shared/markers/review-markers.md`、HEREDOC 実テンプレは `_shared/pr-templates.md` の
> 「op-run: review 結果コメント」節。`op core marker-lint --source-hint review-comment --strict` の
> decision を **jq で pass 確認してから投稿**する (`||fallback` で握り潰さない)。
> §4-3 の `apply_review_labels` は本 §4-2-b 内で **non-approve path のみ** PR ごとに呼ぶ。
> **approve path は `op review publish-approval` (#756) が内部で review approve label delta
> (= pro-reviewed 付与 + 他 review label 除去、`op pr label-transition --target review --result approve` 相当) を
> atomic に適用するため、`apply_review_labels` を別途呼ばない** (二重適用しない)。

### 4-3. レビュー結果の統合 (ラベル遷移)

ラベル遷移 helper (`apply_review_labels`) の完全実装は `references/label-transitions.md` 参照。
**lens-modular (ADR-0011) では `apply_review_labels` は §4-2-b の marker 投稿ループ内で non-approve path のみ
PR ごとに呼ぶ** (workflow 戻り値 `reviews[].verdict` を渡す)。approve path は `op review publish-approval` (#756) が
review approve label delta を内部で atomic 適用するため `apply_review_labels` を呼ばない。
本節は helper 契約の説明に留め、独立した呼び出し site は持たない (§4-2-b と二重に呼ばない)。

```bash
# §4-2-b 内で PR ごとに呼ぶ実装契約 (再掲):
# - 3.5-B (security post-check) 通過 PR では直前に apply_security_post_check_labels も呼んでいる。
# - op pr label-transition 内部で label fetch + delta 計算 + atomic apply + verify を完結させる
#   (pre_fetched_labels 注入 = Issue #405 bridge は不要)。
# - 引数 VERDICT は workflow が返した review_result (approve/needs-fix/needs-specialist-review/blocked)。
# apply_review_labels "$PR_NUM" "$VERDICT"   ← §4-2-b の for ループ内で実行済み
```

> Issue #406 Stage 1 で物理切り出し済み。lens-modular (ADR-0011) で label 呼び出しを §4-2-b に統合。

---
