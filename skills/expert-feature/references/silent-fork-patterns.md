# expert-feature silent fork / implementation gap パターン

Issue 化の前に SKILL.md の severity / confidence / `asset_map` / `needs_human_decision` 判定を通す。

## catalog 索引 + enum 対応表

### top 7 catalog

| # | bulk_group | 検出兆候 |
|---|---|---|
| 1 | `feature-duplicate-helper` | 既存 helper / utility / crate と機能重複した自前実装 |
| 2 | `feature-bypass-wrapper` | 既存 wrapper を経由せず直接 invoke / fetch / IO |
| 3 | `feature-adhoc-error-type` | 既存 error type / Result alias を使わず ad-hoc 新設 (`AppError` があるのに `Box<dyn Error>`) |
| 4 | `feature-pattern-deviation` | 類似機能と構造が大きく外れた孤立実装 |
| 5 | `feature-missing-error-path` | 類似機能にある error / loading / empty state がこの機能だけ欠けている |
| 6 | `feature-stale-todo` | 本番影響レベルの放置 TODO / FIXME (認証パスの `// TODO: implement error handling` 等) |
| 7 | `feature-spec-divergence` | 仕様書 / 型定義 / コメントと実装の乖離 (`AppResult` 宣言なのに `Result<T, String>`) |

同 bulk_group 5 件以上は op-scan がバッチ Issue 化。1 Issue 最大 10 件。

### bulk_group / issue_type / action 対応表 (固定)

| bulk_group | issue_type | action |
|---|---|---|
| `feature-duplicate-helper` | `duplicate_helper` | `replace_with_existing_asset` |
| `feature-bypass-wrapper` | `bypass_wrapper` | `replace_with_existing_asset` |
| `feature-adhoc-error-type` | `adhoc_error_type` | `replace_with_existing_asset` |
| `feature-pattern-deviation` | `pattern_deviation` | `align_to_pattern` |
| `feature-missing-error-path` | `missing_error_path` | `complete_missing_state` |
| `feature-stale-todo` | `stale_todo` | `add_implementation` |
| `feature-spec-divergence` | `spec_divergence` | `align_to_pattern` |

`feature-stale-todo` が `complete_missing_state` 寄りでも action は `add_implementation` を採用する。例外的な action を使う場合は `needs_human_decision.required: true` を併記する。

各カテゴリの「判定」は action の方向性であり即実装の許可ではない。`asset_map` で代替先資産が確定するまで実装に入らない。
`asset_map.reusable_assets` が空なら `needs_human_decision` (options + safest_default) で返し、推測で「これを使えば良い」と書かない。

---

## 1. feature-duplicate-helper

```bash
grep -rln "fn sanitize\|function sanitize\|sanitize_html\|escapeHtml" src/ | sort     # 同義関数名の複数存在
grep -rln "pub fn\|export function\|export const" src/utils/ src/lib/ src/helpers/     # 共通 utility の所在
```

判定: 同じ意味の処理が共通 utility / crate / composable に既にあり、呼び出せる依存関係にあれば silent fork。
既存が同一 crate 内の private fn でも、(a) 集約先の共通 module が既にある、または (b) module doc / CLAUDE.md が集約方針を宣言しているなら
可視性を上げれば再利用できるので silent fork として扱う。入出力契約 (型・エスケープ範囲・副作用) が実は違うなら別機能で対象外。

例: `src/utils/sanitize.rs::sanitize_html` があるのに `commands/comment.rs` が `s.replace('<', "&lt;")` を自前実装 → `replace_with_existing_asset`。
Vue なら既存 `useFetch` があるのに ref 3 本 + try/catch/finally を自前で組む、Flutter なら `ApiClient` があるのに `http.get` 直叩き。

## 2. feature-bypass-wrapper

```bash
grep -rn "invoke(" src/ --include='*.ts' --include='*.vue' | grep -v "src/api/"
grep -rn "fetch(\|axios\." src/ --include='*.ts' --include='*.vue' | grep -v "src/api/\|src/lib/"
grep -rn "std::fs::\|tokio::fs::" src-tauri/src/ | grep -v "src-tauri/src/io/\|src-tauri/src/path/"
```

判定: wrapper が横断的関心 (認証ヘッダ / error 正規化 / path scope 検証 / retry / ログ) を担っていれば、経由しない呼び出しは silent fork。
薄い再 export に過ぎない wrapper なら保守コスト影響で severity を判断する (自動的に high にしない)。
wrapper が capability scope 検証や path canonicalize を担っている場合の bypass は security 経路なので **critical**。

