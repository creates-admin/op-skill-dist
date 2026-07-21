# Visual Hierarchy Patterns

視覚階層を判断するための、業務 UI 共通パターン集。
「重要度」と「視覚重み」が一致しているかを評価する基準を集約する。

## このファイルの位置付け (重要)

本ファイルの **10 観点は Architect Mode の Design Plan で使う設計パターン集** であり、
**scan / patrol の検出カテゴリ (= bulk_group カテゴリ) ではない**。

scan の検出カテゴリ (`design_principle_violated` の値域) は agent.md `designer-expert.md` の **Scan Mode 観点 1〜9** を使う。

| 用途 | リスト | 場所 |
|------|--------|------|
| scan / patrol の起票カテゴリ (`bulk_group`) | 9 観点 | `agents/designer-expert.md` Scan Mode 表 |
| Architect の Design Plan / Run の実装パターン | 10 パターン (本ファイル) | このファイル |
| scan で 9 観点のうち「観点 6 (色記号崩壊)」「観点 7 (情報階層崩壊)」を判定するときのヒント | 10 パターン (本ファイル) | このファイル |

## Related references

- Nielsen Norman Group 10 Usability Heuristics: https://www.nngroup.com/articles/ten-usability-heuristics/
- Material Design Layout: https://m3.material.io/foundations/layout/understanding-layout
- Fluent 2 Layout: https://fluent2.microsoft.design/layout
- 詳細リンクは `reference-map.md` を参照

---

## 観点

### 1. primary / secondary / tertiary action

- 1 画面に **primary は原則 1 つ** (filled / accent)
- secondary は outline / ghost (1〜3 個まで)
- tertiary は text button / icon button (補助操作)
- 「全部 primary」は階層崩壊。読み手は判断ができない

### 2. status / metadata / body content の分離

- body は最大コントラスト
- metadata は弱コントラスト + 小さい文字
- status は semantic color + icon + text

### 3. heading scale

- h1〜h3 (画面で 3 段以上の見出しが必要なら、構造を疑う)
- 同一階層は同じサイズ・同じ重み
- font-size と font-weight の両方で階層を作る (size だけでは弱い)

### 4. table density

- 行高は 32〜44px (compact / comfortable で切替可能だと尚良)
- 数値は右寄せ / テキストは左寄せ
- column header は固定 / sortable は icon で示す

### 5. error / warning / success / info の意味体系

- 各 semantic は **1 色 1 役** に固定
- 装飾色を semantic に流用しない
- icon + color + text の **3 重符号化** が原則

### 6. Applicable States (UI 種別ごとに該当する state)

- UI 種別ごとに該当する state のみ実装する。**6 状態 (loading / success / failure / empty / disabled / focus) を機械的に全要求しない**
- UI 種別ごとの applicable state 早見表は `~/.claude/skills/expert-ux-ui-audit/references/recovery-and-states.md` の早見表を一次定義として参照する (例: 一覧画面なら loading / failure / empty / focus、静的 about 画面なら focus / heading / contrast)
- 該当しない state は Design Plan / 実装側で `not_applicable_reason` を 1 行添えて省略する
- 各 state の品質基準:
  - empty: 「何が無いか」「次に何をすればよいか」を出す
  - loading: skeleton / spinner / progress のいずれか
  - failure: 原因 + 復帰手段 + 再試行を提示

### 7. detail drawer

- 一覧から詳細を開く時、画面遷移か drawer かを統一
- drawer は body 上に overlay、close を明示 (Esc / × / 外側 click)
- スクロールロックを忘れない

### 8. sticky action

- 重要操作 (保存 / 申請 / 承認) は画面下部に sticky で残す
- スクロールしても primary action が消えない設計

### 9. destructive action isolation

- 削除 / 取り消し不能 / 不可逆操作は **視覚的に隔離**
- 通常 primary と同じ色 / 同じ位置にしない
- 確認ダイアログ + 取り消し導線 (Undo) を組み合わせる

### 10. icon + text + color の多重符号化

- 状態を **色だけで** 伝えない (色覚多様性に対応できない)
- 必ず icon + text + color の 3 つを揃える
- 色覚 simulator で検証する

---

## 禁止 (visual hierarchy break)

| 禁止 | 影響 |
|------|------|
| CTA が複数同じ強さで並ぶ | 序列が読めず、判断負荷が上がる |
| status 色を装飾色として使う | 色記号体系が崩壊し、誤読を招く |
| metadata を本文と同じ重みで混ぜる | 重要情報が埋もれる |
| error を色だけで伝える | 色覚多様性 / モノクロ印刷で破綻 |
| UI 種別ごとの Applicable States が未実装 (一次定義は `~/.claude/skills/expert-ux-ui-audit/references/recovery-and-states.md` 早見表。例: 一覧画面で loading/failure/empty が無い、フォームで disabled/focus が無い。`not_applicable_reason` で省略する判断もしていない) | UX 完了性が壊れる、運用で苦情多発 |
| heading を size だけで階層化 | 弱い階層、視線が迷う |
| table の数値を左寄せ | 桁比較ができない |
| destructive を primary と同色 | 誤操作の温床 |

---

## ad-hoc patch を避ける書き方

- token / component / pattern を **常に最初に探す** (`project-design-system-lookup.md`)
- 既存の Toast / Dialog / Form / Button を再利用する
- 「この画面だけ」の独自 UI を作らない
- どうしても必要な独自 UI は ADR / Design Plan に理由を残す
