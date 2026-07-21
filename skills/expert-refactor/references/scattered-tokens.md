# Scattered Semantic Tokens

<!--
機能概要: 意味ある値が複数箇所に直書きされ、変更時に同期修正漏れを生む状態を
         検出・整理する手順とパターンを集約する。
作成意図: refactor-expert は単なる文字列重複ではなく「意味の散乱」を直す。
         置き場の判断と、apply 時の値不変保証が核心。
注意点: 置き場が決められない token は共通化してはいけない。雑な global
       constants 化は別の負債を生むので architecture_debt 扱いにする。
-->

## Definition

散乱 token とは、**システム内で意味を持つ値が複数箇所に直書きされ、変更時に
同期修正漏れを生む状態** である。

これは単なる文字列重複ではない。**同じ意味の contract が散っている状態** を指す。

---

## Target

- path
- route
- API endpoint
- Tauri command name
- IPC command name
- event name
- storage key
- config key
- feature flag
- file extension
- MIME type
- status string
- error code
- permission name
- design token (spacing / color / z-index / breakpoint)
- directory name
- asset path
- glob pattern
- env var

---

## Detection Conditions

### Issue 化下限 (op-scan / op-patrol — 3 箇所基準)

Issue 化条件 (**すべて満たす場合のみ起票**):

1. 同じ意味の literal が **3 箇所以上** に散っている
2. **2 つ以上** の layer / module / feature を跨いでいる
3. 以下のいずれかに該当する:
   - 既存の constants / enum / token / helper があるのに **迂回** している (contract bypass)
   - 既存 contract が **存在せず**、複数の layer / module / feature が同じ意味値を個別に保持している (contract absent)
4. 変更時に **同期修正が必要** になる
5. path / IO / IPC / config / storage / route / design system / file type に関わる

### Apply 中の局所共通化下限 (op-run — 2 箇所基準)

apply フェーズで scope_in 範囲内に同じ意味の literal が **2 箇所以上** あり、意味同一性が
確認できる場合は、scan finding が立っていなくても局所共通化してよい。これは「既に直す
PR の中で見つけた重複なら、その PR の scope 内で安全に統一する」という apply 時の最小整理。

ただし以下は守る:

- scope_in を越える範囲には広げない (新規 contract / shared util の作成は scan finding 起票 → 別 PR)
- 2 箇所だけを根拠に新規モジュール / 抽象化を作らない
- 純粋な定数化 / `const` / `enum` の局所抽出に留める

> 整理: **2 箇所 = apply 中の局所共通化下限 / 3 箇所以上 = scan / patrol Issue 化下限**。
> 役割分担を間違えると、2 箇所の軽微重複で過剰起票したり、3 箇所の真性 scattered token を
> apply 時に放置したりする事故が起きる。

---

## Ignore (= ignored_noise)

以下は原則 Issue 化しない (scan / patrol の 3 箇所基準を満たさないもの)。

- 人間向けコピー
- log message
- test description
- 一度だけ使われる局所値
- formatter で解決するもの
- 既に token / enum / helper 経由になっているもの
- 2 箇所程度の軽微な重複 (apply 中の局所共通化下限としては有効、Issue 化下限としては不足)

---

## Token Placement Policy

### feature 固有 token は feature 配下に置く

```text
features/report/report_paths.ts
features/report/report_status.ts
features/auth/auth_routes.ts
```

### 複数 feature で共有される protocol / IPC / event name は shared contract に置く

```text
shared/ipc/report_commands.ts
shared/ipc/auth_events.ts
shared/contracts/notification_events.ts
```

### domain value は domain 配下に置く

```text
domain/job/job_status.ts
domain/document/document_kind.ts
```

### file system policy / output path policy は path policy layer に置く

```text
src-tauri/src/path_policy/
src-tauri/src/path_policy/report_paths.rs
```

### design token は design system / token layer に置く

```text
shared/design/tokens.ts
shared/design/colors.ts
shared/design/spacing.ts
```

### 置き場が決められない場合

