<!--
schema_version: 6
last_breaking_change: 2026-05-21
notes: v6 (2026-05-21) — density 算出方法を「op cluster max-parallel への入力契約」節として明文化 (Fixes #341)。
       Stage 2 観測値から density を算出する規則 (cluster 間重複ペア数 / C(cluster_count, 2)) と
       Phase 1 末 (density=0.0 initial) / Phase 2-B 直後 (観測値で再算出) の使い分けを記述。
       既存 Stage 1 / Stage 2 conflict check logic は不変 (additive)。
       op-run/SKILL.md (>=v3-pin) の動的算出 fence (1-2-f / 2-B-density) が本節を参照する。
       op cluster max-parallel CLI の算出式そのものの正本は ADR-0007 v3 §4.2-v3 と
       `op-tools/crates/op-core/src/cluster/max_parallel.rs` (Single Canonical Source Rule、本節は consumer 視点の入力契約のみ定義)。
       v5 (2026-05-17) — ADR-0007 §設計の骨子 §per-directory / per-module slicing hint を Step 2 モジュール推定節に追加。
       機能カテゴリ > directory hint の優先順位を明文化 (tiebreak 用途)。additive のため既存 cluster 結果は変わらない。
       v4 (2026-05-08) — hidden marker を routing hint として再定義し、`active-expert-registry.md` 登録 / `runtime-contract.md` resolution を経由しない spawn 認可解釈を排除した。Step 3 item 1 / Step 6 後の注釈を更新。
       v3 (2026-05-03 第三段階) — designer-expert / ux-ui-audit-expert を OP に正規統合する契約整備。
       category に `design` を正式追加し、apply = designer-expert / post-check = ux-ui-audit-expert を確定。
       ラベル → category マッピングを `pro-designer-expert` / `pro-ux-ui-audit-expert` に揃え、
       Issue 本文の hidden marker (op-domain / op-run-expert / op-post-check-expert) を最優先で読む手順を明文化。
       severity ラベルを `severity:critical` / `severity:high` 系に正規化しつつ、互換のため旧 `critical` / `high` も読む。
       v2 (2026-05-03) — UX/UI 再編に伴い category → expert 表を更新 (ux + ui を ux-ui に統合、apply は designer-expert、post-check は ux-ui-audit-expert)。
       ラベル `pro-ux-audit` / `pro-ui-refactor` を `pro-ux-ui-audit` / `pro-designer` に正規化。
-->

# Issue クラスタリング + 二段階競合検出

/**
 * 機能概要: op-run が複数 Issue を読み込み、共通機能でクラスタ化して並列実行計画を立てるロジックを定義する
 * 作成意図: 同一モジュールのバグは 1 worktree で連続処理 (デバッグ効率)、独立クラスタは並列 worktree (時間効率)。
 *           ただし Issue 本文に書かれたファイルは不完全であることを前提に、探知フェーズ後の再検証を必須化する
 * 注意点: コンフリクトは絶対に起こさない方針。判定不能なら直列化、Issue の事前情報だけで安全と判定しない
 */

op-run は GitHub Issue 群を入力に受け、共通機能でクラスタリングして並列実行計画を立てる。
本ドキュメントはクラスタリング・**二段階競合検出**のアルゴリズムを集約する。

> **重要**: Issue 本文から抽出したファイルだけでは実際の変更範囲を網羅できない。
> 必ず「Plan-time」と「Post-investigation」の二段階で競合検出する。

---

## クラスタリングの目的

| 目的 | 達成方法 |
|------|---------|
| デバッグ効率 | 同一モジュールの複数 Issue を 1 worktree で連続処理 → 共通の根本原因を発見しやすい |
| 並列効率 | モジュールが異なるクラスタは並列 worktree で同時実行 |
| コンフリクト防止 | クラスタ間で**実際に触りそうなファイル**が重複しないことを二段階で検証 |
| レビュー負荷軽減 | 1 クラスタ = 1 PR (`Fixes #N #M ...` 列挙) |

---

## 入力と出力

入力: open Issue のリスト (gh issue list の JSON)。各 Issue から以下を抽出:

```
{
  "number": 42,
  "title": "...",
  "body": "...",
  "labels": ["bug", "pro-debug-expert", "severity:high", "module:auth"],
  "files": ["src/auth/login.rs", "src/auth/session.rs"],   ← body から抽出 (不完全前提)
  "module": "auth",                                        ← ラベル > 本文 > LCP の順で推定
  "module_confidence": "high",                             ← high / medium / low
  "category": "debug",                                     ← labels から推定
  "severity": "high"                                       ← labels から推定
}
```

出力: クラスタのリスト + 競合警告 + 不確実性。

```
{
  "clusters": [
    {
      "id": "auth-debug-1",
      "issues": [42, 43, 45],
      "module": "auth",
      "files_declared": ["src/auth/login.rs", "src/auth/session.rs"],
      "expert": "debug-expert",
      "confidence": "high",                              ← high / medium / low
      "rationale": "module:auth ラベル付き、対象ファイル明示",
      "risk_flags": [],                                  ← 例: ["touches_cargo_toml"]
      "task_complexity": "design"                        ← dominant complexity (model 選択用)
    }
  ],
  "conflicts": [],
  "serialized_pairs": []
}
```

### cluster 単位の `task_complexity` 集約ルール

各 Issue は enrichment 層で個別に `task_complexity` (`routine` / `extension` / `design` /
`integration` / `api-design`) を持つ (`issue-enrichment.md` の Output `enriched_issue.task_complexity`
を参照)。cluster は複数 Issue を束ねるため、cluster 単位では以下のルールで dominant complexity を
決定する:

- **規則**: cluster に含まれる Issue の `task_complexity` のうち、**最も重いもの** (順序:
  `api-design` > `integration` > `design` > `extension` > `routine`) を cluster の
  `task_complexity` とする。
- **未推論時**: cluster 内に `task_complexity` が unset の Issue がある場合、当該 Issue は
  暫定で `extension` 扱い (`model-selection.md` §9)。それ以外の Issue 群とまとめて最大値で集約。
- **op-run controller** はこの cluster 単位 `task_complexity` を `Agent({ model: ... })` の引数
  決定に使う。詳細な mapping table と override 優先順位は `_shared/model-selection.md` (>=1) §5.3 /
  §6 を参照。

clustering.md は `task_complexity` field の存在と集約規則のみを定義する。区分の意味・mapping
table・degrade 挙動の正本は `model-selection.md` 側 (Single Canonical Source Rule)。

> **clustering / 並列化設計 step 自体の model**: cluster の dominant `task_complexity` が決めるのは
> **apply agent の** model であり、clustering を行う **司令官自身の推論** の model とは別軸。
> clustering (= 並列化プラン設計) は「単発 / 判断不可逆 / 深い推論」のど真ん中であり、その model 正本は
> `model-selection.md` §5.1 主表の「op-run | clustering / 並列化設計 | 単発 | 高 | Opus」行
> (Single Canonical Source Rule、本ファイルは pointer)。司令官 model が最上位 tier であることを前提とし、
> 低 tier 司令官時の品質劣化は op-run フェーズ1 の advisory guard (warning、hard fail しない) で検出する。

---

## クラスタリング・アルゴリズム

### Step 1: ファイル抽出

各 Issue 本文から以下のパターンを正規表現で抽出。**Rust / Flutter / Vue / Tauri v2** を主対象とする。

| パターン | 例 |
|---------|-----|
| インラインコード | `` `src-tauri/src/main.rs` `` |
| 行番号付き | `src-tauri/src/main.rs:42` |
| 自由記述 | `frontend/src/components/Button.vue のあたり` |
| 単独パス | `Cargo.toml`, `pubspec.yaml` |

対象拡張子: `.rs .toml .lock .ts .tsx .vue .js .json .dart .yaml .md`

ファイルが見つからない Issue は **clustering 時点では即除外しない**。
`target-unknown` (本文からファイル抽出不可、low confidence) として一旦保持し、
**op-run のフェーズ1.5 健全性チェックに回す**。フェーズ1.5 で正規化できない場合のみ
op-run 実装対象から除外する (clustering.md 単独で除外判断しない)。
これにより人間立て Issue / 古い形式 Issue も op-scan `--from-issue` 委譲経由で取り込める。

### Step 2: モジュール推定 (優先順位を明確化)

LCP は機能境界を捉えきれないため、以下の優先順位で推定する:

| 順位 | 入力 | 例 | confidence への影響 |
|-----|------|-----|---------------------|
| 1 | ラベル `module:xxx` / `area:xxx` | `module:auth` | high |
| 2 | Issue title/body の明示語 | 「auth の login が…」 | high |
| 3 | プロジェクトの `module_map` (任意) | プロジェクト側で `.claude/module_map.yaml` 等を持つ場合 | high |
| 4 | ファイルパスの LCP | `src/auth/` | medium |
| 5 | LCP 浅い / 不明 | `src/` のみ | low → 直列化 |

> **module_map の扱い**: プロジェクト固有のため本ドキュメントではスキーマを定義しない。
> プロジェクト側で `.claude/module_map.yaml` 等を持つ場合は司令官がそれを参照する。
> 存在しなければ Step 4 (LCP) にフォールバック。

#### per-directory / per-module slicing hint (ADR-0007 §設計の骨子)

Claude Code 公式 `/batch` は「Prefer per-directory or per-module slicing over arbitrary file lists」を推奨する。
本ドキュメントでは **機能カテゴリ判定 (Step 3) が優先**し、directory hint は補助 tiebreak として機能する。

適用ルール:

- 同一 directory / module 内に閉じる Issue 群 (例: `src/auth/` 配下のみを触る複数 Issue) は、
  機能カテゴリが一致する場合に同一クラスタへまとめることを **優先候補** とする。
- 機能カテゴリ (label / hidden marker) が異なる場合は directory hint より機能カテゴリを優先する
  (例: `src/auth/` 内でも `debug` と `refactor` の Issue は別クラスタ)。
- LCP (Longest Common Prefix) 判定と directory hint が矛盾する場合は **LCP を優先**する
  (directory hint は LCP の自然な強化として位置づけ、矛盾時は LCP が勝つ)。
- directory hint で統合してよい上限はクラスタサイズ上限 (5 Issue) と同じ。超えた場合は細分化する。

期待効果: 認知負荷低減・cluster 独立性向上・Stage 2 競合発生率の低下。
本 hint は **additive**であり、既存のクラスタリング結果 (機能カテゴリ + LCP + ラベル) を変更しない。

### Step 3: カテゴリ推定

#### 解決順序 (上から優先)

1. **Issue 本文の hidden marker を routing hint として最優先で参照する**:
   - `<!-- op-domain: <category> -->` があれば category の routing hint として採用する (`active-expert-registry.md` / `runtime-contract.md` で active な category であることを検証してから採用)
   - `<!-- op-run-expert: <expert> -->` / `<!-- op-post-check-expert: <expert> -->` があれば apply / post-check の routing hint として採用し、Step 6 のラベル / 本文ヒューリスティックよりこの hint を優先する (ただし `active-expert-registry.md` に存在しない expert は spawn できない。planned expert が指定されていれば `planned-experts.md` の substitutes に従って正規化してから spawn する)
   - hint は spawn authorization ではない。最終 spawn 可否は `runtime-contract.md` の resolution に従う
   - 通常は op-scan / op-patrol / op-architect が事前に埋め込んでいる
2. **ラベルから category を推定** (marker が無い場合):
   - `pro-debug-expert` → category = debug
   - `pro-refactor-expert` → category = refactor
   - `pro-optimize-expert` → category = optimize
   - `pro-security-expert` → category = security
   - `pro-ux-ui-audit-expert` → category = ux-ui (検出側、apply は designer-expert)
   - `pro-designer-expert` → category = design (apply も designer-expert)
   - `pro-feature-expert` → category = feature
   - `pro-test-expert` → category = test

   複数あれば優先順位で決定:
   `security > debug > refactor > optimize > ux-ui > design > feature > test`
   旧ラベル `pro-ux-audit` / `pro-ui-refactor` / `pro-ux-ui-audit` / `pro-designer` も正規化して読む。

   **二重ラベル時の明示解決** (priority だけでは取り違える組み合わせは個別に固定する):

   - `pro-debug-expert` + `pro-security-expert`
     → category = security / apply = op-run の判定優先順位 1-8 で `security-expert` または `debug-expert` / post-check = `security-expert`
   - `pro-designer-expert` + `pro-ux-ui-audit-expert`
     → marker (`op-domain`) があれば marker 値を優先
     → marker がなければ apply = `designer-expert` / post-check = `ux-ui-audit-expert`
       (UI/UX post-check ありとして扱う)
   - `pro-feature-expert` + `pro-ux-ui-audit-expert`
     → category = feature / apply = `feature-expert` / post-check = `ux-ui-audit-expert`
       (UI 影響あり feature)
   - `pro-refactor-expert` + `pro-security-expert`
     → category = refactor / apply = `refactor-expert` / post-check = `security-expert`
     → 理由: security-expert はこの Issue では apply ではなく **post-check 専任**。priority 表
       (`security > debug > refactor > ...`) を素直に適用すると security に解釈され誤ルーティング
       するため、refactor + security の組合せは refactor 側に固定する
   - `pro-refactor-expert` + `pro-ux-ui-audit-expert`
     → category = refactor / apply = `refactor-expert` / post-check = `ux-ui-audit-expert`
     → 理由: ux-ui-audit-expert は apply せず、refactor 後の UI regression 確認のための
       post-check 担当。priority 表で ux-ui に流れると誤ルーティングするため固定する

3. **本文の簡易解析** (marker / ラベルともに無い場合):
   キーワード `エラー` / `性能` / `デザイン` / `デザインシステム` / `token` / `theme` 等から推定。

#### severity ラベル正規化

severity ラベルは `severity:critical` / `severity:high` / `severity:medium` / `severity:low` / `severity:n/a` を正とする。
互換のため、旧表記の `critical` / `high` ラベルも severity として読み取る (並存可)。

- `severity:critical` または `critical` → severity = critical
- `severity:high` または `high` → severity = high
- `severity:medium` → severity = medium
- `severity:low` → severity = low
- `severity:n/a` → severity = n/a (`--from-issue` 由来の feature 追加要望など)

### Step 4: 一次グルーピング (module + category)

同じ `(module, category)` の Issue を同一クラスタにまとめる。
クラスタサイズ上限 = 5 Issue。超えた場合は更に細分化。

> **judge-panel 化 (ADR-0014)**: op-run では Step4-6 (グルーピング決定) を judge-panel workflow
> (`op-run-judge-clustering.js`) に委譲できる (既定有効)。本 Step4-6 の算法は **judge-panel の各 angle
> generator が従う正本** であり、judge-panel は標準 / risk-first / throughput-first の角度で本算法を
> N 案走らせて evaluator が選定する (本節は単発/judge-panel 両モードの SSoT)。詳細は `op-run/SKILL.md` 1-2-judge。

#### category = optimize の特例 (1 Issue = 1 PR 原則)

`optimize` カテゴリの Issue は **原則クラスタリングしない** (1 Issue = 1 PR)。

理由: 性能改善は Before/After benchmark を 1 つの bottleneck で因果評価する必要があり、複数 bottleneck を 1 PR に混ぜると以下が壊れる。

- どの変更が改善に寄与したか分からない
- 片方の改善と片方の劣化が打ち消し合っても見えない
- rollback の単位が曖昧になる
- 統計的有意性 (combined stddev / improvement) の判定が成立しない

**例外として同一 PR に束ねてよい条件 (すべて満たす場合のみ)**:

1. 同一関数 / 同一ホットパスに対する改善であること
2. 同一 benchmark コマンド・同一入力 fixture で Before/After を一括評価できること
3. 改善方針が同質 (例: 同じ regex を複数箇所で LazyLock 化)
4. risk_level が low に揃うこと

上記いずれかを欠く場合は、たとえ同 module でも個別クラスタ (1 Issue = 1 PR) として扱う。

#### category = refactor の特例 (Phase 1: 1 Issue = 1 PR を厳守 / 例外なし)

`refactor` カテゴリの Issue は **Phase 1 ではクラスタリングしない** (1 Issue = 1 PR、例外なし)。

理由: refactor は同じ module 内でも変更範囲が広がりやすく、shared component / public API / 型 / import tree に波及しがち。複数 refactor を 1 PR に混ぜると以下が壊れる。

- どの構造変更が壊れに寄与したか分からなくなる (rollback の単位が曖昧)
- review 観点 2 (refactor) で「過剰抽象化 / 保守不能化」を判定する基準が PR 単位で揺れる
- import tree / 型 / DTO / schema を触る変更は他クラスタの apply に波及する (Stage 2 競合検出を空振らせる)

**Phase 1 では、たとえ同一ファイル・同一関数・dead code 削除であっても同一 PR に束ねない**。
op-scan / op-patrol 側の方針 (`refactor` finding は batch 全面禁止) と整合させ、
revert 不能・rollback 単位曖昧化の事故を構造的に防ぐ。

##### Phase 2 以降の検討 (現在は無効)

将来 finding schema に **`root_path` / `rollback_unit` / `verification_key`** を導入し、
それらが完全一致する場合のみ batch 化する設計を検討する。
Phase 2 移行時は本ドキュメントと op-scan / op-patrol / pr-templates / op-run のすべてに
schema_version bump + 段階移行プロトコル (`_shared/version-check.md`) を経て反映する。
**Phase 1 で勝手に「同一ファイルだから OK」と判断して束ねないこと**。

### Step 5: confidence の決定

各クラスタに **high / medium / low** を付与する (数値化はしない)。

| confidence | 条件 |
|-----------|------|
| **high** | module が ラベル/本文 で明示 + ファイル明示 + global_conflict_files に該当しない |
| **medium** | ファイルは明示だがモジュールは LCP 推定 / 一部 global_conflict_files に触れる可能性 |
| **low** | ファイル抽出失敗 / LCP 浅い / migration / lockfile / 共通基盤を確実に触る |

**`low` のクラスタは並列化しない (直列化)。**

### Step 6: expert アサイン

クラスタの category から spawn する expert を決定:

| category | expert (apply 担当) | post-check 担当 (Issue 固有再監査) |
|----------|--------------------|-----------------|
| debug | debug-expert | null |
| refactor | refactor-expert | null |
| optimize | optimize-expert | null |
| security | **security-expert** (op-run の判定優先順位 1-8 で `debug-expert` に回ることもある) | **security-expert** (op-run 3.5-B で issue 固有深掘り再監査必須) |
| ux-ui | designer-expert | ux-ui-audit-expert (op-run 3.5-A で必須) |
| design | designer-expert | UI files を触るなら ux-ui-audit-expert (op-run 3.5-A で必須) |
| feature | feature-expert | UI 影響あれば ux-ui-audit-expert |
| test | test-expert | null |
| 不明・複合 | feature-expert (最も汎用的) | UI 影響あれば ux-ui-audit-expert |

> **post_check と global review の概念分離**:
> - **post_check_expert (op-run フェーズ3.5)**: Issue 固有の再監査 (元 finding が解消されたか / 修正で別の攻撃面が増えていないか)
> - **global review (op-run フェーズ4)**: 全 PR が必ず受ける独立レビュー (review-expert が PR 全体の副作用 / PR 本文整合 / 検証記録 / 7 lens 品質を横断確認)
>
> debug / refactor / optimize / test 等 post_check が `null` のクラスタも、フェーズ4 の global review (review-expert) は必ず受ける。post_check が null であることは「Issue 固有の再監査は不要」を意味するだけで、独立レビューを skip するわけではない。

**Issue 本文の hidden marker `<!-- op-run-expert: ... -->` / `<!-- op-post-check-expert: ... -->` がある場合は、本表のヒューリスティックより marker の routing hint を優先採用する** (op-scan / op-patrol / op-architect が事前に埋め込んでいるため)。ただし marker は spawn authorization ではないため、最終 spawn は `active-expert-registry.md` への登録と `runtime-contract.md` の resolution に従う。planned expert が marker に書かれている場合は `planned-experts.md` の substitutes に従って active expert に正規化してから spawn する。

**ux-ui カテゴリの分担** (使いやすさ番人 → 美しさ番人 への hand-off):
- 検出 (scan / patrol / gate / post-check) は `ux-ui-audit-expert`。実装はしない
- 実装 (apply / Design Plan 作成) は `designer-expert` (本カテゴリでは使いやすさ検出は行わない、設計と実装に専念する)
- ※ designer-expert 自身も「美しさ・design system 整合」観点では scan / patrol で検出する責務を持つ。それは別カテゴリ `design` 側で扱う
- op-run はクラスタが ux-ui の場合、apply 後に必ず ux-ui-audit-expert を post-check に呼ぶ
  (詳細は op-run/SKILL.md フェーズ 3.5 参照)

**design カテゴリの分担** (美しさ番人の自己完結):
- 検出 (scan / patrol) は `designer-expert` 自身。Scan Mode 観点 1〜9 の design system 破綻のみ
- 実装 (apply) も `designer-expert`。token 化 / component bypass 解消 / visual hierarchy 修正
- UI files を触る場合は post-check で `ux-ui-audit-expert` を必ず呼ぶ (silent な UX 退化防止)
- 既存 state を壊していないか (focus / disabled / contrast 等) の regression check は post-check で確認

---

## global_conflict_files (グローバル衝突リスク)

以下のファイルは **どのクラスタからも触られる可能性が高く**、Issue 本文に書かれていなくても
変更されることが多い。これらに触る可能性があるクラスタは confidence を下げ、原則直列化する。

### 依存マニフェスト / lockfile (ほぼ必ず競合する)

```
Cargo.toml
Cargo.lock
package.json
pnpm-lock.yaml
yarn.lock
package-lock.json
pubspec.yaml
pubspec.lock
```

### Rust / Tauri 基盤

```
src/lib.rs
src/main.rs
src-tauri/src/lib.rs
src-tauri/src/main.rs
src-tauri/Cargo.toml
src-tauri/tauri.conf.json
src-tauri/capabilities/**
src-tauri/permissions/**
```

### Vue / Frontend 基盤

```
vite.config.ts
vite.config.js
tsconfig.json
frontend/src/App.vue
frontend/src/main.ts
frontend/src/router/**
frontend/src/stores/**          ← shared store
frontend/src/layouts/**         ← shared layout
frontend/src/components/**      ← shared component (条件付き)
```

> `components/**` は再利用 component のみ対象。pages 専用なら除外。
> 判定が割れる場合は **触る可能性あり** として扱う (安全側)。

### Flutter 基盤

```
pubspec.yaml
pubspec.lock
analysis_options.yaml
lib/main.dart
```

### DB / 生成コード / グローバル設定

```
**/migrations/**
**/schema.sql
**/openapi.yaml
**/*.proto
**/generated/**
.github/workflows/**
.claude/**
```

これらに触る可能性があるクラスタは:

- **risk_flags** に該当項目を記録 (例: `touches_cargo_toml`, `touches_shared_store`)
- confidence を **medium 以下に下げる**
- 同じ risk_flag を持つクラスタ同士は **直列化**

---

## 二段階競合検出 (コンフリクト絶対防止)

Issue 本文の事前情報だけでは競合は完全に検出できない。**必ず二段階**で検出する。

### Stage 1: Plan-time conflict check

クラスタリング直後、以下を実施:

```
for cluster_a in clusters:
  for cluster_b in clusters:
    if cluster_a.id == cluster_b.id: continue

    # 1. files_declared の重複
    overlap = cluster_a.files_declared ∩ cluster_b.files_declared

    # 2. global_conflict_files / risk_flags の共有
    shared_risk = cluster_a.risk_flags ∩ cluster_b.risk_flags

    # 3. 同一 symbol / function / component (本文から抽出可能な範囲)
    shared_symbols = extract_symbols(cluster_a) ∩ extract_symbols(cluster_b)

    if overlap or shared_risk or shared_symbols:
      → 直列化対象に追加
```

| カテゴリ | 例 |
|---------|-----|
| ファイル重複 | `src/auth/login.rs` を両方が触る |
| 同一 symbol | 別ファイルで同じ関数名 / コンポーネント名を編集 |
| 依存マニフェスト共有 | 両方が `Cargo.toml` に依存追加 |
| migration / 生成コード | 両方が DB schema / OpenAPI を変更 |
| Tauri 境界またぎ | command と invoke を別クラスタで触る |
| shared type / DTO | 型定義が複数クラスタから参照される |
| グローバル設定 | router / store / capability / config 共有 |

判定不能なら直列化 (本文書の方針: 不確実なら並列化しない)。

### Stage 2: Post-investigation conflict check (探知フェーズ後)

各 expert は **修正フェーズに入る前**に探知フェーズを実施し、
以下の investigation report を司令官に提出する:

```json
{
  "issue": 42,
  "cluster_id": "auth-debug-1",
  "suspected_root_cause": "...",
  "files_read": ["src/auth/login.rs", "src/auth/session.rs", "src/lib.rs"],
  "files_likely_to_modify": ["src/auth/login.rs", "src/auth/middleware.rs", "Cargo.toml"],
  "risk_files": ["Cargo.toml"],
  "needs_serialization": true,
  "reason": "Cargo.toml に依存追加が必要、shared store も参照する可能性あり",
  "e2e_verification_plan": {
    "uses_existing_steps": true,
    "existing_steps_ref": "Issue #42 §verification_steps",
    "additional_steps": [],
    "verification_tool_primary": "cargo test",
    "skip_reason": null
  }
}
```

> 詳細な investigation report schema は `skills/_shared/expert-spawn.md (>=13)` を参照。

司令官は **`files_likely_to_modify` を使って Stage 1 と同じロジックで再検証**する。

```
for cluster_a in clusters:
  for cluster_b in clusters:
    overlap = cluster_a.files_likely_to_modify ∩ cluster_b.files_likely_to_modify
    if overlap: → 修正フェーズは並列化しない
```

| Stage 2 結果 | 対処 |
|-------------|------|
| 重複なし & 全クラスタ `needs_serialization: false` | 修正フェーズを並列実行 |
| 重複あり / `needs_serialization: true` のクラスタあり | 該当クラスタは直列実行 (他は並列継続) |
| 重複多数 | クラスタ統合 (1 worktree で連続処理) を検討 |

> **重要**: Stage 1 で並列可と判定されても、Stage 2 で重複が出れば修正フェーズは自動並列化しない。
> ユーザーに通知して直列再実行・統合・手動判断のいずれかに回す。

### density 算出方法 (op cluster max-parallel への入力契約、ADR-0007 v3 §4.2-v3)

/**
 * 機能概要: op cluster max-parallel CLI が要求する `density` field (0.0..=1.0) を
 *           Stage 2 観測値からどう算出するかを定義する。
 * 作成意図: op-run/SKILL.md の動的算出 fence (1-2-f / 2-B-density) が Single Canonical
 *           Source として参照する入力契約。算出式の正本は ADR-0007 v3 §4.2-v3 と
 *           op-tools/crates/op-core/src/cluster/max_parallel.rs (本節は consumer 視点)。
 * 注意点: density は `op cluster max-parallel` への入力 field であり、CLI 内部の算出式
 *         (Phase 1 互換評価 / hard ceil 適用) は本ファイルでは扱わない。
 */

`op cluster max-parallel` は `cluster_count` と `density` を入力に取り max_parallel を算出する。
density は cluster 同士の競合度合い (`files_likely_to_modify` の cluster 間重複具合) を 0.0..=1.0 で表現する正規化値。

#### 算出式

```
density = (cluster 間で files_likely_to_modify が重複した cluster ペア数) / C(cluster_count, 2)
```

- `C(cluster_count, 2)` = `cluster_count * (cluster_count - 1) / 2` (cluster ペアの組合せ数)
- `cluster_count < 2` のとき `C(n, 2) = 0` のため、density は **0.0** とする (組合せが存在しない)
- 「重複した cluster ペア」とは Stage 2 で `cluster_a.files_likely_to_modify ∩ cluster_b.files_likely_to_modify ≠ ∅` を満たすペア

#### 使い分け (op-run/SKILL.md の動的算出 fence)

| タイミング | density 値 | 入力源 |
|----------|-----------|--------|
| Phase 1 末 (cluster manifest 確定直後、claim acquire 後) | `0.0` (initial) | observation なし。事前情報のみ |
| Phase 2-B 直後 (Stage 2 conflict check 完了後) | 上記算出式で観測値から再算出 | `files_likely_to_modify` の cluster 間重複ペア |

- Phase 1 末は **observation 前** のため density=0.0 を渡し、cluster_count + ceiling のみで暫定算出する。
- Phase 2-B 直後は Stage 2 観測値から density を再算出し、`op cluster max-parallel` を再呼び出しして修正フェーズの並列上限を実態に寄せる。
- `OP_RUN_MAX_PARALLEL` 環境変数で explicit override されている場合、Phase 2-B 直後の density 再算出は skip する (override が勝つ)。

#### 算出例

```
cluster_count = 4, Stage 2 で {c1, c2} と {c3, c4} の 2 ペアが重複
→ C(4, 2) = 6 (組合せ: c1c2, c1c3, c1c4, c2c3, c2c4, c3c4)
→ density = 2 / 6 ≈ 0.3333
```

```
cluster_count = 1 → C(1, 2) = 0 → density = 0.0 (組合せ 0 件、規約により 0.0 固定)
```

### 競合がある場合の方針 (両 Stage 共通)

| 状況 | 対処 |
|------|------|
| 1 ファイル重複 | 直列化 (片方 → main へ merge → もう一方を rebase して実行) |
| 多数ファイル重複 | クラスタを統合して 1 worktree で連続処理 |
| 重複ありつつ両方 Critical | ユーザーに通知、優先順位を聞く |
| 判定不能 (ファイル抽出失敗) | **並列化しない**。1 クラスタずつ直列実行 |
| `low` confidence クラスタ | 並列化しない |

**「たぶん大丈夫」での並列化は禁止。** 不確実なら直列化。

---

## 並列許可 / 禁止条件 (チェックリスト)

クラスタを並列実行に回す前に、司令官は以下を確認する。

### 並列許可条件 (すべて満たすこと)

- [ ] confidence が `high` または `medium`
- [ ] `files_likely_to_modify` が他クラスタと完全重複なし
- [ ] `risk_flags` が他クラスタと共有なし
- [ ] global_conflict_files に該当ファイルなし
- [ ] severity が Critical ではない
- [ ] 探知フェーズ後の `needs_serialization` が `false`

### 並列禁止条件 (1 つでも該当すれば直列化)

- `files_likely_to_modify` が空 (探知できていない)
- module 推定 confidence が `low`
- global_conflict_files (lockfile / manifest / `lib.rs` / `main.rs` / `tauri.conf.json` / `pubspec.yaml` 等) を触る可能性
- 同一 crate / app / package 配下の基盤ファイルを触る
- DB schema / migration を触る
- 設定ファイル / lockfile を触る
- Critical / Security / Data loss 系
- 探知フェーズで root cause が別クラスタと重なった

---

## ユーザー提案フォーマット

司令官は以下の形でユーザーに提示する。**根拠と不確実性を必ず明示**する。

```markdown
## op-run 実行プラン

### 並列実行候補

| ID      | Issue       | module | expert            | 変更候補                       | confidence | 並列理由                          |
|---------|-------------|--------|-------------------|-------------------------------|-----------|----------------------------------|
| auth-1  | #42 #43     | auth   | debug-expert      | src-tauri/src/auth/**         | high      | 他クラスタと変更候補重複なし      |
| ui-1    | #51         | ux-ui  | designer-expert   | frontend/src/pages/login/**   | high      | 単独ページ専用コンポーネント変更 (post-check: ux-ui-audit-expert) |

### 直列化対象

| ID     | Issue | 理由                                                  |
|--------|-------|------------------------------------------------------|
| core-1 | #60   | Cargo.toml / src/lib.rs を触る可能性あり (risk_flag) |
| db-1   | #61   | migration 変更の可能性あり                            |
| ?-1    | #70   | confidence: low (本文からファイル抽出不可)            |

### 注意

- 探知フェーズ後に `files_likely_to_modify` を再確認します。
- そこで重複が出た場合、該当クラスタの修正フェーズは並列化しません。

並列度 2 で約 8 分。承認しますか?
```

---

## 探知フェーズと修正フェーズの分離

op-run のフェーズ2 は以下のように分割される。

| フェーズ | 内容 | 並列性 |
|---------|------|-------|
| 2-A 探知 | 各 expert が investigate のみ実行、investigation report を提出 (edit / commit / push 禁止) | 全クラスタ並列可 |
| 2-B 再クラスタリング | 司令官が `files_likely_to_modify` で Stage 2 競合検出 | 司令官のみ |
| 2-C 修正 | 並列許可されたクラスタのみ修正・コミット (push はしない) | Stage 2 の結果に従う |
| 2-D Post-run conflict check | 司令官が実 diff の重複検証を経て初めて push する | 司令官のみ |

> 詳細は op-run SKILL.md のフェーズ2 を参照。

---

## クラスタリング精度を上げる小技 (将来拡張)

これらは Tasks/ 配下に拡張案として残し、初期実装では未対応で良い:

- **モジュール辞書の自動学習**: 過去の `Fixes #N #M` から module_map を生成
- **import 解析**: `madge` (TS) / `cargo-modules` (Rust) で依存グラフを取得
- **ホットスポット重み**: 直近 6 ヶ月で頻繁に変更されるファイルは独立クラスタに分離
- **CODEOWNERS 連携**: owner が異なるクラスタは安全に並列化できる
- **CI 結果による再評価**: 過去 PR の CI 失敗パターンから危険ファイルを自動収集

---

## 司令官の責務

- クラスタリング結果と confidence を必ずユーザーに提示 (--auto 時を除く)
- 競合 (Stage 1 / Stage 2) を検出したら **必ず明示**。「たぶん大丈夫」で進めない
- 各 expert に **探知フェーズと修正フェーズの分離**を必ず指示する
- Stage 2 (探知後の再競合検出) を **省略しない**。Stage 1 だけで本実装に進めない
- クラスタが見つからない (全 Issue 独立) → 個別タスクとして並列実行
- Critical/High セキュリティ Issue は --auto モードで除外 (人間の判断必須)
- `low` confidence クラスタは並列化しない
