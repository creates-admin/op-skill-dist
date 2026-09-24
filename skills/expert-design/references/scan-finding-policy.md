# Scan / Patrol Finding Policy (design domain)

scan / patrol で何を起票してよいかの基準。起票範囲は観測可能な design system 破綻に絞る。
共通の報告ルールは `~/.claude/skills/_shared/severity-rubric.md`、ux-ui ドメインの基準は expert-ux-ui-audit skill。

## UI surface が無い scope は即終了

UI surface が 1 つも無ければ、すぐに `{"findings": []}` を返す。

- UI surface とみなす: `.vue` / `.tsx` / `.jsx` / `.svelte`、Flutter の `Widget` / `Scaffold` / `MaterialApp` を含む `lib/**.dart`、
  `pages/` `views/` `components/` `screens/` `routes/` `features/` 配下の UI、theme / token / palette / style / css / scss /
  tailwind / vuetify 定義、`design-system/` `tokens/` `theme/`
- みなさない: UI library を import しない Rust CLI / server / API、DB schema / migration、queue / worker、proto / DTO、
  Dockerfile / `.github/` / terraform
- Tauri 等の mixed scope は Glob で UI surface の有無を確認してから判断する

## severity

`severity-rubric.md`「判定の手順」step 3〜4 の design 版。

- Critical: design system の構造的負債が theme / dark mode / brand 切替を物理的に不可能にしている /
  bypass が主要 surface の 50% 以上に広がり confirmed 30 件以上 / 共通 component bypass の蔓延がユーザーに「同じ操作」と認識されない実害を生んでいる
- High:
  - token bypass / 共通 component bypass が confirmed 5 件以上
  - 同じ用途の UI が複数実装に分裂している
  - visual hierarchy の崩壊が業務上の判断を妨げている (重要操作が補助操作に埋もれる)
  - 色記号体系の崩壊 (success / error の意味揺れ)
  - 一画面だけ別プロダクト化した design 不一致
  - 見た目優先の実装が原因の contrast 破綻 / focus 不可視

`design_principle_violated` (SKILL.md の観点 1〜9) と `bypass_count` / `affected_screens` の観測値を示せないなら起票しない。

## 起票してはいけない

| 禁止 | 理由 |
|------|------|
| 「もっとおしゃれに」「垢抜けさせたい」「色を落ち着かせたい」「もう少し丸く」 | 主観 |
| 単発の 2px ずれ | 影響が観測できない (bulk で 5 件以上なら別) |
| design system が未定義な領域での主観提案 | 定義がないなら破綻ではない |
| 「将来こうなったら」 | 観測事実 + 影響経路がない |
| 使いやすさ・必須 state・a11y 全般 | ux-ui-audit-expert の領域 (見た目優先の実装が原因の contrast 破綻 / focus 不可視だけは designer が起票してよい) |
| 未読箇所の推測 | 見たものだけ報告する |

## bulk_group 命名規則

同じ類型が 5 件以上なら bulk Issue として 1 件にまとめる。

```text
design:hardcoded-color        # token 未使用の色直書き
design:hardcoded-spacing      # spacing scale 未使用の余白直書き
design:hardcoded-typography   # font-size / weight / line-height 直書き
design:hardcoded-radius       # border-radius 直書き
design:hardcoded-shadow       # box-shadow 直書き
design:component-bypass       # 既存共通 component を使わない自前実装
design:duplicate-ui-pattern   # 同一用途 UI の複数実装分裂
design:visual-hierarchy-break # 重要度と視覚重みの不一致
```

## カウント (candidate / excluded / confirmed)

raw grep 件数で判定しない。

| フィールド | 意味 |
|----------|-----|
| `candidate_count` | 一次 grep の raw 候補数 |
| `excluded_count` | 標準 allowlist で除外した数 |
| `confirmed_bypass_count` | `candidate_count - excluded_count` |
| `bypass_count` | `confirmed_bypass_count` と同値。起票判定はこれを使う |
| `exclusion_summary` | 除外理由の 1 行 (例: `tokens.css / svg / snapshot / generated を除外`) |

