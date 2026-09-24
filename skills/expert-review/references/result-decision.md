# result-decision.md — review_result の判定基準

| 判定 | 意味 |
|------|------|
| `approve` | 問題なし。op-run が `pro-reviewed` を付ける (人間がマージ判断する際の参考シグナル) |
| `needs-fix` | 同 PR で修正可能。op-run が specialist に再委任する (Review Fix Loop) |
| `needs-specialist-review` | 妥当性・修正方針の判断に専門観点が要る。specialist に handoff |
| `blocked` | 自動修正不能 (人間判断 / Issue 再設計 / scope_out)。op-run は自動継続を止める |

全体 `review_result` は finding 単位 `result` の最重値 (`op help payload review-finding`)。

## approve の条件 (すべて満たす)

- scope_in の要求をすべて満たし、scope_out への越境がない
- acceptance criteria を満たす
- active lens で Critical / High がない
- review 中に新 commit が積まれていない (判定確定時の HEAD を `reviewed_head_sha` に記録する)
- PR 本文が `~/.claude/skills/_shared/pr-templates.md` の品質要件を満たす
- 検証コマンドの副作用で tracked diff が残っていない
- 追加修正が不要

post-check が SKIPPED であることだけを理由に blocked にしない。PR 自体に問題がなければ approve してよい
(post-check の充足は review state に別に記録され、人間がマージ判断時に見る)。

## needs-fix の条件 (3 条件 AND)

```text
□ same-pr 内で修正できる (scope_in 内。PR の touch 範囲で直せる。migration / 設計変更を伴わない)
□ 単一 expert で完結する (修正 expert が一意に決まる)
□ 既知パターンの修正である (lens-catalog.md の典型 finding に該当し、修正方針が明らか)
```

1 つでも欠ければ needs-specialist-review。

| 状況 | 判定 |
|------|------|
| バグ修正 PR に再現テストがなく、test-expert が 1 本足せば済む | needs-fix |
| button の focus が消え、`outline` を戻せば済む | needs-fix |
| IPC に新たな露出面があるが修正方針が複数ある | needs-specialist-review |
| migration / rollback の不具合で複数 expert が必要 | needs-specialist-review |
| scope_out に入る修正が必要 | blocked |
| review_round = 3 で needs-fix が残る | needs-fix (下記「round と blocked の境界」) |
| review_round > 3 で spawn された | blocked |

## needs-specialist-review の条件 (いずれか)

- same-pr 可否が不明
- 担当 expert が一意に決まらない (複数 expert の協調が必要 / 主 lens が曖昧)
- 修正パターンが未知
- 専門判断 (security 深掘り / 設計判断 / spec 解釈) の後でないと方針が決まらない

specialist の判断で same-pr 修正可 → 再委任 / scope 外 → 別 Issue 化 (当該 finding は blocked) / 人間判断要 → blocked。

## blocked の条件 (いずれか)

- scope_out に踏み込む修正が必要
- 仕様変更 / 設計再判断 / business decision が必要
- Issue の分割・再定義が必要、または修正範囲が PR の scope を完全に超える
- 既存設計・互換性の制約で修正できない
- `review_round > 3` (規定外 spawn)
- review worktree の HEAD が `review_wt_head_sha` と一致しない

## round と blocked の境界 (canonical 表現)

`max_review_fix_rounds = 2`。`review_round` は review attempt の通算 (1 origin、`fix_round = review_round - 1`)。

```text
review_round 1 : 初回 review
review_round 2 : fix 1 回後の re-review
review_round 3 : fix 2 回後の最終 re-review (needs-fix も返してよい)
review_round > 3 : 規定外 spawn → blocked
```

round 3 で needs-fix / needs-specialist-review が残っても review-expert は通常判定を返す。上限超過による停止は op-run controller が行う。
review-expert が round を理由に blocked にしてよいのは `review_round > 3` のときだけ。

## 判定の順序

`review_round > 3` → blocked、scope_out / 人間判断 / Issue 再設計 → blocked、Critical / High あり → 3 条件 AND なら needs-fix・欠ければ
needs-specialist-review、PR 本文の品質要件未充足 → needs-fix (Spec / Refactor)、いずれも無ければ approve。迷ったら needs-specialist-review に倒す。
