---
name: expert-debug
description: debug-expert agent の方法論教科書。Rust / Tauri v2 / Vue 3 / TypeScript / Flutter を主対象とする不具合探知・最小修正エージェントの調査手順・バグパターン・検証ラダーを提供する。直接 invoke は想定せず、agent.md の skills フィールド経由で自動プリロードされる前提で動作する知識ベース。
---

# expert-debug: debug-expert の知識ベース

調査メソドロジー (5 ステップ)・3-bucket triage・Severity Policy・Repro Lock・Verification Ladder に従って自走する。

| mode / 状況 | Read する references |
|---|---|
| scan (detect) | `references/patterns.md`「catalog 索引 (top 20)」節 |
| scan で patrol_sample / candidate_report / bulk_group 付与 | `references/scan-contract.md` §1 / §2 / §3 |
| apply (fix) で再現テストを書く | `references/tools.md`「再現テストの言語別最小テンプレ」節 |
| Level 1 以上の検証 | `references/tools.md` + `~/.claude/skills/_shared/project-profile.md`「検証コマンド (スタック別)」 |

---

## Technology Profile

- 対象: Rust / Tauri v2 / Vue 3 (Composition API + Pinia + Vuetify) / TypeScript / Dart / Flutter。
- Python / FastAPI: `pyproject.toml` / `requirements.txt` / FastAPI import がある repo でのみ報告。
- React / Go: 報告しない (`ignored_noise`)。

---

## Severity Policy (報告閾値)

報告は **Critical / High のみ**。共通骨格は `~/.claude/skills/_shared/severity-rubric.md`「scan 報告ルール (共通)」節 (scan 前に Read)。

### Critical

- データ破壊 (保存済み内容の欠落 / 上書き / 不可逆な変更)
- 権限突破 / 任意パス書き込み / path traversal
- プロセスクラッシュ (panic, SIGABRT, OOM, 無限ループ)
- 本番操作不能 (起動失敗、フォールバック不在のフリーズ)
- 外部プロセス誤起動 / sidecar 暴走
- セキュリティ境界の破綻 (capability 漏れ、unsafe な FFI 境界)

### High

- 主要機能が無音で失敗する (画面上は成功、実は処理されていない)
- 非同期処理の取りこぼし (`spawn` 後に handle を捨てる、await 漏れ)
- ファイル入出力の失敗を検知できない (`unwrap_or_default` で握りつぶし)
- 日本語パス / 空入力 / 大量件数 / Windows UNC で壊れる
- Rust panic が Tauri command 経由で UI まで伝播
- Tauri invoke の payload schema 不一致 (silent serde 失敗)
- Flutter で dispose 後に setState / Stream 受信
- Vue state と Rust backend state の不整合 (二重管理 / 競合)

Medium / Low は報告しない (`ignored_noise`)。

---

## 核心メソドロジー (5 ステップ)

コードを読んで推測せず、実際の値を確認する。静的分析は仮説立案、検証は実行時データで行う。

1. **症状 → 仮説 (3〜5 個)**: エラー・スタックトレース・再現手順から原因カテゴリを推定し、データフロー (入力 → 処理 → 出力) を追う。
   Tauri アプリでは「Vue → invoke → Rust command → fs/proc → Result → Vue」の境界を最初に疑う。有力仮説から検証する。
2. **テスト駆動検証 (主要手段)**: 該当関数に最小テストを書き、境界値・空・null・型不一致・日本語パス・大量件数で発生点を特定する。
3. **ログ挿入 (フォールバック)**: テストで届かない領域 (UI 連携・状態依存・タイミング・OS 差分) のみ。
   仮説を 1 回の再現で切り分けられる最小の点 (データ入口 / invoke 境界の serde 前後 / 条件分岐 / データ出口) に挿す。
   **`[DEBUG]` プレフィックス必須、修正後に全削除。**
4. **最小修正**: リファクタを混ぜない。例外を握りつぶさない (Rust は `?` / Result、TS は catch でログ + 上位へ再 throw)。
   修正理由をコメント 1 行。1〜2 ファイルごとに Level 1〜2 を回す。
5. **リグレッション確認**: Repro Lock の `repro_command` を再実行して解消を確認。影響範囲の既存テストを実行。
   `grep '\[DEBUG\]'` で 0 件を確認。残存リスクを完了報告に書く。

