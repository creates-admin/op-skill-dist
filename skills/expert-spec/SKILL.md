---
name: expert-spec
description: spec-expert agent の方法論教科書。正本 ⟷ code ⟷ human の 3 者照合・provenance タグ規約・present/align/decide フロー・返却契約スキーマ・lazy 構築手順を集約する。直接 invoke は想定せず、agent.md の skills フィールド経由で自動プリロードされる前提で動作する知識ベース。
---

# expert-spec: spec-expert agent の知識ベース

<!--
機能概要: spec-expert agent が op-spec controller から照合タスクを受け取り、
         正本 state 判定 → 3 者照合 → provenance 付き差分検出 → 構造化返却 (または lazy 構築) を行う際に
         参照する方法論教科書。
作成意図: spec-expert は active-expert-registry 外の Utility Worker のため、方法論を本ファイルに集約して
         agent.md を心臓 (役割・契約・禁止) のみに絞る。ADR-0017 決定6 gather (深い仕様解決 investigator) の
         「正本 ⟷ code ⟷ human 3 者照合」を担う教科書として設計。捏造禁止 (決定12) を全工程で貫く。
注意点: agent から skills: [expert-spec] で自動プリロードされる前提。直接 /expert-spec のような起動は想定しない。
       正本 schema そのものは ADR-0017 決定3 / 対象 repo の .claude/rules/_schema.md が正本。
       本ファイルで schema を再定義せず pointer に留める (Single Canonical Source Rule = CLAUDE.md 不変則1)。
-->

## このドキュメントの位置づけ

spec-expert agent (`~/.claude/agents/spec-expert.md`) が `skills: [expert-spec]` で本ファイルを自動プリロードする。
agent は以下の手順・規約・スキーマに従って自走する:

- **3 者照合の核** (正本 state 判定 + 差分検出ロジック)
- **provenance タグ規約** (`[code]` / `[human]` / `[?]`、捏造禁止)
- **present → align → decide フロー** (controller + human との役割分担)
- **返却契約スキーマ** (controller への構造化返却)
- **lazy 構築** (正本 missing 時の demand-driven 抽出)
- **参照ドキュメント表** (正本一覧と schema_version pin)

### 核心概念

spec-expert は **「気づけない (前提ズレ)」を潰す装置**である (ADR-0017 決定6)。
agent が freelancing (drift / silent fork / wrong-premise 実装) する前に、
正本 (あるべき姿) と code (実態) と human (domain 知識) の 3 者を照合し、ズレを根拠付きで顕在化させる。

照合は read-only。**書き換えはしない**。
正本 write は op-spec controller が human align を経た後にだけ行い、spec-expert は差分と候補を返すまでで閉じる。
これは CLAUDE.md 不変則7 (audit / apply 分離) の厳守であり、ADR-0017 決定9 の write 責務分離と一貫する。

---

## 1. 3 者照合の核

spec-expert の本体。正本 state を判定し、正本が言うこと ⟷ code の実態 の差分を検出する。

### 1-1. 正本 state 判定 (exists / stale / missing)

controller から渡された feature について、`.claude/rules/<feature>.md` の状態を 3 値で判定する。

| state | 条件 | 動作 |
|-------|------|------|
| `exists` | 正本が存在し、内容が code の現状とおおむね整合している | 差分検出 (1-2) を実行 |
| `stale` | 正本は存在するが、code が進んで正本が追従漏れしている | 差分検出 + `spec_stale` を `diff_summary` に記録 |
| `missing` | 正本が存在しない (まだ起こされていない) | lazy 構築 (5 章) に入る |

> **staleness は git log で判定する** (ADR-0017 決定3)。正本 frontmatter の手書き日付ではなく、
> `git log` で正本ファイルと対象 code ファイルの更新時系列を突き合わせて「code が動いたのに正本未追従」を見る。
> 正本に `last_updated:` のような日付フィールドは存在しない (手動日付は必ず drift する)。

### 1-2. 差分検出ロジック (正本が言うこと ⟷ code の実態)

正本の **上位 3 節 (核: 不変則 + 決定 + 用語)** を起点に、各 fact が code の実態と一致するかを確認する。
差分は 3 型に分類する:

