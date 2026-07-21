---
name: op-spec
description: 正本 (.claude/rules/<feature>.md) を対話で育てる Direct Mode 固定スキル。pending issue を feature 主役で worklist 化し、spec-expert spawn で「正本 ⟷ code ⟷ human」3 者照合 → align → 正本 write + issue verdict まで回す。「op-spec」「正本」「cultivation」「仕様照合」「issue 整理」等のキーワードで起動。
effort: medium
---

<!--
schema_version: 3
last_breaking_change: 2026-06-20
notes: v1 (2026-06-20): 初版。ADR-0017 W1b の最小一周版。issue-driven worklist + lazy 構築 (正本 missing なら
       深掘りしながら作る) まで。op-spec = 正本を育てる Direct Mode 固定の対話 skill。
       worker = spec-expert (深い 3 者照合) を isolated context で spawn。
       v2 (2026-06-20): ADR-0017 W2。worklist 全モード (issue/feature/drift-driven + quick/deep lane) +
       linkage (A cross-feature [[]] / B 双方向) + ripple-check + 複数 feature cultivation 進捗・done まで full 化。
       v1→v2 は全て additive (既存挙動非破壊) なので last_breaking_change は据置。op-spec は skills/_shared/ 外
       のため CI schema-check の (>=N) pin blocking 対象ではない (bump は milestone marker)。
       v3 (2026-06-21): ADR-0017 W5。drift-driven seed に Spec Patrol Ledger pull 配線 (G2: `op spec-patrol
       ledger pull` 消費 → worklist seed) + decide 段に derived issue 発行ステップ 3-1b (G1: align gate +
       fingerprint dedup + full enrichment + op issue create + back-link)。additive (既存 issue→正本 経路を
       保持、双方向両立 = ADR-0017 D1)。last_breaking_change は据置。
-->

<!--
機能概要: pending issue を feature (= 正本) 主役で worklist 化し、各 feature を spec-expert で深掘り
         (正本 ⟷ code ⟷ human の 3 者照合) → human align → 正本 write + issue verdict まで回す
         cultivation 対話スキル。元症状「複数 issue がめちゃくちゃ」を issue の feature 主役構造化で正攻法解決する。
作成意図: ADR-0017 (正本アーキテクチャ) 決定6。正本 (feature 版 CLAUDE.md) を育てることで、agent の freelancing
         (drift / silent fork / wrong-premise 実装) を構造的に断つ。op-plan (新規要望→Issue 分解) でも
         op-codev (実装 depth) でもない「既存 issue + 正本の方向照合」レイヤーを担う。
注意点: Direct Mode 固定 (OP-managed 経路なし)。spec-expert は active-expert-registry 外の Utility Worker。
       正本 write は human align を経た後のみ・捏造禁止 (不変則7 例外を decision-record で宣言)。
       承認なしの一括 issue verdict / 一括正本 write は行わない。W2 で worklist 全モード + linkage + ripple-check
       を full 化済 (索引自動生成 / broken-link 検出 / back-link 自動保持は W3 = op-spec-patrol が担う)。
-->

# op-spec: 正本育成対話スキル

op-spec は、対象 repo の各 feature の **正本 (.claude/rules/<feature>.md)** を対話で育てるスキルである。
pending issue を feature 主役で worklist 化し、spec-expert に「正本 ⟷ code ⟷ human」の 3 者照合をさせ、
human と align しながら正本を育て、issue に方向性 verdict を付けるところまで回す。

## 3 原則

1. **Direct Mode 固定** — `_shared/invocation-mode.md` に従い、OP-managed 経路なし。正本 write は人間判断を伴う
2. **3 者照合** — 深掘りは spec-expert を isolated context で spawn し、正本 (あるべき姿) ⟷ code (実態) ⟷ human (domain 知識) を突き合わせて「気づけない前提ズレ」を潰す
3. **段階的育成 (worklist 進捗)** — issue を feature 主役の worklist 下に構造化し、選択した feature/issue に verdict が付くまで進める。承認なしの一括 write はしない

---

## このスキルの位置づけ

| スキル | 入力 | 主用途 | 出力 |
|-------|------|--------|------|
| op-plan | 自然言語の新規要望 | 要望を Issue に分解する | enriched Issue 群 |
| **op-spec (本スキル)** | 既存 pending issue + 正本 | 既存 issue と正本の **方向照合** (cultivation) | 育った正本 + issue verdict |
| op-codev | verdict 付き Issue | 段階的に **実装** する (depth) | PR |

### DO / DON'T (位置づけの境界)

- **DO**: issue を feature 主役で構造化 / 正本 ⟷ code ⟷ human の 3 者照合 / 正本を育てる (write) / issue に方向性 verdict を付ける
- **DON'T**: 並列 fan-out で大量 audit する (op-scan の領分) / 実装する (op-codev / op-run の領分) / 新規要望を Issue 分解する (op-plan の領分) / ADR を起こす (op-architect の領分)

### 元症状への正攻法

元症状「複数 issue がめちゃくちゃで方向性が定まらない」の正攻法は、
**issue を feature (安定軸) の下に構造化する** ことである (ADR-0017 決定6)。
issue は揺れるが feature (正本) は安定するので、feature を主役に据えると散らかった issue 群が整理される。

---

## 参照ドキュメント

