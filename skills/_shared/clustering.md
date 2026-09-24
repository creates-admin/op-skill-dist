# Issue クラスタリング + 二段階競合検出

op-run は GitHub Issue 群を共通機能でクラスタリングし並列実行計画を立てる。本ファイルはクラスタリングと二段階競合検出の正本。決定論部分は `op run cluster plan` / `op run cluster recheck` が実装している (`op-tools/crates/op-core/src/cluster/plan.rs`)。

- 同一モジュールの Issue は 1 worktree で連続処理し、独立クラスタは並列 worktree で処理する。1 クラスタ = 1 PR (`Fixes #N #M ...`)。
- Issue 本文のファイルは不完全である前提で、Plan-time と Post-investigation の二段階で競合検出する。判定不能なら直列化する。

---

## 入力と出力

入力: open Issue のリスト。各 Issue から以下を抽出:

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

各 Issue の `task_complexity` (`routine` / `extension` / `design` / `integration` / `api-design`) は `model-selection.md` §2 で判定する。

- cluster の `task_complexity` = 含まれる Issue のうち最も重いもの (順序: `api-design` > `integration` > `design` > `extension` > `routine`)。
- unset の Issue は暫定で `extension` 扱い (`model-selection.md` §9) として最大値に含める。
- op-run controller はこの値で apply agent の `Agent({ model })` を決める (mapping と override 優先順位は `model-selection.md` §5.3 / §6)。

---

## クラスタリング・アルゴリズム

### Step 1: ファイル抽出

各 Issue 本文から以下のパターンでファイルを抽出する (主対象: Rust / Flutter / Vue / Tauri v2)。

| パターン | 例 |
|---------|-----|
| インラインコード | `` `src-tauri/src/main.rs` `` |
| 行番号付き | `src-tauri/src/main.rs:42` |
| 自由記述 | `frontend/src/components/Button.vue のあたり` |
| 単独パス | `Cargo.toml`, `pubspec.yaml` |

対象拡張子: `.rs .toml .lock .ts .tsx .vue .js .json .dart .yaml .md`

ファイルが見つからない Issue は即除外しない。`target-unknown` (low confidence) として保持し、op-run フェーズ1.5 の健全性チェックに回す。そこで正規化できない場合のみ実装対象から除外する。

### Step 2: モジュール推定

| 順位 | 入力 | 例 | confidence |
|-----|------|-----|-----------|
| 1 | ラベル `module:xxx` / `area:xxx` | `module:auth` | high |
| 2 | Issue title/body の明示語 | 「auth の login が…」 | high |
| 3 | プロジェクトの `module_map` (任意、`.claude/module_map.yaml` 等。スキーマはプロジェクト固有) | — | high |
| 4 | ファイルパスの LCP | `src/auth/` | medium |
| 5 | LCP 浅い / 不明 | `src/` のみ | low → 直列化 |

#### per-directory / per-module slicing hint

- 同一 directory / module 内に閉じ、機能カテゴリが一致する Issue 群は同一クラスタにまとめる優先候補とする。
- 機能カテゴリ (label / hidden marker) が異なれば directory hint より機能カテゴリを優先する (例: `src/auth/` 内でも `debug` と `refactor` は別クラスタ)。
- LCP と directory hint が矛盾したら LCP を優先する。
- 上限はクラスタサイズ上限 (5 Issue) と同じ。

### Step 3: カテゴリ推定

#### 解決順序 (上から優先)

1. **Issue 本文の hidden marker を routing hint として最優先で参照する**:
   - `<!-- op-fingerprint -->` / `<!-- op-fingerprint-bulk -->` の第 1 segment (domain) → category の hint (`active-expert-registry.md` / `runtime-contract.md` で active な category であることを検証してから採用)
   - `<!-- op-run-expert: <expert> -->` / `<!-- op-post-check-expert: <expert> -->` → apply / post-check の hint。Step 6 のヒューリスティックより優先する。`active-expert-registry.md` に無い expert は spawn できない。planned expert は `planned-experts.md` の substitutes で正規化してから spawn する
   - hint は spawn authorization ではない。最終 spawn 可否は `runtime-contract.md` の resolution に従う
