---
name: op-report
description: 単一 finding を隔離 context で調査・確認・起票する薄い委任スキル。「これ起票して」「たまったやつ整理して」等のキーワードで起動。finding mode (1件) と handoff mode (会話履歴から複数抽出) の 2 モード。
effort: medium
---

<!--
schema_version: 1
last_breaking_change: 2026-06-15
notes: v1 (2026-06-15): 初版。op-report = Direct Mode 固定の薄い委任スキル。
       finding / handoff 2 モード。controller が scout を 1 体 spawn して隔離 context で完遂。
       2026-07-22 ADR-0024 Phase 3 で Cloud (mcp channel) 対応 — github-channel.md (>=2) pin 追加、
       起票経路は op issue create (channel 非依存)。
-->

<!--
機能概要: 単一 finding を隔離 context で調査・実在確認・起票させ、
         controller には 1 行 relay のみ返す薄い委任スキル。
         finding mode と handoff mode の 2 用途。
作成意図: op-scan は観点別並列 audit で Critical/High を一括起票する重量スキル。
         日常的な「これが気になる」「セッション末の未対応を整理したい」には重すぎる。
         op-report は「context 隔離 × 確認 gate」の 2 点だけを保証する最薄の委任経路として設計。
         Issue #746 設計確認に基づく。
注意点: Direct Mode 固定 (OP-managed 経路なし)。
       scout は active-expert-registry 外の utility worker。
       handoff mode の Task 抽出は必ず controller (main Claude) が行う
       (scout は隔離 context で会話履歴を持たない)。
       承認なしの一括自動起票は行わない。
-->

# op-report: 単一 finding 隔離起票スキル

op-report は、単一の finding を **隔離された context** で scout worker に調査・実在確認・起票させ、
controller には 1 行の relay のみを返す薄い委任スキルである。

## 3 原則

1. **Direct Mode 固定** — `_shared/invocation-mode.md` に従い、OP-managed 経路なし
2. **context 隔離** — 調査〜起票は scout の隔離 context で完遂。controller には 1 行 relay のみ返す。main context を汚さないことが核心
3. **確認 gate** — 承認なしの一括自動起票はしない。起票前に必ずユーザーの確認を経る

---

## このスキルの位置づけ

| スキル | 起票粒度 | 主用途 |
|-------|---------|--------|
| op-scan | 複数 (Critical/High 観点別一括) | リポジトリ全体の定期 audit |
| op-patrol | 複数 (区画単位巡回) | 警備員的定期監査 |
| **op-report (本スキル)** | 1 件ずつ (確認 gate つき) | 日常的な単発起票・セッション末整理 |

### finding mode と handoff mode の違い

| | finding mode | handoff mode |
|-|-------------|-------------|
| 起動きっかけ | 「これ起票しといて」など単一の課題を指す発話 | 「たまったやつ起票して」「未対応を整理して」など複数 Task を指す発話 |
| Task 源泉 | ユーザーが口頭で渡した finding | controller が会話履歴から未対応 Task を抽出 |
| scout spawn 数 | 1 体 | 承認 Task ごとに 1 体 (直列) |

### op-scan との核心的な違い

- op-scan: severity 閾値 (Critical/High のみ) で起票対象を絞る
- op-report: severity に関係なく **実在確認 gate** (confirmed / not_confirmed / duplicate / needs_human_decision) で判断する。Low severity でも実在確認できれば起票する

---

## 参照ドキュメント

| Path | 役割 |
|------|------|
| `~/.claude/skills/_shared/invocation-mode.md` (>=1) | Direct Mode 判定 |
| `~/.claude/agents/scout.md` | worker の役割・Invocation Mode・制約 |
| `~/.claude/skills/expert-scout/SKILL.md` | 実在確認 gate 4 値・起票 6 手順・返却契約スキーマ |
| `~/.claude/skills/_shared/issue-enrichment.md` (>=1) §7.5 | lite enrichment (collision gate のみ)。scout 側が実行 |
| `~/.claude/skills/_shared/dedup-policy.md` | fingerprint 照合・dedup ポリシー |
| `~/.claude/skills/_shared/expert-spawn.md` (>=1) | needs_human_decision 正規スキーマ |
| `~/.claude/skills/_shared/github-channel.md` (>=2) | GitHub I/O channel / call-spec protocol (Cloud = mcp channel では scout が call-spec を実行する) |

