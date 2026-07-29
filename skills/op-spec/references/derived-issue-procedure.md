<!--
schema_version: 1
last_breaking_change: 2026-07-29
notes: v1 (2026-07-29, Wave B1 / ADR-0029 決定2): op-spec/SKILL.md フェーズ3「3-1b. derived issue 発行
       (G1+enrich、ADR-0017 D2/D4/D5)」節を物理切り出し。「差分がある時のみ」発火する条件付き深掘りパス
       (align 済み gap を実装 issue 化したい場合のみ) のため references 候補 (本文残留条件「毎回」不成立)。
       切り出し前後で内容 byte-identical (移動であって書き換えではない)。
-->

<!--
機能概要: 3-1 の正本 write で確定した「正本↔code gap のうち実装が必要なもの」を derived issue として
         起票する 5 ステップ手順 (align gate → fingerprint dedup → full enrichment → op issue create →
         back-link)。ADR-0017 D2 (発行責務 = op-spec のみ・人間 align 後) / D4 (op-spec-ref marker) /
         D5 (gate = full enrichment) の実装詳細。
作成意図: SKILL.md 本文を「毎回・必ず・順序が重要」な主経路に絞るための progressive disclosure
         (ADR-0029 決定2、Wave B1)。本節は「align 済みの gap を実装で解消すべきと human が判断した
         場合のみ」発火する条件付きパスであり、全 cultivation セッションで毎回通るわけではない。
注意点: いつ読むか = 本文フェーズ3-1 の正本 write が済み、かつ「この gap は実装で解消すべき」と
       human が align した gap がある場合のみ読む (⛔/⏸️ の gap や align していない gap では読まない)。
       捏造禁止 (align なしに derived issue を作らない) は本文側の宣言と一致させること。
-->

# op-spec: derived issue 発行手順 (3-1b)

3-1 の正本 write で確定した「正本↔code gap のうち実装が必要なもの」を、derived issue として起票できる。
**D2 (発行責務 = op-spec のみ・人間 align 後)** に従い、以下の 5 ステップを経てから起票する。
起票するかどうかは per-gap で必ず human に確認する (捏造禁止・自動起票なし)。

> **発火条件**: 3-1 の正本 write で gap を記録し、かつ「この gap は実装で解消すべき」と human が align した場合のみ。
> ✏️ 方向修正の gap (修正方針が確定した) も同様に対象となる。
> ⛔/⏸️ の gap は起票しない。align していない gap は `[?] TODO: needs-human` のまま正本に残す。

#### ステップ1: align gate (per-gap で human 承認)

正本 write が済んだ後、実装が必要な gap について per-gap で確認する:

```
gap: <feature>#<decision-id> — <gap の内容を 1 行で>
現在: code では <実態>、正本では <あるべき姿>

この gap を derived issue として起票しますか？
  y — 起票フロー (ステップ2〜5) へ
  n — 起票しない (gap は正本の [?] のまま残す)
```

#### ステップ2: fingerprint dedup

`_shared/dedup-policy.md` の fingerprint 生成仕様に従い
`op-fingerprint: <domain>:<normalized_title>:<primary_file>:<symbol>` を組み、既存 open Issue との衝突を判定する。
判定手順は **op-plan/SKILL.md フェーズ4-4「fingerprint 生成 + dedup 判定」節と同型**:
finding draft を canonical schema JSON で一時ファイルに書き出し →
`op scan dedup --finding-json "$FINDING_DRAFT_PATH" --json --quiet` → `.decision` で分岐
(`op issue list --json` は body raw を返さないため、手動 fingerprint 照合は使用しない)。
op-spec 固有の差分は以下の 2 点のみ:

```bash
# 固有差分1: fingerprint 文字列は op core fingerprint で生成する (format drift 防止、正本: expert-spawn.md §fingerprint)
# --domain / --title / --file / --symbol の named 引数を使う (positional 渡しは clap が拒否する)
# derived issue につき domain は "feature" 固定 (finding draft JSON の "domain" も同じく "feature")
DERIVED_FP=$(op core fingerprint --plain \
  --domain feature \
  --title "<normalized_title>" \
  --file "<primary_file>" \
  --symbol "<symbol>" \
  2>/dev/null)
: "${DERIVED_FP:?op core fingerprint が fingerprint を返しませんでした}"
```

固有差分2 (`block` 分岐の扱い): op-plan は「続行 / 既存 Issue にコメント追加 / キャンセル」を確認するが、
op-spec は **起票せず既存 Issue 番号 (`.details.matched_existing.issue_number`) を提示して終了**する。

衝突あり (`block`) → 起票せず既存 Issue 番号を提示して終了。
衝突なし (`pass`) → ステップ3 へ進む。
dedup 失敗 (その他) → fail-closed でエラーを提示し、手動確認を促して中断する (op-plan と同じ)。

#### ステップ3: full enrichment (不変則8 必須)

**D5 (gate = full enrichment)** に従い、derived issue も `_shared/issue-enrichment.md` の full enrichment を通す。
op-spec は Direct Mode 固定のため、block 時は対話で human に判断を返す。

