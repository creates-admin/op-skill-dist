# expert-feature silent fork / implementation gap 全集

<!--
機能概要: SKILL.md の top 7 bulk_group catalog を言語別具体例 + 検出 grep で深掘りした辞典
作成意図: 「既存資産があるのに重複実装した」「類似機能にあるパターンが欠けている」の証拠集。
         判定根拠を持って Issue 化・apply できるようにする補助資料
注意点: agent は必要時のみ Read。SKILL.md の severity / confidence / asset_map を必ず通す
-->

silent fork / implementation gap 7 カテゴリの言語別具体例と検出 grep。
**Issue 化前に SKILL.md の severity / confidence / `asset_map` 必須記載と `needs_human_decision` 判定を必ず通す** (旧 `needs_human_judgment` は deprecated alias、互換目的のみ)。

---

## 判定表記の統一ポリシー

本辞典の各カテゴリには「判定」が付くが、これは **action の方向性** を示すもので、
**即実装の許可ではない**。SKILL.md の **enum 対応表** に従う:

| bulk_group | issue_type | action |
|------------|-----------|--------|
| `feature-duplicate-helper` | `duplicate_helper` | `replace_with_existing_asset` |
| `feature-bypass-wrapper` | `bypass_wrapper` | `replace_with_existing_asset` |
| `feature-adhoc-error-type` | `adhoc_error_type` | `replace_with_existing_asset` |
| `feature-pattern-deviation` | `pattern_deviation` | `align_to_pattern` |
| `feature-missing-error-path` | `missing_error_path` | `complete_missing_state` |
| `feature-stale-todo` | `stale_todo` | `add_implementation` |
| `feature-spec-divergence` | `spec_divergence` | `align_to_pattern` |

action enum の意味:

- `replace_with_existing_asset`: 既存資産で置き換える。重複実装した自前コードを削除し既存 wrapper / helper / crate に切り替える
- `align_to_pattern`: 類似機能のパターンに揃える。命名 / 構成 / error 処理を手本に合わせる
- `complete_missing_state`: 欠けている状態 (loading / error / empty) を類似機能から移植
- `add_implementation`: 未実装部分を新規追加 (既存資産再利用前提)
- `needs_human_decision`: 既存パターンが揺らいでいて手本が定まらない場合は構造化された人間判断要求として返す (旧 `needs_human_judgment` は deprecated alias、互換目的のみ)

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

### 例 (Vue 3 + TypeScript)

```ts
// src/composables/useFetch.ts に汎用 fetch + loading / error 管理が既に存在
// しかし src/pages/case/CaseDetail.vue で自前実装
const loading = ref(false)
const error = ref<string | null>(null)
const data = ref<Case | null>(null)

async function fetchCase(id: string) {
  loading.value = true
  try {
    data.value = await invoke('get_case', { id })
  } catch (e) {
    error.value = String(e)  // ← ad-hoc, 既存 useFetch を使えば不要
  } finally {
    loading.value = false
  }
}
```

判定: **replace_with_existing_asset**。
`useFetch` composable に切り替え。

### 例 (Flutter / Dart)

```dart
// lib/core/network/api_client.dart に Dio wrapper が既に存在
// しかし lib/features/case/case_repository.dart で http 直叩き
final response = await http.get(Uri.parse('https://api/case/$id'));
// ← 既存 ApiClient を経由していない
```

判定: **replace_with_existing_asset**。
`ApiClient` 経由に切り替え。

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

### 例 (Rust / Tauri)

```rust
// src-tauri/src/path/manager.rs に canonicalize + scope 検証 wrapper が既存
// しかし src-tauri/src/commands/file.rs で直叩き
let content = std::fs::read_to_string(path)?;
// ← capability scope 検証なしで read。security 経路で Critical
```

判定: **replace_with_existing_asset**。severity: critical (capability bypass)。
PathManager 経由に切り替え。

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

### 例 (TypeScript)

```ts
// src/types/error.ts に AppError + AppResult<T> が既存
// しかし src/api/foo.ts で
type FooError = { code: string; message: string }  // ← ad-hoc 新設
async function getFoo(): Promise<{ data: Foo } | { error: FooError }> { ... }
```

判定: **replace_with_existing_asset**。
AppResult<Foo> に揃える。

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

### 例 (Rust / Tauri)

```text
src-tauri/src/commands/
  case.rs           ← pub fn get_case, list_cases, create_case
  project.rs        ← pub fn get_project, list_projects, create_project
  invoice.rs        ← pub fn fetch_invoice, getInvoiceList ← deviation
                     (動詞とケースが違う)
```

判定: **align_to_pattern**。
case / project の命名規則に揃える (`get_invoice` / `list_invoices` / `create_invoice`)。

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

### 例 (Flutter / Dart)

```dart
// lib/features/case/case_list_page.dart (手本)
return switch (state) {
  CaseLoading() => const SkeletonList(),
  CaseError(:final message) => ErrorBanner(message: message),
  CaseEmpty() => const EmptyState(),
  CaseLoaded(:final cases) => CaseListView(cases: cases),
};

// lib/features/case/case_detail_page.dart (gap)
return Text(case.title);
// ← loading / error / empty 全欠如、success のみ
```

判定: **complete_missing_state**。
case_list_page.dart のパターンに揃える。

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

### 例 (TypeScript)

```ts
// src/api/payment.ts:10
async function processPayment(amount: number) {
  // FIXME: handle payment failure properly
  await invoke('process_payment', { amount })
  // ← throw を catch していない、失敗時の UI 通知なし
}
```

判定: **add_implementation**。severity: critical (課金経路)。
既存 `useFetch` / error handling pattern に揃える。

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

### 例 (TypeScript)

```ts
// 型宣言
type Case = {
  id: string
  status: 'open' | 'closed' | 'archived'  // ← 3 値
}

// 実装
function setStatus(c: Case, s: string) {
  c.status = s as Case['status']  // ← 'pending' を渡しても通る、型契約破綻
}
```

判定: **align_to_pattern**。severity: high。
status の値域チェックを既存 validator に揃える、または型を狭めて enum 化。

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
