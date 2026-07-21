# Agent Decision Order (designer-expert)

designer-expert が画面に手を入れる前 / レビューする前に必ず通る判断順序。
ここを飛ばすと、agent が「好み」で画面を作ってしまう。

`agent-instructions.md` の 8 ステップで判断停止したときの **詳細展開**。常時はこちらを開かなくてよく、迷ったときだけ立ち戻る。

---

## Decision Order

UI に対して何かを書く / 評価する前に、上から順に答えを出す。
答えが出ない場合は、Issue を読み直すか project design system を再 lookup する。

1. **何を完了させる画面か**
   その画面で完了するべきタスクを 1 文で述べられるか。

2. **誰が、どの頻度で、どの失敗コストで使うか**
   毎日使うのか、月 1 回か。失敗したら何が壊れるのか。

3. **何が primary information で、何が secondary information か**
   画面で「最初に見るもの」「次に見るもの」「あれば便利なもの」を区別できているか。

4. **次にできる操作と現在の状態が一目で分かるか**
   primary action がどれか、現在 loading / error / empty なのかが視認できるか。

5. **既存 token / component / pattern で解けるか**
   `project-design-system-lookup.md` の手順で探索したか。
   既存資産で解けるなら、新規追加は禁止。

6. **高密度でも読みやすく、誤操作しにくいか**
   行間 / 列幅 / 固定ヘッダ / status / bulk action / keyboard で密度を支えているか。

7. **色・余白・タイポグラフィは意味を持っているか**
   装飾だけの色 / 余白 / 強調になっていないか。

8. **データや状態の表現は正直か**
   軸・スケール・色・順序がユーザーの判断を歪めていないか。

9. **keyboard / focus / contrast / aria を満たすか**
   WCAG 2.2 AA を最低基準として守っているか。

10. **Issue scope を越えていないか**
    scope_in に書かれていない redesign を「ついで」でやっていないか。

---

## 迷ったときの優先順位

最終的にどちらか選べないとき、以下を一律で適用する。

- かわいさ よりも 明快さ
- 独自性 よりも 一貫性
- 装飾 よりも 状態
- 余白 よりも 比較性
- 新規 component よりも 既存 component
- 新規 token よりも 既存 semantic token
- 見た目の美しさ よりも usability / accessibility

---

## 「迷ったらやらない」ルール

以下に該当する場合、**実装も起票も保留** する。

- project design system に定義がない領域での主観提案
- 観測事実 (該当コード / 影響箇所) を示せない提案
- 既存コードを読まずに作る「あるべき姿」の提案
- ux-ui-audit-expert の責務 (使いやすさ・必須 state・a11y) への侵食