| Path | 役割 |
|------|------|
| `~/.claude/skills/_shared/invocation-mode.md` (>=1) | Direct Mode 判定 (本スキルは固定) |
| `~/.claude/agents/spec-expert.md` | worker の役割・Invocation Mode・禁止事項 |
| `~/.claude/skills/expert-spec/SKILL.md` | 3 者照合の核・provenance タグ・present/align/decide・返却契約スキーマ・lazy 構築 |
| 対象 repo の `.claude/rules/_schema.md` | 正本 schema / provenance タグ / 6 節 skeleton (定義の正本は ADR-0017 決定3) |
| `~/.claude/skills/_shared/dedup-policy.md` | derived issue 発行時の fingerprint 照合・dedup |
| `~/.claude/skills/_shared/expert-spawn.md` (>=16) | needs_human_decision 正規スキーマ / spawn schema |

---

## フェーズ0: 環境確認

### 0-1. Invocation Mode 判定 (Direct Mode 固定)

`_shared/invocation-mode.md` に従って判定する。本スキルは **Direct Mode 固定**。
spawn prompt に `invocation_mode: op_managed` が混入していた場合は契約違反として停止し、ユーザーに状況を報告する。

### 0-2. git / gh / op binary 確認

```bash
# git リポジトリ判定
git rev-parse --is-inside-work-tree 2>/dev/null \
  || { echo "not a git repo — op-spec は既存リポジトリ上で動作します"; exit 1; }

# .claude/rules ディレクトリ確認 (正本の置き場、ADR-0017 W1a で新設)
[ -d .claude/rules ] \
  && echo "[.claude/rules] 検出: $(ls .claude/rules/*.md 2>/dev/null | wc -l) 件" \
  || echo "[.claude/rules] 未検出 — 正本はまだ起こされていません (lazy 構築で作ります)"

# gh 認証 (issue verdict 反映に必要)
gh auth status 2>/dev/null \
  || { echo "gh login が必要です。認証してください"; }
```

---

## フェーズ1: Worklist 構築

worklist を **feature (= 正本) 主役**で構造化する。worklist の seed (種) の作り方は entry mode で変わるが、
**最終的な構造は常に「feature を主役に据え、issue をその下にぶら下げる」** で揃える (ADR-0017 決定6)。

### 1-0. entry mode 選択 (3 モード)

何を起点に worklist を seed するかを選ぶ。**issue-driven が既定** (ADR-0017 決定6)。
ユーザーが mode を明示しなければ issue-driven で進める。

| mode | 起点 | worklist 種の作り方 | 主用途 |
|------|------|--------------------|--------|
| **issue-driven** (既定) | pending issue | issue を取得し、各 issue から属す feature を推定して feature 主役に畳む | 「複数 issue がめちゃくちゃ」を整理する元症状の正攻法 |
| **feature-driven** | `.claude/rules/*.md` の正本一覧 | 正本 feature を起点に、各 feature の正本 state + 紐づく pending issue を並べる | feature 単位で網羅的に正本を見直したい |
| **drift-driven** | git log staleness + `status:` | 「正本より新しい code を持つ feature (stale 候補)」+ `status: draft/unverified` の正本を起点に seed | 腐った / 未 cultivated な正本から優先的に育てたい |

> いずれの mode でも、seed したあとは **1-2 の feature 主役構造化に合流**する (構造は共通)。
> mode は「最初に何を起点に拾うか」だけを変える。

> **正本を視覚的に俯瞰したいとき (任意)**: 正本が flat 大規模で「どの feature がどう繋がっているか」を
> 見渡したい場合は、別 skill `/op-rules` で派生 HTML ビューア (`op rules render` / `op rules serve`、ADR-0020) を
> 起動できる。索引・関係グラフ・provenance を俯瞰し、worklist に積む feature の当たりを付けるのに使える。
> ビューアは read-only で正本を write しない (write は本 skill = op-spec が human align 後に行う)。

### 1-1. worklist 種の取得 (mode で分岐)

選んだ mode に応じて種を取得する。以降は取得結果を 1-2 で feature 主役に畳む。

**issue-driven (既定)** — pending issue を起点にする:

```bash
gh issue list --state open --limit 50 --json number,title,labels
```

**feature-driven** — 正本一覧を起点にし、各 feature の正本 state + 紐づく issue を並べる:

```bash
# 正本一覧 (meta ファイル _* / 00-* は feature ではないので除外、_schema.md 索引除外規約)
ls .claude/rules/*.md 2>/dev/null | grep -vE '/(_|00-)' \
  || echo "[.claude/rules] に feature 正本がありません — issue-driven を使うか lazy 構築から始めます"

# 各 feature の status は frontmatter から読む (cultivated / draft / unverified)
#   例: grep -m1 '^status:' .claude/rules/<feature>.md
# pending issue は issue-driven と同じ gh issue list で取り、feature 帰属を推定して紐づける
```

**drift-driven** — git log staleness + 未成熟 status を起点に seed する:

```bash
# (a) 正本より新しい code を持つ feature (stale 候補) を git log で拾う
#     staleness は frontmatter 日付でなく git log で判定する (_schema.md「staleness は git log で判定」)。
#     各 feature 正本の最終更新コミット時刻 ⟷ その paths 配下 code の最終更新コミット時刻を比較し、
#     code の方が新しければ stale 候補とする。
for SPEC in $(ls .claude/rules/*.md 2>/dev/null | grep -vE '/(_|00-)'); do
  SPEC_TS="$(git log -1 --format=%ct -- "$SPEC" 2>/dev/null)"
  # paths frontmatter の glob 配下 code の最新コミット時刻を取り SPEC_TS と比較する
  # (glob 解決は paths 行を読んで feature ごとに行う。code が新しければ stale 候補に積む)
  echo "  $SPEC: spec_ts=${SPEC_TS:-none}"
done

# (b) status: draft / unverified の正本 (人間深掘り未了) も seed に含める
grep -lE '^status:[[:space:]]*(draft|unverified)' .claude/rules/*.md 2>/dev/null \
  | grep -vE '/(_|00-)' \
  || echo "draft/unverified の正本なし"

# (c) Spec Patrol Ledger の confirmed drift feature を seed に合算 (ADR-0017 D3)
#     op-spec-patrol が ledger push --drift-count で記録した feature の drift_counts が non-zero ならば
#     confirmed drift として cultivation 対象に加える。
#     Ledger Issue 番号は op-spec-patrol label + op-state label の Issue から解決する。
# フォールバック: Ledger なし / pull 失敗 / op spec-patrol 未導入の場合は (a)(b) のみで継続する。
LEDGER_ISSUE="$(gh issue list --label op-spec-patrol --label op-state --state open \
  --json number --jq '.[0].number // empty' 2>/dev/null || true)"
if [ -n "$LEDGER_ISSUE" ]; then
  # ledger pull で area_state を取得し、drift_counts が空でない feature を抽出する
  LEDGER_JSON="$(op spec-patrol ledger pull --issue "$LEDGER_ISSUE" 2>/dev/null || true)"
  if [ -n "$LEDGER_JSON" ]; then
    # drift_counts が {} でない feature のキー一覧を抽出する
    echo "$LEDGER_JSON" \
      | jq -r '.details.area_state // {} | to_entries[]
               | select(.value.drift_counts != null and (.value.drift_counts | length) > 0)
               | .key' 2>/dev/null \
      || echo "(c) drift_counts の解析失敗 — スキップ"
  else
    echo "(c) ledger pull 応答なし — Ledger 未初期化か op spec-patrol 未導入。スキップ"
  fi
else
  echo "(c) Spec Patrol Ledger Issue が見つからない — op spec-patrol 未導入か未初期化。スキップ"
fi
```

> drift-driven の seed は「stale 候補」(a)、「未成熟 status」(b)、「Spec Patrol Ledger の
> confirmed drift feature」(c) の和集合。
> `status: cultivated` で git 上も最新かつ Ledger 上の drift_counts もゼロな正本は seed から外れる
> (育成済みは後回し)。(c) の ledger pull が失敗 / Ledger 未導入の場合は (a)(b) のみで継続する。

### 1-2. feature 主役での構造化

1-1 で取得した種を feature の下にぶら下げる (同 feature の複数 issue は 1 行)。各行に以下を併記する:

| 列 | 内容 |
|----|------|
| feature | 正本の feature id (`.claude/rules/<feature>.md`)。issue から推定 |
| 正本 state | `exists` / `stale` / `missing` (`.claude/rules/<feature>.md` の有無 + git log で判定) |
| 紐づく issue | その feature に属す pending issue 番号群 |
| lane | 🟢 quick / 🔍 deep の **hint** (下記、最終振り分けは人間) |
| premise hint | ⚠前提あやしい / 出所 / confidence (issue 本文を読んでの所感) |

#### lane hint (quick/deep ハイブリッド、ADR-0017 決定6)

各 feature を 🟢 quick (軽い premise-check で済みそう) / 🔍 deep (3 者照合で深掘りが要りそう) のどちらかに
**controller が hint を付ける**。判断材料の例:

- 🟢 quick 寄り: 正本 state が `exists` で confidence 高 / issue が 1 本で前提が明快 / domain gap が薄そう
- 🔍 deep 寄り: 正本 state が `missing` / `stale` / premise hint に ⚠ / issue 複数で食い違いそう / domain gap が厚そう

> **最終振り分けは人間**。controller は track (lane) を勝手に確定せず、hint を併記するだけ。
> hint は人間の判断を助けるためのもので、人間は hint を覆してよい。

#### blind skip 防止 (必須)

- **全行を hint 付きで提示する**。controller の独断で行を drop したり track を確定したりしない。
- 「これは軽そうだから worklist に載せない」という **黙殺 (blind skip) を禁止**する。
  軽く見える feature も 🟢 quick として行を残し、人間が見える状態にする。
- 人間が「これは見なくていい」と判断したものだけ worklist から外す (判断は人間に残す)。

worklist の提示例 (mode と lane hint を反映):

```
[mode: issue-driven] 今の pending issue を feature (正本) 主役で整理しました。
lane は hint です (最終振り分けはあなたが決めてください)。

# | feature      | 正本 state | issue       | lane  | premise hint
--|--------------|-----------|-------------|-------|---------------------------
1 | billing      | stale     | #12, #15    | 🔍deep | ⚠ #15 は旧仕様前提の疑い
2 | auth/session | missing   | #20         | 🔍deep | 正本なし → 深掘りで lazy 構築
3 | op-sweep     | exists    | #22         | 🟢quick | confidence 高 (W1a で起こし済)

どの feature を深掘りしますか？ (番号指定 / 「全部」/ lane の振り分け変更も指定可
 / 軽い premise-check だけなら明示)
```

> **元症状の正攻法**: issue を feature 安定軸の下に構造化することで、揺れる issue 群を整理する (ADR-0017 決定6)。
> entry mode (issue-driven / feature-driven / drift-driven) は 1-0 を参照する。既定は issue-driven。

---

## フェーズ2: 深掘り (spec-expert spawn)

人間が選択した **feature 群を順に深掘りする** (複数 feature cultivation)。各 feature について
**isolated context で 3 者照合 → controller が report を受ける** を繰り返す。

> **進め方**: worklist で人間が選んだ feature を 1 つずつ取り出し、その feature について 2-1〜2-4 を回す。
> 1 feature が align まで済んだら次の feature に移る。lane が 🟢 quick の feature は軽い premise-check で
> 早く畳み、🔍 deep の feature は 3 者照合をしっかり回す (lane は 1-2 で人間が確定したもの)。
> done 判定はフェーズ3 末尾 (3-3) を参照する。

