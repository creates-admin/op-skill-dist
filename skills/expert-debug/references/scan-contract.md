# expert-debug scan 契約の詳細 (patrol_sample / investigation_candidates / bulk_group)

scope mode の定義は `~/.claude/skills/_shared/expert-spawn.md`「scan scope mode 契約 (3 モード)」節、3-bucket の定義は SKILL.md。

## §1 patrol_sample の優先順位

debug-expert 固有の risk-weighted sampling 順:

1. Tauri invoke 境界
2. file I/O / path / fs 操作
3. async spawn / await 境界
4. error handling / catch / Result 変換
5. 最近変更された high-churn file
6. capability / permission / config 周辺
7. Flutter lifecycle / dispose 周辺

昇格できないものは investigation_candidates に留める (出力は §2 に従う)。

## §2 investigation_candidates の schema (既定では出力しない)

spawn 入力に `candidate_report: true` が明示された場合のみ、`expert-spawn.md`「scan 出力 envelope 契約」の
`investigation_candidates` 配列に以下の形で入れる。指定が無ければ捨てる (confirmed が 0 件なら `{"findings": []}` のみ)。

```yaml
- id: candidate-001
  confidence: high | medium      # high のみ報告、low は捨てる
  stack: Rust | Tauri | Vue | TypeScript | Flutter
  category:                      # bug-async-leak 等
  file: path/to/file.ext
  lines: "L42-L58"
  evidence: |                    # 該当コード 5-10 行
  suspected_failure_scenario: |  # どういう入力・条件で何が起きるか
  required_repro: [<データ条件>, <環境条件>]
  suggested_probe: [<test を 1 本書いて XXX を確認>]
  promote_to_confirmed_when: |   # 昇格条件 1〜2 文
```

## §3 debug-expert 固有の bulk_group と分割ルール

| bulk_group | 対象 |
|---|---|
| `bug-empty-catch` | 例外握りつぶし (`Result` 無視 / `catch (e) {}`) の散在 |
| `bug-missing-await` | async/await 漏れ・JoinHandle 捨て |
| `bug-null-unguarded` | null / undefined / Option 無防備アクセスの集中 |
| `bug-tauri-invoke-mismatch` | invoke payload と Rust command struct の不一致 |
| `bug-flutter-dispose-leak` | controller / subscription の dispose 漏れ集中 |
| `bug-rust-fs-error-swallow` | std::fs / tokio::fs のエラー無視 |

同 bulk_group 5 件以上は op-scan がバッチ Issue 化する。1 Issue 最大 10 件。超える場合はディレクトリ単位か stack 単位で分割する。
