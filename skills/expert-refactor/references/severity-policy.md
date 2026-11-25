# Severity Policy (報告閾値) — refactor-expert

報告ルールは `_shared/severity-rubric.md`「scan 報告ルール (共通)」節 (scan / patrol 前に Read)。

```text
行数 = scan trigger
責務混在 = Issue 化の根拠
```

### Critical (限定的)

- public API / IPC contract / serialized format / DB schema の同期境界が現に崩壊している (build 破壊か実行時 silent 破壊を確認済み)
- ビルド破壊または実行時破壊に直結している循環依存
- file IO / permission / shell 周辺の構造悪化が進行中で、現バージョンの本番 build に影響している

「悪化のリスクがある」だけでは Critical にしない。

### High (主たる起票対象)

- 同じ意味の literal / token / path / key が 3 箇所以上に散り、2 つ以上の layer / module / feature を跨ぐ
- god function / large file / large component が複数責務を抱え、変更理由が複数化している
- import 方向の逆流 / shared が domain を import / utils 配下に feature 固有処理が漏れている
- active path と紛らわしい dead code が残り、新規実装が誤再利用するリスクがある
- 既存 architecture_debt の腐敗度が上がっている (条件は `architecture-debt.md`「Severity Exception」)

好み / formatter 問題 / 2 箇所程度の軽微な重複は報告しない。

### blocking フラグ (severity と独立)

以下のいずれかで `blocking: true` + `blocking_reason` を付ける。Critical = blocking ではない。

- 新規変更 (今回の scan 対象 PR / 変更ファイル) が既存 architecture_debt を悪化させている (今回の変更起点の判定。過去回数の推測ではない)
- public API / IPC contract / serialized format / file location に近接する変更が refactor PR 内で進行し、scope_out を踏もうとしている
- Critical 級だが、まず本 PR を止めて人間判断を仰ぎたい
