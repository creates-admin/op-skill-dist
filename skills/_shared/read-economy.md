<!--
schema_version: 1
last_breaking_change: 2026-05-24
notes: 初版。ADR-0004 (Read Economy) の Stage 1 として、agent が context に持ち込む
       Read payload コストを最小化するルールを _shared/ 正本に確定。
       各 expert SKILL.md は本ファイルへの 1 行 pointer のみを持ち、内容を複製しない
       (Single Canonical Source Rule)。
-->

<!--
機能概要: OP system の agent / controller が context に持ち込む Read payload コストを最小化する
         運用ルールの正本。「Read Economy 原則」を expert 全員の共通契約として定義する。
作成意図: transcript JSONL 実測 (2026-05-23, n=3 feature/3 review, 全 13 agentType) で、
         同一ファイルの再 read が全 agent で 60〜66% に達し、Read 居座りがトークンコストの
         大半を占めると判明した (ADR-0004)。「grep→CLI 化」仮説は実測で否定され (節約天井 <10%)、
         脂肪の本丸が Read の無駄であることが確定。ADR-0004 Stage 1 として本ファイルに正本化する。
注意点: 本ファイルは運用ルールの正本。実測データ詳細は memory に、決定の背景は ADR-0004 に。
        legitimate な別範囲読み (同一ファイルの未読領域を初めて読む) は禁止しない。
        禁止対象は「既に context にある内容の再 Read」のみ。
        破壊的変更時は schema_version を bump し、参照する全 SKILL.md の (>=N) 表記を更新する。
-->

# Read Economy 原則 (read-economy)

## 目的

agent / controller が context に持ち込む Read payload を最小化し、トークンコストの本丸である
「同一ファイルの再 Read 居座り」を構造的に防ぐ。

---

## ルール一覧

### R1: 既読ファイルの再 Read 禁止

一度 context に取り込んだファイルは再 Read しない。

- harness は「読み直し不要」を既に通知している。その通知に従う。
- 「変更したか確認するため」「念のため最新状態を確認するため」の re-Read も禁止。
- Edit / Write ツールはエラー時のみ失敗を返す。成功時に re-Read して確認する必要はない。

**違反例**: ファイルを Read → Edit → 同じファイルを再度 Read して確認
**正解**: Read → Edit (Edit が失敗しなければ成功。re-Read 不要)

### R2: Edit 後の確認 re-Read 禁止

Edit / Write 後に「書けたか確認」目的で同じファイルを再 Read しない。

- ツールがエラーを返さなかった = 変更成功。確認 re-Read はトークンの純粋な無駄。
- どうしても確認が必要な場合は `grep` で対象行のみを検索する (全文 Read ではなく)。

### R3: 読むときは必要最小範囲に絞る

初回読み込みであっても、必要な範囲のみ読む。

- `offset` / `limit` パラメータを活用し、全文 Read を既定にしない。
- 大ファイルを全文 Read するのは「全文が必要と分かっている」場合のみ。
- まず `grep` で行番号を特定し、前後 N 行だけ Read するパターンを優先する。

### R4: legitimate な別範囲読みは禁止しない

同一ファイルの **未読範囲** を必要に応じて読むことは legitimate であり、本ルールは禁止しない。

- 例: 関数 A を読んだ後、同じファイルの関数 B を別途 Read する → 許可
- 禁止するのは「既に context にある内容をもう一度 Read する」ことのみ。

### R5: context 参照を優先する

既に context に入っているファイル内容は、ツール再呼び出しなしに context から参照する。

- 直前のターンで Read したファイルは、そのターン内では再 Read しない。
- 長い会話で「どのファイルを読んだか」の追跡が困難な場合は、re-Read より `grep` で必要情報を取得する。

---

## 適用対象

全 active expert (9 体) および OP skill controller に適用する。

| 対象 | 適用ルール |
|------|-----------|
| 全 expert SKILL.md | R1〜R5 |
| op-* skill controller | R1〜R5 (特に R1 / R2 が controller の Read 居座り 52% に効く) |

