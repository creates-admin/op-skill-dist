# Usability Invariants (10 不変条件)

ux-ui-audit-expert が監査時に順に確認する不変条件。
違反は Critical / High に分類して報告する。Medium 以下は出さない。

## Related references

- Nielsen Norman Group 10 Usability Heuristics: https://www.nngroup.com/articles/ten-usability-heuristics/
- GOV.UK Design Principles: https://www.gov.uk/guidance/government-design-principles
- 詳細リンクは `reference-map.md` を参照

---

## 10 不変条件

### 1. 次の行動が明確である

- 主要 CTA が一目でわかる
- 次に何をすべきかが画面から読み取れる
- primary が複数並列で序列が読めない、は違反

### 2. Applicable States が網羅されている

- UI 種別ごとの **applicable state** が定義・実装されている (`recovery-and-states.md` の早見表参照)
- 6 状態 (loading / success / failure / empty / disabled / focus) を機械的に全要求してはいけない
- 該当しない state は `not_applicable_reason` を 1 行添えて省略可
- 「正常系だけ実装して終わり」(applicable な state を欠落させる) は最大の不変条件違反
- どれが欠落しているかを `broken_invariant` に明記する

### 3. エラー時に復帰できる

- エラーメッセージが原因と次の行動を示す
- retry 導線がある (再試行 / 戻る / 別の方法)
- エラーから戻る手段が無い画面は **Critical**

### 4. 危険操作に確認または取り消し導線がある

- 削除 / 取り消し不能 / 不可逆操作にダイアログまたは undo
- 確認ダイアログがあるが「OK」が default focus は危険
- destructive を primary と同色 / 同位置にしないこと

### 5. 入力エラーが対象フィールドと結びついている

- `aria-describedby` でフィールドとエラーを関連付け
- toast 単独では SR / keyboard 利用者に届かない
- inline error + aria 連携が原則

### 6. 操作可能 / 不可能 / 選択中が区別できる

- disabled / active / selected が視覚的に明確
- 色だけで区別しない (icon / 形状 / 位置との多重符号化)

### 7. keyboard 操作と focus visible が保たれている

- `:focus-visible` あり、装飾優先で `outline:none` していない
- Tab 順序が論理的
- `<div @click>` でボタンを実装していない (`<button>` を使う)
- shortcut / accesskey がドキュメント化されている

### 8. contrast が破綻していない

- 本文 4.5:1 以上
- 非テキスト UI 3:1 以上
- placeholder / 弱コントラスト metadata でも最低基準を割らない

### 9. 業務フローのクリック数・判断回数を不必要に増やしていない

- 主要導線で「戻る → 進む」往復が必要
- 同種操作で毎回モーダル確認
- 大量項目に bulk action が無い、は違反

### 10. 美しさのために使いやすさを犠牲にしていない

- 装飾優先で focus を消す
- アニメーション / トランジションで操作がブロックされる
- 視覚優先で keyboard 操作が壊れる
- 見た目のために復帰導線が消えている

---

## bulk_group 命名規則 (5 件以上で batch 起票対象)

```text
ux-ui:missing-loading-state    # 非同期処理にローディング無し
ux-ui:missing-empty-state      # 一覧に empty state 無し
ux-ui:missing-error-recovery   # エラー時の retry 導線無し
ux-ui:missing-confirmation     # 削除・破壊操作に確認/取り消し無し
ux-ui:focus-removed            # outline:none 等で focus 不可視
ux-ui:unlabeled-icon-button    # aria-label 無しの icon button
ux-ui:div-as-button            # <div @click> でボタンを実装
ux-ui:contrast-fail            # 本文 4.5:1 / 非テキスト 3:1 を割る contrast
```

> `hardcoded-color` / `hardcoded-spacing` / `component-bypass` 等の design system 整合系は
> **designer-expert** の bulk_group (`design:hardcoded-color` 等) に移譲済み。本エージェントは扱わない。

---

## 出力契約 (canonical schema 補足)

`~/.claude/skills/_shared/expert-spawn.md` の canonical schema に従う JSON 配列。
`domain` フィールドには **`ux-ui`** を入れる (旧 `ux` / `ui` は廃止)。

各検出に以下を含める。

- `user_goal` — このコンポーネント / 画面で達成すべき目的
- `affected_user_flow` — 影響する業務フロー
- `broken_invariant` — 上記不変条件 1〜10 のどれに違反しているか
- `ux_ui_failure_type` — `missing_state | unclear_action | recovery_blocked | a11y_break | visual_ambiguity | workflow_mismatch` のいずれか
- `evidence` — 該当コード 5〜10 行 (静的に観測したもの)
- `evidence_grade` — `direct | inferred | requires_runtime` (`direct` 以外で Critical 不可)
- `reproduction_hint` — `requires_runtime` のとき必須
- `severity_reason` — Critical / High と判定した根拠
- `recommended_runner` — `designer-expert`
- `gotchas` — designer-expert 単独で完結しない場合は **co-run が必要な expert を明記** する (`scan-finding-policy.md` の co-run 判定節参照)
