---
name: op-code-review
description: 実装完了後の自己検証用 correctness code review skill。対象 diff を Angle A〜E の single-pass 検査 → 3 値 verify (CONFIRMED/PLAUSIBLE/REFUTED) → severity 付き JSON findings で返却する。built-in /code-review と異なり model (subagent 含む) から Skill invoke 可能。引数で diff 範囲・追加 focus・effort (low/medium/high/xhigh/max) を注入できる。「op-code-review」「自己検証」「correctness review」「セルフレビュー」等のキーワードで起動。
---

<!--
schema_version: 1
last_breaking_change: 2026-07-29
notes: v1 (2026-07-29) 初版。built-in /code-review が disable-model-invocation のため
       model (subagent / main loop) から invoke できない問題を自前 skill で構造的に解決する。
       built-in の subagent 不可環境向け single-pass 変種を土台に、方法論を再構成した。
-->

<!--
機能概要: 変更 diff を対象とした correctness 専任の code review skill。
         5 つの検査 angle (A〜E) を同一 context で直列に一巡し、候補を 3 値 verify
         (CONFIRMED / PLAUSIBLE / REFUTED) で自己検証してから、severity 付き JSON 配列で返却する。
作成意図: op-run apply フェーズの apply-expert 自己検証 (ClusterOrchestrator フェーズ3) が
         built-in /code-review を Skill invoke できない (disable-model-invocation) ため、
         invoke 可能な同等品を plugin 同梱で提供する。
注意点: - **portable 最優先**: 本 skill は op-skill の registry / markers / op CLI / invocation-mode
          に一切依存しない。ディレクトリごと他 repo へコピーしてもそのまま動く。
          op-skill 内の関連文書への言及はすべて soft pointer (無くても本 skill 単体で完結する)。
        - **correctness 専任**: cleanup 系 (再利用漏れ / 簡素化 / 効率 / 抽象度 / 規約) は scope 外。
          それらは formal review 工程や cleanup 用 skill に委ねる。
        - disable-model-invocation を付けないこと (付けると本 skill の存在意義が消える)。
        - 名前は built-in (`code-review`) と衝突させない (`op-code-review` を維持)。
        - op-run 経路での注入文言の正本は `skills/op-run/references/apply-prompt-directives.md`
          「自己検証」節、apply 完了手順の正本は `skills/_shared/apply-completion-checklist.md`
          (いずれも soft pointer。本 skill は手順・angle・verify 判定・出力形式の正本)。
-->

# op-code-review: correctness 自己検証レビュー (single-pass)

`単一 context single-pass → Angle A〜E → 自己 verify (3 値) → severity 付き JSON findings (上限は effort 依存、既定 ≤10)`

あなたはこれから、変更 diff に対する **correctness 専任** のレビューを行う。
目的は「現実的な入力・状態・タイミングで実際に誤動作する箇所」を漏れなく挙げること。
real bug の検出は false positive の回避より優先する — 迷ったら surface する。

本 skill は subagent を使わない前提で設計されている。すべての angle と verify を
**この同じ context 内で、順番に、自分自身で** 実行する。angle を省略しないこと。
実行中は **質問で停止しない** — 判断不能・情報不足の候補は捨てず、PLAUSIBLE として
`failure_scenario` に前提 (何が不確実で、何が分かれば確定するか) を明記して返す。

## scope 宣言 (correctness 専任)

flag する対象は **runtime correctness bug のみ**:
条件の反転・取り違え、off-by-one、null/undefined/None 参照、guard の削除・欠落、
falsy な 0/空文字の誤判定、`await` 漏れ、copy-paste の変数取り違え、
握りつぶされた例外、正規表現のメタ文字未エスケープ、境界値の除外漏れ、など。

以下は **scope 外** — 検出しても finding にしない:
style / naming / フォーマット、再利用漏れ・重複実装、簡素化・効率の改善余地、
抽象度 (実装の深さ) の指摘、プロジェクト規約違反、テスト不足。
これらは formal review 工程や cleanup 専任の仕組みに委ねる。

## 引数 (呼び出し側からの注入)

`args` は自由形式のテキストで、以下を任意に含められる:

- **対象指定**: PR 番号 / branch 名 / ref range (`abc123...def456`) / ファイルパス。
  指定があれば Phase 0 の既定 diff 取得より優先する。
- **追加 focus**: 「error handling を重点的に」「`src/foo/` のみ」等の自由指示。
  focus は Angle A〜E の重み付けに使う。focus があっても angle 自体は省略しない。
- **effort**: `low | medium | high | xhigh | max`。未指定 / `auto` は `high`。

例: `Skill(op-code-review, args: "diff: HEAD~3...HEAD effort: high focus: 並行処理まわり")`

