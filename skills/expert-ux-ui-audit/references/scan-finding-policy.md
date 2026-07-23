# Scan / Patrol Finding Policy (ux-ui domain)

scan / patrol で **何を起票して良く、何を起票してはいけないか** を、
ux-ui-audit-expert (ux-ui ドメイン) に対して定義する policy。
Issue 起票は下流コストに直結するため、**起票範囲を厳格に絞る** ことが目的。

## Related references

- `~/.claude/skills/_shared/severity-rubric.md` (Critical / High の定義)
- `~/.claude/skills/_shared/expert-spawn.md` (canonical schema / 必須フィールド (`blocking` / `post_check_expert` 含む) の正本)
- design ドメインの起票基準は `skills/expert-design/references/scan-finding-policy.md` を参照

---

## 起票してよい (Critical / High のみ)

ux-ui 観点で起票して良いのは、**観測可能な使いやすさ / a11y 破綻** に限る。

- UI 種別ごとに該当する Applicable State (loading / failure / empty 等) の **欠落** (`recovery-and-states.md` 参照)
- error から **復帰できない** 画面 (リロード以外に手段がない)
- 危険操作が **確認 / Undo なし** で動く
- keyboard 到達不可 (`<div @click>` で button を実装、`tabindex="-1"` の罠)
- focus が見えない (`outline:none` 未代替)
- contrast 不足 (本文 4.5:1 / 非テキスト 3:1 を割る)
- 入力エラーが対象フィールドと結びついていない (`aria-describedby` 欠)
- icon-only button に `aria-label` 欠
- 主要導線を完全に塞ぐ UX 障害 (例: ログイン後どこにも進めない)
- ユーザーが詰むデッドロック UI (回復手段なし、Esc も effect 無し)

---

## 起票してはいけない (絶対禁止)

| 禁止 | 理由 |
|------|------|
| 「もっとおしゃれにできる」「視覚的に整理してほしい」 | 主観であり、警備員の領域外 |
| 「もう少し余白があると良い」 | 美の領域、designer-expert の責務 |
| token bypass / 共通 component bypass それ自体 | designer-expert の領域 (a11y を直接破壊する場合のみ ux 領域) |
| 視覚階層の構築・配色の選択 | designer-expert の領域 |
| 根拠のない「使いにくそう」指摘 | broken_invariant が示せないなら起票しない |
| Medium / Low の起票 | severity-rubric の Critical / High 定義を厳格適用 |
| 既存ナビゲーション・ショートカットを壊す指摘 | apply 側で生まれる懸念 (audit が回帰を生む) |
| ガイドラインを機械的に全部適用 | UX 心理学法則は判断材料、絶対ではない |
| 未読箇所の推測指摘 | 見たものだけ報告する原則 |
| 司令官との対話 | 自タスクは自己完結 |

---

## patrol 限定の追加制約 (op-patrol)

scan に加えて patrol では以下を厳守する。

- 好みのリファクタ提案を出さない
- 命名・スタイルの好みを起票しない
- 「将来不安」だけの指摘を出さない
- **Medium / Low を一切起票しない**
- 全体設計の大改修提案を出さない (巡回スコープ外)

許可されるのは Critical / High に限り、以下のような **明確な観測結果** のみ:

- 主要導線を完全に塞ぐ UX 障害 (例: ログイン後どこにも進めない)
- accessibility 致命違反 (キーボード操作不可、SR で読めない、A 違反)
- ユーザーが詰むデッドロック UI (回復手段なし、Esc も effect 無し)
- 主要画面で WCAG AA を確実に割る contrast (測定可能)

---

## bulk_group 命名規則

5 件以上集まる類型は、個別 Issue ではなく **bulk Issue** として 1 件にまとめる。
**命名規則の本文は `usability-invariants.md` の bulk_group 節を参照** (重複保持しない)。

> design system 整合系の bulk_group (`design:hardcoded-color` 等) は designer-expert の領域。
> 本エージェントの bulk_group は `ux-ui:` プレフィックスで使いやすさ / a11y 破綻のみを扱う。

---

## scan 出力契約 (canonical schema 補足)

