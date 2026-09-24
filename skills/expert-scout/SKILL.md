---
name: expert-scout
description: scout に preload される方法論。実在確認 gate・起票手順・返却スキーマ。
---

# expert-scout: scout agent の知識ベース

op-report controller から渡された単一 finding を、実在確認 → 起票前ゲート → 起票 or 構造化返却する手順。

## 1. 実在確認 gate

静的根拠 (Read / Grep / Glob) のみで次のいずれかに判定する。

| 値 | 条件 | 動作 |
|---|---|---|
| `confirmed` | finding が実在すると静的に確認できた (`evidence_grade` は `direct` か根拠が複数ある `inferred`) | 2 章の手順で起票 |
| `not_confirmed` | 根拠が見当たらない / 実行時にしか確認できない (`requires_runtime`) / 状況証拠が 1 本のみ / 「可能性がある」レベル | 起票せず返却 |
| `duplicate` | 2 章の重複チェックで既存 Issue と一致 | 起票せず `existing_issue` を返却 |
| `needs_human_decision` | 既存パターンが複数で基準が定まらない / deprecated 資産が絡み可否不明 / 設計意図が静的に復元できない / 解釈が複数ある / 類似 Issue がある (warn) | 起票せず返却。`options` / `recommended_option` / `safest_default` を含める |

severity は起票可否に使わない (ラベルと本文の記述にのみ使う。判定基準は `~/.claude/skills/_shared/severity-rubric.md`)。

## 2. 起票手順 (`confirmed` のときのみ)

起票前ゲートの正本は `~/.claude/skills/_shared/filing-gate.md` (op-report の起票前レビュー = scout の実在確認)。1 件ずつ次の順で行う。

1. fingerprint 生成: `op core fingerprint --plain --domain <domain> --title "<title>" --file <files[0]> [--symbol <symbol>]`
2. 重複チェック: finding を JSON に書き、`op scan dedup --finding-json draft.json --json` を実行する。
   - 重複 → `duplicate` で返す。類似 (warn) → 起票せず `needs_human_decision` で返す (既存 Issue の URL を options に含める)
   - `OP_GITHUB_CHANNEL=mcp` では既存 Issue を `mcp__github__search_issues` で取得して保存し `--input-json <file>` で渡す
     (`~/.claude/skills/_shared/github-channel.md` §6)
3. 本文組立: `~/.claude/skills/_shared/pr-templates.md`「Issue 本文 (指示書フル版)」。marker は同ファイル「Issue 本文 hidden marker」、
   `op-run-expert` / `op-post-check-expert` の値とラベルは「domain → marker / ラベル表」で決める。
   severity ラベル (`severity:<critical|high>`) は severity が Critical / High のときだけ付ける。
4. lint → 起票:

   ```bash
   op core marker-lint --body-file body.md --source-hint issue-body --strict
   op issue create --title "<title>" --body-file body.md --label "auto-report,pro-<op-run-expert>[,severity:<critical|high>]" --ensure-labels
   ```

   mcp channel では `op issue create` が call-spec を emit する。scout 自身が `github-channel.md` §3〜§4
   (verbatim 実行 → `issue_read` で read-back → `op issue ingest-result`) を完遂し、ingest の出力を正とする。
   VerifyFailed は自動リトライせず、orphan URL を `needs_human_decision` に載せて返す
5. 返却に `filed_issue_url` を含める

## 3. 返却スキーマ (JSON)

controller への要約テキストは 1 行。詳細は JSON に入れる。

```json
{
  "result": "filed | not_confirmed | duplicate | needs_human_decision",
  "filed_issue_url": "https://github.com/owner/repo/issues/N",
  "finding_summary": "finding の 1〜2 文要約",
  "evidence": "静的根拠 (ファイル:行 + 観測内容)、または根拠が得られなかった旨",
  "evidence_grade": "direct | inferred | requires_runtime",
  "existing_issue": "https://github.com/owner/repo/issues/N",
  "needs_human_decision": { "required": true, "...": "schema は invocation-mode.md" },
  "assumptions": ["確認できなかった項目の推定"]
}
```

| フィールド | 必須条件 |
|---|---|
| `result` | 常時 |
| `filed_issue_url` | `filed` 時 |
| `evidence` / `evidence_grade` | `not_confirmed` 時必須、それ以外も推奨 (`filed` 時は本文にも転記) |
| `existing_issue` | `duplicate` 時 |
| `needs_human_decision` | `needs_human_decision` 時 (正規スキーマは `~/.claude/skills/_shared/invocation-mode.md`) |
| `assumptions` | 推定がある時 |
