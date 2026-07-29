<!--
schema_version: 1
last_breaking_change: 2026-07-29
notes: v1 (2026-07-29): ADR-0029 決定2 (Wave B1) — skills/op-codev/SKILL.md 「Review 選択 2:
       review-expert (7-lens)」節 (旧 572-745 行) を byte 保全で移動し新設。内容変更なし
       (lens tier 判定 / review_round 導出 / spawn / publish-approval / needs-fix 処理は
       Wave A2 で現行化済みの内容をそのまま転記)。
-->

<!--
機能概要: op-codev フェーズ3 Step D 後の「Review 選択」で **選択 2 (review-expert 7-lens 自動レビュー)**
         を選んだ場合にのみ実行する重い review フローの詳細手順 (lens tier 判定 → review_round 導出 →
         review-expert spawn → 結果提示 → approve 時の marker/label publish → needs-fix 時の再ループ)。
作成意図: SKILL.md 本文は「毎回・必ず・順序が重要」な主経路に絞る (ADR-0029 決定2)。選択 1 (軽い確認) が
         既定であり、選択 2 は選ばれた時だけ発火する重い分岐 (条件2不成立) のため本文から分離した。
注意点: 本ファイルは **選択 2 を選んだ場合のみ**読む。選択 1 の場合はこのファイルを読む必要はない
         (本文の「#### Review 選択 1: 軽い確認」で完結する)。
         前提変数: 本フローに入る時点で以下が確定していること (本文フェーズ3 Step D で確定済):
           - `PR_NUMBER` — Step D で `gh pr create` して得た PR 番号 (本ファイル内 `${PR_NUMBER:?...}` は
             未設定なら即エラーで停止する fail-fast ガード。フェーズ3 Step D の PR 作成後、URL から
             番号を控えて渡すこと)
           - `BRANCH_NAME` — フェーズ3 開始時に作成した feature branch (push 確認用)
         これらはフェーズ間で bash 変数として自動伝播しない (fence 独立 subshell、CLAUDE.md 「bash fence
         convention」不変則1)。本文を読んだ司令官が値を把握したうえで本ファイルの手順に持ち込むこと。
-->

#### Review 選択 2: review-expert (7-lens)

##### PR 規模 / sensitive 判定 → active lens tier 決定 (spawn 前段判定)

review-expert を spawn する前に、PR の規模と sensitive path 該当有無から
**active lens tier** (small=core 3 lens / large=7 lens) と **investigate model** を決定する。

判定ロジックの正本は `skills/op-run/references/global-review-spawn.md` の以下 2 節:

- **§4-1-b** — narrow opt-down 判定 (LOC/sensitive → `REVIEW_MODEL` / `REVIEW_LOC_COUNT` / `REVIEW_SENSITIVE_TOUCHED` を確定)
- **§4-2-a-pre2** — active lens / bundle 解決 (`REVIEW_SENSITIVE_TOUCHED` + LOC tier → `REVIEW_ACTIVE_LENS_JSON` / `REVIEW_LENS_BUNDLES_JSON` を確定)

op-codev は **§4-1-b と §4-2-a-pre2 の判定ブロックを共有する** (ロジックの複製禁止、Single Canonical Source Rule)。
判定を実施してから `REVIEW_ACTIVE_LENS_JSON` / `REVIEW_MODEL` を確定させ、下記 spawn prompt の
`active_lens_keys` / `models.investigate` に注入すること。

安全弁 (下記は op-run と同一の不変則、必ず守ること):

- **core lens (`security` / `spec` / `test-regression`) は全 tier で必須** — 省略・bundle 禁止
- **sensitive PR は tier 分岐を無効化し 7-lens フル** — `REVIEW_SENSITIVE_TOUCHED != 0` のとき `REVIEW_ACTIVE_LENS_JSON='[]'` (workflow が全 7 lens に展開)
- **lens gate は `REVIEW_SENSITIVE_TOUCHED` に key し `REVIEW_MODEL` には依存しない** (lens/model 別軸、ADR-0015 constraint 7)

##### PR-wide review_round 導出 (spawn 前必須、§4-2-pre 同型)

**review_round の導出正本は `skills/op-run/references/global-review-spawn.md` §4-2-pre** (ADR-0027 6b で
PR コメント走査 (awk) から **`op review state pull` の `<!-- op-review-state -->` body 文書 `attempts[]`** ベースへ
全面移行済み)。op-codev は当該ブロックと同型の算出を行う (ロジックの複製禁止、Single Canonical Source Rule —
lens/model 判定の pointer 方式と同じ方針)。

算出方針 (canonical):
- `PREV_ROUND` = state 文書 `attempts[]` の `review_round` の最大値 (= PR 通算 attempt 総数)
- `REVIEW_ROUND = PREV_ROUND + 1` (新規 attempt)
- state 不在 (初回 review) は `PREV_ROUND=0` → `REVIEW_ROUND=1`

> **設計判断 (canonical、round 算出は head SHA に依存しない)**: round は PR 全体の attempt 通算として扱う。
> fix commit が head SHA を変えるため、head SHA で絞ると PREV_ROUND が毎回リセットされ REVIEW_ROUND が
> 永久に 1 のまま max_review_fix_rounds の安全弁が発火しない致命バグになる。attempt 通算に統一することで
> round 1 → fix → round 2 → round 3 の正しい遷移が成立し、session 跨ぎ / 別 session で fix しても =1 に
> リセットされない。詳細な rationale・reviewed_head_sha の役割分担は global-review-spawn.md §4-2-pre 参照。

```bash
# === PR-wide review_round の導出 (global-review-spawn.md §4-2-pre と同型、ADR-0027 6b: state 文書ベース) ===
# op-codev は op-run の session_id 払い出し機構 (§4-2-pre-2) を通らないが、
# review_round 導出は PR 全体の attempt 通算であり session_id に依存しないため同じロジックを適用する。
: "${PR_NUMBER:?PR_NUMBER must be set before deriving REVIEW_ROUND}"

# state pull: gh channel は fetch 内蔵。mcp channel は直前の fresh search_pull_requests 素材を
# REVIEW_STATE_INPUT_JSON に用意して --input-json で渡す (github-channel.md §4 の実行者責務)。
REVIEW_STATE_JSON=$(op review state pull --pr "$PR_NUMBER" \
  ${REVIEW_STATE_INPUT_JSON:+--input-json "$REVIEW_STATE_INPUT_JSON"})

# round 導出: attempts[].review_round の最大値。state 不在 (初回 review) は 0 → REVIEW_ROUND=1。
PREV_ROUND=$(printf '%s' "$REVIEW_STATE_JSON" \
  | jq '[.details.state.attempts[]?.review_round] | max // 0')

# 数値以外 (パース失敗等) は 0 扱い (= 初回 review) にフォールバック (安全側)
if ! printf '%s' "$PREV_ROUND" | grep -Eq '^[0-9]+$'; then
  PREV_ROUND=0
fi
export REVIEW_ROUND=$((PREV_ROUND + 1))
```

```javascript
// review-expert spawn (proportional lens gating 適用後、REVIEW_ROUND 確定後)
Agent({
  subagent_type: "op-skill:review-expert",
  description: "op-codev review: <PR番号>",
  prompt: `
    invocation_mode: op_managed

    以下の PR を レビューしてください:
    PR: <URL>

    active_lens_keys: <REVIEW_ACTIVE_LENS_JSON>   // §4-2-a-pre2 で確定した値 ([]= 全7lens, ["security","spec","test-regression"]= small tier 等)
    // lens 削減はベストエフォート / recall floor は full 7-lens。honor 契約の正本は expert-review/SKILL.md「op-codev 単一 spawn モードでの active_lens_keys honor 契約」節を参照。
    models: { investigate: "<REVIEW_MODEL>", verify: "opus", gate: "opus" }
    review_round: ${REVIEW_ROUND}                 // §4-2-pre で算出した PR 通算 attempt 番号 (固定値にしない)

    重要: 修正・commit・push は行わないでください。
    review-expert の責務は global review のみです。
    結果を op-review-meta / op-review-finding 形式で返してください。
  `
})
```

review-expert の結果を親に提示し、親が判断する:

```
## review-expert レビュー結果

<op-review-meta の verdict>

### 検出された Finding
<op-review-finding の一覧>

---
どうしますか?
- Finding を修正する場合: 対象 IU の Step B に戻って修正してください
- このままマージする場合: 下記 「approve 時の marker/label publish 手順」を実行してから `/op-merge` を起動してください
```

##### approve / approve_with_followup 時の marker/label publish 手順

review_result が `approve` または `approve_with_followup` の場合、`/op-merge` を起動する前に
以下の手順で `op-review-meta` marker を PR にコメント投稿し、`pro-reviewed` label を付与する。

> **push 責務の不変則 (commit-only / controller-push)**: fix round で feature-expert / debug-expert 等の
> expert を spawn した場合、**expert は commit-only** (push しない) 契約である。publish-approval を呼ぶ前に、
> controller は **`commits_added` が non-empty かつ remote head ≠ local head なら必ず push** してから
> publish-approval を呼ぶこと。push 漏れのまま marker を投稿すると、reviewed_head_sha と remote head が
> 乖離して op-merge の stale gate が block する (#737 / #745 で 2 回再演した手動補完の構造 fix)。
> 確認例: `git rev-parse HEAD` (local) と `op pr view <N> --include meta` の head_sha が一致するまで push する。

op-codev は op-run controller の session_id 払い出し機構を通らないため、以下の形式で生成値を作成し、
`op review publish-approval` (Issue #756) を呼ぶ。本 primitive が marker 組立 / marker-lint 自己検証 /
コメント投稿 / `pro-reviewed` 付与を 1 コマンドで atomic に行う (途中失敗で部分状態を残さない)。
これにより `review_result == approve` 時の marker / label publish は controller が **CLI を 1 回呼ぶだけ**で完了する。

```bash
# Step 1: op_run_session_id を生成する (空だと op-merge gate 3i が block するため必須)
PR_NUMBER=<PR番号>
SHORT_SHA=$(git rev-parse --short HEAD)
SESSION_ID="opcodev-$(date -u +%Y%m%dT%H%M%SZ)-pr${PR_NUMBER}-${SHORT_SHA}"

# Step 2: review-expert 返却 marker から review_round を抽出する (global-review-spawn.md §4-2-b と同型)
# review-expert は spawn prompt の review_round を op-review-meta に転写して返す。
# 下記で返却 marker から RV_ROUND を取り出し publish-approval に渡すことで、
# B 独立 (RV_ROUND 未設定のまま --review-round を省略するいわゆる hollow fix) を防ぐ。
# A (PR-wide 導出) の結果が B に正しく伝搬することを確認する経路である。
RV_ROUND=$(printf '%s' "<review-expert の返却 JSON>" | jq -r '.review_round')
# 念のためフォールバック: review-expert が review_round を返さない場合は REVIEW_ROUND (A の算出値) を使う
if ! printf '%s' "$RV_ROUND" | grep -Eq '^[0-9]+$'; then
  : "${REVIEW_ROUND:?REVIEW_ROUND must be set (§4-2-pre PR-wide derivation)}"
  RV_ROUND="$REVIEW_ROUND"
fi

# Step 3: review approve を atomic に publish する
#   - marker 組立 (op-review-meta header 形式) → marker-lint 自己検証 → コメント投稿 → pro-reviewed 付与 を
#     1 コマンドで実行する。marker-lint fail なら投稿せず非0 exit (fail-closed)。
#   - op-codev は --source-hint pr-comment を明示指定する (op-run の review-comment と異なる。op-review-meta は
#     両 SourceKind とも検証同一だが歴史的使い分けを尊重する)。
#   - --rationale に review-expert の rationale / finding 要約を渡す。
op review publish-approval \
  --pr "$PR_NUMBER" \
  --session "$SESSION_ID" \
  --reviewer review-expert \
  --verdict approve \
  --review-round "$RV_ROUND" \
  --source-hint pr-comment \
  --rationale "<review-expert の rationale / finding 要約をここに記載>"
```

> **gotcha**: `--reviewer review-expert` は op-review-meta の必須フィールドであり、空だと CLI が即 error にする。
> `--session` が空または `unknown` では op-merge gate 3i が block するため、必ず上記の生成値を渡す。
> marker 形式 (header 形式 + 空行で block 終端、#583 教訓) と reviewed_head_sha 解決 (省略時 PR head を 1 fetch)、
> marker-lint 自己検証 (fail なら投稿せず非0 exit) はすべて CLI 内部で担保される。
> review approve publish の手続き正本は `op-run/references/global-review-spawn.md` §4-2-b、
> 公開スキーマは `skills/_shared/markers/review-markers.md` の「`<!-- op-review-meta -->` block schema」節、CLI 仕様は
> `op-tools/docs/specs/review-publish-approval.md`。

##### needs-fix 時の処理

review_result が `needs-fix` の場合は marker/label を publish せず、Step B (fix round) に戻る。
該当 IU の修正を完了してから再び review-expert を spawn する。

再 spawn 前に **必ず上記の PR-wide PREV_ROUND 導出ブロック (`op review state pull`) を再実行**すること。
approve は publish-approval が state 文書へ push する。**non-approve (needs-fix 等) の attempt は
自動では push されない** — 再 spawn 前に op-run の `global-review-spawn.md` §4-2-b 同様、
op-codev controller が `op review state push` で当該 attempt を記録すること (未 push のままだと
`attempts[]` の最大 `review_round` が +1 されず round が停滞する)。push 済みであれば
`REVIEW_ROUND` が自動的にインクリメントされる。
session を跨いで別 session で fix した場合も、PR 全体の state 文書 `attempts[]` を通算するため
`REVIEW_ROUND` は正しく累算される (= セッションをまたいでも 1 にリセットされない)。
`review_round > max_review_fix_rounds + 1` (= 3) になると op-merge でブロックされるため注意。
