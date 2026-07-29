# expert-feature 既存資産探索 cookbook

<!--
機能概要: silent fork を起こさないための「既存資産探索」のスタック別チェックリスト + grep cookbook
作成意図: 実装前に必ず通すべき探索手順を定型化。スカスカな調査のまま「ゼロから書く」を防ぐ
注意点: agent は必要時のみ Read。SKILL.md の 5 ステップメソドロジー「2. 既存資産探索」から呼ばれる
-->

新規・拡張実装の **前** に必ず通す探索手順。
SKILL.md の「既存資産探索 (silent fork 防止の最低充足条件)」をスタック別に深掘り。

---

## 探索の基本原則

**「書く前に探す。探したら必ず手本を 1 つ以上特定する。」**

3 つのレベルで探索する:

| レベル | 探すもの | 探索コスト |
|-------|---------|----------|
| L1: 同種ファイル / module | 似たドメイン・似た役割のファイル群 | Glob 1 回 |
| L2: 共通資産 | crate / wrapper / helper / shared component / type alias / fixture | Grep 数回 |
| L3: 利用パターン | その資産が他で **どう使われているか** | Grep + Read |

L1 → L2 → L3 の順で広げる。L3 まで到達できれば silent fork はほぼ防げる。

L1 の段階で **同種ディレクトリを横並びに比較する** (`ls -la src/pages/case/ src/pages/project/ ...`)。
構成・ファイル数・命名の食い違いはそれ自体が silent fork の兆候であり、最も安く早く見つかる。

### head -N で打ち切る時の注意 (大規模 repo)

本辞典の grep / find 例では `| head -20` などで出力を切っているが、大規模 repo では重要資産を見落とす可能性がある。
**件数も必ず確認**してから判断する:

```bash
# 件数を取りつつ先頭だけ表示
find . -name 'Cargo.toml' -not -path '*/target/*' | tee /tmp/_files
echo "件数: $(wc -l < /tmp/_files)"
head -20 /tmp/_files
```

20 件超の場合の対応:

- **head だけで判断しない**
- ドメインキーワードで二次絞り込み (`grep -i '<keyword>'`) を行う
- 命名揺れを考慮した別パターンも 1 度試す (例: `case`, `Case`, `cases`)
- 手本候補を **2〜3 個** Read して構成を比較する (1 個だけだと偏る)

---

## 共通: ドメイン横断の資産探索

スタックに依存しない最初のステップ。**workspace 俯瞰 → 共通 utility の所在 → 命名規則** の順に埋める。

```bash
# workspace / package の俯瞰 (該当する manifest だけ拾う)
find . \( -name 'Cargo.toml' -o -name 'package.json' -o -name 'pubspec.yaml' \) -not -path '*/target/*' -not -path '*/node_modules/*' | head -20

# 共通 utility ディレクトリの存在確認
find . -type d \( -name 'utils' -o -name 'helpers' -o -name 'shared' -o -name 'common' \) -not -path '*/node_modules/*' -not -path '*/target/*'

# ドメインキーワードで同種ファイルを Glob (例: "case")
find src/ src-tauri/src/ lib/ -type f -iname '*case*' 2>/dev/null | head -30

# 類似機能の命名スタイル (動詞・ケース・サフィックス) を集める
grep -rn "^pub fn\|^pub async fn\|^export function\|^export const" src-tauri/src/commands/ src/api/ 2>/dev/null | head -20
```

3 つ以上の同種機能を見て命名規則を抽出する。1〜2 個だけで決めない (偏る)。

### wrapper 直叩き検出の型 (全スタック共通)

既存 wrapper があるのに生 API を直接呼んでいる箇所は、次の型ひとつで洗い出せる:

> `<wrapper が包んでいる生 API の呼び出しパターン> | grep -v '<wrapper 配置ディレクトリ>'`

スタックが変わるのは埋める 2 語だけ (Rust: `std::fs::` / `tokio::fs::` vs `src-tauri/src/io/`・`path/`、
Vue: `invoke` の直 import vs `src/api/`、Flutter: `http.` vs `lib/core/network/`)。
以降の各スタック節では、この型の代表例を 1 行だけ載せる。

---

## Rust / Tauri v2

