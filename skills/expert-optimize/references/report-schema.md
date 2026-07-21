# Report Schema — scan / apply の出力フォーマット

<!--
機能概要: optimize-expert の scan finding / apply 完了報告のスキーマと例。
作成意図: 報告フォーマットを厳密にすることで、op-scan / op-run / レビュー時に
         「数値で語れる」状態を維持する。
注意点: scan は _shared/expert-spawn.md の canonical schema に必ず準拠する。
       apply は templates/apply-report.schema.json と benchmark-report.md を併用する。
-->

## scan 出力 (canonical schema 準拠)

`_shared/expert-spawn.md` の **scan 共通スキーマ** に従う JSON 配列。
optimize-expert 固有の必須項目を強調した template:

```json
[
  {
    "title": "<60 文字以内、bottleneck の要約>",
    "severity": "critical | high",
    "severity_reason": "<判定根拠。入力規模・呼び出し頻度・観測可能な被害を含める>",
    "domain": "optimize",
    "files": ["path/to/file.ext:LINE"],
    "symbols": ["<関数名 / 構造体名>"],
    "summary": "<2-3 文の bottleneck 説明>",
    "evidence": "<該当コード 5-10 行>",
    "evidence_grade": "direct | inferred | requires_runtime",
    "reproduction_hint": "<requires_runtime のとき必須。再現コマンド / 入力 fixture>",

    "hypothesis": "<どこで何の理由で性能が破綻するか>",
    "excluded_hypotheses": [
      "<検討したが否定した可能性 X: 否定根拠>"
    ],
    "scope_in": ["path/to/touchable.ext"],
    "scope_out": ["<触ってはいけない範囲>"],

    "recommendation": {
      "type": "optimize | investigation",
      "steps": [
        "<改善ステップ 1>",
        "<改善ステップ 2>",
        "## 計測計画\n- baseline: <hyperfine / criterion コマンド>\n- 入力規模: small / medium / large\n- 期待される改善カテゴリ: algorithm | io | allocation | parallelism | bundle\n- 撤退条件: 改善率が誤差内なら revert"
      ]
    },
    "verification_steps": [
      "Before ベンチマーク取得 (release build, warmup 3, runs 10)",
      "改善実装",
      "After ベンチマーク取得 (同じコマンド・入力・環境)",
      "改善率 / 統計信頼度を確認",
      "既存テスト全 pass を確認 (cargo test / vitest run / flutter test)"
    ],
    "success_criteria": [
      "改善率が clear (improvement_ms / combined_stddev_ms >= 3)",
      "既存テスト全 pass",
      "入出力互換 (型・例外・順序・エッジケース) を維持"
    ],
    "gotchas": [
      "<apply で踏みやすい罠>"
    ],

    "bulk_group": "perf-nested-loop-on2 | perf-loop-io | perf-repeated-compile | perf-unnecessary-clone | perf-unbounded-growth | perf-bad-parallelism | perf-bundle-fullimport | perf-tauri-ipc-chatty",
    "confidence": "high | medium",
    "requires_dynamic_verification": true,

    "recommended_runner": "optimize-expert",
    "post_check_expert": null,
    "blocking": false,
    "blocking_reason": "<blocking: true のときのみ必須。新規変更が既存 perf debt を悪化させている根拠>"
  }
]
```

### optimize-expert 固有の必須項目 (canonical schema 上での扱い)

| 項目 | 必須 | 備考 |
|------|-----|------|
| `domain` | ✓ | `"optimize"` 固定 |
| `evidence_grade` | ✓ | `direct` 以外で Critical を付けない |
| `recommendation.type` | ✓ | `optimize` (改善方針が明確) または `investigation` (まず計測) |
| `recommendation.steps` | ✓ | **measurement_plan を必ず含める** (baseline コマンド・入力規模・期待改善カテゴリ・撤退条件) |
| `verification_steps` | ✓ | Before/After ベンチマーク取得手順を必ず含める |
| `success_criteria` | ✓ | **改善率の閾値** と **既存テスト互換** を必ず含める |
| `bulk_group` | 推奨 | optimize-expert 固有の 8 種から選ぶ |
| `recommended_runner` | ✓ | 通常 `"optimize-expert"` |
| `post_check_expert` | ✓ | 原則 `null` (optimize は behavior 不変が前提) |
| `blocking` | ✓ | 新規変更が既存 perf debt を悪化させている場合 `true`、それ以外 `false` |
| `blocking_reason` | △ | `blocking: true` のとき必須 |
| `requires_dynamic_verification` | 推奨 | optimize は基本 `true` (apply で benchmark 実測必須) |

### scan finding 例 (algorithm)

