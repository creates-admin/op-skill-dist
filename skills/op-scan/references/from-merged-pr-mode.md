<!--
schema_version: 1
last_breaking_change: 2026-07-29
notes: v1 (2026-07-29) — ADR-0029 Wave B1 progressive disclosure: op-scan/SKILL.md 本文から
       `--from-merged-pr` モード詳細節 (Phase -1〜8) を無改変移設した初版 (内容変更なし)。
-->

<!--
機能概要: op-scan `--from-merged-pr` モード (follow-up Issue 半自動起票) の全手順 (Phase -1〜8)。
          plan モード遷移 / PR 状態確認 / trusted PR メタ抽出 / 7 source field 抽出 / fingerprint +
          dedup / enrichment + collision gate / plan file 書き出し / ExitPlanMode 承認 / 起票 /
          trace コメントを集約する。
作成意図: 特殊モード全体 (毎回は通らない経路、plan-mode 主体のフル別経路) のため SKILL.md 本文から
          分離 (ADR-0029 決定2)。
注意点: `--from-merged-pr <PR>` 指定時のみ読む。通常 scan では読まない。Cloud (mcp channel) 非対応
        (冒頭注記参照)。人間 gate = Phase 6 ExitPlanMode 承認は本モードの契約であり省略不可。
        bash fence の変数 (PR_VIEW_JSON / FINDING_DRAFT_FILES / OP_RUN_REPO / PASS_INDICES /
        NEW_ISSUE_NUMS) は本ファイル内の Phase 1→2→3→4→7→8 で受け渡す (供給側と :? / 初期化
        ガードの対応は本ファイル内で完結する)。
-->

# op-scan `--from-merged-pr` モード詳細 (follow-up Issue 半自動起票)

本ファイルは `skills/op-scan/SKILL.md` からの pointer 先 (ADR-0029 Wave B1 分離)。

## `--from-merged-pr` モード詳細 (follow-up Issue 半自動起票)

> **Cloud (mcp channel) 非対応**: 素材 (完了報告 / review-finding marker) は PR コメント内にあり、
> MCP のコメント read は hidden marker を sanitize するため成立しない (`github-channel.md` §6)。
> ローカル (gh channel) で実行すること。fence は fail-closed で停止する。

/**
 * 機能概要: merged PR から残存リスク / review-finding / post-check Notes を抽出し、
 *           enrichment + plan モード承認を経て follow-up Issue を半自動起票するモード。
 * 作成意図: op-run + op-merge 完了後、派生する follow-up Issue を毎回手動起票している
 *           コスト (今回 cycle で #103-#110 の 8 件を Claude が手動起票) を削減する。
 *           Phase A (pr-meta-helpers.md canonical 化) の上に乗る Phase C として設計。
 * 注意点: op-source は現時点で op-scan を流用する。
 *         Phase E (#128) 完了後に `op-scan-from-merged-pr` への切替を別 PR で対応する予定。
 *         §7.5 collision gate は --no-enrichment でも bypass 不可 (silent fork 防止の最重要 contract)。
 */

merged PR から 7 source field を抽出し、plan モード承認後に follow-up Issue を起票する。
`_shared/pr-meta-helpers.md (>=1)` の helper 群を再利用して PR メタを取得し、
`_shared/issue-enrichment.md (>=2)` §7.5 collision gate を必ず通す。

```
/op-scan --from-merged-pr <PR>                    # 単一 PR
/op-scan --from-merged-pr <PR1> <PR2> ...         # 複数 PR (空白区切り)
/op-scan --from-merged-pr --since <ISO8601>       # 指定日時以降の merged PR を batch
/op-scan --from-merged-pr <PR> --dry-run          # 起票せずコマンド表示
/op-scan --from-merged-pr <PR> --no-enrichment    # collision gate のみ、cross-review skip
```

### なぜ別モードか

通常 op-scan は「コードを起点に問題を検出 → 起票」だが、`--from-merged-pr` は
「**merged PR の完了報告 / review-finding / post-check から派生 follow-up を抽出 → 起票**」という
別の情報ソースから起票するフロー。plan モード承認で人間 gate を必ず挟む点で `--from-issue` とも異なる。

### Phase -1: プランモード自動遷移

