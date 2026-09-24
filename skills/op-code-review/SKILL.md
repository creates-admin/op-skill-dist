---
name: op-code-review
description: 実装完了後の自己検証用 correctness code review skill。対象 diff を Angle A〜E で single-pass 検査 → 3 値 verify (CONFIRMED/PLAUSIBLE/REFUTED) → 固定 schema の JSON findings で返す。read-only (修正・commit しない)、単一 context、外部依存なし。引数で diff 範囲・focus・effort (low〜max) を指定できる。「op-code-review」「自己検証」「correctness review」「セルフレビュー」等のキーワードで起動。
---

<!--
- disable-model-invocation を付けない (apply agent / subagent から invoke する)。
-->

# op-code-review: correctness 自己検証レビュー (single-pass)

変更 diff に対する correctness 専任のレビューを行う。目的は「現実的な入力・状態・タイミングで実際に誤動作する箇所」を挙げること。

この skill が built-in のレビューではなく OP の自己検証に使われる理由 (変えないこと):

- 固定の JSON 契約: 下記 Output contract の配列をそのまま呼び出し元 (op-run apply / op-codev) が完了報告に載せる。
- read-only: 検出と報告のみ。コードの修正・commit はしない。
- single-context: angle と verify をすべてこの同じ context 内で順番に実行し、subagent を spawn しない。
- portable: 外部の registry / marker / CLI に依存せず、ディレクトリごと他 repo へコピーして動く。

質問で停止しない。判断不能・情報不足の候補は捨てず、PLAUSIBLE として `failure_scenario` に前提 (何が不確実で、何が分かれば確定するか) を書く。

## scope 宣言 (correctness 専任)

flag するのは runtime correctness bug のみ: 条件の反転・取り違え、off-by-one、null/undefined/None 参照、guard の削除・欠落、
falsy な 0/空文字の誤判定、`await` 漏れ、copy-paste の変数取り違え、握りつぶされた例外、正規表現のメタ文字未エスケープ、境界値の除外漏れ、など。

scope 外 (検出しても finding にしない): style / naming / フォーマット、再利用漏れ・重複実装、簡素化・効率の改善余地、抽象度の指摘、
プロジェクト規約違反、テスト不足。

## 引数 (呼び出し側からの注入)

`args` は自由形式のテキストで、以下を任意に含められる:

- 対象指定: PR 番号 / branch 名 / ref range (`abc123...def456`) / ファイルパス。指定があれば Phase 0 の既定 diff 取得より優先する。
- 追加 focus: 「error handling を重点的に」「`src/foo/` のみ」等。Angle A〜E の重み付けに使う (angle 自体は省略しない)。
- effort: `low | medium | high | xhigh | max`。未指定 / `auto` は `high`。

例: `Skill(op-code-review, args: "diff: HEAD~3...HEAD effort: high focus: 並行処理まわり")`

### effort ladder (実行量の調整)

| effort | angle | verify | sweep | findings 上限 | 姿勢 |
|---|---|---|---|---|---|
| `low` | Angle A のみ (diff 1 パス、full-file Read なし) | なし (dedup のみ) | なし | 4 | 速度優先。hunk から直接見えるバグのみ |
| `medium` | A〜E | あり | なし | 8 | precision — maintainer が対応するものだけ残す |
| `high` (既定) | A〜E | あり | なし | 10 | recall — 見逃しより過剰検出を許容 |
| `xhigh` / `max` | A〜E | あり | あり | 15 | 最大 recall — a missed bug ships |

effort は実行量と姿勢だけを変える。scope と output contract は全 effort 共通。

## Phase 0 — 対象 diff の確定

引数で対象指定があればそれを使う。なければ:

1. `git diff @{upstream}...HEAD` (upstream 未設定なら `git diff main...HEAD`、それも不成立なら `git diff HEAD~1`)
2. uncommitted change がある場合や 1. が空の場合は `git diff HEAD` も併せて取得し、working tree の変更を scope に含める

取得した diff が scope。full-file の通し読みはしない — Read は「hunk を取り囲む関数」「angle が必要とする呼び出し元/先」に限る。
テストファイルの hunk も scope に含める。

## Phase 1 — 候補列挙 (Angle A〜E、single pass)

各候補に `file` / `line` / 一行 `summary` / 具体的な `failure_scenario` (どの入力・状態で何が起きるか) を付けて記録する。
ある angle の結論で別 angle の候補を抑制しない — 同じ行を 2 つの angle が別の理由で flag したら両方記録する。
半信半疑の候補も落とさず Phase 2 に渡す。

### Angle A — diff 逐行スキャン

diff の全 hunk を一行ずつ読み、次に各 hunk を取り囲む関数を Read する — 触った関数の未変更行にあるバグも scope 内。
各行に問う: 「どんな入力・状態・タイミング・プラットフォームでこの行は間違うか?」
条件反転、off-by-one、null/undefined 参照、`await` 漏れ、falsy-zero 判定、変数取り違え、catch 内の例外握りつぶし、正規表現メタ文字に特に注意する。

