# op-merge の表と報告の形

## 計画

フェーズ3 で提示する監査表とマージ順。

```
## op-merge 計画 (base: main)

| 順 | PR | タイトル | 由来 | CI | conflict | review | Issue | 重複 | 判定 | 理由 |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | #210 | ... | op-thread | pass | なし | 記録なし | #42 成功条件充足 | #212: 2 files | merge 可 | 基盤変更で #212 が依存 |
| 2 | #212 | ... | op-thread | pass | あり | 記録なし | #43 充足 | #210: 2 files | merge 可 | #210 後に conflict 解消 |
| 3 | #230→#231 | ... | op-thread (積み重ね、draft) | pass (2 段とも) | なし | 記録なし | #50・#51 充足 | - | merge 可 | 一番上 #231 の名指しでまとめてマージ。ready にしてから、stack を作ってマージ |
| - | #215 | ... | 人間 | fail | なし | 記録なし | なし | - | 要修正 | test_x が fail |

方式: 単独は squash、積み重ねは merge
マージする PR を番号で名指しして「マージして」と伝えてください (例: 「#210 #212 #231 をマージして」)。draft の ready 化と、表に書いた stack の作成・コンフリクト解消は名指しに含まれます。
```

## 完了報告

フェーズ5。

```
## op-merge 完了 (base: main)

### マージした PR
- #210 <タイトル> (squash) — close: #42
- #212 <タイトル> (squash) — conflict 解消あり、close: #43
- #230→#231 <タイトル> (積み重ね、merge) — close: #50, #51

### 解消したコンフリクト
- #212: src/foo.rs — #210 の API 変更に合わせて呼び出し側を更新 (feature-expert、検証 pass、解消レビュー pass)

### 保留した PR
- #214: CI fail (test_y) → 修正して再実行
- #216: 解消に仕様判断が必要 (<needs_human_decision.reason>) → 方針を決めて /op-skill:op-merge #216。隔離 worktree: <path>
- #217: #216 に依存するため保留

### 計画から外した PR (フェーズ2 で要修正 / 保留)
- #215: CI fail → PR 作成者が修正
```