以下 2-1〜2-4 は **1 feature あたりの手順**である。

### 2-1. spec-expert を spawn (gather)

controller は以下のテンプレートで spec-expert を spawn する (「spec-expert spawn テンプレート」節を参照)。
spec-expert は隔離 context で正本 + code を読み、差分 (正本が古い / code が逸脱 / issue 前提が不一致) を根拠付きで返す。

### 2-2. present (human に提示)

spec-expert の返却 (`diff_summary` / `domain_gaps` / `premise_check` / `proposed_spec_update`) を、
human が判断できる形に整理して **根拠付きで提示**する:

```
feature: billing の 3 者照合結果です。

[差分]
- spec_stale: 正本「既定値 7 日」⟷ code は 14 日 (src/billing/charge.rs::default_grace)
- code_deviation: 正本「auto/* のみ」⟷ code が release/* も対象 (...)

[domain gap — あなたの判断が必要]
- ? なぜ grace を 14 日に延ばしたか (code に理由なし、TODO: needs-human)

[premise check]
- #15 の前提「この関数は X を返す」→ 実コードは Y (premise_violated)

どう解消しますか？ (正本を code に合わせる / code を正本に合わせる / 方向修正 など)
```

### 2-3. align (human の domain 知識で解消)

human と対話し、食い違いを解消する。ここで human の頭の domain 知識が引き出される (= 正本 narrative の素材)。
align できた fact のみ、出典付きで `[human]` 化する (出典なき human 主張は `[?]` のまま)。

### 2-4. lazy 構築分岐 (正本 missing 時)

正本 state が `missing` の場合、spec-expert に code から正本 skeleton 候補を抽出させ (lazy / demand-driven)、
align しながら正本を構築する。**code 由来 = `[code]`、domain / why = `[?] TODO: needs-human`** (捏造禁止)。
詳細手順は `expert-spec/SKILL.md` の「lazy 構築」節を参照する。

---

## フェーズ3: 記録

align が済んだ feature/issue について、2 つの write 先に記録する (ADR-0017 決定9)。

### 3-1. write 先1: 正本側 (.claude/rules/<feature>.md)

**align 済みの fact のみ**を正本に write する。`.claude/rules/_schema.md` の 6 節 / 決定行書式に従う。

- 核 (不変則 / 決定 / 用語) の update + narrative (ドメイン) 追記
- 各 fact に provenance タグ (`[code]` / `[human]` / `[?]`) を付ける
- **捏造禁止**: align していない domain / why は `[?] TODO: needs-human` のまま残す。空欄を捏造で埋めない
- 決定行に「実現した issue/PR」を追記する (linkage B: `realizes #NN`、詳細は 3-2 末尾)

#### 3-1-a. linkage A (正本 ⟷ 正本、cross-feature) を張る

照合中に cross-feature 依存 (この feature の code が他 feature に依存している等) が見つかったら、
正本どうしを `[[feature/section]]` inline ref で繋ぐ (ADR-0017 決定9 linkage A、memory の `[[name]]` と同型)。
schema 定義は `.claude/rules/_schema.md` が正本 (ここでは「書く側」の手順だけ)。

書き方:

- **「関連 (Links)」節**に `[[feature/section]]` を 1 行追記する (`- [[<related-feature>/<section>]] — <関係の説明>`)
- 関係が特定の決定に紐づくなら、**該当決定行**にも `([[feature/section]], realizes #NN)` の形で inline ref を付ける (決定行書式は `_schema.md`)
- 解決先 = `00-constitution.md` の Part2 feature 索引のキー (`feature:` id)。索引に無い feature を指す場合は、その旨を `[?]` で残すか human に確認する
- relationship 説明は **捏造禁止に従い provenance を付ける**:
  - `[code]` = コード依存が根拠 (import / 呼び出し等を Read 確認した場合)
  - `[human]` = 人間が「この feature は X に依存する」と確定した場合 (出典付き)
  - `[?] TODO: needs-human` = 関係を推測したが未確認の場合 (binding にしない)

> **書く前に human align**: linkage A も正本 write の一部なので、`[[]]` を張るのも **human 承認 gate を通す**
> (勝手に cross-feature link を確定しない)。spec-expert が surface した候補 (`cross_feature_link_candidates[]`,
> expert-spec/SKILL.md §4) は **候補**であって、実際に張るかは controller + human が決める。

> **W3 への委譲**: broken-link 検出 / back-link (逆参照) 自動生成 / 索引自動生成は **W3 (op-spec-patrol)** の担当。
> op-spec (本スキル) は **`[[]]` を張る側** だけを担い、リンクの検証・逆参照は作らない。

### 3-1b. derived issue 発行 (G1+enrich、ADR-0017 D2/D4/D5)

3-1 の正本 write で確定した「正本↔code gap のうち実装が必要なもの」を、derived issue として起票できる。
**D2 (発行責務 = op-spec のみ・人間 align 後)** に従い、以下の 5 ステップを経てから起票する。
起票するかどうかは per-gap で必ず human に確認する (捏造禁止・自動起票なし)。

> **発火条件**: 3-1 の正本 write で gap を記録し、かつ「この gap は実装で解消すべき」と human が align した場合のみ。
> ✏️ 方向修正の gap (修正方針が確定した) も同様に対象となる。
> ⛔/⏸️ の gap は起票しない。align していない gap は `[?] TODO: needs-human` のまま正本に残す。

#### ステップ1: align gate (per-gap で human 承認)

