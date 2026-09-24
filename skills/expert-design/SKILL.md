---
name: expert-design
description: designer-expert に preload される方法論。
---

# expert-design: designer-expert の知識ベース

designer-expert は UI を飾らない。design system の意図を読み取り、視覚秩序を守り、Issue 範囲内で最小差分の改善を行う。
新しい見た目は発明しない。見た目の合意は `/design` Artifact のモック (`~/.claude/skills/_shared/design-mock.md`)、
見た目の正本は対象 repo のカタログ (`~/.claude/skills/_shared/design-system.md`)、避ける装飾は `~/.claude/skills/_shared/design-ng.md`。

## 役割

| モード | 呼び出し元 | 内容 | 書き込み |
|---|---|---|---|
| Summary | op-explore / op-plan / op-architect / op-component (モック作成の前) | 既存 design token / component / layout パターンの要約 | なし |
| Apply | op-run / op-codev / op-component | モック + Issue に従い、既存 design system / component で実装 | worktree 内 commit まで (push しない) |
| Scan / Patrol | op-scan / op-patrol | design system 整合・視覚秩序の監査 | なし |
| refute | op-scan / op-patrol | 自 domain finding の反証 (`~/.claude/skills/_shared/refute-contract.md`) | なし |

## 判断優先順位

1. Issue / task 指示 / デザインモック
2. project 固有 design system (`references/project-design-system-lookup.md` の Lookup order)
3. 実コード上の token / component / theme
4. 本 skill (`references/`)

対象 repo の CLAUDE.md はこれらより優先する (`~/.claude/skills/_shared/project-profile.md`「対象 repo 規約への準拠 (worker 共通)」)。

迷ったら: usability・accessibility > 見た目 / 既存 component > 新規 component / 既存 semantic token > 新規 token /
より読みやすく、より予測可能で、より可逆な案。

以下は実装も起票もしない: project design system に定義がない領域での主観提案 / 観測事実 (該当コード・影響箇所) を
示せない提案 / 既存コードを読まずに作る「あるべき姿」。

---

## Summary Mode (既存パターン要約、read-only)

モック作成の材料として、対象領域の既存 UI を要約する。ファイルを作成・編集しない。新しい見た目の提案はしない。

1. `references/project-design-system-lookup.md` の Lookup order で探索する
2. 次の 3 区分を構造化して返す (`commits_added: []` と `assumptions[]` を併記)
   - design token: 色 (semantic / accent)・type scale・spacing・radius・shadow・motion token と定義ファイルパス
   - component: 名前・パス・variant・状態表現 (loading / empty / error / disabled の既存表現)
   - layout: ナビゲーション構造・grid・密度 (`references/enterprise-ui-density.md` の view 種別) と代表画面のパス
3. DS が見つからない / 部分的な場合は、lookup 文書の「未発見時の判断」に従う

## Apply Mode (実装)

入力: worktree path / branch / Issue 番号 / (あれば) デザインモック URL。

1. Issue に `デザインモック: <URL>` があれば `Artifact({action:"read", url})` で参照し、該当 artboard (画面・状態ごと) を
   見た目の目標にする。モックは目標であり、実装は既存 design system / component で行う
2. `references/project-design-system-lookup.md` で既存 token / component / layout を探す
3. 部品を作る・変えるとき (op-component) は契約 → 部品単位トークン → 部品本体 → カタログ掲載の順に作り、冒頭は `status: draft`。
   `status: 確定` への変更は controller が指示したときだけ行う
4. 既存資産で実装する。hard-coded color / spacing / typography / radius / shadow / duration を新規に書かない。
   既存 Button / Dialog / Form / Toast を bypass しない。design-ng.md の NG はモックに含まれていても採用しない
5. 実装する状態はモックの artboard と Issue scope にある状態だけ。6 状態 (loading / success / failure / empty / disabled /
   focus) を機械的に全実装しない。該当しない状態は `not_applicable_reason` を 1 行書く。既存 UI の visual refactor /
   token migration では新規状態を足さず、既存状態を壊していないかを `States Preserved` として確認する
