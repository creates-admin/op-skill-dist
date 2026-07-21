# Enterprise UI Density

業務 UI における **情報密度の設計指針**。
余白を取れば良いというものではない。一覧 / 比較 / 修正 / 承認では、密度そのものが usability になる。

## Related references

- Salesforce Display Density: https://developer.salesforce.com/docs/platform/ja-jp/lwc/guide/data-display-density.html
- SAP Fiori Design Principles: https://www.sap.com/design-system/fiori-design-ios/discover/sap-design-system/vision-and-mission/sap-fiori-design-principles
- Stripe Apps Patterns: https://docs.stripe.com/stripe-apps/patterns
- 詳細リンクは `reference-map.md` を参照

---

## 大原則

- 業務画面では **余白が多いほど良いとは限らない**
- 一覧 / 比較 / 修正 / 承認では、**情報密度そのものが usability** になる
- 高密度でも、行間 / 列幅 / 固定ヘッダー / status label / bulk action / keyboard 操作で支える
- compact / comfortable の **切替余地を残す** (ユーザーごとに最適密度は異なる)

---

## View 別の密度方針

### list / queue (一覧・キュー)

- **primary goal**: 大量項目から「次に処理するもの」を素早く見つける
- **density policy**: 高密度。1 画面で 20〜50 行は最低限見える
- **layout**: 固定ヘッダ / sticky filter / bulk action bar / inline status badge
- **common mistakes**: 行間を広げて 1 画面 5 行に減らす / status を別 column に押し出して視線が割れる
- **preferred patterns**: zebra row 控えめ / 主要 column 左寄せ / 数値 column 右寄せ / status は icon + text

### form / master edit (フォーム・マスタ編集)

- **primary goal**: 必要項目を間違えずに入力する
- **density policy**: 中密度。section ごとに余白で意味を切る
- **layout**: 1 列 or 2 列固定 / label 上 or 左 (一貫性) / inline validation
- **common mistakes**: 全項目を等幅で並べる / required を色だけで示す / error を toast だけで返す
- **preferred patterns**: section header / required mark + aria-required / inline error / sticky save

### detail (詳細表示)

- **primary goal**: 1 つの対象の状態と関連情報を素早く把握する
- **density policy**: 中〜高密度。primary 情報は大きく、metadata は小さく
- **layout**: header (key info + primary action) / body (sections) / right rail (metadata)
- **common mistakes**: metadata を本文と同じ重みで混ぜる / primary action が複数並列で序列が読めない
- **preferred patterns**: 1 primary action / secondary は menu に逃がす / metadata は弱コントラストで集約

### dashboard (ダッシュボード)

- **primary goal**: 状態を俯瞰し、異常を素早く発見する
- **density policy**: 高密度。ただし KPI / chart / table が画面で互いを邪魔しないこと
- **layout**: grid 12 / KPI cards 上段 / chart 中段 / table 下段
- **common mistakes**: chart を装飾色で塗る / 軸を切って差を誇張する / 凡例を凡例だけで説明する
- **preferred patterns**: semantic color のみ / 軸は 0 始まり (理由ある時だけ切る) / chart に短い解釈テキスト

### diff / comparison (差分・比較)

- **primary goal**: 2 つ以上の対象の差を一目で把握する
- **density policy**: 高密度。横並び or 上下並び。視線が頻繁に往復する前提
- **layout**: 同じ項目を同じ行に揃える / 差分箇所を semantic color (success / error) で強調
- **common mistakes**: 差分箇所を色だけで示す / 差がある行と無い行で行高が変わる
- **preferred patterns**: 差分マーク (icon + color + text) / 行高固定 / unchanged 折りたたみ

### approval / confirmation (承認・確認)

- **primary goal**: 危険操作 / 不可逆操作を意図通りに実行する
- **density policy**: 低密度。判断に必要な情報だけを出す
- **layout**: 何が起きるか (主文) / 影響範囲 (補足) / 危険操作はラベル明示
- **common mistakes**: 「OK」「キャンセル」を等幅で並べる / 危険操作と通常操作を同色にする
- **preferred patterns**: destructive は danger token / primary action を右側 (or platform 慣習) / 取り消し導線

### monitoring / status board (監視・ステータス)

- **primary goal**: 異常状態を即座に発見する
- **density policy**: 高密度。ただし「正常 = 静か / 異常 = 騒がしい」配色秩序を守る
- **layout**: status grid / heatmap / sparkline + 数値 / threshold 線
- **common mistakes**: 正常も装飾色で派手 / 異常を色だけで通知 / refresh 状態が見えない
- **preferred patterns**: 正常は弱コントラスト / 異常は semantic error + icon + text / last updated 表示

---

## 高密度を支える 7 つの装置

1. **行間制御** — 詰めすぎず、空けすぎない (テーブルでは 32〜44px が目安)
2. **列幅最適化** — 数値右寄せ / テキスト左寄せ / 短いラベルは中央
3. **固定ヘッダ** — 縦スクロールでも column が見える
4. **status label** — 色 + icon + text の 3 重符号化
5. **bulk action** — 複数選択 → 一括処理導線
6. **keyboard 操作** — 矢印 / Enter / Esc / Tab / Shift+Tab を尊重
7. **density toggle** — compact / comfortable / spacious の選択余地

---

## 禁止

- 業務一覧で 1 画面 5 行以下になるレイアウト
- status を **色だけで** 示すこと
- 全 column を等幅にして主従を消すこと
- chart の軸を **理由なく切る / 3D で誇張する** こと
- 危険操作と通常操作を **同じ視覚重み** で並べること
