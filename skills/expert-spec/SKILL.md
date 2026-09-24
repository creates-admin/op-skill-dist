---
name: expert-spec
description: spec-expert に preload される方法論。3 者照合・provenance タグ・返却スキーマ・lazy 構築。
---

# expert-spec: spec-expert agent の知識ベース

spec-expert は正本 (あるべき姿)・code (実態)・human (domain 知識) の 3 者を照合し、前提ズレを根拠付きで顕在化させる。
照合は read-only。正本 write は op-spec controller が human align を経た後にだけ行う。
正本 schema の正規定義は対象 repo の `.claude/rules/_schema.md` (本ファイルは運用ガイド)。

## 1. 3 者照合の核

### 1-1. 正本 state 判定

| state | 条件 | 動作 |
|---|---|---|
| `exists` | 正本があり、code の現状とおおむね整合 | 差分検出 (1-2) |
| `stale` | 正本はあるが code が進んで追従漏れ | 差分検出 + `spec_stale` を記録 |
| `missing` | 正本が無い | lazy 構築 (5 章) |

staleness は `git log` で正本ファイルと対象 code の更新時系列を突き合わせて判定する (正本に手書き日付フィールドは無い)。

### 1-2. 差分検出

正本の核 (不変則 + 決定 + 用語) を起点に、各 fact が code と一致するかを確認する。

| 差分型 | 検出 | 例 |
|---|---|---|
| `spec_stale` | 正本の決定が古く、code が新しい挙動に進んでいる | 正本「既定値 7 日」、code は 14 日 |
| `code_deviation` | code が正本の決定 / 不変則を破っている | 正本「auto/* のみ削除」、code は他 prefix も削除 |
| `premise_mismatch` | issue の前提が実コードと食い違う | issue「X を返す前提で直す」、実コードは Y |

- 正本が言う構造を該当ソースで Read 確認する。grep ヒットだけで断定しない
- 行番号でなくファイル + シンボル名で示す
- 実行時にしか確認できない差分は `evidence_grade: requires_runtime` とし、判定を保留する

## 2. provenance タグ規約

| タグ | 意味 | binding | 付ける条件 |
|---|---|---|---|
| `[code]` | code から証明できる事実 | yes | 該当ソースを Read して実在・正確性を確認した上でのみ |
| `[human]` | 人間が authoritative に確定した事実 | yes | 出典 (会話日付 / 根拠) 必須。read-back 確認を経たときのみ |
| `[?]` | unverified。`TODO: needs-human` 併記 | no | code に無い why / domain / intent はすべてこれ |

捏造禁止: 自動抽出は code から証明できることだけ。domain / intent / why は書かず `[?] TODO: needs-human` とし、
人間が埋めるまで binding にしない。

- entity / API シグネチャ / 既定値 / 分岐ロジック → Read 確認の上 `[code]`
- 「なぜそうなっているか」「業務ルール」「将来の意図」 → `[?] TODO: needs-human`
- `[human]` を詐称しない (機械は `[code]` しか照合できない)。出典の無い human 主張は巡回が `[?]` へ降格する
- spec-expert は `[human]` を確定できない。align で確定すべき素材は `domain_gaps[]` に列挙する

## 3. present → align → decide フロー

spec-expert の担当は gather (正本 + code を読み、差分を根拠付きで返す) まで。present / align / decide は controller と human が行う。
discrepancy は human が判断できる粒度で返し、どちらが正かは決めない (判断不能な `code_deviation` は `needs_human_decision`、
domain 知識で埋まる空欄は `domain_gaps[]` に `[?]` で残す)。

## 4. 返却契約スキーマ (JSON)

controller への要約テキストは短く、詳細は JSON に入れる。

```json
{
  "spec_state": "exists | stale | missing",
  "feature": "<feature id>",
  "spec_path": ".claude/rules/<feature>.md",
  "code_facts": [
    { "claim": "code から証明できる事実", "provenance": "code",
      "source": "src/billing/charge.rs::calculate_total", "evidence_grade": "direct | inferred | requires_runtime" }
  ],
  "diff_summary": [
    { "diff_type": "spec_stale | code_deviation | premise_mismatch", "spec_says": "...", "code_reality": "...",
      "source": "src/billing/charge.rs::calculate_total", "evidence_grade": "direct | inferred | requires_runtime" }
  ],
  "domain_gaps": [ { "question": "code に無い why / 業務ルール", "provenance": "?", "todo": "needs-human" } ],
  "premise_check": { "issue_ref": "#NN", "premise": "issue が前提とする挙動",
    "result": "premise_ok | premise_violated | unverifiable", "evidence": "ファイル + シンボルでの観測" },
  "proposed_spec_update": { "section": "決定 | 不変則 | 用語 | 落とし穴 | ドメイン",
    "draft": "align 前の候補テキスト", "provenance_of_draft": "code | ?" },
  "cross_feature_link_candidates": [
    { "from_feature": "<feature>", "to_feature": "<依存先 feature>", "evidence": "file + symbol", "provenance": "code | ?" }
  ],
  "needs_human_decision": { "required": true, "decision_type": "spec | behavior", "...": "schema は invocation-mode.md" },
  "assumptions": ["確認できなかった項目の推定"]
}
```

| フィールド | 必須条件 | 備考 |
|---|---|---|
| `spec_state` | 常時 | |
| `code_facts[]` | 推奨 | `[code]` + ファイル + シンボル名 |
| `diff_summary[]` | 差分がある時 | |
| `domain_gaps[]` | code に無い why がある時 | align の素材 |
| `premise_check` | 対象 issue がある時 | |
| `proposed_spec_update` | 更新候補がある時 | 候補にすぎない。確定は controller + human |
| `cross_feature_link_candidates[]` | 他 feature への依存に気づいた時 (任意) | 候補提示まで。`[[]]` を張るかは controller + human |
| `needs_human_decision` | 判断不能時 | 正規スキーマは `~/.claude/skills/_shared/invocation-mode.md`。options は「正本を code に合わせる」/「code を正本に合わせる (derived issue 発行)」が基本 |
| `assumptions[]` | 推定がある時 | |

## 5. lazy 構築 (正本 missing 時)

1. 議題範囲だけ: controller が指定した issue / feature が触れる code 範囲だけを抽出する (feature 全体を網羅しない)
2. code 由来は `[code]`: entity / API シグネチャ / 既定値 / 分岐ロジックを Read 確認の上で抽出する
3. domain / why は `[?] TODO: needs-human`: 埋まらない節を捏造で埋めない
4. 派生要約を作らない: source は正本 1 ファイルのみ

結果は `proposed_spec_update` に `.claude/rules/_schema.md` の skeleton に沿った候補として返す
(`## 不変則 (MUST)` / `## 決定 (Decisions)` / `## 用語 (Glossary)` は `[code]` で、`## ドメイン (なぜ/背景)` は多くが `[?]`)。
正本ファイルは write しない。
