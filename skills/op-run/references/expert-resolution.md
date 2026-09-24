# op-run: expert 解決と正規化 (フェーズ1-2-c / 1-2-d)

## 1-2-c. expert 解決ロジック (apply / post-check の決定)

Issue ごとに CLI で解決する (marker `op-run-expert` / `op-post-check-expert` → `pro-*-expert` ラベル (二重ラベル固定解決を含む) →
fallback の順、planned expert の正規化も CLI 内で行う):

```bash
jq -n --argjson n "$N" --arg body "$BODY" --argjson labels "$LABELS_JSON" \
  '{issue_number:$n, body:$body, labels:$labels}' | op run expert-resolve --stdin
# payload: apply_expert / post_check_expert / decision_path / normalization_log / needs_human_decision
```

CLI 結果に対して、次の規則を **CLI 結果より優先して** 適用する:

1. **env-expert + security signal → `security-expert`**: 解決元が env-expert (`pro-env-expert` ラベルまたは
   `op-run-expert: env-expert`) で、本文またはラベルに security signal (`OSV` / `CVE-` / `GHSA-` / `advisory` /
   `vulnerab` / `dependency vulnerability` / `supply-chain` / `secret leak` / `credential exposure` / `permission risk` /
   `pro-security-expert`) を含む場合、CLI は `debug-expert` を返すが `security-expert` を採用する。
2. **UI ファイル追従**: apply が `designer-expert` / `feature-expert` で frontend / UI ファイルを触る場合は、
   marker / ラベルが無くても post-check に `ux-ui-audit-expert` を付ける。
3. **domain fallback**: `decision_path: fallback` (marker もラベルも無い) のときは、`op-fingerprint` の第 1 segment を domain として
   `_shared/clustering.md` Step 6 の category → expert 表で解決する (`ux-ui` → apply `designer-expert` / post-check `ux-ui-audit-expert`)。
   fingerprint も無ければ `needs_human_decision`。

`ux-ui-audit-expert` は実装しないため apply には来ない (ラベルだけの Issue も apply は `designer-expert`)。

## 1-2-d. Active Apply Expert Normalization (planned expert を runtime に漏らさない)

Runtime expert resolution MUST return one of:

- an active expert listed in `~/.claude/skills/_shared/active-expert-registry.md`,
- the internal enum `needs_human_decision`,
- a documented planned-skip,
- or abort.

It MUST NOT return a planned expert (env / release / compatibility), an op-run-routing-excluded Utility Worker
(spec-expert / scout; `op-run-expert: spec-expert` は `feature-expert` へ正規化), or an unregistered expert as a spawn target.
spawn 許可の根拠は registry の登録のみ。marker / label は判断材料にとどめる。registry と agent frontmatter が矛盾したら
contract error で停止する (自動補正しない)。planned expert の substitute 基準の正本は `_shared/planned-experts.md`。

- `needs_human_decision` になった Issue は spawn せず、Issue にコメントを残して manual_review_bucket に回す。
  内部 enum は `needs_human_decision`、GitHub ラベルは `needs:human-decision` (変換はラベル操作の境界でのみ行う)。
- `recommended_fix_expert: release-expert` (Review Fix Loop 等) は release-expert を fallback 起点にせず、主題に基づいて
  **再分類** する (build / packaging failure → `debug-expert`、artifact / release script / config 構造 → `refactor-expert`、
  release / installer / updater / distribution / signing / versioning 方針 → `needs_human_decision`。正本は `planned-experts.md` の
  release-expert「Hard rule」節)。再分類の記録は `_shared/expert-spawn.md` の schema に従う。
- 正規化後の expert を `cluster.expert` に上書きし、plan には正規化後の名前を出す。

**適用範囲**: 2-A 探知 / CO の apply spawn / 4.5 Review Fix Loop の `recommended_fix_expert` — `subagent_type` に渡す前のすべて。
`cluster.expert` / 表示 / payload は bare 名を保持し、`op-skill:` の前置は `subagent_type` を渡す瞬間だけ行う
(`_shared/expert-spawn.md`「Plugin scoped-name 規約」)。
