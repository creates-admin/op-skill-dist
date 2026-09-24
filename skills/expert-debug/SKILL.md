---
name: expert-debug
description: debug-expert に preload される方法論。
---

# expert-debug: debug-expert の知識ベース

| mode / 状況 | Read する references |
|---|---|
| scan (detect) | `references/patterns.md`「catalog 索引 (top 20 — active stack 集中版)」節 |
| scan で patrol_sample / bulk_group 付与 | `references/scan-contract.md` §1 / §3 |
| apply (fix) で再現テストを書く | `references/tools.md`「再現テストの言語別最小テンプレ」節 |

---

## Severity Policy (報告閾値)

報告ルールは `~/.claude/skills/_shared/severity-rubric.md`「scan 報告ルール (共通)」節 (scan 前に Read)。debug 固有の基準:

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

Python / FastAPI は `pyproject.toml` / `requirements.txt` / FastAPI import がある repo でのみ報告する。

---

## 核心メソドロジー

コードを読んで推測せず、実際の値を確認する。静的分析は仮説立案、検証は実行時データで行う。

- 仮説はデータフロー (入力 → 処理 → 出力) で立てる。Tauri アプリでは「Vue → invoke → Rust command → fs/proc → Result → Vue」の境界を最初に疑う。
- 検証の主手段は該当関数への最小テスト (境界値・空・null・型不一致・日本語パス・大量件数)。
- ログ挿入はテストで届かない領域 (UI 連携・状態依存・タイミング・OS 差分) のみ。仮説を 1 回の再現で切り分けられる点
  (データ入口 / invoke 境界の serde 前後 / 条件分岐 / データ出口) に挿す。`[DEBUG]` プレフィックスを付け、修正後に全削除する。
- 修正は最小。リファクタを混ぜない。例外を握りつぶさない。コメントは `~/.claude/skills/_shared/project-profile.md`「コメント作法」
  (修正理由は commit message に書く)。

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

不足時はコードを変更せず、不足項目を `assumptions[]` と `needs_human_decision` (`decision_type: "behavior"`) で返す (Direct Mode では人間に提示してよい)。
例外: 静的に Critical と断定できる panic / data loss / path traversal は最小修正してよい
(commit message に「静的 Critical のため Repro Lock 不完全のまま修正」、OP-managed では `assumptions` にも記録)。

---

## 実行モード

### scan (detect) モード — read-only

- scope mode は `~/.claude/skills/_shared/expert-spawn.md`「scan scope mode 契約 (3 モード)」節。patrol_sample では対象を選ぶ前に `references/scan-contract.md` §1 を Read する。
- 静的証拠 (コード引用・呼出経路) だけで Critical / High と断定できるものだけを findings に入れる。入力データや実行条件に依存するもの、React / Go 由来、規約どおりのコードは捨てる。
- 出力値: `domain: "debug"` / `recommended_runner: "debug-expert"` / `post_check_expert`: security 境界が絡めば `security-expert`、それ以外は `null` /
  `bulk_group`: 付与前に `references/scan-contract.md` §3 を Read。

### apply (fix) モード — worktree 隔離

1 Issue = 1 bug class = 1 minimal fix。複数種類のバグ・リファクタ・仕様変更を混ぜない。

1. Repro Lock を埋める。
2. 失敗する再現テストを先に書く (Repro Lock の `repro_command` と一致させる。書く前に `references/tools.md`「再現テストの言語別最小テンプレ」を Read)。
3. 最小修正 → 同じテストが通ることを確認する。1〜2 ファイルごとに Level 1〜2、修正完了後に Level 3 を 1 回
   (`~/.claude/skills/_shared/project-profile.md`「Verification Ladder」)。
4. `repro_command` を再実行して解消を確認し、影響範囲の既存テストを実行する。`rg '\[DEBUG\]'` で 0 件を確認する。
5. commit (debug の必須節は `~/.claude/skills/_shared/commit-convention.md` §4)。完了報告に残存リスクを書く。

---

## テスト残存ルール (test-expert との境界)

残すのは修正に直結する再現テスト 1 本だけ。仮説検証テストは削除し、情報は commit message に残す。
周辺のエッジケース・カバレッジ拡張・fixture 整理は完了報告の `delegated_test_issue_request[]` で test-expert 向けに要求する (起票はしない)。

UI 起因バグ (focus / aria / keyboard) の確認観点は expert-ux-ui-audit skill の `references/a11y-checklist.md`。
