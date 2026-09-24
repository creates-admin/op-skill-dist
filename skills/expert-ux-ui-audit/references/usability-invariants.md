# Usability Invariants (10 不変条件)

監査時に順に確認する不変条件。違反は Critical / High で報告し、`broken_invariant` に番号を書く。

## 10 不変条件

1. 次の行動が明確である — 主要 CTA が一目でわかる。primary が複数並列で序列が読めないのは違反
2. 該当する状態が網羅されている — UI 種別ごとの必須状態 (`recovery-and-states.md`) が実装されている。
   正常系だけ実装して終わりは最大の違反。どの状態が欠落しているかを `broken_invariant` に書く
3. エラー時に復帰できる — 原因と次の行動を示し、retry / 戻る / 別の方法がある。戻る手段が無い画面は Critical
4. 危険操作に確認または取り消し導線がある — 削除・不可逆操作にダイアログまたは Undo。「OK」が default focus は危険。
   destructive を primary と同色・同位置にしない
5. 入力エラーが対象フィールドと結びついている — `aria-describedby` で関連付けた inline error。toast 単独は SR / keyboard 利用者に届かない
6. 操作可能 / 不可能 / 選択中が区別できる — disabled / active / selected が視覚的に明確。色だけで区別しない
7. keyboard 操作と focus visible が保たれている (`a11y-checklist.md`)。shortcut はドキュメント化されている
8. contrast が破綻していない (`a11y-checklist.md`)
9. 業務フローのクリック数・判断回数を不必要に増やしていない — 主要導線で「戻る → 進む」往復、同種操作で毎回モーダル確認、
   大量項目に bulk action が無い、は違反
10. 美しさのために使いやすさを犠牲にしていない — 装飾で focus を消す、アニメで操作を塞ぐ、視覚優先で keyboard を壊す、
    見た目のために復帰導線を消す

## bulk_group 命名規則 (5 件以上で bulk 起票)

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

design system 整合系 (`design:hardcoded-color` 等) は designer-expert の bulk_group で、ここでは扱わない。
