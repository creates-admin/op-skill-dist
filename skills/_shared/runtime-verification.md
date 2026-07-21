<!--
schema_version: 1
last_breaking_change: 2026-05-03
notes: v1 (2026-05-03) — runtime 検証手段と static 代理の対応表を集約。
       expert-design / expert-ux-ui-audit 双方の rubric / a11y-checklist / scan-finding-policy から参照される共通基盤。
-->

# Runtime Verification (共通)

/**
 * 機能概要: UI / a11y の項目について、runtime 検証手段と static 代理 (静的観察可能な代替) を 1 ファイルで対応付ける
 * 作成意図: agent 環境によって runtime (Playwright / dev server / browser) が使えないケースがあるため、
 *           「runtime が使えない場合に何で代替するか」「代替不能な項目はどうするか」を expert 横断で統一する
 * 注意点: 本ファイルは shared 規約。expert-design / expert-ux-ui-audit の `evidence_grade` 判定と `Hard blockers` の
 *         代理採点に直結する。書き換えは両 expert の rubric に影響するため慎重に
 */

UI / a11y / 視覚秩序の検証には、static (コード読み) と runtime (実描画 / 実行) の二層がある。
本ドキュメントは **検証対象 → runtime 手段 → static 代理 → 代替不能の場合の扱い** を一表にまとめる。

## 参照経路

- `skills/expert-design/references/scan-finding-policy.md` の `evidence_grade` 節
- `skills/expert-design/references/visual-quality-rubric.md` の「runtime 検証手段がない環境での採点」節
- `skills/expert-ux-ui-audit/references/a11y-checklist.md` の「動的に検証が必要な項目」節
- `skills/_shared/expert-spawn.md` の `evidence_grade` (`direct | inferred | requires_runtime`)

---

## evidence_grade の解釈 (再掲)

| grade | 意味 | severity 上限 |
|-------|------|--------------|
| `direct` | 静的にコード読みで証拠が揃う | Critical 可 |
| `inferred` | 周辺コードからの推論 | High |
| `requires_runtime` | 実行時検証が必要 (代理 static で足りない場合) | High (本ドキュメントの "代理可" 項目は direct に格上げ可) |

**重要**: 以下の表で「static 代理あり」とされる項目は、runtime 不可環境でも代理が成立すれば `direct` を付けて Critical 起票可能。
代理が成立しない (要素が動的生成 / state 別 CSS が runtime で切り替わる等) 場合のみ `requires_runtime`。

---

## 検証対象 × 手段マトリクス

### 1. focus 視認性 (focus indicator が見えるか)

| 観点 | runtime 手段 | static 代理 | 代替不能の扱い |
|------|------------|------------|--------------|
| `:focus-visible` リング表示 | Playwright で要素 focus → screenshot 比較 | CSS で `:focus-visible` ルールが定義されており、`outline: none` を後から打ち消していないことを確認 | static 代理で **direct 判定可**。Hard blocker (focus 不可視) を runtime 不可に逃がしてはいけない |
| focus indicator の contrast 3:1 | Playwright + axe-core / 実描画 contrast 計算 | token 値同士の WCAG 計算 (`color.outline.focus` vs `color.bg.surface`) | token が semantic に解決可能なら static 代理可。custom outline 色は `requires_runtime` |
| keyboard 到達順序の論理性 | Playwright で Tab を打って順序記録 | DOM 順序と `tabindex` 値を確認 (`tabindex` 数値指定なし、natural order) | static 代理可 |

### 2. contrast (色のコントラスト)

| 観点 | runtime 手段 | static 代理 | 代替不能の扱い |
|------|------------|------------|--------------|
| 本文 contrast 4.5:1 | Playwright + axe-core | token から WCAG 計算式で算出 (`color.text.primary` vs `color.bg.surface`) | token が定数なら static 代理可。動的色 (CSS variable inheritance / runtime theme) は `requires_runtime` |
| theme 切替後 (light / dark) の contrast | dev server で theme トグル → 全画面 axe-core | `theme.themes.light` と `theme.themes.dark` の両方で WCAG 計算 | 両 theme の token 値が定数なら static 代理可 |
| transparency 重なり後の contrast | Playwright で実描画 → カラーピッカー | rgba 重なり計算 (簡易) | 重なり 2 層までは代理可、3 層以上は `requires_runtime` |

### 3. screen reader 読み上げ

| 観点 | runtime 手段 | static 代理 | 代替不能の扱い |
|------|------------|------------|--------------|
| 読み上げ順序 | NVDA / VoiceOver で実聴取 | DOM 順序 + `aria-label` / `aria-labelledby` の確認 | 一般的なフォーム / リストは代理可。複雑な ARIA pattern (treegrid / combobox) は `requires_runtime` |
| live region 通知タイミング | Playwright + headless screen reader | `aria-live="polite|assertive"` 属性と更新トリガーの DOM 構造 | `aria-live` 配置が静的 (loading / error 表示用) なら代理可、toast / queue 系は `requires_runtime` |
| focus trap (modal 内) | Playwright で Tab を打って境界確認 | modal component が focus trap library を使っているか (例: focus-trap-vue / @react-aria/focus) | library 使用が確認できれば代理可、自前実装は `requires_runtime` |

