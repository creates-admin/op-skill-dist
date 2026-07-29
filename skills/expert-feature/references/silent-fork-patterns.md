# expert-feature silent fork / implementation gap 全集

<!--
機能概要: top 7 bulk_group catalog (検出兆候列 + enum 対応表の正本) と、その言語別具体例 + 検出 grep の辞典
作成意図: 「既存資産があるのに重複実装した」「類似機能にあるパターンが欠けている」の証拠集。
         判定根拠を持って Issue 化・apply できるようにする補助資料
注意点: agent は必要時のみ Read。SKILL.md の severity / confidence / asset_map を必ず通す
-->

silent fork / implementation gap 7 カテゴリの言語別具体例と検出 grep。
**Issue 化前に SKILL.md の severity / confidence / `asset_map` 必須記載と `needs_human_decision` 判定を必ず通す** (`needs_human_judgment` は旧名の deprecated alias、詳細は SKILL.md 冒頭の用語注記)。

---

## catalog 索引 + enum 対応表

> **本節が catalog 兆候列と bulk_group / issue_type / action 対応表の正本**
> (2026-07-29 の分割で SKILL.md 本文から移設。SKILL.md 側には bulk_group 7 名の列挙と
> action enum 5 値の意味表だけが残る)。

### top 7 catalog (bulk_group と検出兆候)

scan モードで検出する主要パターン。各カテゴリの言語別具体例・検出 grep は本ファイル §1〜§7。

| # | bulk_group | 検出兆候 |
|---|-----------|---------|
| 1 | `feature-duplicate-helper` | 既存 helper / utility / crate と機能重複した自前実装 (e.g., 既存 sanitize 関数があるのに別ファイルで再実装) |
| 2 | `feature-bypass-wrapper` | 既存 wrapper を経由せず直接 invoke / fetch / IO (e.g., `src/api/` wrapper を skip して invoke 直叩き) |
| 3 | `feature-adhoc-error-type` | 既存 error type / Result alias を使わず ad-hoc 新設 (e.g., プロジェクト共通 `AppError` があるのに `Box<dyn Error>` で投げる) |
| 4 | `feature-pattern-deviation` | 類似機能と構造が大きく外れた孤立実装 (e.g., 同種画面の構成順と全く違う配置) |
| 5 | `feature-missing-error-path` | 類似機能には error / loading / empty state があるのにこの機能だけ欠けている (e.g., 同種一覧画面に loading skeleton があるのにこの画面はなし) |
| 6 | `feature-stale-todo` | 本番影響レベルの放置 TODO / FIXME (e.g., `// TODO: implement error handling` が認証パスに残存) |
| 7 | `feature-spec-divergence` | 仕様書 / 型定義 / コメントと実装の乖離 (e.g., 型は `Result<T, AppError>` 宣言だが実装は `Result<T, String>`) |

5 件以上の同 bulk_group は op-scan がバッチ Issue 化。1 Issue 最大 10 件 (apply エージェントの一撃巨大修正を防ぐため)。

### bulk_group / issue_type / action enum 対応表 (固定)

scan 出力 / Issue 化 / apply の解釈ズレを防ぐため、3 フィールドの対応を **固定**する。
apply agent はこの対応表に従って動作を選ぶ。

| bulk_group | issue_type | action |
|------------|-----------|--------|
| `feature-duplicate-helper` | `duplicate_helper` | `replace_with_existing_asset` |
| `feature-bypass-wrapper` | `bypass_wrapper` | `replace_with_existing_asset` |
| `feature-adhoc-error-type` | `adhoc_error_type` | `replace_with_existing_asset` |
| `feature-pattern-deviation` | `pattern_deviation` | `align_to_pattern` |
| `feature-missing-error-path` | `missing_error_path` | `complete_missing_state` |
| `feature-stale-todo` | `stale_todo` | `add_implementation` |
| `feature-spec-divergence` | `spec_divergence` | `align_to_pattern` |

action enum の意味は SKILL.md 本文「silent fork / implementation gap catalog」節の表を参照
(apply が毎回必要とするため本文側に残置)。

> **特例**: `feature-stale-todo` は内容によっては `complete_missing_state` 寄りになることもあるが、
> apply 入力としては **`add_implementation` を採用**する (新規実装が主体のため)。
> 例外的な action を使う場合は `needs_human_decision.required: true` を併記する
> (`_shared/invocation-mode.md` の正規スキーマに従う)。

