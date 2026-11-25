# verify-runner 返却スキーマ (JSON)

controller への要約テキストは 1 行。詳細は JSON に入れる。パスはすべて絶対パス。

```json
{
  "result": "pass | fail | skipped",
  "skip_reason": "harness_not_installed | all_means_failed | requires_runtime",
  "failed_stage": "harness_start | scenario",
  "summary": "1〜2 文の要約",
  "harness": {
    "run_id": "...", "checkout": "/abs/checkout", "start_json": "/abs/.../start.json",
    "stop_status": "done | deferred", "stop_exit": 0, "stop_stderr_tail": "", "other_live_runs": ["<runId>"]
  },
  "scenarios": [
    {
      "name": "...",
      "result": "pass | fail",
      "means": "playwright_mcp | playwright_library | webdriver",
      "expected": "期待した結果",
      "actual": "観測した結果",
      "evidence": ["/abs/.../scenario.png"],
      "repro_steps": ["1. <target URL> を開く", "2. ... をクリック", "3. 期待: ... / 実際: ..."]
    }
  ],
  "evidence_paths": ["/abs/.../scenario.png", "/abs/.../probe.json"],
  "requires_runtime": [{ "scope": "検証しなかったシナリオ名", "reason": "windows unavailable | windows busy | windows not provisioned", "detail": "任意の補足" }],
  "means_attempts": [{ "means": "playwright_mcp", "status": "ok | failed | not_applicable", "error": "verbatim" }],
  "probe": { "exit": 0, "output_path": "/abs/.../probe.json" },
  "gaps": [{ "step": "手作業が要った工程", "manual_workaround": "やったこと", "suggestion": "ハーネスに足すと良いこと" }],
  "assumptions": [],
  "needs_human_decision": { "required": true, "...": "schema は invocation-mode.md" }
}
```

| フィールド | 必須条件 |
|---|---|
| `result` / `summary` / `means_attempts` / `gaps` | 常時 (`gaps` は無ければ空配列) |
| `skip_reason` | `skipped` 時 |
| `failed_stage` | `fail` 時 |
| `harness` | start を実行した時。`stop_exit` / `stop_stderr_tail` は `stop_status: done`、`other_live_runs` は `deferred` の時。`deferred` を受けた controller は `deferred-stop.md` に従う |
| `requires_runtime` | 常時 (無ければ空配列)。検証しなかった範囲ごとに 1 要素。`detail` は任意 (`windows-target.md`) |
| `scenarios` / `evidence_paths` | `pass` / `fail` 時。`pass` のシナリオは `evidence` にスクリーンショットを 1 枚以上 |
| `repro_steps` | `fail` のシナリオ |
| `probe` | start が成功した時 (`all_means_failed` では必須) |
| `assumptions` | 常時 (無ければ空配列)。SKILL.md 2.2 で stop を判断した時は同節の前提を含める |
| `needs_human_decision` | 判断不能時 (正規スキーマは `~/.claude/skills/_shared/invocation-mode.md`) |

`result` は実行したシナリオだけで決める。全シナリオが pass なら `pass`、1 本でも fail なら `fail`。
実行できたシナリオが 0 本で、検証しなかった範囲がすべて `requires_runtime` に載っているときは `skipped` (`skip_reason: requires_runtime`)。

`requires_runtime` は `result` と併存する。空でない `requires_runtime` を持つ `pass` は検証した範囲だけの pass であり、全体の pass ではない。
controller はこれを ADR-0034 決定 5 の `requires_runtime` として受け取る (その後の扱いは controller 側の手順)。
