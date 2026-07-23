# Design Philosophy (designer-expert 視点)

UI design の根底に置く、短い設計原則集。
designer-expert が迷ったときに立ち戻るための原則であり、装飾ガイドではない。

## このファイルの役割

思想 (原則の根拠) と実務チェック (現場での見方) を **1 つのリストに統合**して持つ。
各原則の本文が「根拠」、末尾の「現場チェック」行が「実装中・自己採点時に見る短い実務リスト」に対応する。

常時読み込みは不要。判断順序の核・詳細展開・優先順位・「迷ったらやらない」ルールは `agent-instructions.md` にあり、
本ファイルはそこから**根拠**を引くために存在する。

## Related references

- `reference-map.md` (Tier 1〜4 の外部リンク)
- GOV.UK Design Principles: https://www.gov.uk/guidance/government-design-principles
- Dieter Rams / Vitsœ Good Design: https://www.vitsoe.com/rw/about/good-design
- Nielsen Norman Group 10 Usability Heuristics: https://www.nngroup.com/articles/ten-usability-heuristics/
- IBM Design Language Principles: https://www.ibm.com/design/language/philosophy/principles/

---

## 設計原則

原則番号は他ファイル (`data-viz-patterns.md` 原則9 参照 / `visual-craft-tiers.md` 原則3・原則12 参照等) から
参照されるため、既存項目 1〜12 の番号は変更しない。13・14 は実務チェックのみに存在した項目を追加したもの。

### 1. デザインは装飾ではなく判断である

UI に置かれる一つひとつの要素は、ユーザーの判断負荷をどれだけ下げるかで評価される。
「きれいかどうか」ではなく「考えなくても操作できるか」が品質。

現場チェック: 色は装飾ではなく意味として使う (semantic は固定、装飾色を semantic に侵食させない)。

### 2. ユーザーの仕事から始める

画面を作る前に、誰が、何を、どの頻度で、どの失敗コストで行うかを必ず先に把握する。
タスクが見えていない UI は、どれだけ整っていても役に立たない。

現場チェック: ユーザーの主タスク・頻度・失敗コストを最初に把握する。

### 3. 明快さを美しさより先に置く

読みづらい美しさより、地味でも誤読されない明快さを選ぶ。
美しさは明快さの上にしか乗らない。

### 4. ミニマルとは、理由のないものを残さないこと

ミニマルは「白く広く空ける」ことではない。
役割を持たない要素を削り、残ったものに意味を与えることである。

### 5. 一貫性は親切である

同じ意味は同じ形で、同じ操作は同じ位置で表す。
学習コストを再支払いさせる UI は、それ自体が不親切。

現場チェック: 同じ操作は同じ component / 位置 / ラベルで表す。

### 6. 密度は仕事に合わせる

業務 UI で余白を詰めすぎても、開けすぎても usability を損なう。
「比較しやすい」「視線が迷わない」密度を、画面ごとに選ぶ。

現場チェック: 業務 UI の詰まった画面でも、行・列・余白で視線を切らせる。

### 7. 操作と状態は、考えなくても分かるようにする

「次に何ができるか」「今どういう状態か」「失敗したらどう戻れるか」を
ユーザーが推測しなくていい状態にする。

現場チェック: UI 種別に該当する state (loading / success / failure / empty / disabled / focus 等) を可視化する。
6 状態を機械的に全列挙はしない。該当しない state は `not_applicable_reason` を添えて省略する
(詳細: `_shared/pr-templates.md` の Applicable States)。

### 8. 余白は空白ではなく、構造である

余白は要素を切り離すのではなく、関係性を示すための装置である。
余白の入れ方は文章の改行と同じ意味を持つ。

### 9. データは正直に見せる

軸を切り詰める、3D で誇張する、色で印象操作する、こうした「表現で嘘をつく UI」を作らない。
data honesty を破ると、UI 全体の信頼が崩れる。

具体規則 (軸 / スケール変換 / 色 / 順序) は `data-viz-patterns.md` の「Data Honesty 規則」を正本として参照する
(本ファイルでは詳細ルールを重複保持しない)。

### 10. 好みより先にシステムを尊重する

design token / component / pattern を尊重する。
個人の趣味で system を踏み外す PR は、長期的に破壊的負債になる。

現場チェック: token / component / pattern を尊重する。既存資産を最初に探し再利用、新規追加は理由が必要。

### 11. アクセシビリティは最低品質である

contrast / focus / keyboard / 状態の多重符号化は最低条件。
「見た目を優先するから a11y を落とす」という選択は構造的に許されない。

現場チェック: accessibility を見た目と交換しない。WCAG 2.2 AA 以上を最低条件とする。

### 12. 模倣ではなく文脈に従う

Apple 風 / Material 風 / 流行のダッシュボード風に寄せない。
プロジェクトの文脈、ユーザー、業務、既存 design system の延長線上で品質を上げる。

### 13. 危険操作を保護する

削除 / 不可逆操作は確認 / Undo / 区別ある視覚で守る。

### 14. Issue 範囲外の redesign をしない

scope_in だけを直す。「ついで」が最大の罪。

---

## 迷ったときの優先順位

`agent-instructions.md` の「迷ったときの優先順位」節を正本として参照する (本ファイルでは重複保持しない)。
