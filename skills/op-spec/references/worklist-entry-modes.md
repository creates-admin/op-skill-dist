<!--
schema_version: 1
last_breaking_change: 2026-07-29
notes: v1 (2026-07-29, Wave B1 / ADR-0029 決定2): op-spec/SKILL.md フェーズ1 「1-1. worklist 種の取得
       (mode で分岐)」節を物理切り出し。3 entry mode (issue-driven / feature-driven / drift-driven) は
       1 セッションで 1 つしか通らない排他分岐のため references 候補 (本文残留条件「毎回・必ず・順序が
       重要」の「必ず」不成立)。切り出し前後で内容 byte-identical (移動であって書き換えではない)。
-->

<!--
機能概要: op-spec フェーズ1 の worklist 種取得を、選んだ entry mode (issue-driven / feature-driven /
         drift-driven) ごとに具体化した手順。取得結果は本文側 1-2「feature 主役での構造化」で共通合流する。
作成意図: SKILL.md 本文を「毎回・必ず・順序が重要」な主経路に絞るための progressive disclosure
         (ADR-0029 決定2、Wave B1)。3 モードは排他的選択であり、1 セッションでは選んだ 1 モードの
         手順だけが必要になるため、本文には 1-0 の選択表のみ残し、モード別詳細手順をここへ出す。
注意点: いつ読むか = 本文 1-0 で entry mode を選んだ直後、選んだモードの節だけを読めばよい (他モードは
       読まなくてよい)。3 モードとも「取得結果は 1-2 の feature 主役構造化に合流する」という契約は
       本文側に残っているので、ここでは合流後の扱いには触れない。
-->

# op-spec: worklist entry mode 別詳細手順

本文フェーズ1「1-0. entry mode 選択」で選んだ mode に応じて種を取得する。以降は取得結果を
本文 1-2「feature 主役での構造化」で feature 主役に畳む (3 モード共通の合流点)。

**issue-driven (既定)** — pending issue を起点にする:

```bash
gh issue list --state open --limit 50 --json number,title,labels
```

**feature-driven** — 正本一覧を起点にし、各 feature の正本 state + 紐づく issue を並べる:

```bash
# 正本一覧 (meta ファイル _* / 00-* は feature ではないので除外、_schema.md 索引除外規約)
ls .claude/rules/*.md 2>/dev/null | grep -vE '/(_|00-)' \
  || echo "[.claude/rules] に feature 正本がありません — issue-driven を使うか lazy 構築から始めます"

# 各 feature の status は frontmatter から読む (cultivated / draft / unverified)
#   例: grep -m1 '^status:' .claude/rules/<feature>.md
# pending issue は issue-driven と同じ gh issue list で取り、feature 帰属を推定して紐づける
```

**drift-driven** — git log staleness + 未成熟 status を起点に seed する:

```bash
# (a) 正本より新しい code を持つ feature (stale 候補) を git log で拾う
#     staleness は frontmatter 日付でなく git log で判定する (_schema.md「staleness は git log で判定」)。
#     各 feature 正本の最終更新コミット時刻 ⟷ その paths 配下 code の最終更新コミット時刻を比較し、
#     code の方が新しければ stale 候補とする。
for SPEC in $(ls .claude/rules/*.md 2>/dev/null | grep -vE '/(_|00-)'); do
  SPEC_TS="$(git log -1 --format=%ct -- "$SPEC" 2>/dev/null)"
  # paths frontmatter の glob 配下 code の最新コミット時刻を取り SPEC_TS と比較する
  # (glob 解決は paths 行を読んで feature ごとに行う。code が新しければ stale 候補に積む)
  echo "  $SPEC: spec_ts=${SPEC_TS:-none}"
done

# (b) status: draft / unverified の正本 (人間深掘り未了) も seed に含める
grep -lE '^status:[[:space:]]*(draft|unverified)' .claude/rules/*.md 2>/dev/null \
  | grep -vE '/(_|00-)' \
  || echo "draft/unverified の正本なし"

# (c) Spec Patrol Ledger の confirmed drift feature を seed に合算 (ADR-0017 D3)
#     op-spec-patrol が ledger push --drift-count で記録した feature の drift_counts が non-zero ならば
#     confirmed drift として cultivation 対象に加える。Ledger Issue 番号は op-spec-patrol label +
#     op-state label の Issue から解決する。取得できない場合 (Issue 未発見 / pull 失敗 / JSON 解析失敗)
#     は空扱いで (a)(b) のみで継続する — Ledger 欠落は fatal でない。
LEDGER_ISSUE="$(gh issue list --label op-spec-patrol --label op-state --state open \
  --json number --jq '.[0].number // empty' 2>/dev/null || true)"
if [ -n "$LEDGER_ISSUE" ]; then
  # ledger pull → drift_counts が空でない feature のキー一覧を抽出 (失敗時は空扱いで継続)
  op spec-patrol ledger pull --issue "$LEDGER_ISSUE" 2>/dev/null \
    | jq -r '.details.area_state // {} | to_entries[]
             | select(.value.drift_counts != null and (.value.drift_counts | length) > 0)
             | .key' 2>/dev/null \
    || echo "(c) Ledger 取得/解析に失敗 — 空扱いで (a)(b) のみ継続"
else
  echo "(c) Spec Patrol Ledger Issue なし — 空扱いで (a)(b) のみ継続"
fi
```

> drift-driven の seed は「stale 候補」(a)、「未成熟 status」(b)、「Spec Patrol Ledger の
> confirmed drift feature」(c) の和集合。
> `status: cultivated` で git 上も最新かつ Ledger 上の drift_counts もゼロな正本は seed から外れる
> (育成済みは後回し)。(c) の ledger pull が失敗 / Ledger 未導入の場合は (a)(b) のみで継続する。