---

## フェーズ 0: 環境確認

### 0-1. Invocation Mode 判定 (Direct Mode 固定)

`_shared/invocation-mode.md` に従って判定する。本スキルは **Direct Mode 固定**。
spawn prompt に `invocation_mode: op_managed` が混入していた場合は契約違反として停止し、
ユーザーに状況を報告する。

### 0-2. git / gh / op binary 確認

```bash
# git リポジトリ判定
git rev-parse --is-inside-work-tree 2>/dev/null \
  || { echo "not a git repo — op-report は既存リポジトリ上で動作します"; exit 1; }

# gh 認証 (Issue 起票に必要。mcp channel = call-spec 経路では gh 不要 — github-channel.md)
if [ "${OP_GITHUB_CHANNEL:-gh}" = "mcp" ]; then
  echo "[channel] mcp — GitHub write は call-spec 経路 (gh 認証不要)"
else
  gh auth status 2>/dev/null \
    || { echo "gh login が必要です。認証してください"; }
fi

# op binary 鮮度確認
if command -v op >/dev/null 2>&1; then
  op version --json 2>/dev/null | jq -r '"op binary: " + .version'
else
  echo "[op binary] 見つかりません (cargo install --path op-tools/crates/op で配置してください)"
fi
```

---

## フェーズ 1: mode 判定

ユーザー入力 (自然文) から mode を判定する。

### 判定ルール

| 発話パターン | 判定 mode |
|------------|----------|
| 「これ起票して」「このバグ報告して」「〇〇を Issue にして」など、単一の課題を指す | finding mode |
| 「たまったやつ起票して」「セッションの未対応を整理して」「今日気になったことまとめて」など、複数を指す | handoff mode |

### 曖昧な場合の確認

発話が単一か複数か判定できない場合は、以下の 1 問のみ確認する:

```
1 件の特定の課題を起票しますか？
それとも今の会話から未対応のものをまとめて整理しますか？
```

---

## フェーズ 2a: finding mode

### 2a-1. finding の整理と確認 gate

controller が finding を 1 行に整理し、ユーザーに確認する:

```
以下の内容で Issue を起票してよいですか？

タイトル案: <finding から生成したタイトル>
内容: <finding の要約 1〜2 文>
リポジトリ: <現在の git リポジトリ>

起票しますか？ (y/n または修正を教えてください)
```

承認された場合のみフェーズ 2a-2 へ進む。

### 2a-2. scout 1 体を spawn

承認後、scout を 1 体 spawn する (「scout spawn テンプレート」節を参照)。

### 2a-3. result 受け取り

scout の構造化返却の `result` 4 値を受け取り、フェーズ 3 へ渡す。

---

## フェーズ 2b: handoff mode

### 2b-1. 未対応 Task の抽出 (controller が行う)

**controller (main Claude) が現 context (会話履歴) から未対応 Task を抽出する。**

> 重要: scout は隔離 context で動作するため会話履歴を持たない。
> 抽出は必ず controller が行い、scout には整理済みの finding データを渡す。

抽出対象の例:

- 「後で確認する」「Issue にしておく」と言ったが未起票のもの
- バグ・気になる挙動として言及されたが対処されていないもの
- 「TODO」「後で」と明言されたもの

### 2b-2. Task リストの提示と確認 gate

抽出した Task リストをユーザーに提示し、起票対象を選んでもらう:

```
今の会話から、以下の未対応 Task を見つけました。

No. | 概要 | 検出根拠
----|------|--------
1   | <Task 1 概要> | <いつ・どこで言及されたか>
2   | <Task 2 概要> | <いつ・どこで言及されたか>
...

どれを Issue として起票しますか？
番号で指定してください (例: 1,3 または "全部" または "なし")。
```

承認なしに一括起票しない。「なし」の場合はそこで終了する。

### 2b-3. scout を直列 spawn

承認された各 Task を scout に **直列** で spawn する。

> 並列 fan-out をしない理由: 並列起票は重複起票事故のリスクがある (CLAUDE.md の bash fence convention §3 参照)。
> op-codev の順次実行と同じ思想で、1 Task = 1 scout = 直列。