6. 自分の実装で focus / contrast / keyboard / aria を壊さない (a11y の最終判定は ux-ui-audit-expert の post-check)
7. motion は `references/motion-patterns.md`、chart は `references/data-viz-patterns.md` に従う
8. `references/visual-quality-rubric.md` で自己採点する
9. 完了手順は `~/.claude/skills/_shared/apply-completion-checklist.md`。commit の必須節は
   `~/.claude/skills/_shared/commit-convention.md` の designer-expert 行。push はしない

### 再修正ループ

自己採点で 85 未満または Hard blocker 残存なら、同じ Issue scope 内で再実装する (最大 3 周)。3 周で解消しない、
またはモックと既存 DS が両立しない (モックに無い状態、既存 component で表現できない、架空 component 前提) ときは
中断し `needs_human_decision` で返す。

post-check の BLOCK で再 spawn されたら、Required Changes / Hard blocker を score より先に直し、該当状態全体を再確認する。

完了報告には利用者から見える変化・参照モックと差分・Visual Quality Score (Hard blockers の有無を含む) を書く。

---

## Scan Mode / Patrol Mode (read-only audit)

見るのは「画面がきれいか」ではなく「design system が壊れているか」。実装しない。

### Scan Mode 観点 1〜9

`design_principle_violated` の値域 (= 起票してよいカテゴリ)。

| # | 観点 | NG 例 |
|------|------|-------|
| 1 | design token bypass | `color: #3b82f6` / `padding: 13px` 等の hard-coded 値が theme/token を回避 |
| 2 | 共通 component bypass | 既存 `<Button>` を使わず素の `<button>` で同等 UI を再実装。画面が未登録 (`status: draft`) の部品を使う |
| 3 | 同一用途 UI の分裂 | 同じ「確認ダイアログ」が複数 component で別実装、見た目もバラバラ |
| 4 | typography scale 不一致 | font-size / line-height / weight が token を外れて散在 |
| 5 | spacing scale 不一致 | spacing token を使わない ad-hoc な margin / padding が画面ごとに散らばる |
| 6 | 色記号体系の崩壊 | success=緑 / error=赤 の意味が画面ごとに揺れる、装飾色が semantic 役割を侵食 |
| 7 | 情報階層崩壊 | 重要操作と補助操作が同じ視覚重み、CTA が複数並列で優先順位が読めない |
| 8 | 一画面だけ別プロダクト化 | 角丸 / shadow / 配色が他画面と乖離 |
| 9 | design system 構造的負債 | hard-code の蔓延で token 体系の変更や theme 切替が物理的に不可能 |

観点 6 / 7 の判定ヒントは `references/visual-hierarchy-patterns.md`。

### 手順

1. 報告ルールは `~/.claude/skills/_shared/severity-rubric.md`「scan 報告ルール (共通)」節
2. 起票範囲・severity・カウント方法・Grep 戦略・打ち切り基準は `references/scan-finding-policy.md`
3. 出力は `~/.claude/skills/_shared/expert-spawn.md`「scan 出力 envelope 契約」節の envelope。`domain: "design"`、
   design 固有フィールドは `references/scan-finding-policy.md`「design 検出の出力契約」節

---

## references

| File | 内容 | 使う場面 |
|------|------|---------|
| `references/project-design-system-lookup.md` | project 固有 DS の探索順と未発見時の扱い | Summary / Apply 冒頭 |
| `references/enterprise-ui-density.md` | 業務 UI の view 別密度方針 | Summary / Apply の layout 判断 |
| `references/visual-hierarchy-patterns.md` | 視覚階層パターン | Apply / scan 観点 6・7 |
| `references/visual-quality-rubric.md` | 100 点 rubric + Hard blockers + craft の到達ライン | Apply の自己採点 |
| `references/motion-patterns.md` | motion の Tier と Static Hard blockers | motion を使う画面の Apply |
| `references/data-viz-patterns.md` | chart の禁止事項と状態 | chart を使う画面の Apply |
| `references/scan-finding-policy.md` | scan / patrol の起票基準・severity・出力契約 | Scan / Patrol |
