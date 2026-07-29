<!--
schema_version: 1
last_breaking_change: 2026-07-29
notes: v1 (2026-07-29, Wave B1 J5): op-patrol/SKILL.md フェーズ2「patrol_score 計算式群」
       (risk_score / stale_score / churn_score / complexity_score / incident_score /
       recently_scanned_penalty・starvation_bonus / jitter) を progressive disclosure
       (ADR-0029 決定2) で本ファイルへ物理切り出し。切り出し前後で数値・表・引用注記を
       変更しない (移動のみ、ADR-0029 決定2 要件4)。
-->

<!--
機能概要: patrol_score を構成する各 component (risk / stale / churn / complexity / incident /
         recently_scanned_penalty・starvation_bonus / jitter) の算出式・上限値・実装詳細注記を
         集約する lookup reference。
作成意図: op-patrol/SKILL.md 本文の god file 化抑制 (ADR-0029 Wave B1)。これらは「値を引く」
         lookup であり、通常の巡回主経路では `op patrol score --json` / `op patrol repo-map`
         の出力をそのまま使えば足りる。本ファイルは area 選定理由を人間に説明する必要が
         生じたとき、または score の内訳を手計算で検証したいときにのみ参照する。
注意点: 各段階の正確な閾値・数値根拠の正本は `op-tools/docs/specs/patrol-score.md`
         (本ファイルは実装詳細注記レベルまでに留め、CLI 実装との drift が生じたら
         `op-core/src/patrol/scoring.rs` を再確認して同期すること)。
-->

## フェーズ2 スコア計算式群

各 component の内訳。合計式 (`patrol_score = risk_score + stale_score + ... + jitter`) は
SKILL.md 本文フェーズ2 を参照 (本ファイルでは重複掲載しない)。

### risk_score (0〜50)

区画パスとファイル内容から risk marker を検出。1 marker = +10、上限 50。

| カテゴリ | marker (パス含有 or 内容 grep) |
|---------|-------------------------------|
| file-io | `file_io`, `fs::`, `std::fs`, `path::`, `read_to_string`, `write_all`, `tempfile` |
| ipc | `tauri::command`, `#[command]`, `invoke`, IPC handler |
| auth | `auth`, `permission`, `capability`, `token`, `session` |
| db | `migration`, `sqlx`, `diesel`, `sea_orm`, `pool.execute` |
| queue | `queue`, `worker`, `scheduler`, `cron`, `job::` |
| ext-cmd | `Command::new`, `subprocess`, `child_process`, `spawn` |
| config | `config`, `env::var`, `.env`, `dotenv`, `capabilities` |
| io-flow | `import`, `export`, `upload`, `download`, `backup`, `delete`, `overwrite` |
| test-health | `tests`, `spec`, `__tests__`, `fixture`, `mock`, `snapshot`, `golden`, `coverage`, `vitest`, `pytest`, `flutter_test`, `.skip`, `xit`, `xfail` |

`--risk a,b,c` 指定時は、該当カテゴリの marker を持つ区画のみ candidate にする。

> (op patrol score 実装詳細) パス含有 OR 内容 grep の **OR** 判定。同 category が複数ファイルでマッチしても 1 件カウント。パス判定は case-insensitive。詳細は `op-tools/docs/specs/patrol-score.md` §4 項目 1 を参照。

### stale_score (0〜30)

最終変更からの経過日数。`max(0, days_since_last_change - 30) / 6`、上限 30。
30 日以内は 0、180 日以上で満点。`--stale` フラグで重み 1.5x。

> (op patrol score 実装詳細) 履歴なしの area (新規追加直後など) は `stale_score = 0` とする (RVW-002 由来)。`--stale` 指定時は重み 1.5x の結果として上限が **45** まで上がる (見出しの「0〜30」は通常時、`--stale` 時は 0〜45)。

### churn_score (0〜20)

直近 90 日のコミット数。`min(20, commit_count * 2)`。
変更が多い場所はバグ混入率も高い。

### complexity_score (0〜20)

以下のいずれかが該当するごとに +5、上限 20:

- ファイル数 ≥ 20
- 1 ファイルが 500 行超を含む
- `TODO|FIXME|XXX|HACK` の出現が 10 件以上
- `unwrap\(\)|expect\(|panic!\(|as any|as unknown|@ts-ignore|eslint-disable` の出現が 10 件以上

> (op patrol score 実装詳細) `TODO|FIXME|XXX|HACK` は **case-sensitive**。小文字 `todo` 等は対象外。

### incident_score (0〜20、コスト高のため lazy 計算)

過去に Issue が多い区画ほど加点。`gh issue list --search "<area path>" --state all --limit 30 | wc -l` の結果 × 2、上限 20。

mcp channel では `gh issue list` が fail-closed するため、司令官が `mcp__github__search_issues`
(`repo:<owner>/<repo> is:issue <area path>`) を実行し、返却 `total_count` (上限 30 相当に丸める) を件数として使う。

**コスト管理**: incident_score は patrol_score 上位 10 区画に対してのみ計算 (全区画への gh API 呼び出しは避ける)。

### recently_scanned_penalty (0〜40) / starvation_bonus (0〜60) — wave-03b で毎日運用 fit に curve 圧縮

Patrol Ledger の `area_state[area].last_scanned_at` からの経過日数 d に応じ、巡回直後の area は
`recently_scanned_penalty` で大きく減点し (top から除外)、逆に長期未巡回の area は `starvation_bonus` で
加点する (高 baseline area が永久に top を独占する **lock-in** を構造的に解消しつつ、3 日 floor を確保する)。

**司令官が判断に使う代表値**:

- 巡回直後 (d < 1) は penalty -40 (ほぼ top から除外)、d ≥ 7 で penalty 0
- starvation は d ≥ 3 で active +10 (dormant +5) から立ち上がり、d ≥ 60 で active +60 (dormant +30) に達する
- **dormant 判定**: `days_since_last_change > days_since_last_scanned` (前回巡回後 commit がない area)。
  dormant は概ね active の半分に絞る (動きのある area を常に優先する不変則)
- history なし (`days_since_last_change = None`) は両方とも 0。Ledger 未登録 area も未巡回扱い (penalty = 0)
- **設計想定 area 数 N ≤ 50**。N > 100 では bonus 飽和点で差別化が baseline+jitter のみになるため、
  skill 側 orchestration で「force-include 1 dormant」等の補助制約が必要 (将来の `op patrol ledger` wave 検討事項)

> 各段階の正確な閾値・数値根拠は `op-tools/docs/specs/patrol-score.md` §4 項目 12 が正本 (本節では再掲しない)。

### jitter (0〜10)

`hash(run_id + area_path) % 10`。`--random-seed N` 指定時は `hash(N + area_path) % 10` で再現可能。
同一 patrol_score での tie-break + 完全に固定された巡回順を避ける効果。
