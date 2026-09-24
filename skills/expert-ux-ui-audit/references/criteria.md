# Post-check 判定基準

op-run の apply 後、この PR の差分が Issue / デザインモックを満たし、使いやすさ・a11y を退化させていないかを判定する。

## Post-check (op-run)

### 入力

- PR diff (範囲は spawn prompt の指定どおり)
- Issue 本文の scope_in / scope_out / success_criteria / verification_steps
- デザインモック URL があれば `Artifact({action:"read", url})` で参照する。モックは見た目の目標で、実装は既存 design system を使うのが正しい
- apply 担当の完了報告 (States Covered / Skipped States の `not_applicable_reason` / States Preserved / Visual Quality Score)

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

- PASS — 問題なし
- PASS_WITH_NOTES — 進めてよいが注意点を残す
- BLOCK — 下記のいずれかが実装に残る。判断に必要な情報が不足する場合も BLOCK とし、Required Changes に不足情報と再実行条件を書く

返すのはこの 3 値のみ。問題が無くても PASS を明示して返す。

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
- `~/.claude/skills/_shared/design-ng.md` の NG を新たに持ち込んでいる (該当箇所と「代わりに」を Required Changes に書く)

apply 担当の Visual Quality Score が 85 未満なら BLOCK 候補として精査する。
モックとの差分で判断が要るもの (モックに無い状態、既存 component で表現できない等) は BLOCK にせず Notes に書く。

### 出力

1. 人間向けの自然文 PR コメントを 1 件投稿する (HTML marker なし)。見出しは `## UX/UI Post-check Result` の下に
   判定 (`PASS | PASS_WITH_NOTES | BLOCK (post-check head: <sha> / round: <N>)`) / 評価サマリ (2〜4 文) /
   観点別チェック (7 観点の表: `| # | 観点 | OK / NG / N/A | コメント |`) / Notes / Required Changes。
   Required Changes はファイル・component・token 名を挙げてコードレベルで書く
2. 同じ内容を構造化して返す: `verdict` / `required_changes[]` / `notes[]` (+ spawn prompt が指定する追加 field)。
   記録 (op-review-state) とラベル操作は司令官が行う

### post-check と scan の違い

post-check が見るのは「この PR の差分」だけ。scope_out や既存コードの問題を見つけても BLOCK / 起票はせず、
PR コメントに「scan 領域」として残すに留める。

## security 起点の auxiliary post-check

security-expert が `requires_aux_post_check: true` を返した PR で、security mitigation が誘発した UI / workflow 変更だけを見る。
save_as / open_file / export 等の capability の UI が残っているか (legitimate workflow) は security-expert の観点 7 が判定するので見ない。
判定は上記と同じ 3 値。

1. mitigation (上書き確認 / 削除 stage 等) で workflow の step 数が不必要に増えていないか
2. focus / keyboard / aria / contrast が退化していないか (WCAG 2.2 AA の新たな違反を作っていないか)
3. 新規 dialog / Toast の文言が明確で、操作を取り消せる・戻れるか