---

## Repro Lock (再現条件のロック)

修正前に可能な限り埋める。分からなかった項目はそう明記する。

```yaml
repro_lock:
  symptom:           # 何が起きるか
  repro_command:     # 再現コマンド or テスト名
  repro_steps:       # GUI なら手順、CLI ならコマンド列
  input_fixture:     # 入力データの位置と内容
  expected:
  actual:
  failure_frequency: # always | flaky (N/M 回) | rare | unknown
  environment: { os, rust_version, node_version, flutter_version, tauri_version }
  timezone:          # DST / TZ 依存バグ用
  locale:            # NFC/NFD / 文字種 / sort
  seed:
  notes:             # ネットワークドライブ / UNC / 日本語パス / 初回起動 / 大量件数 等
```

Tauri / Flutter / ファイル処理では条件依存性を最初に確認する: Windows だけ / 日本語・NFD・UNC パスだけ / ネットワークドライブだけ /
ファイルダイアログ経由だけ / 初回起動・config 未存在時だけ / 大量件数・巨大ファイルだけ。

### Repro Lock の最低充足条件 (apply mode)

`symptom` / `expected` / `actual` / `affected file` または `suspected entrypoint` / `repro_command` または `repro_steps` が埋まるまで修正に入らない。

不足時:

- コードを変更しない。
- Direct Mode: 不足項目を人間に提示してよい。
- OP-managed Mode: 質問せず、`assumptions[]` と `needs_human_decision` (`decision_type: "behavior"`) を完了報告に返す。
- 例外: 静的に Critical と断定できる panic / data loss / path traversal は最小修正してよい
  (コミットメッセージに「静的 Critical のため Repro Lock 不完全のまま修正」、OP-managed では `assumptions` にも記録)。

---

## 実行モード

scan = detect mode、apply = fix mode。

### scan (detect) モード — read-only

- Read / Grep / Glob のみ。scope mode (`explicit_paths` / `changed_files` / `patrol_sample`) は
  `~/.claude/skills/_shared/expert-spawn.md`「scan scope mode 契約 (3 モード)」節 (探索対象を選ぶ前に Read)。
- patrol_sample では対象を選ぶ前に `references/scan-contract.md` §1 を Read する。

#### 内部 triage: 3-bucket 分類

この分類を経てから JSON にマップする。

1. **confirmed_findings** — 静的証拠 (コード引用・呼出経路) だけで Critical / High と断定できる → `{"findings": [...]}` に入れる。
2. **investigation_candidates** — 怪しいが重大さが入力データや実行条件に依存する → 既定では出力しない。
   `candidate_report: true` が明示された時だけ `references/scan-contract.md` §2 に従う。
3. **ignored_noise** — React / Go 由来 / Medium・Low / 静的根拠が弱い / 規約どおりのコード → 捨てる。

#### scan 出力

`~/.claude/skills/_shared/expert-spawn.md`「scan 出力 envelope 契約」節と scan-finding schema に従う。debug 固有の値:

- `domain: "debug"` / `recommended_runner: "debug-expert"`
- `post_check_expert`: security 境界が絡めば `security-expert`、それ以外は `null`
- `bulk_group`: 付与前に `references/scan-contract.md` §3 を Read
- 検出 0 件なら `{"findings": []}`

### apply (fix) モード — worktree 隔離

契約:

- 1 Issue = 1 bug class = 1 minimal fix。複数種類のバグ・リファクタ・仕様変更を混ぜない。
- 失敗する再現テストを先に書き (Repro Lock の `repro_command` と一致させる)、最小修正後に同じテストが通ることを確認する。
- 実行できなかった検証は理由と残存リスクを完了報告に書く。

手順:

1. Issue 指示書 (`expert-spawn.md` の apply 入力契約) を把握する。
2. Repro Lock を埋める。
3. 5 ステップで自走する (OP-managed では質問せず、不足は `assumptions[]` / `needs_human_decision` / `blocked_actions[]` で返す)。
4. 再現テスト (書く前に `references/tools.md`「再現テストの言語別最小テンプレ」を Read) → 最小修正 → pass 確認。
5. 1〜2 ファイルごとに Level 1〜2、修正完了後に Level 3 を 1 回。
6. `[DEBUG]` ログ 0 件を確認し、リグレッション確認。
7. commit (形式は `~/.claude/skills/_shared/commit-convention.md`。修正理由・Repro Lock 要点・残したテストの判定根拠を message に)。push しない。
8. 完了報告: 修正ファイル / Level 別検証結果 / 残したテスト / 残存リスク / 実行できなかった検証。

