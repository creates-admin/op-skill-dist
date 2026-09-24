# Data Visualization Patterns

dashboard / 監視 / 比較 / KPI 画面の chart の選定・配色・状態・a11y の規則。chart は装飾ではなく判断材料。
静的 scan では chart の品質を判定しにくいため、主に Apply で使う。

## Chart type の使い分け

| 用途 | 推奨 | 避ける | 理由 |
|------|------|-------|------|
| 時系列の傾向 (1 系列) | line / area | bar | 連続性が重要 |
| 時系列の比較 (複数系列) | multi line | stacked area | stacked は積み上げを示す |
| カテゴリ間の比較 | horizontal bar | pie / donut | 長さの方が比較しやすい |
| 構成比 | stacked bar / column | pie (3 セグメントまでなら可) | 角度認知が弱い |
| 分布 | histogram / box plot | line | bin の概念が必要 |
| 相関 | scatter | bar | 2 軸の関係 |
| 密度 | heatmap (2D grid) | 3D surface | 3D は読み取り誤差を増やす |
| 単一 KPI の現在値 | big number + sparkline | gauge (使うなら threshold 明示) | big number が最も読みやすい |
| 状態の俯瞰 (監視盤) | status grid + heatmap | 3D / 動く背景 | 異常を即発見できる静かな viz |
| 変化量 | diff bar / waterfall | 2 つの pie 並置 | pie 比較は誤読の温床 |

禁止 chart: 3D (bar / pie / line) / 回転する・アニメ前提の chart / 6 セグメント以上の pie / 凡例なし / 軸ラベル・単位なし。

## Data Honesty 規則

1. **軸を切らない** — bar は 0 始まり。0 始まりでないなら break-axis マーク (`╱╱`) を表示する。line は時系列なら 0 でなくてよいが、
   大きな step を 0 と誤読させない。「3% 増を 30% 増に見せる」軸切りは禁止
2. **スケール変換を明示** — log scale は軸ラベルに `(log)`、単位変換は `(千円)` 等、逆方向軸は注釈
3. **色を意味として使う** — semantic color を装飾に使わない。category 色と semantic を混ぜない。同 chart 内で同じ色は同じ意味だけ
4. **軸の単位を揃える** — 複数 y 軸は各軸の単位を明記。絶対値と % を同列に出さない
5. **順序を意図的に決める** — カテゴリの並びは「アルファベット」「値の大小」「業務優先度」のいずれかに統一。凡例順と重なり順を一致させる

## chart の状態

| 状態 | 表現 |
|------|------|
| loading | skeleton (chart 形状を保つ) / chart 領域上の spinner |
| empty | 「データがありません」+ 取得期間 / フィルタ条件 |
| error | エラー文 + 再試行 button + last successful at |
| partial | 取得済み区間を描画 + 欠損区間を gray hatched |
| success | 通常描画 |

- 自動 refresh する chart は last updated を表示し、refresh 中は角に小さな spinner、失敗は chart 自体に inline 表示 (toast だけにしない)。
  ユーザーが停止できること
- 監視 chart の threshold 線は破線、ラベルは右端、線色は semantic (`warning` / `error`)。超過点は icon + color + text

## 色

- categorical: 8 色まで (超えたら others に集約)。隣接色は明度差 + 色相差の両方を確保。色覚対応パレット (IBM / Tableau 等) を使う
- sequential: 単色の濃淡。中央値が意味を持つなら diverging。rainbow / jet は禁止
- 色だけで series を区別しない (icon / pattern / line style を併用)

## Accessibility

| 項目 | 実装 |
|------|------|
| `role="img"` + `aria-label` | chart コンテナに要約文 1〜2 文 (例: 「2025 年 1〜12 月の月次売上、12 月にピーク」) |
| SVG `<title>` | SVG chart の内部に要約 |
| keyboard | データ点を Tab / 矢印で移動できる (chart library の対応を確認)。tooltip は focus でも開く |
| 数値の代替 | data table 補完 (隣に表 / `<details>` で展開、`aria-describedby` で紐付け) |
| live update | data table 側に `aria-live="polite"`、transition は `prefers-reduced-motion` を尊重 |

## 禁止

- 3D chart / 理由のない軸切り / rainbow・jet palette / 色だけで series 区別
- 凡例・単位・ラベルなし / pie 6 セグメント以上 / 動き優先の chart
- 自動 refresh で last updated を出さない / 代替 data table がない
