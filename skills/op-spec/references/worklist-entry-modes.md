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
