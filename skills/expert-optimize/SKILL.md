---
name: expert-optimize
description: optimize-expert agent の方法論教科書。Rust / Tauri v2 / Vue 3 / TypeScript / Flutter を主対象とする性能改善エージェントの計測プロトコル・計算量改善パターン・Rayon ガイド・I/O / メモリ / バンドル最適化・撤退条件・report スキーマを集約する。直接 invoke は想定せず、agent.md の skills フィールド経由で自動プリロードされる前提で動作する知識ベース。
---

# expert-optimize: optimize-expert の知識ベース

<!--
機能概要: optimize-expert agent が op-scan / op-run から呼ばれた際に
         参照する方法論・パターン・テンプレを集約した教科書。
         Rust / Tauri v2 / Vue 3 / TypeScript / Flutter / Dart に主対象を絞る。
作成意図: agent.md は人格と契約に集中させ、HOW の本体はここに置く。
         "計測 → 分析 → 改善 → 検証 → 撤退判断" を一つのループとして
         成立させるための知識ベース。
注意点: agent から skills: で自動プリロードされる前提。直接 /expert-optimize
       のような起動は基本想定しない (description で自然に抑制)。
-->

## このドキュメントの位置づけ

optimize-expert agent (`~/.claude/agents/optimize-expert.md`) が `skills: [expert-optimize]` で本ファイルを自動プリロードする。
agent はここに書かれた **Optimization Loop**、**3-bucket triage**、**Severity Policy**、**Verification Ladder**、**改善優先順位**、**撤退条件** に従って自走する。

mode 別の必読 references は以下:

| mode | 必読 references |
|------|----------------|
| scan | `references/bottleneck-taxonomy.md` / `references/report-schema.md` / `references/risk-and-rollback.md` |
| apply | `references/benchmark-protocol.md` / `references/algorithmic-optimization.md` / `references/rust-optimization.md` / `references/rayon-playbook.md` / `references/io-and-batching.md` / `references/memory-and-allocation.md` / `references/risk-and-rollback.md` |
| frontend / Tauri 案件 | `references/frontend-bundle-performance.md` / `references/tauri-performance.md` |

templates:
- `templates/criterion-bench-template.rs` — Rust 関数単位ベンチ
- `templates/hyperfine-template.md` — CLI / command ベンチ
- `templates/benchmark-report.md` — apply mode 完了報告の Markdown 形式
- `templates/scan-finding.schema.json` — scan 出力の例 (canonical schema 準拠)
- `templates/apply-report.schema.json` — apply 完了報告 JSON 形式

---

## Technology Profile (常時参照スコープ)

このエージェントは「あらゆる言語の汎用性能チューナー」ではなく、以下の active stack に集中する。
**対象外スタックを意図的に削ることで、誤検知と report ノイズを下げる**ことが設計目的。

```yaml
active_stack:
  - Rust          # ドメインロジック・Tauri backend・CLI / バッチ処理
  - Tauri v2      # WebView + Rust の境界、IPC 性能
  - Vue 3         # フロントエンド (Composition API + Pinia + Vuetify)
  - TypeScript    # Vue / Tauri フロントの型システム
  - Dart          # Flutter アプリ
  - Flutter       # クロスプラットフォーム UI

conditional_stack:
  - Python/FastAPI  # AI Gateway / Python backend リポジトリのみ参照
  - InDesign COM / ExtendScript  # 製版・組版系で COM 呼び出しがある場合のみ
  - PDF / IDML / OCR pipeline    # ドメイン依存、I/O・並列化観点で扱う

disabled_by_default:
  - React  # 通常検出しない
  - Go     # 通常検出しない
```

scan モードの動作:
- active_stack の検出は通常通り報告対象
- conditional_stack はリポジトリに該当ファイル / import / 依存があるときだけ報告
- disabled_by_default は **報告しない**。検出しても `ignored_noise` に分類して捨てる

---

## Severity Policy (報告閾値)

`_shared/severity-rubric.md` の判定手順に従う。optimize-expert 固有の典型例:

### Critical

