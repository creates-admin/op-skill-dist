# Doc Refactor Guard (canonical doc の圧縮・再構成時の安全ガード)

`skills/**/*.md` / `docs/**` / `agents/*.md` など canonical doc (instructional prose) を圧縮・再構成する refactor でのみ適用する。
コードの refactor は SKILL.md の Mechanical Refactor Guard。

## prose 論理保存ガード

否定・列挙・閾値・条件分岐を含む命令文を圧縮・言い換えする場合は、圧縮前後で論理が一致することを canonical ソース / 同一ファイルの未変更箇所と照合してから commit する。

- 否定表現 (`しない` / `ではない` / `以外`) が残り、正否が反転していない
- 列挙の全件が保存されている
- 閾値・数値 (`>=3` / `100 LOC` 等) が変わっていない
- 条件分岐の「〜のとき」と「〜以外のとき」が入れ替わっていない

## inbound-ref grep スコープ拡張ガード

節番号・見出し文字列・ファイルパスを変更・削除する前に、repo 全体 (op-tools/ コードコメント・docs/specs・他 skill・agents/ 含む) を grep し、
検出した inbound 参照を同 PR で追従更新する。

```bash
grep -rn "<旧見出し>\|<旧ファイル名>" . --include="*.md" --include="*.rs" --include="*.ts" --include="*.js"
```

- `files_allowed` 外で参照が見つかった場合は全件を `blocked_actions[]` に列挙する (取りこぼし禁止)
- 他ファイルから見出し名で参照されている見出しは変えない。変えるなら参照元を同じ PR で直す
