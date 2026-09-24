# Risk and Rollback — リスク分類と撤退条件

統計判定 (clear / marginal / none / unstable) の式と閾値は `benchmark-protocol.md`「統計的有意性の判定」節、判定後の decision 分岐は SKILL.md「5. Decide」が正本。

## リスクレベル

| Level | 例 | apply 単独 |
|---|---|---|
| low | index 追加 / repeated parse 削減 / `with_capacity` / regex compile 位置変更 / 明らかな N+1 削減 / 既存 API での batch 化 | 可 |
| medium | データ構造変更 (Vec → HashMap、全 lookup 経路の更新が要る) / bounded cache 追加 / 順序を collect で維持する並列化 / streaming 化 / lazy load | 可 (small・medium・large 全規模で Before/After) |
| high | アルゴリズム全面変更 (出力が微妙に変わりうる) / 処理順序変更 / 同期 → async 化 (呼び出し側へ波及、error 伝播が変わる) / 複雑な cache invalidation / 浮動小数点 reduce 順序変更 / worker pool 導入 / unsafe / shared state を伴う並列化 | 不可 → `escalated` |

low の目安: 挙動・出力・順序・I/F が不変、1 ファイル / 1 関数で完結、既存テストで互換性を確認でき、改善が clear に出る。

---

## 撤退条件

いずれかに該当したら変更を取り下げる (`reverted`) か、エスカレーションする。

1. 改善が誤差内 (none) → `reverted`
2. ベンチ不安定 (unstable) → revert して `deferred`。ノイズ削減・入力規模拡大で再計測するか、ベンチ条件改善を remaining_issues に挙げる
3. テスト fixture / 期待値の更新が必要だが、何が正しいか判断できない → `reverted`。仕様確認を remaining_issues に挙げる (test-expert 向け)
4. 入出力互換を証明できない — 出力の順序・値・フォーマット差分 / empty・null・巨大入力の挙動変化 / 例外型・エラーメッセージ変化 / panic と Result の境界変化 → `reverted`
5. 可読性劣化に見合わない — borrow 地獄 / ネストが既定値 (2 階層) 超過 / 1 関数 100 行超 / 「なぜ速いか」の長文コメントが要る / unsafe・SIMD intrinsics・inline asm → `reverted`
6. 並列化で順序・決定性・エラー集約が変わる — 結果順序が不定 / 浮動小数点 reduce の差分 / エラー順序の仕様違反 / 「最初の 1 件で停止」が「全件処理後に集約」に変わる → `reverted`、sequential のまま、または仕様確認を remaining_issues へ
7. lock / channel / shared state が増えデッドロックリスク — lock 順序が未定義の `Mutex` 新設 / bounded か unbounded か曖昧な channel / shutdown 経路のない worker pool → `reverted`
8. high risk 変更が必要と判明 → `escalated`

同一問題で 2 回連続失敗したらアプローチを根本から変える (撤退して再設計)。

## エスカレーション / 撤退の返し方

OP-managed Mode では Issue コメントを書かず、完了報告の `decision` / `decision_rationale` / `baseline` / `after` / `remaining_issues` と
`needs_human_decision` / `assumptions[]` に構造化する。`escalated` では bottleneck 概要・提案する high risk 方針・リスク内容・low/medium で済む代替案を書く。
Direct Mode では同じ内容を人間向けに提示する。
