# Motion Patterns

/**
 * 機能概要: UI の transition / animation / micro-interaction を「token 駆動 + 意味のあるフィードバック」
 *           として設計するための判断基準・motion token scale・実装規約・検証境界を集約する。
 * 作成意図: repo には motion の能動設計能力が存在せず (従来は prefers-reduced-motion 尊重の防御的
 *           a11y ガードレールのみ)、motion 役 spawn が拠り所なく「好み」で動きを作るのを防ぐため、
 *           ADR-0012 (design 多役 orchestration) Wave1 として本ファイルを正本化する。
 * 注意点: 本ファイルは Architect Mode の Design Plan (`### Motion Strategy` 節) と Run Mode の
 *         実装で使う設計パターン集。scan の検出カテゴリには直接対応しない (motion 品質は本質的に
 *         requires_runtime = 動かして見ないと判定できないため、static scan で Critical はほぼ生まない。
 *         static で検出可能な「有無」だけが Hard blocker)。a11y の最終判定は ux-ui-audit-expert に委譲する。
 */

UI の動き (transition / animation / micro-interaction) の設計規則。
**motion は装飾ではなく、状態変化と因果を伝えるフィードバック**。「動きがあるとカッコいい」で動きを増やしてはいけない。
動きは必ず **motion token** (duration / easing) を経由し、生の数値・curve を直書きしない。

## AI 到達ライン (最初に読め — over-promise 回避)

motion 品質は「動かして見ないと分からない」。AI agent が安定生成できる範囲には構造的な天井がある。
**この境界を越えた要求は「仕様まで AI / 仕上げは human」**と明示し、AI に丸投げできるかのように扱わない。

| Tier | 内容 | AI の守備範囲 |
|------|------|--------------|
| ① 宣言的 transition | Vue3 `<Transition>` + CSS custom property の duration/easing **token** を当てた enter/leave・state 切替 | ✅ **完成まで安定生成可能** |
| ② declarative preset | `@vueuse/motion` の fade / slide / pop 等の既製 variant preset | ✅ 概ね安定 (preset 選定 + token 値注入まで) |
| ③ stagger / orchestrated | リスト要素を順次ズラして出す / 複数要素を連動させる sequence | △ **仕様は書ける。実装の質 (間・連動の自然さ) は human review 必須** |
| ④ 物理 / 複雑 keyframe | spring (mass/stiffness/damping) / FLIP / 多段 keyframe / path animation | △ **Design Plan に意図のみ記述。実装は human or ライブラリ preset に委譲する gated 領域** (AI 単独は振動・不自然さが残る) |

- ①② は **motion token を当てるだけ**に構造化されているため AI が確実に担える。Design Plan が token を指定し、Run Mode が `<Transition>` / preset に流す。
- ③④ は「動かして選ぶ」性質を持つ。Design Plan に意図 (なぜ・どの要素が・どう連動) を書くところまでが AI の役目で、最終的な心地よさの確定は human が握る。③④ を多用する novel な演出は **design spike** (ADR-0012 決定7: Storybook stories / draft PR で候補を出し人間が選ぶ) に逃がす。

## Related references

- `philosophy.md` (装飾しない / 迷ったらやらない原則)
- `decision-order.md` (既存 token/pattern を先に使う判断順)
- `visual-quality-rubric.md` (animation で UX/a11y を退化させていないかの 5 軸採点・Hard blocker)
- `project-design-system-lookup.md` (motion token の DS Lookup / 不在時の fallback)
- ux-ui-audit-expert `a11y-checklist.md` (prefers-reduced-motion の最終判定権はこちら)
- Material Design Motion: https://m3.material.io/styles/motion/overview
- WCAG 2.2 — 2.3.3 Animation from Interactions / 2.2.2 Pause, Stop, Hide

---

## Motion token scale (canonical foundation)

duration / easing は **foundation の canonical token** として定義する (color / spacing token と同列)。
画面側で生の `0.23s` / `cubic-bezier(...)` を直書きしない (= token bypass = Hard blocker)。
token-curation 役は不在なら既存 scale に整合する形で正規化追加する (foundation 役 authority、per-feature 役は参照のみ)。

### Duration scale

| token | 値 | 用途 |
|-------|----|------|
| `--motion-duration-instant` | `0ms` | アニメなし (reduced-motion fallback / 即時フィードバック) |
| `--motion-duration-fast` | `100–150ms` | micro-interaction: hover / press / 小さな toggle / checkbox |
| `--motion-duration-base` | `200–250ms` | 標準 UI transition: dropdown / tooltip / 小 panel / tab 切替 |
| `--motion-duration-slow` | `300–400ms` | 大きな面: modal / drawer / page section / expand-collapse |
| `--motion-duration-deliberate` | `500ms+` | 稀。大きく強調したい瞬間のみ。多用禁止 (体感が重くなる) |

