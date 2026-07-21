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

スタックに依存しない最初のステップ。

### crate / module 構造の俯瞰

```bash
# Rust workspace の全 crate を列挙
find . -name 'Cargo.toml' -not -path '*/target/*' | head -20

# pnpm / npm workspace の全 package を列挙
find . -name 'package.json' -not -path '*/node_modules/*' | head -20

# Flutter の全パッケージ
find . -name 'pubspec.yaml' | head -20

# 共通 utility ディレクトリの存在確認
find . -type d \( -name 'utils' -o -name 'helpers' -o -name 'shared' -o -name 'common' -o -name 'lib' \) -not -path '*/node_modules/*' -not -path '*/target/*'
```

### 同種ファイルの存在確認

```bash
# ドメインキーワードで Glob (例: "case" 関連ファイル)
find src/ src-tauri/src/ lib/ -type f -iname '*case*' 2>/dev/null | head -30

# 同種ディレクトリの構成を比較 (silent fork 兆候の早期発見)
ls -la src/pages/case/ src/pages/project/ src/pages/invoice/ 2>/dev/null
```

### 命名規則の抽出

```bash
# 類似機能の関数命名スタイルを集める
grep -rn "^pub fn\|^pub async fn" src-tauri/src/commands/ | head -20
grep -rn "^export function\|^export async function\|^export const" src/api/ | head -20
```

3 つ以上の同種機能を見て命名規則 (動詞・ケース・サフィックス) を抽出する。

---

## Rust / Tauri v2

### crate / module 階層の特定

```bash
# Cargo.toml で workspace 構造把握
cat src-tauri/Cargo.toml | grep -A 50 "\[workspace\]"

# crate 内 module 階層 (pub mod の連鎖)
grep -rn "^pub mod\|^mod " src-tauri/src/ --include='*.rs' | head -30

# 公開 API の俯瞰 (crate root からの export)
cat src-tauri/src/lib.rs
```

### error type / Result alias の特定

```bash
# プロジェクト共通 error type
grep -rn "^pub enum.*Error\|^pub struct.*Error\|^pub type.*Result" src-tauri/src/

# 期待される pattern: src-tauri/src/error.rs に AppError + AppResult<T>
cat src-tauri/src/error.rs 2>/dev/null
```

確認項目:

- AppError variant の網羅 (どんな error が定義済みか)
- AppResult<T> の使われ方 (commands は AppResult を返している前提か)
- thiserror / anyhow / 独自 derive のどれを採用しているか

### Tauri command パターンの特定

```bash
# 既存 command を全列挙
grep -rn "#\[tauri::command\]" src-tauri/src/ -A 3

# capability 設定の俯瞰
ls -la src-tauri/capabilities/
cat src-tauri/capabilities/default.json 2>/dev/null

# state 管理パターン (Mutex / RwLock / once_cell)
grep -rn "tauri::State\|Mutex<\|RwLock<" src-tauri/src/ | head -20
```

### file IO / path 管理の wrapper 特定

```bash
# PathManager / FsService 等の wrapper
grep -rn "pub fn.*-> PathBuf\|pub struct.*Path\|pub fn read_\|pub fn write_" src-tauri/src/

# 直叩き箇所を発見 (使うべき箇所で wrapper を使っていない)
grep -rn "std::fs::\|tokio::fs::" src-tauri/src/ | grep -v "src-tauri/src/io/\|src-tauri/src/path/"
```

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

### shared component の特定

```bash
# components ディレクトリ俯瞰
ls -la src/components/

# 主要 shared component (loading / error / empty 系) の存在確認
find src/components/ -iname '*skeleton*' -o -iname '*spinner*' -o -iname '*error*' -o -iname '*empty*' -o -iname '*toast*'

# どこで使われているか (利用パターン)
grep -rn "<Skeleton\|<ErrorBanner\|<EmptyState" src/pages/ src/views/
```

### composable / hook の特定

```bash
# composables ディレクトリ
ls -la src/composables/

# 主要 composable (fetch / form / pagination 等)
find src/composables/ -name 'use*.ts' | head -20

# 利用パターン
grep -rn "useFetch\|useForm\|usePagination" src/pages/ | head -20
```

### Pinia store の特定

```bash
# stores ディレクトリ
ls -la src/stores/

# store 構造 (defineStore のパターン)
grep -rn "defineStore" src/stores/ -A 3

# どの store がどこで使われているか
grep -rn "useUserStore\|useCaseStore" src/pages/ | head -20
```

### invoke wrapper / API client の特定

```bash
# src/api/ の全 wrapper
ls -la src/api/

# wrapper 関数の網羅
grep -rn "^export async function\|^export const.*=.*async" src/api/

# 直叩き (wrapper bypass) の発見
grep -rn "import { invoke } from '@tauri-apps" src/ --include='*.vue' --include='*.ts' | grep -v "src/api/"
```

### type / interface の特定

```bash
# 型定義の集約場所
ls -la src/types/

# 主要 type alias / interface
grep -rn "^export type\|^export interface" src/types/ | head -30

# AppResult / Result alias の存在確認
grep -rn "^export type.*Result\|AppResult" src/
```

### loading / error / empty / success パターンの抽出

```bash
# 4 状態テンプレが揃っているページ (= 手本候補)
grep -lrn "v-if=\"loading\"" src/pages/ | head -5
grep -lrn "v-if=\"error\"" src/pages/ | head -5
grep -lrn "v-if=\"empty\"\|v-if=\".*\\.length === 0\"" src/pages/ | head -5

# 同じファイル全部に出てくれば手本として優秀
```

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

### Result type の整合確認

```bash
# Rust 側: 戻り値の Result 型
grep -rn "fn.*-> AppResult\|fn.*-> Result<" src-tauri/src/commands/ | head -20

# TypeScript 側: 受け取り型
grep -rn "invoke<" src/api/ | head -20

# Rust が AppResult<Case> → TS が invoke<Case> という整合が必要
```

### capability scope の整合確認

```bash
# capability 定義
cat src-tauri/capabilities/default.json 2>/dev/null

# 新規 command を追加する時、capability に許可が必要か
grep -rn "tauri::generate_handler" src-tauri/src/main.rs src-tauri/src/lib.rs
```

---

## Flutter / Dart

### widget / state management の特定

```bash
# 共通 widget
ls -la lib/core/widgets/ lib/shared/widgets/ lib/common/widgets/ 2>/dev/null

# Riverpod / Provider / Bloc の採用確認
grep -rn "ConsumerWidget\|StatefulWidget\|BlocBuilder\|Provider" lib/ | head -20

# state 管理パターン (sealed class / freezed / enum)
grep -rn "sealed class\|@freezed\|enum.*State" lib/
```

### repository / api client の特定

```bash
# api client / repository 層
ls -la lib/core/network/ lib/core/data/ lib/data/ 2>/dev/null

# Dio / http パッケージの wrapper
grep -rn "class.*ApiClient\|class.*Repository" lib/

# 直叩き (wrapper bypass)
grep -rn "http\.\(get\|post\|put\|delete\)" lib/ | grep -v "lib/core/network/"
```

### error handling パターンの特定

```bash
# Result type / Either / Failure pattern
grep -rn "class.*Failure\|sealed class.*Result\|Either<" lib/

# try-catch の既存パターン
grep -rn "try {" lib/ -A 5 | grep "catch (e)" | head -10
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