2. **ラベルから category を推定** (marker が無い場合):
   - `pro-debug-expert` → debug
   - `pro-refactor-expert` → refactor
   - `pro-optimize-expert` → optimize
   - `pro-security-expert` → security
   - `pro-ux-ui-audit-expert` → ux-ui (検出側、apply は designer-expert)
   - `pro-designer-expert` → design (apply も designer-expert)
   - `pro-feature-expert` → feature
   - `pro-test-expert` → test

   複数あれば優先順位で決定: `security > debug > refactor > optimize > ux-ui > design > feature > test`

   **二重ラベル時の明示解決** (priority 表より優先):

   - `pro-debug-expert` + `pro-security-expert`
     → category = security / apply = op-run の判定優先順位 1-8 で `security-expert` または `debug-expert` / post-check = `security-expert`
   - `pro-designer-expert` + `pro-ux-ui-audit-expert`
     → fingerprint の domain があればそれを優先。無ければ apply = `designer-expert` / post-check = `ux-ui-audit-expert`
   - `pro-feature-expert` + `pro-ux-ui-audit-expert`
     → category = feature / apply = `feature-expert` / post-check = `ux-ui-audit-expert`
   - `pro-refactor-expert` + `pro-security-expert`
     → category = refactor / apply = `refactor-expert` / post-check = `security-expert` (security は post-check 専任)
   - `pro-refactor-expert` + `pro-ux-ui-audit-expert`
     → category = refactor / apply = `refactor-expert` / post-check = `ux-ui-audit-expert`

3. **本文の簡易解析** (marker / ラベルともに無い場合): キーワード `エラー` / `性能` / `デザイン` / `デザインシステム` / `token` / `theme` 等から推定。

### Step 4: 一次グルーピング (module + category)

同じ `(module, category)` の Issue を同一クラスタにまとめる。クラスタサイズ上限 = 5 Issue。超えたら細分化する。

#### category = optimize の特例 (1 Issue = 1 PR 原則)

`optimize` の Issue は原則クラスタリングしない (Before/After benchmark を 1 bottleneck 単位で因果評価するため)。

同一 PR に束ねてよいのは以下をすべて満たす場合のみ:

1. 同一関数 / 同一ホットパスに対する改善
2. 同一 benchmark コマンド・同一入力 fixture で Before/After を一括評価できる
3. 改善方針が同質 (例: 同じ regex を複数箇所で LazyLock 化)
4. risk_level が low に揃う

1 つでも欠けば同 module でも個別クラスタ (1 Issue = 1 PR)。

#### category = refactor の特例 (Phase 1: 1 Issue = 1 PR を厳守 / 例外なし)

`refactor` の Issue はクラスタリングしない (1 Issue = 1 PR、例外なし)。同一ファイル・同一関数・dead code 削除であっても同一 PR に束ねない (op-scan / op-patrol の「refactor finding は batch 全面禁止」と同じ)。

### Step 5: confidence の決定

| confidence | 条件 |
|-----------|------|
| **high** | module が ラベル/本文 で明示 + ファイル明示 + global_conflict_files に該当しない |
| **medium** | ファイルは明示だがモジュールは LCP 推定 / 一部 global_conflict_files に触れる可能性 |
| **low** | ファイル抽出失敗 / LCP 浅い / migration / lockfile / 共通基盤を確実に触る |

`low` のクラスタは並列化しない (直列化)。

### Step 6: expert アサイン

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

- post_check (op-run フェーズ3.5) = Issue 固有の再監査。global review (フェーズ4、review-expert) = 全 PR が必ず受ける独立レビュー。post_check が null でも global review は skip しない。
- hidden marker `op-run-expert` / `op-post-check-expert` があれば本表より優先する (Step 3 の検証・正規化規則に従う)。
- **ux-ui**: 検出 (scan / patrol / post-check) は `ux-ui-audit-expert` (実装しない)、実装 (apply) は `designer-expert`。apply 後は必ず ux-ui-audit-expert を post-check に呼ぶ。
- **design**: 検出も実装も `designer-expert` (design system 破綻)。UI files を触る場合は post-check で `ux-ui-audit-expert` を呼び、focus / disabled / contrast 等の regression を確認する。

---

## global_conflict_files (グローバル衝突リスク)

どのクラスタからも触られやすく、Issue 本文に無くても変更されやすいファイル群。具体パターンの正本は `op run cluster plan` の出力 `global_conflict_files` (実装: `plan.rs::is_global_conflict_file`)。カテゴリ:

- 依存マニフェスト / lockfile (`Cargo.toml` / `package.json` / `pubspec.yaml` と各 lockfile)
- Rust / Tauri 基盤 (`src/lib.rs` / `main.rs` / `tauri.conf.json` / capabilities / permissions)
- Vue / Frontend 基盤 (vite / tsconfig / `App.vue` / `main.ts` / router / stores / layouts)
- Flutter 基盤 (`analysis_options.yaml` / `lib/main.dart`)
- DB / 生成コード / グローバル設定 (migrations / schema.sql / openapi / proto / generated / `.github/workflows/` / `.claude/`)