---

## 判定表記の統一ポリシー

本辞典の各カテゴリには「判定」が付くが、これは **action の方向性** を示すもので、
**即実装の許可ではない**。bulk_group / issue_type / action の対応表は
上記「catalog 索引 + enum 対応表」節が正本、action enum 5 値の意味は SKILL.md 本文が正本。

> **重要**: 「判定: replace」と書かれていても、**`asset_map` で代替先資産が確定するまで実装に入らない**。
> agent は判定文の勢いではなく `severity` / `confidence` / `needs_human_decision` の組み合わせに従う。

---

## 1. feature-duplicate-helper (重複実装)

専用 crate / utility / helper があるのに、自前で同じ機能を実装している。

### 検出方法

```bash
# 同じ意味の関数名が複数ファイルに存在する (粗い指標)
grep -rln "fn sanitize\|function sanitize\|sanitize_html\|escapeHtml" src/ | sort

# 既存 utility module を import せず自前実装している箇所
# 1. 共通 utility のパスを特定
grep -rln "pub fn\|export function\|export const" src/utils/ src/lib/ src/helpers/

# 2. その関数名を使うべき場所で自前実装が見えるか
grep -rn "fn parse_date\|function parseDate" src/ --include='*.rs' --include='*.ts'
```

### 判定基準

**同じ意味の処理が共通 utility / crate / composable に既に存在し、そこから呼び出せる依存関係にある**なら silent fork。
既存実装が同一 crate / module 内の private fn で「そのままは呼べない」場合でも、
(a) 集約先の共通 module が既に存在する、または (b) module doc / CLAUDE.md が集約方針を宣言している なら
**可視性を上げれば再利用できる**ので silent fork として扱う (「private だから別実装で良い」は成立しない)。
入出力契約が実は違う (扱う型・エスケープ範囲・副作用が異なる) なら重複ではなく別機能なので対象外にする。

### 例 (Rust / Tauri)

```rust
// src/utils/sanitize.rs に sanitize_html(&str) -> String が既に存在
// しかし src/commands/comment.rs では自前で実装
// src/commands/comment.rs
fn strip_tags(s: &str) -> String {
    // 自前で <、> を escape する処理を書いている (silent fork)
    s.replace('<', "&lt;").replace('>', "&gt;")
}
```

判定: **replace_with_existing_asset**。
`asset_map.reusable_assets` に `src/utils/sanitize.rs::sanitize_html` を明記し、apply で置き換え。

他言語も同型:

- **Vue 3 / TypeScript**: 既存 `src/composables/useFetch.ts` (fetch + loading / error 管理) があるのに、
  ページ側で `ref` を 3 本並べて try / catch / finally を自前で組んでいる → `useFetch` に切り替え。
- **Flutter / Dart**: 既存 `lib/core/network/api_client.dart` (Dio wrapper) があるのに repository が
  `http.get` を直叩き → `ApiClient` 経由に切り替え (wrapper bypass 寄りなら 2 を優先)。

---

## 2. feature-bypass-wrapper (wrapper bypass)

既存 wrapper を経由せず直接 invoke / fetch / IO を叩いている。

### 検出方法

```bash
# Tauri: invoke 直叩き (本来 src/api/ wrapper 経由のはず)
grep -rn "invoke(" src/ --include='*.ts' --include='*.vue' | grep -v "src/api/"

# fetch / axios 直叩き (本来 ApiClient wrapper 経由のはず)
grep -rn "fetch(\|axios\." src/ --include='*.ts' --include='*.vue' | grep -v "src/api/\|src/lib/"

# Rust: std::fs / tokio::fs 直叩き (本来 PathManager 等経由のはず)
grep -rn "std::fs::\|tokio::fs::" src-tauri/src/ | grep -v "src-tauri/src/io/\|src-tauri/src/path/"
```

### 判定基準

wrapper が **横断的関心** (認証ヘッダ / error 正規化 / path scope 検証 / retry / ログ) を担っているなら、
それを経由しない呼び出しは常に silent fork。wrapper が横断的関心を持たない薄い再 export に過ぎない場合は、
bypass による保守コスト影響を考慮して severity を判断する (自動的に high とはしない)。
**wrapper が capability scope 検証や path canonicalize を担っている場合の bypass は security 経路なので
severity: critical** (単なる保守性の問題ではない)。

