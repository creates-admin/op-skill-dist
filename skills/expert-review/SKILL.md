---
name: expert-review
description: review-expert に preload される方法論。7 lens・判定・返却形式・base-first の手順。
---

# expert-review: review-expert の知識ベース

review-expert は PR 全体を第三者視点で監査する独立 reviewer。apply / specialist expert とは別 context・別 worktree で動く。
元 Issue 単位の domain 再監査は post-check expert (ux-ui-audit-expert / security-expert) の責務で、本 expert は PR 全体を見る。
報告は Critical / High 主体 (Spec / Refactor lens の品質要件未充足は Medium でも可)。「異常なし」も正当な結論。
禁止事項の正本は `agents/review-expert.md`。

本 skill (+ `references/`) が review 契約 (7 lens / `review_result` 判定 / needs-fix 3 条件 / lens → 再委任先提案) の正本。
op-run の dispatch 判定優先順位 1-8 は op-run skill の review-fix-loop §4.5-2、spawn 値と結果の publish は op-run skill の global-review-spawn が正本。

## 判断優先順位

1. PR / Issue / scope_in / scope_out / acceptance criteria / デザインモック
2. project 固有の design system / domain rule / 既存コードの慣習
3. project 固有の検証契約 (`~/.claude/skills/_shared/project-profile.md` / verification commands)
4. 本 skill (`references/`)
5. `~/.claude/skills/_shared/` の正本群
6. 外部知識 (CLAUDE.md / WCAG / OWASP 等)。WCAG は絶対基準 (A 違反 = Critical / AA 違反 = High)

## references

| File | 役割 | 読むタイミング |
|------|------|---------------|
| `references/review-contract.md` | 作業冒頭の核 (mode / review_mode / 入力 / 手順 / 返却) | 冒頭 |
| `references/evidence-policy.md` | base-first evidence procedure / 証拠の扱い / 検証コマンドの副作用 | review 開始前 |
| `references/lens-catalog.md` | 7 lens 観点 + 典型 finding + severity 目安 + `recommended_fix_expert` 提案表 | 全 review |
| `references/result-decision.md` | 4 判定の条件 / needs-fix 3 条件 AND / round 境界 | 判定段階 |
| `references/finding-schema.md` | 返却形式・finding field・集約ルール | 返却段階 |
| `references/handoff-boundaries.md` | 他 expert との境界 / planned expert の解決 | 領域判定で迷った時 |

## 他 expert との責務分離

UX/UI 専門監査は ux-ui-audit-expert、security 深掘りは security-expert、修正は apply 担当 expert。本 expert はそれらの「PR 全体への波及」だけを見る。
他 expert が global 確認を求めたいときは routing 値を `null` にし、`gotchas` に「global review で再評価」と書くに留める。
境界の詳細は `references/handoff-boundaries.md`。

### correctness 候補列挙の下請け invoke (optional)

`Skill(op-skill:op-code-review)` を correctness 候補の列挙に使ってよい (例: `args: "diff: origin/<BASE_REF>...HEAD effort: high"`)。

- 返却は **候補**。最終判定・severity・lens 割当・finding 化は自分で行う (JSON を転記しない)。
- apply 側の自己検証と重複する finding は独立再確認として扱う。
- 使えない環境では skip して 7 lens のみで監査する。

## フェーズ別の使い方

### OP-managed Mode (op-run)

ClusterOrchestrator が PR ごとに review-expert を spawn する (spawn 値の契約は op-run skill の global-review-spawn §4-2-a)。
review-expert は 4 phase を順に実行し、構造化結果を返す。phase ごとの model は spawn prompt の `models` に従う。

| phase | やること | 主に読む |
|-------|---------|---------|
| prep | base-first evidence procedure を 1 回実施し review context digest を作る | `evidence-policy.md` |
| lens-audit | digest を起点に active lens ごとに diff を精査し候補 finding を出す (recall 重視) | `lens-catalog.md` |
| adversarial-verify | High / Critical 候補の引用 file:line を再 Read して反証する (偽陽性・severity 過大)。Security lens は default confirmed | `evidence-policy.md` / `~/.claude/skills/_shared/severity-rubric.md` |
| synthesize | 確定 finding から verdict を確定し、backstop gap-check で見落としを独立に拾う | `result-decision.md` |

`review_mode` は Security/Abuse lens の重みに反映する (`references/review-contract.md` §2)。

### op-codev 単一 spawn モードでの active_lens_keys honor 契約

op-codev は review-expert を 1 体だけ spawn し、`active_lens_keys` (JSON 配列) で重点 lens を指定する。

| 契約 | 内容 |
|------|------|
| honor | 空配列でなければ指定 lens を重点審査する。指定外 lens は省力化してよい |
| recall floor | 空配列・不明・解釈不能なら 7 lens フル |
| core lens 必須 | `security` / `spec` / `test-regression` は指定に関わらず常に審査する |
| sensitive PR フル | prompt に sensitive path touch の明示 (`REVIEW_SENSITIVE_TOUCHED != 0` 相当) があれば絞り込みを無効化し 7 lens フル |

返却は review-finding payload (`op help payload review-finding`)。

### Direct Mode (人間が直接呼ぶ)

- 既定は audit-only / no-write (Read / Grep / Glob / `git` 読み取り / `op pr view`) / 会話への report 出力。
- target (PR 番号 / branch / diff)・出力 (report のみか PR コメントか)・実行してよい確認コマンドが未指定なら確認する。
- PR コメント投稿はユーザーの明示許可後のみ。本文は `~/.claude/skills/_shared/pr-templates.md` の「op-run: review 結果コメント」の骨組みに
  「Direct Mode の参考レビュー (op-run の review state には記録されない)」と明記し、`op-review-state` には書かない。
