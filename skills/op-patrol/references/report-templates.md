# op-patrol の plan と完了報告の形

## patrol plan

フェーズ3。

```
## op-patrol plan (<RUN_ID>)

budget: medium / random-seed: (auto) / patrol-ledger: #<N> (前回 <run_id> / state_rev <n>)

### 今回巡回する area
| # | area | score | experts | 主な理由 |
|---|---|---|---|---|

### 今回除外した上位候補
| area | score | 除外理由 |
|---|---|---|

### 推定コスト
- 並列 spawn: N expert (M area) / Issue 起票上限: Critical/High のみ

この plan で audit を開始しますか?
1. このまま実行  2. area を選択 (例: 1,3)  3. budget を変更  4. キャンセル
```

## 完了報告

フェーズ7-3。

```
## op-patrol 完了 (<RUN_ID>)

### 巡回 area
- <area> (<experts>)

### 起票結果
(対話モードは op-intake 手順 6 の表に area の列を足す。`--auto` は | # | Issue | severity | expert | area | title |)

### 統計
- 起票 N / スキップ (重複) N / debt 既存 Issue 更新 N / manual_review_bucket N / 検出 0 件 area N
- refute: confirmed N / refuted N / downgrade N (controller が trust model を適用した後の集計)
- Patrol Ledger: #<N> (state_rev <n>→<n+1>)

### refute で偽陽性/過大判定 (起票しない)
- [refuted] <area> / <expert> / "<title>" — evidence_excerpt: `<再 Read したコード片>` (<file:line-line>)
- (なければ「なし」)

### 次の巡回候補
- <area> (score <n>)

### 警告
- Ledger 複数検出 / parse warning / SKIPPED_PLANNED (なければ「なし」)

```
