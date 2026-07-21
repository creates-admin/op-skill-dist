# result-decision.md — review_result の判定基準

<!--
機能概要: review-expert が review_result を 4 種 (approve / needs-fix / needs-specialist-review / blocked) に
         確定させるための判定軸を集約する。
作成意図: 「迷ったら needs-specialist-review」を機械的に決められるよう、
         needs-fix の 3 条件 AND を明文化する。loop 上限 / scope_out / 人間判断必要は blocked。
注意点: 観点本体 (7 lens) は lens-catalog.md、出力 schema は finding-schema.md。本ファイルは判定軸のみ。
-->

## 4 種に必ず閉じる

review-expert は判定を以下 4 種のいずれかに必ず閉じる。質問テキスト / "判断保留" は禁止。

| 判定 | 意味 |
|------|------|
| `approve` | 問題なし。merge 可。op-merge 対象。 |
| `needs-fix` | 同 PR / worktree / branch で修正可能。op-run が specialist に再委任 (Review Fix Loop)。 |
| `needs-specialist-review` | finding の妥当性判断や修正方針決定に専門観点が必要。specialist に handoff。 |
| `blocked` | 自動修正不能。人間判断 / Issue 再設計 / loop 上限超過。op-run 自動継続停止。 |

---

## approve の条件 (すべて満たす AND)

```text
□ scope_in の要求をすべて満たしている
□ scope_out への侵入がない
□ acceptance criteria を実装が満たしている
□ 7 lens で merge blocker (Critical / High) がない
□ レビュー中に新 commit が積まれていない
   ※ review-expert は判定確定時の HEAD を `reviewed_head_sha` に記録する。
      レビュー後 commit の stale 判定は op-merge gate の責務。
□ PR 本文が pr-templates.md の品質要件を満たしている
□ 追加修正が不要
```

post-check の PASS / SKIPPED / manual override は **op-merge gate の責務**。
review-expert は post-check SKIPPED だけを理由に blocked へ倒さない (下記参照)。

すべて満たす場合のみ `approve`。1 つでも欠けるなら needs-fix / needs-specialist-review / blocked のいずれか。

### required post-check が SKIPPED のときの取り扱い

3.5-A (UX/UI post-check) または 3.5-B (Security post-check) が SKIPPED で、
PR に `pro-ux-ui-audit-skipped` / `pro-security-post-check-skipped` が残っている場合でも、
review-expert は SKIPPED ラベルだけを理由に `blocked` を返してはならない。

責務分離:

| 層 | 動作 |
|---|------|
| review-expert | PR 全体を global review する。PR 自体に問題がなければ `approve` を返してよい |
| op-run | review-expert の `review_result` に従って review 系 label を排他制御する |
| op-merge | skipped label が残る PR を gate 12〜16 で止める。manual override がある場合のみ例外通過を許可する |

つまり、`review_result = approve` かつ `pro-*-skipped` が残っている状態は許容される。
この状態は「global review は通過したが、post-check gate は未充足」という意味である。

merge 可否は op-merge が以下で決定する。

- skipped label なし → 通常 gate
- skipped label あり + manual override なし → merge 拒否
- skipped label あり + manual override あり → 例外通過

3.5-A / 3.5-B が **そもそも適用されない PR** (例: post_check_expert が null、UI 影響なし、
security 影響なし) は本条件の対象外。skipped label そのものが付かない。

---

## needs-fix の条件 (3 条件 AND を機械的に確認)

`needs-fix` は **すべての 3 条件** を満たす場合のみ返す。1 つでも欠ければ別判定に倒す。

```text
□ same-pr 内で修正できる
   - 元 Issue の scope_in に含まれる修正
   - PR の touch 範囲で修正可能 (新規 file 追加が必要でも、scope_in 内ならOK)
   - migration / 設計変更を伴わない

□ 単一 expert で完結する
   - 修正 expert が一意に決まる (例: feature-expert / debug-expert / refactor-expert / designer-expert)
   - 複数 expert の協調が必要なものは needs-specialist-review に倒す

□ 既知パターンの修正である
   - lens-catalog.md の典型 finding 例に該当する
   - reference / pattern catalog に明確な根拠がある
   - 修正方針が "明らか" (review-expert が自信を持って提示できる)
```

3 条件のうち 1 つでも欠けるなら `needs-specialist-review` に倒す。

