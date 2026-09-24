---
name: expert-optimize
description: optimize-expert agent の方法論教科書。Rust / Tauri v2 / Vue 3 / TypeScript / Flutter を主対象とする性能改善エージェントの計測プロトコル・計算量改善パターン・Rayon ガイド・I/O / メモリ / バンドル最適化・撤退条件・report スキーマを集約する。直接 invoke は想定せず、agent.md の skills フィールド経由で自動プリロードされる前提で動作する知識ベース。
---

# expert-optimize: optimize-expert の知識ベース

> 「速くなりそう」では動かない。Before / After / 統計判定 / 挙動互換 / リスクで判断する。

mode 別の必読 references:

| mode | 必読 |
|---|---|
| scan | `references/bottleneck-taxonomy.md` |
| apply | `references/benchmark-protocol.md` / `references/risk-and-rollback.md` + 改善カテゴリに応じて `references/algorithmic-optimization.md` / `references/rust-optimization.md` (clone・allocation・メモリ含む) / `references/rayon-playbook.md` / `references/io-and-batching.md` |
| frontend / Tauri / Flutter 案件 | `references/frontend-bundle-performance.md` / `references/tauri-performance.md` |

---

## Technology Profile

```yaml
active_stack: [Rust, Tauri v2, Vue 3, TypeScript, Dart, Flutter]
conditional_stack:      # repo に該当ファイル / import / 依存があるときだけ報告
  - Python/FastAPI
  - InDesign COM / ExtendScript
  - PDF / IDML / OCR pipeline   # I/O・並列化観点で扱う
disabled_by_default: [React, Go]  # 報告しない (ignored_noise)
```

---

## Severity Policy

判定手順と scan 報告ルールは `~/.claude/skills/_shared/severity-rubric.md` (「判定の手順」「scan 報告ルール (共通)」節) に従う。scan 前に Read する。optimize 固有の典型例:

- **Critical**: O(2^n) / O(n!) で実環境を停止させる経路 / unbounded cache・retain で OOM が再現 / ホットパスの確実な無限ループ・退化ケース / ユーザー操作なしでメモリ・ディスクを食い潰す経路
- **High**: 主要導線で観測可能な劣化 (P95 が SLA 超過、OCR / PDF / IDML で n 倍以上) / O(n²)・O(n*m) かつ n が運用上数百〜数千以上 / ループ内 I/O・N+1 (fs / DB / HTTP / Tauri command / COM) / 巨大ライブラリ全 import で初期 bundle が明確に肥大 / listener・watcher・cache の解除漏れによる長時間運用での肥大
- **起票しない**: 1 回だけの初期化処理 / 入力規模が確実に小さい helper の clone / iterator vs loop の好み / 「もっと効率的な書き方」だけの提案 / 計測しても誤差範囲の改善

---

## Optimization Loop

### 1. Detect (scan)

コード読みで断定できる構造的問題を抽出する (`references/bottleneck-taxonomy.md`)。基準:

- 計算量・I/O 回数が静的に確定する (nested loop / repeated linear scan / ループ内 I/O・IPC・COM)
- 入力規模が運用上大きくなることが既知 (page_count / job_count / OCR block_count 等)
- 大きいデータ構造で不要 clone / serde roundtrip が起きている

静的に断定できず実測が要る候補は investigation に回す (下記 3-bucket)。

### 2. Measure (apply の起点)

`references/benchmark-protocol.md` に従う。要点: Before / After 必須、release build、warmup ≥ 3・runs ≥ 10、入力 small / medium / large、I/O 系は cold / warm 区別、mean と stddev を記録、コマンド・環境・fixture を残す。

### 3. Optimize (優先順位を守る)