- O(2^n) / O(n!) で実環境を停止させる経路が確実に存在する
- unbounded cache / unbounded retain により OOM が再現する
- ホットパスでの確実な無限ループ / 退化ケース
- ユーザー操作なしで自動的にメモリ・ディスクを食い潰す経路

### High

- 主要導線で観測可能な性能劣化 (P95 が SLA を超える、OCR / PDF / IDML 処理で n 倍以上の劣化)
- O(n²) / O(n*m) かつ n が運用上数百〜数千以上に達する経路
- ループ内 I/O / N+1 で fs / DB / HTTP / Tauri command / COM 呼び出しが発生
- 巨大ライブラリの全 import で初期 bundle が著しく肥大 (frontend では明確な体感劣化)
- listener / watcher / cache の解除漏れによる長時間運用での緩慢な肥大

### 起票しない (Medium / Low)

- 1 回しか呼ばれない初期化処理の僅かな最適化余地
- 入力規模が確実に小さい UI helper の clone 1 個
- iterator vs explicit loop の好み
- 「もっと効率的な書き方」という改善案のみ
- benchmark で測っても誤差範囲の改善しか見込めない箇所

---

## 核心メソドロジー: Optimization Loop

> 「速くなりそう」では動かない。Before / After / 統計信頼度 / 挙動互換 / リスクで判断する。

### 1. Detect (静的アンチパターン抽出)

scan モードの中心責務。コード読みで断定できる構造的問題を抽出する。
詳細パターンは `references/bottleneck-taxonomy.md`。

抽出基準:
- 計算量が静的に確定する (nested loop / repeated linear scan)
- I/O / ネットワーク / IPC / COM 呼び出しがループ内に存在する
- 入力規模が運用上大きくなることが既知 (page_count / job_count / OCR block_count 等)
- 不要 clone / serde roundtrip が大きいデータ構造で発生

「テストすれば分かる」「もしかしたら遅いかも」は detect ではなく investigation。

### 2. Measure (再現可能な数値の取得)

apply モードの起点。詳細は `references/benchmark-protocol.md`。

原則:
- **Before / After 必須**
- **release build 必須** (debug build の数値で判断しない)
- warmup 3 以上、min-runs 10 以上
- 入力 fixture を **小・中・大** で用意
- I/O 影響時は **cold / warm cache** を区別
- コマンド・環境・入力を全て記録 (`templates/benchmark-report.md`)
- 平均値だけでなく **標準偏差** を見る (mean / stddev / runs)

ツール:
- **hyperfine** — CLI / command / build / pipeline 全体
- **criterion** — Rust 関数単位 (statistics-driven micro-benchmarking)
- **cargo flamegraph / perf** — Rust プロファイリング
- **dhat / valgrind massif** — メモリ / allocation プロファイル
- **vite-bundle-visualizer / rollup-plugin-visualizer** — フロント bundle
- **flutter devtools** — Flutter プロファイリング

### 3. Optimize (改善の優先順位)

詳細は `references/algorithmic-optimization.md` / `references/rust-optimization.md`。

**この順番を守る**:

1. **計算量改善** — O(n²) → O(n log n) → O(n)、線形探索 → HashMap index、repeated work 除去
2. **I/O 削減** — ループ内 I/O 排除、N+1 解消、batch 化、parse once、`references/io-and-batching.md`
3. **allocation / clone 削減** — `with_capacity`、Cow、Arc、buffer 再利用、`references/memory-and-allocation.md`
4. **キャッシュ** — 純粋関数のメモ化、明確な invalidation を持つ場合のみ
5. **並列化** — Rayon / worker pool / chunking、`references/rayon-playbook.md` の条件を満たすときのみ
6. **低レベル最適化** — unsafe は原則禁止、SIMD / inline hint は最後

> 計算量改善より先に並列化に走らない。**O(n²) のまま par_iter しても入力が増えれば負ける**。

最小差分で実装する。1〜2 ファイルごとに Verification Ladder Level 1〜2 を回す。

### 4. Verify (Before / After / 互換性 / リスク)

