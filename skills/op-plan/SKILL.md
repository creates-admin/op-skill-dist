---
name: op-plan
description: 自然言語要望から対話で計画を立て、人間承認後に Issue を起票して op-run を起動する主経路スキル。「op-plan」「機能追加」「実装したい」「計画立て」等のキーワードで起動。ADR 必要な大規模設計は op-architect を使う。
effort: max
---

# op-plan: 自然言語要望 → 計画 → Issue 起票 → op-run

ユーザーの要望 (「〇〇を追加したい」「△△を直したい」) を対話で計画に固め、承認後に Issue を起票して op-run へ渡す。

- Direct Mode 固定 (`_shared/invocation-mode.md`「Direct 固定 skill に op_managed が渡った場合」)。
- 自動モードは持たない。起票 (フェーズ6) と op-run 起動 (フェーズ8) には人間承認が要る。
- 実装は op-run、ADR は op-architect が担う。
- 既存資産の重複実装 (silent fork) を防ぐ audit (フェーズ3) を省略しない。
- 起票前ゲートは `_shared/filing-gate.md` に従う。

## 実行モード

| 起動 | 挙動 |
|---|---|
| `/op-skill:op-plan [要望]` | 既定。フェーズ -1〜8 |
| `--no-op-run` | 起票で終了 (フェーズ8 skip) |
| `--dry-run` | 承認後も起票せず、`op issue create` コマンドを表示して終了 |
| `--from-record docs/playground/<id>.md` | op-explore の decision record から開始 (下記) |
| `--survey` / `--no-survey` | フェーズ2.5 の op-survey を強制 / skip |

### `--from-record`

1. decision record を Read し、デザインモック URL / 決定事項 / 振る舞い / 意図 / 残課題を取り出す。
2. フェーズ1 を skip してフェーズ2 から始める (残課題があればその分だけ質問する)。ADR が必要なら `/op-skill:op-architect --from-record <同 path>` を案内して終了する。
3. 決定事項・意図を本文に、振る舞いを success_criteria / 必須検証項目に写す。UI issue の `デザインモック:` 行には record の URL を引き継ぐ (フェーズ5 で作り直さない)。
4. record が不足・不整合ならフェーズ1 に戻る。

参照: `_shared/common-setup.md` / `_shared/github-channel.md` / `_shared/dedup-policy.md` / `_shared/read-economy.md`。

---

## フェーズ -1: プランモード自動遷移

起動直後に `EnterPlanMode` を呼ぶ (既に plan mode なら no-op)。フェーズ0〜6 は plan mode 下で read-only に進め、
GitHub への書き込み (`op issue create` / `op issue edit-body` / `--ensure-labels` のラベル作成) はフェーズ7 に集約する。
ユーザーが拒否した / tool が無い場合は read-only を自律で守って続行し、
フェーズ6 は ExitPlanMode の代わりに「1. 起票する 2. 修正 3. キャンセル」を対話で確認する。

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

feature-expert を read-only audit で spawn し、類似実装の有無を確認する:

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
- `op-post-check-expert` とラベル: `_shared/pr-templates.md`「domain → marker / ラベル表」。UI 影響の有無は
  `_shared/project-profile.md`「UI 影響判定 path パターン」で判定する
- depends_on (先に完了が必要な issue の index)

### 4-2. Issue draft の骨格

`_shared/pr-templates.md`「Issue 本文 (指示書フル版)」を骨格にし、各節の中身は自然文で書く。
フェーズ3 の audit 結果は「触ってよいファイル」「既知の落とし穴 / 注意点」に溶け込ませる。marker は
`pr-templates.md`「Issue 本文 hidden marker」に従い、`op-fingerprint` は 4-4 で生成する。依存がある issue だけ
`op-depends-on` と prose `## 依存` (`- depends on #N (先に完了が必要)`) を書き、番号はフェーズ7 で解決する。
UI issue にはフェーズ5 で `デザインモック: <URL>` 行を足す。ラベルは `auto-report` + 上記の表の `pro-*-expert`。

### 4-4. fingerprint 生成 + dedup 判定

```bash
op core fingerprint --domain <domain> --title "<title>" --file <primary_file> [--symbol <symbol>] --plain
op scan dedup --findings-json drafts.json --json   # drafts.json = [{domain, title, files, symbols}, ...] (draft 全件)
```

扱いは `_shared/filing-gate.md` §2。op-plan 固有の扱い:

- `details.results[i].decision == "block"` (既存 Issue `matched_existing.issue_number` と重複) → 「続行 / 既存 Issue にコメント追加 / この issue を外す / キャンセル」をユーザーに確認する。
- envelope が取れない / 想定外の値 → fail-closed でエラーを提示し中断する。

### 4-6. 分解 align gate

draft 群 (dedup 通過後) を `| # | title | expert | post-check | UI (surface) | depends_on |` の表で提示し、分解そのものを人間と合わせる:

1. この分解で進む
2. issue の追加 / 削除 / 統合 / 順序変更を指示する → フェーズ4 をやり直して再提示
3. 設計から見直す → フェーズ1 へ

UI 列の surface は 5-0 のグルーピング結果。別画面が束ねられていないかもここで確認してもらう。

---

## フェーズ5: デザインモック (UI issue がある場合のみ)

