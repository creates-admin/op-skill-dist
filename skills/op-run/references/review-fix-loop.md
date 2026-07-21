## フェーズ4.5: Review Fix / Specialist Decision Loop (op-run 制御)

review_result によって処理を分ける。

| review_result | op-run の動作 |
|---|---|
| `needs-fix` | finding を apply expert に再委任して同一 PR 上で修正する |
| `needs-specialist-review` | まず specialist reviewer に finding の妥当性 / 影響範囲 / same-pr 可否を判断させる。**即 apply しない** |
| `blocked` | 自動継続しない |
| `approve` | op-merge gate へ。残存 Low/Medium は severity-aware floor で approve に収束し merge を妨げない (findings[] への記録はなし。notes 記録機能は review-markers.md schema bump が必要で別 Issue 扱い)。High/Critical finding は approve と共存しない (severity-aware floor により構造的に排除、#654) |

review-expert は修正しない。
needs-specialist-review は **apply 指示ではなく、専門判断 handoff** である
(specialist が `same-pr-fixable` を返した場合のみ apply expert に再委任する)。

### 4.5-1. round 上限管理

```text
max_review_fix_rounds: 2
```

review_round と fix_round は分けて扱う:

```text
review_round 1 = 初回 review
review_round 2 = 1 回目の fix 後 re-review
review_round 3 = 2 回目の fix 後 final re-review (最終許可 round)

fix_round = review_round - 1
許可: review_round <= max_review_fix_rounds + 1 (= 3)
```

`<!-- op-review-meta -->` の `review_round` と `review_result` を組み合わせて以下のように
**全体の loop continuation 可否**を判定する (round 上限と blocked 早期停止のみ):

| 状況 | op-run の動作 |
|------|--------------|
| review_result = approve | merge gate へ。round に関わらず受理 |
| review_result = blocked | 自動継続しない。`pro-review-blocked` |
| review_result ∈ {needs-fix, needs-specialist-review} かつ review_round < max_review_fix_rounds + 1 | 4.5-1A の **finding.result 主語の状態遷移**へ進む |
| review_result ∈ {needs-fix, needs-specialist-review} かつ review_round >= max_review_fix_rounds + 1 (= 3) | **3 回目の fix は実行しない**。op-run 側で `<!-- op-review-controller-meta -->` に `controller_result: blocked` を記録し、`pro-review-blocked` を付与する。**canonical `<!-- op-review-meta -->` は review-expert が出した値のまま上書きしない** (4-2-pre と同じ表現方針)。詳細は 4-2-pre「terminal blocked の表現方法 (canonical schema を偽造しない)」節を参照 |
| review_round が max_review_fix_rounds + 1 を超えて spawn された (規定外) | 即 blocked (4-2-pre の bash gate で停止) |

3 回目以降の自動 fix は scope creep / 設計問題のサイン。Issue 分割や scope 再定義を人間判断で行う。

> **重要 (mixed finding の主語)**: 本テーブルは「全体 review_result」の集約値を見て **loop を回すか / 止めるか** だけを決める。
> apply / handoff の dispatch は **必ず finding 単位の `result` を主語にする** (4.5-1A)。
> 全体 review_result は集約値 (`blocked > needs-specialist-review > needs-fix > approve`) なので、
> 例えば `review_result = needs-specialist-review` でも内訳に `needs-fix` の finding が含まれることは多い。
> その needs-fix finding を 4.5-2A の specialist handoff に流すと **不要な review-only spawn** になり、
> 逆に needs-specialist-review finding を 4.5-2 の apply path に直接流すと **specialist 未経由の即 apply**
> という重大な契約違反になる。両方とも finding.result を主語にしていれば構造的に防げる。

### 4.5-1A. finding.result 主語の状態遷移 (mixed finding 必須フロー)

`$REVIEW_FINDINGS` (4.5-2-pre / 4.5-2-pre-2 で抽出済み) の各 finding を 1 件ずつ評価する。
**全体 review_result ではなく、finding 単位の `result` を分岐の主語**にする。

```text
Step 1. blocked 早期停止
  - finding.result = blocked が 1 件でもあれば、Review Fix Loop は打ち切り
  - `pro-review-blocked` を付与し、本ラウンドでの apply / specialist handoff を行わない
  - 残りの needs-fix / needs-specialist-review finding は **保留** (人間判断後に再開判断)

Step 2. specialist handoff フェーズ (needs-specialist-review finding を先行処理)
  - finding.result = needs-specialist-review の finding **のみ** を 4.5-2A の specialist handoff に回す
  - finding.result = needs-fix の finding はこの段階では apply しない (一旦保留)
    理由: specialist 判断で `new-issue` / `blocked` が出ると本 PR の scope が変わる可能性があり、
          先行 apply すると revert / re-fix が必要になる
  - specialist 結果は <!-- op-specialist-review-meta --> block で PR コメントに集約される
  - 全 needs-specialist-review finding の specialist 判断が出揃うまで Step 3 に進まない

Step 3. apply batch 構築 (specialist 完了後)
  Step 2 の specialist_result を見て finding を 3 つの bucket に分類する:

  | bucket | 含まれる finding | 本ラウンドの扱い |
  |--------|------------------|----------------|
  | apply 対象 | finding.result = needs-fix (Step 2 で保留) ∪ specialist_result = same-pr-fixable | 4.5-2 の apply path に集約して投入 |
  | new-issue 化 | specialist_result = new-issue | 別 Issue を起票し、本 PR では fix しない (verification は通す) |
  | blocked | specialist_result = blocked | `pro-review-blocked` を付与し、本ラウンドの自動継続を停止 |

  - blocked bucket が 1 件でもあれば、apply bucket の処理も止めて Step 1 と同じ blocked 扱いに倒す
    (一部だけ apply して merge gate に進めると、blocked finding が未処理のまま残る事故を防ぐ)
  - new-issue bucket のみで blocked がない場合は、apply bucket をまとめて 4.5-2 へ送る

Step 4. apply 実行 (4.5-2 / 4.5-4 の通常フロー)
  apply bucket に積まれた finding を、判定優先順位 1-8 (4.5-2) で expert ごとにグルーピングし、
  4.5-4 の再 verification → 再 post-check → 再 review に流す。
```

> **契約**: Step 2 を飛ばして needs-specialist-review finding を 4.5-2 に直接流すのは禁止。
> Step 1 の blocked を無視して apply / handoff を続けるのも禁止。
> Step 3 の bucket 分類は **specialist 判断が全件出揃った後**に行う (途中段階での部分 apply 禁止)。

### 4.5-2. needs-fix finding の解析と apply expert 決定

> **適用範囲 (必読・guard)**:
> 本節 4.5-2 は **finding.result を主語にした 4.5-1A Step 4 の apply bucket** にのみ適用する。
> apply bucket に入る finding:
> - finding.result = needs-fix (4.5-1A Step 2 で保留されたもの)
> - specialist_result = same-pr-fixable (4.5-2A 経由で同 PR 修正可と判断されたもの)
>
> **finding.result = needs-specialist-review の finding を本節で直接 apply target にしてはならない。**
> needs-specialist-review は必ず先に **4.5-2A の specialist handoff** を通し、
> specialist_result が same-pr-fixable のときだけ本節 4.5-2 へ戻る。
> finding.result = blocked の finding も本節では扱わない (4.5-1A Step 1 で打ち切り)。

op-run は PR コメントから `<!-- op-review-finding -->` block を取得するが、**取得対象を最新の有効
review コメント 1 件に厳格に限定する**。古い round / 別 SHA に対する finding は別 review
session のものなので、現在の Review Fix Loop の入力にしてはいけない。

#### 4.5-2-pre. finding 抽出の限定条件 (必須・forge / stale 両防止)

以下の **8 条件を AND** で満たす **唯一の PR comment 1 件** を抽出し、その comment 内の
`<!-- op-review-finding -->` block だけを再委任の入力にする。**op-merge final gate (gate 3a〜3i)
と同じ信頼境界を Review Fix Loop の入口でも揃え、final gate で落ちる review comment から
finding を拾わないようにする**。

```text
1. comment の author が trusted reviewer に含まれる
   (TRUSTED_REVIEW_AUTHORS = OP bot / repo owner / 4-2-pre と同じ集合)
2. comment 本文に <!-- op-review-meta --> block を含む
3. その op-review-meta の reviewer == "review-expert"
4. その op-review-meta の global_review_expert == "review-expert"
5. その op-review-meta の reviewed_head_sha == 現在の PR head SHA
   (current_head と異なる = stale review なので Review Fix Loop の入力に使わない)
6. trusted author の review-expert コメント群の中で review_round が最大
   (= 現行の最新 review session)
7. その op-review-meta の review_comment_origin == "op-run"
   (Direct Mode の <!-- op-review-report --> や OP 管理外の review コメントを排除。
    op-merge gate 3h と対称な強制)
8. その op-review-meta の op_run_session_id が non-empty かつ "unknown" 以外
   (op-run controller が払い出した実 session id を持つコメントだけを採用。
    op-merge gate 3i と対称な強制)
```

複数 candidate がある場合は createdAt 昇順で最後のものを採用する
(同一 review session 内で複数コメントが立った場合に最新を取る)。

```bash
# TRUSTED_REVIEW_AUTHORS / TRUSTED_AUTHORS_JSON はフェーズ4-2-pre で初期化済み。
# Review Fix Loop は同一 controller プロセスから連続実行されるため変数はそのまま参照可能。
# (フェーズ4.5-2-pre のみ単独実行する場合は、フェーズ4-2-pre の初期化 bash block を先に実行すること。
#  再定義が必要な場合は フェーズ4-2-pre (L1701-1705) の bash block を参照)

CURRENT_HEAD_SHA=$(op pr view "$PR_NUMBER" --include meta | jq -r '.head_ref_oid')

# 1) trusted author + op-review-meta を含む comment を時系列で取得
# 2) 各 comment 内の review-meta から reviewer / global_review_expert / reviewed_head_sha /
#    review_round / review_comment_origin / op_run_session_id を抜く
# 3) 3〜5 / 7 / 8 条件 (reviewer / global_review_expert / reviewed_head_sha /
#    review_comment_origin == "op-run" / op_run_session_id 充足) を AND で満たす
#    comment 群の中で review_round 最大かつ createdAt 最後を選ぶ
#    (op-merge gate 3h/3i と対称な信頼境界)
# trusted author フィルタ (author_login) / 時系列 sort (created_at) は op pr view --include
# body-comments-commits の comment_details envelope (body + author_login + created_at、#579/#635) を使う。
LATEST_REVIEW_COMMENT_BODY=$(
  op pr view "$PR_NUMBER" --include body-comments-commits |
  jq -r --argjson allowed "$TRUSTED_AUTHORS_JSON" --arg head "$CURRENT_HEAD_SHA" '
    [
      (.comment_details // [])[]
      | select(.author_login as $a | $allowed | index($a))
      | select(.body | contains("<!-- op-review-meta -->"))
      | . as $c
      | (($c.body
          | capture("<!-- op-review-meta -->\\s*(?<m>[\\s\\S]*?)(\\n\\s*\\n|\\n<!--|$)")?
        ) // {m: ""}) as $meta
      | {
          body: $c.body,
          createdAt: $c.created_at,
          reviewer: (
            ($meta.m | capture("(?m)^reviewer:\\s*(?<v>\\S+)")?) // {v:""}
            | .v
          ),
          global_review_expert: (
            ($meta.m | capture("(?m)^global_review_expert:\\s*(?<v>\\S+)")?) // {v:""}
            | .v
          ),
          reviewed_head_sha: (
            ($meta.m | capture("(?m)^reviewed_head_sha:\\s*(?<v>[0-9a-f]+)")?) // {v:""}
            | .v
          ),
          review_round: (
            (($meta.m | capture("(?m)^review_round:\\s*(?<v>[0-9]+)")?) // {v:"0"})
            | .v
            | tonumber
          ),
          review_comment_origin: (
            ($meta.m | capture("(?m)^review_comment_origin:\\s*(?<v>\\S+)")?) // {v:""}
            | .v
          ),
          op_run_session_id: (
            ($meta.m | capture("(?m)^op_run_session_id:\\s*(?<v>\\S+)")?) // {v:""}
            | .v
          )
        }
    ]
    | map(select(
        .reviewer == "review-expert"
        and .global_review_expert == "review-expert"
        and .reviewed_head_sha == $head
        and .review_comment_origin == "op-run"
        and (.op_run_session_id | length > 0)
        and .op_run_session_id != "unknown"
      ))
    | sort_by(.review_round, .createdAt)
    | last
    | .body // empty
  '
)

if [ -z "$LATEST_REVIEW_COMMENT_BODY" ]; then
  echo "⚠️  最新 trusted review comment が見つかりません (current head=${CURRENT_HEAD_SHA:0:7})。" >&2
  echo "   stale review (reviewed_head_sha != current head) しかない場合は再 review が必要です。" >&2
  echo "   また op-merge gate 3h/3i と同じく review_comment_origin == \"op-run\" と op_run_session_id 充足 (non-empty かつ \"unknown\" 以外) を要求します。" >&2
  # 通常はフェーズ4 の re-spawn ループで解消されるため、本フェーズ4.5-2 に進まない
  return 1 2>/dev/null || exit 1
fi

# この comment 内の op-review-finding block 群と「閉じタグ後の本文」を
# 再委任の入力にする。本文 (【問題】/【根拠】/【推奨方針】) は header block の外側に
# 書かれているため、`-->` で打ち切ると apply expert / specialist に渡る情報が空になる
# (= "何を、どこで、なぜ、どう直すか" が失われる)。
#
# 1 finding の範囲:
#   - `<!-- op-review-finding` 行から開始
#   - 次の `<!-- op-review-finding` の直前まで
#   - または `## ` 見出し / `---` 単独行 (水平線) / EOF まで
# 各 finding の終端には `---OP-FINDING-SEPARATOR---` 行を挿入し、後続パイプラインで
# finding 単位に分割できるようにする (id をキーに dispatch 用 dict 化する用途)。
#
# 他コメントの finding (古い round / 別 SHA / 別 session) は 4.5-2-pre のフィルタで
# 既に除外済み。本 awk は LATEST_REVIEW_COMMENT_BODY に対してのみ動作する前提。
REVIEW_FINDINGS=$(printf '%s\n' "$LATEST_REVIEW_COMMENT_BODY" \
  | awk '
      BEGIN { in_finding=0; first=1 }
      /^<!-- op-review-finding/ {
        if (in_finding && !first) print "---OP-FINDING-SEPARATOR---"
        in_finding=1; first=0
        print
        next
      }
      in_finding && /^## / { in_finding=0; next }
      in_finding && /^---[[:space:]]*$/ { in_finding=0; next }
      in_finding { print }
      END { if (in_finding && !first) print "---OP-FINDING-SEPARATOR---" }
    ')
```

> **重要**: 上記で抽出した `$REVIEW_FINDINGS` のみが本 Review Fix Loop の正規入力。
> 別 PR コメントに残っている古い finding は **読まない / 拾わない**。
> stale review session の指摘を現在 round に持ち越すと、修正済み issue を再修正させる
> 無限ループ / 別観点 finding の混線が起きる。

#### 4.5-2-pre-2. dispatch 用メタと handoff 用本文の分離 (必須)

`$REVIEW_FINDINGS` から下流で使う情報は **2 系統に分けて扱う**。同じ finding でも、
op-run の dispatch 判定と apply expert / specialist の handoff prompt では必要な粒度が
違うため、混ぜると「ヘッダだけ拾って本文を捨てる」「prompt が冗長すぎて lens が薄まる」
の両方の事故が起きる。

```text
dispatch 用 (op-run の判定優先順位 1-8 / fallback / round 制御で参照):
- id
- result
- severity
- lens
- scope
- recommended_fix_expert
- requires_post_check

handoff prompt 用 (apply expert / specialist の入力に丸ごと貼る):
- finding 全体 (header block + 【問題】+ 【根拠】+ 【推奨方針】)
```

finding 単位の取り出しは awk の RS を使うのが最短:

```bash
# id ごとの dispatch メタ取得 (header だけ見ればよいケース)
finding_meta_for_id() {
  local target_id="$1"
  printf '%s\n' "$REVIEW_FINDINGS" \
    | awk -v RS="---OP-FINDING-SEPARATOR---" -v target="$target_id" '
        $0 ~ "(^|\\n)id:[[:space:]]*"target"([[:space:]]|$)" { print; exit }
      ' \
    | awk '/<!-- op-review-finding/,/-->/'
}

# id ごとの handoff 本文取得 (apply / specialist prompt にそのまま渡す)
finding_full_for_id() {
  local target_id="$1"
  printf '%s\n' "$REVIEW_FINDINGS" \
    | awk -v RS="---OP-FINDING-SEPARATOR---" -v target="$target_id" '
        $0 ~ "(^|\\n)id:[[:space:]]*"target"([[:space:]]|$)" { print; exit }
      '
}
```

apply expert / specialist を spawn する際は `finding_full_for_id "$RVW_ID"` の出力を
prompt に貼り、dispatch 判定 (recommended_fix_expert / requires_post_check 等) は
`finding_meta_for_id "$RVW_ID"` をパースして使う。

#### 4.5-2. 再委任先 expert の決定 (op-run の判定優先順位 1-8)

抽出した `$REVIEW_FINDINGS` 内の各 finding について、以下の優先順位で再委任先 expert を決定する。

```text
1. Issue / PR の scope_in / scope_out
2. 変更ファイルのドメイン (src-tauri/** / frontend/** / migrations/** / tests/** など)
3. finding の lens (Security/Abuse, Workflow/UX, Test, Compatibility, Release, Spec, Refactor)
4. failure mode / 失敗種別
5. required post-check (修正後に必要となる post-check expert と整合する apply expert を選ぶ)
6. review-expert の recommended_fix_expert (参考情報として参照)
7. ownership / 直前に修正した expert
8. 不明な場合は needs-specialist-review または blocked
```

判定例:

```text
- review-expert が feature-expert を推奨していても、対象が src-tauri/** の
  file IO / permission / IPC なら security-expert を優先する。
- UI 表示崩れでも、design token / component aesthetics なら designer-expert、
  状態復帰 / error flow / a11y 実装なら feature-expert を選ぶ (apply target には feature-expert)。
- テスト不足でも、仕様不明確なら test-expert ではなく spec-expert に先に回す。
```

#### 4.5-2-guard. apply target にできない expert (固定ルール)

判定優先順位 1-8 の結果、以下の expert は **apply target にしてはならない**。
review-expert の `recommended_fix_expert` がこれらを含んでいた場合でも、op-run は別 expert に置き換える。

| expert | 理由 | UI/UX 系 finding 時の置換先 |
|--------|------|---------------------------|
| `ux-ui-audit-expert` | 検出 + post-check 専任、apply を持たない | visual / component / token / layout → `designer-expert` / state / recovery / flow / a11y 実装 → `feature-expert` |
| `review-expert` | 監査専任、self-review 防止 | 判定優先順位 1-8 で再決定 (lens / file domain / failure mode から) |

UI/UX 系 finding に対する標準対応:

```text
finding の中身                                      | apply (recommended_fix_expert) | requires_post_check
visual / component / design token / layout pattern  | designer-expert                | ux-ui-audit-expert
state / recovery / flow / accessibility 実装         | feature-expert                 | ux-ui-audit-expert
```

`recommended_fix_expert` の null 許容範囲 (canonical schema は
`~/.claude/skills/_shared/pr-templates.md` 「review finding block」節および
`expert-review/references/finding-schema.md` 「null 許容範囲」節を参照):

| finding.result | null 許容 | op-run の扱い |
|----------------|----------|--------------|
| `needs-fix` | **不可** | 4.5-2 の apply path に直行。null が来た場合は dispatch 不能 → 即 needs-specialist-review に倒す |
| `needs-specialist-review` | **不可** | 4.5-2A の specialist reviewer 候補として参照する。null が来た場合は判定優先順位 1-8 で specialist を再決定 |
| `blocked` | **許容** | 4.5-1A Step 1 で打ち切るため、apply target は本ラウンドでは使わない。null でも判断材料があれば人間判断時の参考になる |

`review-expert` / `ux-ui-audit-expert` は **どの result でも apply target に指定不可**
(self-review 防止 / ux-ui-audit-expert は post-check 専任)。
「再 audit のみで済む / 実装変更不要」と判断したものはそもそも finding に出さず、post-check 再実行案件として
op-run が `requires_post_check` 単独で再 spawn する (review-expert の finding には残さない)。

`requires_post_check: ux-ui-audit-expert` と `recommended_fix_expert` は **独立に決める**。
「直す担当 = designer-expert / feature-expert」「再確認担当 = ux-ui-audit-expert」を切り分ける契約。

#### 4.5-2-fallback. planned expert の自動 fallback (必須)

review-expert が `recommended_fix_expert` に planned expert (= 未実装 expert) を指定してくることがある。
op-run は **spawn 前に必ず installed check を行い、未実装なら active expert に置き換える**。
これにより「存在しない expert を spawn してエラー停止」という事故を防ぐ。

> **canonical fallback contract は 1-2-d Active Apply Expert Normalization に集約する**:
> 本節は固有の fallback table を持たず、1-2-d の `normalize_to_active_apply_expert(...)` /
> 「Resolved → Runtime 正規化表」を再利用する。planned expert lifecycle の正本は
> `~/.claude/skills/_shared/planned-experts.md`、active expert 一覧の正本は
> `~/.claude/skills/_shared/active-expert-registry.md`。
> 1-2-d / 正本側と矛盾する fallback を本節で定義してはならない。
> 主題判定 (build / packaging failure / config 構造 / release 方針 / spec ambiguity 等) も
> 1-2-d と同じ判定軸で行う (Issue 主題 + finding context + labels)。

> **`release-expert` は fallback destination として禁止**。`compatibility-expert` / `env-expert` の
> fallback 先として `release-expert` を使うことも禁止。詳細は 1-2-d 「release-expert と誤分類された
> finding の再分類」節および `planned-experts.md` を参照。

installed check の最低限 (本節は 1-2-d の `resolve_active_apply_expert(...)` の installed-check ガード):

```bash
# RECOMMENDED_FIX_EXPERT は review-expert / specialist が提案した値
# 本ガードは 1-2-d Active Apply Expert Normalization と同じ judgement を再利用する
APPLY_EXPERT=$(resolve_active_apply_expert \
  --recommended "$RECOMMENDED_FIX_EXPERT" \
  --finding-context "$FINDING_CONTEXT" \
  --labels "$ISSUE_LABELS")

# resolve_active_apply_expert は 1-2-d の Resolved → Runtime 正規化表に従って
# debug-expert / refactor-expert / feature-expert / needs_human_decision のいずれかを返す。
# planned expert (env-expert / release-expert / compatibility-expert) や op-run routing 対象外の
# Utility Worker (spec-expert) は決して返さない (spec-expert は feature-expert へ正規化済み)。

case "$APPLY_EXPERT" in
  needs_human_decision)
    # 4.5-2A の specialist handoff か pro-review-blocked へ倒す (即 apply しない)
    echo "ℹ️  recommended=${RECOMMENDED_FIX_EXPERT} は active fallback で解消できないため human decision 待ちにします" >&2
    APPLY_EXPERT=""
    ;;
  "")
    echo "❌ ${RECOMMENDED_FIX_EXPERT} の fallback が未定義。needs-specialist-review に倒します" >&2
    ;;
esac

# サニティ: 1-2-d の正規化を経ていれば planned expert / op-run 非対象 Utility Worker は
# 到達しないはずだが、万一残っていた場合は spawn せず needs_human_decision に倒す
# (spec-expert は op-run routing 対象外の Utility Worker なのでここでも捕捉する)
case "$APPLY_EXPERT" in
  env-expert|release-expert|compatibility-expert|spec-expert)
    echo "❌ runtime spawn 不可 expert ${APPLY_EXPERT} が漏れました。1-2-d 正規化を再実行してください" >&2
    APPLY_EXPERT=""
    ;;
esac
```

`requires_post_check` の planned expert (`env-expert` 等) は値として残してよい
(`expert-spawn.md` の方針通り、dispatcher が skip 吸収する)。
ただし apply target が fallback に置換されたことを `<!-- op-fallback-applied -->` 等の補助コメントで PR に記録すると後追いしやすい。
`security-expert` は Phase 2 で active 化されたため、`requires_post_check: security-expert` は通常通り 3.5-B で active spawn される。

### 4.5-2A. needs-specialist-review の specialist handoff (即 apply 禁止)

> **適用対象**: `finding.result = needs-specialist-review` の finding **のみ**
> (4.5-1A Step 2 で specialist handoff phase に振り分けられたもの)。
> `finding.result = needs-fix` の finding は 4.5-1A Step 2 で保留 → Step 4 で 4.5-2 の apply path、
> `finding.result = blocked` の finding は 4.5-1A Step 1 で自動継続停止のため、いずれも本節の対象外。
> 全体 review_result が needs-specialist-review でも、内訳 finding が needs-fix なら本節を経由させないこと
> (= 主語は **常に finding.result**)。

needs-specialist-review は **即修正ではない**。まず specialist reviewer (= 専門 expert を
**review-only mode** で spawn したもの) に finding の妥当性 / 影響範囲 / 修正方針 /
same-pr 可否を判断させる。**specialist の判断が出るまで apply expert を spawn しない**。

specialist を spawn する際の prompt は **必ず review-only** とする。

```text
あなたは <expert-name> です。
この起動は needs-specialist-review finding に対する specialist reviewer mode です。

禁止:
- コード編集
- commit
- push
- PR 本文編集
- label 操作

目的:
- finding の妥当性を判断する
- same-pr で直せるか判断する
- 修正方針を決める
- apply expert を提案する

必ず以下の machine-readable block を PR コメントに投稿してください。

<!-- op-specialist-review-meta -->
source_finding_id: RVW-<3 桁ゼロ埋め連番。例: RVW-001, RVW-002>
specialist: <expert 名>
specialist_result: same-pr-fixable | new-issue | blocked
recommended_apply_expert: <expert 名 | null>
requires_post_check: <ux-ui-audit-expert | security-expert | null>
reviewed_round: <元 finding の review_round>
reviewed_at: <ISO8601>
reason: <短い理由>
```

specialist は判断結果を **machine-readable な `<!-- op-specialist-review-meta -->` block** で
PR コメントに記録する (canonical schema は `~/.claude/skills/_shared/pr-templates.md` の
「op-run: specialist 判断結果コメント (specialist expert)」節を参照)。これにより op-run の自動分岐が
自然文依存にならない。

specialist_result に応じた op-run の動作:

| specialist_result | op-run の動作 |
|-------------------|--------------|
| `same-pr-fixable` | **4.5-2 (needs-fix と同じ apply path) に戻る**。`recommended_apply_expert` を参考に apply expert を決定し再委任 (review-expert / ux-ui-audit-expert は apply target にしない) |
| `new-issue` | 当該 finding を別 Issue 化。本 PR 上では blocked 扱いだが、review_result 集約は per-finding result に従う |
| `blocked` | 自動修正不能。`pro-review-blocked` を経由して人間判断待ち |

specialist は finding 単位で 1 block を出す。複数 finding を一度に handoff したい場合は
コメントを分けて 1 finding = 1 specialist block の対応を保つ。

> **重要**: `recommended_apply_expert` を読んでも、op-run は spawn 前に必ず 4.5-2-guard /
> 4.5-2-fallback を通すこと。`review-expert` / `ux-ui-audit-expert` は apply target にしない。

### 4.5-3. same worktree で直す条件 / 直さない条件

**直す**:
- 元 Issue の scope_in に含まれる修正漏れ
- PR 変更が原因のバグ / UX 破壊 / security / file IO / permission 副作用
- acceptance criteria を満たすために必要な不足修正
- この PR の妥当性確認に必要な最小限のテスト追加
- post-check / review で検出された同一 PR 由来の小規模な整合性問題

**直さない (別 Issue 化 / blocked)**:
- 元 Issue の scope_out
- 既存からある別問題
- 大きな設計変更 / migration / compatibility 再設計が必要
- security deep scan が必要な広範囲問題
- release / installer / updater の別検証が必要
- 人間判断が必要
- review fix loop の上限を超えた

### 4.5-4. 再委任 → 再 verification → 再 post-check → 再 review

1. `pro-review-fix-in-progress` を付与し、`pro-review-needs-fix` を外す (fix 着手済みであることを明示):
   ```bash
   # apply_review_labels wrapper 経由で fix-in-progress 状態に遷移 (直接 gh pr edit + 握り潰し禁止)
   apply_review_labels "$PR_NUMBER" fix-in-progress
   ```
2. 4.5-1A Step 4 の apply bucket に積まれた finding についてのみ、4.5-2 で決定した apply expert に
   再委任する。**再 apply の spawn は ClusterOrchestrator が apply-expert を再 spawn して行う**
   (cluster-orchestrator-directives.md フェーズ2 と同一経路)。ClusterOrchestrator は
   既存 apply worktree を再利用し、以下の入力 payload (cluster-orchestrator-directives.md フェーズ0) に従って渡す:
   `{cluster_id, issues, expert, model, module, worktree_path, investigation_report, files_likely_to_modify, files_allowed, files_forbidden}` (`op-run-fanout` は ADR-0016 で削除済み)。
   `expert_directives_text` は controller が `references/apply-prompt-directives.md` の common 節 + 当該 apply expert の節を結合して注入する。apply bucket に入る finding は次のいずれか:
   - 元の `finding.result` が `needs-fix` (4.5-1A Step 2 で保留されていたもの)
   - 元の `finding.result` が `needs-specialist-review` で、4.5-2A の specialist 判断が `same-pr-fixable`

   `finding.result = needs-specialist-review` の finding を specialist 判断 (4.5-2A) なしで apply してはならない。
   `finding.result = blocked` の finding は本ステップに到達しない (4.5-1A Step 1 で打ち切り済み)。
   apply 担当 expert は commit するが push しない (push は controller の責務)。
3. apply 完了後、新しい commit が積まれた時点で **既存 review / post-check は stale** とみなす:
   ```bash
   # apply_review_labels wrapper 経由で stale 状態に遷移 (直接 gh pr edit + 握り潰し禁止)
   apply_review_labels "$PR_NUMBER" stale
   ```
4. 再 verification は ClusterOrchestrator が apply-expert の commits_added 非空 + 自己検証 (Skill(code-review,--high))
   で apply 完了を確認する (cluster-orchestrator-directives.md フェーズ2-3)。ClusterOrchestrator は
   project-profile.md の検証コマンド整合を確認する (`op-run-fanout` は ADR-0016 で削除済み)
5. required post-check 担当 expert を再 spawn (フェーズ3.5 を再実行)
6. REVIEW_ROUND を再計算し、REVIEW_TERMINAL gate を評価してから review-expert を再 review する。
   **再 review の spawn は ClusterOrchestrator が review-expert を Agent tool で再 spawn して行う**
   (cluster-orchestrator-directives.md フェーズ6 と同等の経路。`op-run-review` は ADR-0016 で削除済み)。
   REVIEW_ROUND 再計算と REVIEW_TERMINAL gate は controller 保持で不変 (以下の bash):

```bash
# 4.5-4 Review Fix Loop: REVIEW_ROUND 再計算 + REVIEW_TERMINAL gate (フェーズ4-2-pre と対称)
# TRUSTED_REVIEW_AUTHORS / TRUSTED_AUTHORS_JSON は フェーズ4-2-pre で初期化済み。
# Review Fix Loop は同一 controller プロセスから連続実行されるため変数はそのまま参照可能。
# (Review Fix Loop のみ単独実行する場合は、フェーズ4-2-pre の初期化 bash block を先に実行すること)

# --- PREV_ROUND 再取得 (フェーズ4-2-pre と同じ trusted-author-only ロジック) ---
# trusted author フィルタ (author_login) / 時系列 sort (created_at) は op pr view --include
# body-comments-commits の comment_details envelope (body + author_login + created_at、#579/#635) を使う。
PREV_ROUND=$(
  op pr view "$PR_NUMBER" --include body-comments-commits |
  jq -r --argjson allowed "$TRUSTED_AUTHORS_JSON" '
    (.comment_details // [])
    | map(select(.author_login as $a | $allowed | index($a)))
    | map(select(.body | contains("<!-- op-review-meta -->")))
    | sort_by(.created_at)
    | .[].body
  ' |
  awk '
    /<!-- op-review-meta -->/ { in_block=1; round=""; reviewer=""; gre=""; next }
    in_block && /^[[:space:]]*$/ {
      if (round != "" && reviewer == "review-expert" && gre == "review-expert" && (last == "" || round+0 > last+0)) last=round
      in_block=0
      next
    }
    in_block && /^<!--/ {
      if (round != "" && reviewer == "review-expert" && gre == "review-expert" && (last == "" || round+0 > last+0)) last=round
      in_block=0
      next
    }
    in_block && /^review_round:/         { round=$2 }
    in_block && /^reviewer:/             { reviewer=$2 }
    in_block && /^global_review_expert:/ { gre=$2 }
    END {
      if (in_block && round != "" && reviewer == "review-expert" && gre == "review-expert" && (last == "" || round+0 > last+0)) last=round
      print (last ? last : "")
    }
  '
)
if ! printf '%s' "$PREV_ROUND" | grep -Eq '^[0-9]+$'; then
  PREV_ROUND=0
fi
REVIEW_ROUND=$((PREV_ROUND + 1))

# --- REVIEW_TERMINAL gate (フェーズ4-2-pre と対称、max_review_fix_rounds=2) ---
if [ "$REVIEW_ROUND" -gt "$((MAX_REVIEW_FIX_ROUNDS + 1))" ]; then
  echo "❌ Review Fix Loop: review_round=${REVIEW_ROUND} は許可上限 (MAX+1=$((MAX_REVIEW_FIX_ROUNDS + 1))) を超過。pro-review-blocked を付与し再 spawn を停止。"
  apply_review_labels "$PR_NUMBER" blocked
  CONTROLLED_AT="$(date -Iseconds)"
  if ! op pr comment "$PR_NUMBER" --body-file - <<NOTE; then
<!-- op-review-controller-meta -->
controller_result: blocked
reason: review_round_over_limit
review_round: ${REVIEW_ROUND}
max_review_fix_rounds: 2
controlled_at: ${CONTROLLED_AT}
controller: op-run

## ⛔ Review Fix Loop 上限超過 (op-run controller terminal state — Review Fix Loop)

\`review_round=${REVIEW_ROUND}\` は許可上限 (\`max_review_fix_rounds + 1 = 3\`) を超過しました。
review-expert spawn は行わず、\`pro-review-blocked\` を付与して自動継続を停止します。
Issue 再設計 / scope 再定義 / 人間判断のいずれかが必要です。
NOTE
    echo "⚠️ PR #${PR_NUMBER} への terminal state コメント投稿が失敗しました (ラベル更新は完了済み)" >&2
  fi
  REVIEW_TERMINAL=1
else
  REVIEW_TERMINAL=0
fi

if [ "$REVIEW_TERMINAL" = "1" ]; then
  echo "⏭️ PR #${PR_NUMBER}: Review Fix Loop review_round over limit. Skip review-expert re-spawn." >&2
  continue
fi
```

   REVIEW_TERMINAL=0 を確認したら、ClusterOrchestrator は review-expert を Agent tool で再 spawn して再 review を実行する
   (cluster-orchestrator-directives.md フェーズ6 と同等の経路。`op-run-review` は ADR-0016 で削除済み)。
   渡す値は以下の通り (global-review-spawn.md の規約に従う): 再計算した `REVIEW_ROUND` を
   `review_round` に、当該 PR の push 済 branch から detach checkout した review worktree を `prs[].review_wt` /
   `prs[].review_wt_head_sha` に、ClusterOrchestrator が払い出した SESSION_ID / review model / model_reason を
   `session_id` / `review_model` / `review_model_reason` に転写注入する
   (`{prs:[{number,review_wt,review_wt_head_sha,review_mode,active_lens_keys,lens_bundles,carryover_findings,issues}], review_round, session_id, review_model, review_model_reason}`)。
   **2 round 目以降は 4.5-5 の差分 lens 化に従って `active_lens_keys` / `lens_bundles` / `carryover_findings` を確定する** (ADR-0015)。
   戻り値 `reviews[].verdict` を Step 7 の `apply_review_labels` に通す。

7. 再 review の結果を 4-3 の `apply_review_labels` に通す (排他制御で `pro-review-stale` も自動的に剥がれる)
8. approve なら完了、needs-fix なら 4.5-1 のラウンド上限判定に戻る

### 4.5-5. 差分 lens 化 (Fix Loop 2 round 目以降、ADR-0015)

初回 round (review_round=1) の lens 構成は `global-review-spawn.md` §4-2-a-pre2 (PR 規模・リスクから tier 判定) で
確定する。**2 round 目以降 (review_round>=2)** は、fix で触れた範囲と前 round の指摘に絞って再 spawn する
(変わっていない lens を毎 round 全部回さない = 「1 行 fix に 7 レンズ再 spawn」の解消)。

#### active lens の決め方 (和集合)

再 review の `active_lens_keys` は次の **和集合** とする:

```text
(a) 前 round で finding が出た lens
    - $REVIEW_FINDINGS (4.5-2-pre で抽出した最新 review コメントの op-review-finding) の lens 表示形を
      内部 kebab key に逆引きして集める (例: "Security / Abuse" → security)。
(b) fix commit が触れたファイルの domain に対応する lens
    - 4.5-4 Step 2 で再 apply した結果の新 commit が触れたファイルを `git diff --name-only <prev_head>..<new_head>` で取り、
      4.5-2 判定優先2 (変更ファイルのドメイン) の逆引きで lens に写像する
      (src-tauri/** / file IO / IPC → security、tests/** → test-regression、frontend / *.vue → workflow-ux、
       migrations/** / config 構造 → compatibility、release/installer/updater → release、PR 本文 / scope → spec、
       命名 / 構造 / 配置 → refactor-maintainability)。
(c) core lens (security / spec / test-regression) を常時加える
    - fix が新たな regression / scope 逸脱 / 攻撃面を持ち込んでいないかを毎 round 必ず再評価する。
```

`lens_bundles` は初回と同じ許可ペア表 (`compatibility`+`release` / `workflow-ux`+`refactor-maintainability`) を
active lens に含まれるペアにのみ適用する (両 lens が active のときだけ bundle)。core/security は単独維持。

#### backstop は cumulative diff

最終ゲートの backstop gap-check は **round 1 からの累積 diff** (cumulative diff) を対象にする
(`git diff origin/$BASE_REF...HEAD`)。fix で積んだ commit だけでなく PR 全体を gate-critical 観点で見直し、
差分 lens で再 spawn しなかった lens の見落としをゲートが拾えるようにする。

#### floor / verdict 母集合は carry-over で全 finding を保持

floor / verdict の母集合は **今 round 新規 finding + 前 round 未解決の high/critical finding** とする。
差分 lens で再 spawn しなかった lens の前 round high/critical 指摘が「今 round で見ていない」だけで消えると、
未解決のまま approve に倒れる事故が起きる。これを防ぐため、controller は前 round の op-review-finding から
**未解決の high/critical のみ**を抽出して `carryover_findings` に注入する:

```text
carryover_findings = 前 round ($REVIEW_FINDINGS) の op-review-finding のうち、
  - severity が high または critical で、
  - 今 round の fix で解決されたと確認できないもの (差分 lens で再 spawn された lens の指摘は再 spawn 結果で
    上書きされるため carry しない。再 spawn しなかった lens の high/critical のみ carry する)
を {lens(kebab), severity, result, summary, file, evidence} 形で渡す。
```

review-expert (ClusterOrchestrator が spawn する review-expert の内部処理 `normalizeCarryover`) が carry finding を floor 母集合へ合流させる
(carry は再 verify しない = 前 round 検証済み)。`carryover_findings` は review-expert spawn 時の **additive field** であり、
既存 field の意味は変えない (ADR-0015 constraint 8)。

#### sensitive doc-only refactor の round2+ 差分化判定 (#717、ADR-0015 amendment = #719)

sensitive glob 該当 PR は §4-2-a-pre2 の sensitive 分岐により round を問わず 7-lens フルになるのが既定だが、
**no-behavior-change な doc-only refactor の round2+ 再 review** に限り、round1 の full 7-lens sweep を死守した上で
差分 lens 化 (上記「active lens の決め方」) を解禁する。op-skill repo の canonical doc (`skills/_shared/**` /
`agents/*.md` 等) は全て sensitive glob 該当のため、1〜数行 fix の検証が毎 round full 7-lens × opus に倒れていた
問題 (2026-06-13 実測: review 3 round = 6.4M tok) を構造解消する。

判定は **AND** で以下を満たすとき `SENSITIVE_DOC_DIFFERENTIAL=1` とする。controller が 4.5-4 の PREV_ROUND 再計算
(`REVIEW_ROUND` 確定) を **必ず先に通した後**、再 review の `active_lens_keys` 確定前に評価する:

```bash
# §4.5-5 sensitive doc-only refactor round2+ 差分化判定 (#717)
# 前提: 4.5-4 で REVIEW_ROUND を再計算済み (PREV_ROUND + 1)。OP_RUN_BASE_REF は フェーズ0-base で確定済み。
: "${REVIEW_ROUND:?REVIEW_ROUND must be set — 4.5-4 で再計算済}"
: "${OP_RUN_BASE_REF:?OP_RUN_BASE_REF must be set — フェーズ0-base で確定}"
: "${PR_NUMBER:?PR_NUMBER must be set — 当該 PR 番号}"

# PR head SHA を明示解決する (#651 の op pr view envelope)。本判定は 4.5-4 の controller cwd で走り、
# その時点で当該 round の review worktree は未作成 (ClusterOrchestrator フェーズ6 で §4-1 のロジックに従い後段に作成) のため、
# cwd の HEAD は PR ブランチではなく main repo を指しうる。cwd の HEAD に依存せず PR head SHA を直接 diff 端点に
# 使うことで「controller の作業ブランチを誤って測る」事故を防ぐ (#720 §4-1-b が git -C REVIEW_WT を使うのと同趣旨)。
PR_HEAD_SHA_DIFF=$(op pr view "$PR_NUMBER" --include meta | jq -r '.head_ref_oid // empty' 2>/dev/null || true)
# jq の `// empty` で null/不在を空文字へ落とす (jq -r 素では "null" 文字列が通り抜ける)。
# 解決失敗 (一時インフラ障害 / rate limit / envelope 揺れ) は空のまま扱い、後続で CUMULATIVE_NONDOC=1 に safe-degrade。
# :? hard-abort は他の失敗経路 (git fetch ||true / op issue view 2>/dev/null 失敗→OP_DOMAIN_NONREFACTOR=1 /
# CUMULATIVE_NONDOC 異常→=1) と非対称になるため使わない (RVW-002)。SENSITIVE_DOC_DIFFERENTIAL は最適化フラグにすぎず
# 失敗時は保守側 (full 7-lens) に倒すのが安全。
# origin/BASE_REF を最新化 (release/develop 等を base にする可能性があるためハードコード禁止、§4-1 と同じ理由)
git fetch origin "$OP_RUN_BASE_REF:refs/remotes/origin/$OP_RUN_BASE_REF" 2>/dev/null || true

# 1) op-domain marker を Issue body から取得する (refactor のみ差分化対象)。
#    ISSUE_NUMBERS = 当該 PR が close する Issue 番号 (space 区切り)。controller が per-PR の
#    pr.issues (JS 配列) を space-join して渡す (例: ISSUE_NUMBERS="717 720")。
#    複数 Issue があるときは全 Issue が refactor のときだけ refactor 扱い (1 件でも非 refactor なら full)。
#    不変則4: 未設定なら full 側 (非 refactor) に安全側で倒す。
OP_DOMAIN_NONREFACTOR=0
[ -n "${ISSUE_NUMBERS:-}" ] || OP_DOMAIN_NONREFACTOR=1
for ISSUE_NO in ${ISSUE_NUMBERS:-}; do
  # <!-- op-domain: <value> --> の value だけを抜く
  DOMAIN=$(op issue view "$ISSUE_NO" --plain 2>/dev/null \
    | grep -oE '<!-- op-domain:[[:space:]]*[a-z-]+' | head -1 \
    | sed -E 's/.*op-domain:[[:space:]]*//')
  [ "$DOMAIN" = "refactor" ] || OP_DOMAIN_NONREFACTOR=1
done

# 2) cumulative diff (round1 からの全 commit) の非 doc ファイル数を数える。
#    round2 の fix delta だけ見ると round1 のコード変更を見逃すため、必ず origin/BASE_REF...PR_HEAD で測る。
#    端点は cwd の HEAD ではなく明示 PR head SHA (上で解決) を使う (controller cwd 非依存)。
#    PR_HEAD_SHA_DIFF が空 (解決失敗) or ローカル object store に不在のときは CUMULATIVE_NONDOC=1 で safe-degrade (full 7-lens)。
#    非空 SHA でも controller cwd に fetch されていない場合 git diff exit128 + 空 stdout → wc-l=0 →
#    ^[0-9]+$ ガードを 0 が通過 → CUMULATIVE_NONDOC=0 (doc-only 誤判定) になる (RVW-001 fix)。
#    git cat-file -e で object 存在を先に確認し、不在なら即 safe-degrade する。
#    doc-only 判定式の正本は model-selection.md §7.1.3。global-review-spawn.md §4-1-b にも同式が存在する
#    (drift 防止: 変更時は両方更新すること)。
#    doc-only = .md / docs/ のみ。op-tools/crates/** にマッチした時点で非 doc 扱い (#719 残論点1 の
#    conservative 解: コメントのみ変更でも .rs touch なら full を維持し、誤判定で sensitive を緩めない)。
if [ -n "${PR_HEAD_SHA_DIFF:-}" ] && git cat-file -e "${PR_HEAD_SHA_DIFF}^{commit}" 2>/dev/null; then
  CUMULATIVE_NONDOC=$(git diff --name-only "origin/${OP_RUN_BASE_REF}...${PR_HEAD_SHA_DIFF}" \
    | grep -Ev '(\.md$|(^|/)docs/)' | wc -l | tr -d ' ')
  printf '%s' "$CUMULATIVE_NONDOC" | grep -Eq '^[0-9]+$' || CUMULATIVE_NONDOC=1
else
  CUMULATIVE_NONDOC=1   # PR head SHA 解決失敗 or ローカル object 不在 → safe-degrade (full 7-lens)
fi

# 3) AND 判定: round2+ ∩ 全 Issue refactor ∩ 非 doc=0
if [ "$REVIEW_ROUND" -ge 2 ] \
   && [ "$OP_DOMAIN_NONREFACTOR" -eq 0 ] \
   && [ "$CUMULATIVE_NONDOC" -eq 0 ]; then
  SENSITIVE_DOC_DIFFERENTIAL=1
else
  SENSITIVE_DOC_DIFFERENTIAL=0
fi
export SENSITIVE_DOC_DIFFERENTIAL
```

`SENSITIVE_DOC_DIFFERENTIAL=1` のとき、controller は §4-2-a-pre2 の sensitive 分岐をバイパスして上記「active lens の
決め方 (和集合)」で `active_lens_keys` / `lens_bundles` を確定する (round1 finding lens ∪ fix domain lens ∪ core 3)。
`=0` (round1 / 非 refactor / コード変更含む) のときは従来どおり §4-2-a-pre2 の sensitive 分岐で 7-lens フルに倒す。

backstop (cumulative diff の opus gate gap-check) と carryover_findings (再 spawn しない lens の前 round 未解決
high/critical) は `=1` でも常に有効。core 3 lens + cumulative-diff backstop が round2+ も毎 round 動くため、
差分化しても High/Critical は取りこぼさない。

> **round1 full 死守 (絶対遵守)**: `REVIEW_ROUND >= 2` ガードを外すと初回 sweep が差分化され、#713 型
> (PR #713 expert-spawn.md:839 論理反転 = doc 圧縮で no-behavior-change 違反) を round1 で逃す。
> 4.5-4 の PREV_ROUND 再計算を必ず先に通し、REVIEW_ROUND 確定後に本判定を評価すること。

> **退行回避**: `op-config.yaml` の `review.proportional_lens.enabled: false` (= 退行経路
> `OP_REVIEW_PROPORTIONAL_LENS=false`) のときは差分 lens 化も無効で、`active_lens_keys` / `lens_bundles` を
> 空 [] にして全 7 lens 単独で再 spawn する。**sensitive PR は既定で毎 round 7-lens フル維持** (§4-2-a-pre2 の
> sensitive 分岐が round を問わず適用される)。**唯一の例外が本節 `SENSITIVE_DOC_DIFFERENTIAL=1`** (no-behavior-change
> doc-only refactor の round2+) であり、このときのみ round1 full を死守した上で round2+ を差分化する (#717)。
