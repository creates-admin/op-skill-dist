---
name: expert-optimize
description: optimize-expert に preload される方法論。
---

# expert-optimize: optimize-expert の知識ベース

> 「速くなりそう」では動かない。Before / After / 統計判定 / 挙動互換 / リスクで判断する。

| mode | 必読 |
|---|---|
| scan | `references/bottleneck-taxonomy.md` / `references/scan-contract.md` |
| apply | `references/benchmark-protocol.md` / `references/risk-and-rollback.md` / `references/apply-patterns.md` |
| frontend / Tauri / Flutter 案件 | `references/frontend-tauri.md` |

InDesign COM / ExtendScript、PDF / IDML / OCR パイプラインは repo に該当ファイル・依存があるときだけ、I/O・並列化の観点で扱う。

---

## Severity Policy

scan で finding を返す前に `references/scan-contract.md`「Severity Policy」を読む。

---

## Optimization Loop

### 1. Detect (scan)

コード読みで断定できる構造的問題だけを返す。confirmed の条件は `references/bottleneck-taxonomy.md`。

### 2. Measure (apply の起点)

`references/benchmark-protocol.md` に従って Before を取る。取れなければ着手しない。

### 3. Optimize (優先順位を守る)

1. 計算量 — O(n²) → O(n log n) / O(n)、線形探索 → index、repeated work 除去
2. I/O 削減 — ループ内 I/O 排除、N+1 解消、batch 化、parse once
3. allocation / clone 削減
4. キャッシュ — 純粋関数のメモ化。invalidation が明確な場合のみ、必ず bounded
5. 並列化 — `references/apply-patterns.md`「並列化 (Rayon)」の採用条件を全て満たすときのみ
6. 低レベル — SIMD / inline hint は最後。unsafe は原則禁止

計算量改善より先に並列化しない (O(n²) のまま par_iter しても入力が増えれば負ける)。最小差分で実装する。

### 4. Verify

- After を Before と同じコマンド・同じ入力・同じ環境で取得し、`references/benchmark-protocol.md`「統計的有意性の判定」節で clear / marginal / none / unstable を判定
- 既存テスト全 pass (Level 2、必要に応じ 3)
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

撤退条件の詳細と返し方は `references/risk-and-rollback.md`。

---

## scan (detect) モード

read-only (Level 0)。hyperfine / criterion などのベンチマークも scan では回さない。

patrol_sample の優先順位・scan-finding の書き方・bulk_group は `references/scan-contract.md` を読む。

---

## apply (optimize) モード

worktree 隔離で実装する。固定契約:

- 1 Issue = 1 bottleneck = 1 改善カテゴリ。複数の最適化・リファクタ・仕様変更を混ぜない。別 bottleneck は `remaining_issues[]` に列挙する
- Before を取ってから着手する。取れなければ着手せず `deferred`。Direct Mode でも計測データなしでは apply しない
- 入出力インターフェース・型・例外・エッジケース挙動を変えない
- 有意な改善が出なければ変更を取り下げる

手順: Before 取得 → 改善実装 → After 取得 → 統計判定 → Decide → 1〜2 ファイルごとに Level 1〜2、最後に Level 3 を 1 回
(`~/.claude/skills/_shared/project-profile.md`「Verification Ladder」。optimize は加えて benchmark を Before / After で必ず実施する) →
デバッグ計測コード (eprintln / console.log / debug print / 計測用 Instant) を削除 → code-review → commit
(optimize の必須節は `~/.claude/skills/_shared/commit-convention.md` §4)。

計測不足・不明な fixture は `assumptions[]` / `needs_human_decision` / `blocked_actions[]` に入れて返す。

### code-review の固有 skip 条件

- Before/After 確定前に invoke しない (順序: Before → 実装 → After → 採用判定 → code-review → commit)
- `decision` が `reverted` / `deferred` なら invoke しない (`code_review_invoked: false`、`code_review_skip_reason: "decision=reverted/deferred"`)

### 完了報告

`expert-report-schemas.md`「修正完了報告 schema」の共通 field に、`op help payload apply-report` の benchmark field
(`category` / `baseline` / `after` / `improvement` / `correctness` / `risk_level` / `decision` / `decision_rationale` / `remaining_issues` / `environment` 等) を加えて返す。
Before と After は同一コマンド・同一 fixture、`build: release`。`simplify_*` には code-review invoke の結果 (`code_review_*` と同じ値) を入れる。

コメントは `~/.claude/skills/_shared/project-profile.md`「コメント作法」。「なぜ速いか」は完了報告と commit message に書く。
