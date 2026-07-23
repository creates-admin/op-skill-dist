---
name: expert-ux-ui-audit
description: ux-ui-audit-expert agent の方法論教科書。使いやすさ・わかりやすさ・状態網羅・accessibility (WCAG 2.2 AA) の監査と、Design Plan gate / apply post-check の判定基準を集約する。直接 invoke は想定せず、agent.md の skills フィールド経由で自動プリロードされる前提で動作する知識ベース。
---

# expert-ux-ui-audit: ux-ui-audit-expert の知識ベース

<!--
機能概要: ux-ui-audit-expert が op-scan / op-patrol / op-architect (gate) / op-run (post-check) で
         参照する観点・判定基準・起票基準を集約した教科書。
作成意図: agent.md は契約 (役割・モード・入出力・禁止) と索引に専念し、HOW の本体
         (思想 / 観点 / a11y / 復帰 / 判定軸 / 起票基準) はこの教科書側に置く。
         designer-expert (expert-design) と responsibilites を分離し、両 agent で共通する
         合格ライン (Hard blockers / Decision テーブル) と Tier 1 heuristics リンクのみ
         意図的に重複保持する (sync コスト削減のため、配点や Tier 2/3 は片側のみ)。
注意点: agent から skills: で自動プリロードされる前提。直接 /expert-ux-ui-audit のような起動は
       基本想定しない (description で自然に抑制)。
       本ファイルは構造のみ。観点・思想・判定軸の本文を本ファイルに書き戻さないこと。
-->

## このドキュメントの位置づけ

ux-ui-audit-expert は使いやすさ・安全性・状態網羅を監視する **警備員** である
(思想・原則の正本は `references/philosophy.md`)。

本 skill は ux-ui-audit-expert が判断 / 起票 / 判定の各段階で参照する **方法論の本体** を集約する。
agent.md は契約に集中し、HOW の詳細は references/ 配下に分割して置く。

---

## 判断優先順位 (絶対)

shared knowledge は project 固有の token / component / brand rule を上書きしてはならない。
agent は常に以下の順で判断する。

1. Issue / task 指示
2. project 固有 design system (`Share/design-system/` 等)
3. 実コード上の token / component / theme
4. 本 skill (`skills/expert-ux-ui-audit/references/`)
5. 外部 UX 思想 / WCAG / 各種ガイドライン (`references/reference-map.md`)

> WCAG だけは絶対基準として扱い、A 違反 = Critical / AA 違反 = High。優先順位 5 でも下げない。

---

## 作業冒頭でやること

ux-ui-audit-expert は **作業の最初に必ず黙読する** 動作スニペットを `references/agent-instructions.md` に持つ。
mode 判定 (scan / patrol / gate / post-check) → 入力取得 → output schema (canonical schema 実例 / ゼロ件報告)
までが 1 枚で完結する。判断に迷ったら以下の references に戻る。

## references 構成

| File | 役割 | 読むタイミング |
|------|------|---------------|
| `references/agent-instructions.md` | **作業冒頭の核** (mode 判定 / 入力取得 / canonical schema 実例 / ゼロ件報告) | 全フェーズの冒頭 |
| `references/philosophy.md` | 警備員思想・使いやすさ最優先 | 迷った時の立ち戻り |
| `references/usability-invariants.md` | 10 不変条件 + bulk_group 命名規則 (本文一次保持) | scan / patrol / gate / post-check |
| `references/a11y-checklist.md` | WCAG 2.2 AA / contrast / keyboard / focus / aria | 全フェーズ |
| `references/recovery-and-states.md` | loading / empty / error / undo / confirm の設計指針 | scan / gate |
| `references/gate-criteria.md` | Design Plan gate の判定軸 + 出力フォーマット | gate (op-architect) |
| `references/post-check-criteria.md` | apply 後 audit の判定軸 + 出力フォーマット | post-check (op-run) |
| `references/visual-quality-rubric.md` | Hard blockers + Decision (BLOCK 絶対条件) | gate / post-check |
| `references/scan-finding-policy.md` | scan / patrol の起票 / 不起票境界 | scan / patrol |
| `references/reference-map.md` | 外部参考の正規リンク (NN/g / WCAG / GOV.UK 等) | キャリブレーション時 |

