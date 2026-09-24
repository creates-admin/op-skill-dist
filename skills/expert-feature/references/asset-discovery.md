# expert-feature 既存資産探索 cookbook

書く前に探す。探したら手本を 1 つ以上特定する。

## 探索の基本原則

| レベル | 探すもの | コスト |
|---|---|---|
| L1: 同種ファイル / module | 似たドメイン・役割のファイル群 | Glob 1 回 |
| L2: 共通資産 | crate / wrapper / helper / shared component / type alias / fixture | Grep 数回 |
| L3: 利用パターン | その資産が他でどう使われているか | Grep + Read |

- L1 → L2 → L3 の順に広げる。L1 で同種ディレクトリを横並びに比較する (構成・ファイル数・命名の食い違いは最も安く見つかる silent fork 兆候)。
- 件数を確認してから `head` で切る。20 件超なら head だけで判断せず、ドメインキーワードで二次絞り込みし、命名揺れ (`case` / `Case` / `cases`) も試す。
- 手本候補は 2〜3 個 Read して比較する。命名規則は 3 つ以上の同種機能から抽出する。

wrapper 直叩き検出の型 (全スタック共通): `<wrapper が包む生 API の呼び出し> | grep -v '<wrapper 配置ディレクトリ>'`。
埋める 2 語だけがスタックで変わる (Rust: `std::fs::` vs `src-tauri/src/io/`、Vue: `invoke` 直 import vs `src/api/`、Flutter: `http.` vs `lib/core/network/`)。

## スタック別に把握する既存資産

- Rust / Tauri v2: AppError / AppResult の場所・variant・採用ライブラリ、同種 command 2〜3 個、capability 追加の要否、State 管理 (tauri::State / Mutex / RwLock)、
  file IO / path wrapper、tokio spawn の既存パターン、Tauri Result の serialize 形式、logging / tracing
- Vue 3 + TypeScript: shared components (Skeleton / ErrorBanner / EmptyState 等)、composables、Pinia store、`src/api/` の wrapper、`src/types/` の AppResult / type alias、
  defineProps / defineEmits と route 定義
- Flutter / Dart: state management (Riverpod / Provider / Bloc)、同種 page 2〜3 個、ApiClient / Repository wrapper、Failure type、navigation / form validation / dispose

手本ページの選び方: loading / error / empty / success の 4 状態が同一ファイルに揃っているページ (widget)。
`grep -lr 'v-if="loading"' src/pages/` を状態ごとに走らせ、全条件に同じファイルが現れるかで判定する (1 状態だけのページを手本にすると欠けた状態ごと模倣する)。

## Tauri v2 境界 (Rust ↔ Vue)

両側を突き合わせる。「抽出 → sort -u → diff」を command 名・型契約・capability に適用する。

```bash
diff <(grep -rn "#\[tauri::command\]" -A 2 src-tauri/src/ | sed -nE 's/.*fn ([a-z_0-9]+).*/\1/p' | sort -u) \
     <(grep -rn "invoke[<(]" src/api/ | sed -nE "s/.*invoke[^(]*\(['\"]([a-z_0-9]+).*/\1/p" | sort -u)
# Rust のみ: implementation gap / wrapper のみ: dead wrapper / 両方: 引数・戻り値型の一致を確認
```

## 探索結果の記録

手本ファイル (`path:LINE` と抽出パターン) / 再利用する既存資産 (種別・場所・用途) / 新規追加が必要なもの (既存資産で代替できない理由) /
既存パターンから外れる箇所 (理由) の 4 点を記録する。`手本ファイル` か `再利用する既存資産` が空なら実装に入らない。

## 探索の打ち切り基準

同種ファイル 3 個以上 Read / L1〜L3 を各 1 周 / 共通 utility・wrapper・type alias の有無が確定、で打ち切る。
それでも資産が見つからなければ、探したものを列挙して新規追加の可否を人間に確認する (OP-managed は `needs_human_decision`)。推測で「新規追加で進める」を選ばない。
