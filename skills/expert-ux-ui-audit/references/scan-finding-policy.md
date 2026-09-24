# Scan / Patrol Finding Policy (ux-ui domain)

scan / patrol で何を起票してよいかの基準。起票範囲は観測可能な使いやすさ / a11y 破綻に厳格に絞る。
共通の報告ルールは `~/.claude/skills/_shared/severity-rubric.md`、design ドメインの基準は expert-design skill。

## 起票してよい (Critical / High のみ)

- UI 種別に該当する状態の欠落 (`recovery-and-states.md`)
- error から復帰できない画面 (リロード以外に手段がない)
- 危険操作が確認 / Undo なしで動く
- keyboard 到達不可 (`<div @click>` の button、`tabindex="-1"` の罠)
- focus が見えない (`outline:none` 未代替)
- contrast 不足 (本文 4.5:1 / 非テキスト 3:1 を割る)
- 入力エラーが対象フィールドと結びついていない (`aria-describedby` 欠)
- icon-only button の `aria-label` 欠
- 主要導線を完全に塞ぐ UX 障害 (例: ログイン後どこにも進めない)
- 回復手段のないデッドロック UI (Esc も効かない)

## 起票してはいけない

| 禁止 | 理由 |
|------|------|
| 「もっとおしゃれに」「視覚的に整理してほしい」「もう少し余白を」 | 主観 / designer-expert の領域 |
| token bypass / 共通 component bypass それ自体、視覚階層・配色の選択 | designer-expert の領域 (a11y を直接壊す場合のみ ux) |
| broken_invariant を示せない「使いにくそう」 | 観測事実でない |
| Medium / Low | severity-rubric の Critical / High 定義を厳格適用 |
| 既存ナビゲーション・ショートカットを壊す修正提案 | audit が回帰を生む |
| ガイドラインの機械的な全適用 | heuristics は判断材料で絶対ではない |
| 未読箇所の推測 | 見たものだけ報告する |

### patrol 限定の追加制約

好みのリファクタ提案 / 命名・スタイルの好み / 「将来不安」だけの指摘 / 全体設計の大改修提案 / Medium・Low は一切出さない。
許可は明確な観測結果のみ: 主要導線を完全に塞ぐ UX 障害 / accessibility 致命違反 (keyboard 操作不可、SR で読めない、A 違反) /
デッドロック UI / 主要画面で WCAG AA を確実に割る contrast (測定可能)。

## 出力

canonical schema と ux 固有フィールドは SKILL.md の「scan 出力 (ux-ui)」節。bulk_group 名は `usability-invariants.md`。

## 起票前の自己点検

- [ ] 観測事実か / ファイル・行を示せるか
- [ ] `broken_invariant` を 1 つに特定できるか / `affected_user_flow` を 1 文で書けるか
- [ ] severity_reason を書けるか
- [ ] designer-expert の責務 (token / 視覚階層) に踏み込んでいないか
- [ ] designer-expert 単独で完結するか確認したか (しないなら co-run を `gotchas` に書く)
- [ ] patrol なら Medium / Low を出していないか

## co-run 判定 (designer-expert 単独で完結しないケース)

ux 検出は原則 `recommended_runner: designer-expert` で実装される。業務フロー / データレイヤ / state machine に手を入れないと
直らないものは、`gotchas` に co-run が必要な expert を書く (「disabled を付けるだけ」「文言を書き換えるだけ」なら単独で完結)。

| UX 問題 | co-run が必要な expert | 理由 |
|--------|----------------------|------|
| 保存失敗時に入力 draft が消える | feature-expert | local cache / store 層 |
| 認証切れ後に元画面へ戻れない | feature-expert | auth flow / route guard |
| bulk 操作の途中失敗で retry が効かない | debug-expert または feature-expert | API 再試行 / state machine |
| 権限別の画面遷移が間違っている | feature-expert | RBAC / routing |
| 長時間処理の二重実行 (UI の disabled だけでは防げない) | feature-expert | command 多重起動 guard |
| エラー文言で原因 (path / permission / network) が特定できない | debug-expert または feature-expert | error 種別判定 / Result 型 |

```json
{
  "recommended_runner": "designer-expert",
  "gotchas": [
    "UI 表示の追加だけでは完結しない。保存失敗時の draft 保持には feature-expert との co-run が必要 (useJobForm.ts の local cache)"
  ]
}
```

Issue 分割や複数 runner の判断は司令官が行う。agent は `gotchas` で signal するだけで、secondary_runner 等を宣言しない。
