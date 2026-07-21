# Data Visualization Patterns

/**
 * 機能概要: dashboard / 監視 / 比較画面に出てくる chart / data viz の判断基準を集約する
 * 作成意図: enterprise UI の chart は判断材料になるかが本義。装飾としての chart を防ぎ、
 *           data honesty (Tufte) を実装可能な形で agent に渡すために本ファイルを置く
 * 注意点: 本ファイルは Architect Mode の Design Plan で使う設計パターン集。
 *         scan の検出カテゴリには直接対応しない (scan は static で chart config を判定しにくいため、
 *         Critical 起票はほぼ生まない。Architect / Run で活きる)
 */

dashboard / 監視 / 比較 / KPI 画面で使う chart の選定・配色・状態・a11y の規則。
**chart は装飾ではなく判断材料**。「動きがあるとカッコいい」で複雑な chart を増やしてはいけない。

## Related references

- Edward Tufte / The Visual Display of Quantitative Information: https://www.edwardtufte.com/book/the-visual-display-of-quantitative-information/
- `enterprise-ui-density.md` の dashboard / monitoring 節
- `philosophy.md` 原則 9 (データは正直に見せる)

---

## Chart type の使い分け

| 用途 | 推奨 chart | 避けるべき chart | 理由 |
|------|-----------|----------------|------|
| 時系列の傾向 (1 系列) | line / area | bar (時系列) | 連続性が重要、bar は離散値向け |
| 時系列の傾向 (複数系列の比較) | line (multi) | stacked area | stacked は積み上げを示す、比較なら multi line |
| カテゴリ間の比較 | bar (horizontal) | pie / donut | bar は長さで比較しやすい、pie は 5 セグメント超で破綻 |
| 構成比 (合計に対する割合) | stacked bar / stacked column | pie (3 セグメントまでなら可) | pie は人間の角度認知が弱い |
| 分布 (頻度) | histogram / box plot | line | 離散・bin の概念が必要 |
| 相関 | scatter | bar | 2 軸の関係を見るのは scatter |
| 密度ヒートマップ | heatmap (2D grid) | 3D surface | 3D は読み取り誤差を増やす |
| 単一 KPI の現在値 | big number + sparkline | gauge (使うなら threshold 明示) | gauge は閾値設計が要、big number が最も読みやすい |
| 状態の俯瞰 (監視盤) | status grid + heatmap | 3D viz / 動きのある背景 | 異常を即発見できる「静かな」viz |
| 変化量 (差分) | bar (diff) / waterfall | 2 つの pie 並置 | pie 比較は誤読の温床 |

### 禁止 chart (使ってはいけない)

- **3D bar / 3D pie / 3D line** — 軸が歪み data honesty 違反
- **回転する pie / アニメ前提の chart** — 静止状態で読めない
- **6 セグメント以上の pie** — 角度認知が破綻
- **凡例で意味を切り出した chart の凡例なし版** — 凡例必須
- **軸ラベル / 単位なし chart** — どんな種類でも data honesty 違反

---

## Data Honesty 規則 (Tufte 派生、絶対)

### 1. 軸を切らない / 切るなら理由を表示

- 棒グラフは **0 始まり原則**。0 始まりでないなら break-axis マーク (`╱╱`) を必ず表示
- line chart は時系列なら 0 でなくてよい (傾向を見る目的)、しかし大きな step を 0 と誤読させない
- 「3% 増加を 30% 増加に見せる」軸切りは禁止

### 2. スケール変換は明示

- log scale を使うときは **必ず軸ラベルに `(log)` 表示**
- 単位変換 (千 / 百万 / 億) は軸ラベルに `(千円)` 等を明示
- 逆方向軸 (上が小さい等) は注釈必須

### 3. 色を意味として使う

- semantic color (`success` / `error` / `warning`) を装飾色として使わない
- カテゴリ色 (`category.1` ... `category.N`) と semantic を混ぜない
- 同 chart 内で同じ色は同じ意味でしか使わない

### 4. 軸の単位を揃える

- 同 chart 内の y 軸が複数あるとき、各軸の単位を必ず明記
- 比較 chart は **絶対値と % を同列で出さない** (どちらかに統一)

### 5. 順序を意図的に決める

- カテゴリ bar の並びは「アルファベット」「値の大小」「業務的優先度」のいずれか。混在禁止
- line chart の凡例順序と chart 内の重なり順を一致させる

---

## Dashboard 内の chart の必須状態

各 chart は以下の **5 状態** を必ず実装する (一般 UI と同じ思想)。

