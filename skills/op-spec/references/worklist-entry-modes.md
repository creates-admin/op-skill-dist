# op-spec: worklist entry mode 別の種取得

1-0 で選んだ mode の節だけ実行する。取得結果は SKILL.md 1-2 で feature 主役に畳む。
正本一覧からは meta ファイル (`_*` / `00-*`) を除外する。

## issue-driven (既定)

```bash
op issue list --state open --limit 50
```

## feature-driven

```bash
ls .claude/rules/*.md 2>/dev/null | grep -vE '/(_|00-)'   # 各 feature の status は frontmatter の status: 行
op issue list --state open --limit 50                    # feature 帰属を推定して紐づける
```

## drift-driven

seed は次の (a)(b)(c) の和集合。`status: cultivated` かつ drift なしの正本は外れる。

```bash
# (a) code が正本より新しい feature: drift_score > 0 のもの
op spec-patrol score | jq -r '.details.specs[] | select(.components.drift_score > 0) | .feature'

# (b) 未成熟 status の正本
grep -lE '^status:[[:space:]]*(draft|unverified)' .claude/rules/*.md 2>/dev/null | grep -vE '/(_|00-)'

# (c) Spec Patrol Ledger の confirmed drift feature (Ledger が無い / 取得失敗なら空扱いで (a)(b) のみ)
LEDGER_ISSUE="$(op issue list --label op-spec-patrol --label op-state --state open | jq -r '.details.issues[0].number // empty')"
[ -n "$LEDGER_ISSUE" ] && op spec-patrol ledger pull --issue "$LEDGER_ISSUE" \
  | jq -r '.details.area_state // {} | to_entries[] | select((.value.drift_counts // {}) | length > 0) | .key'
```

## trim

seed は大きさの warning が出ている正本。1 正本ずつ `references/spec-trim.md` の手順で細くする (1-2 には合流しない)。

```bash
op spec-patrol list-specs --json \
  | jq -r '.details.findings[] | select(.lens == "size" and .severity == "warn" and .feature != null) | "\(.feature)\t\(.rule_id)\t\(.message)"'
```

## consolidate

seed は機能地図で層の正本にしか覆われていない機能。人が機能名を指定してもよい。1 機能ずつ `references/spec-consolidate.md` の手順で移す (1-2 には合流しない)。

```bash
op spec-patrol coverage --json \
  | jq -r '.details.feature_map.features[] | select(.state == "layer_only") | "\(.name)\t\(.specs | join(","))"'
```

## missing

seed は機能地図で正本が `(未作成)` の機能。人が機能を指定してもよい (機能地図に行が無い機能も含む)。正本列のキーが実在しない行 (`dead_key`) は含めない。1 機能ずつ SKILL.md 2-4 の lazy 構築へ渡す (1-2 には合流しない。1 機能 1 PR)。

```bash
op spec-patrol coverage --json | jq -r '.details.feature_map.features[] | select(.state == "missing") | .name'
```

1. 機能ごとに feature キー (書き方は SKILL.md 2-4) と `paths` を人と決める (op-adopt の PR 本文に承認した地図があればそのキーと `paths` を示す)。
2. 優先順を人と決める。目安は op-adopt SKILL.md フェーズ3 手順1 と同じ変更頻度と影響の大きさで、変更頻度は下の bash で示す。
3. 2-4 の spawn で `code_scope` に `paths`、`doc_scope` に `doc/design/**` と ADR のうちその機能に関係するものを渡す。

```bash
: "${PATHS:?機能の paths (空白区切りの glob)}"
set -f
git log --since=6.months --name-only --format= -- $PATHS | grep -c .
```
