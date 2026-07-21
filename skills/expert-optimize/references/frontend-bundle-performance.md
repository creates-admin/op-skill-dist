# Frontend Bundle Performance — Vue / Tauri フロント性能

<!--
機能概要: Vue 3 / TypeScript / Tauri WebView の bundle / 初期表示 / runtime 性能。
作成意図: optimize-expert は見た目の良し悪しではなく、initial bundle size /
         interaction latency / memory retention に限定して見る。
注意点: designer-expert / ux-ui-audit-expert と境界を侵食しない。
       性能指標 (LCP / TBT / bundle KB) で示せるものだけ扱う。
-->

## optimize-expert の対象 (frontend)

| 観点 | 対象 |
|------|------|
| initial bundle size | `dist/index.js` のサイズ、route 単位 splitting の有無 |
| interaction latency | invoke 往復、computed 再計算、deep watch、大量 reactive |
| memory retention | listener / watcher / setInterval の解除漏れ、shallowRef 不適切利用 |
| LCP / TBT | initial render の重い処理、main thread blocking |
| 画像 / asset | 巨大 image / SVG / icon library の全 import |

**対象外**: 色 / 余白 / 配色 (designer)、文言 / 状態網羅 (ux-ui-audit)。

---

## 検出対象 (scan)

### bundle-full-import — 巨大ライブラリの全 import

```typescript
// Bad
import _ from 'lodash'
import * as moment from 'moment'
import { Icon } from '@iconify/vue'  // 全 icon ロードのケースあり
```

判定:
- bundle visualizer で 100 KB 以上 / initial chunk に含まれる
- tree-shake が効かない named import / default import

改善:
```typescript
// Good
import debounce from 'lodash-es/debounce'
import dayjs from 'dayjs'  // moment より小さい
// icon は SVG 個別 or named export
import IconHome from '~icons/mdi/home'
```

### bundle-no-lazy-route — route lazy load 不在

```typescript
// Bad: 全 route が同期 import
import HomePage from '@/pages/Home.vue'
import HeavyEditor from '@/pages/Editor.vue'  // 重い editor も初期 bundle
const routes = [
  { path: '/', component: HomePage },
  { path: '/editor', component: HeavyEditor },
]
```

改善:
```typescript
// Good: 動的 import
const routes = [
  { path: '/', component: () => import('@/pages/Home.vue') },
  { path: '/editor', component: () => import('@/pages/Editor.vue') },
]
```

### bundle-no-async-component — modal / dialog の eager load

```typescript
// Bad
import HeavyDialog from './HeavyDialog.vue'

// Good
import { defineAsyncComponent } from 'vue'
const HeavyDialog = defineAsyncComponent(() => import('./HeavyDialog.vue'))
```

### computed-overcompute — computed の過剰再計算

```typescript
// Bad: items 全件を毎回 sort + filter
const filtered = computed(() => {
  return items.value
    .filter(i => i.match(query.value))
    .sort((a, b) => a.priority - b.priority)
})
// items 100,000 件、入力 1 文字ごとに走る → 入力遅延
```

改善:
```typescript
// debounce + indexed lookup
import { debouncedRef } from '@vueuse/core'
const debouncedQuery = debouncedRef(query, 200)

// 事前 sort
const sortedItems = computed(() => [...items.value].sort((a, b) => a.priority - b.priority))
const filtered = computed(() => sortedItems.value.filter(i => i.match(debouncedQuery.value)))

// または Web Worker で重い filter を逃がす
```

### deep-watch-overuse — deep watch 乱用

```typescript
// Bad: 巨大 object 全体を deep watch
watch(() => state, (newVal) => { /* ... */ }, { deep: true })
```

改善:
```typescript
// 必要な field だけ watch
watch(() => state.targetField, (newVal) => { /* ... */ })

// または 大型 read-only データは shallowRef / markRaw
import { shallowRef, markRaw } from 'vue'
const heavyData = shallowRef(largeData)
const tableConfig = markRaw({ /* reactive 不要 */ })
```

### list-no-virtualization — 大量 DOM の virtualization なし

```typescript
// Bad: 10,000 件の <li> を全 render
<ul>
  <li v-for="item in items" :key="item.id">{{ item.name }}</li>
</ul>
```

改善:
```typescript
// vue-virtual-scroller / @vueuse/core useVirtualList
import { useVirtualList } from '@vueuse/core'
const { list, containerProps, wrapperProps } = useVirtualList(items, { itemHeight: 32 })
```

### listener-no-cleanup — listener / timer 解除漏れ

```typescript
// Bad
onMounted(() => {
  window.addEventListener('resize', handler)
  setInterval(poll, 1000)
})
// onUnmounted での解除なし → ページ遷移後もリスナー残存
```

