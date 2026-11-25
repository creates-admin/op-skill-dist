# 部品一覧と実物のずれ (Phase 2)

`.claude/rules/design-system.md` がある repo だけ行う (`_shared/design-system.md`「部品一覧と実物のずれ」)。

1. `op-config.yaml` の `design_system.components` (glob) と `status_marker` を読む。
2. 各部品ファイルの `status:` を読む (例: `rg -n --no-heading '<status_marker>' <components glob>`)。
3. 正本の「部品一覧」表 (部品 / status 列) と突き合わせ、(a) 一覧に無い部品、(b) 実物が無い行、(c) status の不一致を列挙する。

ずれは auto-fix しない (一覧の更新は op-component の担当)。Phase 7 の報告に載せ、項目ごとに部品 issue (`_shared/filing-gate.md` に従い
人間承認後に起票。`--auto` では起票せず報告のみ) か `/op-skill:op-component <部品名>` を案内する。
