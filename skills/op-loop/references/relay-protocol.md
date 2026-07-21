<!--
機能概要: op-loop の `--relay` (工程内 relay、既定 OFF) の hardened protocol 詳細。
         層内 CO subagent の途中経過まで controller が細粒度監督するための belt-and-suspenders 3 本柱
         (idle 検知 + nudge retry / 「結果は必ず SendMessage(to:main)」契約 / mailbox stall 能動 poll) と
         cost / 既定 OFF の根拠を集約する。
作成意図: op-loop の既定監督深度は層間 gate のみ (薄い relay)。--relay opt-in は op-codev 的な
         細粒度監督を op-loop の層内に持ち込むためのもの。SKILL.md 本体を薄く保つため (Single Canonical
         Source Rule)、長くなる具体手順 (idle 検知ロジック / nudge 文 / CO への契約文) を本 references に切り出す。
         SKILL.md の --relay 節からは要点 + 本ファイルへの pointer のみ。
注意点: relay の機構は experimental な SendMessage / agent-teams に依存し mailbox stall の footgun を持つ
        (ADR-0019 Consequences)。3 本柱を controller の第一級機構にしないと静かに stall する
        (relay PoC 実測。memory: reference_subagent_skill_relay_mechanics / project_op_run_batch_755_762_20260620)。
        本ファイルは op-loop 固有の relay 配線のみを書き、CO directives (cluster-orchestrator-directives.md) や
        op-run の clustering / Stage 2 / CO spawn 手順は改変しない (ADR-0019 D5 純 composition 厳守)。
-->

<!-- op-domain: feature -->
<!-- op-source: op-run -->

# op-loop relay-protocol: --relay (工程内 relay) の hardened protocol

op-loop の `--relay` フラグ (opt-in、既定 OFF) で有効化する **工程内 relay = 層内 CO subagent の
途中経過まで controller が細粒度に監督する** ための protocol を定める。

`--relay` を渡さない既定の op-loop は **層間 gate のみ** で監督する (薄い controller、terse relay)。
本ファイルは `--relay` opt-in 時にだけ適用する追加配線であり、SKILL.md フェーズ2 (層内 CO 撒き本体) の
手順そのものは一切変えない。relay は層内 CO への **「追加契約」** として配線する (CO directives の改変ではない)。

---

## relay の位置づけ (op-loop 文脈)

| 監督深度 | 何が起きるか | 既定 |
|---|---|---|
| **層間 gate のみ (既定)** | controller は層境界 (フェーズ 3) でしか介入しない。層内 CO は op-run と同じく自律実行し、controller は層完了 summary を terse に受けるだけ | **ON (既定)** |
| **工程内 relay (`--relay`)** | 層内 CO の checkpoint / 途中経過まで controller が relay で受け取り、ユーザー判断を CO に戻す (op-codev 的細粒度監督を層内に持ち込む) | OFF (opt-in) |

### relay の機構 (なぜ controller 経由 relay 一択か)

層内 CO は **subagent** であり、`AskUserQuestion` / `EnterPlanMode` 等 UI 依存ツールを **剥奪される**
(memory: reference_subagent_skill_relay_mechanics)。よってユーザーへの到達は controller 経由 relay 一択:

```
層内 CO subagent
   │  ① SendMessage(to:main)        ← CO が checkpoint / 判断点で controller へ報告
   ▼
controller (main 会話)
   │  ② AskUserQuestion             ← controller だけが呼べる (subagent 不可)
   ▼
ユーザー
   │  ③ 選択を返す
   ▼
controller
   │  ④ SendMessage(to:CO の agentId)  ← CO を transcript 保持のまま再開させる
   ▼
層内 CO subagent (context 保持のまま続行)
```

この 1 周 (CO→controller→user→controller→CO) が **1 checkpoint = controller 約 3 往復** に相当する
(relay PoC 実測、後述 cost 節)。

---

## hardened protocol の 3 本柱 (belt-and-suspenders)

relay PoC (2026-06-20, background worker で 1 周実走) で、relay は **成立するが放置すると静かに stall する**
ことが実測された。以下 3 本柱を **controller の第一級機構** にしないと checkpoint が閉じない。3 つ全て必須。

### 柱1. idle 検知 + nudge retry (auto-resume 不発の footgun 対策)

**実測事実 (relay PoC)**: controller が ④ の返信を 1 通目で送っても **層内 CO が動かなかった (auto-resume 不発)**。
2 通目の nudge (再 SendMessage で催促) で初めて再開した。

