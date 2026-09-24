# Accessibility Checklist (WCAG 2.2 AA)

a11y 観点の audit チェックリスト。WCAG 違反を Medium / Low 扱いにしない。

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

## 静的に検出できる項目

### 1. Contrast

- 本文 (16px 以下含む) 4.5:1 以上 / 大きい文字 (18px 以上、14px 以上 bold) 3:1 以上
- 非テキスト UI (icon / border / focus ring) 3:1 以上
- placeholder / 弱コントラスト metadata でも最低基準を割らない

```css
color: #999;             /* 白背景で 2.85:1 → AA 違反 */
border: 1px solid #eee;  /* contrast 不足の input border */
```

### 2. Keyboard 到達性

- 全 interactive 要素が Tab で到達できる。Tab 順序は自然順 (`tabindex` の正の数値指定は禁止)
- `<div @click>` / `<span @click>` で button を実装しない
- Esc で modal / drawer が閉じる。Enter / Space で button が起動する

```vue
<div @click="onSubmit">送信</div>    <!-- button 要素を使う -->
<button tabindex="-1">削除</button>  <!-- 到達不可 -->
```

### 3. Focus visible

- `:focus-visible` で indicator が出る。`outline: none` には代替 ring が必須
- indicator の contrast 3:1 以上

```css
button { outline: none; }                      /* 代替なし → 不可視 */
button:focus { outline: 2px solid #ddd; }      /* contrast 不足 */
```

### 4. Form labels / aria 連携

- 全 input に `<label>` または `aria-label` / `aria-labelledby`。placeholder を label の代わりにしない
- error は inline + `aria-describedby` で input と紐付ける。`aria-invalid` / `aria-required` を付ける

```vue
<input placeholder="メールアドレス" />  <!-- label 無し -->
<span class="error">必須です</span>     <!-- aria-describedby なし -->
```

### 5. Icon button / 画像の代替テキスト

- icon-only button に `aria-label` (隣接テキストがない場合)
- 画像に `alt` (装飾は `alt=""`)。意味を持つ SVG icon は `<title>` または `aria-label`

### 6. ランドマーク / 見出し階層

- `<main>` / `<nav>` / `<header>` / `<footer>` 等のランドマーク
- 見出しは h1 → h2 → h3 と飛ばさない。`<h1>` は 1 ページ 1 つ

### 7. 動き / 自動再生

- 自動再生動画 / 自動進行カルーセルは停止できる。5 秒以上のアニメーションは pause / stop 可能
- `prefers-reduced-motion` を尊重する (motion の設計規則は expert-design skill の motion-patterns)

### 8. 色だけで意味を伝えない (色覚多様性)

| タイプ | 人口比率 | 影響 | 対策 |
|--------|---------|------|------|
| 1 型 (P 型) | 男性約 1% | 赤が暗く見え、赤-緑の区別が困難 | 赤単独で状態を示さない |
| 2 型 (D 型) | 男性約 5% | 赤-緑の区別が困難 (最多) | 成功=緑 / エラー=赤に必ず icon / text を併用 |
| 3 型 (T 型) | 約 0.01% | 青-黄の区別が困難 | 青と黄の隣接配置を避ける |
| 全色盲 | 極めてまれ | 明度のみで認識 | 明度差を十分に確保 |

- error / success / warning は icon + text + color の 3 重符号化
- 赤と緑を対で使って状態を区別しない。グレースケールでも区別できる明度差を確保する
- グラフは色だけでなくパターン / 線種を併用する。P 型 / D 型シミュレーションで確認する

```vue
<span style="color: red">エラー</span>          <!-- icon / text 補強なし -->
<chart :colors="['red', 'green']" />            <!-- 色覚多様性で見分け不能 -->
```

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

## 動的検証が必要な項目 (`evidence_grade: requires_runtime`)

SR 読み上げ順 / `aria-live` の通知タイミング / focus trap / toast の SR 通知 / skip link の動作。`reproduction_hint` を必ず添える。

static 代理が成立すれば `direct` にしてよい (`~/.claude/skills/_shared/runtime-verification.md`):

- focus 視認性 (`:focus-visible` 定義 + `outline: none` 打ち消し不在)
- 定数 token 同士の contrast (WCAG 計算)
- focus trap (`focus-trap-vue` / `@react-aria/focus` 等の library 使用を静的に確認)
- live region (loading / error 表示用の `aria-live` 配置)

focus 不可視 / contrast 不足 / keyboard 不可を `requires_runtime` に逃がさない。

## Grep 検出パターン (audit の手順)

1. 下表のパターンで網羅検索する
2. `<input` を集めて `<label>` / `aria-label` / `aria-describedby` の有無、`<button>` を集めて icon-only の `aria-label` を確認
3. theme / token から色を抽出し、本文 / 非テキスト UI の contrast を計算
4. 動的項目は再現手順を `reproduction_hint` に書く

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

lookahead (`(?!...)`) を含むパターンは `rg --pcre2` で実行する。