**global constants に逃がさない**。
`architecture_debt` finding として、または
`needs_human_decision` block (`required: true`, `decision_type: "boundary"`,
`options[]` / `blocked_actions[]` ほか正規スキーマ必須項目) として記録する。
ラベルは `needs:boundary-decision` (ラベルカタログ参照)。

```text
置き場が決められない token は、共通化してはいけない。
```

---

## Apply Policy

### やってよいこと

- literal の意味単位を **分類** してから抽出
- external contract か internal token かを判定
- token 名は **値ではなく意味** で命名する (例: `"reports/html"` を `REPORTS_HTML_DIR` ではなく `REPORT_OUTPUT_DIR_RELATIVE` などにする)
- token 置き場を **責務境界** に合わせる
- 既存の token / enum / helper があればそこに合流させる

### やってはいけないこと

- **完全一致だけで機械的に置換しない**
- 同名 literal をすべて同じ意味とみなさない (例: `"open"` という文字列が status / mode / event の 3 種類で使われている可能性)
- public API / DB schema / serialized data / config format / IPC contract の **値を変更しない**
- Tauri command name / event name / permission name を変更しない
- UI token / domain token / IO path token を **混ぜない**
- path token は OS / bundler / runtime 差を考慮する (Windows path / WSL / Tauri resource path)
- 変更前後で実際の値が変わっていないことを apply report で **明示的に宣言** する

---

## 検出フロー (scan モード)

1. **候補抽出**: 対象 subtype に応じた grep を実行
   - 例: paths → `rg '"[a-zA-Z0-9_./-]+/[a-zA-Z0-9_./-]+"' --type rs --type ts --type vue`
   - 例: ipc_commands → `rg "invoke\(['\"]([a-zA-Z_][a-zA-Z0-9_]*)" --type ts`
2. **意味単位の分類**: 同じ literal でも意味が違うものを分ける
3. **跨ぎ判定**: 2 つ以上の layer / module / feature を跨いでいるか確認
4. **既存 contract との比較**: 既存の constants / enum / token / helper を迂回しているか確認
5. **同期リスクの評価**: 変更時に同期修正が必要になるか
6. **bulk_group 付与**: `refactor-scattered-tokens` + 適切な subtype
7. **canonical schema 出力**: Critical / High のみ起票

---

## subtype 別の検出ヒント

### paths

- ファイルシステムパス、output dir、temp dir
- relative path / absolute path 混在
- frontend と backend で別々に組み立てている path

### routes

- Vue Router / Tauri capability の route literal
- route と画面遷移の対応が複数箇所に書かれている

### ipc_commands / tauri_command_names

- `invoke('xxx')` (TS 側) と `#[tauri::command] fn xxx` (Rust 側) の対応
- 両側に同じ文字列が直書きされている

### event_names

- `emit('xxx')` / `listen('xxx')` の文字列対応

### storage_keys

- `localStorage.getItem('xxx')` / `localStorage.setItem('xxx')` の散在
- Tauri Store / SQLite key の散在

### config_keys

- 設定ファイルの key 名直書き

### status_values

- `"draft"` / `"published"` 等の status 文字列散在
- enum 化されていない

### design_values

- spacing / color / z-index / breakpoint の hard-code
- design token 経由でない値

### error_codes

- error string / error variant の散在
- match arms 間で一致していない

### permission_names

- Tauri capability permission 名の散在

### file_types / mime_types

- `.html` / `.json` / `.png` 等の extension 散在
- MIME type 直書き

### env_vars

- `process.env.XXX` / `std::env::var("XXX")` の散在

### glob_patterns

- `**/*.ts` 等の散在 (build / lint / test 設定で重複しがち)

---

## apply 後の必須宣言

scattered token の apply 完了報告には、必ず以下を含める:

```yaml
contract_preservation:
  path_values_changed: false
  status_values_changed: false
  error_codes_changed: false
  ipc_contract_changed: false
  tauri_command_names_changed: false
  event_names_changed: false
  permission_names_changed: false
  env_vars_changed: false
```

**実際の値が変更前後で変わっていないこと** を boolean で明示する。
true になる場合は仕様変更であり、refactor-expert の範囲外 (feature-expert / debug-expert に escalation)。
