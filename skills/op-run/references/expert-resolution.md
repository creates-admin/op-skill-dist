# op-run: expert 解決と正規化 (フェーズ1-2-c / 1-2-d)

## 1-2-c. expert 解決ロジック (apply / post-check の決定)

Issue ごとに CLI で解決する (marker → `pro-*-expert` ラベル → fingerprint 第 1 segment の domain → `needs_human_decision` の順。
planned expert と `op-run-expert: spec-expert` の正規化も CLI 内で行う):

```bash
jq -n --argjson n "$N" --arg body "$BODY" --argjson labels "$LABELS_JSON" \
  '{issue_number:$n, body:$body, labels:$labels}' | op run expert-resolve --stdin
# payload: apply_expert / post_check_expert / decision_path / normalization_log / needs_human_decision
```

CLI 結果に次の規則を上乗せする:

1. env-expert + security signal → `security-expert`: 解決元が env-expert (`pro-env-expert` ラベルまたは
   `op-run-expert: env-expert`) で、本文またはラベルに security signal (`OSV` / `CVE-` / `GHSA-` / `advisory` /
   `vulnerab` / `dependency vulnerability` / `supply-chain` / `secret leak` / `credential exposure` / `permission risk` /
   `pro-security-expert`) を含む場合、CLI は `debug-expert` を返すが apply と post-check の両方を `security-expert` にする。
2. UI ファイル追従: apply が `designer-expert` / `feature-expert` で frontend / UI ファイルを触る場合は、
   marker / ラベルが無くても post-check に `ux-ui-audit-expert` を付ける。

`ux-ui-audit-expert` は実装しないため apply には来ない (ラベルだけの Issue も apply は `designer-expert`)。

## 1-2-d. Active Apply Expert Normalization (planned expert を runtime に漏らさない)

解決結果は `_shared/runtime-contract.md` §3-A (apply) / §3-B (post-check) の値域に限る。registry と agent frontmatter が
矛盾したら contract error で停止する (自動補正しない)。

- `needs_human_decision` になった Issue は spawn せず、Issue にコメントを残して manual_review_bucket に回す。
- `recommended_fix_expert: release-expert` (Review Fix Loop 等) は主題で再分類する (`_shared/planned-experts.md`「release-expert」)。
- 正規化後の expert を `cluster.expert` に上書きし、plan には正規化後の名前を出す。

適用範囲: 2-A 探知 / CO の apply spawn / 4.5 Review Fix Loop の `recommended_fix_expert` — `subagent_type` に渡す前のすべて。
