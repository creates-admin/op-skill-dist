# Post-check 判定基準

op-run の apply 後、**この PR の差分** が Issue / デザインモックを満たし、使いやすさ・a11y を退化させていないかを判定する。

## Post-check (op-run)

### 入力

- PR diff: spawn prompt の指定どおり `git diff "origin/${OP_RUN_BASE_REF}...HEAD"` (triple-dot。`origin/main` 直書き・double-dot は使わない)
- Issue 本文の scope_in / scope_out / success_criteria / verification_steps
- デザインモック URL があれば `Artifact({action:"read", url})` で参照する。モックは見た目の目標で、実装は既存 design system を使うのが正しい
- apply 担当の完了報告 (States Covered / Skipped States の `not_applicable_reason` / States Preserved / Visual Quality Score)

security-expert 起点の auxiliary post-check は、spawn prompt が指定する観点 (security mitigation が誘発した UI / workflow 変更) だけを見る。

### 検証 7 観点

| # | 観点 | NG 例 |
|---|------|-------|
| 1 | Issue / モックと実装差分が一致しているか | モックに無い画面構成、Issue に無い component の新規作成 |
| 2 | 該当する状態が実装されているか | 一覧の empty state 未実装。該当しない状態に `not_applicable_reason` がない |
| 3 | error / loading が抜けていないか (該当する場合) | try/catch だけで UI feedback 無し |
| 4 | keyboard / focus を壊していないか | `outline:none` 未代替、`<div @click>`、tab 順序破壊 |
| 5 | 既存より操作がわかりにくくなっていないか | クリック数増加、戻る導線消失 |
| 6 | Issue 範囲外の redesign が混入していないか | scope_out のファイル変更、無関係な component の見た目変更 |
| 7 | 美しさのために使いやすさが退化していないか | アニメーションで操作がブロックされる、視覚優先で keyboard 操作が壊れる |

6 状態を機械的に全要求しない。該当しない状態に `not_applicable_reason` があれば OK (`recovery-and-states.md` の早見表)。
hard-coded style / token bypass そのものは BLOCK 対象外 (designer-expert の領域)。a11y・復帰性を直接壊す場合のみ BLOCK。

### 判定

- **PASS** — 問題なし
- **PASS_WITH_NOTES** — 進めてよいが注意点を残す
- **BLOCK** — 下記のいずれかが実装に残る。判断に必要な情報が不足する場合も BLOCK とし、Required Changes に不足情報と再実行条件を書く

返すのはこの 3 値のみ。問題が無くても PASS を明示して返す (空で返さない)。

### BLOCK 条件

- primary task が不明 (この画面で何を完了するか説明できない)
- 該当する状態が未実装 (`not_applicable_reason` の説明もない)
- error から復帰できない (該当する場合)
- 危険操作が確認 / Undo なしで動く
- focus が見えない (`:focus-visible` 未実装、`outline:none` 未代替)
- keyboard 到達不可 (`<div @click>` 残存等)
- contrast 不足 (本文 4.5:1 / 非テキスト 3:1 を割る)
- style / animation / layout の変更で focus / contrast / keyboard / 状態の可視性が退化している
- モック / Issue で約束した UI が実装されていない
- scope_out のファイルに無関係な変更が入っている

apply 担当の Visual Quality Score が 85 未満なら BLOCK 候補として精査する。
モックとの差分で判断が要るもの (モックに無い状態、既存 component で表現できない等) は BLOCK にせず Notes に書く。

### 出力

1. 人間向けの自然文 PR コメントを 1 件投稿する (HTML marker は付けない)。見出し: 判定 / 評価サマリ / 観点別チェック / Notes / Required Changes
2. 同じ内容を司令官に構造化して返す: `verdict` / `required_changes[]` / `notes[]` (+ spawn prompt が指定する追加 field)。
   記録 (op-review-state) とラベル操作は司令官が行う

観点別チェックは表で書く:

```markdown
| # | 観点 | 結果 | コメント |
|---|------|------|---------|
| 1 | Issue / モックとの一致 | OK / NG | <NG なら理由> |
| 2 | 該当状態の実装 | OK / NG | <欠落状態> |
```

Required Changes はコードレベルで具体的に書く:

```markdown
- `features/job-board/JobList.vue` に EmptyState を追加 (「該当する求人がありません」+「+ 新規登録」、`useJobs()` が空のとき表示)
- `features/job-board/JobDetail.vue` の削除ボタンに既存 `<ConfirmDialog>` を使い、default focus を「キャンセル」に置く
- `components/IconButton.vue` の `outline: none` を token `--color-focus-ring` の `:focus-visible` ring に置き換える
```

### 自己点検

- [ ] 7 観点を順に通したか / モックがあれば参照したか
- [ ] 6 状態を機械的に全要求していないか
- [ ] keyboard / focus / contrast を `a11y-checklist.md` で確認したか
- [ ] diff に scope_out の変更が無いか
- [ ] BLOCK 時の Required Changes がコードレベルか

### post-check と scan の違い

post-check が見るのは「この PR の差分」だけ。scope_out や既存コードの問題を見つけても BLOCK / 起票はせず、
PR コメントに「scan 領域」として残すに留める。