例: `src/api/case.ts::getCase` があるのに `CaseCard.vue` が `invoke<Case>('get_case', ...)` を直叩き → `getCase(id)` 経由へ。

## 3. feature-adhoc-error-type

```bash
grep -rn "pub enum.*Error\|pub type.*Result\|export type AppError" src/ src-tauri/src/     # 共通 error type の特定
grep -rn "Box<dyn Error>\|Result<.*, String>\|Result<.*, Box<dyn" src-tauri/src/
grep -rn "catch (e: any)\|class.*Error extends Error" src/
```

判定: 共通 error type / Result alias があり、同じ層の既存関数が実際にそれを使っているなら、新設された `Box<dyn Error>` / `Result<_, String>` / 独自 error class は silent fork。
共通 type が存在しなければ対象外。外部 crate 境界の変換点は、変換後に共通 type へ揃っているかで判断する。

## 4. feature-pattern-deviation

```bash
ls -la src/pages/case/ src/pages/project/ src/pages/invoice/     # 同種ディレクトリの構成比較
grep -rn "from '@/api/" src/pages/ | sort | uniq -c               # import path の揺れ
```

判定: 同種ディレクトリ 2 つ以上が同一構成を共有していれば、それが揃っているパターン。3 つ目だけ命名 / 配置 / レイヤー分割が外れていれば deviation。
比較対象が 1 つしかなければ断定せず `needs_human_decision`。

例: `case/` と `project/` が `XxxList.vue` / `XxxDetail.vue` / `composables/useXxx.ts` / `types.ts` で揃っているのに
`invoice/` だけ `index.vue` / `detail.vue` / `api.ts` → `align_to_pattern` (template_files に CaseList.vue / CaseDetail.vue)。
Rust なら `get_* / list_* / create_*` で揃う中に `fetch_invoice` / `getInvoiceList`。

## 5. feature-missing-error-path

```bash
grep -rn "v-if=\"loading\|v-if=\"error\|v-if=\"empty\|<Skeleton\|<ErrorBanner\|<EmptyState" src/pages/
grep -rn "try {" src/api/ src/composables/ -A 20 | grep -E "catch|finally"
```

判定: 同種の手本に loading / error / empty / success の分岐が揃い、対象側は success のみ (または一部欠如) なら silent fork。
データ取得を伴わない静的画面・常に非空が保証される一覧は対象外。

例: `CaseList.vue` は `Skeleton v-if="loading"` / `ErrorBanner v-else-if="error"` / `EmptyState v-else-if="cases.length === 0"` を持つのに
`CaseDetail.vue` は `<div v-if="case">` のみ → `complete_missing_state`。Flutter なら sealed state の `switch` 4 分岐の有無。

## 6. feature-stale-todo

```bash
git grep -n "TODO\|FIXME\|XXX\|HACK" -- '*.rs' '*.ts' '*.vue' '*.dart'
grep -rn "TODO\|FIXME" src/auth/ src-tauri/src/auth/ src/payment/ src-tauri/src/db/      # Critical 機能の TODO
git blame --date=short -- path/to/file.rs | grep -E "TODO|FIXME"                         # 導入日 (6 ヶ月以上前を候補に)
```

判定: TODO / FIXME が認証 / 課金 / データ削除 / 永続化など Critical 機能の実行経路上にあり、不完全なまま本番で通ってしまう場合のみ Critical / High。
導入から 6 ヶ月以上は昇格根拠になるが、それ単独では起票しない。

例: `auth/session.rs` の `validate_token` が `// TODO: implement proper validation` の下で `!token.is_empty()` のみ → `add_implementation`、critical。

## 7. feature-spec-divergence

```bash
grep -rn "fn.*-> Result<" src-tauri/src/ -A 1 | grep -E "Result<.*String>|Box<dyn"
diff <(grep -E '^\s*\w+:' openapi.yaml) <(grep -E 'pub \w+:' src-tauri/src/types.rs)     # schema と struct の field 名
```

判定: 型宣言 / 仕様書 / コメントが約束する契約と実装が食い違い、その宣言を信じた呼び出し側が壊れる場合に silent fork。
コメントが古いだけで呼び出し側に実害が無いなら medium (起票しない)。

例: `-> AppResult<Case>` なのに `map_err(|e| anyhow::anyhow!("{e}"))` → `align_to_pattern` (`map_err(AppError::from)`)、high。
TS なら `'open' | 'closed' | 'archived'` に狭めた型へ `s as Case['status']` で任意文字列を通している。
