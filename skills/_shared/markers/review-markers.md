# Review Markers

review lifecycle の唯一の記録は PR body の review state 文書。コメントは人間向けの自然文だけで、機械は読まない。
review-expert の返却 payload は `op help payload review-finding`。

## `<!-- op-review-state -->` body block

### 位置

PR body の末尾 (`pr-templates.md` の PR 本文 footer の後) に、marker 行 + ` ```json ` fence で置く。
block が無い PR への初回 push は空 state から作る。手編集しない。

````markdown
<!-- op-review-state -->
## op review state

```json
{
  "schema_version": 1,
  "type": "review_state",
  "state_rev": 2,
  "updated_at": "2026-07-23T10:00:00Z",
  "last_write_id": "s1-postcheck-security-expert-r1",
  "op_run_session_id": "s1",
  "attempts": [
    {
      "review_round": 1,
      "review_result": "approve",
      "reviewed_head_sha": "1234567890abcdef1234567890abcdef12345678",
      "reviewed_at": "2026-07-23T09:50:00Z",
      "reviewer": "review-expert",
      "review_worktree_head_sha": "1234567890abcdef1234567890abcdef12345678",
      "findings": [
        {
          "id": "RVW-001",
          "result": "needs-fix",
          "severity": "medium",
          "lens": "Test",
          "scope": "new-issue",
          "recommended_fix_expert": "test-expert",
          "requires_post_check": null,
          "summary": "境界値のテストが無い",
          "file": "src/parse.rs"
        }
      ]
    }
  ],
  "post_checks": {
    "security-expert": {
      "post_check_result": "PASS",
      "audit_result": "PASS",
      "post_checked_head_sha": "1234567890abcdef1234567890abcdef12345678",
      "post_check_round": 1
    }
  },
  "specialist_reviews": [],
  "controller": null
}
```
````

### 読み書き

- `op review state pull --pr N [--input-json <素材>]` — state を読む。現在 round は `attempts[].review_round` の最大値
  (同一 round 重複時の tie-break は CLI が行う。呼び出し側で再実装しない)。
- `op review state push --pr N --apply-json <file|-> --write-id <id> [--session S] [--input-json <素材>]` — 1 push = 1 payload。
  `kind` は `attempt` / `post_check` (`expert` キー + entry) / `controller` / `specialist_review`。
- `op review publish-approval --pr N --session S --reviewer review-expert --verdict approve [--review-round R]` —
  approve attempt の push と `pro-reviewed` 付与を 1 コマンドで行う (mcp では 2 call-spec を順に emit)。
- mcp channel では pull / push / publish-approval とも `--input-json` (fresh な `search_pull_requests` 素材の file path) が必須。

### write_id 規約

同じ `write_id` の再送は NO_OP (冪等)。決定的なキーを使う:

| write | write_id |
|---|---|
| review attempt | `<session>-r<round>-attempt` |
| post-check | `<session>-postcheck-<expert>-r<N>` |
| specialist review | `<session>-r<round>-specialist-<RVW id>` |
| controller terminal | `<session>-terminal` |

aux post-check (security 起点の ux-ui-audit) は `post_checks` のキーを `<expert>@aux` にし、entry の `triggered_by` を `security-expert` にする。

runtime verify (op-run CO フェーズ5.7) の結果は `post_checks["verify-runner"]` に post-check と同じ `kind: "post_check"` で書く
(write_id も post-check の規約どおり `<session>-postcheck-verify-runner-r<N>`)。entry には次の任意 field を足せる。
どれも省略でき、書いた値は CLI が解釈せずそのまま保持する。値の決め方は `op-run/references/runtime-verify-dispatcher.md`「5. state 記録」。

| field | 型 | 内容 |
|---|---|---|
| `post_check_result` | string | `pass` / `pass_with_notes` / `block` / `needs_human_decision` / `skipped` (`audit_result` はその大文字) |
| `skip_reason` | string | skipped の理由。`harness_not_installed` / `all_means_failed` / `requires_runtime` |
| `evidence_paths` | string[] | 実在を確かめた証跡 (スクリーンショット等) の絶対パス |
| `repro_steps` | string[] | fail したシナリオの再現手順 (`[<シナリオ名>] <手順>` の 1 行ずつ) |
| `requires_runtime` | object[] | 検証しなかった範囲 `{scope, reason}` (`reason` は `windows unavailable` 等) |
| `gaps` | object[] | ハーネスが自動でやらず手作業で補った工程 `{step, manual_workaround, suggestion}` |

```json
"verify-runner": {
  "post_check_result": "pass_with_notes",
  "audit_result": "PASS_WITH_NOTES",
  "post_checked_head_sha": "1234567890abcdef1234567890abcdef12345678",
  "post_check_round": 1,
  "post_check_expert": "verify-runner",
  "evidence_paths": ["/abs/checkout/.verify-runner/20260925-102218-a1b2/top.png"],
  "requires_runtime": [{"scope": "installer 画面", "reason": "windows unavailable"}],
  "gaps": []
}
```

### finding

field の必須性・null 許可範囲は `op help payload review-finding`。`recommended_fix_expert` は提案であり、最終 apply 担当は op-run の解決ロジックが決める。