原則: **動く距離 / 面積が大きいほど長く**。小さいものを遅く動かすと「もたつき」、大きいものを速く動かすと「ぶっきらぼう」に感じる。

### Easing scale

| token | curve (目安) | 用途 |
|-------|-------------|------|
| `--motion-ease-standard` | `cubic-bezier(0.2, 0, 0, 1)` | 画面内を移動する要素 (両端が緩やか)。最も多用 |
| `--motion-ease-decelerate` | `cubic-bezier(0, 0, 0, 1)` (ease-out) | **入ってくる**要素 (速く現れて静かに止まる) |
| `--motion-ease-accelerate` | `cubic-bezier(0.3, 0, 1, 1)` (ease-in) | **出ていく**要素 (静かに動き出して速く消える) |
| `--motion-ease-emphasized` | `cubic-bezier(0.2, 0, 0, 1)` + 長め duration | 重要・表現的な瞬間。primary action 完了等 |

原則: **enter = decelerate / exit = accelerate / 画面内移動 = standard**。`linear` は loading spinner 等の等速回転以外で使わない (機械的に見える)。

---

## いつ動かす / いつ動かさないか

motion は「状態が変わった理由」を伝えるときだけ使う。`decision-order.md`「迷ったらやらない」を motion にも適用する。

### 動かす (意味がある)

- **状態遷移の因果**: 開く/閉じる/展開/折りたたみ — どこから来てどこへ行くかを示す
- **空間の連続性**: 同じ要素が位置・サイズを変える (list→detail 等) を繋ぐ
- **フィードバック**: 操作が受理されたことの即時応答 (button press / toggle)
- **注意誘導**: 新着・エラー等、見てほしい変化への最小限の誘導 (1 回・短く)

### 動かさない (装飾・有害)

- 意味のない自動再生・ループ・背景アニメ
- ページ読み込みごとの大げさな entrance 演出 (毎回見ると邪魔になる)
- 情報の出現を遅延させるだけの transition (ユーザーを待たせる)
- 同時に多数の要素が動く (どこを見ればいいか分からなくなる)

---

## Transition pattern カタログ

| pattern | 使う場面 | duration / easing | Vue3 実装 | AI Tier |
|---------|---------|-------------------|-----------|---------|
| **enter / leave (fade)** | tooltip / dropdown / toast | fast–base / decelerate(in)・accelerate(out) | `<Transition>` + CSS opacity | ① |
| **slide (drawer / panel)** | drawer / side panel / sheet | base–slow / standard | `<Transition>` + `transform: translateX/Y` | ① |
| **expand / collapse** | accordion / 詳細展開 | base / standard | height は animate 禁止 → `grid-template-rows` or `max-height` + 既知高さ、理想は transform scale | ①(注意) |
| **modal (scrim + surface)** | dialog / confirm | slow / scrim=fade・surface=decelerate | `<Transition>` 2 要素 (背景 + 本体) | ① |
| **state feedback (press / toggle)** | button / switch / checkbox | fast / standard | CSS `:active` + transition、または @vueuse/motion | ①② |
| **list stagger** | 一覧の順次出現 | 各 fast、間 30–50ms | `<TransitionGroup>` + 遅延 (要 human 確認) | ③ |
| **shared element / FLIP** | list ↔ detail で同要素を繋ぐ | base–slow / standard | FLIP (ライブラリ推奨) | ④ |
| **spring (物理)** | drag 追従 / 弾む feedback | — | `@vueuse/motion` spring preset (パラメータは human 調整) | ④ |

`<TransitionGroup>` のリスト並べ替えは **必ず `key` を安定させる**。index を key にすると move transition が壊れる。

---

## Choreography 語彙 (時間軸の composition、ADR-0013 決定I追補)

hierarchy & composition の craft は静的配置だけで完結しない。要素の **出現順・連動・空間連続性** は
時間軸の craft (= choreography) であり、`visual-craft-tiers.md` の composition 次元からここへ pointer される。
choreography は本質的に Tier③④ (仕様は書けるが質は human polish / 実物を動かして確認) に属する。