各 scout の返却を収集してフェーズ 3 へ渡す。

---

## フェーズ 3: 結果 relay

### finding mode (1 件)

| result 値 | controller の応答 |
|----------|-----------------|
| `filed` | 「起票しました: <Issue URL>」 |
| `not_confirmed` | 「実在確認できませんでした: <scout の evidence を 1〜2 行に要約>」 |
| `duplicate` | 「既存 Issue と重複しています: <existing_issue URL>」 |
| `needs_human_decision` | 「判断が必要です: <options を箇条書きで提示>」 |

### handoff mode (複数件)

集約サマリ表を出力する:

```
起票結果:

No. | 概要 | result | URL / 補足
----|------|--------|----------
1   | <Task 1> | filed | <URL>
2   | <Task 2> | not_confirmed | <理由 1行>
3   | <Task 3> | duplicate | <既存 URL>
```

---

## scout spawn テンプレート

op-report controller は以下のテンプレートで scout を spawn する。

```
Agent({
  subagent_type: "op-skill:scout",
  description: "op-report finding 調査起票: <finding タイトル 1行>",
  prompt: `
invocation_mode: op_managed

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
2. confirmed の場合は起票 6 手順に従い Issue を起票
3. 構造化返却スキーマで result を返す

You must not ask interactive questions.
If information is missing, return it as assumptions[] or needs_human_decision.
  `
})
```

### 非対称についての注記

- **op-report 自身**: Direct Mode (人間起動、確認 gate あり)
- **scout**: OP-managed Mode (op-report controller から spawn、質問で停止しない)

この非対称は意図的な設計。controller は人間との対話を担い、scout は隔離 context で機械的に判断する。

### scout を subagent_type に直接渡せる根拠

scout は `active-expert-registry` に登録されていない utility worker だが、
`agents/scout.md` が存在するため spawn 対象にできる (plugin 実行時の `subagent_type` は
scoped 名 `op-skill:scout` を渡す。上記テンプレ参照)。
op-codev が `feature-expert` を直接 subagent_type に渡すのと同じ前例に準じる。

---

## decision-record

Issue #746 の設計確認に基づく確定設計:

| 決定項目 | 確定内容 |
|---------|---------|
| 形態 | 新 OP skill (op-report) + 新 worker agent (scout) |
| 隔離 | scout 1 体 spawn → 1 行返却。main context を汚さない |
| 確認 gate | 承認なしの一括自動起票なし |
| enrichment | lite (collision gate = dedup のみ。scout 側が実行) |
| registry | scout は active-expert-registry 非追加 (utility worker) |
| ADR | なし (op-codev 新設と同じ前例、設計シンプルで ADR 不要) |

### handoff mode の追加決定

| 決定項目 | 確定内容 |
|---------|---------|
| 入力源 | 会話履歴 by controller (scout は隔離 context で履歴を持たない) |
| Task 分解 | 1 Task = 1 Issue (個別化) |
| 起動 | 自然文による mode 判定 (finding / handoff) |
| 確認 gate | Task リスト提示 → ユーザーが対象を選択 |
| scout 隔離 | handoff mode でも維持 (直列 spawn) |

---

## Direct Mode 固定の制約

本スキルは人間が直接起動することを前提とする。OP-managed 経路は存在しない。

禁止事項:

- OP-managed 経路での起動 (契約違反として停止)
- 承認なしの一括自動起票
- 並列 fan-out での scout spawn (直列のみ)
- scout への design plan 生成・cross-review 依頼 (lite enrichment = collision gate のみ)

---

## 設計判断グレーゾーン

本スキルは Direct Mode 固定のため、不明点はユーザーに確認してよい。

| グレー内容 | 対応 |
|----------|------|
| finding が 1 件か複数か曖昧 | フェーズ 1 の確認 1 問を実施 |
| finding の内容が不明瞭 | 整理案を提示してユーザーに確認 |
| リポジトリが複数ある | どのリポジトリに起票するかを確認 |
| scout が needs_human_decision を返した | options を提示してユーザーに選択を委ねる |
| handoff で抽出した Task が多すぎる (10 件超) | ユーザーに優先度付けを依頼し上位 N 件に絞る |