`~/.claude/skills/_shared/expert-spawn.md` の canonical schema に従う JSON 配列。
`domain` フィールドには **`ux-ui`** を入れる (旧 `ux` / `ui` は廃止)。

canonical 必須フィールドの一覧・詳細は `references/agent-instructions.md` の「出力契約」節を正本とする
(`_shared/expert-spawn.md` v14 準拠。本ファイルでは重複保持しない)。

ux 固有フィールド (canonical の後に併存維持、削除しない):

- `user_goal` — このコンポーネント / 画面で達成すべき目的
- `affected_user_flow` — 影響する業務フロー
- `broken_invariant` — `usability-invariants.md` の 1〜10 のどれに違反しているか
- `ux_ui_failure_type` — `missing_state | unclear_action | recovery_blocked | a11y_break | visual_ambiguity | workflow_mismatch` のいずれか
- `reproduction_hint` — `requires_runtime` のとき必須
- `gotchas` への補足 — designer-expert 単独で完結しない場合は **co-run が必要な expert** (feature-expert / debug-expert) を明記する (下記「co-run 判定」節参照)

---

## 自己点検チェックリスト (起票前に通す)

- [ ] 観測事実か (主観でないか)
- [ ] 該当ファイル / 該当行を示せるか
- [ ] `broken_invariant` を 1 つに特定できるか
- [ ] `affected_user_flow` を 1 文で説明できるか
- [ ] Critical / High の severity_reason を書けるか
- [ ] designer-expert の責務に踏み込んでいないか (token / 視覚階層への過干渉)
- [ ] designer-expert 単独で完結するか確認したか (完結しない場合は co-run を `gotchas` に明記)
- [ ] patrol なら Medium / Low を出していないか
- [ ] 「指摘しないことを恐れる」指摘になっていないか

---

## co-run 判定 (designer-expert 単独で完結しないケース)

UX 検出は原則 `recommended_runner: designer-expert` で実装される (UI surface の修正)。
ただし以下のいずれかに該当する場合、designer-expert 単独では完結しない。
そのとき `gotchas` に **どの expert との co-run / 分担が必要か** を明記する
(canonical schema を変えず、op-run 司令官が gotchas を読んで判断する運用)。

### co-run が必要な典型ケース

| UX 問題 | 主担当 | co-run / 分担が必要な expert | 理由 |
|--------|-------|--------------------------|------|
| 保存失敗時に入力 draft が消える | designer-expert | feature-expert | local cache / store 層の修正が必要 |
| 認証切れ時に復帰導線がない (再ログイン → 元画面) | designer-expert | feature-expert | auth flow / route guard の修正が必要 |
| bulk 操作の途中失敗で retry が効かない | designer-expert | debug-expert または feature-expert | API 再試行ロジック / state machine 修正 |
| 権限別の画面遷移が間違っている | designer-expert | feature-expert | RBAC / routing の修正 |
| 長時間処理中の二重実行が起きる (UI button disabled だけでは防げない) | designer-expert | feature-expert | command 多重起動の guard が必要 |
| エラー文言で原因 (path / permission / network) が特定できない | designer-expert | debug-expert または feature-expert | error 種別の判定 / Result 型の整理が必要 |

> 「UI 表示で `disabled` を付けるだけ」「エラーメッセージを書き換えるだけ」で済むものは
> designer-expert 単独で完結する。**業務フロー / データレイヤ / state machine** に手を入れないと
> 直らないものが co-run 対象。

### gotchas 記述テンプレ (co-run が必要なとき)

```json
{
  "recommended_runner": "designer-expert",
  "gotchas": [
    "UI 表示の追加だけでは完結しない。保存失敗時の draft 保持には feature-expert との co-run が必要 (`features/job-board/composables/useJobForm.ts` の local cache 実装が要追加)",
    "designer-expert は EmptyState / ErrorState コンポーネントの追加までを担当し、API retry ロジックは feature-expert に分担"
  ]
}
```

co-run 判定をすると Issue を分割するか、op-run 側で複数 runner を spawn することになる。
**判断は司令官 (op-run) に委ねる。UX agent は `gotchas` で「分担が必要」と signal するだけで止める** —
agent 側で勝手に Issue 分割や secondary_runner を宣言しない (canonical schema を逸脱しないため)。