| 差分型 | 検出のしかた | 例 |
|--------|-------------|---|
| `spec_stale` | 正本の決定 / 不変則が古く、code が新しい挙動に進んでいる | 正本「既定値は 7 日」だが code は 14 日 |
| `code_deviation` | code が正本の決定 / 不変則を破っている | 正本「auto/* のみ削除」だが code が他 prefix も削除 |
| `premise_mismatch` | 紐づく issue の前提が実コードと食い違う | issue「この関数は X を返す前提で直す」だが実コードは Y |

検出の鉄則:

1. **正本が言う構造を該当ソースで Read 確認する**。grep ヒットだけで「一致 / 不一致」を断定しない
2. **行番号でなくファイル + シンボル名で示す**。行番号は変わりうる (ADR-0017 _schema.md)
3. **実行時にしか確認できない差分は断定しない**。`evidence_grade: requires_runtime` として返し、verdict を保留する

---

## 2. provenance タグ規約 (捏造禁止 = ADR-0017 決定12)

各差分・各 fact には **出所タグ**を付ける。これは捏造を構造的に抑える安全弁であり、
正本 schema の正規定義は ADR-0017 決定3 / `.claude/rules/_schema.md` が正本 (本節は運用ガイド)。

| タグ | 意味 | binding か | 付ける条件 |
|------|------|-----------|-----------|
| `[code]` | code から証明できる事実 (検証可)。巡回が code と機械照合できる | binding | **該当ソースを Read して実在・正確性を確認した上で**のみ付ける |
| `[human]` | 人間が authoritative に確定した事実 | binding | **出典 (会話日付 / 根拠) 必須**。read-back 確認を経た時のみ |
| `[?]` | unverified。`TODO: needs-human` 併記 | **binding にしない** | code に無い why / domain / intent はすべてこれ |

### 捏造禁止ルール (最重要)

> **自動抽出は code から証明できることだけ。domain / intent / why は捏造せず、
> 明示的に `[?] TODO: needs-human` とし、人間の深掘り (3 者照合の align) が埋めるまで binding にしない。**

これを破ると、正本そのものが「気づけない wrong premise」の発生源になり本末転倒になる (正本不在より悪化する)。

- code から読み取れる構造 (entity / API シグネチャ / 既定値 / 分岐ロジック) → ソースを Read 確認の上 `[code]`
- 「なぜそうなっているか」「業務ルール」「将来の意図」 → code に無いので **書かず** `[?] TODO: needs-human`
- `[human]` を詐称しない。machine は `[code]` の一致しか検証できず、要約に混ぜた捏造を `[human]` と詐称しても検出できない。
  出典の無い human 主張は巡回が機械的に `[?]` へ降格する (ADR-0017 決定3 F6)

spec-expert は read-only worker なので、自分で `[human]` を確定することはできない。
human align で確定すべき素材は `domain_gaps[]` に `[?] TODO: needs-human` として列挙し、controller + human に委ねる。

---

## 3. present → align → decide フロー

3 者照合は 4 段階 (gather → present → align → decide) のうち、spec-expert は **gather** を担い、
present / align / decide は controller + human が担う (ADR-0017 決定6)。役割分担を明確にする。

| 段階 | 担当 | 内容 |
|------|------|------|
| **gather** | **spec-expert** | 隔離 context で正本 + code を読み、差分 (正本が古い / code が逸脱 / issue 前提が不一致) を根拠付きで report。controller は report だけ受ける |
| **present** | controller | human に discrepancy + premise check を **根拠付き** 提示する |
| **align** | human (controller が司会) | human の domain 知識で食い違いを解消する。ここで human の頭の domain 知識が引き出される (= 正本 narrative の素材) |
| **decide** | controller + human | verdict + 正本 update を確定する → 記録へ |

spec-expert の出力 (gather の report) が present の素材になる。だから:

- discrepancy は human が判断できる粒度で、**根拠 (ファイル + シンボル) 付き**で返す
- 「どちらが正か」を spec-expert が勝手に決めない。`code_deviation` でどちらが正か判断不能なら `needs_human_decision` に積む
- domain 知識で埋まる空欄は `domain_gaps[]` に `[?]` で残し、align が埋めるのを待つ

---

## 4. 返却契約スキーマ (JSON)

spec-expert は controller に以下の JSON を返す。controller への要約テキストは短く、詳細は JSON 各フィールドへ格納する。

```json
{
  "spec_state": "exists | stale | missing",

  "feature": "<対象 feature id>",
  "spec_path": ".claude/rules/<feature>.md",

  "code_facts": [
    {
      "claim": "code から証明できる事実 (1 文)",
      "provenance": "code",
      "source": "src/billing/charge.rs::calculate_total",
      "evidence_grade": "direct | inferred | requires_runtime"
    }
  ],

  "diff_summary": [
    {
      "diff_type": "spec_stale | code_deviation | premise_mismatch",
      "spec_says": "正本が言っていること",
      "code_reality": "code の実態",
      "source": "src/billing/charge.rs::calculate_total",
      "evidence_grade": "direct | inferred | requires_runtime"
    }
  ],

  "domain_gaps": [
    {
      "question": "code に無い why / 業務ルール (1 文)",
      "provenance": "?",
      "todo": "needs-human"
    }
  ],

  "premise_check": {
    "issue_ref": "#NN",
    "premise": "issue が前提とする挙動",
    "result": "premise_ok | premise_violated | unverifiable",
    "evidence": "実コードでの観測 (ファイル + シンボル)"
  },

  "aligned_state": "not_aligned",

  "proposed_spec_update": {
    "section": "決定 | 不変則 | 用語 | 落とし穴 | ドメイン",
    "draft": "正本に追記/修正する候補テキスト (align 前の候補。確定は controller + human)",
    "provenance_of_draft": "code | ?"
  },

  "cross_feature_link_candidates": [
    {
      "from_feature": "<照合中の feature id>",
      "to_feature": "<依存先 feature id>",
      "evidence": "src/billing/charge.rs::calculate_total (依存を観測した file + symbol)",
      "provenance": "code | ?"
    }
  ],

  "needs_human_decision": {
    "required": true,
    "decision_type": "spec | behavior",
    "reason": "判断が必要な理由 (1〜2 文)",
    "options": [
      {"id": "A", "label": "正本を code に合わせる", "consequence": "..."},
      {"id": "B", "label": "code を正本に合わせる (derived issue 発行)", "consequence": "..."}
    ],
    "recommended_option": "A | B | none",
    "safest_default": "...",
    "blocked_actions": ["..."],
    "can_continue_without_decision": true,
    "next_safe_action": "..."
  },

  "assumptions": [
    "推定した内容 (確認できなかった項目)"
  ]
}
```

### フィールド説明

| フィールド | 必須条件 | 説明 |
|-----------|---------|------|
| `spec_state` | 常時必須 | `exists` / `stale` / `missing` |
| `code_facts[]` | 常時推奨 | `[code]` provenance + ファイル + シンボル名 (行番号でなく) |
| `diff_summary[]` | 差分がある時 | 3 差分型 + spec_says ⟷ code_reality + 根拠 |
| `domain_gaps[]` | code に無い why がある時 | `[?] TODO: needs-human` として列挙。align が埋める素材 |
| `premise_check` | 対象 issue がある時 | issue 前提が実コードと一致するかの結果 |
| `aligned_state` | 常時必須 | spec-expert は align しないので常に `not_aligned` (align は human の領分) |
| `proposed_spec_update` | 更新候補がある時 | align 前の **候補**。確定は controller + human |
| `cross_feature_link_candidates[]` | cross-feature 依存に気づいた時 (任意) | 照合中に見つけた他 feature への依存 (linkage A 候補)。`evidence` に file + symbol、`provenance` は `code` (依存を Read 確認) / `?` (推測)。**候補提示まで** — 実際に `[[]]` を張るかは controller + human (spec-expert は read-only ゆえ正本に書かない) |
| `needs_human_decision` | 判断不能時必須 | `_shared/expert-spawn.md` の正規スキーマに従う (再定義しない) |
| `assumptions[]` | 推定がある時 | 確認できなかった項目の推定内容 |

`needs_human_decision` フィールドの正規スキーマは `_shared/expert-spawn.md` / `_shared/invocation-mode.md` を参照する (再定義しない)。

---

## 5. lazy 構築 (正本 missing 時)

`spec_state: missing` の場合、spec-expert は code から正本の素材を抽出して構築を助ける。
ただし **demand-driven (議題になった範囲だけ)** で、捏造禁止を貫く (ADR-0017 決定12)。

### 構築の鉄則

1. **議題範囲だけ**: controller が指定した issue / feature が触れる code 範囲だけを抽出する。feature 全体を網羅しようとしない (lazy = demand-driven)
2. **code 由来は `[code]`**: entity / API シグネチャ / 既定値 / 分岐ロジックは該当ソースを Read 確認の上 `[code]` 付きで抽出する
3. **domain / why は `[?]`**: 「なぜこの設計か」「業務ルール」は code に無いので **書かず** `[?] TODO: needs-human` として残す。align が埋める
4. **派生要約を作らない**: source は 1 ファイル (正本本体)。別の要約ファイルを作らない (ADR-0017 決定3)

### 構築の出力

lazy 構築の結果は `proposed_spec_update` に **正本 skeleton の候補**として返す
(`.claude/rules/_schema.md` の 6 節 skeleton に沿う)。
spec-expert は **正本ファイルを write しない**。write は op-spec controller が human align を経た後に行う。

skeleton の埋め方:

- `## 不変則 (MUST)` / `## 決定 (Decisions)` / `## 用語 (Glossary)` — code から証明できる範囲を `[code]` で
- `## ドメイン (なぜ/背景)` — code に無い human 知識の本体。埋まらないなら `[?] TODO: needs-human`
- 埋まらない節を捏造で埋めない (空欄のまま `[?]` で残す)

---

## 6. 参照ドキュメント表 (Single Canonical Source)

| Path | 役割 | schema_version pin |
|------|------|-------------------|
| `op-tools/docs/adr/0017-canonical-spec-architecture.md` | 本 worker の存在根拠 / 3 者照合 / 捏造禁止 / write 責務の正本 (決定6 / 9 / 12 / 14) | — (ADR) |
| 対象 repo の `.claude/rules/_schema.md` | 正本 schema / provenance タグ / 捏造禁止 authoring 規約 (定義の正本は ADR-0017 決定3) | — (meta) |
| `skills/_shared/invocation-mode.md` | OP-managed Mode 契約 (Direct Mode なし) / `needs_human_decision` 正規スキーマ | `(>=1)` |
| `skills/_shared/expert-spawn.md` | spawn schema / Marker Publish Validate 節 / `needs_human_decision` 正規スキーマ | `(>=16)` |
| `skills/_shared/runtime-contract.md` | runtime spawn 境界 / Utility Worker 扱い / apply 可否 | `(>=1)` |
| `skills/_shared/dedup-policy.md` | derived issue 発行時の fingerprint 照合・dedup ポリシー | `(>=3)` |
