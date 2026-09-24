# Accessibility Checklist (WCAG 2.2 AA)

a11y 観点の audit 基準。WCAG 違反を Medium / Low 扱いにしない。

## Severity 対応

| WCAG レベル | severity |
|------------|---------|
| A 違反 | Critical |
| AA 違反 | High |
| AAA 違反 | 起票しない |

A 違反を Critical にするのは、次のいずれかを `severity_reason` に書ける場合に限る:

- 主要導線の interactive element が keyboard または SR で操作不能
- form / dialog / navigation が SR で意味を失う
- 代替手段がなく、ユーザーが目的を達成できない
- focus / label / role の欠落で操作対象を認識できない

該当しない A 違反 (装飾要素 / 補助要素 / 代替手段あり) は High または起票しない。

- 装飾画像は `alt=""` が正解。装飾扱いが妥当なら起票しない
- 隣接ラベルで意味が伝わる補助 icon → 起票しないか High
- 操作不能ではない aria 不足 → High
- 装飾かどうか不明 → `evidence_grade: inferred` とし Critical にしない

## 静的に見る項目

1. contrast: 本文 4.5:1 / 大きい文字 3:1 / 非テキスト UI (icon / border / focus ring) 3:1。placeholder・弱コントラスト metadata も割らない
2. keyboard 到達: `<div @click>` / `<span @click>` の button、正の `tabindex`、`tabindex="-1"` の罠、Esc で閉じない modal / drawer
3. focus visible: `outline: none` に代替 ring が無い
4. form label / aria: label 無し input、placeholder を label 代わり、`aria-describedby` の無い inline error
5. 代替テキスト: icon-only button の `aria-label`、意味を持つ画像・SVG の `alt` / `<title>`
6. ランドマーク / 見出し階層の欠落・飛び
7. 自動再生・5 秒以上のアニメに停止手段が無い / `prefers-reduced-motion` 未尊重 (motion の設計規則は expert-design skill の `motion-patterns.md`)
8. 色だけで意味を伝える (error / success / warning は icon + text + color の 3 重符号化。赤-緑の対で状態を区別しない)

## プラットフォーム別

### Flutter

- `GestureDetector` / `InkWell` の button 相当操作に `Semantics(button: true)` / `Tooltip` / focus 対応が無い
- `IconButton` に `tooltip` が無い
- `ExcludeSemantics` / `IgnorePointer` / `AbsorbPointer` が主要導線を不可視化・操作不能化している
- `FocusTraversalGroup` / `Shortcuts` / `Actions` の欠落で desktop / web の keyboard 操作が破綻
- `CircularProgressIndicator` / `LinearProgressIndicator` だけで何の処理中か分からない
- `ErrorWidget` / error UI に retry / back / cancel が無い
- 装飾でない `Image.asset` / `Image.network` に `semanticLabel` が無い

### Tauri v2 (desktop)

- ファイル選択 / 保存 / 書き出しダイアログのキャンセル時に表示や復帰導線が無い
- 長時間処理中に二重実行できる (button が disabled にならない、command を多重起動できる)
- 書き出し完了後に「保存先を開く」「コピー」等の導線が無い
- エラー文言で path / permission denied / locked file / network のどれか特定できない
- window / modal / dialog を keyboard で閉じられない (Esc / Cmd-W / Ctrl-W)
- `dialog` / `invoke` の失敗が UI に伝わらず画面が固まる

## 動的検証が必要な項目

SR 読み上げ順 / `aria-live` の通知タイミング / focus trap / toast の SR 通知 / skip link の動作は `evidence_grade: requires_runtime` +
`reproduction_hint`。static 代理が成立すれば `direct` (`~/.claude/skills/_shared/runtime-verification.md`)。
focus 不可視 / contrast 不足 / keyboard 不可は `requires_runtime` に逃がさない。

## Grep 検出パターン

| 検出対象 | パターン | 対象 glob |
|---------|---------|----------|
| alt 欠如の img | `<img(?![^>]*alt)` | `*.vue`, `*.tsx`, `*.html` |
| div / span のクリック | `<div.*@click\|<span.*@click\|<div.*onClick` | `*.vue`, `*.tsx` |
| outline 削除 | `outline-none\|outline: none\|outline: 0` | `*.vue`, `*.css`, `*.scss` |
| tabindex 不正 | `tabindex="[2-9]\|tabindex="[1-9][0-9]` / `tabindex="-1"` | `*.vue`, `*.tsx`, `*.html` |
| aria-label 欠如のボタン | `<button(?![^>]*aria-label)(?![^>]*>[^<])` | `*.vue`, `*.tsx` |
| lang 属性欠如 | `<html(?![^>]*lang)` | `*.html` |
| 色のみの情報伝達 | `color:.*red\|color:.*green` (文脈で判断) | `*.vue`, `*.css` |
| reduced-motion 未対応 | `animation\|transition` (`prefers-reduced-motion` の有無と対比) | `*.css`, `*.scss` |

lookahead (`(?!...)`) を含むパターンは `rg --pcre2` で実行する。contrast は theme / token から色を抽出して計算する。