→ controller は ④ の SendMessage 送信後、CO からの応答が来ない **idle 状態を能動的に検知**し、
一定時間応答が無ければ **nudge (同一 agentId へ再 SendMessage)** で催促する。

```bash
# 柱1: idle 検知 + nudge retry の骨格 (--relay 時のみ)。
#   controller が CO へ ④ の返信を送った後、応答 idle を検知して nudge する。
#   - CO_AGENT_ID  : 層内 CO subagent の agentId (spawn 時に控える)
#   - NUDGE_MAX    : nudge 上限 (これを超えたら手動 fallback = ユーザーに状況提示して停止)
#   bash での厳密な待機ループは避け、Monitor / idle 通知ハンドリングで until 条件を待つのが安全
#   (foreground sleep は環境で blocked。CLAUDE.md bash fence convention の代替指針)。
: "${CO_AGENT_ID:?CO_AGENT_ID must be set — 層内 CO subagent の agentId}"
export NUDGE_MAX="${NUDGE_MAX:-2}"   # PoC 実測では 1 nudge で再開。余裕を見て 2。

# 擬似フロー (実体は controller の SendMessage / Monitor / idle 通知で実装する):
#   1. controller が CO へ ④ SendMessage (ユーザー選択を返す)。
#   2. CO の応答 (次の SendMessage(to:main) or idle 通知) を待つ。
#   3. 一定時間 idle なら nudge:
#        SendMessage(to: CO_AGENT_ID, "前メッセージの選択を反映して続行してください (nudge)")
#      を NUDGE_MAX まで繰り返す。
#   4. NUDGE_MAX を超えても無応答なら手動 fallback (本ファイル末尾「手動 fallback」節)。
```

> **nudge 文 (CO へ送る催促)** の例:
> 「先ほどの選択 (`<ユーザー選択の要約>`) を反映して続行してください。応答が確認できていません (nudge)。」
> nudge は **同一 agentId** へ送る (新規 spawn しない。新規だと context が破棄され relay の利点が消える)。

### 柱2. 「結果は必ず `SendMessage(to:main)`」契約 (return 自動配送されない footgun 対策)

**実測事実 (relay PoC)**: **background teammate の return は main へ自動配送されない**。最終結果は
3 通目「結果を SendMessage で main に送れ」と明示指示して初めて controller に到達した。

→ 層内 CO の **spawn prompt に「checkpoint / 完了時は必ず `SendMessage(to:main)` で報告せよ」を第一級契約**
として渡す。CO が return するだけ (= controller が拾えない) を防ぐ。

```text
# 柱2: 層内 CO の spawn prompt に追加する relay 契約節 (--relay 時のみ追記)。
#   既存の CO 入力契約 (cluster-orchestrator-directives.md の ClusterOrchestratorInput) は変えず、
#   relay 用の「報告チャネル契約」だけを additive に足す。

【relay 報告契約 (op-loop --relay 時の追加契約)】
- あなた (層内 CO) の checkpoint・判断点・完了は、return ではなく必ず
  SendMessage(to: main) で controller に報告してください。
  (background teammate の return は main に自動配送されないため、明示報告が必須です。)
- 報告には以下を含めてください:
    - phase: どの工程段階か (apply / verify / review / done / needs_decision など)
    - summary: 1〜3 文の terse な要約 (raw diff / 全文 finding は送らない)
    - decision_needed: ユーザー判断が要る場合のみ、選択肢 + 推奨を構造化
- controller から SendMessage で指示が返ったら、その内容を反映して **同じ context のまま** 続行してください。
  (再 spawn ではなく transcript 保持の resume です。)
- You must not ask interactive questions directly (AskUserQuestion は持っていません)。
  ユーザー判断が要るときは上記 decision_needed を SendMessage(to: main) に載せて controller に委ねてください。
```

> この契約は **relay 用の報告チャネル**を足すだけで、CO の 10 フェーズ本体 (apply→検証→PR→review→verdict) は
> 改変しない (ADR-0019 D5 純 composition)。`--relay` 無しの既定では本節を spawn prompt に **足さない**
> (CO は op-run と完全同一に振る舞い、層完了時にのみ ClusterSummary を返す)。

### 柱3. mailbox stall 対策 (能動 poll の belt-and-suspenders)

