# Project Design System Lookup

UI 作業の前に project 固有の design system を探す手順。project 固有 DS は shared knowledge / 外部思想より常に優先する。

## Lookup order

上から順に探し、見つかったものを最優先する。

1. project root の `README.md` / `CLAUDE.md` / `AGENTS.md`
2. `Share/design-system/` (社内共通 design system)
3. `docs/design/` / `docs/ui/` / `docs/style-guide/`
4. frontend の theme files (`vuetify.ts` / `theme.ts` / `tailwind.config.*` / `tokens.css`)
5. token / variables / palette files (`tokens/`, `variables.scss`, `palette.ts`)
6. common components (`components/Button.*`, `components/Dialog.*`)
7. layout components (`layouts/`, `components/Layout.*`, `Shell.*`)
8. 同じ目的の既存画面 (同ドメインの先行画面)

Grep 語: `theme` `tokens` `palette` `variables` `color` `spacing` `radius` `shadow` `typography` `motion`
`Button` `Dialog` `Card` `FormField` `Toast` `DataTable` `Layout` `Shell`

framework 別の典型:

- Vuetify: `vuetify.ts`, `theme.ts`, `createVuetify` 周辺
- Tailwind: `tailwind.config.*`, `globals.css`, `@layer` 定義
- Flutter (Material 3): `theme/`, `ThemeData`, `colorScheme`, `textTheme`
- CSS Custom Properties: `tokens.css`, `variables.css`, `:root` 定義

## 禁止

- project design system を読まずに外部思想だけで判断する
- hard-coded color (`#3b82f6` 等) を新規追加する
- spacing / radius / font-size を感覚で増やす
- 類似 component があるのに自作する

## 未発見時の判断 (DS が無い / 部分的)

| 選択肢 | 適用条件 | 内容 |
|--------|---------|------|
| **a. DS 整備を先行** | 中規模以上 / 複数画面 / 複数 contributor | 別 Issue (`design: project design system の整備`) を先に立てる |
| **b. ボトムアップ token 抽出** | 既存画面の色 / spacing / radius がほぼ収束 | 既存 hard-code を集計して semantic token 候補を導出し、theme / token ファイルへ正規化追加する |
| **c. framework default 採用** | Vuetify / Material 3 / Tailwind preset 等の標準 theme がある | framework 標準を DS とみなし、`primary` / `error` / `surface` 等の semantic role 名で参照する |

- Summary Mode: 推奨を 1 つ添えて返す。決定は人間 (モック合意時)
- Apply Mode: Issue / モックに DS 前提が書かれていなければ実装せず `needs_human_decision` で返す。hard-code で埋めない

採った判断は完了報告 / 要約に残す:

```text
## DS Lookup Result
- 検索範囲: README / Share/design-system/ / docs/design/ / vuetify.ts / tokens.css / components/Button.*
- 結果: 既存 token 未整備 (vuetify default のみ)
- 推奨: c (framework default 採用) — Vuetify、画面数 3、contributor 1
```
