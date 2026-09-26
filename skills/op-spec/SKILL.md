---
name: op-spec
description: 正本 (.claude/rules/<feature>.md) を対話で育てる Direct Mode 固定スキル。pending issue を feature 主役で worklist 化し、spec-expert spawn で「正本 ⟷ code ⟷ human」3 者照合 → align → 正本 write + issue verdict まで回す。「op-spec」「正本」「cultivation」「仕様照合」「issue 整理」等のキーワードで起動。
effort: medium
---

# op-spec: 正本育成対話スキル

対象 repo の各 feature の正本 (`.claude/rules/<feature>.md`) を対話で育てる。pending issue を feature 主役で
worklist 化し、spec-expert に「正本 ⟷ code ⟷ human」の 3 者照合をさせ、human と align しながら正本を育て、
issue に方向性 verdict を付けるところまで回す。issue は揺れるが feature (正本) は安定するので、feature を主役に据えて issue 群を整理する。

## 3 原則

1. 人間起動専用 — op-spec 自体を OP-managed で起動しない (`_shared/invocation-mode.md`「Direct 固定 skill に op_managed が渡った場合」)。spawn する spec-expert には `op_managed` を渡す
2. 3 者照合 — 深掘りは spec-expert を isolated context で spawn し、正本 (あるべき姿) ⟷ code (実態) ⟷ human (domain 知識) を突き合わせる
3. 段階的育成 — 選択した feature/issue に verdict が付くまで進める。承認なしの一括 write / 一括 verdict はしない。実装はしない (op-run / op-codev へ handoff)

## 参照

| Path | 役割 |
|------|------|
| `expert-spec` skill (spec-expert に preload) | 3 者照合・provenance タグ・present/align/decide・返却契約スキーマ・lazy 構築 |
| 対象 repo の `.claude/rules/_schema.md` | 正本 schema / provenance タグ / 6 節 skeleton / 決定行書式 |
| `references/worklist-entry-modes.md` | entry mode 別の worklist 種取得。1-0 でモードを選んだ直後に読む |
| `references/spec-expert-spawn-template.md` | spec-expert spawn の literal prompt。2-1 で読む |
| `references/derived-issue-procedure.md` | derived issue 起票手順。3-1b で起票すると決めた時のみ読む |
| `references/spec-trim.md` | trim mode の手順。1-0 で trim を選んだ時に読む |

---

## フェーズ0: 環境確認

`_shared/common-setup.md`「フェーズ0 git/gh env check 標準手順」を実行する (gh channel で未認証なら中断)。
`.claude/rules/_schema.md` か `00-constitution.md` が無い repo は OP 未移行。先に `/op-skill:op-adopt` (正本の土台と feature 地図) を案内して終了する。
土台があり個別 feature の正本が無いだけなら 2-4 の lazy 構築で作る。
`_schema.md` に「書くもの・書かないもの」「大きさ」節が無ければ、`~/.claude/skills/_shared/templates/rules-schema.md` との差分を示し、承認後に追記する。

---

## フェーズ1: Worklist 構築

### 1-0. entry mode 選択

ユーザーが明示しなければ issue-driven。trim 以外の mode は seed 後に 1-2 の feature 主役構造化に合流する。

| mode | 起点 | 主用途 |
|------|------|--------|
| **issue-driven** (既定) | pending issue → 属す feature を推定して畳む | 散らかった issue 群の整理 |
| **feature-driven** | `.claude/rules/*.md` の正本一覧 + 紐づく issue | feature 単位で正本を見直す |
| **drift-driven** | code が正本より新しい feature / `status: draft・unverified` / Spec Patrol Ledger の confirmed drift | 腐った・未 cultivated な正本から育てる |
| **trim** | 大きさの上限を超えている正本 | 実装の詳細・手順・経緯を削って細くする (`references/spec-trim.md`) |

正本を俯瞰したいときは `/op-skill:op-rules` (read-only ビューア) を案内してよい。

### 1-1. worklist 種の取得

`references/worklist-entry-modes.md` の選んだ mode の節だけ読んで実行する。

### 1-2. feature 主役での構造化

種を feature の下にぶら下げる (同 feature の複数 issue は 1 行)。各行の列:

| 列 | 内容 |
|----|------|
| feature | 正本の feature id。issue から推定 |
| 正本 state | `exists` / `stale` / `missing` (正本ファイルの有無 + git log で code が正本より新しいか) |
| 紐づく issue | その feature に属す pending issue 番号群 |
| lane | 🟢 quick (軽い premise-check) / 🔍 deep (3 者照合) の hint |
| premise hint | ⚠前提あやしい / 出所 / confidence |

- lane は hint。🟢 寄り = state `exists` で issue 1 本・前提明快、🔍 寄り = `missing` / `stale` / ⚠ / issue 同士が食い違う。最終振り分けは人間。
- blind skip 禁止: 全行を hint 付きで提示する。controller の独断で行を drop しない。外すのは人間が判断したものだけ。

```
[mode: issue-driven] pending issue を feature (正本) 主役で整理しました。lane は hint です。

# | feature      | 正本 state | issue    | lane    | premise hint
1 | billing      | stale     | #12, #15 | 🔍deep  | ⚠ #15 は旧仕様前提の疑い
2 | auth/session | missing   | #20      | 🔍deep  | 正本なし → lazy 構築
3 | op-sweep     | exists    | #22      | 🟢quick | confidence 高

どの feature を深掘りしますか？ (番号 / 「全部」/ lane 変更も可)
```

---

## フェーズ2: 深掘り (spec-expert spawn)

人間が選んだ feature を 1 つずつ取り出し、2-1〜2-4 を回す。align まで済んだら次の feature へ。
🟢 quick は premise-check に絞って早く畳み、🔍 deep は 3 者照合をしっかり回す。

### 2-1. spec-expert を spawn (gather)

`references/spec-expert-spawn-template.md` のテンプレートで spawn する。spec-expert は read-only で正本 + code を読み、
差分 (spec_stale / code_deviation / premise_mismatch) を根拠付きで返す。

### 2-2. present (human に提示)

返却 (`diff_summary` / `domain_questions` / `premise_check` / `proposed_spec_update`) を根拠付きで提示する:

```
feature: billing の 3 者照合結果です。

[差分]
- spec_stale: 正本「既定値 7 日」⟷ code は 14 日 (src/billing/charge.rs::default_grace)
- code_deviation: 正本「auto/* のみ」⟷ code が release/* も対象

[domain question — あなたの判断が必要]
- ? なぜ grace を 14 日に延ばしたか (code に理由なし)

[premise check]
- #15 の前提「この関数は X を返す」→ 実コードは Y (premise_violated)

どう解消しますか？ (正本を code に合わせる / code を正本に合わせる / 方向修正 など)
```

### 2-3. align (human の domain 知識で解消)

human と対話して食い違いを解消する。align できた fact のみ出典付きで `[human]` にする (出典なき主張は `[?]` のまま)。
`domain_questions` は 1 問ずつ聞き取り、答えを出典 (会話日付) つきの `[human]` で書く。
どちらが正か決められない `code_deviation` は選択肢を示して human に委ねる。

### 2-4. lazy 構築 (正本 missing 時)

最初に kind (`layer` / `feature`) を人に聞き、spawn prompt の `kind:` に渡す。
spec-expert に code から正本 skeleton 候補を抽出させ、2-3 の align (`domain_questions` の聞き取りを含む) を経て構築する。
手順は `expert-spec/SKILL.md`「lazy 構築」節。
正本を write したら、constitution Part 3 (機能地図) の該当行の正本列を `(未作成)` から feature キーに更新する。

---

## フェーズ3: 記録

align が済んだ feature/issue について、正本と issue の 2 箇所に記録する。

### 3-1. write 先1: 正本側 (.claude/rules/<feature>.md)

`_schema.md` の 6 節 / 決定行書式に従い、align 済みの fact のみ write する。

- 核 (不変則 / 決定 / 用語) の update + narrative 追記
- 各 fact に provenance タグ (`[code]` / `[human]` / `[?]`) を付ける。align していない domain / why は `[?] TODO: needs-human` のまま残す (捏造禁止、`expert-spec/SKILL.md`「2. provenance タグ規約」)
- 決定行に実現した issue/PR を `realizes #NN` で追記する (issue 側の `op-spec-ref` と対、3-2)
- write の前に `op spec-patrol list-specs --json` で対象正本の `chars` / `limit_chars` を確かめる。書き足すと上限を超えるなら、削る候補を D → E → F → C の順 (区分は `_schema.md`「書くもの・書かないもの」) に示して承認後に write する。A は候補にしない