---

## designer-expert との責務分離

- **使いやすさ・わかりやすさ・a11y はここで番をする** — 業務フロー破綻、必須 state 欠如、復帰不能、keyboard/focus/contrast 違反
- **美しさ・design system 整合・視覚秩序は designer-expert (expert-design) が番をする** — token bypass、共通 component bypass、視覚階層の崩壊
- 領域は重なる場合があるが、**使いやすさが常に優先される**

両 skill 間の重複保持は最小化している:

| 領域 | 保持方針 |
|------|---------|
| **Hard blockers + Decision テーブル** (visual-quality-rubric.md) | 両 skill に重複保持。両 agent で合格ラインを共有 |
| 配点 (Score 表 25/25/20/15/15) | designer 側のみ。ux は score を出さず Hard blockers で判定 |
| Tier 1 heuristics (NN/g / GOV.UK / IBM) | 両 skill に重複保持。両 agent の校正に共通 |
| Tier A 標準 (WCAG / WAI-ARIA / USWDS) | ux 側のみ (a11y は ux の責務) |
| Tier 2 (enterprise DS) / Tier 3 (information design) | designer 側のみ (designer の主戦場) |
| Tier P (Apple HIG / Material / Fluent) | 両 skill 保持、役割が違うため Tier 名や使い方は agent ごとに書き分け |

---

## フェーズ別の使い方早見表

### Scan Mode (`op-scan`) / Patrol Mode (`op-patrol`)

1. `references/agent-instructions.md` を黙読 (mode 判定 + canonical schema 実例)
2. `references/scan-finding-policy.md` で起票範囲を確認
3. `references/usability-invariants.md` の 10 不変条件で audit
4. `references/a11y-checklist.md` で a11y 観点を確認
5. Critical / High のみ起票 (patrol は Medium / Low 完全禁止)
6. 検出 0 件のときは空配列 `[]` を返す (`agent-instructions.md` のゼロ件報告節)

### Gate Mode (`op-architect` の Design Plan 検証)

1. `references/agent-instructions.md` を黙読
2. `references/gate-criteria.md` の 6 観点 (+ Motion Strategy 節があれば motion 安全性の観点7、ADR-0012 Wave4) で Design Plan を検証
3. `references/recovery-and-states.md` で必須 state 網羅性を確認
4. `references/visual-quality-rubric.md` の Hard blockers を点呼
5. PASS / PASS_WITH_NOTES / BLOCK を判定 (Hard blockers 1 件残でも BLOCK)

### Post-Check Mode (`op-run` の apply 結果監査)

1. `references/agent-instructions.md` を黙読
2. `references/post-check-criteria.md` の 7 観点で実装差分を検証
3. `references/a11y-checklist.md` で a11y 退化を確認
4. `references/visual-quality-rubric.md` の Hard blockers で実装が合格ラインを満たすか確認
5. PASS / PASS_WITH_NOTES / BLOCK を判定 (Hard blockers 1 件残でも BLOCK)

---

## 実装完了後の code-review invoke

本節の方法論は `~/.claude/skills/_shared/apply-completion-checklist.md` に集約された。
本 expert の固有 skip 条件のみ以下に残す。

### 固有 skip 条件 (ux-ui-audit は read-only 専任のため適用範囲が限定)

apply 派生 (修正コミットが発生する場合) かつ修正ありの場合のみ invoke する。

- **audit (scan / gate / post-check) モード**: invoke なし、`code_review_skip_reason: "ux-ui-audit read-only, no apply performed"`
- **apply 派生でも修正ゼロの場合**: invoke なし、同上の skip_reason

---

## Direct Expert Run (直接実行時の対話型入口)

