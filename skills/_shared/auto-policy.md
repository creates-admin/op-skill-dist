<!--
schema_version: 3
last_breaking_change: 2026-05-04
notes: v3 (2026-05-04) — Invocation Mode 整合。`requires_runtime` 等の自動起票しない検出を
       expert が「対話モードに回す」のではなく `manual_review_bucket` として構造化返却するルールに変更。
       expert は質問せず、commander / OP skill が後で人間レビューに提示できる形で保持する。
       詳細は `_shared/invocation-mode.md` を参照。
       v2 (2026-05-03 第三段階) — canonical schema (expert-spawn.md) との整合修正。
       evidence_grade を `confirmed_static` から `direct` に統一 (canonical schema 側が正)。
       `affected_files` 参照を `files` に統一。schema 不整合による silent failure を解消。
       v1 (2026-05-03 初期): op-scan / op-patrol の --auto 起票条件を集約。
-->

# --auto 起票 policy (op-scan / op-patrol 共通)

/**
 * 機能概要: `--auto` モードで人手承認をスキップして自動起票してよい検出の判定基準を定義する。
 * 作成意図: op-scan フェーズ3 と op-patrol 上部に同一の 8 項目チェックが verbatim で重複していた。
 *           policy 改定時の追従漏れを防ぐため、単一の真実源として集約する。
 * 注意点: 本ドキュメントの内容を変更すると参照する全 SKILL.md に波及する。
 *         field 名は canonical schema (`_shared/expert-spawn.md`) に合わせる。
 *         破壊的変更時は schema_version を bump し、_shared/version-check.md の段階移行プロトコルに従うこと。
 */

`--auto` で **無人起票してよい** のは、以下を **すべて** 満たす検出のみ。

- `severity` = `critical` または `high`
- `evidence_grade` = `direct` (静的に観測可能 + 到達経路が示せる)
- `files` が明確 (canonical schema の `files: ["path:LINE"]` 形式で 1 件以上)
- 到達経路 (caller / 入力源) が明確
- 観測可能な被害 (data loss / crash / unauthorized access 等) が明確
- `verification_steps` が記述されている
- `success_criteria` が記述されている
- `fingerprint` が op-scan / op-patrol 双方の既存 open Issue と重複しない

`evidence_grade` = `inferred` または `requires_runtime` の検出は `--auto` では起票しない。
**`manual_review_bucket`** として保持し、OP skill / commander が後で人間レビューに回す
(下記「## manual_review_bucket」節参照)。expert 自身は質問で停止しない。

> **field 名の根拠**: canonical schema (`~/.claude/skills/_shared/expert-spawn.md`) の
> `evidence_grade` enum は `direct | inferred | requires_runtime` の 3 値に統一されている。
> 旧 `confirmed_static` 表記は schema 不整合の温床になるため、本ドキュメントから削除した。
> 同様に `affected_files` は使わず `files` に統一する (dedup-policy.md と整合)。

---

## 例外: `--from-issue` 派生 Issue

op-scan の `--from-issue` モードで生成される派生 Issue は、元 Issue が起票時点で
人間判断を経ているため severity フィルタを無効化する。ただし上記 8 項目の
**fingerprint 重複判定** は通常通り適用する (元 Issue が既存の op-scan Issue と
被っていたら派生 Issue を立てない)。

---

## manual_review_bucket

`manual_review_bucket` は **expert が対話するという意味ではない**。
`--auto` で自動起票しない検出を、OP skill / commander が後で人間レビューに提示できる形で
保持するための分類カテゴリである。

### 何を入れるか

- `evidence_grade: requires_runtime` で実行時検証が必要な検出
- `evidence_grade: inferred` で静的根拠が間接的な検出
- `confidence: low` の検出 (情報不足で断定できない)
- 既存 Issue と fingerprint 重複しないが、scope_in / scope_out の境界で判定が割れる検出

### 何を入れないか

- 静的に確定的な Critical / High (これは普通に `--auto` 起票する)
- expert が判断不能で止まったケース (これは `needs_human_decision` で構造化して返す)
- 対象外スタック (React / Go) で本来検出しない領域 (これは `ignored_noise` で捨てる)

### expert の振る舞い

expert は `manual_review_bucket` 候補を canonical schema の出力に含めて返すだけでよい。
**質問せず、判断材料を構造化して返す**。

| expert がやること | expert がやらないこと |
|------------------|--------------------|
| `evidence_grade` を正しく付ける | 「ユーザーに確認してください」と返す |
| `reproduction_hint` を埋める | 自分で gh issue create を呼ぶ |
| `assumptions[]` に前提を書く | 回答を待って停止する |
| `confidence` を `medium` に下げる | 対話モードに回そうとする |

### OP skill / commander の振る舞い

OP skill 側は `manual_review_bucket` の検出を以下のように扱う:

- `--auto` モードでは Issue 化しない (起票候補から除外)
- 対話モード (`/op-scan` 通常起動 等) では「要確認」セクションに表示し、
  ユーザーに「この検出を起票するか」を確認する
- ユーザーが起票を選んだ場合のみ `auto-report` ラベルなしで起票する
