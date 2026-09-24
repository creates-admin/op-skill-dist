# --auto 起票 policy (op-scan / op-patrol / op-doctor 共通)

`--auto` で無人起票してよいのは、以下 8 条件をすべて満たす検出のみ。
field 名は canonical schema (`_shared/expert-spawn.md`) に従う。
#1〜#7 は `op scan eligibility`、#8 は `op scan dedup` が評価する。

| # | 条件 | CLI が見る field |
|---|---|---|
| #1 | `severity` = `critical` または `high` | `severity` |
| #2 | `evidence_grade` = `direct` (静的に観測可能 + 到達経路が示せる) | `evidence_grade` |
| #3 | `files` が明確 (`files: ["path:LINE"]` 形式で 1 件以上) | `files` |
| #4 | 到達経路 (caller / 入力源) が明確 | `severity_reason` |
| #5 | 観測可能な被害 (data loss / crash / unauthorized access 等) が明確 | `summary` / `severity_reason` |
| #6 | `verification_steps` が記述されている | `verification_steps` |
| #7 | `success_criteria` が記述されている | `success_criteria` |
| #8 | `fingerprint` が op-scan / op-patrol 双方の既存 open Issue と重複しない (`_shared/dedup-policy.md`) | `fingerprint` |

#2 を満たさない (`inferred` / `requires_runtime`) 検出は起票せず `manual_review_bucket` に保持する。

## 例外: `--from-issue` 派生 Issue

op-scan `--from-issue` の派生 Issue は元 Issue が人間判断を経ているため severity フィルタを無効化する。
#8 (fingerprint 重複判定) は通常通り適用する。

## manual_review_bucket

`--auto` で自動起票しない検出を、OP skill / commander が後で人間レビューに提示するための分類。

入れるもの:

- `evidence_grade: requires_runtime` / `inferred`
- `confidence: low` (情報不足で断定できない)
- 既存 Issue と重複しないが、scope_in / scope_out の境界で判定が割れる検出

`needs_human_decision` で返すものと、対象外スタックの `ignored_noise` は入れない。

expert は候補を canonical schema の出力に含めて返すだけ (`evidence_grade` / `reproduction_hint` / `assumptions[]` / `confidence` を埋める)。

OP skill / commander は、`--auto` では Issue 化せず、対話モードでは「要確認」として提示し、ユーザーが選んだ場合のみ
`auto-report` ラベルなしで起票する。