```bash
# module 階層 (pub mod の連鎖)。crate root の lib.rs と Cargo.toml [workspace] も併せて Read する
grep -rn "^pub mod\|^mod " src-tauri/src/ --include='*.rs' | head -30

# 共通 error type / Result alias (期待 pattern: src-tauri/src/error.rs に AppError + AppResult<T>)
grep -rn "^pub enum.*Error\|^pub struct.*Error\|^pub type.*Result" src-tauri/src/

# 既存 command の全列挙。同じ要領で capabilities/*.json と state 管理 (tauri::State / Mutex / RwLock) も確認する
grep -rn "#\[tauri::command\]" src-tauri/src/ -A 3

# file IO wrapper (PathManager / FsService 等) の直叩き検出 = 共通節「wrapper 直叩き検出の型」の Rust 版
grep -rn "std::fs::\|tokio::fs::" src-tauri/src/ | grep -v "src-tauri/src/io/\|src-tauri/src/path/"
```

error type を見つけたら、以下まで踏み込んで確認する:

- AppError variant の網羅 (どんな error が定義済みか)
- AppResult<T> の使われ方 (commands は AppResult を返している前提か)
- thiserror / anyhow / 独自 derive のどれを採用しているか

### 探索チェックリスト (Rust / Tauri v2)

```
□ AppError / AppResult<T> の場所と variant を把握した
□ 同種 command の実装を 2〜3 個 Read した
□ capability 設定の追加が必要かを確認した
□ state 管理パターン (Mutex / RwLock) の既存採用を確認した
□ file IO / path 操作の wrapper の有無を確認した
□ tokio runtime / spawn パターンの既存採用を確認した
□ Tauri Result serialize の既存形式 (Result<T, AppError>) を確認した
□ logging / tracing の既存パターンを確認した
```

---

## Vue 3 + TypeScript

```bash
# shared component (loading / error / empty 系) の存在確認。利用箇所は grep -rn "<Skeleton\|<ErrorBanner" src/pages/ で追う
find src/components/ -iname '*skeleton*' -o -iname '*spinner*' -o -iname '*error*' -o -iname '*empty*' -o -iname '*toast*'

# composable 列挙。src/types/ の type alias / AppResult も同じ要領 (ls + grep '^export type') で押さえる
find src/composables/ -name 'use*.ts' | head -20

# Pinia store の構造 (defineStore のパターン)
grep -rn "defineStore" src/stores/ -A 3

# invoke wrapper (src/api/) の直叩き検出 = 共通節「wrapper 直叩き検出の型」の Vue 版
grep -rn "import { invoke } from '@tauri-apps" src/ --include='*.vue' --include='*.ts' | grep -v "src/api/"
```

**手本ページの選び方**: `loading` / `error` / `empty` / `success` の 4 状態が **同一ファイルに揃っている**ページは
手本として優秀。`grep -lrn 'v-if="loading"' src/pages/` を状態ごとに走らせ、**全条件に同じファイルが現れるか**で判定する
(1 状態だけ揃っているページを手本にすると、欠けた状態ごと模倣してしまう)。

### 探索チェックリスト (Vue 3 + TypeScript)

```
□ shared components ディレクトリの主要コンポーネント (Skeleton / ErrorBanner / EmptyState 等) を把握した
□ composables の主要 hook (useFetch / useForm 等) を把握した
□ Pinia store の構造と利用パターンを把握した
□ src/api/ の wrapper を網羅した
□ src/types/ の AppResult / 主要 type alias を把握した
□ 同種ページで loading / error / empty / success の 4 状態を実装している手本を 1 つ特定した
□ defineProps / defineEmits の既存パターンを確認した
□ vue-router / route 定義の既存パターンを確認した
```

---

## Tauri v2 境界 (Rust ↔ Vue)

silent fork が起きやすい境界。両側を必ず突き合わせる。

### invoke wrapper の整合確認

```bash
# Rust 側 command を列挙
grep -rn "#\[tauri::command\]" src-tauri/src/ | sed -E 's/.*fn ([a-z_]+).*/\1/' | sort -u

# TypeScript 側 wrapper を列挙
grep -rn "invoke\(['\"]" src/api/ | sed -E "s/.*invoke\(['\"]([a-z_]+).*/\1/" | sort -u

# 差分があれば silent fork 兆候
# - Rust にあるが wrapper にない: implementation_gap
# - wrapper にあるが Rust にない: dead wrapper
# - 両方にある: 整合確認 (引数 / 戻り値 type 一致)
```