### 例 (Tauri v2 + Vue 3)

```ts
// src/api/case.ts に invoke wrapper が既に存在
// しかし src/components/CaseCard.vue で直叩き
// src/components/CaseCard.vue
import { invoke } from '@tauri-apps/api/core'
const case = await invoke<Case>('get_case', { id: props.id })
// ← 本来 src/api/case.ts::getCase(id) を経由するはず
```

判定: **replace_with_existing_asset**。
`getCase(id)` wrapper 経由に切り替え。

他言語も同型:

- **Rust / Tauri**: `src-tauri/src/path/manager.rs` の canonicalize + scope 検証 wrapper があるのに
  command が `std::fs::read_to_string(path)` を直叩き → PathManager 経由に切り替え。
  capability scope 検証を飛ばして read しているため **severity: critical**。

---

## 3. feature-adhoc-error-type (ad-hoc error type)

既存 error type / Result alias を使わず ad-hoc に新設している。

### 検出方法

```bash
# プロジェクト共通 error type の特定
grep -rn "pub enum.*Error\|pub type.*Result\|export type AppError" src/ src-tauri/src/

# その他のファイルで Box<dyn Error> / String error / ad-hoc enum が増えていないか
grep -rn "Box<dyn Error>\|Result<.*, String>\|Result<.*, Box<dyn" src-tauri/src/

# TypeScript: catch (e: any) や独自 error class
grep -rn "catch (e: any)\|catch (err: any)" src/
grep -rn "class.*Error extends Error" src/
```

### 判定基準

プロジェクト共通の error type / Result alias が存在し、**同じ層の既存関数が実際にそれを使っている**なら、
新設された `Box<dyn Error>` / `Result<_, String>` / 独自 error class は silent fork。
共通 type がそもそも存在しない場合は対象外。外部 crate 境界での変換点は、変換後に共通 type へ揃っているかを見て判断する。

### 例 (Rust)

```rust
// src-tauri/src/error.rs に AppError + AppResult<T> が既存
// しかし src-tauri/src/commands/foo.rs で
fn foo() -> Result<String, Box<dyn std::error::Error>> {
    // ← AppError / AppResult を使うべき
}
```

判定: **replace_with_existing_asset**。
AppResult<String> に揃える。Tauri の Result serialize にも整合。

他言語も同型:

- **TypeScript**: `src/types/error.ts` に AppError + AppResult<T> があるのに、`src/api/foo.ts` が
  `type FooError = { code, message }` を ad-hoc 新設し `Promise<{data} | {error}>` を返している
  → AppResult<Foo> に揃える。

---

## 4. feature-pattern-deviation (孤立実装)

類似機能と構造が大きく外れている。命名 / ファイル配置 / レイヤー構成が揃っていない。

### 検出方法

```bash
# 同種ディレクトリのファイル構成を比較
ls -la src/pages/case/
ls -la src/pages/project/
ls -la src/pages/invoice/
# ← 命名 / ファイル数 / 構成が揃っているか目視

# import paths の揺れ
grep -rn "from '@/api/" src/pages/ | sort | uniq -c
# 一部だけ別パスから import していたら deviation の兆候
```

### 判定基準

**同種ディレクトリ 2 つ以上が同一構成を共有していれば、それが「揃っているパターン」**。
3 つ目だけが命名 / 配置 / レイヤー分割で外れているなら deviation。
比較対象が 1 つしかないものは「パターン」と呼べないので、断定せず `needs_human_decision` に倒す。

### 例 (Vue 3)

```text
src/pages/case/
  CaseList.vue
  CaseDetail.vue
  CaseForm.vue
  composables/useCase.ts
  types.ts

src/pages/project/
  ProjectList.vue
  ProjectDetail.vue
  ProjectForm.vue
  composables/useProject.ts
  types.ts

src/pages/invoice/        ← deviation
  index.vue              ← 命名規則が違う (ListではなくIndex)
  detail.vue              ← 小文字
  api.ts                  ← composables/ ではない
```

判定: **align_to_pattern**。
case / project の構成に揃える。`asset_map.template_files` に CaseList.vue + CaseDetail.vue を指定。

