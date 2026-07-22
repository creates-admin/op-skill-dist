---
name: expert-scout
description: scout agent の方法論教科書。単一 finding の実在確認 gate・起票手順・lite enrichment 契約・返却スキーマを集約する。直接 invoke は想定せず、agent.md の skills フィールド経由で自動プリロードされる前提で動作する知識ベース。
---

# expert-scout: scout agent の知識ベース

<!--
機能概要: scout agent が op-report controller から単一 finding を受け取り、
         実在確認→lite enrichment→起票 or 構造化返却を行う際に参照する方法論教科書。
作成意図: scout は active-expert-registry 外の utility worker のため、
         方法論を本ファイルに集約して agent.md を心臓のみに絞る。
         op-scan 同等品質を lite enrichment で担保しつつ、Design Plan / cross-review を省く
         「隔離 context で単一確認→起票」特化の教科書として設計。
注意点: agent から skills: [expert-scout] で自動プリロードされる前提。
       直接 /expert-scout のような起動は想定しない。
-->

## このドキュメントの位置づけ

scout agent (`~/.claude/agents/scout.md`) が `skills: [expert-scout]` で本ファイルを自動プリロードする。
agent は以下の手順・gate・スキーマに従って自走する:

- **実在確認 gate** (4 値判定の定義)
- **起票 6 手順** (正本への canonical 参照のみ、再定義禁止)
- **lite enrichment 契約** (collision gate のみ、不変則8)
- **返却契約スキーマ** (controller への構造化返却)
- **参照ドキュメント表** (正本一覧と schema_version pin)

---

## 1. 実在確認 gate — 4 値判定の定義

scout の核心判定。静的根拠のみで 4 値のいずれかを選択し、判定結果に従って動作する。

### confirmed

**条件**: Read / Grep / Glob の静的根拠で finding が実在すると確認できた。

- 実在確認ができれば **severity に関係なく全件起票する** (Low severity でも起票する)
- evidence_grade は `direct` または `inferred` (requires_runtime は confirmed 不可)
- 複数の独立した根拠が揃えば confidence が高まる

**動作**: 起票 6 手順に進む。

### not_confirmed

**条件**: 以下のいずれかに該当する。

- 静的根拠が見当たらない
- 実行時にしか確認できない (`requires_runtime`)
- 状況証拠のみで断定できない (`inferred` かつ根拠が 1 本のみ)
- 「可能性がある」「テストすれば分かる」レベル

**動作**: 起票しない。`result: not_confirmed` + evidence + evidence_grade を返却する。

### duplicate

**条件**: fingerprint 照合で既存 Issue と一致した。

- `_shared/dedup-policy.md` の手順で fingerprint を生成して照合する
- 照合前に起票しない (dedup は必須前処理)

**動作**: 起票しない。`result: duplicate` + `existing_issue` (既存 Issue URL) を返却する。

### needs_human_decision

**条件**: 以下のいずれかで判断不能。

- 既存パターンが複数あって起票基準が定まらない
- deprecated / 廃止中の資産が関与していて再利用可否が不明
- 設計意図が静的解析で復元できない
- finding の解釈が複数あってどれかを選べない

**動作**: 起票しない。`result: needs_human_decision` を `_shared/expert-spawn.md` の正規スキーマで返却する。
`options` / `recommended_option` / `safest_default` を必ず含める。

---

## 2. 起票 6 手順 (canonical 参照のみ — 再定義禁止)

confirmed になった場合のみ実行する。各手順の正本を参照し、再定義しない (不変則1)。

| # | 手順 | 正本 |
|---|------|------|
| 1 | **severity 判定** (起票可否でなくラベル付与のみ) | `_shared/severity-rubric.md (>=4)` |
| 2 | **fingerprint 生成 + dedup 照合** | `_shared/dedup-policy.md (>=3)` |
| 3 | **Issue body 組立** (指示書フォーマット・marker 埋め込み) | `_shared/pr-templates.md (>=13)` |
| 4 | **hidden marker 付与** (`op-source: op-report` 等) | `_shared/markers/labels-and-markers.md (>=9)` |
| 5 | **lite enrichment 実行** (collision gate のみ §7.5) | `_shared/issue-enrichment.md (>=2)` §7.5 のみ |
| 6 | **marker-lint 検証 → `op issue create`** | `_shared/expert-spawn.md (>=16)` Marker Publish Validate 節 |

### 手順の補足

**手順 2 (fingerprint + dedup)**:
- fingerprint は手書きせず `op core fingerprint --plain ...` で生成する (`expert-spawn.md §369` 参照)
- dedup 照合は `op scan dedup --finding-json <draft.json>` で実行する
- 照合で既存 Issue が見つかった場合は `duplicate` として返却し、手順 3 以降に進まない
- OP_GITHUB_CHANNEL=mcp (Cloud) では gh fetch が fail-closed になるため、素材を
  `github-channel.md` §6 の手順 (search_issues) で取得し `--input-json` で渡す (詳細は §6 参照)