| 語彙 | 意味 | 使う場面 | AI Tier |
|------|------|---------|---------|
| **stagger** | 複数要素を一定間隔ずつ遅延させて順次出現させる (視線を順序づける) | 一覧・カードグリッドの初回表示、フォーム項目の段階提示 | ③ (間隔 30–50ms、自然さは human 確認) |
| **parenting** | 親要素の動きに子要素を従属させ、まとまりとして動かす (= 1 つの意味単位に見せる) | パネル展開時に内側要素を連動、グループ移動 | ③ (連動の重み付けは human polish) |
| **spatial continuity** | 画面遷移で同一概念を空間的に繋ぎ、どこから来てどこへ行くかを保つ (FLIP / shared element) | list ↔ detail、tab 切替、wizard step 間 | ④ (FLIP / shared element は実装の質が human 委譲) |

- choreography は **意味の伝達** (どの要素が重要か / どれが 1 まとまりか / どこへ動いたか) のためにのみ使う。装飾的な連続アニメーションは「動かさない」(L88) 側。
- 静的 composition (`visual-craft-tiers.md`) と動的 choreography (本節) は地続きで、Tier の考え方 (①② は token で自走 / ③④ は human polish) も共通。
- choreography の **質** (間の心地よさ・連動の自然さ・空間連続の説得力) は `## Runtime-only な質` で扱い、static gate では BLOCK しない (有無のみ Static Hard blocker)。

---

## 性能ガード (絶対)

motion は 60fps (1 フレーム 16.7ms) を割らないことが品質の前提。割れた瞬間に「カクつき」として品質が崩れる。

- **animate してよいのは `transform` と `opacity` のみ** (compositor だけで処理でき reflow/repaint を起こさない)。
- **layout-triggering プロパティを animate しない**: `width` / `height` / `top` / `left` / `right` / `bottom` / `margin` / `padding` — これらは毎フレーム reflow を起こす (= Hard blocker)。サイズ変更は `transform: scale()`、位置移動は `transform: translate()` で表現する。
- `will-change` は**動く直前に付け、終わったら外す** (付けっぱなしは GPU メモリを浪費する)。常時 `will-change` 禁止。
- 同時に動かす要素数を抑える (大量要素の同時 transition は frame drop の主因)。
- 画像・影 (`box-shadow`) の animate は重い。影を動かすなら擬似要素の `opacity` で代替する。

---

## prefers-reduced-motion (a11y、絶対)

前庭障害・動き酔いのあるユーザーのため、**すべての非自明な motion は `prefers-reduced-motion: reduce` で無効化/簡素化する fallback を必ず持つ** (欠落 = Hard blocker)。最終判定権は ux-ui-audit-expert (`a11y-checklist.md`)。

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

- 「動き」を消しても **状態変化自体は伝わる**こと (transition を消すのであって、開いた/閉じたの結果は残す)。
- parallax / 大きな移動 / 回転 / ズーム / 自動再生は reduced-motion で**完全停止**する。fade 程度の軽微な opacity は残してよい。
- 自動再生・ループするものは reduced-motion 有無に関わらず **停止手段 (pause)** を提供する (WCAG 2.2.2)。

---

## Static Hard blockers (gate / post-check で BLOCK 可)

motion 品質の大半は requires_runtime だが、以下は **static (Read/Grep) で「有無」を検出できる**ため gate / post-check で BLOCK してよい (将来 `op` CLI 化候補)。

1. **`prefers-reduced-motion` fallback 欠落** — 非自明な animation/transition があるのに reduce 分岐が無い。
2. **duration / easing のハードコード (token bypass)** — `transition: 0.23s` / 生 `cubic-bezier(...)` 直書き。motion token を経由していない。
3. **layout-triggering プロパティの animate** — `transition`/`animation`/`@keyframes` が `width`/`height`/`top`/`left`/`margin`/`padding` を対象にしている。
4. **5 秒以上の自動再生に停止手段なし** — auto-play が長尺なのに pause / stop が無い。
5. **無限ループで停止不可** — `animation-iteration-count: infinite` に停止手段も reduced-motion 停止も無い。

---

## Runtime-only な質 (BLOCK しない、human 確認項目)

以下は動かして見ないと判定できない。**op-run の static verify では落とさず**、Design Plan の `Verification` 節に「human が動作確認すべき項目」として列挙する (③④ を含む motion は especially)。

- timing の自然さ (速すぎ/遅すぎ、距離と duration の釣り合い)
- easing の心地よさ (enter/exit の方向感、機械的でないか)
- orchestration の一貫性 (複数要素が協調して動くか、バラバラでないか)
- 振動・overshoot の不自然さ (spring が気持ち悪くないか)
- 反復使用時の鬱陶しさ (毎回見ても邪魔にならないか)