標準 allowlist (hard-code が設計上許容される):

```text
**/tokens/** **/theme/** **/palette/** **/design-system/** **/*.tokens.{ts,js,json,css,scss}
**/vuetify.{ts,js} **/tailwind.config.{ts,js} **/material_theme.dart
**/*.svg **/*.png **/*.jpg **/icons/** **/assets/** **/generated/** **/dist/** **/build/**
**/node_modules/** **/target/** **/.dart_tool/** **/vendor/** **/third_party/**
**/__snapshots__/** **/__fixtures__/** **/test-fixtures/** **/golden/** **/*.snap
**/brand/** **/chart-config/** **/*.chart.{ts,js,json}
```

追加 allowlist と閾値は、対象 repo の CLAUDE.md / `docs/design/scan-overrides.md` があればそちらが上書きする。

| confirmed_bypass_count | 判定 |
|---|---|
| 0〜4 | 起票しない |
| 5〜29 | bulk Issue (High) |
| 30 以上 + 主要 surface の 50% 以上 | bulk Issue (Critical 検討) |

### affected_screens の数え方 (画面数であってファイル数ではない)

| framework | 1 画面 = |
|-----------|---------|
| Vue / Nuxt | `src/pages/` `src/views/` の route component (子 component は含めない) |
| React / Next.js | `pages/*.tsx` / `app/**/page.tsx` |
| Flutter | route 定義またはトップレベル `Scaffold` widget |
| SvelteKit | `routes/` 配下の `+page.svelte` |
| Tauri | webview の route |

共通 component の bypass は、それを使っている画面数で数える。判別不能な monorepo では「画面とみなした path」を evidence に列挙する。

## evidence_grade

定義は severity-rubric、static 代理は `~/.claude/skills/_shared/runtime-verification.md`。
例: `direct` = `Button.vue:42` で `color: #3b82f6` を観測 / `requires_runtime` = theme 切替後の contrast (`reproduction_hint` 必須)。

## scan の経済性 (打ち切り基準)

bulk_group ごとに、まず project root から Grep で候補を網羅してから読む。個別ファイルを順に Read しない。

| bulk_group | 一次 Grep パターン例 |
|-----------|---------------------|
| `design:hardcoded-color` | `#[0-9a-fA-F]{3,8}\b` / `rgba?\(` / `hsla?\(` |
| `design:hardcoded-spacing` | `(margin\|padding)(-[a-z]+)?:\s*\d+px` |
| `design:hardcoded-typography` | `font-(size\|weight\|family):\s*[^v]` |
| `design:component-bypass` | 既存 Button / Dialog / Toast の近くで `<button` `<dialog` 直書き |
| `design:duplicate-ui-pattern` | 既知 component 名で grep し、近似 markup を別途検索 |

- Read 上限: 単一 bulk_group の代表サンプル 30 ファイル / 画面横断比較 (観点 7〜9) 10 画面 / 一次 Grep 表示 200 件 (超えたら path prefix で絞る)
- ヒット 0 → 次へ。1〜4 → 起票しない。5〜29 → 全件 Read して bulk 起票。30 以上 → 30 件サンプル + Grep 全件カウント
- 全部読まないと判定できないなら判定不能 = 起票しない

## design 検出の出力契約

canonical schema と envelope は `~/.claude/skills/_shared/expert-spawn.md`。`domain: "design"`。design 固有:

- `design_principle_violated` (必須): SKILL.md の Scan Mode 観点 1〜9 (複数なら ` / ` 区切り)。例 `観点 1: design token bypass`
- `bulk_group`: 上記 `design:*`
- `bypass_count` と `affected_screens` の両方 + 上記カウンタ 4 種
- `recommended_runner: designer-expert` 固定
- `post_check_expert`: UI ファイルを触るなら `ux-ui-audit-expert`、そうでなければ `null` (省略しない)
- `blocking` / `blocking_reason`: 新規変更が既存 debt を悪化させるなら `true` + 理由、そうでなければ `false` + `null`
