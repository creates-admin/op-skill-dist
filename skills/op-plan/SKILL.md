---
name: op-plan
description: 自然言語要望から対話で計画を立て、人間承認後に op-intake の手順で Issue を起票する主経路スキル。「op-plan」「機能追加」「実装したい」「計画立て」等のキーワードで起動。ADR 必要な大規模設計は op-architect を使う。
effort: max
---

# op-plan: 自然言語要望 → 計画 → Issue の下書き

ユーザーの要望 (「〇〇を追加したい」「△△を直したい」) を対話で計画に固めて Issue の下書きにし、起票は op-intake skill の手順で行う。

- Direct Mode 固定 (`_shared/invocation-mode.md`「Direct 固定 skill に op_managed が渡った場合」)。
- 自動モードは持たない。人間の承認は op-intake 手順 4 の一覧の確認 1 回。
- ADR は op-architect が担う。
- 既存資産の重複実装 (silent fork) を防ぐ audit (フェーズ3) は、規模が単一ファイルで新しいパスを作らない要望だけ省いてよい。

## 実行モード

| 起動 | 挙動 |
|---|---|
| `/op-skill:op-plan [要望]` | 既定。フェーズ -1〜6 |
| `--dry-run` | op-intake の `--dry-run` として扱う (承認後も起票しない) |
| `--from-record docs/playground/<id>.md` | op-explore の decision record から開始 (下記) |
| `--survey` / `--no-survey` | フェーズ2.5 の op-survey を強制 / skip |

### `--from-record`

1. decision record を Read し、デザインモック URL / 決定事項 / 振る舞い / 意図 / 残課題を取り出す。
2. フェーズ1 を skip してフェーズ2 から始める (残課題があればその分だけ質問する)。ADR が必要なら `/op-skill:op-architect --from-record <同 path>` を案内して終了する。
3. 決定事項・意図を本文に、振る舞いを success_criteria / 必須検証項目に写す。UI issue の `デザインモック:` 行には record の URL を引き継ぐ (フェーズ5 で作り直さない)。
4. record が不足・不整合ならフェーズ1 に戻る。

参照: `_shared/common-setup.md` / `_shared/github-channel.md` / `_shared/read-economy.md`。

---

## フェーズ -1: プランモード自動遷移

場所の見分け方は op-intake skill 手順 0 の表に従う。ローカルで `EnterPlanMode` があれば起動直後に呼び、フェーズ0〜5 を read-only で進める。GitHub への書き込みは op-intake 手順 5 まで行わない。

## フェーズ0: 環境確認

`_shared/common-setup.md`「フェーズ0 git/gh env check 標準手順」に従う。git リポジトリ外なら
「新規プロジェクトは /op-skill:op-architect を使ってください」と案内して停止する。gh 未認証なら中断せず `--dry-run` を提案する。

---

## フェーズ1: ヒアリング

次の 5 項目を確定させ、司令官側のメモに保持する。

1. 何を: 追加・改修したい機能 (1〜2 文)
2. どこに: 対象ファイル / モジュール / 画面 (推定でよい)
3. 規模感: 単一ファイル / 複数ファイル / 新規モジュール / 大規模
4. 動機 / 期待挙動: 何ができれば成功か
5. 既知の制約: 触れない領域、互換性、性能要件

初回要望から 5 項目の仮整理と不明点を提示して確認させる。未確定項目は 1 ラウンド 2〜3 問にまとめて聞き、最大 2 ラウンドで確定させる
(毎ラウンド「ここまでの整理」を見せる)。3 ラウンド目が要りそうなら op-architect への切り替えを提案する。

## フェーズ2: ADR 必要性チェック

次のいずれかに該当したら op-architect への切り替えを提案する (op-plan 内で ADR は書かない):