司令官は本モード起動直後に `EnterPlanMode` tool を呼ぶ。
以降の Phase 0〜5 (環境確認 / PR メタ取得 / follow-up 抽出 / fingerprint / enrichment / plan file 書き出し) が
Claude Code の plan mode 下で進行し、**Edit / Write / Bash の書き込み系が権限機構レベルでブロック**される
(op-plan/SKILL.md フェーズ -1 と同パターン、bundled `/batch` と同方式)。

#### plan mode 状態判定

- `EnterPlanMode` を呼んでユーザーが Yes → plan mode 入りを記録し Phase 0 へ
- ユーザーが No → read-only 規律を SKILL.md 内の指示で守りつつ Phase 0 へ (機能停止しない)
- 既に plan mode に居る場合は no-op として扱われ Phase 0 へ直進 (冪等)

#### plan mode 下での許可 / 禁止操作

| 許可 | 禁止 |
|------|------|
| `Read` / `Grep` / `Glob` (探索) | `op issue create` / `op issue comment` / `op pr comment` 等の write 系 |
| `op pr view` / `op issue view` 等の read-only op CLI コマンド | `Edit` / `Write` / `Bash` 書き込み系 |

### Phase 0: 環境確認 + PR 状態確認

env precondition (git / gh auth) は cwd ローカル前提のため CLI 化対象外。
フェーズ 0-1 の env check (SKILL.md 本体 フェーズ0 上部) と同じ手順を採用し、
失敗時は `--dry-run` で続行できる旨を案内する。

PR 状態の確認は op CLI 経由で行う:

```bash
PR_STATE=$(op pr view "$PR_NUM" --include meta --json | jq -r '.state')
if [ "$PR_STATE" != "MERGED" ]; then
  echo "エラー: PR #${PR_NUM} は ${PR_STATE} 状態です。--from-merged-pr は MERGED PR のみ対象です。" >&2
  echo "open PR / draft PR は対象外 (race condition 防止)。"
  exit 1
fi
```

open PR / draft PR を渡された場合は明示エラーで中断する (race condition 防止)。
内部実装は ADR-0005 の `FetchSession::pull_pr_meta` を 1 fetch で呼ぶ。

`--since <ISO8601>` 指定時は `op pr list-merged --since` で対象 PR を列挙する
(client-side で `mergedAt >= since` filter、内部 `FetchSession::list_merged_prs` を呼ぶ):

```text
op pr list-merged --since "$SINCE" --limit 30 --plain
```