### effort ladder (実行量の調整)

| effort | angle | verify | sweep | findings 上限 | 姿勢 |
|---|---|---|---|---|---|
| `low` | Angle A のみ (diff 1 パス、full-file Read なし) | なし | なし | 4 | 速度優先。hunk から直接見えるバグのみ |
| `medium` | A〜E | あり | なし | 8 | precision — maintainer が対応するものだけ残す |
| `high` (既定) | A〜E | あり | なし | 10 | recall — 見逃しより過剰検出を許容 |
| `xhigh` / `max` | A〜E | あり | あり | 15 | 最大 recall — a missed bug ships |

effort は実行量のみを変える。scope 宣言 (correctness 専任) と output contract の形は全 effort 共通。
`low` では Phase 1 を Angle A の diff 1 パスに縮退し、Phase 2 は dedup のみ (verify 省略)、Phase 3 なし。
姿勢列が本文冒頭の recall 既定より優先する (`medium` は precision 姿勢に切り替える)。

## Phase 0 — 対象 diff の確定

引数で対象指定があればそれを使う。なければ以下の順で unified diff を取得する:

1. `git diff @{upstream}...HEAD` (upstream 未設定なら `git diff main...HEAD`、
   それも不成立なら `git diff HEAD~1`)
2. uncommitted change がある場合や 1. が空の場合は `git diff HEAD` も併せて取得し
   working tree の変更を scope に含める (commit 前にレビューが走ることは多い)

取得した diff が本レビューの scope。full-file の通し読みはしない —
Read は「hunk を取り囲む関数」「Angle が必要とする呼び出し元/先」に限定する。
テストファイルの hunk も scope に含める (自己検証では自分が書いたテストも対象)。

## Phase 1 — 候補列挙 (Angle A〜E、single pass)

5 つの angle を **順番に、自分で** 実行する。subagent は spawn しない。
各 angle は候補ごとに `file` / `line` / 一行 `summary` / 具体的な `failure_scenario`
(どの入力・状態で何が起きるか) を付けて記録する。
ある angle の結論で別 angle の候補を抑制しない — 同じ行を別の理由で 2 つの angle が
flag したら両方記録する。半信半疑の候補も **落とさず Phase 2 に渡す**
(確信のない候補を黙って捨てることが、見逃しの最大要因である)。

### Angle A — diff 逐行スキャン

diff の全 hunk を一行ずつ読む。次に各 hunk を取り囲む関数を Read する —
触った関数の中の未変更行にあるバグも scope 内 (この変更が再露出させる / 直し損ねている)。
各行に対して問う: 「どんな入力・状態・タイミング・プラットフォームでこの行は間違うか?」
条件反転、off-by-one、null/undefined 参照、`await` 漏れ、falsy-zero 判定、
変数取り違え、catch 内での例外握りつぶし、正規表現メタ文字、に特に注意する。

### Angle B — 削除挙動の監査

diff が **削除または置換した** 全行について、その行が担保していた不変則・挙動を
言語化し、新コードのどこでそれが再確立されているかを探す。見つからなければ候補:
消えた guard、落ちた error path、狭まった validation、実ケースを守っていたテストの削除。

### Angle C — cross-file 追跡

diff が変更した各関数について、呼び出し元を Grep で探し、変更が call site を壊さないか
確認する: 新しい前提条件、戻り値の形の変化、新たな例外、タイミング・順序依存。
呼び出し先も確認する — 同じ変更セット内の並行変更が、この呼び出しを unsafe にしていないか。

### Angle D — 言語固有 pitfall

diff の言語/フレームワークに古典的な落とし穴がないか走査する。例:
JS の falsy-zero・`==` 型強制・ループ変数のクロージャ捕捉 / Python の mutable default
引数・遅延束縛クロージャ / Go の nil map への書き込み・range 変数捕捉 / Rust の
整数 overflow・`unwrap()` panic 経路 / SQL injection / タイムゾーン・DST ずれ /
浮動小数点の等値比較。diff が新たに持ち込んだものを flag する。

### Angle E — wrapper/proxy の正しさ

変更が「別のものを包む型」(cache / proxy / decorator / adapter) を追加・変更している場合:
全メソッドが包んだ実体 (delegate) へ届いているか、registry / session / global 経由で
自分自身に再入していないかを確認する。呼び出し元が実際に使う全メソッドを wrapper が
転送しているかも確認する。該当構造がなければこの angle は候補 0 で通過してよい。

## Phase 2 — 自己 verify (1-vote, 3-state)

まず dedup する: 同じ行・同じ機構を指す候補は、failure_scenario が最も具体的なものを
1 つ残す。残った各候補を、diff と該当ファイルに **再照合** して 3 値で判定する:

- **CONFIRMED** — トリガーとなる入力/状態と、誤った出力/クラッシュを具体的に言える。
  根拠の行を引用する。
- **PLAUSIBLE** — 機構は実在するが、トリガー成立が不確実 (タイミング / 環境 / 設定依存)。
  何が確認できれば確定するかを書く。
- **REFUTED** — 事実誤認 (コードはそう書いていない)、または別の場所で guard 済み。
  それを証明する行を引用する。

**既定は PLAUSIBLE** — 「speculative だから」「runtime 状態次第だから」という理由で
候補を REFUTED にしないこと。以下は現実的な状態であり、PLAUSIBLE として残す:
並行実行の競合、稀だが到達可能な経路 (error handler / cold cache / optional field 欠落)
での nil/undefined、falsy な 0 の欠損扱い、コードが除外していない境界での off-by-one、
retry の連鎖・部分失敗、アンカーを失った正規表現/allowlist。

REFUTED にできるのは **コードから構成的に示せる場合のみ**: 事実誤認 (実際の行を引用)、
型・定数・不変則により不可能 (それを提示)、この diff 内で既に guard 済み (guard を引用)、
観測可能な影響のない純粋な style 問題、のいずれか。

CONFIRMED / PLAUSIBLE を keep し、REFUTED を drop する。

**環境適応 (optional)**: 呼び出し context で Agent tool が使える場合に限り、verify を
候補ごとの独立 verifier subagent (汎用 agent、1-vote) に fan-out してよい — diff・該当ファイル・
候補を渡し、上記 3 値のいずれかだけを返させる。Agent tool が無い場合 (subagent 内実行が典型) は
既定どおり自己 verify で完結する。どちらでも判定基準 (PLAUSIBLE-by-default) は同一。

## Phase 3 — ギャップ掃き出し (sweep、effort が xhigh/max の場合のみ)

verify 済みリストを手に、新鮮な目でもう一巡だけ行う。diff と取り囲む関数を再読し、
**リストにまだ無い欠陥だけ** を探す — 既出の再導出・再確認はしない。
最初のパスが見逃しやすいもの: 移動・抽出されたコードで落ちた guard やアンカー、
二軍の footgun (一度しか評価されない default 値、hash の非決定性、lock scope の縮小、
副作用を持つ述語メソッド)、テストの setup/teardown 非対称、反転した設定 default。
新規がなければ空のまま終える — 埋め草で水増ししない。

## Output contract (返却形式)

findings を **JSON 配列のみ** で返す (前後に散文の重複説明を付けない)。
上限は effort ladder の findings 上限 (既定 **10 件**)、最重症順。
上限を超えて残った場合は重症なものに絞る。何も残らなければ `[]` を返す。

```json
[
  {
    "file": "path/to/file.ext",
    "line": 123,
    "severity": "Critical | High | Medium | Low",
    "verdict": "CONFIRMED | PLAUSIBLE",
    "summary": "バグの一文説明",
    "failure_scenario": "具体的な入力/状態 → 誤った出力/クラッシュ"
  }
]
```

severity の目安 (呼び出し側の gate 判定に使われる):

| severity | 目安 |
|---|---|
| Critical | データ破壊・クラッシュ・セキュリティ欠陥が通常運用で発生する |
| High | 現実的な入力・状態で機能が誤動作する |
| Medium | 限定的な条件・エッジケースでのみ誤動作する |
| Low | 影響が軽微、または発生が極めて稀 |

上表は portable 用の自立した簡約基準。OP フローが整備された repo では、より詳細な
severity 正本 (`skills/_shared/severity-rubric.md`) があればそちらに整合させてよい
(soft pointer — 無くても上表だけで動作する)。

返却の冒頭に一行、これは single-pass の自己検証レビューであり multi-agent fan-out
ではない旨を明記する (読み手が実行内容を誤解しないため)。

## 呼び出し側への注記

- 直配置 (`~/.claude/skills/op-code-review/` または repo の `.claude/skills/`) では
  `Skill(op-code-review)`、plugin 経由では `Skill(op-skill:op-code-review)` で invoke する。
- 本 skill は **検出と報告のみ** を行い、コードの修正・commit は行わない。
  修正は呼び出し側 (apply agent 等) の責務。
- 自己検証層 (本 skill) と formal review 層は別レイヤー。自己検証で Medium / Low を
  自己修正せず formal review に委ねるのは設計どおりの分業であり、手抜きではない。
- formal review 側の reviewer (例: op-skill の review-expert) が correctness 候補列挙の
  下請けとして本 skill を invoke することもできる。その場合も最終判定・報告形式・severity の
  確定は reviewer 自身が行い、本 skill の findings は candidate 入力として扱う。
