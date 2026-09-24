# Frontend Performance — Vue 3 / TypeScript / Tauri WebView / Flutter

対象は initial bundle size / interaction latency / memory retention / LCP・TBT / asset サイズ。色・余白 (designer) や文言・状態網羅 (ux-ui-audit) は扱わない。性能指標 (bundle KB / LCP / TBT / latency) で示せるものだけ。

## 判断フロー

1. bundle visualizer / Lighthouse / DevTools Performance で bottleneck を特定 (大きい dependency か / LCP・TBT か / interaction latency か)
2. 大きい dependency → tree-shake / lazy load、bundle size diff で確認
3. interaction latency → computed / watch / DOM 量を見直し profile で確認
4. listener / watcher 解除漏れ → cleanup 追加、heap snapshot で leak 確認
5. 改善後に同じツールで再計測

bundle size diff: base と作業ブランチで `npm run build` し `dist/assets` のサイズを比較。build 時間は `hyperfine --warmup 1 --runs 3 'npm run build'`。

---

## bundle

- **全 import**: `import _ from 'lodash'` / `import * as moment` → `lodash-es/debounce` 等の named import、tree-shakable な代替 (moment → dayjs / date-fns、lodash → lodash-es / es-toolkit、ag-grid 全部 → @tanstack/vue-table)。**visualizer で 100 KB 以上かつ initial chunk に含まれることを確認してから** 置換する (実は数 KB しか効かないことがある)
- **route lazy load**: `component: () => import('@/pages/Editor.vue')`。重い dialog / modal は `defineAsyncComponent(() => import(...))`、ボタン押下時に読むなら `await import(...)`
- **tree-shake 阻害**: `package.json` の `"sideEffects": false` 未宣言 / barrel `export *`
- **icon**: `@iconify` / `@fortawesome/free-*` 全 bundle → `unplugin-icons` で必要分だけ、または SVG sprite
- **Vuetify**: `vite-plugin-vuetify` の on-demand 取り込み。`import * as components from 'vuetify/components'` の全登録を避ける
- **`@tauri-apps/api`**: named import
- **asset**: 画像は WebP / AVIF、font は subset、巨大 JSON は dynamic import

## runtime (Vue 3)

- **computed の過剰再計算**: 10 万件を入力 1 文字ごとに sort + filter → sort を別 computed に分けて事前計算、query は `debouncedRef` (200 ms 程度)、重い filter は Web Worker (comlink) へ
- **deep watch**: 巨大 object の `{ deep: true }` → 必要 field だけ watch
- **reactivity の過剰**: 大型 read-only データは `shallowRef` / `markRaw`。ただし reactive が必要なものに適用すると UI が更新されなくなる。全 ref への一律適用は禁止
- **大量 DOM**: 1 万件規模の `v-for` は `useVirtualList` (@vueuse/core) / `vue-virtual-scroller`
- **listener / timer 解除漏れ**: `onMounted` の `addEventListener` / `setInterval` は `onUnmounted` で `removeEventListener` / `clearInterval` と対にする (timer id を保持)。`useEventListener` なら自動 cleanup。Tauri の `listen` は返り値の `unlisten()` を呼ぶ
- Web Worker は IPC overhead が新しい bottleneck になりうる。µs 単位の処理を逃がさない

## Tauri WebView

- binary は IPC でなく `convertFileSrc` の file URL で渡す (`tauri-performance.md`)
- 古い WebView2 (古い Windows 10 build) では polyfill が要る場合がある

## Flutter

- 計測は `flutter run --profile` + devtools (Performance / Memory)。debug mode の数値で判断しない
- サイズは `flutter build apk --release --analyze-size` の code-size-snapshot で比較
- `TextEditingController` / `FocusNode` / `AnimationController` / `StreamSubscription` は `dispose()` で `dispose` / `cancel` する (漏れは長時間運用のメモリ肥大)
- 長いリストは `ListView.builder` 等の lazy builder を使い、children 全生成を避ける
- 不変 widget は `const` にして rebuild を抑える。`build()` 内で重い計算・parse をしない (state か isolate へ)
- 重い CPU 処理は `compute()` / `Isolate.run()` で UI isolate の外へ

## アンチパターン

- visualizer を見ずにライブラリを差し替える / LCP・TBT を測らずに lazy load する
- `shallowRef` / `markRaw` の一律適用
