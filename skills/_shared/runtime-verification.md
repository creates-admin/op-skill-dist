# Runtime Verification (共通)

UI / a11y / 視覚秩序の検証で、runtime (Playwright / dev server / screen reader) が使えないときの static 代理と、
代理不能時の扱いを定める。expert-design / expert-ux-ui-audit の `evidence_grade` 判定と Hard blocker 採点に使う。

- runtime が使える範囲は runtime で検証し、不能な項目は static 代理、それも不能なら `requires_runtime` にする。
- static 代理が成立した項目は `evidence_grade: direct` として扱ってよい (Critical 起票可)。
- ハーネスで起動した実機の操作検証は本書の範囲外で、runtime verify 段 (verify-runner) が担う (`op-run/references/runtime-verify-dispatcher.md`)。

## 検証対象 × 手段マトリクス

| 領域 | 観点 | static 代理 | `requires_runtime` になる条件 |
|------|------|------------|------------------------------|
| focus | `:focus-visible` リング表示 | `:focus-visible` ルールが定義され、`outline: none` で打ち消していない | なし (direct 判定可) |
| focus | focus indicator の contrast 3:1 | token 値同士の WCAG 計算 (`color.outline.focus` vs `color.bg.surface`) | custom outline 色 |
| focus | keyboard 到達順序 | DOM 順序と `tabindex` (数値指定なし = natural order) | — |
| contrast | 本文 4.5:1 | token から WCAG 計算 | 動的色 (CSS variable 継承 / runtime theme) |
| contrast | light / dark 両 theme | 両 theme の token 値で WCAG 計算 | token 値が定数でない |
| contrast | transparency 重なり後 | rgba 重なり計算 | 3 層以上の重なり |
| screen reader | 読み上げ順序 | DOM 順序 + `aria-label` / `aria-labelledby` | 複雑な ARIA pattern (treegrid / combobox) |
| screen reader | live region 通知 | `aria-live` 属性と更新トリガーの DOM 構造 | toast / queue 系 |
| screen reader | modal 内 focus trap | focus trap library の使用 | 自前実装 |
| theme | 全 token の theme 連動 | hard-code 色を Grep で網羅し 0 件なら連動証明 | なし (direct 判定可) |
| theme | `prefers-color-scheme` 尊重 | media query / theme provider のコード読み | — |
| motion | sticky header / footer | `position: sticky` + `top:` / `bottom:` の存在 | ちらつき / z-index 衝突など実描画挙動 |
| motion | `prefers-reduced-motion` 尊重 | `@media (prefers-reduced-motion: reduce)` ルールの存在 | — |
| motion | 5 秒以上のアニメーション pause | duration + pause 機構の有無 | pause が効くかどうか |
| hierarchy | 1 画面に primary action 1 つ | `variant="primary"` の出現回数 | — |
| hierarchy | empty / loading / error state 描画 | template の条件分岐 (`v-if` / `&&`) と state 名 | props 経由の動的 state |
| hierarchy | 高密度テーブルの行高 | `line-height` / `min-height` token | — |

## 「runtime に逃げてはいけない」項目 (Hard blocker 系)

以下は static 代理が成立する。runtime 不可を理由に Hard blocker を素通りさせず、static 代理でも検出できないときに限り `requires_runtime` に降格する。

| Hard blocker | 必須 static 代理 |
|--------------|---------------|
| focus が見えない | `:focus-visible` ルールが定義されている、または `outline: none` を打ち消し済 |
| keyboard 到達不可 | `<button>` 要素の使用、`<div @click>` の不在、`tabindex="-1"` の不在 |
| contrast 不足 | token 値同士の WCAG 計算で 4.5:1 / 3:1 を満たす |
| 状態が見えない | その UI に適用される状態 (loading / success / failure / empty / disabled / focus のうち該当するもの) の分岐が template に存在。該当しない状態は要求しない |
| 危険操作が保護されていない | 確認 dialog component の参照、`@click` 直結ではない |

## runtime 不可時の報告

agent が runtime 不可と判定したら、その理由 (`tool not available` / `permission denied` / `runtime missing`) を完了報告に明記する。