| 状態 | 表現 |
|------|------|
| loading | skeleton (chart 形状を保つ) / spinner over chart area |
| empty (データなし) | 「データがありません」+ 取得期間 / フィルタ条件の表示 |
| error (取得失敗) | エラー文 + 再試行 button + last successful at |
| partial (一部だけ取得失敗) | 取得済み区間を描画 + 欠損区間を gray hatched |
| success | 通常描画 |

### refresh 状態の扱い

- 自動 refresh する chart は **last updated** を必ず表示
- refresh 中は loading spinner を chart 角に小さく
- refresh 失敗は inline で通知 (toast だけにしない、chart 自体に状態を持つ)
- ユーザー操作で停止できること

### threshold / 閾値線

- 監視 chart では threshold 線 (`warning: 80%` / `critical: 95%` 等) を破線で描画
- threshold ラベルは右端に、chart 上の線色は semantic (`warning` / `error`)
- threshold を超えた点は icon + color + text で 3 重符号化

---

## Color & Accessibility (色覚多様性対応)

### Categorical palette

- 8 色まで。それ以上は系列を集約 (others) する
- IBM / Tableau の色覚対応パレットを参考 (`reference-map.md` Tier 2 を参照)
- 隣接色は **明度差 + 色相差** の両方を確保

### Sequential palette (heatmap / choropleth)

- 単色の濃淡 (light → dark) を使う
- 中央値が意味を持つなら diverging (色 A → 中央 → 色 B)
- **rainbow / jet パレットは禁止** (色覚多様性で破綻、明度順序が直線でない)

### 色覚対応の実装条件

- 色だけで series を区別しない (icon / pattern / line style を併用)
- chart に **data table 補完** を提供 (chart の隣に同データを表で出す or `<details>` で展開)
- 色覚 simulator で確認できるよう、Storybook / dev tool で simulate 切替を持つ

---

## Accessibility (a11y)

### Chart の a11y 必須項目

| 項目 | 実装 |
|------|------|
| `role="img"` | chart コンテナに付与 |
| `aria-label` | chart の **要約文** を 1〜2 文で書く (例: 「2025 年 1 月〜12 月の月次売上、12 月にピーク」) |
| `<title>` (SVG) | SVG chart は内部に `<title>` で要約 |
| キーボード操作 | データ点を Tab / 矢印で navigate 可能 (chart library の対応必須) |
| 数値の screen reader 対応 | data table 補完 (`aria-describedby` で chart と表を紐付け) |
| 色だけで意味を伝えない | icon + text + color の 3 重符号化 |

### 動的 chart の追加配慮

- live update する chart は `aria-live="polite"` を data table 側に
- アニメーション (transition / morph) は `prefers-reduced-motion` を尊重
- tooltip は keyboard でも開けること (`onFocus` でも tooltip 表示)

---

## Architect Mode で chart を Design Plan に書くときの節構造

`agent.md` の Design Plan template に **`### Chart Strategy`** を chart 使用画面に限り追加する。

```markdown
### Chart Strategy (chart を使う画面のみ)

#### 採用 chart
- 主 chart: <line / bar / heatmap / 等> — 理由 (1 文)
- 補助 chart: <sparkline / KPI big number / 等>

#### Data Honesty
- 軸: 0 始まり (or break-axis あり / log)
- スケール: <単位>
- 色: semantic / categorical / sequential のどれを使うか
- 順序: <値順 / 業務優先度 / 時系列>

#### 必須状態
- [x] loading (skeleton)
- [x] empty (空メッセージ + 期間表示)
- [x] error (再試行 button + last updated)
- [x] partial (欠損区間 hatched)
- [x] success

#### threshold (監視 chart のみ)
- warning: <値> (semantic.warning)
- critical: <値> (semantic.error)

#### Accessibility
- `role="img"` + `aria-label`: <要約文 1〜2 文>
- data table 補完: あり / なし (理由)
- keyboard navigation: 対応 (chart library: <名前>)
- 色覚対応: categorical 色は IBM 対応 palette 利用 / pattern 併用
```

---

## 禁止 (data viz アンチパターン)

| 禁止 | 影響 |
|------|------|
| 3D chart 全般 | 軸が歪み data honesty 違反 |
| 軸切り (理由なし) | 差を誇張、データ偽装 |
| rainbow / jet palette | 色覚多様性で破綻 |
| 色だけで series 区別 | 印刷 / 色覚で破綻 |
| 凡例なし chart | 解読不能 |
| 単位 / ラベルなし chart | 比較不能 |
| pie 6 セグメント以上 | 角度認知の限界 |
| 動き優先 chart (回転 pie 等) | 静止で読めない |
| 動的 refresh で last updated を出さない | データの新鮮度が不明 |
| chart の代替 data table がない | 色覚 / SR ユーザーに不利 |