詳細は `references/risk-and-rollback.md` / `references/report-schema.md`。

確認項目:
- After ベンチマークを **Before と同じコマンド・同じ入力・同じ環境** で取得
- 改善量の統計的有意性判定 (clear / marginal / none / unstable) は
  `references/benchmark-protocol.md` の「統計的有意性の判定」節を参照
- **既存テストが全て pass する** (Verification Ladder Level 2 + 必要に応じて Level 3)
- **入出力互換** (型・例外・順序・エッジケース挙動が変わっていない)
- **リスクレベル** を `references/risk-and-rollback.md` に従って付与

### 5. Decide (実装する / 撤退する / エスカレーション)

判定:

| 条件 | decision | 判断 |
|------|---------|------|
| clear 改善 + 互換 OK + リスク low/medium | **applied** | **実装確定**、コミット |
| marginal 改善 + 互換 OK + リスク low | **applied** | **実装可**、message に marginal 旨明記 |
| marginal 改善 + リスク medium 以上 | **reverted** または **escalated** | **撤退** または司令官エスカレーション |
| none 改善 (誤差内) | **reverted** | **撤退**。OP-managed Mode では apply report に理由を構造化して返す。Direct Mode では人間向け報告文を出してよい |
| 互換性が証明できない | **reverted** | **撤退**。OP-managed Mode では未解決の互換懸念を apply report に列挙する。Direct Mode では人間向け報告文を出してよい |
| ベンチマーク不安定 (`unstable`) | **deferred** | **判定保留**、benchmark 改善 Issue 起票は commander / OP skill が判断 |
| Before benchmark 計測不能 (環境依存・ツール非導入等) | **deferred** | 実装着手しない。OP-managed Mode では計測不能理由を apply report (measurement_missing / assumptions[]) に返す |
| 高リスク最適化 (アルゴリズム全面変更等) | **escalated** | **司令官エスカレーション** |

撤退条件の詳細は `references/risk-and-rollback.md`。

---

## 実行モード

scan = **detect mode**、apply = **optimize mode** として動作する。命名は `_shared/expert-spawn.md` の契約に合わせて scan / apply のままだが、責務の理解は detect / optimize で持つ。

### scan (detect) モード — read-only audit

`op-scan` / `op-patrol` から呼ばれた時の挙動。コードを変更しない (Read / Grep / Glob のみ)。

#### scope mode (3 種)

入力に応じて以下の scope mode で動作する。

1. **explicit_paths** — 司令官が指定したファイル・ディレクトリのみ。最優先
2. **changed_files** — git diff / PR diff / staged files を起点。変更ファイルと直接の呼び出し境界だけ追う
3. **patrol_sample** — 警備員的見回り (op-patrol からの呼び出し含む)。指定箇所も変更箇所もない場合に使う。完全ランダムではなく **risk-weighted sampling** とする

patrol_sample の優先順位 (optimize 観点):
1. ホットパス候補 (main loop / batch processor / page-by-page 処理 / OCR / PDF / IDML)
2. ループ内 I/O / DB / HTTP / Tauri command / COM 呼び出し
3. 並列化 / Rayon / worker pool / channel 周辺
4. 大量データ処理 (collect / serde / parse / regex)
5. 最近変更された high-churn file
6. cache / pool / batch API の周辺
7. frontend bundle entry point / route splitting

patrol_sample 由来の finding には `scope_origin: "patrol_sample"` を付ける。Medium / Low は報告しない。

#### 内部 triage: 3-bucket 分類

検出物を以下 3 つに分類する。**この分類を経てから JSON 出力にマップする** ことで、誤検知ノイズと「測れば分かる」推測報告を構造的に抑える。

##### 1. confirmed_findings — 静的証拠だけで Critical / High と断定できる

- 該当行のコードと既知の入力規模だけで重大さが確定する
- 計算量・I/O 回数・呼び出し頻度が静的に示せる
- 推測語句 (「可能性」「もしかしたら」「測れば分かる」) を一切使わずに評価できる
- → `_shared/expert-spawn.md` の **scan 共通スキーマ JSON 配列** に出力 (op-scan が Issue 化)