**手順 5 (lite enrichment)**:
- collision gate (`_shared/issue-enrichment.md §7.5`) **のみ** 実行する
- §5 (Design Plan 生成) は呼ばない
- §6 (cross-review) は呼ばない
- collision gate が block を返した場合は起票せず `needs_human_decision` として返却する
- mcp channel では、collision gate の EXISTING 素材に手順 2 で取得した同一の search 由来 JSON を再利用する。
  **§7.5 の `gh issue list` fence は mcp channel では実行しない** (gh 不達で EXISTING が空になり、
  gate が warning なしに clear へ silent 縮退するため — 素材は必ず search 由来 JSON を使う)

**手順 6 (marker-lint → 起票)**:
- `op issue create --title ... --body-file ... --label "auto-report,..." --ensure-labels` 前に
  必ず `op core marker-lint --body - --source-hint issue-body --strict` で検証する
- lint が pass してから `op issue create` を実行する
- 起票後、返却値に `filed_issue_url` を含める
- mcp channel では `op issue create` が call-spec を emit する。この場合 scout 自身が
  `github-channel.md` §3-§4 の protocol (verbatim MCP 実行 → issue_read read-back →
  `op issue ingest-result`) を隔離 context 内で完遂してから `filed_issue_url` を返す。
  MCP tool の schema は ToolSearch で load する

---

## 3. lite enrichment 契約 (不変則8)

scout は Issue 起票前に **lite enrichment** のみを実行する。
フル enrichment (Design Plan + cross-review) は呼ばない。

### 実行するもの

- **collision gate** (`_shared/issue-enrichment.md §7.5`): 既存 Issue との衝突確認
  - fingerprint と title の双方でチェックする
  - block 判定 → 起票しない、`needs_human_decision` で返却

### 実行しないもの

| 項目 | 理由 |
|------|------|
| §5 Design Plan 生成 | 不変則8: op-scan 由来 finding への Design Plan は op-scan / op-plan の責務 |
| §6 cross-review | 不変則8: single finding の隔離確認に cross-review は不要かつ token 過剰 |
| ux-ui-audit gate | フル enrichment 経路のみで発動する gate、lite では回さない |

### lite / full の判断基準

scout は常に lite。full enrichment が必要な場合は、controller (op-report) が判断して op-scan / op-plan へ委譲する。

---

## 4. 返却契約スキーマ (JSON)

scout は controller に以下の JSON を返す。controller への要約テキストは 1 行のみ。詳細は JSON 各フィールドへ格納する。

```json
{
  "result": "filed | not_confirmed | duplicate | needs_human_decision",

  "filed_issue_url": "https://github.com/owner/repo/issues/N",

  "finding_summary": "finding の内容を 1〜2 文で要約",

  "evidence": "静的根拠の説明 (ファイル名:行番号 + 観測内容)",

  "evidence_grade": "direct | inferred | requires_runtime",

  "existing_issue": "https://github.com/owner/repo/issues/N",

  "needs_human_decision": {
    "required": true,
    "decision_type": "behavior | scope",
    "question": "判断を求める内容",
    "options": ["選択肢A", "選択肢B"],
    "recommended_option": "選択肢A",
    "safest_default": "選択肢A",
    "blocking": true
  },

  "assumptions": [
    "推定した内容 (確認できなかった項目)"
  ]
}
```

### フィールド説明

| フィールド | 必須条件 | 説明 |
|-----------|---------|------|
| `result` | 常時必須 | 4 値のいずれか |
| `filed_issue_url` | result = filed 時必須 | 起票した Issue の URL |
| `finding_summary` | 常時推奨 | finding の 1〜2 文要約 |
| `evidence` | not_confirmed 時必須 | 静的根拠または根拠が得られなかった旨 |
| `evidence_grade` | not_confirmed 時必須 | `direct` / `inferred` / `requires_runtime` |
| `existing_issue` | result = duplicate 時必須 | 既存 Issue の URL |
| `needs_human_decision` | result = needs_human_decision 時必須 | `_shared/expert-spawn.md` 正規スキーマに従う |
| `assumptions` | 推定がある場合 | 確認できなかった項目の推定内容 |

`needs_human_decision` フィールドの正規スキーマは `_shared/expert-spawn.md` を参照する (再定義しない)。

---

## 5. 参照ドキュメント表 (Single Canonical Source)

| Path | 役割 | schema_version pin |
|------|------|-------------------|
| `skills/_shared/severity-rubric.md` | severity 判定 (起票ラベル付与) | `(>=4)` |
| `skills/_shared/dedup-policy.md` | fingerprint 生成 + dedup 照合 | `(>=3)` |
| `skills/_shared/pr-templates.md` | Issue body 組立 / 指示書フォーマット | `(>=13)` |
| `skills/_shared/markers/labels-and-markers.md` | hidden marker 付与 / op-source enum | `(>=9)` |
| `skills/_shared/issue-enrichment.md` | lite enrichment 契約 (§7.5 collision gate のみ) | `(>=2)` |
| `skills/_shared/expert-spawn.md` | Marker Publish Validate 節 / needs_human_decision 正規スキーマ / fingerprint CLI helper | `(>=16)` |
| `skills/_shared/runtime-contract.md` | runtime spawn 境界 / apply 可否 | `(>=1)` |
| `skills/_shared/github-channel.md` | GitHub I/O channel / call-spec protocol (mcp channel 時の実行手順) | `(>=2)` |
| `skills/_shared/invocation-mode.md` | OP-managed Mode 契約 (Direct Mode なし) | — |
