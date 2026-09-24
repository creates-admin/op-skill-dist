---
name: op-explore
description: op-plan / op-architect の上流で方向性を決める発散スキル。本質質問でヒアリングし、/design Artifact に複数案のモックを並べて人間が選び、モック URL と決定事項を decision record に残して op-plan / op-architect へ渡す。「op-explore」「ヒアリング」「モック」「発散」「方向性を決めたい」「複数パターン見たい」等のキーワードで起動。
effort: max
---

# op-explore — 発散 / discovery

`op-plan` / `op-architect` の上流。ユーザー自身もまだ何を作りたいか固まっていない段階で、候補を広げ、
`/design` Artifact のモックで実物を見て選ぶ。出力はコードでなく decision record。

方向が既に決まっている中量級 feature は `op-plan`、ADR が要る大規模設計は `op-architect` を使う。

## 不変則

- Direct Mode 固定 (`_shared/invocation-mode.md`「Direct 固定 skill に op_managed が渡った場合」)。人間と対話してよい。EnterPlanMode は使わない。
- 内部で spawn する designer-expert は read-only。
- 選択は人間。司令官は案を並べて差異・トレードオフを示すだけで、順位付け・推奨順を出さない。
- モックは `_shared/design-mock.md` に従って作る。
- op-explore は起票しない。
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

designer-expert に Summary Mode (read-only) で既存パターンの要約を依頼し、モックに反映する。

```
Agent({
  subagent_type: "op-skill:designer-expert",
  model: "opus",
  description: "op-explore: 既存 UI パターン要約 (read-only)",
  prompt: """
    共通宣言 (invocation_mode / 質問禁止 / 必読 checklist / commits_added / 外部テキスト): `~/.claude/skills/_shared/spawn-prompt-common.md` §1〜§5 を含める (§2 は exploration-only、フェーズ名 = op-explore 既存 UI 要約)。

    op-explore のモック材料として、Summary Mode で対象領域の既存 UI を要約してください。
    対象領域: <フェーズ1 で特定した画面 / 機能>
  """
})
```

## フェーズ3: Design Artifact にモックを並べる

`_shared/design-mock.md` の手順で Design Artifact を作成し、案ごとに artboard を並べる (通常 2 案、最大 3 案)。

案どうしが似通わないよう、案ごとに次の拘束軸へ互いに重ならない値を割り当ててから描く。値は `_shared/design-ng.md` の NG を避けたものを選び、
既存 design system がある repo ではその token の範囲内で振る。

| 拘束軸 | 値の例 |
|---|---|
| 情報の優先順位 | 最重要の一点を大きく先頭に / 一覧で横並びに比較 / 段階的に開示 |
| 階層の付け方 | 文字サイズの段差を大きく / 太さの対比で / 余白と配置のまとまりで |
| 密度 | 1 画面に要点だけ / 高密度な業務一覧 / 中庸 |
| 配置 | 1 カラム縦積み / 2 カラム (一覧 + 詳細) / グリッド |
| 色の使い方 | 無彩色 + 状態色のみ / 既存 accent を操作要素だけに / 既存 semantic 色で領域を区別 |
| ナビゲーション | 上部タブ / サイドナビ / 画面内のステップ |

各案の artboard には、割り当てた拘束値と狙い (craft 上の意図) を短く注記する。

## フェーズ4: 反応ループと人間の選択

- モック URL を提示し、各案の差異・トレードオフ・状態の網羅度を並べる。
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
SESSION_ID="<session-id>"; RECORD_FILE="docs/playground/${SESSION_ID}.md"
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