`--limit 30` を明示することで context 爆発を防ぐ (Issue #193)。
大規模 repo で `--since` を省略または古い ISO 日付を指定すると全件取得になる恐れがあるため、
SKILL.md 経路では `--limit 30` を推奨上限値として明示する (30 は gh CLI の default 値を踏襲)。
より多くの PR が必要な場合は `--limit N` を適宜調整する。

`--plain` 明示で 1 行 1 PR 番号の plain mode (shell pipe で `while read` できる)。
default ないし `--json` 明示で `[{number, mergedAt}, ...]` の top-level JSON 配列を返す
(#278 option B で default を JSON envelope に揃えた。`--json` は backwards compat のため残置)。

### Phase 1: trusted PR メタ抽出

`_shared/pr-meta-helpers.md (>=1)` の helper 群を参照して PR メタを取得する。
**helper の実装を本ファイルに duplicate しない** (Single Canonical Source Rule)。

`extract_latest_trusted_review_meta` / `extract_latest_trusted_post_check_meta` /
`get_meta` 等の関数定義は `_shared/pr-meta-helpers.md` § 1〜3 を正本とし、本ファイル
からは関数名で呼び出すだけにとどめる。`TRUSTED_REVIEW_AUTHORS` の default / additive
規約 (§ 1)、`review_meta` / `review_result` / `security_kv` / `security_notes` /
`security_result` / `ux_kv` / `ux_notes` / `ux_result` の取得 (§ 2-3) はすべて pr-meta-helpers.md
を参照する。helper の CLI 化は別 wave で扱い、本 wave では従来通り bash 関数として呼び出す。

PR 本文・全コメント・全 commit body の取得は `op pr view --include body-comments-commits --json`
を 1 fetch で実行する (内部実装は ADR-0005 の `FetchSession::pull_pr_body_with_comments_commits`、
gh_calls 圧縮の core 経路):

```text
PR_VIEW_JSON=$(op pr view "$PR_NUM" --include body-comments-commits --json)
PR_BODY=$(printf '%s' "$PR_VIEW_JSON" | jq -r '.body')
PR_COMMENTS=$(printf '%s' "$PR_VIEW_JSON" | jq -r '[.comments[]? | try .body // .] | join("\n---\n")')
PR_COMMITS=$(printf '%s' "$PR_VIEW_JSON" | jq -r '[.commit_message_bodies[]?] | join("\n---\n")')
```

> `op pr view --include body-comments-commits` は 1 fetch で body / comments[] /
> reviewComments[] / commits[].messageBody を一括取得する。個別 3 fetch する旧 bash
> 実装 (gh pr view を body / comments / commits ごとに 3 回呼ぶ) は `gh_calls` soft
> ceiling 200 を不必要に圧迫するため廃止。

### Phase 2: follow-up source 抽出 (7 field)

以下の 7 source field を PR 本文・コメント・commit body から抽出する。
各 field が空の場合はスキップ (draft を生成しない)。

| Source field | 抽出元 | severity default | domain 推定 |
|--------------|--------|-----------------|------------|
| `recommended_followup_experts[]` | apply 完了報告 (PR 本文 / commit body の完了報告節) | medium | 当該 expert の domain |
| `needs_human_decision` (boundary) | 完了報告 `needs_human_decision` 節 | high | needs_human_decision として apply blocked |
| `needs_human_decision` (scope/behavior) | 同上 | medium | 同上 |
| `proposed_stages[1+]` | commit body `proposed_stages` 節 (staged_refactor の残 Stage) | medium | refactor (staged_refactor 由来) |
| `<!-- op-review-finding -->` scope:new-issue | PR コメントの review-finding block | finding 継承 | finding lens → expert mapping |
| `<!-- op-post-check-meta -->` Notes (PASS_WITH_NOTES) | PR コメントの post-check-meta block | low | post-check expert の domain |
| `assumptions[]` (未解消) / `blocked_actions[]` | 完了報告節 | low | apply expert の domain |
| `## 残存リスク / follow-up` section bullet (Issue #213) | PR 本文 / commit body の自由 markdown section | low | parent PR の `op-domain` (取得不可なら `unknown`) |

> **followup_section 抽出 (Issue #213, #473)**: heading alias `残存リスク` /
> `残存リスク / follow-up` / `残存リスク・follow-up` / `Remaining Risk` /
> `Follow-up` を H2〜H6 の任意 heading level で検出し、直後の bullet list
> (`-` / `*` / `1.`) を 1 hit = 1 bullet で抽出する。
> H2 (`## `) のみでなく H3 (`### `) / H4 (`#### `) 等も対象 (Issue #473 修正)。
> 「なし」「無し」「N/A」「— なし —」「-」のみ等 no-op 表現は 0 hit。severity は決定論で固定 `low`
> (LLM 推定不要)、domain は parent PR の `op-domain` を caller 側で transfer する

#### 抽出手順

7 source field の抽出は `op core extract-pr-markers` を 1 invocation で実行する。
内部実装は pure 関数 `op_core::scan::pr_markers::extract_pr_markers` で、
LLM 解釈ゼロ / 同じ入力なら必ず同じ出力 (決定論)。

```text
# 0. Phase 2 開始前に配列を初期化 (Phase 3 で使用する蓄積バッファ)
FINDING_DRAFT_FILES=()
# OP_RUN_REPO: op-run 経由なら export 済みだが、スタンドアロン実行では未設定のため動的解決
: "${OP_RUN_REPO:=$(git remote get-url origin 2>/dev/null | sed 's|https://github.com/||; s|git@github.com:||; s|\.git$||')}"

# 1. Phase 1 で取得した PR_VIEW_JSON から extract-pr-markers の input 形式を組み立て
EXTRACT_INPUT=$(mktemp /tmp/op-scan-extract-input-XXXXXX.json)
printf '%s' "$PR_VIEW_JSON" | jq '{
  pr_body: .body,
  pr_comment_bodies: .comments,
  commit_message_bodies: .commit_message_bodies
}' > "$EXTRACT_INPUT"

# 2. 7 source field を一括抽出 (--plain で hits 配列のみ stdout)
HITS_JSON=$(op core extract-pr-markers --input-json "$EXTRACT_INPUT" --plain)
rm -f "$EXTRACT_INPUT"

# 3. hits を source_kind 別に処理 (caller が follow-up draft に変換)
# source_kind:
#   recommended_followup_experts / needs_human_decision / proposed_stages /
#   review_finding_new_issue / post_check_notes / assumptions / blocked_actions /
#   followup_section (Issue #213: `## 残存リスク / follow-up` 自由 markdown bullet)
HITS_RFE=$(printf '%s' "$HITS_JSON" | jq -c '[.[] | select(.source_kind == "recommended_followup_experts")]')
HITS_NHD=$(printf '%s' "$HITS_JSON" | jq -c '[.[] | select(.source_kind == "needs_human_decision")]')
HITS_PS=$(printf '%s' "$HITS_JSON"  | jq -c '[.[] | select(.source_kind == "proposed_stages")]')
HITS_RFNI=$(printf '%s' "$HITS_JSON" | jq -c '[.[] | select(.source_kind == "review_finding_new_issue")]')
HITS_PCN=$(printf '%s' "$HITS_JSON" | jq -c '[.[] | select(.source_kind == "post_check_notes")]')
HITS_ASM=$(printf '%s' "$HITS_JSON" | jq -c '[.[] | select(.source_kind == "assumptions")]')
HITS_BA=$(printf '%s' "$HITS_JSON"  | jq -c '[.[] | select(.source_kind == "blocked_actions")]')
HITS_FS=$(printf '%s' "$HITS_JSON"  | jq -c '[.[] | select(.source_kind == "followup_section")]')

# 4. 各 hit を draft JSON ファイルに書き出し、FINDING_DRAFT_FILES に追加
#    (HITS_* を iterate して draft を生成する caller 実装例)
# DRAFT_FILE=$(mktemp /tmp/op-scan-draft-XXXXXX.json)
# printf '%s' "<draft_json>" > "$DRAFT_FILE"
# FINDING_DRAFT_FILES+=("$DRAFT_FILE")
```

> **post-check Notes について**: `post_check_notes` 種別の hit は raw_text が自然文。
> follow-up severity 推定は LLM に委ねるが、`severity:low` + 「LLM 推定」を必ず draft body に明記。
> `post_check_notes` 自体の検出 (PASS_WITH_NOTES marker と notes block の境界) は
> pure 関数で決定論。

> **review_finding 抽出**: `<!-- op-review-finding ... -->` 1 block を 1 hit に変換し、
> `scope: new-issue` を含む block のみ残る (`_shared/markers/review-markers.md` 整合)。

> **proposed_stages 抽出**: `Stage [2-9]` または `stage_[2-9]` を含む block のみ hit
> (Stage 1 のみは通過)。staged_refactor の残 Stage を follow-up 化する。

### Phase 3: fingerprint 生成 + dedup

`_shared/dedup-policy.md (>=3)` の fingerprint 生成規約に従い、各 draft の fingerprint を生成する。
既存 open Issue と重複する draft はスキップし、plan file に「既存 #N と重複」として記録する。

```bash
# --findings-json 一括呼び出し (PR #283 Stage B):
#   N 件の finding draft を 1 invocation で dedup 判定し、gh fetch を N 回 → 1 回に集約する。
#   手本: op scan bulk-group の --findings-json amortize 設計 (SKILL.md §2-1-b) を踏襲。
#
# 注意: N=0 (空配列) のときは op scan dedup は fail-closed にならず decision: pass を返す。
#       controller 側で drafts が空か否かを事前確認し、空なら Phase 3 全体を skip することを推奨。
#
# FINDING_DRAFT_FILES: 各 finding draft の JSON ファイルパスを格納した bash 配列

# 1. 全 draft を JSON 配列化して一時ファイルに保存 (jq -s で配列化)
FINDINGS_JSON_PATH=$(mktemp /tmp/op-scan-findings-XXXXXX.json)
jq -s '.' "${FINDING_DRAFT_FILES[@]}" > "$FINDINGS_JSON_PATH"

# 2. 一括 dedup 判定 (gh fetch 1 回で全件照合)
DEDUP_RESULT=$(op scan dedup \
  --findings-json "$FINDINGS_JSON_PATH" \
  --repo "$OP_RUN_REPO" \
  --json 2>/dev/null)
rm -f "$FINDINGS_JSON_PATH"

# 3. 各 finding の判定結果を index 別に dispatch
#    .details.results[] を iterate し、pass なら PASS_INDICES に記録、block なら plan file に記録
#    PASS_INDICES: dedup を通過した finding の index 配列。Phase 4 で FINDING_DRAFT_FILES[$i] を
#                 取り出すために使用する。
PASS_INDICES=()
RESULTS_COUNT=$(printf '%s' "$DEDUP_RESULT" | jq -r '.details.results | length' 2>/dev/null)
if [ -z "$RESULTS_COUNT" ] || [ "$RESULTS_COUNT" = "null" ]; then
  echo "dedup 取得失敗: 全 finding を fail-closed で block 扱い"
else
  for i in $(seq 0 $(( RESULTS_COUNT - 1 ))); do
    ITEM_DECISION=$(printf '%s' "$DEDUP_RESULT" | jq -r ".details.results[$i].decision" 2>/dev/null)
    ITEM_FINGERPRINT=$(printf '%s' "$DEDUP_RESULT" | jq -r ".details.results[$i].fingerprint" 2>/dev/null)
    case "$ITEM_DECISION" in
      pass)  PASS_INDICES+=("$i") ;;  # Phase 4 対象として index を記録
      block) echo "dedup block[$i] ($ITEM_FINGERPRINT): 既存 Issue と重複 (plan file に記録)" ;;
      *)     echo "dedup 想定外値[$i] ($ITEM_DECISION / $ITEM_FINGERPRINT): fail-closed で block 扱い" ;;
    esac
  done
fi
```

重複判定結果 (finding 単位):
- `pass` → Phase 4 (enrichment) へ進む
- `block` → draft をスキップし、plan file に「既存 Issue と重複 (dedup block)」として記録
- その他 / 取得失敗 → fail-closed で block 扱い (DedupResult は NoMatch / Matched の 2 値のみ、`warn` は存在しない)

### Phase 4: enrichment 呼び出し

Phase 3 の `PASS_INDICES` 配列を使い、dedup を通過した finding のみを enrichment に渡す:

```bash
# PASS_INDICES に記録された index を順に処理し、対応する draft ファイルを enrichment に渡す
for i in "${PASS_INDICES[@]}"; do
  DRAFT_FILE="${FINDING_DRAFT_FILES[$i]}"
  # _shared/issue-enrichment.md (>=2) §3 の input contract に従って enrichment を呼び出す
  # (collision gate は --no-enrichment 時も必須、Phase 5 前に collision_gate.verdict を確認)
done
```

`_shared/issue-enrichment.md (>=2)` §3 の input contract に各 draft を渡す。

**重要**: §7.5 Cross-instance Collision Gate は `--no-enrichment` 指定時でも **bypass 不可**。
これは silent fork 防止の最重要 contract。

`--from-issue` モードと同一の enrichment flag 規約を踏襲する:

- `--no-enrichment` → enrichment 全体を skip するが、collision gate のみは実行する
  (enrichment 全体の skip ≠ collision gate の skip)
- `--strict-enrichment` → block 判定時に対象 draft を起票せず、plan file に
  escalation 記録に回す
- `--with-cross-review` → severity Critical 以下でも cross-review 実行

具体的な enrichment 層への入出力 (UI 影響判定 / Design Plan gate / cross-review 表 /
max_review_loops / collision gate verdict) は `_shared/issue-enrichment.md (>=2)` を
正本として参照する (本ファイルでは再記述しない、Single Canonical Source Rule)。

`collision_gate.verdict` の確認:
- `pass` → Phase 5 へ進む
- `warn` → `collision_gate.similar_issues` を plan file に表示 (ユーザーが Phase 6 承認時に判断)
- `block` → draft を plan file の「起票ブロック」欄に移動し、理由を記録

### Phase 5: plan file 書き出し

`ExitPlanMode` への引き継ぎ前に plan file を書き出す。
path は `~/.claude/plans/op-scan-followup-PR<N>-<YYYYMMDD-HHMMSS>.md`。

plan file 構成 (markdown):

1. ヘッダ「op-scan --from-merged-pr: follow-up 起票予定」 + 対象 PR (番号 / タイトル / 実行日時)
2. サマリテーブル: `# / タイトル / domain / severity / fingerprint / collision (pass/warn/block)`
3. 起票予定 Issue 詳細: 各 draft を `<details><summary>` で folding し、Labels / Body
   (`enriched_issue.body` 全文) を内側に展開
4. スキップ (重複) テーブル: `fingerprint / 既存 Issue`
5. 起票ブロック (collision gate block) テーブル: `fingerprint / 理由`
6. 起票後の実行ステップ (Phase 7 で実施): 承認された draft を `op issue create --body-file`
   で起票 → `op issue comment` で post_create_comments 追加 → 親 PR に trace コメント (optional)

複数 PR batch 時 (10 PR で 30-50 draft になる可能性) は summary table を先頭に置き、
各 draft の詳細を `<details>` タグで folding する。

### Phase 6: ExitPlanMode 承認

司令官は plan file を準備した後 `ExitPlanMode` tool を呼ぶ。ユーザーに以下の承認オプションが提示される:

| 承認オプション | 挙動 |
|---|---|
| **Approve and accept edits** (推奨) | `acceptEdits` モードに遷移し、Phase 7 (gh issue create + trace コメント) が permission prompt なしで進行する |
| Approve and start in auto mode | auto mode でフェーズ 7 を実行 |
| Approve and review each edit manually | `default` モードで Phase 7 に進む |
| **Keep planning with feedback** | plan mode に留まり、フィードバックを受けて plan file を修正後、再度 ExitPlanMode を呼ぶ |

「Approve and accept edits」を推奨として案内する。
人間承認 gate = ExitPlanMode 承認が完了した時点で、後続の起票は permission prompt 不要 (op-plan と同 UX)。

#### EnterPlanMode / ExitPlanMode が利用できない環境

tool が提供されない場合 (古い CLI / 特殊環境) は、plan file を表示してユーザーに
「起票してよいですか? (yes/no)」と対話で確認するフォールバック挙動に切り替える。

### Phase 7: Issue 起票

承認された draft を順に起票する。新規作成系コマンドの並列化禁止 (memory:
gh issue create 並列化事故、2026-05-17) は引き続き守る。1 draft = 1 invocation で
逐次起票する。

各 draft について:

```bash
NEW_ISSUE_NUMS=()  # ループ開始前に初期化 (Phase 8 の trace コメントで全番号を参照)
```

1. `enriched_issue.body` を一時ファイル (例: `mktemp /tmp/op-scan-followup-XXXXXX.md`) に書き出す
2. `op issue create --title <title> --label <csv> --body-file <tmp>` で起票
   - 内部で gh issue create を 1 invocation = 1 FetchSession で呼ぶ
   - stdout に Issue URL を返す (gh CLI 互換)
3. URL から `#NNN` を抽出して `NEW_ISSUE_NUM` を組み立て; `NEW_ISSUE_NUMS+=("$NEW_ISSUE_NUM")`
4. 一時ファイルを削除
5. `post_create_comments` があれば **1 Issue = 1 集約コメント**に束ねて追加投稿 (consolidation 規約
   `issue-enrichment.md §8.2`、個別投稿は spam のため禁止 #643。インライン展開禁止: 日本語/改行が欠損する):
   - `POST_COMMENT_TMP=$(mktemp /tmp/op-scan-post-comment-XXXXXX.md)`
   - `post_create_comments[]` を §8.2 の集約フォーマット (severity/category 別セクション + 冒頭に
     「Critical/High は本文統合済み」明記 + cap 適用時は「他 M 件省略」可視化) で `$POST_COMMENT_TMP` に書き出す
   - `op issue comment "$NEW_ISSUE_NUM" --body-file "$POST_COMMENT_TMP"` (1 回だけ呼ぶ)
   - `rm -f "$POST_COMMENT_TMP"`
   - 空配列なら投稿しない
6. `起票: #${NEW_ISSUE_NUM} - <draft.title>` を stdout に表示

hidden marker (Issue 本文冒頭に必ず埋め込む):

```markdown
<!-- op-fingerprint: <domain>:<normalized_title>:<primary_file>:<symbol> -->
<!-- op-source: op-scan-from-merged-pr -->
<!-- op-mode: from-merged-pr -->
<!-- op-derived-from: #<PR_NUM> -->
<!-- op-domain: <debug | refactor | optimize | security | ux-ui | design | test | feature> -->
<!-- op-scan-expert: <検出した expert agent 名> -->
<!-- op-run-expert: <apply 担当 expert (recommended_runner を転写)> -->
<!-- op-post-check-expert: <ux-ui-audit-expert | security-expert | null> -->
```

> `op-domain` 値の domain 列挙・expert マッピング詳細は `skills/op-scan/references/routing-and-marker-reference.md` §domain → marker パターン表 を参照。

> `op-scan-expert` の値は source_kind から推定する: `review-finding` → `review-expert`、`security post-check` → `security-expert`、`needs_human_decision` → 元 Issue の `op-run-expert` を参照。

> `op-post-check-expert` の null 出力義務は SKILL.md 本体 フェーズ4 § `必須 marker (全 Issue 共通)` を参照。

> **op-source の注意**: 現時点では `op-scan` を流用する。Phase E (#128) で
> `labels-and-markers.md` に `op-scan-from-merged-pr` が追加された後、
> 別 PR で `op-scan-from-merged-pr` へ切り替える。

ラベル:
- `auto-report` (op-run が拾う)
- `derived-from-pr` (merged PR 由来であることを示す)
- `severity:<medium|high|low>` (source field の default に従う)
- domain label (例: `pro-refactor-expert`)

### Phase 8: 完了報告 + 親 PR trace コメント

```
## op-scan --from-merged-pr 完了

### 対象 PR
- PR: #<N> "<PR タイトル>"

### 抽出 source
- recommended_followup_experts: <N> 件
- needs_human_decision: <N> 件
- proposed_stages[1+]: <N> 件
- review-finding (scope:new-issue): <N> 件
- post-check Notes (PASS_WITH_NOTES): <N> 件
- assumptions[] / blocked_actions[]: <N> 件

### 起票結果
| # | Issue | severity | fingerprint |
|---|-------|---------|-------------|
| 1 | #<M> "<タイトル>" | medium | <fingerprint> |
| 2 | #<M+1> "<タイトル>" | high | <fingerprint> |

### スキップ (重複)
- fingerprint <X>: 既存 #<K> と重複

### 起票ブロック
- fingerprint <Y>: collision gate block (理由: ...)

次は `/op-run` で起票した Issue を実装可能です。
```

親 PR への trace コメント (optional、`--no-trace` で skip 可):

trace コメント本文 (起票した follow-up Issue 一覧 + skip / block 件数) を一時ファイルに書き出し、
`op pr comment "$PR_NUM" --body-file "<tmp>"` で投稿する。`op pr comment` は内部で
`gh pr comment` を 1 invocation = 1 FetchSession で呼ぶ。本文テンプレ:

> ## op-scan --from-merged-pr: follow-up Issue 起票完了
>
> 起票した follow-up Issue:
> $(for n in "${NEW_ISSUE_NUMS[@]}"; do echo "> - #$n"; done)
> (0 件の場合はこの行なし)
>
> スキップ (重複): N 件
> ブロック (collision gate): N 件

### `--from-merged-pr` 時の注意

- **MERGED 必須**: open / draft PR を渡されたら明示エラーで中断 (race condition 防止)
- **collision gate は `--no-enrichment` でも bypass 不可**: enrichment 全体の skip ≠ collision gate の skip (silent fork 防止の最重要 contract)
- **post-check Notes は LLM 推定**: 自然文 parse のため非決定的。severity:low + 「LLM 推定」を draft body に明記
- **op-source は op-scan を流用**: Phase E (#128) 完了後に `op-scan-from-merged-pr` へ切替予定 (別 PR で対応)
- **plan file は batch で大量になる可能性**: summary table + details folding の二段構成で肥大を防ぐ
- **親 PR への trace コメントは optional**: `--no-trace` で skip 可。trace が不要な場合は Phase 8 末尾のコメント投稿を省略
