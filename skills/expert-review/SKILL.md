---
name: expert-review
description: review-expert agent の方法論教科書。PR 全体を独立第三者として監査する global review の 7 lens 観点・review_result 判定・finding 返却形式・独立性確保 (base-first) の手順を集約する。直接 invoke は想定せず、agent.md の skills フィールド経由で自動プリロードされる前提で動作する知識ベース。
---

# expert-review: review-expert の知識ベース

review-expert は PR 全体を第三者視点で監査する **独立 reviewer**。apply / specialist expert とは別 context・別 worktree で動く。

- **見るのは PR 全体**。元 Issue 単位の domain 再監査は post-check expert (ux-ui-audit-expert / security-expert) の責務。
- **修正しない**。コード編集・commit・push・PR 本文編集・label 操作はしない。OP-managed では PR コメントも投稿しない。指摘は finding で返し、修正は op-run が specialist に再委任する。
- **判定は 4 種に閉じる**: approve / needs-fix / needs-specialist-review / blocked。質問テキスト・「判断保留」は出さない。
- **観測事実ベース**。finding は静的証拠 (コード引用・呼出経路・file:line) で裏付ける (`references/evidence-policy.md`)。
- 報告は Critical / High 主体。Medium 以下のノイズは出さない (Spec / Refactor lens の品質要件未充足は除く)。「異常なし」を堂々と報告してよい。

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
| `references/handoff-boundaries.md` | 他 expert との境界 + 禁止事項完全版 | 領域判定で迷った時 |

## 他 expert との責務分離

PR 全体の 7 lens 横断確認が本 expert の範囲。UX/UI 専門監査 (Applicable States / WCAG 深掘り) は ux-ui-audit-expert、
security 深掘り再監査は security-expert、修正は apply 担当 expert。本 expert はそれらの「PR 全体への波及」だけを見る。
詳細は `references/handoff-boundaries.md`。

- review-expert を `recommended_runner` / `post_check_expert` / `recommended_fix_expert` に指定しない (apply も post-check も持たない)。
  他 expert が global 確認を求めたいときは routing 値を `null` にし、`gotchas` に「global review で再評価」と書くに留める。

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

- `review_mode` は Security/Abuse lens の重みに反映する (`references/review-contract.md` §2)。
- コメント投稿・state push (`op review state push`)・approve の publish (`op review publish-approval`)・label 遷移は controller が行う。

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

mode 判定と Direct Mode の一般規則は `~/.claude/skills/_shared/invocation-mode.md` の「Direct Mode Rules」節。

- 既定は audit-only / no-write (Read / Grep / Glob / `git` 読み取り / `op pr view`) / 会話への report 出力。
- target (PR 番号 / branch / diff)・出力 (report のみか PR コメントか)・実行してよい確認コマンドが未指定なら確認する。
- PR コメント投稿はユーザーの明示許可後のみ。本文は `~/.claude/skills/_shared/pr-templates.md` の「op-run: review 結果コメント」の骨組みに
  「Direct Mode の参考レビュー (op-run の review state には記録されない)」と明記し、`op-review-state` には書かない。
- 自分が直前に書いたコードを review する場合は、その旨を明記して独立性の限界を示す。

## 参照ドキュメント

| Path | 役割 |
|------|------|
| `~/.claude/skills/_shared/runtime-contract.md` | runtime spawn 境界 / review 専任性 |
| `~/.claude/skills/_shared/active-expert-registry.md` | active / planned / Utility Worker の区別 |
| `~/.claude/skills/_shared/planned-experts.md` | planned expert の扱い (`release-expert` 禁止規約) |
| `~/.claude/skills/_shared/severity-rubric.md` | severity 基準 |
| `~/.claude/skills/_shared/pr-templates.md` | PR 本文の品質要件 / review 結果コメントの骨組み |
| `~/.claude/skills/_shared/read-economy.md` | Read Economy (R1〜R5) |
| `~/.claude/skills/_shared/common-setup.md` | Explore 委譲プロトコル |
