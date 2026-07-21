# Project Design System Lookup

agent が UI 作業に入る前に、**project 固有の design system を必ず先に探す** ための手順書。
shared knowledge や外部思想より、**project 固有 design system が常に優先される**。

---

## Lookup order

UI に手をつける前、必ず以下の順で探す。
途中で見つかったら、それを最優先する。

1. project root の `README.md` / `CLAUDE.md` / `AGENTS.md`
2. `Share/design-system/` (社内共通 design system が置かれる場所)
3. `docs/design/` / `docs/ui/` / `docs/style-guide/`
4. frontend の theme files (例: `vuetify.ts` / `theme.ts` / `tailwind.config.*` / `tokens.css`)
5. token / variables / palette files (例: `tokens/`, `variables.scss`, `palette.ts`)
6. common components (例: `components/Button.*`, `components/Dialog.*`)
7. layout components (例: `layouts/`, `components/Layout.*`, `Shell.*`)
8. existing screens with similar purpose (同じドメインの先行画面)

---

## 検索キーワード例

ファイル名 / シンボル名で grep するときに使う語。

```text
theme
tokens
palette
variables
color
spacing
radius
shadow
typography
Button
Dialog
Card
FormField
Toast
DataTable
Layout
Shell
```

framework 別の典型ファイル:

- Vuetify: `vuetify.ts`, `theme.ts`, `createVuetify` 周辺
- Tailwind: `tailwind.config.*`, `globals.css`, `@layer` 定義
- Material 3 (Flutter): `theme/`, `ThemeData`, `colorScheme`, `textTheme`
- CSS Custom Properties: `tokens.css`, `variables.css`, `:root` 定義

---

## 禁止

- project design system を **読まずに** 外部思想だけで判断すること
- `#3b82f6` 等の **hard-coded color を新規追加** すること
- spacing / radius / font-size を **感覚で増やす** こと
- 類似 component が **既にあるのに自作** すること
- shared knowledge を **project design system より上に置く** こと

---

## 探した結果のメモ運用

agent が architect / run で得た「project design system の所在」は、
**Issue 本文 / Design Plan の `Components to Use` / `Tokens to Use` に明記** する。
これが次回作業時の lookup を短縮する。

---

## 未発見時の判断 (DS が無い / 部分的にしか無い場合)

lookup order を全部走査しても token / common component が見つからない project がある (新規・小規模・スパイク段階)。
このとき agent は **対話せず** 以下の 3 択から自己判断する。Architect / Run のフェーズ別に挙動を変える。

### 3 択 fallback

| 選択肢 | 適用条件 | 実体 |
|--------|---------|------|
| **a. DS 整備 ADR を提案** | 規模が中以上 / 複数画面 / 複数 contributor が見込まれる | Design Plan の冒頭に「DS 整備が前提条件」と明記し、別 Issue (`design: project design system の整備`) を提案するメモを残す。**実装は別 Issue に切り出し本タスクは skip**。 |
| **b. ボトムアップ token 抽出** | 既存画面が 1〜数枚あり、色 / spacing / radius がほぼ収束している | 既存 hard-code を集計して semantic 候補を導出し、Design Plan の `Tokens to Use` 節に「**新規定義**」として書く。`vuetify.ts` / `tokens.css` 等への追加を含む。 |
| **c. framework default 採用** | 採用 framework に標準 theme/token がある (Vuetify / Material 3 / Tailwind preset) | framework default を skill 上の DS とみなし、Design Plan の `Tokens to Use` に framework 標準値を明記。`primary` / `error` / `surface` 等の semantic role 名で参照する。 |

### フェーズ別の挙動

- **Architect Mode** で未発見:
  - a を選んだら ADR 別 Issue 提案 + 本タスクの Design Plan は前提条件付きで保留
  - b / c を選んだら Design Plan の `Tokens to Use` に **新規定義案** を明示し、その採用を Design Plan の前提として宣言
- **Run Mode** で未発見 (Architect で前提が抜けていた場合):
  - **実装に着手せず**、Issue コメントで「Design Plan に DS 前提が無いため Architect Mode への差し戻しを要請」と記録して中断
  - Run Mode は project DS が無い状態で hard-code を量産してはいけない (本 skill の禁止事項に直結)

### 判断ログ

3 択のいずれを採ったかは、Design Plan / Run の完了報告に **必ず明示**する。
書式例:

```text
## DS Lookup Result
- 検索範囲: README / Share/design-system/ / docs/design/ / vuetify.ts / tokens.css / components/Button.*
- 結果: 既存 token 未整備 (vuetify default のみ)
- Fallback 選択: c (framework default 採用)
- 採用根拠: 採用 framework が Vuetify、画面数 3、contributor 1 で短期スパイク段階
```