他言語も同型:

- **Rust / Tauri**: `commands/case.rs` `commands/project.rs` が `get_* / list_* / create_*` で揃っているのに
  `commands/invoice.rs` だけ `fetch_invoice` / `getInvoiceList` (動詞もケースも不統一)
  → `get_invoice` / `list_invoices` / `create_invoice` に揃える。

---

## 5. feature-missing-error-path (欠けている状態)

類似機能には error / loading / empty state があるのに、この機能だけ欠けている。

### 検出方法

```bash
# Vue: loading / error / empty テンプレが揃っているか
grep -rn "v-if=\"loading\|v-if=\"error\|v-if=\"empty\|<Skeleton\|<ErrorBanner\|<EmptyState" src/pages/

# どのページに何が揃っているかを比較表で確認
# (loading / error / empty / success の 4 状態が揃うべき)

# Rust: error 経路の handler が揃っているか
grep -rn "Err(\|return Err\|\?\s*;" src-tauri/src/commands/

# TypeScript: catch ブロックの存在確認
grep -rn "try {" src/api/ src/composables/ -A 20 | grep -E "catch|finally"
```

### 判定基準

**同種の手本に loading / error / empty / success の分岐が揃っており、対象側は success のみ (または一部欠如)**
の場合に silent fork。データ取得を伴わない静的画面・常に非空が保証される一覧は対象外。

### 例 (Vue 3)

```vue
<!-- src/pages/case/CaseList.vue (手本) -->
<template>
  <Skeleton v-if="loading" :lines="5" />
  <ErrorBanner v-else-if="error" :message="error" />
  <EmptyState v-else-if="cases.length === 0" />
  <CaseTable v-else :cases="cases" />
</template>

<!-- src/pages/case/CaseDetail.vue (gap) -->
<template>
  <div v-if="case">{{ case.title }}</div>
  <!-- ← loading / error / empty の 3 状態が欠如 -->
</template>
```

判定: **complete_missing_state**。
CaseList.vue を手本に loading / error / empty を移植。

他言語も同型:

- **Flutter / Dart**: 手本 `case_list_page.dart` が sealed state を `switch` で 4 分岐
  (Loading → SkeletonList / Error → ErrorBanner / Empty → EmptyState / Loaded → ListView) しているのに、
  `case_detail_page.dart` は `return Text(case.title)` のみで success 以外が全欠如
  → 手本の分岐構造に揃える。

---

## 6. feature-stale-todo (本番影響レベルの死蔵 TODO)

放置 TODO / FIXME のうち、本番運用に支障あるレベルのもの。

### 検出方法

```bash
# 全 TODO / FIXME 抽出 (現存箇所)
grep -rn "TODO\|FIXME\|XXX\|HACK" src/ src-tauri/src/ lib/ \
  --include='*.rs' --include='*.ts' --include='*.vue' --include='*.dart'

# git grep でも同じ (高速、tracked file のみ)
git grep -n "TODO\|FIXME\|XXX\|HACK" -- '*.rs' '*.ts' '*.vue' '*.dart'

# 認証 / 課金 / データ削除 / 永続化など Critical 機能の TODO
grep -rn "TODO\|FIXME" src/auth/ src-tauri/src/auth/ src/payment/ src-tauri/src/db/

# 「実装する」「あとで」「一時的」「仮」などの危険ワード
grep -rn "// TODO: implement\|// FIXME\|// 仮\|// 一時的" src/ src-tauri/src/

# 古くから残っている TODO の特定: blame で導入日を見る
# (git log --since は「最近の追加」を見るので逆方向。stale TODO は blame ベースで判定する)
git blame --date=short -- path/to/file.rs | grep -E "TODO|FIXME"

# Critical 領域だけまとめて blame して導入日を抽出
for f in $(git grep -l "TODO\|FIXME" -- 'src/auth/*' 'src-tauri/src/auth/*'); do
  git blame --date=short "$f" | grep -E "TODO|FIXME" | awk -v f="$f" '{print f": "$0}'
done | head -30
# ← 出力の日付列で 6 ヶ月以上前のものを Critical / High 候補として selection
```

### 判定基準