##### 2. investigation_candidates — 静的では断定できないが、計測すれば High 化する有力候補

- 該当行のパターンは怪しいが、規模感が入力データ・実行条件に依存する
- **既定では出力しない** (op-scan の JSON-only 契約を破壊しないため)
- op-scan / op-patrol が `allow_text_tail: true` または `candidate_report: true` を明示した場合のみ、別セクションに以下のフォーマットで列挙する:

```yaml
investigation_candidates:
  - id: candidate-001
    confidence: high | medium  # high のみ報告、low は捨てる
    stack: Rust | Tauri | Vue | TypeScript | Flutter
    category:                  # perf-nested-loop-on2 等
    file: path/to/file.ext
    lines: "L42-L58"
    evidence: |                # 該当コード抜粋
      <該当コード 5-10 行>
    suspected_bottleneck: |    # 想定されるボトルネック
      <どういう入力規模で何が破綻するか>
    measurement_plan:          # op-run で取るべきベンチマーク
      tool: hyperfine | criterion | flamegraph | bundle-visualizer
      command: |
        <コマンド>
      input_sizes: [small, medium, large]
      expected_signal: |
        <何が見えれば bottleneck と確定できるか>
    promote_to_confirmed_when: |
      <この計測結果を満たせば confirmed に昇格できる>
```

##### 3. ignored_noise — 報告しない

- disabled_by_default (React / Go) 由来
- Medium / Low (1 回しか呼ばれない / 入力規模が小さい / 可読性の好み)
- 静的根拠が弱すぎる (推測の域)
- benchmark で測っても誤差範囲の改善しか見込めない箇所
- micro optimization (iterator vs loop の好み等)

→ **完全に捨てる**。出力に含めない。報告しない。

#### scan 出力 (JSON 配列) — 共通スキーマ + optimize 固有規約

`_shared/expert-spawn.md` の **scan 共通スキーマ** に従う。`confirmed_findings` のみがここに入る。

canonical 必須フィールド (`_shared/expert-spawn.md` v14 正本):

- `title` / `severity` / `severity_reason` — bottleneck 要約と判定根拠 (計算量・I/O 規模・入力サイズ条件)
- `domain` — `optimize` 固定
- `files` / `symbols` — 最低 1 件
- `summary` / `evidence` / `evidence_grade` — 静的観測コード断片と証拠強度 (direct / inferred / requires_runtime)
- `hypothesis` / `excluded_hypotheses` — ボトルネック仮説と否定した代替仮説 (例: I/O ではなく allocation)
- `scope_in` / `scope_out` — apply の context 継承に必要
- `verification_steps` / `success_criteria` / `gotchas` — Before/After benchmark と撤退条件の合否判定基盤
- `recommendation` — type (`optimize` / `investigation`) + steps (measurement_plan を必ず含む)
- `bulk_group` — 同質検出のグルーピングキー
- `recommended_runner` — `optimize-expert` 固定
- `post_check_expert` — 原則 `null` (optimize は behavior 不変が前提のため、UI/security 領域に絡まない)
- `blocking` / `blocking_reason` — 新規変更が既存 perf debt を悪化させる場合 `true`

optimize-expert 固有の規約 (canonical の後に併存):

- `evidence_grade` の詳細解釈:
  - `direct` — 計算量・I/O 回数が静的に確定 (例: 明確なネストループ + 明確な入力規模上限)
  - `inferred` — パターンは確実だが規模が周辺コード推論
  - `requires_runtime` — 計測しないと bottleneck かどうか確定しない (High 上限)
- `recommendation.type`:
  - `optimize` — 改善方針が明確 (HashMap index 化 / regex を LazyLock に移動 等)
  - `investigation` — まず計測して bottleneck 確認が必要
- `recommendation.steps` には **measurement_plan** を必ず含める:
  - baseline 取得コマンド
  - 入力規模 (small / medium / large)
  - 期待される改善カテゴリ (algorithm / io / allocation / parallelism / bundle)
  - 撤退条件 (改善なしの場合の扱い)
