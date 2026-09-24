# op-loop relay-protocol: --relay (工程内 relay)

`--relay` 指定時のみ適用する追加配線。層内 CO の checkpoint を controller が受け、ユーザー判断を CO に戻す。
CO の入力契約・フェーズ本体は変えず、報告チャネル契約と controller 側の監視だけを足す。

## 機構

層内 CO は subagent のため `AskUserQuestion` を持たない。ユーザーへの到達は controller 経由のみ:

```
CO ─① SendMessage(to: main)→ controller ─② AskUserQuestion→ ユーザー ─③ 選択→ controller ─④ SendMessage(to: CO の agentId)→ CO (context 保持のまま続行)
```

## 3 本柱

### 柱1. idle 検知 + nudge

④ の送信後に CO が再開しないことがある。controller は CO の応答 (次の `SendMessage(to: main)` / idle 通知) を監視し、
10 分応答が無ければ nudge する:

- 送り先は同一 agentId (新規 spawn しない。context が失われる)
- 文面例: 「先ほどの選択 (`<ユーザー選択の要約>`) を反映して続行してください。応答が確認できていません (nudge)。」
- 上限は 2 回。超えたら下記「手動 fallback」へ

### 柱2. 報告契約 (CO spawn prompt に追加)

background の CO の return は main に自動配送されないため、以下を CO の spawn prompt に追加する:

```text
【relay 報告契約 (op-loop --relay 時の追加契約)】
- あなた (層内 CO) の checkpoint・判断点は SendMessage(to: main) で controller に報告してください
  (完了時の ClusterSummary は通常どおり最終メッセージで返し、同じ内容を SendMessage でも送る)。
- 報告には以下を含めてください:
    - phase: どの工程段階か (apply / verify / review / done / needs_decision など)
    - summary: 1〜3 文の terse な要約 (raw diff / 全文 finding は送らない)
    - decision_needed: ユーザー判断が要る場合のみ、選択肢 + 推奨を構造化
- controller から SendMessage で指示が返ったら、その内容を反映して同じ context のまま続行してください。
- You must not ask interactive questions directly (AskUserQuestion は持っていません)。
  ユーザー判断が要るときは上記 decision_needed を SendMessage(to: main) に載せて controller に委ねてください。
```

### 柱3. 能動 poll

`SendMessage` は同期保証がなく stall しうる。controller は受動的に待たず、idle 通知を「checkpoint 到達 or stall」の両面で解釈し、
未処理の relay があれば nudge する。idle / nudge 回数のカウンタを持ち、進展が無ければ手動 fallback に倒す。

## 手動 fallback

relay が回復しない場合は relay を中断し、既定の層間 gate に戻す (CO の実装は止めない):

```text
## --relay 監督が応答しません (手動 fallback)

層 <i> の CO (<CO_AGENT_ID>) が relay に応答していません (nudge <N> 回試行)。
relay 監督を中断し、層間 gate (既定の監督) に切り替えます。

- この層の CO は background で実行継続している可能性があります。
- 層完了 (ClusterSummary 返却) を待ってフェーズ 3 (層間 gate) で結果を確認します。
- relay を再試行する場合は、CO の状態を確認してから指示してください。
```
