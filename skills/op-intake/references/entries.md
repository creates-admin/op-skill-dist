# 入口ごとの下書きの作り方

どの入口も、下書きができたら SKILL.md の手順 2 (本文) → 3 (一覧確認) → 4 (承認) → 5 (起票) → 6 (引き渡し) に戻る。
他の skill の手順を使う箇所では、その skill の起票の手順 (dedup・承認・`op issue create`) は使わない。

## 要望から (`/op-skill:op-intake [要望]`)

- 下書きは op-plan skill のフェーズ1〜4-2 (ヒアリング・ADR の判定・既存資産 audit・分解) と、UI があればフェーズ5 (モック) で作る。
  op-plan のフェーズ -1 (plan mode) は SKILL.md 手順 0 の表に従い、フェーズ4-4 以降の dedup・承認・起票・op-run 起動はこの skill が受け持つ (4-6 の分解の確認は手順 4 の一覧で行う)。
- ADR が要る規模 (op-plan フェーズ2 に該当) は op-architect skill のフェーズ1〜4.6 で下書きを作る。ラベルは op-architect フェーズ5-2 のとおり。
- 振り分けの材料の素: 触るファイルと大きさはフェーズ1 の「どこに」「規模感」と audit の結果、依存はフェーズ4-1 の depends_on、画面はフェーズ5 の surface。
- 計画 Issue なので `severity:*` を付けない。

## 監査の finding から (`--findings <file>`)

- 入力は op-scan / op-patrol が refute まで通した finding (canonical schema)。この skill で audit・refute はしない。
- 起票するのは Critical / High だけ (`_shared/severity-rubric.md`)。finding の統合・バッチ判定 (`op scan bulk-group`)・domain=refactor 固有のラベルは op-scan skill のフェーズ2-1〜2-1-b とフェーズ4 のとおり。
- 本文は `pr-templates.md`「Issue 本文 (指示書フル版)」(バッチは「バッチ版」)。振り分けの材料の素: 触るファイルは finding の `files`、依存は通常なし。
- `--auto` の起票は扱わない (op-scan / op-patrol の `--auto` を使う)。

## 人の Issue の正規化 (`--from-issue #N`)

- 元 Issue は REST で読む: `gh api repos/<owner>/<repo>/issues/<N> --jq '{title, body, state, pull_request, labels: [.labels[].name]}'`。`pull_request` があるもの (PR)・`closed`・`superseded-by-scan` 付きなら中断する。
- scope の推定・expert の絞り込み・audit は op-scan skill の `references/from-issue-mode.md` §2〜§4。
- 派生 Issue の決まり (severity 例外・ラベル・元 1 : 派生 1・本文に「元 Issue: #N」・既存と重複したときの元 Issue へのコメント) は同 §5。
- 起票後の元 Issue へのコメントと `superseded-by-scan` ラベルは同 §6。クラウドで `op issue comment` / `edit-labels` が 403 なら `github-rest.md`「コメント」「ラベルを足す」で行う。元 Issue は閉じない。

## scout の報告から (`--report`)

- finding / handoff の判定と、handoff の Task の選択は op-report skill のフェーズ1・フェーズ2b。finding mode の「起票しますか」(フェーズ2a の 1) は聞かず、手順 4 の承認にまとめる。
- scout の spawn は op-report skill の「scout spawn テンプレート」。`body_file` は `<INTAKE_DIR>/draft-<No>.md` にし、指示に次の 1 行を足す:
  「本文に `~/.claude/skills/_shared/pr-templates.md`「振り分けの材料」節を書く。」
- 起票するのは scout の `result` が `confirmed` のものだけ。severity では絞らない (`filing-gate.md` §1)。
- controller は本文を書き換えない (fingerprint の差し込みと `#issue[<key>]` の置き換えだけ)。fingerprint は dedup の envelope の `details.results[i].fingerprint` を本文の先頭に差し込む (op-report フェーズ3-2 の形)。手順 4 では本文をファイルのまま見せる。
- 重複・類似の振り分け (`merged` / `duplicate` / `similar_skipped`) と結果の伝え方は op-report フェーズ3-1・3-1b・3-3。

## 書き上がった下書きから (`--drafts <file>`)

- ファイルから各 Issue の title・ラベル・depends_on・本文を取り出し、本文を `<INTAKE_DIR>/draft-<key>.md` に書く。
- `## 振り分けの材料` 節が無ければ足す。fingerprint の行が CLI で作ったものか分からなければ、手順 2 のコマンドで作り直して置き換える。
- 依存先の番号が `#issue[<key>]` で書かれていればそのまま使う (手順 5 で埋める)。
- severity を持つ finding の下書きは Critical / High だけを起票する (`filing-gate.md` §1 の例外の経路から来たものを除く)。
