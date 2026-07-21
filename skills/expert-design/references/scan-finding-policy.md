# Scan / Patrol Finding Policy (design domain)

scan / patrol で **何を起票して良く、何を起票してはいけないか** を、
designer-expert (design ドメイン) に対して定義する policy。
Issue 起票は下流コストに直結するため、**起票範囲を厳格に絞る** ことが目的。

## Related references

- `~/.claude/skills/_shared/severity-rubric.md` (Critical / High の定義)
- `~/.claude/skills/_shared/expert-spawn.md` (canonical schema)
- ux-ui ドメインの起票基準は `skills/expert-ux-ui-audit/references/scan-finding-policy.md` を参照

## scan の検出カテゴリ (= bulk_group カテゴリ)

scan の `design_principle_violated` フィールドの値域は agent.md `designer-expert.md` の **Scan Mode 観点 1〜9**。
`visual-hierarchy-patterns.md` の 10 パターンは **Architect 用** であり、scan の検出カテゴリではない (詳細パターンの参照ヒント止まり)。

混乱しがちなので、scan で起票するときは必ず:

- `design_principle_violated`: 観点 1〜9 のいずれか (例: `観点 1: design token bypass`)
- `bulk_group`: 9 観点に対応する `design:hardcoded-*` / `design:component-bypass` / `design:duplicate-ui-pattern` / `design:visual-hierarchy-break` のいずれか

---

## non-frontend scope での挙動 (即終了ルール)

scope / area に **UI surface が一切存在しない場合は、即座に空配列 `[]` を返す**。
op-scan / op-patrol が誤って designer-expert を呼んだ場合の安全弁であり、巡回コスト削減にも効く。

### UI surface とみなすもの (1 つでもあれば audit を進める)

- `.vue` / `.tsx` / `.jsx` / `.svelte` ファイル
- Flutter の `lib/**.dart` で `Widget` / `Scaffold` / `MaterialApp` / `CupertinoApp` を含むもの
- `pages/` / `views/` / `components/` / `screens/` / `routes/` / `features/` 配下の UI ファイル
- theme / token / palette / style / css / scss / tailwind / vuetify / naive-ui / material theme 定義
- design system の中央定義ファイル (`design-system/`, `tokens/`, `theme/`)

### UI surface とみなさないもの (即 `[]` 返却対象)

- Rust CLI / server / API のみ (`src/**.rs` で UI library を import しない)
- DB schema / migration (`migrations/`, `*.sql`, `schema.prisma`)
- queue / worker / scheduler (バックエンド処理)
- proto / DTO 定義 (`*.proto`, `openapi.yaml`)
- インフラ・設定ファイル (`Dockerfile`, `.github/`, `terraform/`)

判定不能な mixed scope (Tauri 等) は UI surface があるかを Glob で素早く確認し、
あれば audit、無ければ `[]` を返す。

---

## 起票してよい (Critical / High のみ)

design 観点で起票して良いのは、**観測可能な design system 破綻** に限る。

- token bypass / 共通 component bypass が **複数箇所に広がっている**
  (5 箇所以上で High、design system 全体に蔓延で Critical)
  <!-- 経験則: 3 件だと誤検知 (たまたま hard-code が残った箇所)、10 件だと検出遅延。
       project 側で `CLAUDE.md` の `design.bulk_group_min` または `docs/design/scan-overrides.md` で上書き可。 -->
  <!-- 「全体に蔓延」の Critical 判定は、対象 framework の主要 surface (page / route / view) の
       50% 以上で同一 bypass が観測される、または theme 切替を物理的に阻害している場合に限る。 -->

- hard-coded style が **theme 切替・dark mode・brand 切替を物理的に不可能にしている**
- 同じ用途の UI が **複数実装に分裂し、ユーザーが「同じ操作」と認識できない**
- visual hierarchy の崩壊が **業務上の判断を妨げている**
  (重要操作が補助操作に埋もれる、序列が読めない)
