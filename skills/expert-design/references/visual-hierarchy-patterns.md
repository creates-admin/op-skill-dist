# Visual Hierarchy Patterns

「重要度」と「視覚重み」が一致しているかを判断する業務 UI 共通パターン。Apply の実装パターンであり、
scan では観点 6 (色記号崩壊) / 観点 7 (情報階層崩壊) の判定ヒントとして使う (scan の起票カテゴリは SKILL.md の観点 1〜9)。

## パターン

1. **primary / secondary / tertiary action** — primary は原則 1 画面 1 つ (filled / accent)。secondary は outline / ghost (1〜3 個)。
   tertiary は text / icon button。全部 primary は階層崩壊
2. **status / metadata / body の分離** — body は最大コントラスト、metadata は弱コントラスト + 小さい文字、status は semantic color + icon + text
3. **heading scale** — h1〜h3 まで (3 段を超えるなら構造を疑う)。同一階層は同じサイズ・重み。size と weight の両方で階層を作る
4. **table density** — 行高 32〜44px。数値右寄せ / テキスト左寄せ。column header 固定、sortable は icon で示す
5. **semantic 色の意味体系** — error / warning / success / info は 1 色 1 役。装飾色を semantic に流用しない
6. **状態の表現** — UI 種別に該当する状態だけを表現する (6 状態を機械的に全要求しない)。
   empty は「何が無いか」+「次に何をするか」、loading は skeleton / spinner / progress、failure は原因 + 復帰手段 + 再試行
7. **detail drawer** — 一覧から詳細を開く方式 (遷移 / drawer) を統一。drawer は close を明示 (Esc / × / 外側 click)、スクロールロック
8. **sticky action** — 保存 / 申請 / 承認は下部 sticky で残し、スクロールで primary action を消さない
9. **destructive action isolation** — 削除・不可逆操作は視覚的に隔離し、primary と同色・同位置にしない。確認ダイアログ + Undo
10. **多重符号化** — 状態を色だけで伝えない (icon + text + color)。詳細は `data-viz-patterns.md` の Color & Accessibility

## 禁止

- CTA が複数同じ強さで並ぶ
- status 色を装飾色として使う
- metadata を本文と同じ重みで混ぜる
- error を色だけで伝える
- heading を size だけで階層化する
- table の数値を左寄せにする
- destructive を primary と同色にする
- 「この画面だけ」の独自 UI を作る (必要なら理由を Issue / PR に残す)