---

## Verification Ladder (検証梯子)

| Level | 種類 | Rust | Vue/TS | Flutter | Tauri v2 統合 |
|---|---|---|---|---|---|
| 0 | static scan | `rg` 危険パターン | 同左 | 同左 | 同左 |
| 1 | type / lint | `cargo check` / `cargo clippy -- -D warnings` | `vue-tsc --noEmit` / `eslint .` | `flutter analyze` | frontend / backend 各 Level 1 |
| 2 | unit test | `cargo test` | `vitest run` | `flutter test` | `cd src-tauri && cargo test` |
| 3 | package build | `cargo build` | `npm run build` | `flutter build <target>` (必要時) | backend + frontend の dev build |
| 4 | integration | — | — | — | `tauri build` / `tauri dev` (capability の完全チェックを含む) |
| 5 | E2E / 実機 | — | — | `flutter test integration_test/` | Tauri WebDriver / Windows 実機 / InDesign COM / network drive |

- detect mode は Level 0 のみ (`severity-rubric.md`「scan 実行レベル」。scan で最初のコマンドを打つ前に Read)。
- fix mode は Level 1〜3。壊し得る境界で決める: 型・シグネチャ → Level 1 / ロジック・分岐・状態遷移 → Level 2 /
  依存・ビルド構成・IPC 境界・公開 API → Level 3。迷ったら上に倒す。
- Level 4 は司令官が明示した場合のみ。Level 5 は fix mode で実施しない (dedicated Issue)。
- コマンドは存在確認してから実行。ツール非導入は「未実行: Level X (理由)」として報告する。

---

## バグパターン catalog

探知優先度 1 の 4 領域: Tauri v2 境界 (最頻出) / Rust / Vue 3 + TypeScript / Flutter / Dart。
scan では当たりを付ける前に `references/patterns.md`「catalog 索引 (top 20)」節を Read する (検出兆候の正本)。

---

## テスト残存ルール (test-expert との境界)

debug-expert が残すのは修正に直結するリグレッションテストのみ。周辺カバレッジ穴・ゴミ整理・fixture 改善は test-expert へ。

| テスト種類 | 扱い |
|---|---|
| 再現テスト (本命) | 残す |
| 仮説検証テスト | 削除 (情報はコミットメッセージへ) |
| エッジケース 1 本 | 残す |
| エッジケース複数 | test-expert へ Issue 起票 |

---

## 実装完了後の code-review invoke

手順は `~/.claude/skills/_shared/apply-completion-checklist.md`。skip 条件なし (apply 後は必ず invoke)。

---

## CLAUDE.md 規約との整合

共通骨格は `~/.claude/skills/_shared/project-profile.md`「対象 repo 規約への準拠 (worker 共通)」節 (apply で最初のファイルを編集する前に Read)。debug 固有:

- 修正で深いネストを増やさない (ガード節優先)
- 修正理由をコメント 1 行
- バグ修正とリファクタは別 PR
- 実行不能だった Level を完了報告に書く

---

## 参照ドキュメント

| Path | 用途 |
|---|---|
| `~/.claude/skills/_shared/runtime-contract.md` | runtime spawn 境界 / apply 可否 |
| `~/.claude/skills/_shared/expert-spawn.md` | scan-finding schema / envelope / apply 入力契約 |
| `~/.claude/skills/_shared/common-setup.md` | Explore 委譲プロトコル |
| `~/.claude/skills/_shared/read-economy.md` | 再 Read 抑制 (R1〜R5) |
| expert-ux-ui-audit skill の `references/a11y-checklist.md` | UI 起因バグ (focus / aria / keyboard) の確認観点 |

---

## Direct Expert Run (直接実行時の対話型入口)

共通手順は `~/.claude/skills/_shared/invocation-mode.md`。debug-expert は **scan-first**: 原因特定後、ユーザー許可があれば apply。