- `verification_steps` には Before/After ベンチマーク取得手順を必ず含める
- `success_criteria` には **改善率の閾値** と **既存テスト互換** を必ず含める

#### optimize-expert 固有の bulk_group カテゴリ

| bulk_group | 対象 |
|-----------|------|
| `perf-nested-loop-on2` | O(n²) / O(n*m) ネストループ・線形探索の多重実行 |
| `perf-loop-io` | ループ内 file I/O / DB / HTTP / Tauri command / COM |
| `perf-repeated-compile` | loop 内 regex compile / parse / sort |
| `perf-unnecessary-clone` | 大量データに対する clone / String 化 / serde roundtrip |
| `perf-unbounded-growth` | cache / listener / watcher の unbounded 成長 |
| `perf-bad-parallelism` | Mutex<Vec> push / I/O-bound par_iter / 極小粒度 par_iter |
| `perf-bundle-fullimport` | 巨大ライブラリの全 import / lazy load 欠如 |
| `perf-tauri-ipc-chatty` | Tauri IPC の高頻度往復 / 巨大 payload |

**バッチ化の原則禁止**: optimize-expert の検出は `bulk_group` が 5 件以上同一でも **op-scan / op-patrol は原則バッチ Issue 化しない** (1 Issue = 1 bottleneck = 1 benchmark 因果評価の原則を壊さないため)。

例外として 1 つのバッチ Issue にまとめてよいのは、**すべて満たす場合のみ**:

1. `bulk_group` が同一 (例: `perf-repeated-compile` のみ)
2. 同一関数 / 同一ファイル / 同一ホットパスに集中
3. 同一 benchmark コマンド・同一 fixture で Before/After を一括評価可能
4. risk_level が low に揃う

`perf-nested-loop-on2` / `perf-bad-parallelism` 等、改善方針が個別ケースで分岐するカテゴリは個別 Issue を維持する。

#### scan 実行ポリシー (Level 0 固定)

scan / detect mode は **Level 0 のみ**。Read / Grep / Glob に限定し、ベンチマーク・型チェック・ビルドは実行しない。
例外的に Level 1 を許可する場合は、op-scan 入力に `allow_level_1: true` がある場合のみ。

scan で hyperfine / criterion を回さないのは、リポジトリ全体スキャン中に重い処理を走らせると爆発するため。
計測は apply mode で実施する。

### apply (optimize) モード — worktree 隔離で実装

`op-run` から worktree 隔離で呼ばれた時の挙動。

#### apply mode の固定契約

- **1 Issue = 1 ボトルネック = 1 改善カテゴリ**
- 複数の最適化を同時に混ぜない / リファクタを混ぜない / 仕様変更を混ぜない
- **Before ベンチマークを取得してから改善に着手する**
- 改善の優先順位は「## 核心メソドロジー: Optimization Loop」§3 を参照 (計算量 → I/O → allocation → cache → 並列化)
- **After ベンチマークを取得し、改善率を測定誤差と比較する**
- 有意な改善が出なければ **変更を取り下げる** (撤退条件: `references/risk-and-rollback.md`)
- 入出力インターフェース・型・例外・エッジケース挙動は変えない

#### 手順

1. Issue 指示書 (`_shared/expert-spawn.md` の apply 入力契約) を Read で完全把握
2. 対象コードと既存挙動・既存テストを Read で把握
3. **Optimization Loop** に従って自走 (OP-managed Mode では司令官と対話しない。
   計測不足 / 不明な fixture は質問せず `measurement_missing` / `assumptions[]` /
   `needs_human_decision` / `blocked_actions[]` として完了報告に返す)
4. Before ベンチマーク取得 → 改善実装 → After ベンチマーク取得 → 統計判定
5. 1〜2 ファイルごとに Verification Ladder Level 1〜2 を回す
6. 改善後に Level 3 (build) を 1 回回す
7. デバッグ計測コード (eprintln, console.log, debug print) を削除
8. コミット (日本語、`Fixes #N`、Before/After 数値・改善率・統計信頼度・リスクレベルを message に)
9. push はしない。commit までで停止し、push / PR open は司令官 / op-run が Post-run conflict check 後に実施する
10. 完了報告 (`templates/apply-report.schema.json` 形式)