CLI が判定しない条件付き項目: 再利用 component (`frontend/src/components/**`) は司令官が判断する (pages 専用なら除外、判定が割れたら触る可能性ありとして扱う)。

これらに触る可能性があるクラスタは:

- **risk_flags** に記録 (例: `touches_cargo_toml`, `touches_shared_store`)
- confidence を **medium 以下に下げる**
- 同じ risk_flag を持つクラスタ同士は **直列化**

---

## 二段階競合検出

### Stage 1: Plan-time conflict check

クラスタリング直後、全クラスタペアについて以下のいずれかがあれば直列化対象に加える:

1. `files_declared` の重複
2. `risk_flags` (global_conflict_files) の共有
3. 同一 symbol / function / component (本文から抽出できる範囲)

| カテゴリ | 例 |
|---------|-----|
| ファイル重複 | `src/auth/login.rs` を両方が触る |
| 同一 symbol | 別ファイルで同じ関数名 / コンポーネント名を編集 |
| 依存マニフェスト共有 | 両方が `Cargo.toml` に依存追加 |
| migration / 生成コード | 両方が DB schema / OpenAPI を変更 |
| Tauri 境界またぎ | command と invoke を別クラスタで触る |
| shared type / DTO | 型定義が複数クラスタから参照される |
| グローバル設定 | router / store / capability / config 共有 |

判定不能なら直列化する。

### Stage 2: Post-investigation conflict check (探知フェーズ後)

各 expert は修正フェーズの前に探知フェーズを行い、investigation report を司令官に提出する (完全な schema は `expert-spawn.md`):

```json
{
  "issue": 42,
  "cluster_id": "auth-debug-1",
  "suspected_root_cause": "...",
  "files_read": ["src/auth/login.rs", "src/lib.rs"],
  "files_likely_to_modify": ["src/auth/login.rs", "Cargo.toml"],
  "risk_files": ["Cargo.toml"],
  "needs_serialization": true,
  "reason": "Cargo.toml に依存追加が必要"
}
```

司令官は `files_likely_to_modify` で Stage 1 と同じ検証をやり直す (`op run cluster recheck --results-json <file>`)。

| Stage 2 結果 | 対処 |
|-------------|------|
| 重複なし & 全クラスタ `needs_serialization: false` | 修正フェーズを並列実行 |
| 重複あり / `needs_serialization: true` のクラスタあり | 該当クラスタは直列実行 (他は並列継続) |
| 重複多数 | クラスタ統合 (1 worktree で連続処理) を検討 |

Stage 1 で並列可でも、Stage 2 で重複が出れば修正フェーズは並列化しない。ユーザーに通知し、直列再実行・統合・手動判断のいずれかに回す。

### density 算出方法 (op cluster max-parallel への入力契約)

- `density` = files_likely_to_modify が重複した cluster ペア数 / C(cluster_count, 2) (cluster_count < 2 は 0.0)。`op run cluster recheck` / `op run cluster-overlap` が出力する値をそのまま `op cluster max-parallel` に渡す。
- Phase 1 末 (観測前) は `density: 0.0` で暫定算出し、Phase 2-B 直後に Stage 2 観測値で再算出する。
- `OP_RUN_MAX_PARALLEL` で explicit override されている場合は再算出を skip する。

### 競合がある場合の方針 (両 Stage 共通)

| 状況 | 対処 |
|------|------|
| 1 ファイル重複 | 直列化 (片方 → main へ merge → もう一方を rebase して実行) |
| 多数ファイル重複 | クラスタを統合して 1 worktree で連続処理 |
| 重複ありつつ両方 Critical | ユーザーに通知、優先順位を聞く |
| 判定不能 (ファイル抽出失敗) | 並列化しない。1 クラスタずつ直列実行 |
| `low` confidence クラスタ | 並列化しない |

「たぶん大丈夫」での並列化は禁止。

---

## 並列許可 / 禁止条件 (チェックリスト)

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

根拠と不確実性を明示して提示する。

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

## 司令官の責務

- クラスタリング結果と confidence をユーザーに提示する (--auto 時を除く)
- Stage 1 / Stage 2 の競合を検出したら明示する
- 各 expert に探知フェーズ (edit / commit / push 禁止) と修正フェーズの分離を指示する (フェーズ構成: `op-run/SKILL.md` フェーズ2)
- Stage 2 を省略しない。Stage 1 だけで本実装に進めない
- クラスタが見つからない (全 Issue 独立) → 個別タスクとして並列実行
- Critical/High セキュリティ Issue は --auto モードで除外 (人間の判断必須)
- `low` confidence クラスタは並列化しない