**実測事実**: `SendMessage` は experimental な agent-teams 機構 (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` 前提)
であり **同期保証がない**。op-run #755-762 で実際に mailbox stall を踏んだ
(memory: project_op_run_batch_755_762_20260620)。

→ controller は **受動的に待つだけでなく能動的に poll / nudge** する。柱1 (idle 検知 + nudge) と
柱2 (明示報告契約) を組み合わせ、さらに **idle 通知ハンドリング** を controller の常設ループに組み込む:

- CO の idle 通知が来たら、それを「checkpoint 到達 or stall」の両面で解釈し、未処理の relay があれば nudge。
- 一定回数の idle/nudge を超えても進展しなければ **手動 fallback** (後述) でユーザーに状況を提示して停止する。
- relay は best-effort であることを前提に、**「stall しても気付ける」観測点** (柱1 の idle 検知 + 上限カウンタ) を必ず持つ。

> belt-and-suspenders の本質: forward (CO→controller の ① SendMessage) は PoC で即時・綺麗だったが、
> **戻り経路 (④ controller→CO の resume) が best-effort** なので、戻りを 1 通信に賭けず idle 検知 + nudge +
> 明示契約の三重化で担保する。3 本柱は独立した安全弁であり、どれか 1 つでも欠けると stall を見逃す。

---

## cost / 既定 OFF の根拠

| 項目 | 値 (relay PoC 実測) |
|---|---|
| 1 checkpoint を閉じる controller 往復 | 約 **3 往復** (CO→controller→user→controller→CO) + idle 通知ハンドリング数回 |
| controller 往復の総量 | **層数 × 層内 CO 数 × checkpoint 回数** で乗算的に増える |
| 監督面の controller 蓄積 | relay 有効時は checkpoint ごとに controller context が積まれる (terse relay でも 0 にはならない) |

→ relay を全層・全 CO に常時適用すると controller 往復が乗算的に膨らみ、監督面の controller 蓄積が
肥大する。よって **既定 OFF・opt-in** とする。

### relay を使う場面 (opt-in が正当化されるとき)

- 層内実装を **細かく見たい / 試行錯誤したい** 工程 (op-codev 的細粒度監督を層内に持ち込みたいとき)。
- 特定の 1 層だけ relay したい場合も、現状は op-loop 全体フラグ (`--relay`) として扱う
  (層単位 opt-in の細分化は過剰拡張ゆえ持たない、CLAUDE.md「抽象化は最小限」)。

### 既定 (層間 gate のみ) で十分なケース

- architect が独立設計した同層工程群を、層完了時の go/no-go だけで監督できる通常運用。
- 層内 CO は op-run と同じく自律 + 独立 review で完結するため、途中介入が不要なら relay は要らない。

---

## 手動 fallback (relay が stall して回復しないとき)

3 本柱でも CO が回復しない (NUDGE_MAX 超過 / idle が続く) 場合、relay に固執せず **層間 gate の既定挙動に倒す**:

```text
## --relay 監督が応答しません (手動 fallback)

層 <i> の CO (<CO_AGENT_ID>) が relay に応答していません (nudge <NUDGE_MAX> 回試行)。
relay 監督を中断し、層間 gate (既定の監督) に切り替えます。

- この層の CO は background で実行継続している可能性があります。
- 層完了 (ClusterSummary 返却) を待ってフェーズ 3 (層間 gate) で結果を確認します。
- relay を再試行する場合は、CO の状態を確認してから指示してください。
```

> fallback は **relay を諦めて既定 (層間 gate) に戻すだけ** であり、層内 CO の実装そのものは止めない
> (CO は op-run と同じく自律実行を継続できる)。relay はあくまで「監督チャネルの opt-in 追加」であって、
> 実装経路ではない。

---

## 関連 (Single Canonical Source)

| 参照 | 役割 |
|---|---|
| `~/.claude/skills/op-loop/SKILL.md` の「監督深度オプション: --relay」節 | --relay の要点 + 本ファイルへの pointer (本ファイルが詳細正本) |
| ADR-0019 (`op-tools/docs/adr/0019-op-loop-supervised-serial-loop.md`) D7 / Consequences | relay の設計判断 (既定 OFF・opt-in) と footgun 記述の正本 |
| `~/.claude/skills/op-run/cluster-orchestrator-directives.md` | 層内 CO の入力契約 (`ClusterOrchestratorInput`)。relay 契約は本契約を改変せず additive に足すだけ |
| memory `reference_subagent_skill_relay_mechanics` | subagent/skill/relay 挙動の裏取り + PoC 実測 (3 本柱の根拠) |
| memory `project_op_run_batch_755_762_20260620` | mailbox stall を実際に踏んだ事例 (柱3 の根拠) |
