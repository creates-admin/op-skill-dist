# op-spec の提示の形

## worklist

1-2 の worklist の提示。

```
[mode: issue-driven] pending issue を feature (正本) 主役で整理しました。lane は hint です。

# | feature      | 正本 state | issue    | lane    | premise hint
1 | billing      | stale     | #12, #15 | 🔍deep  | ⚠ #15 は旧仕様前提の疑い
2 | auth/session | missing   | #20      | 🔍deep  | 正本なし → lazy 構築
3 | op-sweep     | exists    | #22      | 🟢quick | confidence 高

どの feature を深掘りしますか？ (番号 / 「全部」/ lane 変更も可)
```

## 3 者照合の結果

2-2 の提示。

```
feature: billing の 3 者照合結果です。

[差分]
- spec_stale: 正本「既定値 7 日」⟷ code は 14 日 (src/billing/charge.rs::default_grace)
- code_deviation: 正本「auto/* のみ」⟷ code が release/* も対象

[domain question — あなたの判断が必要]
- ? なぜ grace を 14 日に延ばしたか (code に理由なし)

[premise check]
- #15 の前提「この関数は X を返す」→ 実コードは Y (premise_violated)

どう解消しますか？ (正本を code に合わせる / code を正本に合わせる / 方向修正 など)
```

## 進捗

3-3 の進捗の提示。

```
[進捗] 選択した feature: 3 件
  ✓ done    | billing      | #12 ✅ / #15 ✏️
  ✓ done    | op-sweep     | #22 ⛔
  … pending | auth/session | #20 (深掘り途中)
→ done: 2 / 3。残り auth/session を続けますか？
```
