# --auto 起票 policy (op-scan / op-patrol 共通)

`--auto` で無人起票してよいのは、以下 8 条件を**すべて**満たす検出のみ。
field 名は canonical schema (`_shared/expert-spawn.md`) に従う。
#1〜#7 は `op scan eligibility`、#8 は `op scan dedup` が評価する。

| # | 条件 |
|---|---|
| #1 | `severity` = `critical` または `high` |
| #2 | `evidence_grade` = `direct` (静的に観測可能 + 到達経路が示せる) |
| #3 | `files` が明確 (`files: ["path:LINE"]` 形式で 1 件以上) |
| #4 | 到達経路 (caller / 入力源) が明確 |
| #5 | 観測可能な被害 (data loss / crash / unauthorized access 等) が明確 |
| #6 | `verification_steps` が記述されている |
| #7 | `success_criteria` が記述されている |
| #8 | `fingerprint` が op-scan / op-patrol 双方の既存 open Issue と重複しない (`_shared/dedup-policy.md`) |

#2 を満たさない (`inferred` / `requires_runtime`) 検出は起票せず `manual_review_bucket` に保持する。expert は質問で停止しない。

---

## 例外: `--from-issue` 派生 Issue

op-scan `--from-issue` の派生 Issue は元 Issue が人間判断を経ているため severity フィルタを無効化する。
#8 (fingerprint 重複判定) は通常通り適用する。

---

## manual_review_bucket

`--auto` で自動起票しない検出を、OP skill / commander が後で人間レビューに提示するための分類。expert が対話する意味ではない。

### 何を入れるか

- `evidence_grade: requires_runtime` (実行時検証が必要)
- `evidence_grade: inferred` (静的根拠が間接的)
- `confidence: low` (情報不足で断定できない)
- 既存 Issue と重複しないが、scope_in / scope_out の境界で判定が割れる検出

### 何を入れないか

- 静的に確定的な Critical / High (`--auto` 起票する)
- expert が判断不能で止まったケース (`needs_human_decision` で返す。`_shared/invocation-mode.md`)
- 対象外スタックで本来検出しない領域 (`ignored_noise` で捨てる)

### expert の振る舞い

候補を canonical schema の出力に含めて返すだけ。`evidence_grade` / `reproduction_hint` / `assumptions[]` / `confidence` を埋める。
質問・起票・停止はしない。

### OP skill / commander の振る舞い

- `--auto` モードでは Issue 化しない
- 対話モードでは「要確認」セクションに表示し、起票するかユーザーに確認する
- ユーザーが起票を選んだ場合のみ `auto-report` ラベルなしで起票する
