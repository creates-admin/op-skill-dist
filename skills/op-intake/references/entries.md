# 入口ごとの下書きの作り方

どの入口も、下書きができたら SKILL.md の手順 2 (本文) → 3 (一覧確認) → 4 (承認) → 5 (起票) → 6 (引き渡し) に戻る。
他の skill の手順を使う箇所では、その skill の起票の手順 (dedup・承認・`op issue create`) は使わない。

## 要望から (`/op-skill:op-intake [要望]`)

- 下書きは op-plan skill のフェーズ1〜5 (ヒアリング・ADR の判定・既存資産 audit・分解・UI があればモック) で作る。op-plan フェーズ6 の一覧への足し (UI 列) と直しの戻り先も使う。
- ADR が要る規模 (op-plan フェーズ2 に該当) は op-architect skill のフェーズ1〜5-2 で下書きを作る。ラベルは op-architect フェーズ5-2 のとおり。
- 振り分けの材料の素: 触るファイルと大きさはフェーズ1 の「どこに」「規模感」と audit の結果、依存はフェーズ4-1 の depends_on、画面はフェーズ5 の surface。
- 計画 Issue なので `severity:*` を付けない。

## 監査の finding から (`--findings <file>`)

- 入力は op-scan / op-patrol が refute まで通した finding (canonical schema)。この skill で audit・refute はしない。
- 起票するのは Critical / High だけ (`_shared/severity-rubric.md`)。finding の統合・バッチ判定 (`op scan bulk-group`)・fingerprint は op-scan skill のフェーズ2、本文・marker・domain=refactor 固有のラベルは同フェーズ4 のとおり (op-patrol はそのフェーズ5・6)。
- 本文は `issue-templates.md`「Issue 本文 (指示書フル版)」(バッチは「バッチ版」)。振り分けの材料の素: 触るファイルは finding の `files`、依存は通常なし。
- `--auto` の起票は扱わない (op-scan / op-patrol の `--auto` を使う)。

## 人の Issue の正規化 (`--from-issue #N`)

- 元 Issue の取得・中断の条件・scope の推定・expert の絞り込み・audit は op-scan skill の `references/from-issue-mode.md` §1〜§4。
- 派生 Issue の決まり (severity 例外・ラベル・元 1 : 派生 1・本文に「元 Issue: #N」・既存と重複したときの元 Issue へのコメント) は同 §5。
- 起票後の元 Issue へのコメントと `superseded-by-scan` ラベルは同 §6。元 Issue は閉じない。

## scout の報告から (`--report`)

- finding / handoff の判定、handoff の Task の選択、scout の spawn (テンプレートと本文ファイルの置き場所) は op-report skill のフェーズ 1〜2b と「scout spawn テンプレート」。
- 起票するのは scout の `result` が `confirmed` のものだけ。severity では絞らない (`filing-gate.md` §1)。
- 重複の振り分け・類似の確認・本文の見せ方・fingerprint の差し込み・結果の伝え方は `references/scout-report.md`。

## 書き上がった下書きから (`--drafts <file>`)

- ファイルから各 Issue の title・ラベル・depends_on・本文を取り出し、本文を `<INTAKE_DIR>/draft-<key>.md` に書く。
- `## 振り分けの材料` 節が無ければ足す。fingerprint の行が CLI で作ったものか分からなければ、手順 2 のコマンドで作り直して置き換える。
- 依存先の番号が `#issue[<key>]` で書かれていればそのまま使う (手順 5 で埋める)。
- severity を持つ finding の下書きは Critical / High だけを起票する (`filing-gate.md` §1 の例外の経路から来たものを除く)。