UI issue が無ければフェーズ6 へ進む。画面は `_shared/design-system.md` の規則で組む。モックの結果、登録済みの部品で表現できない
見た目が要る場合は、その部品を部品 issue (書式は `_shared/design-system.md`「部品 issue」。op-component で作り込み、op-run には回さない)
として分解に加え、画面 issue を `op-depends-on` でつなぐ。

### 5-0. surface グルーピング

同じ画面 (surface) を触る UI issue 群はモックを 1 つ共有する。

- 同一 surface: UI file を 1 つ以上共有する (`components/**` の共有だけなら別 surface)、または
  同じ画面ディレクトリ (`pages/<x>/` / `routes/<x>/` / `views/<x>/` の `<x>`) に属する。推移的に閉じる。
- lead = surface 内で index が最小の issue。本文に `デザインモック: <URL>` を書く。
- follower = 残りの issue。本文に `デザインモック: <URL>` と `参照: issue[<lead_index>] (同一 surface の lead)` を書く。
  `issue[k]` はフェーズ7 で `#N` に解決する。

### 5-1. モック作成と合意

surface ごとに `_shared/design-mock.md` の手順でモックを作り、人間と合意して URL を確定する
(`--from-record` で URL を引き継いだ surface は作らない)。
plan mode で Artifact の作成・更新が権限でブロックされた場合は、GitHub には書かない前提で一時的に plan mode を抜けてよいかをユーザーに確認する。

---

## フェーズ6: ユーザー承認 gate (ExitPlanMode)

承認前に起票しない。ExitPlanMode を呼ぶ直前に、システム指定の plan file へ issue ごとに次を書き出す:

```markdown
# op-plan: 起票予定 Issue

## [<index>] <title>
- Labels: auto-report, pro-<expert>[, pro-ux-ui-audit-expert]
- depends_on: <index 列 or なし>
- デザインモック: <URL or なし>

<Issue 本文全文>

## 起票後の実行ステップ
1. フェーズ7: `op issue create` で直列起票 → 依存 / 参照の番号解決
2. フェーズ8: op-run 起動の確認
```

`ExitPlanMode` を呼び、「Approve and accept edits」を推奨として案内する (他の承認オプションでも司令官の手順は同じ)。
「Keep planning with feedback」の場合:

- 文言の修正 → plan file を直して再度 ExitPlanMode
- 見た目への指摘 → 当該 surface のモックを更新 (フェーズ5)
- 分解・scope・expert の変更 → フェーズ4 から (4-6 を再提示)
- 設計レベルの変更 → フェーズ1 から

`--dry-run` なら plan file に「dry-run: 起票しない」と明記し、承認後はフェーズ7 のコマンドを表示するだけで終了する。

---

## フェーズ7: Issue 起票

`_shared/filing-gate.md` §3 に従う。mcp channel では `op issue create` / `op issue edit-body` は call-spec を emit するので、
`github-channel.md` §3-§4 の protocol で完遂し、`details.issue_number` 等は ingest envelope から取る。本フェーズの手順は op-architect フェーズ5 も使う。

### 7-1. ラベル確認

新規ラベルが出る場合は `op issue create --title <t> --label <csv> --body-file <f> --ensure-labels --dry-run` の
`labels_would_create` を提示し、承認を得てから本起票する (gh channel のみ。mcp channel では dry-run 不可のため skip)。

### 7-2. Marker Publish Validate

起票・本文更新の直前に毎回実行し、`decision` が `pass` 以外なら起票しない:

```bash
op core marker-lint --body - --source-hint issue-body --strict < <body.md>
```

### 7-3. 起票と番号解決 (Pass 1 / Pass 2)

**Pass 1**: 依存先が先になる順 (トポロジカル順) に 1 件ずつ直列で起票する。

```bash
op issue create --title "<title>" --label "<csv>" --body-file <body.md> --ensure-labels
```

- 番号は envelope の `details.issue_number` から取る (タイトル検索で逆引きしない)。draft 識別子 → 番号の対応表を記録する
  (Bash 呼び出しをまたぐ場合は一時ファイル経由、`_shared/bash-fence-convention.md`)。
- 依存先の番号が確定済みなら、この時点で `op-depends-on` marker と `## 依存` を実番号で書く。
- 起票失敗は記録して次へ進む。

**Pass 2**: Pass 1 で未解決の参照 (follower の `参照: issue[k]` で lead が後から起票されたもの等) がある issue だけ本文を更新する。

- `issue[k]` を `#N` に置換し、`op-depends-on` / `## 依存` を実番号で埋める。
- 参照先 / 依存先が起票失敗していたら、その参照を外して失敗一覧に記録する。
- 更新後の本文を 7-2 で検証し、`op issue edit-body --number <N> --body-file <final.md>` で直列に更新する。

1 件でも失敗したら「作成済み / 未作成 / 本文更新失敗」を分けて報告する。作成済み Issue の自動 close (rollback) はしない。

---

## フェーズ8: op-run 起動承認

`--no-op-run` なら skip して終了する。起票した番号を示し「1. op-run を起動する / 2. 起動コマンドだけ表示 / 3. 終了」を確認する。

- 1 → `Skill({ skill: "op-skill:op-run", args: "<N1> <N2>" })` (番号は空白区切り。`--auto` 等の op-run フラグも渡せる)。
- 2 → `/op-skill:op-run <N1> <N2>` を表示して終了。
- depends_on のある issue 群は `/op-skill:op-loop --numbers <N1> <N2> …` で依存順に駆動できることを案内する (自動 handoff はしない)。