### 判定例

| 状況 | 判定 |
|------|------|
| バグ修正 PR で再現テストが欠如、test-expert が単独で 1 本追加すれば済む | needs-fix (3 条件 AND 満たす) |
| UI button の focus が消えた、designer-expert で `outline` を戻せば済む | needs-fix (3 条件 AND 満たす) |
| IPC 経路に新たな攻撃面が増えたが、修正方針が複数あり判断必要 | needs-specialist-review (パターン未確定) |
| migration / rollback 周りの不具合、複数 expert (compatibility / debug / test) が必要 | needs-specialist-review (単一 expert で完結しない) |
| Issue の scope_out に明確に入る修正が必要 | blocked (scope_out) |
| review_round = 3 (= max_review_fix_rounds + 1, 最終許可 round) で needs-fix が残る | needs-fix (review-expert は通常判定。terminal blocked 化は op-run 4.5-1 の責務) |
| review_round > 3 で spawn された (規定外 spawn) | blocked (規定外 spawn / invalid review_round) |

---

## needs-specialist-review の条件 (いずれか満たす)

```text
□ same-pr 可否が不明
□ 担当 expert が一意に決まらない (複数 expert の協調が必要 / どの lens が主か曖昧)
□ 修正パターンが未知 (典型 finding 例に該当しない)
□ 専門判断後でないと修正方針を決められない (security 深掘り / 設計判断 / spec 解釈)
```

needs-specialist-review は **即修正ではなく専門判断 handoff**。
op-run はまず specialist に finding の妥当性 / 影響範囲 / 修正方針 / same-pr 可否を判断させる。

specialist の判断結果に応じて:
- same-pr で修正可能 → op-run が修正 expert に再委任 (needs-fix と同等扱い)
- scope 外 → 別 Issue 化、当該 finding は blocked
- 人間判断必要 → blocked

---

## blocked の条件 (いずれか満たす)

```text
□ scope_out: 元 Issue の scope_out に踏み込む修正が必要
□ 人間判断必要: 仕様変更 / 設計再判断 / business decision が必要
□ 規定外 spawn: review_round > max_review_fix_rounds + 1 (= 4 以上) で起動された
□ Issue 再設計必要: 元 Issue の scope を分割 / 再定義しないと修正できない
□ 別 Issue 化必要: 修正範囲が PR の scope を完全に超えている
□ 修正不能: 既存設計の制約で修正できない (技術的制約 / 互換性制約)
```

### round と blocked の境界 (canonical 表現)

`max_review_fix_rounds = 2` のもとで:

```text
review_round = 1 : 初回 review                        → review-expert は通常判定
review_round = 2 : 1 回目 fix 後の re-review          → review-expert は通常判定
review_round = 3 : 2 回目 fix 後の最終 re-review      → review-expert は通常判定 (needs-fix も返してよい)
review_round > 3 : 規定外 spawn                       → review-expert blocked / invalid
```

> **注**: 「最終許可 round (= 3) で needs-fix / needs-specialist-review が残った」ケースは、
> review-expert 側の blocked 条件 **ではない**。review-expert は通常通り判定 (needs-fix /
> needs-specialist-review) を返し、loop 上限超過の自動継続停止は **op-run controller (フェーズ4.5-1)** が
> terminal needs-fix → blocked に倒す。review-expert が round 3 で勝手に blocked に倒すと、
> op-run の集約ロジックと重複して状態が壊れる。
>
> **review-expert が自ら blocked にしてよいのは `review_round > max_review_fix_rounds + 1` (= 4 以上)
> の規定外 spawn のときだけ**。round 3 まではすべて通常判定 (approve / needs-fix /
> needs-specialist-review / blocked のうち blocked は他の blocked 条件 — scope_out / 人間判断 /
> Issue 再設計 / 修正不能 — を満たす場合に限る)。

blocked は **op-run 自動継続を停止**する。司令官は人間判断待ちの状態として完了報告に明記する。

---

## review_round と loop 上限

```text
max_review_fix_rounds: 2
```

review_round は **review attempt の通算回数** を意味する (= attempt count)。
fix round そのものではない。fix_round と review_round は次の関係:

```text
review_round 1 = 初回 review (= fix 0 回後の最初の review attempt)
review_round 2 = 1 回目の fix 後の re-review attempt
review_round 3 = 2 回目の fix 後の final re-review attempt (最終許可 round)

fix_round = review_round - 1
許可される review_round: 1..(max_review_fix_rounds + 1) = 1..3
```