- 一画面の design 不一致が **他画面と並んだとき認知負荷を生む**
- accessibility を犠牲にした見た目実装
  (contrast 破綻 / focus 不可視を装飾優先で残している)
- design system の将来変更を妨げる **構造的負債** が観測される

---

## 起票してはいけない (絶対禁止)

| 禁止 | 理由 |
|------|------|
| 「もっとおしゃれにできる」「もう少し垢抜けさせたい」 | 主観であり、観測事実ではない |
| 「単発の余白が 2px ずれている」 | 影響が観測できないなら起票しない (bulk_group で 5 件以上集まったら別) |
| 「色をもう少し落ち着かせた方がよい」 | 既存 design system が定義していない領域への主観批評 |
| 「ボタンをもう少し丸くしたい」 | 既存 token と整合していれば、好みは介入しない |
| 既存 design system が **未定義な領域** での主観提案 | 定義がないなら破綻ではない |
| 「将来こうなったらおしゃれになる」 | 観測事実 + 影響経路がないなら起票しない |
| ux-ui-audit-expert の領域 (使いやすさ・必須 state・a11y) への侵食 | 責務違反 |
| 未読箇所の推測指摘 | 見たものだけ報告する原則 |

---

## patrol 限定の追加制約 (op-patrol)

scan に加えて patrol では以下を厳守する。

- 好みのデザイン批評は完全禁止
- 命名・スタイルの好みは起票しない
- 「将来不安」だけの指摘は出さない
- **Medium / Low を一切起票しない**
- 全体 redesign 提案は出さない (巡回スコープ外)

---

## bulk_group 命名規則

5 件以上集まる類型は、個別 Issue ではなく **bulk Issue** として 1 件にまとめる。

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

---

## scan 出力契約 (canonical schema 補足)

`~/.claude/skills/_shared/expert-spawn.md` の canonical schema に従う JSON 配列。
`domain` フィールドには **`design`** を入れる。

各検出に以下を含める。

- `design_principle_violated` — agent.md `designer-expert.md` の **Scan Mode 観点 1〜9** のどれに違反しているか
- `bypass_count` — 同一カテゴリの bypass が観測された箇所数。**`confirmed_bypass_count` を採用** (raw grep カウントではない)
- `affected_screens` — 視覚的不統一の影響範囲 (ファイル数 / 画面数。framework 別の数え方は下記)
- `evidence` — 該当コード 5〜10 行 (静的に観測したもの)
- `evidence_grade` — `direct | inferred | requires_runtime` (`direct` 以外で Critical 不可)
- `severity_reason` — Critical / High と判定した根拠
- `recommended_runner` — `designer-expert` (実装も自分の責務)
- `post_check_expert` — UI files を触る場合は `ux-ui-audit-expert`、そうでない場合は `null`
- `candidate_count` / `excluded_count` / `confirmed_bypass_count` / `exclusion_summary` — 後述の誤検知抑制カウンタ

### 誤検知抑制カウンタ (candidate / excluded / confirmed)

raw grep ヒット数をそのまま `bypass_count` にすると、token 定義 / SVG / generated / vendor 等の
「設計上 hard-code が許されている領域」の候補が混入し、起票判定 (5 件以上で High) を歪める。

そのため scan 出力に **3 つのカウンタ** を分けて含める。

| フィールド | 意味 |
|----------|-----|
| `candidate_count` | 一次 grep でヒットした raw 候補数 (除外前) |
| `excluded_count` | 標準 allowlist で除外した数 (下記) |
| `confirmed_bypass_count` | `candidate_count - excluded_count` = 実際の design system bypass |
| `bypass_count` | **= `confirmed_bypass_count` を採用**。起票判定もこれを使う |
| `exclusion_summary` | どの allowlist で除外したかの 1 行説明 (例: `tokens.css / svg / snapshot / generated を除外`) |

#### 標準 allowlist (これらに含まれる候補は `excluded_count` に積む)

以下のパス / ファイルは hard-code が設計上許容されているため、**confirmed_bypass_count から除外**する。