#### 3-1-a. linkage A (正本 ⟷ 正本、cross-feature) を張る

cross-feature 依存が見つかったら `[[feature/section]]` で正本どうしを繋ぐ。張るかどうかは human 承認を通す
(spec-expert の `cross_feature_link_candidates[]` は候補にすぎない)。

- 「関連 (Links)」節に `- [[<related-feature>/<section>]] — <関係の説明>` を追記する
- 特定の決定に紐づくなら該当決定行にも `([[feature/section]], realizes #NN)` を付ける
- 解決先は `00-constitution.md` Part 2 索引の feature キー。索引に無い feature は `[?]` で残すか human に確認する
- 関係の説明にも provenance を付ける: `[code]` (import / 呼び出しを Read 確認) / `[human]` (出典付き) / `[?] TODO: needs-human` (推測)

リンク検証・逆参照・索引生成は op-spec-patrol の担当。op-spec は `[[]]` を張るだけ。

### 3-1b. derived issue 発行

正本 write で記録した gap のうち「実装で解消すべき」と human が align したもの (✏️ 方向修正で方針が確定した gap を含む) を
derived issue として起票できる。起票するかは per-gap で human に確認する。⛔ / ⏸️ の gap、align していない gap は起票しない。
手順は `references/derived-issue-procedure.md`。

### 3-2. write 先2: issue 側 (verdict)

| verdict | 意味 | 操作 |
|---------|------|------|
| ✅ 実装する | 方向性が定まった | verdict コメント + op-run / op-codev への handoff 候補 |
| ✏️ 方向修正して実装する | 修正方針付きで実装 (分割 / 統合を内包) | 修正方向を記録 |
| ⛔ やめる | 前提が崩れた / 不要 | 理由付きで close (`op issue close --issue N --comment ...`) |
| ⏸️ 保留 | 判断材料が足りない | `needs:human-decision` ラベル |

✅ / ✏️ の issue 本文には `<!-- op-spec-ref: <feature>#<decision> -->` を書き、正本の決定行 `realizes #NN` と対で張る
(片方だけにしない)。op-run / op-codev は `op-spec-ref` を辿って binding な正本を読む。

### 3-3. done 判定

done = 選択した範囲の全 feature/issue に verdict (⏸️ を含む) が付いた状態。進捗は feature 主役で示す:

```
[進捗] 選択した feature: 3 件
  ✓ done    | billing      | #12 ✅ / #15 ✏️
  ✓ done    | op-sweep     | #22 ⛔
  … pending | auth/session | #20 (深掘り途中)
→ done: 2 / 3。残り auth/session を続けますか？
```

全 done になったら ripple-check → handoff に進むか、完了を報告して締める。

---

## フェーズ3.5: ripple-check (波及確認)

feature `<F>` の `## 決定 (Decisions)` または `## 不変則 (MUST)` を変えた時だけ発火する。

```bash
: "${F:?}"
grep -rlE "\[\[${F}(/|\]\])" .claude/rules/*.md 2>/dev/null | grep -v "/${F}\.md$" || echo "波及先なし"
```

ヒットした依存元正本を「波及しうる」候補として提示し (断定しない)、grooming worklist に積むかを human に訊く
(選択 / 全部 / 積まない)。積んだ正本は次周回の 1-2 worklist に並ぶ。

---

## handoff

✅ / ✏️ の issue を op-run / op-codev へ回すか human に確認する (自動起動しない)。各 issue は
「title + verdict + `op-spec-ref`」の 1 行で示し、中身は正本に委ねる。

---

## 不変則9 例外宣言

op-spec は正本 (`.claude/rules/<feature>.md`) を write する mutation 責務を持つ (CLAUDE.md 不変則9 の例外)。
write は human align gate 通過後のみ。spec-expert worker は read-only で、write は op-spec controller のみ。
write には trim の削除 (消える文言の一覧を人が承認した後)、`_schema.md` の追従 (フェーズ0、承認後の追記)、
constitution Part 3 (機能地図) の行の更新を含む。