1. **計算量** — O(n²) → O(n log n) / O(n)、線形探索 → index、repeated work 除去 (`references/algorithmic-optimization.md`)
2. **I/O 削減** — ループ内 I/O 排除、N+1 解消、batch 化、parse once (`references/io-and-batching.md`)
3. **allocation / clone 削減** — `with_capacity` / Cow / Arc / buffer 再利用 (`references/rust-optimization.md`)
4. **キャッシュ** — 純粋関数のメモ化。invalidation が明確な場合のみ、必ず bounded
5. **並列化** — `references/rayon-playbook.md` の採用条件を全て満たすときのみ
6. **低レベル** — SIMD / inline hint は最後。unsafe は原則禁止

計算量改善より先に並列化しない (O(n²) のまま par_iter しても入力が増えれば負ける)。最小差分で実装する。

### 4. Verify

- After を Before と **同じコマンド・同じ入力・同じ環境** で取得し、`references/benchmark-protocol.md`「統計的有意性の判定」節で clear / marginal / none / unstable を判定
- 既存テスト全 pass (Verification Ladder Level 2、必要に応じ 3)
- 入出力互換 (型・例外・順序・エッジケース挙動が不変)
- リスクレベルを `references/risk-and-rollback.md` で付与

### 5. Decide

| 条件 | decision |
|---|---|
| clear + 互換 OK + risk low/medium | `applied` |
| marginal + 互換 OK + risk low | `applied` (commit message に marginal と明記) |
| marginal + risk medium 以上 | `reverted` または `escalated` |
| none (誤差内・劣化) | `reverted` |
| 互換性を証明できない | `reverted` (未解決の互換懸念を列挙) |
| unstable | 変更を revert して `deferred` (ベンチ条件改善の起票は controller 判断) |
| Before を計測できない (環境依存・ツール非導入) | 実装に着手せず `deferred` |
| high risk (アルゴリズム全面変更等) | `escalated` |

撤退条件の詳細は `references/risk-and-rollback.md`。OP-managed Mode では撤退・保留・エスカレーションの理由を完了報告に構造化して返す (Issue コメントは書かない)。Direct Mode では人間向け報告文でよい。

---

## scan (detect) モード

read-only。実行レベルは `severity-rubric.md`「scan 実行レベル」節 (Level 0 固定)。加えて **hyperfine / criterion などのベンチマークも scan では回さない**。

scope mode は `~/.claude/skills/_shared/expert-spawn.md`「scan scope mode 契約 (3 モード)」節に従う。`patrol_sample` の optimize 優先順位:

1. ホットパス候補 (main loop / batch processor / page 単位処理 / OCR / PDF / IDML)
2. ループ内 I/O / DB / HTTP / Tauri command / COM 呼び出し
3. 並列化 / Rayon / worker pool / channel 周辺
4. 大量データ処理 (collect / serde / parse / regex)
5. 最近変更された high-churn file
6. cache / pool / batch API 周辺
7. frontend bundle entry point / route splitting

### 3-bucket triage

検出物を分類してから出力にマップする。

1. **confirmed_findings** — 該当コードと既知の入力規模だけで Critical / High と断定でき、計算量・I/O 回数・呼び出し頻度を静的に示せ、推測語を使わずに書ける。かつ measurement_plan を書ける。→ `{"findings": [...]}` に入れる
2. **investigation_candidates** — パターンは怪しいが規模が入力・実行条件に依存する。**既定では出力しない**。spawn 入力に `candidate_report: true` があるときだけ、`expert-spawn.md`「scan 出力 envelope 契約」節の形で下記 schema を使って返す
3. **ignored_noise** — disabled stack / Medium 以下 / 静的根拠が弱い / 誤差レベル / micro optimization。出力しない

investigation_candidates の要素 (confidence low は捨てる):

```yaml
- id: candidate-001
  confidence: high | medium
  stack: Rust | Tauri | Vue | TypeScript | Flutter
  category: <bulk_group 値>
  file: path/to/file.ext
  lines: "L42-L58"
  evidence: <該当コード 5-10 行>
  suspected_bottleneck: <どの入力規模で何が破綻するか>
  measurement_plan:
    tool: hyperfine | criterion | flamegraph | bundle-visualizer
    command: <コマンド>
    input_sizes: [small, medium, large]
    expected_signal: <何が見えれば bottleneck と確定できるか>
  promote_to_confirmed_when: <confirmed に昇格できる計測結果>
```