```
# token / theme / palette 定義 (これらが hard-code するのが本来の役割)
**/tokens/**
**/theme/**
**/palette/**
**/design-system/**
**/*.tokens.{ts,js,json,css,scss}
**/vuetify.{ts,js}
**/tailwind.config.{ts,js}
**/material_theme.dart

# 静的アセット / 生成物
**/*.svg
**/*.png
**/*.jpg
**/icons/**
**/assets/**
**/generated/**
**/dist/**
**/build/**
**/node_modules/**
**/target/**
**/.dart_tool/**

# vendor / 外部由来
**/vendor/**
**/third_party/**

# テスト fixture / snapshot / golden
**/__snapshots__/**
**/__fixtures__/**
**/test-fixtures/**
**/golden/**
**/*.snap

# brand / chart 定義 (semantic 色とは別軸の絶対色が許される)
**/brand/**
**/chart-config/**
**/*.chart.{ts,js,json}
```

プロジェクトで追加 allowlist が必要な場合は `CLAUDE.md` または `docs/design/scan-overrides.md` で
上書き定義する (project レイヤが知識ベースを上書きする原則)。

#### 起票判定の原則

- `confirmed_bypass_count` 0〜4 件 → 起票しない (主観指摘になるため)
- `confirmed_bypass_count` 5〜29 件 → bulk Issue 起票 (High)
- `confirmed_bypass_count` 30 件以上 + 主要 surface の 50% 以上で観測 → bulk Issue 起票 (Critical 検討)

raw `candidate_count` で判定してはいけない。常に `confirmed_bypass_count` で判定する。

### evidence_grade のローカル定義 (`_shared/expert-spawn.md` と同義)

design ドメインの判定基準として以下を使う:

- `direct` — ファイル / 行 / token 値 / component 名を**そのまま示せる**(例: `Button.vue:42` で `color: #3b82f6` を観測)
- `inferred` — 周辺コードから**推論**(例: 親 component で hard-code、子で再定義していそう、要追加調査)
- `requires_runtime` — 実行時検証が必要(例: theme 切替後の contrast、SR の読み上げ順)

**`direct` 以外で Critical を付けない**。`requires_runtime` のときは `reproduction_hint` を必須記入。

#### static 代理で `direct` に格上げ可能なケース

`_shared/runtime-verification.md` の「検証対象 × 手段マトリクス」を参照。
以下は runtime に見えるが **static 代理が成立する** 項目で、代理が確認できれば `direct` を付けて Critical 起票可能:

- focus 視認性 (`:focus-visible` ルールの定義 + `outline: none` 打ち消しの不在)
- token 同士の contrast (両 token が定数なら WCAG 計算で `direct`)
- theme 連動 (hard-code 色の grep 結果が 0 件なら theme 連動が `direct` に証明される)
- keyboard 到達 (`<button>` 要素 + `tabindex="-1"` 不在)

詳細とマトリクスは `_shared/runtime-verification.md` を参照。
**Hard blockers (`visual-quality-rubric.md`) を `requires_runtime` に逃がしてはいけない**。

### framework 別「画面」の数え方 (`affected_screens` の単位)

| framework | 1 画面 = | 数え方 |
|-----------|---------|--------|
| Vue / Nuxt | route component (pages/views 配下の SFC、または `<router-view>` 直下) | `src/pages/` `src/views/` のファイル数。子コンポーネントは含めない |
| React / Next.js | route component (`pages/` `app/` 配下の page entry) | `pages/*.tsx` `app/**/page.tsx` の数 |
| Flutter | `Scaffold` を持つ widget または `MaterialApp.routes` 値 | route 定義またはトップレベル Scaffold widget の数 |
| Svelte / SvelteKit | `+page.svelte` | `routes/` 配下の `+page.svelte` 数 |
| Tauri | window または route component | webview content の route 数 |

`affected_screens` は **ファイル数ではなく画面数**を入れる。共通 component (Button / Dialog) の bypass はそれを使っている画面数で数える。同 framework が判別不能な monorepo では「画面とみなした path」を `evidence` に列挙する。

