# Doc Refactor Guard (canonical doc の圧縮・再構成時の安全ガード)

<!--
機能概要: `skills/**/*.md` / `docs/**` / `agents/*.md` など canonical doc (instructional prose) を
         圧縮・再構成する refactor 専用の安全ガード。prose 論理保存 4 点チェックと
         inbound-ref grep のスコープ拡張ルールを集約する。
作成意図: SKILL.md 本文にあった「Doc 圧縮・再構成時の安全ガード」節を、狭いユースケース専用
         ガードとして references へ移設した (ADR-0030 決定 1 / B0-2 §3)。SKILL.md 本文からは
         apply モード節の誘導文 1 点で到達する。文言は移設前と同一 (論理を変えない)。
注意点: 本ガードは canonical doc を編集する refactor でのみ必須。コードの refactor では
       通常の Mechanical Refactor Guard (SKILL.md 本文) が適用される。
       節番号 renumber より stable anchor の維持を優先する原則は本ファイルが正本。
-->

<!-- anchor: prose-logic-preservation -->

## prose 論理保存ガード

否定・列挙・閾値・条件分岐を含む命令文 (instructional prose) を圧縮・言い換えする場合は、
**圧縮前後で論理が一致することを canonical ソース / 同一ファイルの未変更箇所と照合してから commit する**。
確認する 4 点:

- 否定表現 (`しない` / `ではない` / `以外`) が残っているか、正否が反転していないか
- 列挙の「全件」が保存されているか (途中省略による意味変更がないか)
- 閾値・数値 (`>=3` / `100 LOC` 等) が変わっていないか
- 条件分岐の「〜のとき」と「〜以外のとき」が入れ替わっていないか

(「圧縮するな」ではなく「圧縮しても**論理を保て**」が原則)

<!-- anchor: inbound-ref-grep -->

## inbound-ref grep スコープ拡張ガード

節番号・anchor (HTML id)・見出し文字列・ファイルパスを変更・削除する前に、
**repo 全体** (op-tools/ コードコメント・docs/specs・他 skill・agents/ 含む) を対象に、
`grep -rn "§7\|section-7\|#7" . --include="*.md" --include="*.rs" --include="*.ts" --include="*.js"`
(例: §7 番号変更前の全 repo 確認) のように grep し、
検出した **全 inbound 参照を同 PR で追従更新する**。

- `files_allowed` 外ファイルで参照が見つかった場合は **全件を `blocked_actions[]` に網羅列挙**する
  (自己申告の取りこぼし禁止。「把握した 2 件のみ列挙」は不可)
- 節番号 renumber より **stable anchor の維持を優先**する
  (`<!-- anchor: section-name -->` 等で番号に依存しない参照先を確立すると drift が起きにくい)
