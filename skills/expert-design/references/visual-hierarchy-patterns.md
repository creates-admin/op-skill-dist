# Visual Hierarchy Patterns

「重要度」と「視覚重み」が一致しているかの判断基準。Apply の実装基準であり、scan では観点 6 (色記号崩壊) /
観点 7 (情報階層崩壊) の判定ヒントとして使う (起票カテゴリは SKILL.md の観点 1〜9)。
状態表現・危険操作の保護・多重符号化は ux-ui-audit-expert の基準 (expert-ux-ui-audit skill の `recovery-and-states.md` /
`a11y-checklist.md`) に従う。

## パターン

1. primary / secondary / tertiary action — primary は原則 1 画面 1 つ。secondary は outline / ghost (1〜3 個)、tertiary は text / icon button。
   全部 primary は階層崩壊
2. status / metadata / body の分離 — body は最大コントラスト、metadata は弱コントラスト + 小さい文字、status は semantic color + icon + text
3. heading scale — h1〜h3 まで (3 段を超えるなら構造を疑う)。同一階層は同じサイズ・重み。size と weight の両方で階層を作る
4. semantic 色の意味体系 — error / warning / success / info は 1 色 1 役。装飾色を semantic に流用しない

## 禁止

- CTA が複数同じ強さで並ぶ
- status 色を装飾色として使う
- metadata を本文と同じ重みで混ぜる
- heading を size だけで階層化する
- destructive を primary と同色にする
- 「この画面だけ」の独自 UI を作る (必要なら理由を Issue / PR に残す)
