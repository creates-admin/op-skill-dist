# Issue クラスタリング + 二段階競合検出

op-run は Issue 群を共通機能でクラスタリングし並列実行計画を立てる。決定論部分の正本は CLI:

- `op run cluster plan --findings-json -` — グルーピング (domain 単位、上限 5 Issue)、optimize / refactor の 1 Issue = 1 cluster、
  confidence、Stage 1 の files 重複、`global_conflict_files`
- `op run cluster recheck --results-json <file>` — Stage 2 の再検出 (`needs_serialization` / `competing_file_groups`)
- `op run expert-resolve` — marker → `pro-*-expert` ラベル (優先順位・二重ラベル解決を含む) → fingerprint domain の順で apply / post-check expert を解決

本ファイルは CLI が決めない判断だけを書く。

- 同一モジュールの Issue は 1 worktree で連続処理し、独立クラスタは並列 worktree で処理する。1 クラスタ = 1 PR (`Fixes #N #M ...`)。
- Issue 本文のファイルは不完全である前提で、Plan-time と Post-investigation の二段階で競合検出する。判定不能なら直列化する。

---

## cluster 単位の `task_complexity` 集約ルール

- cluster の `task_complexity` = 含まれる Issue のうち最も重いもの (`api-design` > `integration` > `design` > `extension` > `routine`)。
  各 Issue の判定は `model-selection.md` §2。
- unset の Issue は `extension` 扱い (`model-selection.md` §9) として最大値に含める。
- op-run controller はこの値で apply agent の `Agent({ model })` を決める (`model-selection.md` §5.3 / §6)。

---

## クラスタリング・アルゴリズム

### Step 1: ファイル抽出

controller が Issue 本文から対象ファイルを抜き出して CLI に渡す。ファイルが見つからない Issue は即除外せず、
`target-unknown` (low confidence) としてフェーズ1.5 の健全性チェックに回す。そこで正規化できない場合のみ実装対象から除外する。

### Step 2: モジュール推定

CLI は module を使わない。controller はラベル `module:*` / `area:*` → 本文の明示語 → ファイルパスの共通 prefix の順で module を見立て、
同一 module かつ同一 domain の Issue を同じクラスタにまとめる候補にする。domain が異なれば同じ directory でも別クラスタにする。
共通 prefix が浅い (例: `src/` のみ) なら confidence を `low` にする。

### Step 3: カテゴリ推定

category (= domain) と apply / post-check expert は `op run expert-resolve` で解決する (op-run skill の `references/expert-resolution.md`)。
marker / ラベルは routing hint であり spawn authorization ではない (`runtime-contract.md` §9)。

### Step 4: 一次グルーピング (module + category)

同じ `(module, category)` の Issue を同一クラスタにまとめる。クラスタサイズ上限 = 5 Issue。

#### category = optimize の特例 (1 Issue = 1 PR)

Before/After benchmark を 1 bottleneck 単位で評価するため、optimize はクラスタリングしない。

#### category = refactor の特例 (1 Issue = 1 PR、例外なし)

同一ファイル・同一関数・dead code 削除であっても同一 PR に束ねない (op-scan / op-patrol の「refactor finding は batch 全面禁止」と同じ)。

### Step 5: confidence の決定

CLI は `high` / `medium` を返す (global_conflict_files や files 重複があれば `medium`)。controller は次の場合に `low` へ下げる:
ファイル抽出失敗 / module の共通 prefix が浅い / migration・lockfile・共通基盤を確実に触る。`low` のクラスタは並列化しない。

### Step 6: expert アサイン

apply / post-check expert は `op run expert-resolve` の結果を使う。

- post_check (op-run フェーズ3.5) = Issue 固有の再監査。global review (フェーズ4、review-expert) = 全 PR が必ず受ける独立レビュー。post_check が null でも global review は skip しない。
- ux-ui: 検出 (scan / patrol / post-check) は `ux-ui-audit-expert` (実装しない)、実装 (apply) は `designer-expert`。
- design: 検出も実装も `designer-expert`。UI files を触る場合は post-check で `ux-ui-audit-expert` を呼ぶ。
- domain → expert の対応表は `pr-templates.md`「domain → marker / ラベル表」。

---

## global_conflict_files (グローバル衝突リスク)

依存マニフェスト / lockfile / アプリ基盤 / DB・生成コード / CI・`.claude/` 設定など、Issue 本文に無くても変更されやすいファイル群。
判定の正本は `op run cluster plan` の出力 `global_conflict_files`。

- CLI が判定しない再利用 component (`frontend/src/components/**` 等) は controller が判断する (pages 専用なら除外、判定が割れたら触る可能性ありとして扱う)。
- `global_conflict_files` を持つクラスタ同士は直列化する。

---

## 二段階競合検出

### Stage 1: Plan-time conflict check

CLI は `files_declared` の重複だけを検出する。controller は次も確認し、該当するクラスタペアを直列化する:

- 同一 symbol / function / component の編集
- Tauri command と invoke を別クラスタで触る
- 共有 type / DTO、router / store / capability / config の共有
- migration / 生成コード (DB schema / OpenAPI) を両方が変更

判定不能なら直列化する。

### Stage 2: Post-investigation conflict check (探知フェーズ後)

各 expert は修正フェーズの前に探知フェーズを行い、investigation report (`expert-spawn.md`「investigation report schema」) を返す。
controller は `files_likely_to_modify` で `op run cluster recheck` を実行し、Stage 1 と同じ検証をやり直す。

| Stage 2 結果 | 対処 |
|-------------|------|
| 重複なし & 全クラスタ `needs_serialization: false` | 修正フェーズを並列実行 |
| 重複あり / `needs_serialization: true` / `files_likely_to_modify` が空 | 該当クラスタは serial_chains で逐次実行 (他は並列継続) |
| 重複多数 | クラスタ統合 (1 worktree で連続処理) を検討 |
| 重複ありつつ両方 Critical | ユーザーに通知、優先順位を聞く |

Stage 2 を省略しない。Stage 1 で並列可でも、Stage 2 で重複が出れば修正フェーズは並列化しない。
serial_chains は同じ run の中で共有 `OP_RUN_BASE_SHA` の上に逐次実行する (op-run skill の 2-B-partition)。
