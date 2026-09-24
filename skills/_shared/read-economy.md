# Read Economy 原則 (read-economy)

全 active expert と OP skill controller に適用する Read 最小化ルール。

## ルール一覧

- **R1: 既読ファイルの再 Read 禁止** — 一度 context に取り込んだ内容は再 Read しない (「念のため最新を確認」も不可)。
- **R2: Edit 後の確認 re-Read 禁止** — Edit / Write がエラーを返さなければ成功。確認が要るなら `grep` で対象行のみ。
- **R3: 必要最小範囲だけ読む** — 全文 Read を既定にしない。構造把握は `op read outline --file <file>` (シンボル一覧 + 行範囲)、特定の関数・型は `op read symbol --file <file> --symbol <name>`、それ以外は `grep` で行番号を特定して `offset` / `limit` で読む。未対応言語は warning が出るので通常の範囲 Read に切り替える。
- **R4: 未読範囲の読みは禁止しない** — 同一ファイルでも未読の関数・節を新たに読むのは可。禁止対象は既に context にある内容の再 Read のみ。
- **R5: context 参照を優先** — 既に context にある内容はツール再呼び出しなしに参照する。追跡が困難なら re-Read より `grep`。

## Controller への適用

- 既読の Issue / PR 本文・ファイルを再 Read しない (R1/R2)。
- Issue / PR は `op issue list` / `op issue view` / `op pr view` の meta (number / title / labels / state) で扱い、full body は真に必要なフェーズでのみ取得する。
- subagent の completion_report は要点に圧縮して保持する (producer 側の長さ制約は `expert-spawn.md`「修正完了報告 schema」節)。
- 読まなさすぎに退行しない: 未読ファイルの確認や gate 判定に要る fetch は省略しない (R4)。