---

## 自己点検チェックリスト (起票前に通す)

- [ ] 観測事実か (主観でないか)
- [ ] 該当ファイル / 該当行 / 該当 token を示せるか
- [ ] 影響範囲 (画面数 / ユーザー操作) を 1 文で説明できるか
- [ ] Critical / High の severity_reason を書けるか
- [ ] ux-ui-audit-expert の責務に踏み込んでいないか
- [ ] 既存 design system が定義していない領域への主観提案ではないか
- [ ] patrol なら Medium / Low を出していないか

---

## scan の経済性ルール (打ち切り基準)

scan は「画面横断で視覚秩序を見る」性質上、無限に Read を続けられてしまう。
agent は以下のルールに従って **打ち切る**。

### Grep 戦略 (前段)

bulk_group カテゴリごとに、まず project root から **`Grep` で観測候補を網羅**してから読み込む。
個別ファイルを順に Read してはいけない (経済性が壊れる)。

| bulk_group | 一次 Grep パターン例 (調整して使う) |
|-----------|-----------------------------------|
| `design:hardcoded-color` | `'#[0-9a-fA-F]{3,8}\b'` / `'rgba?\('` / `'hsla?\('` (frontend src 配下) |
| `design:hardcoded-spacing` | `'(margin|padding)(-[a-z]+)?:\s*\d+px'` (token を使うなら `var(--spacing-*)` / `theme.spacing.*`) |
| `design:hardcoded-typography` | `'font-(size|weight|family):\s*[^v]'` (`var(` 始まりは除外) |
| `design:component-bypass` | 既存 Button / Dialog / Toast の path 周辺で `<button` `<dialog` 直書き |
| `design:duplicate-ui-pattern` | 既知 component 名で grep し、近似 markup の component を別途 ripgrep |

### サンプリング上限

| 観点 | 1 scan あたりの読み込み上限 |
|------|---------------------------|
| 単一 bulk_group の代表サンプル | **最大 30 ファイル**まで Read。それ以上はカウントだけ取り、`bypass_count` に積む |
| 画面横断比較 (観点 7 / 8 / 9) | **最大 10 画面**まで Read。それ以上は Grep カウントで代用 |
| 一次 Grep 結果 | **最大 200 件**を表示。超える場合は path prefix で絞り込み |

### 早期打ち切り

- 一次 Grep でヒット 0 → そのカテゴリは起票せず次に進む
- ヒット 1〜4 件 → bulk_group の High しきい値未満。**起票しない**(個別の主観指摘になるため)
- ヒット 5〜29 件 → 全件 Read して bulk Issue 起票
- ヒット 30 件以上 → 30 件サンプリング + Grep 全件カウントで起票 (`bypass_count` に総数、`evidence` に代表 5〜10 行)

「ぜんぶ読まないと判定できない」と感じたらそれは判定不能を意味する。**判定不能なら起票しない**。

---

## design 検出の完成 JSON 例 (canonical schema 全要素)

scan が `design:hardcoded-color` を 32 箇所で観測した、bulk 起票の典型例。
`_shared/expert-spawn.md` の canonical schema に design 固有フィールド (`design_principle_violated` / `bypass_count` / `affected_screens` / `recommended_runner` / `post_check_expert` / `blocking` / `blocking_reason`) を加えた**完成形**。

