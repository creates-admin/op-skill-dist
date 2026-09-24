---
name: op-explore
description: op-plan/op-architect の上流 phase -1 (発散 / discovery)。本質質問でヒアリングし、/design Artifact に複数案のモックを並べて人間が実物を見て選び、合意したモック URL と決定事項を spec_only な decision record に卒業させて op-plan / op-architect へ handoff する Direct Mode 固定スキル。「op-explore」「ヒアリング」「モック」「発散」「方向性を決めたい」「複数パターン見たい」等のキーワードで起動。
effort: max
---

# op-explore — 発散 / discovery (phase -1)

`op-plan` / `op-architect` の上流。ユーザー自身もまだ何を作りたいか固まっていない段階で、候補を広げ、
`/design` Artifact のモックで実物を見て選ぶ。出力はコードでなく decision record (spec_only)。

方向が既に決まっている中量級 feature は `op-plan`、ADR が要る大規模設計は `op-architect` を使う。

## 不変則

- **Direct Mode 固定**。人間が直接起動し、質問・対話してよい。OP-managed 経路を持たない。EnterPlanMode は使わない。
- 内部で spawn する designer-expert は OP-managed Mode (`invocation_mode: op_managed`) かつ read-only。
- **選択は人間**。司令官は案を並べて差異・トレードオフを示すだけで、順位付け・推奨順を出さない。
- 司令官はコードを書かない。モックは `_shared/design-mock.md` に従って司令官が作る。
- op-explore は起票しない。起票は handoff 先 (op-plan / op-architect) が `_shared/filing-gate.md` に従って行う。
- モック・decision record に本番 credential / 実 API endpoint / 実 PII を入れない (mock データのみ)。
- commit するのは decision record だけ。

`session-id` = `explore-<short>-YYYYMMDD-HHMMSS`。

---

## フェーズ1: ヒアリング (本質質問)

「どのレイアウト / 色がいいか」と結論を選ばせる質問はしない。意図・文脈・制約を引き出す本質質問 7 型でフレーム化する:

1. **仕事と成功 (JTBD)** — この画面/機能でユーザーは何を完了したいか、成功とは何か
2. **利用文脈** — いつ / どこで / どんな状態で使うか (頻度・デバイス・割込み)
3. **最重要の一点 (hierarchy 起点)** — 一番先に目に入るべき / 一番大事な 1 つは何か
4. **判断と取捨** — 何を見せ何を隠すか、優先順位
5. **トーンは参照との対比で** — 「A ではなく B 寄り」と既知のものとの対比で (形容詞単体は曖昧)
6. **参考と禁忌 (exemplar + anti-pattern)** — 良いと思う実例 / 絶対に避けたい例。良いと思う理由 (restraint / hierarchy 等の craft 原則) も言語化してもらう
7. **現実の制約・エッジ状態** — 技術制約・データ最大/最小・loading/error/empty/権限

質問はまとめて提示し (AskUserQuestion 可)、答えにくい項目は仮置きして進めてよい。

## フェーズ2: 既存 UI パターンの要約 (既存 UI がある repo のみ)

designer-expert に read-only で既存パターンの要約を依頼し、モックに反映する (新しい見た目を発明しない)。

```
Agent({
  subagent_type: "op-skill:designer-expert",
  model: "opus",
  description: "op-explore: 既存 UI パターン要約 (read-only)",
  prompt: """
    invocation_mode: op_managed

    あなたは designer-expert です。op-explore から呼ばれた OP-managed Mode 起動です。
    質問で停止せず、不足は assumptions[] を置いて続行してください。

    共通宣言 (invocation_mode / 質問禁止 / 必読 checklist / commits_added): `~/.claude/skills/_shared/spawn-prompt-common.md` §1〜§4 を参照。
    本作業は read-only のため、ファイルを作成・編集せず commits_added: [] を返してください。

    タスク: 対象 repo の既存 UI から、モック作成に使う以下を要約してください。
      - design token (色・type scale・spacing・radius・shadow) と定義ファイルパス
      - 主要 component (名前・パス・variant・状態表現)
      - layout パターン (ナビゲーション構造・グリッド・密度) と代表画面のパス
      対象領域: <フェーズ1 で特定した画面 / 機能>

    出力契約: 上記 3 区分を構造化返却し、残した assumptions を併記。新しい見た目の提案はしない。
  """
})
```

