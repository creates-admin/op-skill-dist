---
name: op-report
description: 単一 finding を隔離 context で調査・確認・起票する薄い委任スキル。「これ起票して」「たまったやつ整理して」等のキーワードで起動。finding mode (1件) と handoff mode (会話履歴から複数抽出) の 2 モード。
effort: medium
---

# op-report: 単一 finding 隔離起票スキル

単一の finding を scout worker の隔離 context で調査・実在確認・起票させ、controller には 1 行の relay だけを返す。

## 3 原則

1. **Direct Mode 固定** — `_shared/invocation-mode.md` に従う。OP-managed 経路はない
2. **context 隔離** — 調査〜起票は scout の隔離 context で完遂し、main context を汚さない
3. **確認 gate** — 起票前に必ずユーザーの承認を得る。承認なしの一括起票はしない

severity で絞らない: scout の実在確認 gate が `confirmed` なら Low でも起票する。起票前ゲートは `_shared/filing-gate.md` (op-report は scout の実在確認のみ)。

| | finding mode | handoff mode |
|-|-------------|-------------|
| 起動きっかけ | 「これ起票しといて」など単一の課題 | 「たまったやつ起票して」「未対応を整理して」など複数 |
| Task 源泉 | ユーザーが渡した finding | controller が会話履歴から抽出 |
| scout spawn 数 | 1 体 | 承認 Task ごとに 1 体 (直列) |

## フェーズ 0: 環境確認

`_shared/common-setup.md` の git/gh check に従う。`OP_GITHUB_CHANNEL=mcp` なら gh 認証は不要で、scout が call-spec を実行する (`_shared/github-channel.md`)。

## フェーズ 1: mode 判定

発話から finding / handoff を判定する。判定できなければ次の 1 問だけ確認する:

```
1 件の特定の課題を起票しますか？
それとも今の会話から未対応のものをまとめて整理しますか？
```

## フェーズ 2a: finding mode

1. controller が finding を整理して確認する:

```
以下の内容で Issue を起票してよいですか？

タイトル案: <finding から生成したタイトル>
内容: <finding の要約 1〜2 文>
リポジトリ: <現在の git リポジトリ>

起票しますか？ (y/n または修正を教えてください)
```

2. 承認されたら scout を 1 体 spawn し、返却をフェーズ 3 へ渡す。

## フェーズ 2b: handoff mode

1. **controller が**会話履歴から未対応 Task を抽出する (scout は会話履歴を持たない)。対象例: 「後で」「Issue にしておく」と言って未起票のもの、言及されたが未対処のバグ・気になる挙動、明示された TODO。
2. 一覧を提示して対象を選んでもらう:

```
今の会話から、以下の未対応 Task を見つけました。

No. | 概要 | 検出根拠
----|------|--------
1   | <Task 1 概要> | <いつ・どこで言及されたか>
2   | <Task 2 概要> | <いつ・どこで言及されたか>

どれを Issue として起票しますか？
番号で指定してください (例: 1,3 または "全部" または "なし")。
```

   「なし」なら終了。10 件を超える場合はユーザーに優先度付けを依頼して絞る。
3. 承認された Task ごとに scout を **直列** で spawn する (並列 fan-out 禁止)。返却を集めてフェーズ 3 へ渡す。

起票先リポジトリが複数ありうる場合は、spawn 前にどのリポジトリかを確認する。

## フェーズ 3: 結果 relay

scout の返却 `result` (gate が `confirmed` のとき `filed`) を relay する:

| result | controller の応答 |
|----------|-----------------|
| `filed` | 「起票しました: <Issue URL>」 |
| `not_confirmed` | 「実在確認できませんでした: <evidence を 1〜2 行に要約>」 |
| `duplicate` | 「既存 Issue と重複しています: <existing_issue URL>」 |
| `needs_human_decision` | 「判断が必要です: <options を箇条書き>」→ ユーザーに選んでもらう |

handoff mode は集約表で出す:

```
No. | 概要 | result | URL / 補足
----|------|--------|----------
1   | <Task 1> | filed | <URL>
2   | <Task 2> | not_confirmed | <理由 1行>
```

## scout spawn テンプレート

```
Agent({
  subagent_type: "op-skill:scout",
  model: "sonnet",
  description: "op-report finding 調査起票: <finding タイトル 1行>",
  prompt: `
invocation_mode: op_managed

共通宣言 (invocation_mode / 質問禁止 / 必読 checklist / commits_added): `~/.claude/skills/_shared/spawn-prompt-common.md` §1〜§4 を含める。
scout はコード commit を行わないため commits_added: [] が正解 (Issue 起票は行うがコード apply はしない)。

# finding データ

title: <finding タイトル>
summary: <finding の要約 2〜3 文>
files: [<関連ファイルパス>]  # 不明な場合は空配列
severity_hint: <low / medium / high / critical — ユーザーが明示した場合のみ、不明なら省略>

# リポジトリ情報

repo_root: <git rev-parse --show-toplevel の結果>

# 指示

expert-scout/SKILL.md に従って以下を実行してください:
1. 実在確認 gate (4 値判定)
2. confirmed の場合は起票手順に従い Issue を起票
3. 構造化返却スキーマで result を返す

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
  `
})
```
