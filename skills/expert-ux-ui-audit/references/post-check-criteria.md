# Post-Check Criteria (op-run の apply 後監査)

ux-ui-audit-expert が **op-run** から呼ばれたとき、designer-expert が Run Mode で
実装を完了し PR を open した直後に、その実装結果に対して PASS / PASS_WITH_NOTES / BLOCK を
判定するための基準。

## 入力

- PR diff (`git diff "origin/${BASE_REF}...HEAD"` / **triple-dot 必須**)
  - `BASE_REF=$(gh pr view <N> --json baseRefName --jq '.baseRefName')` で base branch を解決し固定する (origin/main ハードコード禁止 / release / develop / hotfix branch も対応)
  - 事前に `git fetch origin "$BASE_REF:refs/remotes/origin/$BASE_REF"` で `origin/${BASE_REF}` を最新化する (refspec 明示形式。bare 形式は環境差で更新されないことがある)
  - double-dot (`origin/${BASE_REF}..HEAD`) は base 進行が混じるので使わない
- Issue 本文 + Design Plan
- worktree 内の変更後ファイル

---

## 検証 7 観点

| # | 観点 | NG 例 |
|---|------|-------|
| 1 | Design Plan と実装差分が一致しているか | Plan 未記載の component が新規作成されている |
| 2 | **Applicable States** が実装されているか | UI 種別に該当する applicable state (例: 一覧画面の empty state) が未実装、該当しない state に not_applicable_reason がない |
| 3 | error / loading が抜けていないか (該当する場合) | try/catch だけで UI feedback 無し |
| 4 | keyboard / focus を壊していないか | `outline:none`、`<div @click>` 残存、tab 順序破壊 |
| 5 | 既存より操作がわかりにくくなっていないか | クリック数増加、戻る導線消失 |
| 6 | Issue 範囲外の redesign が混入していないか | scope_out のファイル変更、無関係な component の見た目変更 |
| 7 | 美しさのために使いやすさが退化していないか | アニメーション過多で操作がブロックされる、視覚優先で keyboard 操作が壊れる |

> **Applicable States vs 機械的 6 状態**: 6 状態 (loading/success/failure/empty/disabled/focus) を
> 機械的に全要求してはいけない。Design Plan の Applicable States 節に該当する state のみ実装、
> 該当しない state は apply 側の完了報告に `not_applicable_reason` が書かれていれば PASS。
> (例: 静的 about ページに empty / disabled は不要、コミットメッセージで省略理由を確認)

> hard-coded style 混入そのものは **designer-expert の post-check 領域**。本エージェントが
> post-check で見るのは、それが a11y や使いやすさを直接破壊している場合のみ。

---

## 判定 (3 択)

| 判定 | 意味 | 司令官の次の動作 |
|------|------|------------------|
| **PASS** | 問題なし、レビューに進める | review-expert global review へ |
| **PASS_WITH_NOTES** | レビュー進行可、ただし軽微な観点を PR コメントに残す | コメント追加 → review-expert global review へ |
| **BLOCK** | UX/UI の必須要件が欠落、designer-expert に差し戻し | needs-fix で designer に戻す (needs-fix-applied は廃止) |

### BLOCK 判定の絶対条件 (Hard blockers)

`visual-quality-rubric.md` の Hard blockers が 1 つでも実装に残るなら BLOCK。

- Design Plan の Applicable States に挙げられた state が未実装
  (該当しない state に not_applicable_reason 説明があるなら OK)
- error から復帰できない (該当する場合)
- 危険操作が確認 / Undo なしで動く
- focus が見えない (`outline:none` 未代替)
- keyboard 到達不可 (`<div @click>` 残存等)
- contrast 不足 (本文 4.5:1 / 非テキスト 3:1 を割る)
- Design Plan で約束した UI が実装されていない
- Issue scope_out のファイルに無関係な変更が入っている

> 「6 状態すべてが実装されていないから BLOCK」は不可。
> 静的画面 / toast / 単純 modal などは applicable state が少なく、
> not_applicable_reason 付きで省略されているなら PASS。

---

## post-check モードの出力フォーマット

**冒頭に machine-readable header `<!-- op-ux-ui-audit -->` を必ず置く。**
header の完全な書式 (audit_result / blocking_count / notes_count 等) は
`~/.claude/skills/_shared/pr-templates.md` の「op-run: UX/UI Post-check Result」節に
一次定義があり、本ファイルでは二重保持しない。op-run はこの header と
`<!-- op-ux-ui-audit -->` マーカーから判定を直接 parse する。

scan / patrol は検出 0 件で `[]` を返してよいが、**gate / post-check では `[]` を返さない**。
問題が無い場合も machine-readable header 付きで PASS を返す。

gate モードと同じテーブル形式で出力する (`gate-criteria.md` 参照)。

`Required Changes` (BLOCK 時) は **「実装で追加すべきコード」レベルの具体性** を持たせる。

### Required Changes の書き方 (例)

```markdown
### Required Changes

- `features/job-board/JobList.vue` に EmptyState コンポーネントを追加
  - 「該当する求人がありません」 + 「+ 新規登録」ボタン
  - `useJobs()` の返り値が空の場合に表示
- `features/job-board/JobDetail.vue` の削除ボタンに確認 dialog を追加
  - 既存 `<ConfirmDialog>` (components/ConfirmDialog.vue) を使用
  - default focus は「キャンセル」に置く
- `components/IconButton.vue` の `outline: none` を `:focus-visible` の代替 ring に置き換え
  - design system token: `--color-focus-ring`
```

---

## post-check 時の自己点検

- [ ] Design Plan の `Components to Use` / `Tokens to Use` と差分が一致するか
- [ ] Design Plan の `Applicable States` がすべて実装されているか (該当しない state に not_applicable_reason 説明があれば PASS)
- [ ] 6 状態を機械的に全要求していないか (Applicable States 節に無い state を「未実装」として BLOCK しない)
- [ ] Hard blockers を `visual-quality-rubric.md` で確認したか
- [ ] PR diff に scope_out のファイル変更が無いか
- [ ] keyboard / focus / contrast を `a11y-checklist.md` で再確認したか
- [ ] BLOCK 時に Required Changes が **コードレベルで** 具体化されているか
- [ ] designer の自己採点 (実 score) を見て、85 未満なら BLOCK 候補として精査したか

---

## post-check と scan の違い

scan は「画面全体に問題があるか」を網羅的に audit する。
post-check は「**この PR の差分が** Design Plan を満たすか」だけを見る。

- post-check で scope_out の問題を見つけても、起票はしない (それは scan / patrol の仕事)
- post-check で BLOCK するのは「この PR の差分が問題」のときだけ
- 既存コードの問題は **PR コメントに「scan 領域」として残す** に留める