### 4. theme / dark mode 切替の正常性

| 観点 | runtime 手段 | static 代理 | 代替不能の扱い |
|------|------------|------------|--------------|
| 全 token が theme 連動 | dev server で theme トグル → diff 視覚比較 | `Grep` で hard-code 色を網羅し、全箇所が theme token 経由か確認 | static 代理で **direct 判定可** (hard-code が 0 件であれば連動証明) |
| theme 切替時の contrast 維持 | Playwright + axe-core を両 theme で実行 | 両 theme の token 値で WCAG 計算 | static 代理可 |
| user preference (`prefers-color-scheme`) 尊重 | Playwright で OS theme をシミュレート | media query / theme provider のコード読み | static 代理可 |

### 5. sticky / scroll / 動き

| 観点 | runtime 手段 | static 代理 | 代替不能の扱い |
|------|------------|------------|--------------|
| sticky header / footer の追従 | Playwright でスクロール録画 | CSS `position: sticky` + `top:` / `bottom:` 値確認 | 実装の存在確認は代理可、実描画の挙動 (スクロール時のちらつき / z-index 衝突) は `requires_runtime` |
| `prefers-reduced-motion` 尊重 | Playwright で OS preference をシミュレート | `@media (prefers-reduced-motion: reduce)` ルール存在確認 | static 代理可 |
| 5 秒以上のアニメーション pause | 実描画で pause 操作 | animation 定義の duration + pause 機構の有無 | 実装の存在確認は代理可、効くかは `requires_runtime` |

### 6. visual hierarchy / density (描画後にしか見えない問題)

| 観点 | runtime 手段 | static 代理 | 代替不能の扱い |
|------|------------|------------|--------------|
| 1 画面に primary action 1 つ | 実描画で目視 | DOM 内で `variant="primary"` の出現回数カウント | static 代理可 |
| empty / loading / error state 描画 | Playwright で各 state を強制描画 | template / JSX の条件分岐 (`v-if` / `&&`) と state 名の確認 | state 名が enum 化されていれば代理可、props 経由の動的 state は `requires_runtime` |
| 高密度テーブルの行高 | 実描画で px 計測 | CSS の行高 token (`line-height` / `min-height`) 確認 | static 代理可 |

---

## runtime 手段の選定ガイド

### 推奨ツール

- **Playwright** (推奨): theme 切替 / scroll / focus / OS preference シミュレートまで一気に行える
- **Storybook + @storybook/addon-a11y / axe-core**: component 単体の a11y チェック
- **Vitest browser mode**: jest 互換で component テストの一環として a11y アサート可能
- **Chrome DevTools Lighthouse**: PR ごとの a11y スコア記録 (CI に組み込みやすい)
- **NVDA / VoiceOver**: 手動聴取が必要な場合 (live region / treegrid 等)

### agent 環境別の判定

| 環境 | Playwright | dev server | NVDA | static 代理 |
|------|:---------:|:----------:|:----:|:----------:|
| ローカル開発 (フル環境) | ✓ | ✓ | ✓ | (使わない) |
| CI (headless) | ✓ | ✓ | ✗ | ✓ |
| agent CLI のみ (権限なし) | ✗ | ✗ | ✗ | ✓ |
| sandboxed agent | △ (Playwright 起動可なら) | △ | ✗ | ✓ |

agent は最初に **手段の有無を判定** し、できる範囲で runtime、不能項目は static 代理、それでも不能なら `requires_runtime` の起票に切り替える。

---

## 「runtime に逃げてはいけない」項目 (Hard blocker 系)

以下の項目は static 代理が成立する。**`requires_runtime` を理由に Hard blocker を素通りさせない**。

| Hard blocker | 必須 static 代理 |
|--------------|---------------|
| focus が見えない | CSS で `:focus-visible` ルールが定義されている、または `outline: none` を打ち消し済 |
| keyboard 到達不可 | `<button>` 要素の使用、`<div @click>` の不在、`tabindex="-1"` の不在 |
| contrast 不足 | token 値同士の WCAG 計算で 4.5:1 / 3:1 を満たす |
| 状態が見えない | template に loading / success / failure / empty / disabled / focus の各分岐が存在 |
| 危険操作が保護されていない | 確認 dialog component の参照、`@click` 直結ではない |

これらが static 代理でも検出できないとき、初めて `requires_runtime` に降格する。
**runtime 不可だから採点しない、は許されない**。

---

## 司令官 / op-skill 側の責務

- op-run / op-architect は worktree 内で dev server / Playwright を起動できる権限を agent に渡す (project ごとに `.claude/settings.json` で許可)
- agent が runtime 不可と判定したら、その理由 (`tool not available` / `permission denied` / `runtime missing`) を完了報告に明記する
- 司令官は runtime 不可起票を受けたら、別 Issue (`design / ux: runtime 検証環境の整備`) を起こして次サイクルで解消する
