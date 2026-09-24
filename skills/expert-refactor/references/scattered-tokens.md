# Scattered Semantic Tokens

散乱 token = システム内で意味を持つ値が複数箇所に直書きされ、変更時に同期修正漏れを生む状態。
単なる文字列重複ではなく、同じ意味の contract が散っている状態を指す。対象の種類は `refactor-taxonomy.md` の subtype。

## Detection Conditions

### Issue 化下限 (scan / patrol — 3 箇所基準)

すべて満たす場合のみ起票:

1. 同じ意味の literal が 3 箇所以上に散っている
2. 2 つ以上の layer / module / feature を跨いでいる
3. 既存の constants / enum / token / helper を迂回している (contract bypass)、または既存 contract が無く複数箇所が同じ意味値を個別に保持している (contract absent)
4. 変更時に同期修正が必要になる
5. path / IO / IPC / config / storage / route / design system / file type に関わる

同じ literal でも意味が違うもの (`"open"` が status / mode / event で別意味など) は分けて数える。

### apply 中の局所共通化下限 (op-run — 2 箇所基準)

scope_in 内に同じ意味の literal が 2 箇所以上あり意味同一性が確認できれば、scan finding が無くても局所共通化してよい。

- scope_in を越えない (新規 contract / shared util の作成は別 finding → 別 PR)
- 2 箇所だけを根拠に新規モジュール / 抽象化を作らない
- 純粋な `const` / `enum` の局所抽出に留める

## Ignore (ignored_noise)

人間向けコピー / log message / test description / 一度だけ使う局所値 / formatter で解決するもの /
既に token・enum・helper 経由のもの / 2 箇所程度の軽微な重複 (Issue 化下限に不足)

## Token Placement Policy

置き場は意味の性質で決める:

| 意味の性質 | 置き場 | 例 |
|---|---|---|
| feature 固有 token | feature 配下 | `features/report/report_paths.ts` |
| 複数 feature 共有の protocol / IPC / event name | shared contract | `shared/ipc/report_commands.ts` |
| domain value | domain 配下 | `domain/job/job_status.ts` |
| file system / output path policy | path policy layer | `src-tauri/src/path_policy/report_paths.rs` |
| design token | design system / token layer | `shared/design/tokens.ts` |

置き場が決められない token は共通化しない。global constants に逃がさず、`architecture_debt` finding か
`needs_human_decision` (`decision_type: "boundary"`) として返す。

## Apply Policy

- literal を意味単位に分類してから抽出する。external contract か internal token かを判定する
- 値ではなく意味で命名する (`"reports/html"` → `REPORT_OUTPUT_DIR_RELATIVE`)
- 置き場を責務境界に合わせ、既存の token / enum / helper があれば合流させる
- UI token / domain token / IO path token を混ぜない
- path token で OS / bundler / runtime 差 (Windows path / WSL / Tauri resource path) を無視しない

実値を変える必要が出たら仕様変更であり refactor の範囲外 (feature-expert / debug-expert へ)。