### 同じ「抽出 → sort -u → diff」を型と capability にも適用する

上の command 名突き合わせは技法であり、対象を変えれば型契約と capability にもそのまま効く:

```bash
# Result type: Rust の戻り値と TS の受け取り型 (AppResult<Case> ⇔ invoke<Case> の整合が必要)
grep -rn "fn.*-> AppResult\|fn.*-> Result<" src-tauri/src/commands/ | head -20; grep -rn "invoke<" src/api/ | head -20

# capability scope: 登録済み handler と capability 許可範囲 (新規 command 追加時に許可が要るか)
grep -rn "tauri::generate_handler" src-tauri/src/main.rs src-tauri/src/lib.rs; cat src-tauri/capabilities/default.json 2>/dev/null
```

---

## Flutter / Dart

```bash
# 共通 widget の俯瞰
ls -la lib/core/widgets/ lib/shared/widgets/ lib/common/widgets/ 2>/dev/null

# state 管理の採用確認 (Riverpod / Provider / Bloc)。sealed class / @freezed / enum State も同時に見る
grep -rn "ConsumerWidget\|StatefulWidget\|BlocBuilder\|Provider" lib/ | head -20

# error / Result type の特定。try-catch の既存作法も同じファイル群で確認する
grep -rn "class.*Failure\|sealed class.*Result\|Either<" lib/

# ApiClient / Repository wrapper の直叩き検出 = 共通節「wrapper 直叩き検出の型」の Flutter 版
grep -rn "http\.\(get\|post\|put\|delete\)" lib/ | grep -v "lib/core/network/"
```

### 探索チェックリスト (Flutter / Dart)

```
□ state management (Riverpod / Provider / Bloc) の採用を確認した
□ 同種 page / screen の実装を 2〜3 個 Read した
□ ApiClient / Repository wrapper の存在と利用方法を確認した
□ error / Failure type の既存定義を確認した
□ loading / error / empty / success の 4 状態の手本 widget を 1 つ特定した
□ navigation / routing の既存パターンを確認した
□ form validation の既存パターンを確認した
□ controller / subscription dispose の既存パターンを確認した
```

---

## 探索結果の記録テンプレ

apply に入る前に、Issue コメント or 内部メモとして以下を記録する:

```markdown
## 既存資産探索結果

### 手本ファイル
- `path/to/template1.ext:LINE`
  - 抽出パターン: <ファイル構成 / 命名 / error 処理 / 状態管理>
- `path/to/template2.ext:LINE` (補助手本)

### 再利用する既存資産
| 種別 | 場所 | 用途 |
|------|------|------|
| crate | `src/utils/sanitize.rs::sanitize_html` | XSS 防止 |
| wrapper | `src/api/case.ts::getCase` | Tauri 呼び出し |
| component | `src/components/Skeleton.vue` | loading 表示 |
| composable | `src/composables/useFetch.ts` | loading / error / data 状態管理 |
| type alias | `src/types/result.ts::AppResult` | error 統一 |

### 新規追加が必要なもの
- <既存資産で代替できない理由を明記>
- なければ「新規追加なし」

### 既存パターンから外れる箇所
- <あれば、なぜ外れる必要があるかを明記>
- なければ「すべて手本に準拠」
```

このメモが書ききれない (`手本ファイル` または `再利用する既存資産` が空) なら、**実装に入らない**。
探索を続けるか、Issue コメントで人間に質問する。

---

## 探索の打ち切り基準

無限に探索しないための打ち切り基準:

- 同種ファイル 3 個以上 Read した
- L1 / L2 / L3 をそれぞれ 1 周した
- 共通 utility / wrapper / type alias の存在有無が確定した

これで「資産が見つからない」と確定したら、Issue コメントで人間に確認する:

```
資産探索の結果、以下が見つかりませんでした:
- <探したもの 1>
- <探したもの 2>

新規追加してよいか、それとも先に <別ファイル> を参考にすべきかご確認ください。
```

推測で「新規追加で進める」を選ばない。silent fork は最大の禁忌。
