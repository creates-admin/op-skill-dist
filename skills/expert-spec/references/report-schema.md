# spec-expert 返却契約スキーマ (JSON)

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
  "domain_questions": [ { "question": "人に聞く業務ルール / 理由 / 例外の扱い", "section": "不変則 | 決定 | 用語 | 落とし穴 | ドメイン",
    "why_needed": "答えが無いと正本のどこが埋まらないか", "provenance": "?" } ],
  "premise_check": { "issue_ref": "#NN", "premise": "issue が前提とする挙動",
    "result": "premise_ok | premise_violated | unverifiable", "evidence": "ファイル + シンボルでの観測" },
  "proposed_spec_update": [
    { "section": "決定 | 不変則 | 用語 | 落とし穴 | ドメイン",
      "draft": "align 前の候補テキスト", "provenance_of_draft": "code | ?",
      "target_kind": "layer | domain | feature", "target_feature": "<書き先の正本キー> | null", "needs_lazy_build": false,
      "placement": "_schema.md「段と置き場所」の判定手順のどの問いにどう答えて段を決めたか (1〜3 行)" }
  ],
  "trim_plan": [
    { "section": "正本の節", "excerpt": "段落の抜粋", "class": "A | B | C | D | E | F",
      "action": "keep | reshape | delete | move | ask", "move_to": "E の移し先 (skill / doc/ のパス)。consolidate は .claude/rules/<feature>.md#<節>",
      "pointer_needed": false, "chars": 0 }
  ],
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
| `domain_questions[]` | code に無い why がある時。lazy 構築時は必須 | align で人に聞く質問 |
| `premise_check` | 対象 issue がある時 | |
| `proposed_spec_update[]` | 更新候補がある時 | 書き先 (正本と節) ごとに 1 要素。候補にすぎない。確定は controller + human。書き先の正本が無ければ `target_feature: null` と `needs_lazy_build: true`。判定手順の答えが「書かない (D・E・F)」の決まりは要素にしない。答えが constitution の決まりは要素にせず `needs_human_decision` で返す |
| `trim_plan[]` | mode: trim / consolidate の時 / op-spec-patrol の audit で指示された時 | SKILL.md 6 章。`pointer_needed` は consolidate の時だけ |
| `cross_feature_link_candidates[]` | 他 feature への依存に気づいた時 (任意) | 候補提示まで。`[[]]` を張るかは controller + human |
| `needs_human_decision` | 判断不能時 | 正規スキーマは `~/.claude/skills/_shared/invocation-mode.md`。options は「正本を code に合わせる」/「code を正本に合わせる (derived issue 発行)」が基本 |
| `assumptions[]` | 推定がある時 | |
