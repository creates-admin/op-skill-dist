# Data Visualization Patterns

chart は判断材料であり装飾ではない。静的 scan では chart の品質を判定しにくいため、主に Apply で使う。

## 禁止

- 3D chart (bar / pie / line / surface) / 回転する・アニメ前提の chart / 動き優先の chart
- 理由のない軸切り (bar は 0 始まり。切るなら break-axis を表示) / 明示しない log scale・単位変換
- rainbow・jet palette / 色だけで series を区別する (icon / pattern / line style を併用) / semantic color の装飾流用
- 凡例・単位・軸ラベルなし / 6 セグメント以上の pie
- 代替 data table (隣の表 / `<details>` + `aria-describedby`) がない

## chart の状態

- loading は chart 形状を保つ skeleton、empty は「データがありません」+ 取得期間 / フィルタ条件、error は文言 + 再試行 + last successful at、
  partial は欠損区間を明示する。
- 自動 refresh する chart は last updated を表示し、失敗は chart 自体に inline 表示する (toast だけにしない)。ユーザーが停止できること。
