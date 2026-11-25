# op-verify `--grow` の手順

1. 候補を集める。
   - gap: `--from` の JSON の `gaps[]`、`--pr <N>` なら `op review state pull --pr <N>` の `post_checks["verify-runner"].gaps`、
     どちらも無ければこの会話の通常モードの完了報告の `gaps[]`
   - regression spec 昇格候補: `--from` の JSON かこの会話の通常モードの完了報告の `scenarios[]` のうち、人間が繰り返し確かめたいと言うもの
     (契約 §6: 昇格は人間の承認を経たものだけ。網羅的な spec スイートは作らない)。
     op-review-state の記録には `scenarios[]` が残らないため、`--pr` で起動してこの会話に通常モードの報告も無いときは gap だけを候補にする
2. 提示して選んでもらう:

   ```
   ## op-verify --grow 候補

   | id | 種別 | 工程 / シナリオ | 手作業で補ったこと | ハーネスに足すこと |
   |---|---|---|---|---|
   | G1 | gap | ... | ... | ... |
   | S1 | spec | ... | - | regression spec に昇格 |
   | V1 | skill | - | - | verify SKILL.md をひな形から作る |

   どれを還元しますか?  1. すべて  2. id を選択 (例: G1, S1)  3. キャンセル
   ```

   V1 は `.claude/skills/verify/SKILL.md` が無く、`verify_harness` に start / stop / smoke があるときだけ載せる。

3. apply: `references/init.md`「手順」の 3〜4 と同じ手順 (`<skill_dir>` の解決は同「テンプレート」) (task-prefix `verify-grow`、フェーズ名 verify-grow-apply、model は Sonnet = §5.3 の `extension`)。
   指示書は選ばれた候補の JSON。触ってよいものはハーネスのファイル・op-config.yaml の verify_harness 節・regression spec
   (既存 E2E の置き場所に置き、start 済みの run に対して通ることを確かめる)・`.claude/skills/verify/SKILL.md`。
   verify SKILL.md には、昇格した spec を「繰り返し確かめる流れ」に実行コマンドで足し、ハーネスへ還元した gap を「手作業で補う工程」から消す
   (還元できず手作業のまま残す gap はそこに足す)。V1 が選ばれたらひな形から作る。verify SKILL.md が無く V1 も選ばれていなければ触らない。
   conformance が exit 0 であることと、`references/init.md`「手順」の 4 の verify SKILL.md の確認は同じく必須。
4. PR: タイトルは `verify(grow): <要約>`。