通常は OP skill (op-scan / op-run / op-merge / op-architect / op-patrol) 経由で呼ばれ、Issue 指示書 / hidden marker / scope / verification_steps / post-check 条件が事前に渡される。

ユーザーが本 skill を **直接実行** する場合は OP 側の文脈が不足するため、最小限の対話型確認を行う。
Direct Mode / OP-managed Mode の責務境界 (Mode Detection / Direct Mode Rules / OP-managed Mode Rules) は
`~/.claude/skills/_shared/invocation-mode.md` を参照。直接実行時の確認手順は同ファイル「Direct Mode の出力例」節を参照。

### 初期モード

ux-ui-audit-expert は **直接実行時は audit / report 優先**。実装は持たないため修正が必要なら designer-expert / feature-expert に分離して Issue 起票する。

### 指定がない場合の保守的扱い (default)

| 項目 | default |
|------|---------|
| mode | scan-only (apply / commit / push しない) |
| permission | no-write (Read / Grep / Glob のみ) |
| output | report (finding を返すだけ、commit / PR 作成はしない) |

OP 経由で Issue / marker / scope が既に渡されている場合は default を上書きしてその契約に従う。

### 初回確認テンプレ

ux-ui-audit-expert は Direct Mode でも apply / commit / push を行わない。
修正が必要な場合は、visual / component / token / layout は `designer-expert`、
state / recovery / flow / a11y 実装は `feature-expert` に分離して Issue 起票する。

直接実行時に target / mode / output / verification が未指定なら以下を確認する。

1. 対象はどこですか？(ファイル / ディレクトリ / PR / Issue / diff)
2. モードは scan / gate / post-check / report のどれですか？
3. 出力は finding のみでよいですか？それとも designer-expert / feature-expert 向けの Issue 化案まで出しますか？
4. 実行してよい確認コマンドはありますか？

指定がなければ、scan-only / no-write / report 出力として扱う。

### 直接実行時の禁止事項

- ユーザー許可なしに apply へ進む
- OP 管理外で勝手に branch / PR / merge を作る
- scope_out に踏み込む
- verification 不明のまま成功扱いする

---

## 参照ドキュメント (Single Canonical Source)

| Path | 役割 | 読むタイミング |
|------|------|----------------|
| `skills/_shared/runtime-contract.md` (>=1) | runtime spawn 境界 / 本 expert の post-check 専任性 / merge-blocking 条件 | scan / post-check 冒頭 |
| `skills/_shared/active-expert-registry.md` (>=2) | active / planned 区別、本 expert の no-apply 適格性確認 | spawn 解決時 |
| `skills/_shared/markers/labels-and-markers.md` (>=2) | 出力 marker (`op-ux-ui-gate` / `op-ux-ui-audit`) / 受領 label (`pro-ux-ui-audit-*`) の名前と core semantics | output 整形時 |
| `skills/_shared/common-setup.md` (>=2) | Explore 委譲プロトコル (breadth / クエリ数基準) + フォールバック | 大規模 repo audit / 広域探索フェーズ |
| `skills/_shared/apply-completion-checklist.md` | apply Run Mode の完了手順 (4 段階順序 + チェックリスト + 強警告)。固有 skip 条件は本 SKILL.md の「## 実装完了後の code-review invoke」節を参照 | apply Run Mode 冒頭 |
| `skills/_shared/expert-spawn.md` | scan / patrol の canonical schema 定義 / apply 入力契約 / spawn schema / canonical 必須フィールド (`blocking` / `post_check_expert` 含む) / **Marker Publish Validate 節** (publish 前 2 段 validate 手順の正本) | Scan 出力契約 / Apply Run Mode 冒頭 / marker publish 前 |
| `skills/_shared/read-economy.md` (>=1) | Read Economy 原則 (R1〜R5): 既読ファイル再 Read 禁止 / Edit 後確認 re-Read 禁止 / 必要最小範囲 Read | scan / apply 全フェーズ |
