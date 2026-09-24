# Recovery & States

状態網羅 (不変条件 2) / 復帰可能性 (不変条件 3) / 危険操作の保護 (不変条件 4) の基準。

## UI 種別ごとの必須状態

6 状態を機械的に全要求しない。UI 種別に該当する状態だけを求め、該当しない状態は `not_applicable_reason` 1 行で省略可。
静的画面に empty / disabled は要らない。

| UI 種別 | 必須状態 |
|--------|---------|
| 非同期データ取得 (一覧 / 詳細) | loading / failure / empty / focus |
| フォーム送信 | loading / success または遷移 / failure / disabled / focus |
| 破壊操作 (削除等) | confirmation または undo / success / failure / focus |
| modal / drawer | focus / keyboard / Esc close / failure (async 時) |
| 静的表示 (説明 / about / 法務文書) | focus / heading / contrast |
| toast / inline message | success / failure |

該当する UI 種別で欠落したときの severity:

| 状態 | 欠落時 |
|------|-------|
| loading | High |
| success | High (フィードバック無し) |
| failure | Critical (復帰手段なし) |
| empty | High (一覧画面) |
| disabled | High |
| focus | a11y 違反として `a11y-checklist.md`「Severity 対応」の条件で判定 (A 違反の Critical は条件付き) |

## 状態ごとの基準

| 状態 | 必須 | NG |
|------|------|-----|
| loading | skeleton / spinner / progress で処理中がわかる。200ms 以上の処理は表示する。bulk は progress bar。loading 中は二重送信防止 | 画面が固まる / 押したまま反応なし / loading 中に二重送信できる |
| success | toast / inline / 遷移で成功がわかる。重要操作 (申請 / 削除 / 保存) は 2 秒以上残る。リロードなしで反映 | 何も出ない / toast が 1 秒で消える / リロードしないと反映されない |
| failure | 原因と次の行動 (retry / 戻る / 別の方法) を示し、復帰手段が UI 上にある | リロード以外に戻れない / 「エラーが発生しました」だけ / network error に retry なし / 入力エラーが toast 1 行でどのフィールドかわからない (いずれも Critical 候補) |
| empty | 何が無いか + 次に何をすればよいか (「+ 新規作成」/ 条件を変える)。検索 0 件と未作成を区別 | 真っ白 / 「データなし」だけ / 0 件と未作成が同じ表現 |
| disabled | 操作不可が視覚的にわかる。理由と解除条件を tooltip / 隣接テキストで示す | enabled と同じ見た目 / 理由なし / disabled なのに反応する |
| focus | `:focus-visible` の indicator、Tab 順序が論理的 (`a11y-checklist.md`) | `outline: none` / 薄くて見えない / `<div @click>` で到達不可 |

## 危険操作の保護

- 削除・取り消し不能・不可逆操作には確認ダイアログ または Undo (5〜10 秒の取り消し導線を組み合わせると尚良)
- destructive button は danger token で隔離する
- 確認ダイアログの default focus は「キャンセル」

Critical 候補: ワンクリックで確定 (確認も Undo もなし) / 「OK」が default focus で Enter 確定 / destructive が primary と同色・同位置。

## 復帰可能性

- 入力中の form を閉じると確認が出る (dirty check)
- timeout / 認証切れで再ログインへ誘導され、途中入力を失わない
- bulk 操作の途中失敗で、成功分と失敗分が区別できる
