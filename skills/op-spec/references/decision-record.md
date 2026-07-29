<!--
schema_version: 1
last_breaking_change: 2026-07-29
notes: v1 (2026-07-29, Wave B1 / ADR-0029 決定2): op-spec/SKILL.md「decision-record」節の決定項目表を
       物理切り出し (設計 rationale 付録、条件3「順序が重要」不成立)。「不変則7 例外宣言」小節は
       CLAUDE.md 不変則7 に対する例外宣言の本体であり、本文からの直接参照 (CLAUDE.md 側 pointer 含む)
       を保つため本文側に残置し、ここには含めない (task 指示: 「不変則7 例外宣言は本文残留・内容不変」)。
       切り出し前後で内容 byte-identical (移動であって書き換えではない)。
-->

<!--
機能概要: op-spec (ADR-0017 W1b で起こし、W2/W5 で full 化) の設計決定を項目別に集約した rationale 表。
作成意図: SKILL.md 本文を「毎回・必ず・順序が重要」な主経路に絞るための progressive disclosure
         (ADR-0029 決定2、Wave B1)。決定項目表は実行手順ではなく設計判断の記録 (付録) であり、
         毎回参照する必要はない。
注意点: いつ読むか = op-spec の設計意図・経緯を確認したい時 (実装や運用のたびには読まなくてよい)。
       不変則7 例外宣言 (人間 align / 捏造禁止) は本文 (SKILL.md 末尾) に残っている。
       CLAUDE.md や labels-and-markers.md 等の外部参照は「不変則7 例外宣言」節を指しており、
       それらのリンク先は本文のまま (ここには無い)。
-->

# op-spec: decision-record

ADR-0017 W1b で起こし、W2 で full 化した設計:

| 決定項目 | 確定内容 |
|---------|---------|
| 形態 | 新 OP skill (op-spec) + active 化した worker (spec-expert) + 教科書 (expert-spec) |
| mode | Direct Mode 固定 (OP-managed 経路なし)。正本 write は人間判断を伴うため |
| worklist | feature 主役で構造化 (元症状の正攻法)。entry mode = issue-driven (既定) / feature-driven / drift-driven + quick/deep lane hint (W2) |
| 深掘り | spec-expert を isolated context で spawn (3 者照合)。複数 feature を順に深掘り (W2)。Explore 型は使わない (rules を skip、ADR-0017 F3) |
| lazy 構築 | 正本 missing なら深掘りしながら code から構築 (demand-driven、捏造禁止 — 冒頭の宣言に従う) |
| linkage | A (正本 ⟷ 正本 cross-feature [[]]) + B (issue ⟷ 正本 双方向ポインタ、W2) |
| ripple-check | 決定/不変則 update 時に依存元正本を grep で拾い波及を提示、望めば worklist へ積む (W2) |
| 記録 | 正本 write (align 済みのみ) + issue verdict (4 本) + derived issue 発行 (3-1b、W5) + 複数 feature 進捗/done |
| スコープ | W2 で full 化済 (worklist 全モード + linkage A/B + ripple-check + 複数 feature)。W5 で derived issue 発行 (3-1b: align gate + fingerprint dedup + full enrichment + op issue create + back-link) を追加。索引自動生成 / broken-link 検出 / back-link 自動保持は W3 (op-spec-patrol) |