正本 write が済んだ後、実装が必要な gap について per-gap で確認する:

```
gap: <feature>#<decision-id> — <gap の内容を 1 行で>
現在: code では <実態>、正本では <あるべき姿>

この gap を derived issue として起票しますか？
  y — 起票フロー (ステップ2〜5) へ
  n — 起票しない (gap は正本の [?] のまま残す)
```

#### ステップ2: fingerprint dedup

`_shared/dedup-policy.md` の fingerprint 生成仕様に従い fingerprint を組む。
`op-fingerprint: <domain>:<normalized_title>:<primary_file>:<symbol>` を生成し、
既存 open Issue と fingerprint が衝突しないか確認する。

```bash
# op core fingerprint で fingerprint 文字列を生成する (format drift 防止、正本: expert-spawn.md §fingerprint)
# --domain / --title / --file / --symbol の named 引数を使う (positional 渡しは clap が拒否する)
DERIVED_FP=$(op core fingerprint --plain \
  --domain feature \
  --title "<normalized_title>" \
  --file "<primary_file>" \
  --symbol "<symbol>" \
  2>/dev/null)
: "${DERIVED_FP:?op core fingerprint が fingerprint を返しませんでした}"

# op scan dedup で既存 Issue との重複判定 (op-plan フェーズ7 手本: op-plan/SKILL.md L696-726)
# op issue list --json は body raw を返さないため、手動 fingerprint 照合は使用しない
FINDING_DRAFT_PATH=$(mktemp /tmp/op-spec-derived-finding-XXXXXX.json)
cat > "$FINDING_DRAFT_PATH" <<EOF
{
  "domain": "feature",
  "title": "<normalized_title>",
  "files": ["<primary_file>"],
  "symbols": ["<symbol>"]
}
EOF
DEDUP_RESULT=$(op scan dedup --finding-json "$FINDING_DRAFT_PATH" --json --quiet 2>/dev/null)
DEDUP_DECISION=$(printf '%s' "$DEDUP_RESULT" | jq -r '.decision' 2>/dev/null)
rm -f "$FINDING_DRAFT_PATH"

case "$DEDUP_DECISION" in
  pass)
    # 重複なし → ステップ3 へ進む
    ;;
  block)
    # 既存 Issue と重複: issue_number を取り出してユーザーに提示して終了する
    MATCHED_NUM=$(printf '%s' "$DEDUP_RESULT" | jq -r '.details.matched_existing.issue_number // "不明"' 2>/dev/null)
    echo "fingerprint 衝突: 同内容の Issue #${MATCHED_NUM} が既に存在します"
    echo "→ 起票せず既存 Issue を提示します"
    # Direct Mode: ユーザーに既存 Issue 番号を示して終了する
    ;;
  *)
    # dedup 取得失敗または想定外値 → fail-closed でエラーを提示して中断する
    echo "dedup 判定に失敗しました ($DEDUP_DECISION)。手動で重複チェックを行ってから再試行してください。"
    ;;
esac
```

衝突あり (`block`) → 起票せず既存 Issue 番号を提示して終了。
衝突なし (`pass`) → ステップ3 へ進む。
dedup 失敗 (その他) → fail-closed でエラーを提示し、手動確認を促して中断する。

#### ステップ3: full enrichment (不変則8 必須)

**D5 (gate = full enrichment)** に従い、derived issue も `_shared/issue-enrichment.md` の full enrichment を通す。
op-spec は Direct Mode 固定のため、block 時は対話で human に判断を返す。

enrichment input を組む:

```json
{
  "issue_draft": {
    "title": "<gap の実装タイトル、例: [feature-expert] <feature> の <gap 内容> を実装する>",
    "body": "<指示書フル版。op-spec-ref marker / op-source marker / op-domain marker を含む (後述)>",
    "domain": "feature",
    "recommended_runner": "feature-expert",
    "scope_files": ["<gap に関連するソースパス>"],
    "new_files": [],
    "severity": "n/a",
    "fingerprint": "<ステップ2 で生成した fingerprint>"
  },
  "options": {
    "with_design_plan": "auto",
    "with_cross_review": "auto",
    "max_review_loops": 2,
    "strict": false
  }
}
```

`issue-enrichment.md §7.6` の controller オーケストレーション順序に従って実行する:

```
1. [pre-step] with_design_plan(bool) / cross_review_experts / task_complexity 等を解決する (§4/§6)
2. Workflow({name:'op-enrichment', args:{...}}) を呼び出す
3. §8 Output contract を受領 (result: enriched | blocked)
   - blocked → 起票せず escalation_report を human に提示して判断を仰ぐ:
     「1. 指摘を修正して再 enrichment / 2. キャンセル」
4. §7.5 Cross-instance Collision Gate (gh issue list 横断検索、workflow 後に必ず実行)
   - collision_gate.verdict == warn → similar_issues を提示し「このまま起票しますか？」と確認
   - collision_gate.verdict == block → 起票を停止して human に判断を返す
```

#### ステップ4: op issue create (marker 込み・直列)

enrichment が pass した後、marker-lint を通してから起票する。
起票直前の Marker Publish Validate (op-plan フェーズ7-2 と同パターン) を必ず実行:

```bash
# Issue 本文は Write tool で一時ファイルに書き出す (長文・特殊文字対応)
export DERIVED_BODY_FILE="/tmp/op-spec-derived-$(date +%s).md"
: "${DERIVED_BODY_FILE:?DERIVED_BODY_FILE must be set}"

# 本文には必ず以下の hidden marker を含める (ADR-0017 D4):
#   <!-- op-spec-ref: <feature>#<decision-id> -->  (発行元の正本決定を指す = linkage B + provenance)
#   <!-- op-source: op-spec -->
#   <!-- op-domain: feature -->
#   <!-- op-fingerprint: <fingerprint> -->

# 起票直前 Marker Publish Validate (op-plan フェーズ7-2 手本)
LINT_JSON=$(op core marker-lint --body - --source-hint issue-body --strict < "$DERIVED_BODY_FILE" 2>/dev/null) || true
LINT_DECISION=$(printf '%s' "$LINT_JSON" | jq -r '.decision' 2>/dev/null)
if [ "$LINT_DECISION" = "pass" ]; then
  # pass → 起票する (直列、並列化禁止: gh/op issue create の並列化は重複起票事故の元)
  NEEDED_LABELS=()
  NEEDED_LABELS+=("auto-report" "pro-feature-expert")
  export LABEL_CSV=$(IFS=,; echo "${NEEDED_LABELS[*]}")
  CREATE_JSON=$(op issue create \
    --title "<derived issue タイトル>" \
    --label "$LABEL_CSV" \
    --body-file "$DERIVED_BODY_FILE" \
    --ensure-labels)
  DERIVED_ISSUE_NUM=$(printf '%s' "$CREATE_JSON" | jq -r '.details.issue_number // empty' 2>/dev/null)
  : "${DERIVED_ISSUE_NUM:?op issue create が issue_number を返しませんでした}"
else
  # block → 起票せず、hidden marker を修正してから再起票するようユーザーに提示して停止する
  # (Direct Mode 固定、op-spec は --auto を持たない)
  echo "marker-lint block: $(printf '%s' "$LINT_JSON" | jq -c '.blocking_reasons // []' 2>/dev/null)"
  echo "→ hidden marker を修正してから再起票する (このまま起票しない)"
fi
```

#### ステップ5: back-link (正本への realizes 追記)

起票して得た `#DERIVED_ISSUE_NUM` を正本の該当決定行へ張り、linkage B 双方向を完成させる
(ADR-0017 決定9):

正本 `.claude/rules/<feature>.md` の該当決定行に `realizes #DERIVED_ISSUE_NUM` を追記する:

```
変更前: D-N: <決定内容> [code]
変更後: D-N: <決定内容> [code] (realizes #DERIVED_ISSUE_NUM)
```

これで linkage B が両端とも成立する:
- 正本 → issue: `(realizes #DERIVED_ISSUE_NUM)` (今ここで追記)
- issue → 正本: `<!-- op-spec-ref: <feature>#<decision-id> -->` (ステップ4 で issue 本文に埋め込み済)

> **捏造禁止**: ステップ1 で human align を経た gap のみ起票する。align なしに derived issue を捏造しない。
> 「gap の実装承認 (D2 align gate)」と「issue 本文の品質担保 (D5 enrichment cross-review)」は
> 層が違うため、どちらも省略しない。

### 3-2. write 先2: issue 側 (verdict)

選択した issue に方向性 verdict を付ける (ADR-0017 決定7)。verdict は 4 本:

| verdict | 意味 | 操作 |
|---------|------|------|
| ✅ 実装する | 方向性が定まった | issue に verdict コメント + op-run/op-codev へ handoff 候補 |
| ✏️ 方向修正して実装する | 修正方針付きで実装 (分割 / 統合を内包) | issue に修正方向を記録 |
| ⛔ やめる (close) | 前提が崩れた / 不要 | issue を close (理由付き) |
| ⏸️ 保留 | まだ判断材料が足りない | `needs:human-decision` / `manual_review_bucket` 流用 |

> 承認なしの一括 verdict 反映はしない。各 verdict は human 承認を経てから反映する。

#### linkage B (issue ⟷ 正本) は双方向ポインタ

linkage B は **issue 側と正本側の両端を張って初めて成立**する (ADR-0017 決定9):

| 端 | 張る場所 | 形 |
|----|---------|----|
| issue → 正本 | issue 本文 (3-2 でここに書く) | `<!-- op-spec-ref: <feature>#<decision> -->` |
| 正本 → issue | 正本の決定行 (3-1 でここに書く) | `([[feature/section]], realizes #NN)` |

> **一石二鳥** (決定9): derived issue が自分の **binding 正本セクション** を指すので、後で op-run / op-codev が
> その issue を実装する時、`op-spec-ref` を辿って **binding な正本を必ず読む**。つまり 1 本のリンクで
> 「provenance (どの決定から派生したか)」と「binding (実装時に読むべき正本)」が同時に成立する。
> だから 3-1 の `realizes #NN` と 3-2 の `op-spec-ref` は **対で張る** (片方だけにしない)。

### 3-3. done 判定 (worklist 進捗)

**done = 選択した全 feature/issue に verdict が付いた状態** (ADR-0017 決定7)。
verdict 4 本 (✅ 実装 / ✏️ 方向修正 / ⛔ やめる / ⏸️ 保留) のいずれかが付けば、その issue は「方向が定まった」とみなす
(⏸️ 保留も「保留と判断した」という verdict であり、未着手とは区別する)。

worklist の進捗は feature 主役で表現する。各 feature を done / pending で示し、残りを一目で分かる形にする:

```
[進捗] 選択した feature: 3 件
  ✓ done    | billing      | #12 ✅ / #15 ✏️ (全 issue に verdict)
  ✓ done    | op-sweep     | #22 ⛔ (close)
  … pending | auth/session | #20 (未 verdict、深掘り途中)

→ done: 2 / 3。残り auth/session を続けますか？
```

