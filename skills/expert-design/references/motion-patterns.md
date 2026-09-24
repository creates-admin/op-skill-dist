# Motion Patterns

motion は状態変化と因果を伝えるフィードバックであり、装飾ではない。duration / easing は既存の motion token を経由し、
生の数値・curve を直書きしない。token が無ければ needs_human_decision で返す。reduced-motion を含む a11y の最終判定は ux-ui-audit-expert。
装飾としての動き (大げさな entrance・多数要素の同時アニメ・装飾ループ) は `~/.claude/skills/_shared/design-ng.md` の NG。

## AI 到達ライン

| Tier | 内容 | Apply での扱い |
|------|------|--------------|
| ① 宣言的 transition | `<Transition>` 等 + token の duration / easing による enter / leave・状態切替 | 自走してよい |
| ② declarative preset | `@vueuse/motion` の fade / slide / pop 等の既製 preset (導入済みの project のみ。依存を追加しない) | 自走してよい |
| ③ stagger / orchestrated | 一覧の順次出現 / 複数要素の連動 sequence | 作り込まない。必要なら needs_human_decision |
| ④ 物理 / 複雑 keyframe | spring / FLIP / 多段 keyframe / path animation | 作り込まない。必要なら needs_human_decision |

## Static Hard blockers

static (Read / Grep) で有無を検出できるもの。1 つでもあれば完了扱いにしない。

1. `prefers-reduced-motion` fallback 欠落 (非自明な animation / transition があるのに reduce 分岐が無い)
2. duration / easing のハードコード (`transition: 0.23s` / 生 `cubic-bezier(...)`)
3. layout-triggering プロパティ (`width` / `height` / `top` / `left` / `margin` / `padding` 等) の animate
4. 5 秒以上の自動再生に停止手段なし
5. `animation-iteration-count: infinite` に停止手段も reduced-motion 停止も無い

動かして見ないと判定できない質 (timing の自然さ / easing の方向感 / 複数要素の協調 / 反復使用時の鬱陶しさ) は
BLOCK せず、完了報告で human 確認項目として挙げる。

## Choreography 語彙

stagger (順次出現) / parenting (親の動きに子を従属) / spatial continuity (list ↔ detail 等で同一概念を繋ぐ) は Tier ③④。
意味の伝達 (重要度 / まとまり / 移動先) のためにだけ使い、Apply では作り込まない。