---

## Controller への適用

<!--
作成意図: OP skill の controller (司令官) は subagent と並んで Read 居座りの主犯であり
         (controller の総コスト占有率 58%)、R1〜R5 を controller 層にも明示配線する。
         R1〜R5 の本文定義は上記ルール節が正本であり、本節はそれを controller 文脈に
         適用する際の運用注意のみを記す (定義を複製しない)。
-->

OP skill の controller は subagent と同等に Read 居座りの主犯となる
(controller の総コスト占有率は 58%、subagent 全体 42% より大)。上記 R1〜R5 を
controller にも適用し、以下の運用注意を守る。R1〜R5 の本文定義は本ファイル上部の
ルール節が正本であり、本節では定義を繰り返さない。

### 既読の Issue / PR / file を再 Read しない (R1 を controller に適用)

- 一度 context に取り込んだ Issue 本文 / PR 本文 / ファイル内容を controller が再 Read しない。
  並列フェーズ間で「最新状態を念のため確認」目的の re-Read もしない (R1 / R2 と同じ)。
- 未読範囲の必要な確認は引き続き許可される (R4)。禁止対象は「既に context にある内容の再 Read」のみ。

### Issue / PR body は meta / list で取得し、全文 body を context に居座らせない

- Issue / PR の本文は `op issue list` / `op issue view` / `op pr view` の **meta / list** で取得し、
  full body を何百ターンも context に居座らせない。
- routing / 進捗管理に必要なのは number / title / labels / state などの meta であることが多い。
  full body が真に必要なフェーズに限って取得し、取得後も再 Read しない (R1)。

### subagent の completion_report は圧縮して取り込む (consumer 側規律)

- controller は subagent の completion_report を取り込む際、自由記述 (summary 系 / assumptions /
  notes 等) を要点に圧縮して context に保持し、冗長な全文を居座らせない。
- completion_report の **producer 側 schema 制約 (各フィールドの最大長目安 / 圧縮ルール)** は
  `expert-spawn.md` の「修正完了報告 schema」節 (圧縮ルール subsection) が正本。
  本節は consumer 側 (controller が取り込む側) の規律のみを定義し、schema 制約を複製しない。

### R4 を controller にも適用 (読まなさすぎへの退行を避ける)

- legitimate な別範囲読み (まだ context に無い file の必要な確認) は controller でも禁止しない (R4)。
- 「再 Read を避ける」を過剰適用して、必要な検証 (未読 file の確認 / gate 判定に要る fetch) まで
  飛ばす「読まなさすぎ」の退行を避ける。禁止対象はあくまで既読内容の再 Read であって、
  必要な初回 Read ではない。

---

## 根拠となる実測データ

| 指標 | 実測値 (2026-05-23) |
|------|-------------------|
| 同一ファイル再 read 率 | 全 agent で 60〜66% |
| Read 居座り重み付け | 全 agentType で 73〜93% |
| controller の総コスト占有率 | 58% (subagent 全体 42% より大) |
| grep 節約天井 (op CLI 化の比較対象) | 各層 5〜25% (本丸ではない) |

詳細は memory `project_subagent_token_profiling_20260523` / `reference_op_profile_transcript_schema` と
`docs/adr/0004-read-economy.md` (ADR-0004) を参照。

---

## 関連 Issue / Stage

| Stage | Issue | 内容 |
|-------|-------|------|
| S0 | #502 | op profile CLI 化 (計測基盤) |
| **S1** | **#503** | **本ファイル (再 read 抑制正本化)** |
| S2 | #504 | expert-review 範囲読み徹底 + completion_report 簡潔化 |
| S3 | #505 | 構造抽出 primitive |

---

## 参照

- 設計決定: `docs/adr/0004-read-economy.md` (ADR-0004)
- 実測詳細: memory `project_subagent_token_profiling_20260523`
- JSONL スキーマ / 検証スクリプト: memory `reference_op_profile_transcript_schema` + `memory/profiling-scripts/`