```json
[
  {
    "title": "color hard-code が 32 箇所に散在し theme 切替を阻害",
    "severity": "high",
    "domain": "design",
    "files": [
      "frontend/src/components/JobCard.vue:24",
      "frontend/src/components/JobCard.vue:61",
      "frontend/src/views/JobBoard.vue:12",
      "frontend/src/views/JobDetail.vue:48",
      "frontend/src/components/StatusBadge.vue:9"
    ],
    "symbols": ["JobCard", "JobBoard", "JobDetail", "StatusBadge"],
    "summary": "frontend/src/ 配下で `#3b82f6` `#ef4444` `rgba(0,0,0,0.5)` 等の hard-code が 32 箇所に散在。`vuetify.ts` の `theme.themes.light/dark` を bypass しており、dark mode 切替時に色が固定値のまま残る。",
    "evidence": "frontend/src/components/JobCard.vue:24\n  background-color: #3b82f6;\nfrontend/src/components/JobCard.vue:61\n  border: 1px solid #ef4444;\nfrontend/src/views/JobDetail.vue:48\n  color: rgba(0,0,0,0.5);\n... (代表 5 箇所、全 32 件は bypass_count 参照)",
    "evidence_grade": "direct",
    "reproduction_hint": null,

    "hypothesis": "vuetify token が整備された後に追加された画面 (JobBoard 系) で token 参照ではなく色直書きが慣習化した。token 参照例 (Header.vue) と並存している。",
    "excluded_hypotheses": [
      "外部ライブラリ由来の色: 否定 (該当 32 箇所はすべて自社 src 配下)",
      "意図的な絶対色 (brand 色): 否定 (`vuetify.ts` の `theme.themes.light.colors.primary` と同値で、token 参照に置換可能)"
    ],

    "design_principle_violated": "観点 1: design token bypass / 観点 9: design system 構造的負債",
    "bypass_count": 32,
    "affected_screens": 7,

    "scope_in": [
      "frontend/src/components/JobCard.vue",
      "frontend/src/components/StatusBadge.vue",
      "frontend/src/views/JobBoard.vue",
      "frontend/src/views/JobDetail.vue"
    ],
    "scope_out": [
      "frontend/src/vuetify.ts (token 定義側は触らない)",
      "frontend/src/components/Header.vue (既に token 参照、別 scope)"
    ],

    "recommendation": {
      "type": "refactor",
      "steps": [
        "32 箇所の色直書きを `vuetify.ts` の既存 token (primary / error / on-surface-variant) に置換",
        "新規 token は追加しない (既存で表現可能なことを Architect Mode で確認済)",
        "dark mode で全画面の contrast 4.5:1 を再確認"
      ]
    },
    "verification_steps": [
      "32 箇所すべてを token 参照に置換したことを git diff で確認",
      "light / dark mode 両方で当該 7 画面のスクリーンショット差分を取り、固定色が残っていないこと",
      "WCAG AA contrast を dark mode 含めて再計測"
    ],
    "success_criteria": [
      "frontend/src/ 配下で `Grep -E '#[0-9a-fA-F]{3,8}\\b'` のヒットが該当 32 箇所で 0 になる",
      "dark mode 切替で全画面の background / border / text が token 連動する"
    ],
    "gotchas": [
      "`rgba(0,0,0,0.5)` のうち 1 箇所は overlay 用で `theme.colors.scrim` に置換が必要",
      "JobCard.vue の `#3b82f6` は state 別に色を変えていないため一見 token 化容易だが、selected / hover で別色を期待する箇所が混在"
    ],

    "bulk_group": "design:hardcoded-color",
    "confidence": "high",
    "requires_dynamic_verification": true,
    "recommended_runner": "designer-expert",
    "post_check_expert": "ux-ui-audit-expert",
    "blocking": false,
    "blocking_reason": null
  }
]
```

要点:

- `bulk_group` は 9 観点に対応する `design:*` カテゴリ
- `design_principle_violated` は観点 1〜9 のいずれか (複数該当時は ` / ` 区切り)
- `bypass_count` と `affected_screens` を**両方**入れる (前者はファイル箇所、後者は画面単位)
- `evidence_grade: direct` でなければ Critical 不可。`requires_runtime` のときは `reproduction_hint` 必須
- `recommended_runner: designer-expert` 固定 (apply も自身の責務)
- `post_check_expert`: UI ファイルを触る場合は `ux-ui-audit-expert`、そうでない場合は `null`。明示的に設定する (省略禁止)
- `blocking` / `blocking_reason`: 新規変更が既存 debt を悪化させる場合 `true` + 理由を設定。そうでなければ `false` + `null`
