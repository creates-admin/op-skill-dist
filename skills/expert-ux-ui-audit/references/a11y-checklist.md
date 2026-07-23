# Accessibility Checklist (WCAG 2.2 AA)

ux-ui-audit-expert が a11y 観点で audit するときのチェックリスト。
WCAG 違反を **Medium / Low 扱いにしない** — A 違反 = Critical、AA 違反 = High。

## Related references

- WCAG 2.2: https://www.w3.org/TR/WCAG22/
- USWDS Design Principles: https://designsystem.digital.gov/design-principles/
- Apple Human Interface Guidelines (Accessibility): https://developer.apple.com/jp/design/human-interface-guidelines/
- 詳細リンクは `reference-map.md` を参照

---

## Severity 対応 (絶対)

| WCAG レベル | severity |
|------------|---------|
| A 違反 (基本要件) | **Critical** |
| AA 違反 (実務最低基準) | **High** |
| AAA 違反 (推奨) | 起票しない (Medium 以下扱い) |

### Critical 起票の例外 (機械的適用を避ける)

WCAG A 違反は原則 Critical だが、**Critical として起票するのは以下のいずれかに該当する場合に限る**。

- 主要導線の interactive element が keyboard または SR で **操作不能**
- form / dialog / navigation が SR で **意味を失う**
- 代替手段がなく、ユーザーが **目的を達成できない**
- focus / label / role 欠落により **操作対象を認識できない**

該当しない A 違反 (装飾要素 / 補助要素 / 代替手段あり) は High または起票見送りにする。

- 装飾画像の `alt` 欠如 → `alt=""` が正解。装飾扱いが妥当なら起票しない
- 補助 icon の代替テキスト不足で意味が伝わるケース (隣接ラベルあり等) → 起票見送りまたは High
- 一部の aria 不足だが操作不能ではないケース → High
- 装飾扱いが不明な場合は `evidence_grade: inferred` とし、Critical にしない

> 「機械的に A 違反 → Critical」とすると装飾要素まで Critical 化して下流コストが増える。
> Critical の価値を保つため、上記 4 条件のいずれかを `severity_reason` に明記できる場合に限り Critical とする。

---

## 静的に検出できる項目

### 1. Contrast (色 / 視認性)

- 本文 (16px 以下含む): **4.5:1 以上**
- 大文字 (18px 以上 / 14px 以上 bold): 3:1 以上
- 非テキスト UI (icon / border / focus ring): **3:1 以上**
- placeholder / 弱コントラスト metadata でも最低基準を割らない

NG 例:
```css
color: #999;      /* 白背景で 2.85:1 → AA 違反 */
border: 1px solid #eee;  /* contrast 不足の input border */
```

### 2. Keyboard 到達性

- 全 interactive 要素が Tab で到達可能
- Tab 順序が論理的 (`tabindex="0"` か自然順、`tabindex` の数値指定は禁止)
- `<div @click>` / `<span @click>` で button を実装していない
- Esc で modal / drawer が閉じる
- Enter / Space で button が起動する

NG 例:
```vue
<div @click="onSubmit">送信</div>  <!-- button 要素を使うべき -->
<button tabindex="-1">削除</button>  <!-- 到達不可 -->
```

### 3. Focus visible

- `:focus-visible` で focus indicator が出る
- 装飾優先で `outline: none` していない (代替 ring が必須)
- focus indicator の contrast 3:1 以上

NG 例:
```css
button { outline: none; }  /* 代替なし → 不可視 */
button:focus { outline: 2px solid #ddd; }  /* contrast 不足 */
```

### 4. Form labels / aria 連携

- 全 input に `<label>` または `aria-label` / `aria-labelledby`
- placeholder を label の代わりにしない
- error は inline + `aria-describedby` で input と紐付け
- `aria-invalid` / `aria-required` を必要箇所に付与

NG 例:
```vue
<input placeholder="メールアドレス" />  <!-- label 無し -->
<span class="error">必須です</span>  <!-- aria-describedby なし -->
```

### 5. Icon button / 画像の代替テキスト

- icon-only button に `aria-label` (隣接テキストがない場合)
- 画像に `alt` (装飾画像は `alt=""`)
- SVG icon が独立して意味を持つ場合は `<title>` または `aria-label`

NG 例:
```vue
<button><Icon name="close" /></button>  <!-- aria-label 無し -->
<img src="..." />  <!-- alt 無し -->
```