### Angle B — 削除挙動の監査

diff が削除・置換した全行について、その行が担保していた不変則・挙動を言語化し、新コードのどこで再確立されているかを探す。
見つからなければ候補: 消えた guard、落ちた error path、狭まった validation、実ケースを守っていたテストの削除。

### Angle C — cross-file 追跡

変更した各関数の呼び出し元を Grep し、変更が call site を壊さないか確認する: 新しい前提条件、戻り値の形の変化、新たな例外、タイミング・順序依存。
呼び出し先も確認する — 同じ変更セット内の並行変更がこの呼び出しを unsafe にしていないか。

### Angle D — 言語固有 pitfall

diff の言語/フレームワークの古典的な落とし穴を走査する。例: JS の falsy-zero・`==` 型強制・ループ変数のクロージャ捕捉 /
Python の mutable default 引数・遅延束縛クロージャ / Go の nil map 書き込み・range 変数捕捉 / Rust の整数 overflow・`unwrap()` panic 経路 /
SQL injection / タイムゾーン・DST ずれ / 浮動小数点の等値比較。diff が新たに持ち込んだものを flag する。

### Angle E — wrapper/proxy の正しさ

変更が cache / proxy / decorator / adapter など「別のものを包む型」を追加・変更している場合: 全メソッドが delegate へ届いているか、
registry / session / global 経由で自分自身に再入していないか、呼び出し元が使う全メソッドを転送しているかを確認する。
該当構造がなければ候補 0 で通過してよい。

## Phase 2 — 自己 verify (1-vote, 3-state)

まず dedup する: 同じ行・同じ機構を指す候補は failure_scenario が最も具体的なもの 1 つを残す。残りを diff と該当ファイルに再照合して 3 値で判定する:

- CONFIRMED — トリガーとなる入力/状態と、誤った出力/クラッシュを具体的に言える。根拠の行を引用する。
- PLAUSIBLE — 機構は実在するが、トリガー成立が不確実 (タイミング / 環境 / 設定依存)。何が確認できれば確定するかを書く。
- REFUTED — 事実誤認、または別の場所で guard 済み。それを証明する行を引用する。

既定は PLAUSIBLE — 「speculative だから」「runtime 状態次第だから」で REFUTED にしない。以下は現実的な状態として PLAUSIBLE に残す:
並行実行の競合、稀だが到達可能な経路 (error handler / cold cache / optional field 欠落) での nil/undefined、falsy な 0 の欠損扱い、
コードが除外していない境界での off-by-one、retry の連鎖・部分失敗、アンカーを失った正規表現/allowlist。

REFUTED にできるのはコードから構成的に示せる場合のみ: 事実誤認 (実際の行を引用)、型・定数・不変則により不可能 (それを提示)、
この diff 内で既に guard 済み (guard を引用)、観測可能な影響のない純粋な style 問題。

CONFIRMED / PLAUSIBLE を keep し、REFUTED を drop する。

## Phase 3 — ギャップ掃き出し (sweep、effort が xhigh/max の場合のみ)

verify 済みリストを手に、diff と取り囲む関数をもう一巡だけ再読し、リストにまだ無い欠陥だけを探す。
狙い目: 移動・抽出されたコードで落ちた guard やアンカー、一度しか評価されない default 値、hash の非決定性、lock scope の縮小、
副作用を持つ述語メソッド、テストの setup/teardown 非対称、反転した設定 default。新規がなければ空で終える — 水増ししない。

## Output contract (返却形式)

> 適用範囲: 本節が規定するのは本 skill の返却値の形であって、呼び出し元エージェントの最終報告の形ではない。
> 実装タスクの下請けとして同一 context から invoke された場合、最終メッセージは呼び出し元が指定した完了報告フォーマットのままであり、
> findings 配列はその中の 1 フィールドに収める素材である。findings 配列だけを最終報告として返して完了報告を置き換えてはならない。
> 人間が本 skill を単独起動した場合のみ、下記がそのまま最終出力になる。

findings は下記の JSON 配列だけで返す (前置きの文を付けない)。
上限は effort ladder の findings 上限 (既定 10 件)、最重症順。超えた分は重症なものに絞る。何も残らなければ `[]`。

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

| severity | 目安 |
|---|---|
| Critical | データ破壊・クラッシュ・セキュリティ欠陥が通常運用で発生する |
| High | 現実的な入力・状態で機能が誤動作する |
| Medium | 限定的な条件・エッジケースでのみ誤動作する |
| Low | 影響が軽微、または発生が極めて稀 |

## 手動 fallback

Skill の解決に失敗した場合は、本ファイルを Read して Phase 0〜2 (effort に応じて Phase 3) を同一 context で手動一巡し、その旨を報告する。

## 呼び出し側への注記

invoke 名: 直配置なら `Skill(op-code-review)`、plugin 経由なら `Skill(op-skill:op-code-review)`。