### scan-finding (optimize 版)

field・enum・必須性の正本は `op help payload scan-finding` (envelope は `expert-spawn.md`「scan 出力 envelope 契約」節、共通 field `scope_origin` も同節)。optimize 固有の書き方:

- `severity_reason` に **入力規模・呼び出し頻度・ホットパス性** を書く。`evidence_grade` が `direct` 以外なら Critical にしない
  - `direct` = 計算量・I/O 回数と入力規模上限が静的に確定 / `inferred` = パターンは確実だが規模は周辺コードから推論 / `requires_runtime` = 計測しないと確定しない (`reproduction_hint` 必須)
- `excluded_hypotheses` に否定した代替仮説 (例: I/O ではなく allocation) を書く
- `recommendation.type` は `optimize` (改善方針が明確) か `investigation` (まず計測)。`steps` の最後の要素に **`## 計測計画`** (baseline コマンド / 入力規模 small・medium・large / 期待改善カテゴリ algorithm・io・allocation・parallelism・bundle / 撤退条件) を入れる
- `verification_steps` に Before/After 取得手順、`success_criteria` に改善率の閾値 (統計判定) と既存テスト互換を入れる
- `requires_dynamic_verification` は原則 `true`。`recommended_runner` は `optimize-expert`。`post_check_expert` は原則 `null` (入れるなら `ux-ui-audit-expert` か `security-expert`)
- `blocking: true` は新規変更が既存 perf debt を悪化させる場合のみ (`blocking_reason` 必須)

### bulk_group

| bulk_group | 対象 |
|---|---|
| `perf-nested-loop-on2` | O(n²) / O(n*m) ネスト・線形探索の多重実行 |
| `perf-loop-io` | ループ内 file I/O / DB / HTTP / Tauri command / COM |
| `perf-repeated-compile` | loop 内 regex compile / parse / sort |
| `perf-unnecessary-clone` | 大量データの clone / String 化 / serde roundtrip |
| `perf-unbounded-growth` | cache / listener / watcher の unbounded 成長 |
| `perf-bad-parallelism` | Mutex<Vec> push / I/O-bound par_iter / 極小粒度 par_iter / スレッド制約越境 |
| `perf-bundle-fullimport` | 巨大ライブラリ全 import / lazy load 欠如 |
| `perf-tauri-ipc-chatty` | Tauri IPC の高頻度往復 / 巨大 payload |

optimize は **1 Issue = 1 bottleneck = 1 benchmark 因果評価** が原則。同じ bulk_group が 5 件以上でもバッチ Issue にしてよいのは、同一関数・ファイル・ホットパスに集中し、同一 benchmark・fixture で一括評価でき、risk が low に揃う場合だけ (判定は controller)。`perf-nested-loop-on2` / `perf-bad-parallelism` のように改善方針が個別に分岐するものは個別 Issue。

---

## apply (optimize) モード

worktree 隔離で実装する。固定契約:

- **1 Issue = 1 bottleneck = 1 改善カテゴリ**。複数の最適化・リファクタ・仕様変更を混ぜない。別 bottleneck は `remaining_issues[]` に列挙する
- Before を取ってから着手する。取れなければ着手せず `deferred`
- 入出力インターフェース・型・例外・エッジケース挙動を変えない
- 有意な改善が出なければ変更を取り下げる

手順:

1. Issue 指示書 (`expert-spawn.md`「apply 入力契約」節) と対象コード・既存テストを Read
2. Before 取得 → 改善実装 → After 取得 → 統計判定 → Decide
3. 1〜2 ファイルごとに Verification Ladder Level 1〜2、最後に Level 3 を 1 回
4. デバッグ計測コード (eprintln / console.log / debug print / 計測用 Instant) を削除
5. `~/.claude/skills/_shared/apply-completion-checklist.md` の順序で code-review → commit。commit 形式は `~/.claude/skills/_shared/commit-convention.md`。message に Before / After / improvement / significance / risk / decision を書く
6. push しない。完了報告を返す

OP-managed Mode では質問しない。計測不足・不明な fixture は `assumptions[]` / `needs_human_decision` / `blocked_actions[]` に入れて返す (`~/.claude/skills/_shared/invocation-mode.md`)。Direct Mode でも計測データなしでは apply しない。

### code-review の固有 skip 条件

- Before/After 確定前に invoke しない (順序: Before → 実装 → After → 採用判定 → code-review → commit)
- `decision` が `reverted` / `deferred` なら invoke しない (`code_review_invoked: false`、`code_review_skip_reason: "decision=reverted/deferred"`)

### 完了報告

`expert-spawn.md`「修正完了報告 schema」節の共通 field (`status` / `code_review_*` / `self_review_result` 等) に、`op help payload apply-report` の benchmark field を加えて返す。apply-report 側の要点:

- `category`: algorithm | io | allocation | cache | parallelism | bundle | startup
- `baseline` / `after`: `tool` / `command` / `build: release` / `input_fixture` / `warmup` / `runs` / `mean_ms` / `stddev_ms` (Before と After は同一コマンド・同一 fixture)
- `improvement`: `ratio_percent` / `speedup` / `significance` (clear | marginal | none | unstable)
- `correctness`: `tests_run` / `tests_pass` / `io_compat`
- `risk_level` + `risk_notes`、`decision` + `decision_rationale` (撤退条件と照合した根拠)、`remaining_issues[]`
- `environment` (`os` 必須、`tool_versions` 任意)、`verification_ladder` (実行した level のみ)
- `simplify_*` は code-review invoke の結果 (`code_review_*` と同じ値)

### repo 規約

`~/.claude/skills/_shared/project-profile.md`「対象 repo 規約への準拠 (worker 共通)」節に従う (最初の編集前に Read)。optimize 固有差分: 最適化で深いネストを増やさない / コメントは「なぜこの構造が必要か」を 1 行 (「なぜ速いか」は報告に書く) / 性能のための抽象レイヤー追加は最小限。

---

## Verification Ladder

| Level | 種類 | Rust | Vue/TS | Flutter | Tauri v2 |
|---|---|---|---|---|---|
| 0 | static scan | `rg` / `grep` | 同左 | 同左 | 同左 |
| 1 | type / lint | `cargo check` / `cargo clippy -- -D warnings` | `vue-tsc --noEmit` / `eslint .` | `flutter analyze` | 各側で Level 1 |
| 2 | unit test | `cargo test` | `vitest run` | `flutter test` | `cd src-tauri && cargo test` |
| 3 | package build | `cargo build --release` | `npm run build` | `flutter build <target>` (必要時) | `tauri build` (必要時) |
| B | benchmark | criterion / hyperfine | hyperfine / bundle analyzer | build size diff / devtools | hyperfine / DevTools |
| 4 | integration | — | — | — | backend test + frontend build を一連で |
| 5 | E2E / 実機 | — | — | `flutter integration_test` | WebDriver / Windows 実機 / COM / network drive |

- scan は Level 0 のみ。apply は Level B を Before / After で必ず実施し、Level 1〜2 → 最後に Level 3
- Level 4 は `allow_level_4: true` のときのみ。Level 5 は apply で実施しない (専用 Issue)
- 実行前に存在確認する (`Cargo.toml` / `package.json` / `pubspec.yaml` / `src-tauri/` / `benches/`、`command -v cargo hyperfine flutter`)。無ければ失敗ではなく「未実行 (ツール非導入)」
- 実行できなかった Level は完了報告に「未実行: Level X (理由)」と書く
