# Enterprise UI Density

業務 UI の情報密度の設計指針。一覧 / 比較 / 修正 / 承認では、密度そのものが usability になる。

## 大原則

- 業務画面では余白が多いほど良いとは限らない
- 高密度は行間 / 列幅 / 固定ヘッダ / status label / bulk action / keyboard 操作で支える
- compact / comfortable の切替余地を残す

## View 別の密度方針

| view | primary goal | 密度 | layout | よくある誤り | 推奨パターン |
|------|-------------|------|--------|-------------|-------------|
| list / queue | 次に処理するものを素早く見つける | 高 (1 画面 20〜50 行) | 固定ヘッダ / sticky filter / bulk action bar / inline status | 行間を広げて 5 行に減らす / status を別 column に押し出す | zebra 控えめ / 主要 column 左寄せ / 数値右寄せ / status は icon + text |
| form / master edit | 必要項目を間違えずに入力 | 中 (section ごとに余白で切る) | 1〜2 列固定 / label 位置一貫 / inline validation | 全項目等幅 / required を色だけで示す / error を toast だけで返す | section header / required mark + `aria-required` / inline error / sticky save |
| detail | 1 対象の状態と関連情報を把握 | 中〜高 | header (key info + primary action) / sections / right rail (metadata) | metadata を本文と同じ重みで混ぜる / primary action 並列 | primary action 1 つ / secondary は menu / metadata は弱コントラスト |
| dashboard | 状態を俯瞰し異常を発見 | 高 (KPI / chart / table が互いを邪魔しない) | grid 12 / KPI 上段 / chart 中段 / table 下段 | chart の data honesty 違反 | semantic color のみ / chart に短い解釈テキスト (`data-viz-patterns.md`) |
| diff / comparison | 差を一目で把握 | 高 (視線の往復前提) | 同じ項目を同じ行に揃える | 差分を色だけで示す / 差の有無で行高が変わる | 差分マーク (icon + color + text) / 行高固定 / unchanged 折りたたみ |
| approval / confirmation | 危険・不可逆操作を意図通り実行 | 低 (判断に必要な情報だけ) | 何が起きるか (主文) / 影響範囲 / 危険操作ラベル明示 | OK / キャンセルを等幅 / 危険操作と通常操作が同色 | destructive は danger token / 取り消し導線 |
| monitoring / status board | 異常を即座に発見 | 高 (正常 = 静か / 異常 = 騒がしい) | status grid / heatmap / sparkline + 数値 / threshold 線 | 正常も派手 / 異常を色だけで通知 / refresh 状態が見えない | 正常は弱コントラスト / 異常は semantic error + icon + text / last updated |

## 高密度を支える装置

1. 行間制御 (テーブル行高 32〜44px 目安)
2. 列幅最適化 (数値右寄せ / テキスト左寄せ / 短いラベル中央)
3. 固定ヘッダ
4. status label (色 + icon + text)
5. bulk action (複数選択 → 一括処理)
6. keyboard 操作 (矢印 / Enter / Esc / Tab / Shift+Tab)
7. density toggle (compact / comfortable / spacious)

## 禁止

- 業務一覧で 1 画面 5 行以下になるレイアウト
- status を色だけで示す
- 全 column を等幅にして主従を消す
- 危険操作と通常操作を同じ視覚重みで並べる

参考: Salesforce Display Density / SAP Fiori / Stripe Apps Patterns (`reference-map.md` Tier 2)。