```json
[
  {
    "title": "ジョブマネージャの dispatch ループが O(n²) で重複ジョブを線形検出",
    "severity": "high",
    "severity_reason": "active job 数が運用上 数百〜1000 まで増えた状態で、dispatch loop が job × seen Vec で線形探索を反復。1000 件で 1M op、UI thread を 数百 ms ブロックする経路が直接観測できる",
    "domain": "optimize",
    "files": ["src/jobs/dispatcher.rs:84"],
    "symbols": ["JobDispatcher::dispatch_pending"],
    "summary": "active jobs を線形 Vec で持ち、新規 job ごとに `seen.contains(&id)` で重複チェックしている。job 数 n に対して O(n²)。1000 件で UI freeze 経路。",
    "evidence": "let mut seen: Vec<JobId> = Vec::new();\nfor job in pending {\n    if seen.contains(&job.id) { continue; }\n    seen.push(job.id.clone());\n    self.spawn(job);\n}",
    "evidence_grade": "direct",
    "hypothesis": "Vec::contains が n 回呼ばれ、各呼び出しが線形探索のため O(n²)",
    "excluded_hypotheses": [
      "並列化不足: dispatch は順序保証が必要なため Rayon は適用不可"
    ],
    "scope_in": ["src/jobs/dispatcher.rs"],
    "scope_out": ["src/jobs/types.rs (型定義は変えない)"],
    "recommendation": {
      "type": "optimize",
      "steps": [
        "seen を `HashSet<JobId>` に置き換え、`if seen.insert(job.id.clone()) { ... }` パターンに変更",
        "## 計測計画\n- baseline: `cargo bench --bench dispatcher_bench -- --save-baseline before`\n- 入力規模: 100 / 1000 / 10000 jobs の synthetic input\n- 期待: 1000 件で >5x、10000 件で >50x 改善\n- 撤退条件: 100 件で改善が誤差内なら threshold で sequential / index 切り替え"
      ]
    },
    "verification_steps": [
      "Before: criterion で `dispatch_pending` の小・中・大 入力 bench 取得",
      "実装: HashSet 置き換え、関数 signature は不変",
      "After: 同じ bench で再計測",
      "cargo test で既存テスト全 pass",
      "dispatch 順序が input 順と一致することをテストで確認"
    ],
    "success_criteria": [
      "1000 件で improvement > 5x (clear)",
      "既存 dispatcher テスト全 pass",
      "dispatch 順序維持 (HashSet で重複チェックのみ、push 順は別 Vec で維持)"
    ],
    "gotchas": [
      "HashSet は順序保持しないため、dispatch 順序を維持するには別 Vec or insertion-ordered IndexSet を使う"
    ],
    "bulk_group": "perf-nested-loop-on2",
    "confidence": "high",
    "requires_dynamic_verification": true,
    "recommended_runner": "optimize-expert",
    "post_check_expert": null
  }
]
```

### scan finding 例 (io)

```json
[
  {
    "title": "面付プロセッサがページごとに manifest.json を毎回 read + parse",
    "severity": "high",
    "severity_reason": "page_count が運用上 数百〜数千。1 ページごとに 同じ manifest を read + serde parse しており、parse コストがページ数倍に乗る。500 ページで manifest parse が処理時間の 60% 超を占める可能性",
    "domain": "optimize",
    "files": ["src/imposition/processor.rs:142"],
    "symbols": ["ImpositionProcessor::process_pages"],
    "summary": "process_pages の loop 内で `std::fs::read_to_string('manifest.json')` + `serde_json::from_str` を毎回呼んでいる。",
    "evidence": "for page in pages {\n    let manifest_text = std::fs::read_to_string(\"manifest.json\")?;\n    let manifest: Manifest = serde_json::from_str(&manifest_text)?;\n    process_one(page, &manifest)?;\n}",
    "evidence_grade": "direct",
    "hypothesis": "loop 内 file I/O + repeated parse",
    "excluded_hypotheses": [
      "manifest 内容が page ごとに変わる: 確認したところ全 page で同じ"
    ],
    "scope_in": ["src/imposition/processor.rs"],
    "scope_out": ["src/imposition/types.rs"],
    "recommendation": {
      "type": "optimize",
      "steps": [
        "loop 外で manifest を 1 回 read + parse し、`&Manifest` で `process_one` に渡す",
        "## 計測計画\n- baseline: `hyperfine 'cargo run --release --bin imposer -- input/sample-500.json'`\n- 入力規模: 50 / 500 / 5000 pages\n- 期待: 500 ページで >3x、5000 ページで >10x 改善\n- 撤退条件: I/O cache が効いていて改善が誤差内なら 'cold cache' で再計測"
      ]
    },
    "verification_steps": [
      "Before: hyperfine で wall-clock 取得 (cold + warm の両方)",
      "実装: read + parse を loop 外に移動",
      "After: 同じ hyperfine 条件で再計測",
      "cargo test で既存 imposition テスト全 pass",
      "出力 PDF の binary 一致を fixture と比較"
    ],
    "success_criteria": [
      "500 ページで improvement > 3x (clear)",
      "既存 imposition テスト全 pass",
      "出力 PDF binary 一致"
    ],
    "gotchas": [
      "manifest が runtime で変わる前提があるか要確認 (現状の grep 結果ではない)"
    ],
    "bulk_group": "perf-loop-io",
    "confidence": "high",
    "requires_dynamic_verification": true,
    "recommended_runner": "optimize-expert",
    "post_check_expert": null
  }
]
```