### 6. ランドマーク / 見出し階層

- `<main>` / `<nav>` / `<header>` / `<footer>` などのランドマーク
- 見出しは h1 → h2 → h3 と飛ばさない
- 1 ページに `<h1>` は 1 つ

### 7. 動き / 自動再生

- 自動再生動画 / 自動進行カルーセルは停止可能
- `prefers-reduced-motion` を尊重
- 5 秒以上のアニメーションは pause / stop 可能

### 8. 色だけで意味を伝えない

- error / success / warning を **色だけで** 示さない
- 必ず icon + text + color の **3 重符号化**
- 色覚多様性 simulator で確認

NG 例:
```vue
<span style="color: red">エラー</span>  <!-- icon / text 補強なし -->
<chart :colors="['red', 'green']" />  <!-- 色覚多様性で見分け不能 -->
```

---

## プラットフォーム別の追加チェック

ユーザー環境の主戦場 (Vue 3 / Flutter / Tauri v2) に固有の観点。
本節は a11y / 復帰性 / 状態可視性に直結するもののみを扱う (装飾の好みは扱わない)。

### Flutter

- `GestureDetector` / `InkWell` で button 相当の操作を作っているのに `Semantics(button: true)` / `Tooltip` / focus 対応が無い
- `IconButton` / `IconButton.filled` に `tooltip` が無く、SR / マウスホバーで意味が伝わらない
- `ExcludeSemantics` / `IgnorePointer` / `AbsorbPointer` が主要導線を不可視化または操作不能化していないか
- `FocusTraversalGroup` / `Shortcuts` / `Actions` の欠落で desktop / web の keyboard 操作が破綻
- `CircularProgressIndicator` / `LinearProgressIndicator` だけで進捗文言が無く、何の処理中かわからない
- `ErrorWidget` / try-catch の error UI に retry / back / cancel が無く、リロード以外で復帰できない
- `Image.asset` / `Image.network` に `semanticLabel` が無く、装飾でないのに SR が無視

### Tauri v2 (desktop)

- ファイル選択 / 保存 / 書き出しダイアログのキャンセル時に「キャンセルしました」表示や復帰導線が無い
- 長時間処理中に二重実行できる (button が disabled にならない、command を多重起動できる)
- 書き出し / 生成完了後に「保存先を開く」「コピー」などの導線が無い
- エラー時に path / permission denied / locked file / network のいずれかが特定できる文言になっていない
- window / modal / dialog が **keyboard で閉じられない** (Esc / Cmd-W / Ctrl-W)
- `tauri::dialog` / `invoke` 呼び出しの失敗が UI に伝わらず、画面が固まったまま

---

## 動的に検証が必要な項目 (`evidence_grade: requires_runtime`)

- screen reader 読み上げ順
- live region (`aria-live`) の通知タイミング
- focus trap (modal / drawer 内で focus が逃げない)
- toast の SR 通知
- skip link の動作

これらは `reproduction_hint` を必ず添える。

### static 代理で `direct` に格上げ可能なケース

`~/.claude/skills/_shared/runtime-verification.md` の「検証対象 × 手段マトリクス」を参照。
runtime に見える項目でも、以下の **static 代理が成立すれば `direct` 判定可能**:

- focus 視認性 (`:focus-visible` ルール定義 + `outline: none` 打ち消し不在)
- token 同士の contrast (両 token が定数なら WCAG 計算で `direct`)
- focus trap (`focus-trap-vue` / `@react-aria/focus` 等の library 使用が静的に確認できる)
- live region (`aria-live` 配置が静的、loading / error 表示用に限る)

**Hard blockers (focus 不可視 / contrast 不足 / keyboard 不可) を `requires_runtime` に逃がさない**。
詳細は `_shared/runtime-verification.md` の「runtime に逃げてはいけない項目」表。

---

## チェックフロー (audit 時)

1. Grep で `outline:none` / `tabindex="-1"` / `<div .*@click` を網羅検索
2. Grep で `<input` を集め、`<label>` / `aria-label` / `aria-describedby` の有無を確認
3. Grep で `<button>` を集め、icon-only に `aria-label` があるか確認
4. theme / token から色を抽出し、本文 / 非テキスト UI の contrast を計算
5. `prefers-reduced-motion` の尊重を確認
6. 動的項目は手動再現の手順を `reproduction_hint` に書く