改善:
```typescript
import { onMounted, onUnmounted } from 'vue'

let timerId: number | undefined
const handler = () => { /* ... */ }

onMounted(() => {
  window.addEventListener('resize', handler)
  timerId = window.setInterval(poll, 1000)
})

onUnmounted(() => {
  window.removeEventListener('resize', handler)
  if (timerId) clearInterval(timerId)
})

// または useEventListener (vueuse) で自動 cleanup
import { useEventListener } from '@vueuse/core'
useEventListener(window, 'resize', handler)
```

### svg-icon-fullbundle — icon library 全 bundle

`@iconify` / `@fortawesome/free-*` の全 icon を bundle する設定。

改善:
- `unplugin-icons` で必要な icon だけ named import
- `iconify-json` を on-demand で resolve
- 自前 SVG sprite

---

## 計測ツール

### vite-bundle-visualizer

```bash
npx vite-bundle-visualizer
# stats.html が開く。treemap で大きい dependency を視覚的に確認
```

### Lighthouse / Chrome DevTools

```bash
# Lighthouse CLI
npx lighthouse http://localhost:1420 --output html --output-path ./report.html

# Core Web Vitals
# - LCP (Largest Contentful Paint) < 2.5s
# - TBT (Total Blocking Time) < 200ms
# - CLS (Cumulative Layout Shift) < 0.1
```

### hyperfine for build time

```bash
hyperfine --warmup 1 --runs 3 'npm run build'
```

### bundle size diff

```bash
# main vs branch の bundle 差分
git checkout main
npm run build
mv dist dist-main

git checkout work
npm run build
du -sh dist dist-main

# 詳細 diff
diff <(ls -la dist-main/assets) <(ls -la dist/assets)
```

---

## 改善パターン

### route-level code splitting

```typescript
// vue-router
const routes = [
  { path: '/', component: () => import('@/pages/Home.vue') },
  { path: '/heavy', component: () => import('@/pages/Heavy.vue') },
]
```

### tree-shakable な dependency 選定

| 重い | 軽い (tree-shakable) |
|------|--------------------|
| moment.js | dayjs / date-fns |
| lodash | lodash-es / es-toolkit |
| @iconify/vue 全部 | unplugin-icons (on-demand) |
| ag-grid 全部 | @tanstack/vue-table + 自前 cell |

### dynamic import で巨大 module を遅延

```typescript
// ボタン押下時に初めて editor をロード
async function openEditor() {
  const { Editor } = await import('@/components/HeavyEditor.vue')
  // ...
}
```

### shallowRef / markRaw で不要 reactive を除く

```typescript
// 大型 read-only データ
const config = shallowRef(loadConfig())  // 表面だけ reactive

// reactive 不要な内部 object
const chartInstance = markRaw(new Chart(...))
```

### Web Worker で重い処理を逃がす

```typescript
// vite + comlink
import { wrap } from 'comlink'
const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
const api = wrap<WorkerApi>(worker)
const result = await api.heavyCompute(data)
```

### Vuetify / UI library の partial import

```typescript
// vite plugin 'vite-plugin-vuetify' は on-demand 取り込み
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
// 必要 component だけ named import に絞る
```

### asset 最適化

- 画像は WebP / AVIF
- 巨大 SVG は spritesheet 化
- font は subset (必要 glyph のみ)
- 巨大 JSON は dynamic import

---

## Tauri 特有 (frontend 側)

詳細は `tauri-performance.md`。

- `convertFileSrc` で binary を IPC ではなく file URL 経由に
- `@tauri-apps/api` の named import (default import より tree-shakable)
- Tauri の WebView は OS 依存 (Edge WebView2 / WKWebView)。modern API は使えるが
  古い WebView2 (Win 10 古い build) で polyfill が要る場合あり

---

## アンチパターン (frontend optimize)

- bundle visualizer を見ずに「lodash を消そう」とする (実は数 KB しか影響ない)
- LCP / TBT を測らずに「lazy load する」(指標が改善しないかもしれない)
- shallowRef を全 ref に適用 (reactivity が効かなくなる)
- markRaw を reactive 必要な object に適用 (UI が更新されなくなる)
- Web Worker を入れて IPC overhead が新たな bottleneck になる (1 µs の処理を逃がす意味なし)

---

## 改善判断フロー (frontend)

```text
1. bundle visualizer / Lighthouse で bottleneck を特定
   - 大きい dependency か?
   - LCP / TBT が悪いか?
   - interaction latency か?

2. 大きい dependency を tree-shake / lazy load で削減
   - bundle size diff を確認

3. interaction latency なら computed / watch / DOM 量を見直し
   - profile で確認

4. listener / watcher 解除漏れがあれば dispose 追加
   - heap snapshot で leak 確認

5. 改善後 Lighthouse / bundle visualizer で再計測
```