enrichment input を組む:

```json
{
  "issue_draft": {
    "title": "<gap の実装タイトル、例: [feature-expert] <feature> の <gap 内容> を実装する>",
    "body": "<指示書フル版。op-spec-ref marker / op-source marker / op-domain marker を含む (後述)>",
    "domain": "feature",
    "recommended_runner": "feature-expert",
    "scope_files": ["<gap に関連するソースパス>"],
    "new_files": [],
    "severity": "n/a",
    "fingerprint": "<ステップ2 で生成した fingerprint>"
  },
  "options": {
    "with_design_plan": "auto",
    "with_cross_review": "auto",
    "max_review_loops": 2,
    "strict": false
  }
}
```

`issue-enrichment.md §7.6` の controller オーケストレーション順序に従って実行する:

```
1. [pre-step] with_design_plan(bool) / cross_review_experts / task_complexity 等を解決する (§4/§6)
2. Workflow({name:'op-enrichment', args:{...}}) を呼び出す
3. §8 Output contract を受領 (result: enriched | blocked)
   - blocked → 起票せず escalation_report を human に提示して判断を仰ぐ:
     「1. 指摘を修正して再 enrichment / 2. キャンセル」
4. §7.5 Cross-instance Collision Gate (gh issue list 横断検索、workflow 後に必ず実行)
   - collision_gate.verdict == warn → similar_issues を提示し「このまま起票しますか？」と確認
   - collision_gate.verdict == block → 起票を停止して human に判断を返す
```

#### ステップ4: op issue create (marker 込み・直列)

enrichment が pass した後、marker-lint を通してから起票する。
起票直前の Marker Publish Validate (op-plan フェーズ7-2 と同パターン) を必ず実行:

```bash
# Issue 本文は Write tool で一時ファイルに書き出す (長文・特殊文字対応)
export DERIVED_BODY_FILE="/tmp/op-spec-derived-$(date +%s).md"
: "${DERIVED_BODY_FILE:?DERIVED_BODY_FILE must be set}"

# 本文には必ず以下の hidden marker を含める (ADR-0017 D4):
#   <!-- op-spec-ref: <feature>#<decision-id> -->  (発行元の正本決定を指す = linkage B + provenance)
#   <!-- op-source: op-spec -->
#   <!-- op-domain: feature -->
#   <!-- op-fingerprint: <fingerprint> -->

# 起票直前 Marker Publish Validate (op-plan フェーズ7-2 手本)
LINT_JSON=$(op core marker-lint --body - --source-hint issue-body --strict < "$DERIVED_BODY_FILE" 2>/dev/null) || true
LINT_DECISION=$(printf '%s' "$LINT_JSON" | jq -r '.decision' 2>/dev/null)
if [ "$LINT_DECISION" = "pass" ]; then
  # pass → 起票する (直列、並列化禁止: gh/op issue create の並列化は重複起票事故の元)
  NEEDED_LABELS=()
  NEEDED_LABELS+=("auto-report" "pro-feature-expert")
  export LABEL_CSV=$(IFS=,; echo "${NEEDED_LABELS[*]}")
  CREATE_JSON=$(op issue create \
    --title "<derived issue タイトル>" \
    --label "$LABEL_CSV" \
    --body-file "$DERIVED_BODY_FILE" \
    --ensure-labels)
  DERIVED_ISSUE_NUM=$(printf '%s' "$CREATE_JSON" | jq -r '.details.issue_number // empty' 2>/dev/null)
  : "${DERIVED_ISSUE_NUM:?op issue create が issue_number を返しませんでした}"
else
  # block → 起票せず、hidden marker を修正してから再起票するようユーザーに提示して停止する
  # (Direct Mode 固定、op-spec は --auto を持たない)
  echo "marker-lint block: $(printf '%s' "$LINT_JSON" | jq -c '.blocking_reasons // []' 2>/dev/null)"
  echo "→ hidden marker を修正してから再起票する (このまま起票しない)"
fi
```

#### ステップ5: back-link (正本への realizes 追記)

起票して得た `#DERIVED_ISSUE_NUM` を正本の該当決定行へ張り、linkage B 双方向を完成させる
(ADR-0017 決定9):

正本 `.claude/rules/<feature>.md` の該当決定行に `realizes #DERIVED_ISSUE_NUM` を追記する:

```
変更前: D-N: <決定内容> [code]
変更後: D-N: <決定内容> [code] (realizes #DERIVED_ISSUE_NUM)
```

これで linkage B が両端とも成立する:
- 正本 → issue: `(realizes #DERIVED_ISSUE_NUM)` (今ここで追記)
- issue → 正本: `<!-- op-spec-ref: <feature>#<decision-id> -->` (ステップ4 で issue 本文に埋め込み済)

> **捏造禁止**: ステップ1 で human align を経た gap のみ起票する。align なしに derived issue を捏造しない。
> 「gap の実装承認 (D2 align gate)」と「issue 本文の品質担保 (D5 enrichment cross-review)」は
> 層が違うため、どちらも省略しない。
