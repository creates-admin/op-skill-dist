# Project Design System Lookup

UI 作業の前に project 固有の design system を探す手順。project 固有 DS は本 skill の一般則より常に優先する。

## Lookup order

上から順に探し、見つかったものを最優先する。1〜3 が OP の入口 (`~/.claude/skills/_shared/design-system.md`)。

1. `op-config.yaml` の `design_system` (カタログ・トークン・部品・契約の場所の地図)
2. `.claude/rules/design-system.md` (repo 固有の決まりと部品一覧・登録状態)
3. カタログページ (登録済み部品の実物)
4. project root の `README.md` / `CLAUDE.md` / `AGENTS.md`、`Share/design-system/` (社内共通 design system)、`docs/design/`
5. frontend の theme / token files (`vuetify.ts` / `theme.ts` / `tailwind.config.*` / `tokens.css` / `ThemeData` / `:root` 定義)
6. common components (`components/Button.*`, `components/Dialog.*`)、layout components
7. 同じ目的の既存画面 (同ドメインの先行画面)

## 未発見時の判断

design system が未導入 / 部分的な repo の扱いは `design-system.md` に従う (既存 UI を踏襲して進め、
「デザインシステム未導入: `/op-skill:op-component --init` を推奨」と 1 行添える)。未導入でも hard-code の新規追加はしない。
既存 UI からも token / component を決められないときは `needs_human_decision` で返す。

## 禁止

- project design system を読まずに外部思想だけで判断する
- hard-coded color (`#3b82f6` 等) を新規追加する
- spacing / radius / font-size を感覚で増やす
- 類似 component があるのに自作する
