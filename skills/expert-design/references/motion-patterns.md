# Motion Patterns

UI の動き (transition / animation / micro-interaction) の設計規則。motion は装飾ではなく、状態変化と因果を伝えるフィードバック。
動きは motion token (duration / easing) を経由し、生の数値・curve を直書きしない。
reduced-motion を含む a11y の最終判定は ux-ui-audit-expert。

## AI 到達ライン

| Tier | 内容 | AI の守備範囲 |
|------|------|--------------|
| ① 宣言的 transition | Vue3 `<Transition>` + CSS custom property の duration / easing token を当てた enter / leave・state 切替 | 完成まで安定生成可能 |
| ② declarative preset | `@vueuse/motion` の fade / slide / pop 等の既製 preset | 概ね安定 (preset 選定 + token 注入まで) |
| ③ stagger / orchestrated | リスト要素の順次出現 / 複数要素の連動 sequence | 仕様は書ける。質 (間・連動の自然さ) は human review 必須 |
| ④ 物理 / 複雑 keyframe | spring / FLIP / 多段 keyframe / path animation | 意図のみ。実装は human またはライブラリ preset に委譲 |

Apply で自走するのは ①② のみ。③④ は作り込まず、必要なら `needs_human_decision` で返す。

## Motion token scale

token が不在なら既存 scale に整合する形で正規化追加する。

| token | 値 | 用途 |
|-------|----|------|
| `--motion-duration-instant` | `0ms` | reduced-motion fallback / 即時フィードバック |
| `--motion-duration-fast` | `100–150ms` | hover / press / 小さな toggle / checkbox |
| `--motion-duration-base` | `200–250ms` | dropdown / tooltip / 小 panel / tab 切替 |
| `--motion-duration-slow` | `300–400ms` | modal / drawer / page section / expand-collapse |
| `--motion-duration-deliberate` | `500ms+` | 大きく強調したい瞬間のみ。多用禁止 |

| token | curve (目安) | 用途 |
|-------|-------------|------|
| `--motion-ease-standard` | `cubic-bezier(0.2, 0, 0, 1)` | 画面内を移動する要素 |
| `--motion-ease-decelerate` | `cubic-bezier(0, 0, 0, 1)` | 入ってくる要素 |
| `--motion-ease-accelerate` | `cubic-bezier(0.3, 0, 1, 1)` | 出ていく要素 |
| `--motion-ease-emphasized` | standard + 長め duration | primary action 完了等の重要な瞬間 |

- 動く距離・面積が大きいほど長く
- enter = decelerate / exit = accelerate / 画面内移動 = standard。`linear` は等速回転 (spinner) 以外で使わない

## いつ動かすか

動かす: 状態遷移の因果 (開く / 閉じる / 展開) / 空間の連続性 (list → detail) / 操作受理のフィードバック /
見てほしい変化への最小限の注意誘導 (1 回・短く)。

動かさない: 意味のない自動再生・ループ・背景アニメ / ページ読み込みごとの大げさな entrance /
情報の出現を遅らせるだけの transition / 多数要素の同時アニメ。

## Transition pattern カタログ

| pattern | 使う場面 | duration / easing | Vue3 実装 | Tier |
|---------|---------|-------------------|-----------|------|
| enter / leave (fade) | tooltip / dropdown / toast | fast–base / decelerate(in)・accelerate(out) | `<Transition>` + opacity | ① |
| slide | drawer / side panel / sheet | base–slow / standard | `<Transition>` + `transform: translate` | ① |
| expand / collapse | accordion / 詳細展開 | base / standard | height を animate しない。`grid-template-rows` or 既知高さの `max-height`、理想は transform scale | ① (注意) |
| modal (scrim + surface) | dialog / confirm | slow / scrim=fade・surface=decelerate | `<Transition>` 2 要素 | ① |
| state feedback | button / switch / checkbox | fast / standard | CSS `:active` + transition、または @vueuse/motion | ①② |
| list stagger | 一覧の順次出現 | 各 fast、間隔 30–50ms | `<TransitionGroup>` + 遅延 | ③ |
| shared element / FLIP | list ↔ detail で同要素を繋ぐ | base–slow / standard | FLIP ライブラリ | ④ |
| spring | drag 追従 / 弾む feedback | — | `@vueuse/motion` spring preset (パラメータは human 調整) | ④ |

`<TransitionGroup>` の key は安定させる (index を key にすると move transition が壊れる)。

## Choreography 語彙

要素の出現順・連動・空間連続性は時間軸の composition。意味の伝達 (重要度 / まとまり / 移動先) のためにだけ使う。

| 語彙 | 意味 | 使う場面 | Tier |
|------|------|---------|------|
| stagger | 一定間隔で順次出現させ視線を順序づける | 一覧・カードグリッドの初回表示 | ③ |
| parenting | 親の動きに子を従属させ 1 つの意味単位に見せる | パネル展開時の内側要素 | ③ |
| spatial continuity | 画面遷移で同一概念を空間的に繋ぐ | list ↔ detail、tab、wizard step | ④ |

## 性能ガード

- animate してよいのは `transform` と `opacity` のみ
- `width` / `height` / `top` / `left` / `right` / `bottom` / `margin` / `padding` を animate しない (サイズは `scale()`、位置は `translate()`)
- `will-change` は動く直前に付けて終わったら外す。常時付けない
- 同時に動かす要素数を抑える
- `box-shadow` は animate せず、擬似要素の `opacity` で代替する

## prefers-reduced-motion

非自明な motion はすべて `prefers-reduced-motion: reduce` で無効化 / 簡素化する fallback を持つ。

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

- 動きを消しても状態変化の結果は伝わること
- parallax / 大きな移動 / 回転 / ズーム / 自動再生は完全停止。軽微な opacity の fade は残してよい
- 自動再生・ループするものは reduced-motion に関係なく停止手段を提供する (WCAG 2.2.2)

## Static Hard blockers

static (Read / Grep) で有無を検出できるもの。1 つでもあれば完了扱いにしない。

1. `prefers-reduced-motion` fallback 欠落 (非自明な animation / transition があるのに reduce 分岐が無い)
2. duration / easing のハードコード (`transition: 0.23s` / 生 `cubic-bezier(...)`)
3. layout-triggering プロパティの animate
4. 5 秒以上の自動再生に停止手段なし
5. `animation-iteration-count: infinite` に停止手段も reduced-motion 停止も無い

動かして見ないと判定できない質 (timing の自然さ / easing の方向感 / 複数要素の協調 / spring の不自然さ /
反復使用時の鬱陶しさ) は BLOCK せず、完了報告で human 確認項目として挙げる。

## Vue3 実装規約

① の基本形 (duration / easing は token 参照、animate は transform / opacity のみ):

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
.panel-enter-from, .panel-leave-to { opacity: 0; transform: translateX(16px); }
</style>
```

- 状態の enter / leave / 切替 → `<Transition>` / `<TransitionGroup>` (Vue 標準で足りる)
- 宣言的 preset → `@vueuse/motion` (`v-motion-fade` / `v-motion-slide-*` / `v-motion-pop`)。既存 project が導入済の場合のみ。
  未導入なら依存を追加しない
- FLIP / shared element / 物理 → ライブラリ + human 調整 (④)

## 禁止

- duration / easing の生値直書き
- layout-triggering プロパティの animate / 常時 `will-change`
- prefers-reduced-motion fallback なし / 停止できない自動再生・無限ループ
- ページ読み込みごとの大げさな entrance / 多数要素の同時アニメ / 情報出現を遅らせるだけの transition
- 物理 spring を無調整で出荷する (④)