つまり「review-expert が判定を返す試行の通し番号」が review_round であり、
review-expert は自分の試行に対して 1 origin の attempt count をそのまま meta に転写する。
fix round の進行管理は op-run controller の責務 (review_round そのものは review-expert の attempt 数)。

review-expert は spawn 時に `review_round` を受け取る (1 origin) →
- round 1: 初回 review (通常の判定)
- round 2: 1 回目の Review Fix Loop 後の re-review (通常の判定)
- round 3: 2 回目の Review Fix Loop 後の final re-review (通常の判定。round 3 だからといって自動 blocked にはしない)
- round 4 以上: 規定外 spawn、即 `blocked` (本来 op-run 側 4-2-pre で停止しているはず)

最終許可 round (= 3) で `needs-fix` / `needs-specialist-review` が返った場合の自動継続停止判断は
**op-run 側 (フェーズ4.5-1) の責務**であり、review-expert は通常通り判定を返してよい。
review-expert が round 3 で勝手に blocked に倒すと、op-run の集約ロジックと重複するので避ける。

---

## stale review の扱い

review 完了後に PR に新 commit が積まれた場合、その review は **stale** となる。

review-expert 自身は通常 stale を検出しない (spawn 時点で current head を見るため) が、以下を遵守する:

- `reviewed_head_sha` には判定確定時の HEAD SHA を必ず記録する
- 判定確定中に branch が動かないことを前提にする (op-run 側で worktree 管理)

stale 検出は op-merge の責務。op-merge は `reviewed_head_sha != 現在 HEAD` の PR を `pro-review-stale`
として扱い、merge 対象から外す。

---

## 判定フローチャート

```text
[review 完了]
   │
   ▼
review_round > max_review_fix_rounds + 1 (= 4 以上) または review_round > 3 ? ──── Yes ──→ blocked (規定外 spawn)
   │ No
   ▼
scope_out 違反 / 人間判断必要 / Issue 再設計必要 ? ──── Yes ──→ blocked
   │ No
   ▼
7 lens で Critical / High finding がある ?
   │ Yes
   ├──→ needs-fix 3 条件 AND を満たす ? ──── Yes ──→ needs-fix
   │                                              │
   │                                              No
   │                                              ▼
   │                                         needs-specialist-review
   │
   No
   ▼
レビュー中に新 commit が積まれていない ? ──── No ──→ 中断し直前 commit から再 review 依頼 (通常 op-run 側で防がれる)
   │ Yes
   │ (op-merge 側で reviewed_head_sha と現在 head を比較する stale gate が別途稼働)
   ▼
PR 本文が品質要件を満たす ? ──── No ──→ needs-fix (Spec / Refactor lens)
   │ Yes
   ▼
approve
```

判定根拠は `<!-- op-review-finding -->` の各 block で表現する (finding-schema.md)。

---

## label との対応関係 (op-run が付与、review-expert は提示のみ)

review-expert は **label を直接付与・剥奪しない**。コメント本文で「op-run が付与する想定の label」を
触れるに留める。実際の add / remove は **op-run フェーズ4-3 の `apply_review_labels` (排他制御テーブル)** が
canonical source of truth であり、本ファイルでは表を二重管理しない。

詳細は `~/.claude/skills/op-run/SKILL.md` の **「フェーズ4-3 ラベル遷移の正規表 (排他制御)」** を参照。
そこには以下が canonical に定義されている:

- `approve` / `needs-fix` / `needs-specialist-review` / `blocked` ごとの add / remove セット
- `pro-review-stale` / `pro-review-fix-in-progress` の中間状態をどこで剥がすか
- 排他制御の bash 実装 (`apply_review_labels` 関数)

review-expert がコメント本文で言及してよい label は次の 4 つに留める:

- `pro-reviewed` (approve 時)
- `pro-review-needs-fix` (needs-fix / needs-specialist-review 時)
- `pro-review-blocked` (blocked 時)

本ドキュメントに別表を持たない理由: 旧版で `pro-review-stale` / `pro-review-fix-in-progress` の
扱いが op-run 4-3 と差異を持ち、状態矛盾の温床になっていたため。
label 遷移は **op-run 4-3 を一本化された正** とする。