## フェーズ3: Design Artifact にモックを並べる

`_shared/design-mock.md` の手順で Design Artifact を作成し、**案ごとに artboard を並べる** (通常 2 案、最大 3 案)。
各案は必要な状態 (通常 / 空 / 読み込み中 / エラー 等) を artboard で分ける。

案が無難に似通わないよう、案ごとに次の拘束軸へ互いに重ならない値を割り当ててから描く:

| 拘束軸 | 値の例 |
|---|---|
| typography | serif 見出し / geometric sans / humanist sans / monospace アクセント |
| layout 対称性 | 左右対称グリッド / 非対称 / 中央集約 / モジュラー |
| color 戦略 | monochrome + 1 accent / analogous / 高彩度 vs くすみ / dark-first |
| 密度 | 余白多め editorial / 高密度業務 / 中庸 |
| 装飾予算 | フラット / 影で奥行き / 罫線で秩序 / 余白だけで秩序 |

既存 design system がある repo では、拘束軸はその範囲内で振る (token を逸脱しない)。
各案の artboard には、割り当てた拘束値と狙い (craft 上の意図) を短く注記する。

## フェーズ4: 反応ループと人間の選択

- モック URL を提示し、各案の差異・トレードオフ・状態の網羅度を並べる。**順位や推奨は付けない**。
- ユーザーの反応 (採用 / 部分的に採用 / 違う + コメント) を受けてモックを更新する。
  「A の構成 + B の配色」のような合成もモック上で作って確認する。
- 「どれも違う」なら拘束軸の割り当てを振り直して新しい案を並べる。
- ユーザーが案 (または合成案) を選んだら、採用 artboard を確定してフェーズ5 へ。
- 中断する場合はモック URL と session-id を伝えて終了する。再開時は `Artifact({action:"read", url})` で続きから。

## フェーズ5: 卒業 (decision record 作成 + commit)

`docs/playground/<session-id>.md` に Markdown 1 本で書く:

| 節 | 内容 |
|---|---|
| デザインモック | `デザインモック: <artifact URL>` + 採用 artboard 名 |
| 決定事項 | 採用案 (合成内容を含む) と、却下案 + 却下理由 |
| 振る舞い | 状態遷移 / 入出力例 / edge case / 合否基準 (→ handoff 先の success_criteria / verification_steps) |
| 意図 | ヒアリングの要点 (JTBD・最重要の一点・トーン) と craft 上の意図の言語化 |
| 残課題 | 未決事項・follow-up |

decision record だけを明示 stage して commit する (既存の staged 変更を巻き込まない):

```bash
: "${SESSION_ID:?}" "${RECORD_FILE:?}"   # RECORD_FILE=docs/playground/<session-id>.md
git diff --cached --quiet || { echo "既に staged 変更あり。停止"; git diff --cached --name-only; exit 1; }
git add -- "$RECORD_FILE"
git diff --cached --name-only
git commit -m "docs(playground): ${SESSION_ID} decision record (op-explore 卒業)"
```

## フェーズ6: handoff

```
decision record を docs/playground/<id>.md に commit しました。次に進みますか?
1. op-plan を起動する (計画 → 起票)
2. op-architect を起動する (ADR が要る設計判断を含む場合)
3. 起動コマンドだけ表示 (後で手動実行)
4. 終了 (decision record のみで完了)
```

op-explore は決定の重さを判定しない。どちらへ渡すかはユーザーが選ぶ。

```
Skill({ skill: "op-skill:op-plan", args: "--from-record docs/playground/<session-id>.md" })
Skill({ skill: "op-skill:op-architect", args: "--from-record docs/playground/<session-id>.md" })
```

## 参照

- `~/.claude/skills/_shared/design-mock.md` — Design Artifact モックの作成・利用
- `~/.claude/skills/_shared/filing-gate.md` — handoff 先の起票前ゲート
- `~/.claude/skills/_shared/invocation-mode.md` / `spawn-prompt-common.md` — 内部 spawn の OP-managed 宣言