> done は「**選択した範囲**の全 feature/issue に verdict」であって、repo 全 issue の消化ではない
> (cultivation は段階的。今回 worklist に載せなかった feature は次回以降に回す = 3 原則の段階的育成)。
> 全 done になったら ripple-check (次節) → handoff に進むか、ユーザーに完了を報告して締める。

---

## フェーズ3.5: ripple-check (波及確認)

feature `<F>` の **決定 / 不変則** を update/write した直後に発火する。`<F>` に依存する他正本への
**波及 (ripple)** を可視化し、必要なら波及先を grooming worklist に積む (ADR-0017 決定9 cross-feature 連携)。

> **発火条件**: フェーズ3 (3-1) で `<F>` の `## 決定 (Decisions)` または `## 不変則 (MUST)` を変えた時のみ。
> 用語 / 落とし穴 / narrative だけの追記では発火しない (binding な核が動いた時だけ波及を見る)。

### 3.5-1. 依存元の検出 (直 grep traversal = back-link の代替)

`<F>` を参照している他正本 = `.claude/rules/*.md` のうち本文に `[[<F>...]]` を含むファイル
(`<F>.md` 自身は除外)。**直 grep traversal** で拾う:

```bash
: "${F:?ripple-check 対象 feature id (フェーズ3 で 決定/不変則 を更新した feature)}"

# <F> を参照している依存元正本を拾う (back-link を grep で代替、W3 索引最適化の前段)。
#   [[<F>/<section>]] と [[<F>]] の両形にヒットさせる: <F> の直後が / または ]] で終わる。
grep -rlE "\[\[${F}(/|\]\])" .claude/rules/*.md 2>/dev/null | grep -v "/${F}\.md$" \
  || echo "[[${F}]] を参照する正本なし (波及先なし)"
```

> `grep -rlE` の `-l` でヒットしたファイル名のみ取得し、`grep -v "/${F}\.md$"` で自己参照を除外する。
> `[[${F}(/|\]\])` は `[[billing/決定]]` (section 付き) と `[[billing]]` (section なし) の両方に当たる正規表現。

### 3.5-2. 波及の提示

依存元一覧を human に提示する。「`<F>` を変えた → これは依存元正本に波及しうる」を根拠付きで示す:

```
feature: billing の 決定/不変則 を変えました。
これは以下の正本に波及しうるので確認をおすすめします (各正本が billing を参照しています):

  - [[invoicing]]   (.claude/rules/invoicing.md が [[billing/決定]] を参照)
  - [[op-sweep]]    (.claude/rules/op-sweep.md が [[billing]] を参照)

波及先を grooming worklist に積みますか？ (積む正本を選択 / 全部 / 今回は積まない)
```

> 提示は「波及しうる」までで断定しない。実際に波及するかは依存元正本を深掘りしないと分からないため、
> 依存元を **候補として可視化**し、深掘りするかは human に委ねる (blind に確定しない = IU1 と同じ原則)。

### 3.5-3. worklist へ積む (grooming へ合流)

human が望めば、選んだ依存元正本を **grooming worklist に積む**。これはフェーズ1 の
**feature-driven / drift-driven seed に合流**する (= 「正本 → 深掘り」項目を新たに生む):

- 積んだ正本は次の cultivation 周回で feature 主役 worklist (1-2) に並ぶ (正本 state + lane hint 付き)。
- 積むかどうか・どれを積むかは **human 判断**。controller が勝手に worklist へ確定追加しない。
- 「今回は積まない」を選べる。波及の気づきだけ残して締めてもよい (段階的育成)。

> **W2/W3 境界**: 直 grep traversal は W2 の暫定実装。正本数が少ないうちは全 `.claude/rules/*.md` を
> grep しても十分速い。**索引による O(近傍) 最適化 / back-link (逆参照) の自動保持 / broken-link 検出** は
> **W3 (op-spec-patrol)** が索引自動生成で担う。op-spec (本スキル) は「変更時に grep で依存元を拾って提示し、
> 望めば worklist へ積む」所までを担う (リンクグラフの永続化・検証は作らない)。

---

## handoff

verdict が付いた issue を疎結合で handoff する:

- ✅ / ✏️ verdict の issue → **op-run / op-codev** へ。各 issue は「1 行 (title + verdict + `op-spec-ref` link)」で中身は正本へ飛ばす (op-run plan lean 化、ADR-0017 OQ7)
- handoff は op-spec が自動起動しない。「この issue を op-run/op-codev に回しますか？」と human に確認して委ねる

---

## spec-expert spawn テンプレート

op-spec controller は以下のテンプレートで spec-expert を spawn する。

```
Agent({
  subagent_type: "spec-expert",
  model: "opus",
  description: "op-spec 3 者照合: <feature> ⟷ code ⟷ human",
  prompt: `
invocation_mode: op_managed

# 照合タスク

