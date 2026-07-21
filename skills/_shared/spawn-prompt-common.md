<!--
schema_version: 1
last_breaking_change: 2026-05-21
notes: v1 (2026-05-21) — expert spawn prompt の共通必須ブロック
       (invocation_mode / 質問禁止 / 必読 checklist / commits_added 宣言 / assumptions fallback)
       の正本。Issue #316 (spawn template 11 箇所複製解消) の staged_refactor Stage 1 として新設。
       各 SKILL.md は spawn prompt 内の共通節をインライン展開せず、本ファイルへの pointer 1〜2 行に置換する。
-->

<!--
機能概要: expert spawn prompt に必ず含めるべき共通必須ブロックの正本。
作成意図: invocation_mode 宣言 / 質問禁止 / apply-completion-checklist 必読 /
         commits_added 宣言 / assumptions fallback の 4 節が op-scan / op-patrol /
         op-run / op-architect の SKILL.md に 11 箇所インライン複製されており、
         1 行変更に 11 ファイル同期が必要な構造的負債を解消するために集約する。
注意点: 本ファイルは「spawn prompt の中でどう書くべきか」の仕様を示す。
        SKILL.md 側は prompt 文字列内に「~/.claude/skills/_shared/spawn-prompt-common.md
        (>=1) §1〜§4 を参照」の pointer 1〜2 行を置き、本ファイルを Read して補完する。
        expert 固有節 (フェーズ名 / 出力契約 / 作業環境 / cluster 固有値 / domain 表) は
        各 SKILL.md に残す (本ファイルには集約しない)。
-->

# spawn-prompt-common: expert spawn prompt 共通必須ブロック

---

## §1 invocation_mode 宣言

すべての OP skill 由来 spawn prompt の冒頭に **必ず** 以下の 1 行を入れる。
これにより expert は `_shared/invocation-mode.md` の OP-managed Mode rules を適用する。

```text
invocation_mode: op_managed
```

SKILL.md 側への pointer 形式例:
```
共通宣言 (§1〜§4): `~/.claude/skills/_shared/spawn-prompt-common.md (>=1)` を参照。
```

---

## §2 必読 apply-completion-checklist (フェーズ別 2 variant)

spawn prompt 内に以下の variant のいずれかを含める。
フェーズが exploration-only か apply かで variant を選択する。

### variant A: exploration-only (research / investigation / patrol / review)

```text
【必読】Read `~/.claude/skills/_shared/apply-completion-checklist.md` — 完了手順の正本。
本フェーズは <フェーズ名> (exploration-only) のため commits_added: [] が正解 (commit は行わない)。
```

### variant B: apply (実装・scaffold・修正)

```text
【必読】Read `~/.claude/skills/_shared/apply-completion-checklist.md` — 完了手順の正本。
本フェーズは <フェーズ名> (apply) のため commits_added: [SHA, ...] (1 件以上) を完了報告に必ず含める。
```

---

## §3 commits_added フェーズ別宣言テンプレ

完了報告の commits_added フィールドの扱いを spawn prompt 内で明示する。

| フェーズ種別 | commits_added の値 | 宣言文 |
|-------------|-------------------|--------|
| exploration-only | `[]` (空配列が正解) | `commits_added: [] が正解 (commit は行わない)` |
| apply | `[SHA, ...]` (1 件以上必須) | `commits_added: [SHA, ...] (1 件以上) を完了報告に必ず含める` |

exploration-only spawn (investigation / post-check / review / research / patrol audit) では
`commits_added: []` が contract 上の正解 (commit しないフェーズのため)。

apply spawn では `commits_added: []` のまま完了報告を返すことは **contract violation**
(`_shared/expert-spawn.md` / `_shared/apply-completion-checklist.md`。現行版は `_shared/version-check.md` 集約節を参照)。

---

## §4 質問禁止 + assumptions fallback

すべての OP skill 由来 spawn prompt は以下のブロック全体を含む (expert-spawn.md §prompt規約 より転載)。

```text
You must not ask interactive questions.
You must not ask the commander or user for clarification.
Do not write Issue comments asking for clarification unless the OP skill explicitly delegates comment creation to you.
If information is missing, return one of:
  - assumptions[]               (前提を置いて続行する)
  - needs_human_decision        (構造化された判断要求)
  - blocked_actions[]           (この情報なしで実行しない操作のリスト)
  - verification_not_run        (検証不能な場合)
  - manual_review_bucket        (--auto 起票しないが人間レビューには載せる)
Return the required schema / report format. Do not produce free-form question text.
```

詳細な mode 判定 / 禁止フレーズ / `needs_human_decision` 正規スキーマは
`_shared/invocation-mode.md` を参照。

---

## SKILL.md での pointer 記述形式 (参考例)

SKILL.md 側の spawn prompt ブロック内に以下の 1〜2 行 pointer を置き、共通節をインライン展開しない:

```
共通宣言 (invocation_mode / 質問禁止 / 必読 checklist / commits_added): `~/.claude/skills/_shared/spawn-prompt-common.md (>=1)` §1〜§4 を参照。
本フェーズは <フェーズ名> (exploration-only|apply) のため commits_added の値は §3 に従う。
```

固有節 (フェーズ名 / 出力契約形式 / 作業環境 / cluster 固有値 / domain 表) はポインタ行の後に記述する。