---

## apply 完了報告

`templates/apply-report.schema.json` のスキーマに従う JSON、または
`templates/benchmark-report.md` の Markdown 形式で報告。

### 必須項目

```json
{
  "issue_number": 123,
  "summary": "<改善内容の 1〜2 文>",
  "target": {
    "files": ["src/jobs/dispatcher.rs"],
    "function_or_command": "JobDispatcher::dispatch_pending"
  },
  "category": "algorithm | io | allocation | cache | parallelism | bundle | startup",
  "change_summary": "<何をどう変えたか、1〜3 文>",

  "baseline": {
    "tool": "hyperfine | criterion | flamegraph",
    "command": "<正確なコマンド>",
    "build": "release",
    "input_fixture": "<path / 内容概要>",
    "input_size": "small | medium | large | (個別計測の場合 array)",
    "warmup": 3,
    "runs": 10,
    "mean_ms": 250.0,
    "stddev_ms": 8.0,
    "cold_or_warm": "warm"
  },

  "after": {
    "tool": "hyperfine | criterion | flamegraph",
    "command": "<同上>",
    "build": "release",
    "input_fixture": "<同上>",
    "input_size": "<same>",
    "warmup": 3,
    "runs": 10,
    "mean_ms": 82.0,
    "stddev_ms": 3.0,
    "cold_or_warm": "warm"
  },

  "improvement": {
    "ratio_percent": 67.2,
    "speedup": "3.05x",
    "significance": "clear | marginal | none"
  },

  "correctness": {
    "tests_run": ["cargo test --package jobs", "cargo build --release"],
    "tests_pass": true,
    "io_compat": "出力順序・型・例外・エッジケース挙動を維持",
    "compatibility_notes": "<該当あれば>"
  },

  "risk_level": "low | medium | high",
  "risk_notes": "<rationale>",

  "decision": "applied | reverted | deferred | escalated",
  "decision_rationale": "<判定根拠>",

  "remaining_issues": [
    "<関連する別 bottleneck があれば Issue 起票推奨>"
  ],

  "environment": {
    "os": "Windows 11 / WSL2 Ubuntu 24.04",
    "cpu": "AMD Ryzen 7 5800X",
    "rust_version": "1.82.0",
    "tool_versions": {
      "hyperfine": "1.18.0",
      "cargo": "1.82.0"
    }
  }
}
```

### Markdown 形式 (PR description / Issue コメント用)

`templates/benchmark-report.md` の template に値を埋めて使う:

```markdown
## Performance

### Target
- 対象: src/jobs/dispatcher.rs::dispatch_pending
- カテゴリ: algorithm

### Change
seen の Vec::contains 線形探索を HashSet に置き換え (O(n²) → O(n))。

### Benchmark
| Case | Before (mean ± stddev) | After (mean ± stddev) | Speedup | Significance |
|---|---:|---:|---:|---:|
| 100 jobs | 1.2 ± 0.1 ms | 0.8 ± 0.05 ms | 1.5x | clear |
| 1000 jobs | 250 ± 8 ms | 82 ± 3 ms | 3.0x | clear |
| 10000 jobs | 24,500 ± 250 ms | 820 ± 25 ms | 30x | clear |

### Command
\`\`\`bash
cargo bench --bench dispatcher_bench -- --baseline before
\`\`\`

### Environment
- OS: Windows 11 + WSL2 Ubuntu 24.04
- CPU: AMD Ryzen 7 5800X (8C/16T)
- Rust: 1.82.0
- criterion: 0.5.1

### Correctness
- [x] cargo test --package jobs (全 pass)
- [x] cargo build --release (成功)
- [x] dispatch 順序維持を新規テストで確認 (`test_dispatch_preserves_order`)
- [x] 入出力インターフェース不変 (公開 API 変更なし)

### Risk
- Risk: low
- Rollback: `git revert <sha>` で 1 commit 戻すだけ
- 撤退しなかった理由: clear 改善 + 既存テスト全 pass + 互換性確認済み

### Notes
残課題: dispatcher 全体の throughput には worker pool 導入余地あり (別 Issue 推奨)。
```

---

## 報告で守るべきこと

1. **数値で語る** — 「速くなった」ではなく「3.0x、p < 0.01」
2. **コマンドを残す** — 後で再現できる
3. **環境を残す** — OS / CPU / version で結果が変わる
4. **stddev を書く** — 平均だけでは判定できない
5. **入力 fixture を明記** — 規模 (small / medium / large) を区別
6. **撤退判断を書く** — 撤退しなかった理由 = clear 改善 + 互換性 OK + リスク許容
7. **残課題を残す** — 関連する別 bottleneck は別 Issue で