feature: <feature id>
spec_path: .claude/rules/<feature>.md   # missing なら lazy 構築モード
target_issues: [#NN, #MM]               # この feature に紐づく pending issue
issue_premises:                         # 各 issue が前提とする挙動 (controller が抽出)
  - issue: #NN
    premise: <issue が前提とする挙動 1 文>
code_scope:                             # 読むべき code 範囲 (paths から)
  - <src/feature/**>

# リポジトリ情報

repo_root: <git rev-parse --show-toplevel の結果>

# 指示

expert-spec/SKILL.md に従って以下を実行してください:
1. 正本 state 判定 (exists / stale / missing)
2. 3 者照合 (正本 ⟷ code) で差分検出 (spec_stale / code_deviation / premise_mismatch)
3. provenance タグ付与 (code 由来=[code] / domain・why=[?] TODO:needs-human、捏造禁止)
4. issue 前提の事実照合 (premise_check)
5. missing なら lazy 構築 (code から skeleton 候補抽出、domain は [?] で残す)
6. 返却契約スキーマで構造化返却 (正本 write はしない、proposed_spec_update を返すまで)

You must not ask interactive questions.
If information is missing, return it as assumptions[] or needs_human_decision.
  `
})
```

### 非対称についての注記

- **op-spec 自身**: Direct Mode (人間起動、align 対話あり、正本 write は human 承認 gate)
- **spec-expert**: OP-managed Mode (op-spec controller から spawn、質問で停止しない、read-only)

この非対称は意図的な設計。controller は human との align 対話と正本 write を担い、
spec-expert は隔離 context で機械的に 3 者照合して差分を返す。

### spec-expert を subagent_type に直接渡せる根拠

spec-expert は `active-expert-registry` 上は Utility Worker (registry 追加は別 IU) だが、
`agents/spec-expert.md` が存在するため `subagent_type: "spec-expert"` を直接渡せる。
op-report が `scout` を、op-codev が `feature-expert` を直接 subagent_type に渡すのと同じ前例に準じる。

---

## DO / DON'T (責務境界)

| DO | DON'T |
|----|-------|
| issue を feature 主役で worklist 化する | 並列 fan-out で大量 audit する (op-scan の領分) |
| 正本 ⟷ code ⟷ human の 3 者照合を回す | 自動マージする (op-merge の領分) |
| 正本を育てる (human align 後に write) | align なしに derived issue を自動起票する (捏造禁止・D2 align gate 必須) |
| align 済み gap を derived issue として full enrichment 経由で起票する (3-1b) | op-scan/op-plan の領分を侵す (bulk audit / 新規要望分解) |
| issue に方向性 verdict を付ける | ADR を起こす (op-architect の領分) |
| verdict 付き issue を op-run/op-codev へ handoff | op-run の cluster 実装をする (op-run の領分) |

---

## 設計判断グレーゾーン

本スキルは Direct Mode 固定のため、不明点はユーザーに確認してよい。

| グレー内容 | 対応 |
|----------|------|
| issue がどの feature に属すか曖昧 | worklist で推定を提示し、ユーザーに feature 帰属を確認 |
| 正本 state が exists か stale か微妙 | git log で code 更新時系列を見て判定。なお曖昧なら spec-expert に判定を委ねる |
| spec-expert が `code_deviation` でどちらが正か決められない | options を提示してユーザーに方向 (正本に合わせる / code に合わせる) を委ねる |
| domain gap が多くて align が長い | feature を 🔍 deep レーンに残す。軽い premise-check で済むなら spec-expert を premise-check スコープに絞って深掘りを軽くする (scout 流用は将来の選択肢、強制配線はしない) |
| 正本 write 内容に `[?]` が多い | 捏造で埋めず `[?] TODO: needs-human` のまま write し、後続 cultivation に残す |

---

## decision-record

ADR-0017 W1b で起こし、W2 で full 化した設計:

| 決定項目 | 確定内容 |
|---------|---------|
| 形態 | 新 OP skill (op-spec) + active 化した worker (spec-expert) + 教科書 (expert-spec) |
| mode | Direct Mode 固定 (OP-managed 経路なし)。正本 write は人間判断を伴うため |
| worklist | feature 主役で構造化 (元症状の正攻法)。entry mode = issue-driven (既定) / feature-driven / drift-driven + quick/deep lane hint (W2) |
| 深掘り | spec-expert を isolated context で spawn (3 者照合)。複数 feature を順に深掘り (W2)。Explore 型は使わない (rules を skip、ADR-0017 F3) |
| lazy 構築 | 正本 missing なら深掘りしながら code から構築 (demand-driven、捏造禁止) |
| linkage | A (正本 ⟷ 正本 cross-feature [[]]) + B (issue ⟷ 正本 双方向ポインタ、W2) |
| ripple-check | 決定/不変則 update 時に依存元正本を grep で拾い波及を提示、望めば worklist へ積む (W2) |
| 記録 | 正本 write (align 済みのみ) + issue verdict (4 本) + derived issue 発行 (3-1b、W5) + 複数 feature 進捗/done |
| スコープ | W2 で full 化済 (worklist 全モード + linkage A/B + ripple-check + 複数 feature)。W5 で derived issue 発行 (3-1b: align gate + fingerprint dedup + full enrichment + op issue create + back-link) を追加。索引自動生成 / broken-link 検出 / back-link 自動保持は W3 (op-spec-patrol) |

### 不変則7 例外宣言 (ADR-0017 決定6 / 決定9)

> **CLAUDE.md 不変則7 (Review / Apply / Post-check の責務分離) に以下の例外を宣言する。**
>
> op-spec skill は「正本 (.claude/rules/<feature>.md) を write する」mutation 責務を持つ。
> これは ADR-0017 決定6 (cultivation) / 決定9 (記録の機構: 2 write 先) で正当化される。
> op-sweep が ADR-0003 で「機械判定 housekeeping mutation」例外を持つのと同型だが、op-spec の write は
> 異なる性質で例外足り得る: **write は human align を経た後のみ・捏造禁止** (code 由来=[code] / domain=[?])。
> 「人間判断を要する align」と「確定した fact の記録」を混ぜず、align gate を必ず通すことで、
> 不変則7 の本質 (人間判断 finding と機械確定 apply を混ぜない) は守られる。
> なお spec-expert worker 自身は read-only で正本を write しない (write は controller のみ)。
> 他 OP skill は引き続き不変則7 に従い audit と apply を分離する。この例外は op-spec に限る。