これらが品質を左右する motion (③④) は、Storybook stories / draft PR で複数候補を実際に動かして人間が選ぶ (design spike、ADR-0012 決定7)。

---

## Vue3 実装規約

### `<Transition>` + CSS custom property token (① の基本形)

duration / easing は CSS custom property (= motion token) を参照し、生値を書かない。

```vue
<template>
  <Transition name="panel">
    <aside v-if="open" class="panel">...</aside>
  </Transition>
</template>

<style scoped>
.panel-enter-active { transition: transform var(--motion-duration-base) var(--motion-ease-decelerate),
                                   opacity var(--motion-duration-base) var(--motion-ease-decelerate); }
.panel-leave-active { transition: transform var(--motion-duration-base) var(--motion-ease-accelerate),
                                   opacity var(--motion-duration-base) var(--motion-ease-accelerate); }
.panel-enter-from, .panel-leave-to { opacity: 0; transform: translateX(16px); }  /* transform のみ */
</style>
```

### `@vueuse/motion` preset (② の declarative)

複雑な keyframe を手書きせず、preset (`v-motion-fade` / `v-motion-slide-*` / `v-motion-pop`) に token 由来の duration を渡す。spring (④) を使う場合 stiffness/damping は **human が調整する前提**で Design Plan に「要調整」と明記する。

### 使い分け

- 状態の enter/leave / 切替 → `<Transition>` / `<TransitionGroup>` (Vue 標準で十分、依存を増やさない)。
- 宣言的な entrance preset を多用する → `@vueuse/motion` (既存プロジェクトが導入済なら)。**未導入なら勝手に依存追加しない** (feature-expert 同様、silent fork 禁止 / DS Lookup で確認)。
- FLIP / shared element / 物理 → ライブラリ + human 調整 (④)。

---

## Architect Mode で motion を Design Plan に書くときの節構造

`pr-templates.md` の Design Plan template に **`### Motion Strategy`** を motion を使う画面に限り追加する (Chart Strategy と同形式の条件付き additive 節)。token 適用 (①②) で済む範囲か、human polish が要る (③④) かを必ず明記する。

```markdown
### Motion Strategy (motion を使う画面のみ)

#### Design Intent
- なぜ動かすか (どの状態変化の因果を伝えるか) — 1〜2 文
- 動かす要素: <panel / list / button / 等>

#### 採用 pattern
- <enter-leave / slide / expand-collapse / state-feedback / list-stagger / 等>
- Tier: ①② (token 適用で完成) / ③④ (仕様のみ、human polish 要・design spike 候補)

#### 使用 motion token
- duration: <--motion-duration-fast / base / slow>
- easing: <--motion-ease-standard / decelerate / accelerate>
- (token 不在なら token-curation 役が正規化追加。生値直書き禁止)

#### 性能
- animate 対象: transform / opacity のみ (layout-triggering プロパティ不使用)

#### Reduced Motion (必須)
- prefers-reduced-motion: reduce 時の挙動 (完全停止 / fade のみ残す)
- 状態変化の結果は reduced でも伝わるか: はい

#### Verification (human 確認、③④ は必須)
- [ ] timing が自然か (動かして確認)
- [ ] easing の方向感 (enter=decelerate / exit=accelerate)
- [ ] 反復使用で鬱陶しくないか
- [ ] (③④) Storybook / draft PR で候補比較が要るか
```

---

## 禁止 (motion アンチパターン)

| 禁止 | 影響 |
|------|------|
| duration / easing の生値直書き (token bypass) | foundation の motion token が形骸化、将来一括変更不能 |
| `width`/`height`/`top`/`left`/`margin` の animate | 毎フレーム reflow で frame drop (カクつき) |
| 常時 `will-change` | GPU メモリ浪費、かえって遅くなる |
| prefers-reduced-motion fallback なし | 前庭障害ユーザーに有害 (WCAG 2.3.3 違反) |
| 停止できない自動再生 / 無限ループ | WCAG 2.2.2 違反、注意を奪い続ける |
| ページ読み込みごとの大げさな entrance | 反復で邪魔・体感が遅くなる |
| 多数要素の同時アニメ | 視線誘導が崩れ、frame drop |
| 物理 spring を AI 生成のまま無調整出荷 (④) | 振動・不自然さが残る (human 調整 or preset 必須) |
| 情報出現を遅延させるだけの transition | ユーザーを待たせる (動きが UX を悪化) |
| 動き優先で意味のないアニメ | motion = フィードバックの原則違反 |