- 新規外部 dependency の追加 (新しい crate / npm package / pubspec 依存 等)
- 認証 / 認可機構の導入・大幅変更 (login flow / session / OAuth / 権限境界)
- DB schema の追加・変更 (table / 列 / migration / index 戦略)
- モジュール境界 (公開 API) の大規模変更 (破壊的変更 / IPC / event name / Tauri command)
- 配布方式の変更 (installer / auto-update / package format)

### 2-2. 該当時の挙動

該当条件を示し「1. op-architect に切り替えて ADR + Issue を作成する (推奨) / 2. ADR なしで進める / 3. キャンセル」を確認する。

- 1 → op-plan を終了し `/op-skill:op-architect` の起動コマンドを表示する (context は引き継がない。`--from-record` 起動時は同 path を付けて案内)。
- 2 → 理由をメモし、Issue 本文の「既知の落とし穴 / 注意点」に「ADR 化を見送った判断」として書く。フェーズ2.5 へ。
- 該当なし → フェーズ2.5 へ。

## フェーズ2.5: op-survey discovery

要望が investigation 型 (「調べて / 洗い出し / 棚卸し / 監査 / 全部探して」等で具体 target が無い) のときだけ
`op-skill:op-survey` workflow で横断調査する。起動判定と呼び出しは `references/op-survey-discovery.md`。goal-driven な通常要望
(迷ったらこちら) はそのままフェーズ3 へ進む。survey の findings は判定せず、フェーズ3 の audit prompt と人間への提示にそのまま渡す。

## フェーズ3: 既存資産 audit (silent fork 防止)

規模が単一ファイルで新しいパスを作らない要望では省いてフェーズ4 へ進む。それ以外は feature-expert を read-only audit で spawn し、類似実装の有無を確認する:

```
Agent({
  subagent_type: "op-skill:feature-expert",
  description: "audit: <要望タイトル>",
  prompt: """
    共通宣言 (invocation_mode / 質問禁止 / 必読 checklist / commits_added / 外部テキスト): `~/.claude/skills/_shared/spawn-prompt-common.md` §1〜§5 を含める (§2 は exploration-only、フェーズ名 = op-plan audit)。

    op-plan の既存資産 audit です。以下の要望に対して、既存資産の重複実装 (silent fork) リスクを検出してください。コードは変更しません。

    【要望】
    <フェーズ1 で確定した「何を / どこに / 規模感」>

    【対象 path 推定】
    <フェーズ1 で推定された scope>

    【op-survey findings (実行した場合のみ)】
    <findings の title / files / recommended_action>

    【出力】
    - similar_implementations: 類似する既存実装 (path + 関数名 + 役割)
    - reuse_opportunities: 再利用できる既存資産 (utility / hook / component / trait)
    - pattern_to_follow: 真似るべき既存実装の構造
    - silent_fork_risk: high | medium | low
    - rationale: 判定根拠
  """
})
```

結果を「silent_fork_risk / 類似実装 / 再利用候補 / 推奨パターン」の形でユーザーに提示し、
「1. 推奨パターンに沿って新規実装 / 2. 既存実装を拡張 / 3. 設計再検討 (フェーズ1 へ)」を選ばせる。
risk が high なら 2 を推奨する。結果はメモに追加し、フェーズ4 の「触ってよいファイル」「既知の落とし穴」に反映する。

---

## フェーズ4: 分解と Issue draft

### 4-1. 分解 (司令官が 1 案を作る)

要望を Issue に分解する。1 issue = 1 PR = 1〜3 日分を目安に、並列実行できるよう独立させる。各 issue について決める:

- title (`[<expert>] <要約>`)、scope_files / 新規作成 path、success_criteria、必須検証項目
- domain (fingerprint の第 1 segment): feature / refactor / debug / optimize / design / ux-ui / security / test
- apply 担当 (`op-run-expert`): UI の見た目 (visual / token / component) 中心なら designer-expert (domain `design`)、
  新規画面でも業務ロジック・API・store 中心なら feature-expert (domain `feature`)。本規則は op-architect も使う