TODO / FIXME が **認証 / 課金 / データ削除 / 永続化などの Critical 機能の実行経路上にあり、
不完全なまま本番で通ってしまう**場合のみ Critical / High。
導入から 6 ヶ月以上経過 (git blame の日付) は昇格根拠になるが、それ単独では起票しない
(古いだけで実害のない TODO は対象外)。

### 例 (Rust)

```rust
// src-tauri/src/auth/session.rs:42
fn validate_token(token: &str) -> bool {
    // TODO: implement proper validation
    !token.is_empty()  // ← 本番認証が空文字チェックのみで通る
}
```

判定: **add_implementation**。severity: critical。
`asset_map` に既存の jwt validator / session store を明示。

他言語も同型:

- **TypeScript**: `src/api/payment.ts` の `// FIXME: handle payment failure properly` の下で
  `invoke('process_payment')` を await するだけ (throw を catch せず失敗時の UI 通知なし)
  → 課金経路なので severity: critical。既存 `useFetch` / error handling pattern に揃える。

---

## 7. feature-spec-divergence (仕様書 / 型 / コメントと実装の乖離)

仕様書 / 型定義 / コメントが宣言する振る舞いと実装が食い違っている。

### 検出方法

```bash
# 型宣言と実装の Result type 不一致
grep -rn "fn.*-> Result<" src-tauri/src/ -A 1 | grep -E "Result<.*String>|Box<dyn"
# ← 型は AppResult 宣言なのに body で String error を返している等

# JSDoc / docstring の expected 値と実装乖離
# (機械検出は難しいので、scan モードで類似機能のコメントと比較)

# OpenAPI / schema と Rust struct の field 名乖離
diff <(grep -E '^\s*\w+:' openapi.yaml) <(grep -E 'pub \w+:' src-tauri/src/types.rs)

# Vue の defineProps と template での使用乖離
grep -rn "defineProps<" src/ -A 5 | grep -E "ref\(|reactive\("
```

### 判定基準

**型宣言 / 仕様書 / コメントが約束する契約と実装の振る舞いが食い違い、その宣言を信じた呼び出し側が壊れる**
場合に silent fork。コメントが古いだけで呼び出し側に実害がないなら medium 止まり (起票対象外)。

### 例 (Rust)

```rust
// 型宣言: AppResult<Case> を返す契約
pub async fn get_case(id: String) -> AppResult<Case> {
    // しかし内部で別 error を返している
    let case = db::find(id).map_err(|e| anyhow::anyhow!("{e}"))?;
    // ← AppResult なのに anyhow::Error 経由 (型契約破綻、Tauri serialize で問題)
    Ok(case)
}
```

判定: **align_to_pattern**。severity: high (型契約破綻)。
`map_err(AppError::from)` 等で AppResult に揃える。

他言語も同型:

- **TypeScript**: `type Case.status` が `'open' | 'closed' | 'archived'` の 3 値に狭められているのに、
  `setStatus(c, s: string)` が `s as Case['status']` で cast しており `'pending'` も通ってしまう
  → severity: high。値域チェックを既存 validator に揃えるか、型を狭めて enum 化。

---

## 検出時の必須記載項目 (severity / confidence / asset_map)

各 finding は以下を必ず記載する。空欄があれば Issue 化しない:

```json
{
  "severity": "critical | high",
  "confidence": "high | medium | low",
  "issue_type": "duplicate_helper | bypass_wrapper | adhoc_error_type | pattern_deviation | missing_error_path | stale_todo | spec_divergence",
  "evidence_sources": ["grep", "source_read", "git_log"],
  "asset_map": {
    "template_files": ["手本ファイルパス:LINE"],
    "reusable_assets": [{"kind": "...", "path": "...", "purpose": "..."}],
    "extracted_pattern": "手本から抽出したパターンの説明"
  },
  "needs_human_decision": {"required": false}
}
```

> 既存出力の互換のため `needs_human_judgment: false/true` フィールドも当面読み取り可能だが、
> 新規記述では `needs_human_decision` ブロック (詳細 schema は `_shared/invocation-mode.md`) を使う。

`asset_map.reusable_assets` が空 (= 既存資産が見つからない) なら、判定は **`needs_human_decision`**
として options + safest_default を構造化して返す (旧名は `needs_human_judgment`)。
推測で「これを使えば良い」と書かない。