---

## Verification Ladder (検証梯子)

修正範囲とリスクに応じて、どの Level まで回すかを判断する。
**毎回フルビルドさせない**ことで、本質的でない失敗で止まる事態を避ける。

| Level | 種類 | Rust | Vue/TS | Flutter | Tauri v2 統合 |
|-------|------|------|--------|---------|---------------|
| 0 | static scan | `rg` / `grep` 危険パターン | 同左 | 同左 | 同左 |
| 1 | type / lint | `cargo check` / `cargo clippy -- -D warnings` | `vue-tsc --noEmit` / `eslint .` | `flutter analyze` | 各 frontend / backend で Level 1 |
| 2 | unit test | `cargo test` | `vitest run` | `flutter test` | `cd src-tauri && cargo test` |
| 3 | package build | `cargo build --release` | `npm run build` | `flutter build <target>` (必要時) | `tauri build` (必要時、重い) |
| B | benchmark | `cargo bench` (criterion) / `hyperfine ...` | `hyperfine 'npm run ...'` / bundle analyzer | `flutter build` size diff / devtools | `hyperfine 'tauri exec ...'` 等 |
| 4 | integration | — | — | — | `cd src-tauri && cargo test` + frontend build を一連で |
| 5 | E2E / 実機 | — | — | `flutter integration_test` | Tauri WebDriver / Windows 実機 / InDesign COM / network drive |

運用ルール:
- **detect mode は Level 0 のみ**
- **optimize mode は Level B (benchmark) を Before / After で必ず実施**
- 変更範囲に応じて Level 1〜2 を回し、最終的に Level 3 を 1 回
- **Level 4 (Tauri 統合)** は重く時間がかかるため、`allow_level_4: true` 指定時のみ
- **Level 5 (E2E / 実機)** は常に dedicated Issue 化、apply mode では実施しない
- 実行できなかった Level は完了報告に「未実行: Level X (理由)」と明記する

#### 存在確認 → 実行の前提

検証コマンド実行前に必ず存在確認する。ない場合は失敗ではなく「検証未実行 (理由: ツール非導入)」として扱う。

```bash
test -f Cargo.toml         # Rust crate / Tauri backend
test -f package.json       # Vue / TS frontend
test -f pubspec.yaml       # Flutter app
test -d src-tauri          # Tauri v2 アプリ
test -d benches            # criterion benchmark suite
command -v cargo
command -v hyperfine
command -v flutter
```

詳細な project-type 別 recipe は `references/benchmark-protocol.md` を参照。

---

## ボトルネック概要 (top patterns — active stack 集中版)

scan / apply 時はここで大カテゴリを確認し、詳細は `references/bottleneck-taxonomy.md` を参照。

カテゴリ:
- **Algorithm (探知優先度 1)**: O(n²) ネスト / 線形探索 / repeated sort-parse / repeated regex compile
- **I/O (探知優先度 1)**: ループ内 file I/O / N+1 / 同期 I/O on async / Tauri chatty IPC
- **Allocation / Memory (探知優先度 2)**: 大量 clone / serde roundtrip / unbounded cache / Vec::push 多発
- **Parallelism (探知優先度 2)**: par_iter + Mutex<Vec> / I/O-bound par_iter / 極小粒度 par_iter / COM スレッド越境
- **Frontend / Tauri (探知優先度 2)**: 巨大 import / route lazy load 不在 / computed 過剰再計算 / listener 解除漏れ

各パターンの具体例・検出兆候・修正テンプレは `references/bottleneck-taxonomy.md` および
`references/algorithmic-optimization.md` 以下を参照。

---

## 言語別最小ベンチテンプレ

プロジェクト種別ごとの完全版テンプレは `templates/` 以下を参照:
- Rust: `templates/criterion-bench-template.rs`
- CLI: `templates/hyperfine-template.md`
- 完了報告: `templates/benchmark-report.md`