- `op-post-check-expert` とラベル: `_shared/issue-templates.md`「domain → marker / ラベル表」。UI 影響の有無は
  `_shared/project-profile.md`「UI 影響判定 path パターン」で判定する
- depends_on (先に完了が必要な issue の index)

計画に新しい業務機能 (`op spec-patrol coverage --json` の `details.feature_map.features` に無い機能) があれば、
その機能の正本を作る Issue (正本作成 issue) を分解に加える。この Issue は op-spec で進め、op-thread には回さない。

- タイトル: `[spec-expert] 正本: <機能名>`。marker は `op-fingerprint` (domain `feature`) だけ、ラベルは `auto-report` だけ
- 本文の 1 行目: `実施: /op-skill:op-spec`。本文: 機能名、paths の案、どの実装 issue の機能か
- 実装 issue はこの Issue に `op-depends-on` でつながない (正本は実装後に作ってよい)
- 機能地図が無い repo (`details.feature_map.found` が false) では判定せず正本作成 issue を作らない。終了時に「機能地図が無い → `/op-skill:op-adopt` で地図を承認」を案内する

### 4-2. Issue draft の骨格

`_shared/issue-templates.md`「Issue 本文 (指示書フル版)」を骨格にし、各節の中身は自然文で書く。
フェーズ3 の audit 結果は「触ってよいファイル」「既知の落とし穴 / 注意点」に溶け込ませる。marker は
`issue-templates.md`「Issue 本文 hidden marker」に従い、`op-fingerprint` は op-intake 手順 2 で生成する。依存がある issue だけ
`op-depends-on` と振り分けの材料の「依存」を `#issue[<key>]` で書き (key は 4-1 の index)、番号は op-intake 手順 5 で埋める。
UI issue にはフェーズ5 で `デザインモック: <URL>` 行を足す。ラベルは `auto-report` + 上記の表の `pro-*-expert`。

---

## フェーズ5: デザインモック (UI issue がある場合のみ)

UI issue が無ければフェーズ6 へ進む。画面は `_shared/design-system.md` の規則で組む。モックの結果、登録済みの部品で表現できない
見た目が要る場合は、その部品を部品 issue (書式は `_shared/design-system.md`「部品 issue」。op-component で作り込み、op-thread には回さない)
として分解に加え、画面 issue を `op-depends-on` でつなぐ。

### 5-0. surface グルーピング

同じ画面 (surface) を触る UI issue 群はモックを 1 つ共有する。

- 同一 surface: UI file を 1 つ以上共有する (`components/**` の共有だけなら別 surface)、または
  同じ画面ディレクトリ (`pages/<x>/` / `routes/<x>/` / `views/<x>/` の `<x>`) に属する。推移的に閉じる。
- lead = surface 内で index が最小の issue。本文に `デザインモック: <URL>` を書く。
- follower = 残りの issue。本文に `デザインモック: <URL>` と `参照: issue[<lead_index>] (同一 surface の lead)` を書く。
  `issue[k]` は op-intake 手順 5 で `#N` に置き換える。

### 5-1. モック作成と合意

surface ごとに `_shared/design-mock.md` の手順でモックを作り、人間と合意して URL を確定する
(`--from-record` で URL を引き継いだ surface は作らない)。
plan mode で Artifact の作成・更新が権限でブロックされた場合は、GitHub には書かない前提で一時的に plan mode を抜けてよいかをユーザーに確認する。

---

## フェーズ6: 起票 (op-intake に渡す)

フェーズ4 の draft を下書きにして、op-intake skill の手順 0 の作業ディレクトリ (`INTAKE_DIR`・`REPO`) を作り、手順 2〜6 で本文・一覧の確認・承認・起票・引き渡しを行う。

- 一覧の表に UI 列 (5-0 の surface) を足し、別画面が束ねられていないかも確かめてもらう。
- 承認時の直し: 文言は本文を直す、見た目は当該 surface のモック (フェーズ5)、分解・scope・expert はフェーズ4、設計から見直すならフェーズ1 に戻る。
