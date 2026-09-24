# Scan / Patrol Finding Policy (ux-ui domain)

scan / patrol で何を起票してよいかの基準。起票範囲は観測可能な使いやすさ / a11y 破綻に絞る。
共通の報告ルールは `~/.claude/skills/_shared/severity-rubric.md`、design ドメインの基準は expert-design skill。

## severity

`severity-rubric.md`「判定の手順」step 3〜4 の ux-ui 版。`broken_invariant` (`usability-invariants.md` 1〜10) を示せないなら起票しない。

- Critical: 回復手段なしのデッドロック UI (Esc も効かない) / 主要導線を完全に塞ぐ UX 障害 (例: ログイン後どこにも進めない) /
  error から復帰できない画面 (リロード以外に手段がない) / 誤操作で不可逆な損失を生む危険操作 / WCAG A 違反 (`a11y-checklist.md` の条件付き)
- High: UI 種別に該当する状態の欠落 (`recovery-and-states.md` の欠落時 severity) / 確認・Undo の無い危険操作 /
  入力エラーが対象フィールドと結びついていない / WCAG AA 違反 (contrast 不足、focus 不可視、icon-only button の `aria-label` 欠、色のみ依存)

## 起票してはいけない

| 禁止 | 理由 |
|------|------|
| 「もっとおしゃれに」「視覚的に整理してほしい」「もう少し余白を」 | 主観 / designer-expert の領域 |
| token bypass / 共通 component bypass それ自体、視覚階層・配色の選択 | designer-expert の領域 (a11y を直接壊す場合のみ ux) |
| broken_invariant を示せない「使いにくそう」 | 観測事実でない |
| 既存ナビゲーション・ショートカットを壊す修正提案 | audit が回帰を生む |
| ガイドラインの機械的な全適用 | heuristics は判断材料で絶対ではない |
| 未読箇所の推測 | 見たものだけ報告する |

## 出力

scan 出力の ux 固有フィールドは SKILL.md の「scan 出力 (ux-ui)」節。bulk_group 名は `usability-invariants.md`。

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

例: `"gotchas": ["保存失敗時の draft 保持には feature-expert との co-run が必要 (useJobForm.ts の local cache)"]`

Issue 分割や複数 runner の判断は司令官が行う。agent は `gotchas` で signal するだけで、secondary_runner 等を宣言しない。