セットアップ確認・実行コマンドの詳細は `references/benchmark-protocol.md` を参照。

---

## 実装完了後の code-review invoke

本節の方法論は `~/.claude/skills/_shared/apply-completion-checklist.md` に集約された。
本 expert の固有 skip 条件のみ以下に残す。

### 固有 skip 条件

optimize 特有の順序 (Before benchmark → 実装 → After benchmark → 採用判定 → code-review → commit)
および以下の skip 条件は optimize-expert 固有のものとして維持する:

- **benchmark 前の invoke 禁止**: 結果変動リスクのため、Before/After 確定後のみ invoke する
- **revert / deferred 時は invoke なし**: `decision=reverted / deferred` の場合は `code_review_invoked: false`、`code_review_skip_reason: "decision=reverted/deferred"`

---

## CLAUDE.md 規約との整合

- **ネスト規約遵守** (if/switch ≤3、for/while ≤2、callback/lambda ≤2): 最適化で深いネストを増やさない (ガード節・関数抽出を維持)
- **日本語コメント**: 改善理由を 1 行コメント (なぜこの構造が必要か。「なぜ速いか」は benchmark report に書く)
- **検証なしの実装は出荷しない**: Before/After + 既存テストが必須
- **過度な抽象化を避ける**: 性能のための抽象レイヤー追加は最小限

---

## 深掘り参照

- 計測プロトコル: `~/.claude/skills/expert-optimize/references/benchmark-protocol.md`
- ボトルネック分類表: `~/.claude/skills/expert-optimize/references/bottleneck-taxonomy.md`
- 計算量改善パターン全集: `~/.claude/skills/expert-optimize/references/algorithmic-optimization.md`
- Rust 個別最適化: `~/.claude/skills/expert-optimize/references/rust-optimization.md`
- Rayon Playbook: `~/.claude/skills/expert-optimize/references/rayon-playbook.md`
- I/O 削減・バッチ化: `~/.claude/skills/expert-optimize/references/io-and-batching.md`
- メモリ・allocation: `~/.claude/skills/expert-optimize/references/memory-and-allocation.md`
- フロントエンド bundle: `~/.claude/skills/expert-optimize/references/frontend-bundle-performance.md`
- Tauri 性能: `~/.claude/skills/expert-optimize/references/tauri-performance.md`
- リスク分類・撤退条件: `~/.claude/skills/expert-optimize/references/risk-and-rollback.md`
- report スキーマ: `~/.claude/skills/expert-optimize/references/report-schema.md`
- templates: `~/.claude/skills/expert-optimize/templates/`

---

## 参照ドキュメント (Single Canonical Source)

| Path | 役割 |
|------|------|
| `skills/_shared/runtime-contract.md` (>=1) | runtime spawn 境界 / apply 可否 / merge-blocking state |
| `skills/_shared/active-expert-registry.md` (>=2) | active / planned 区別、本 expert の runtime 適格性確認 |
| `skills/_shared/markers/labels-and-markers.md` (>=2) | 出力 marker / 受領 label の名前と core semantics |
| `skills/_shared/common-setup.md` (>=2) | Explore 委譲プロトコル (breadth / クエリ数基準) + フォールバック |
| `skills/_shared/apply-completion-checklist.md` | apply Run Mode の完了手順。固有 skip 条件は本 SKILL.md の「## 実装完了後の code-review invoke」節を参照 |
| `skills/_shared/expert-spawn.md` | canonical schema / apply 入力契約 / spawn schema / **Marker Publish Validate 節** |
| `skills/_shared/read-economy.md` (>=1) | Read Economy 原則 (R1〜R5) |

---

## Direct Expert Run (直接実行時の対話型入口)

共通手順・default テーブル・初回確認テンプレ・禁止事項は
`~/.claude/skills/_shared/invocation-mode.md` を参照。

### 初期モード

optimize-expert は **計測データなしでは apply しない**。Before benchmark が取れない場合は decision="deferred" で完了する。
