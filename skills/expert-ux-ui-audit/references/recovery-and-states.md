# Recovery & States Design

ux-ui-audit-expert が監査する **状態網羅** と **復帰可能性** の設計指針。
Invariants 2 (状態が網羅されている) / 3 (エラー時に復帰できる) / 4 (危険操作の保護) の詳細版。

## Related references

- Nielsen Norman Group / Error Prevention: https://www.nngroup.com/articles/ten-usability-heuristics/
- 詳細リンクは `reference-map.md` を参照

---

## Applicable States (UI 種別ごとに該当する state のみ)

**6 状態を機械的に全要求してはいけない。** UI 種別ごとに該当する state だけ Plan / 実装に含め、
該当しない state は `not_applicable_reason` を 1 行添えて省略する。

### UI 種別ごとの applicable state 早見表

| UI 種別 | 必須 state |
|--------|-----------|
| 非同期データ取得 (一覧 / 詳細) | loading / failure / empty / focus |
| フォーム送信 | loading / success または遷移 / failure / disabled / focus |
| 破壊操作 (削除等) | confirmation または undo / success / failure / focus |
| modal / drawer | focus / keyboard / Esc close / failure (async 時) |
| 静的表示 (説明 / about / 法務文書) | focus / heading / contrast |
| toast / inline message | success / failure (toast 自体は state を多く持たない) |

### 6 状態カタログ (該当時の severity)

| 状態 | 意味 | 該当する UI 種別で欠落時の severity |
|------|------|------------------|
| loading | 処理中、ユーザー入力受付中の表現 | High |
| success | 完了、結果が反映された表現 | High (フィードバック無し) |
| failure | 失敗、原因 + 復帰手段の表現 | **Critical** (復帰手段なしなら) |
| empty | データなし / 0 件の表現 | High (一覧画面で) |
| disabled | 操作不可、理由がわかる表現 | High |
| focus | キーボード focus 位置の表現 | **Critical** (a11y 違反) |

「正常系だけ実装して終わり」(applicable な state を欠落させる) を最大の不変条件違反として扱う。
逆に、UI 種別に該当しない state を強要することはしない (静的画面に empty / disabled は要らない)。

> gate / post-check 側では、apply / Plan が該当しない state を `not_applicable_reason` 付きで省略
> していれば PASS。詳細は `gate-criteria.md` / `post-check-criteria.md` を参照。

---

## loading

### 必須

- 処理中であることが視覚的にわかる (skeleton / spinner / progress bar)
- 200ms 以上の処理に必ず loading 表示 (ドハティ閾値)
- bulk 処理は progress bar (進捗が見える)
- ボタンクリック後の loading 中は二重送信防止 (button disabled)

### NG

- spinner も skeleton も無く画面が固まる
- ボタンが押されたまま反応がない
- loading 中も他操作が可能で二重送信できる

---

## success

### 必須

- 操作が成功したことが視覚的にわかる (toast / inline message / 画面遷移)
- 重要操作 (申請 / 削除 / 保存) は 2 秒以上残るフィードバック
- 結果が画面に反映される (リロード不要)

### NG

- 「保存しました」が出ずに画面そのまま
- toast が 1 秒で消えて見逃す
- リロードしないと反映されない

---

## failure

### 必須 (これが最重要)

- エラーメッセージが **原因** を示す
- エラーメッセージが **次の行動** を示す (retry / 戻る / 別の方法)
- 復帰手段が UI 上にある (retry ボタン / 戻る導線)

### NG (Critical 起票対象)

- エラー画面から戻れない (リロードしか手段がない)
- 「エラーが発生しました」だけで原因も対処もわからない
- network error 時に retry が無い
- 入力エラーが toast 1 行だけで、どのフィールドかわからない

---

## empty

### 必須

- **何が無いか** を明示 (「タスクがまだありません」)
- **次に何をすればよいか** を提示 (「+ 新規作成」ボタン / 検索条件を変える等)
- 検索結果 0 件と「未作成」を区別する

### NG

- 真っ白な画面で何が起きているかわからない
- 「データなし」とだけ表示で次のアクションが無い
- 検索 0 件と未作成が同じ表現

---

## disabled

### 必須

- 操作不可であることが視覚的にわかる
- なぜ disabled なのか tooltip / 隣接テキストで説明
- disabled 解除条件が明示されている

### NG

- 押せないボタンが enabled と同じ見た目
- なぜ押せないのか説明なし
- disabled なのにクリックすると反応する

---

## focus

### 必須

- `:focus-visible` で focus indicator が出る
- focus indicator の contrast 3:1 以上
- Tab 順序が論理的

### NG (Critical 起票対象)

- `outline: none` で focus indicator が見えない
- focus indicator が薄くて見えない (contrast 不足)
- `<div @click>` で keyboard 到達不可

---

## 危険操作の保護 (Invariant 4)

### 必須

- 削除 / 取り消し不能 / 不可逆操作には **確認ダイアログ または Undo**
- destructive button は danger token (赤系) で隔離
- 確認ダイアログの default focus は **「キャンセル」** に置く (誤確定防止)
- 取り消し不能操作には Undo (5〜10 秒の取り消し導線) を組み合わせると尚良

### NG (Critical 起票対象)

- 削除がワンクリックで確定 (確認なし、Undo なし)
- 確認ダイアログがあるが「OK」が default focus + Enter で確定する
- destructive button が primary と同色 / 同位置

---

## 復帰可能性チェック

audit 時に以下を確認する。

- [ ] 全ての画面に「戻る」/「キャンセル」/「閉じる」のいずれかがある
- [ ] modal / drawer は Esc で閉じる
- [ ] 入力中の form を間違えて閉じても確認 dialog が出る (dirty check)
- [ ] error 画面から home / 一覧に戻る導線がある
- [ ] timeout / 認証切れ時に再ログインへ誘導される (途中入力は失わない)
- [ ] bulk 操作の途中失敗時、成功した分と失敗した分が区別できる
