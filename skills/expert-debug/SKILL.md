---
name: expert-debug
description: debug-expert agent の方法論教科書。Rust / Tauri v2 / Vue 3 / TypeScript / Flutter を主対象とする不具合探知・最小修正エージェントの調査手順・バグパターン・検証ラダーを提供する。直接 invoke は想定せず、agent.md の skills フィールド経由で自動プリロードされる前提で動作する知識ベース。
---

# expert-debug: debug-expert の知識ベース

<!--
機能概要: debug-expert agent が op-scan / op-run から呼ばれた際に
         参照する方法論・パターン・テンプレを集約した教科書。
         Rust / Tauri v2 / Vue 3 / TypeScript / Flutter / Dart に主対象を絞る。
作成意図: agent.md は人格と契約に集中させ、HOW の本体はここに置く。
         汎用デバッグ Skill ではなく、実プロダクトの主戦技術スタックに
         最適化された不具合探知・最小修正エージェント用 Skill として再設計。
注意点: agent から skills: で自動プリロードされる前提。直接 /expert-debug
       のような起動は基本想定しない (description で自然に抑制)。
       2026-07-29 (ADR-0030 決定 1 / Wave B1) に本文を「references を 1 行も
       読まなくても事故らない層」へ絞り、検出兆候一覧を references/patterns.md、
       再現テスト雛形を references/tools.md、scan 契約の詳細を
       references/scan-contract.md へ移設した (捨てた情報はゼロ)。
-->

## このドキュメントの位置づけ

debug-expert agent (`~/.claude/agents/debug-expert.md`) が `skills: [expert-debug]` で本ファイルを自動プリロードする。
agent はここに書かれた **5 ステップの調査メソドロジー**、**3-bucket triage**、**Severity Policy**、**Repro Lock**、**Verification Ladder** に従って自走する。

本文は「references を 1 行も読まなくても事故らない層」に絞ってある。
検出兆候の一覧・schema 全文・コード雛形は references が正本なので、下表のタイミングで必ず Read する。

| mode / 状況 | 必読 references |
|------|----------------|
| scan (detect) | `references/patterns.md` の「catalog 索引 (top 20)」節 (検出兆候一覧の正本) |
| scan で patrol_sample / candidate 指定 / bulk_group 付与 | `references/scan-contract.md` (§1 patrol_sample 優先順位 / §2 investigation_candidates schema / §3 bulk_group と分割ルール) |
| apply (fix) — 再現テスト作成 | `references/tools.md` の「再現テストの言語別最小テンプレ」節 |
| Level 1 以上の検証を回すとき | `references/tools.md` の project-type 別 recipe (feature-expert とも共有する正本、2026-07-23 集約) |

React / Go は対象外スタックとして通常検出しない。

---

## Technology Profile (常時参照スコープ)

このエージェントは「あらゆる言語の汎用デバッガ」ではなく、以下の active stack に集中する。
**対象外スタックを意図的に削ることで、誤検知と report ノイズを下げる**ことが設計目的。

```yaml
active_stack:
  - Rust          # ドメインロジック・Tauri backend
  - Tauri v2      # WebView + Rust の境界アプリケーション
  - Vue 3         # フロントエンド (Composition API + Pinia + Vuetify)
  - TypeScript    # Vue / Tauri フロントの型システム
  - Dart          # Flutter アプリ
  - Flutter       # クロスプラットフォーム UI

conditional_stack:
  - Python/FastAPI  # AI Gateway / Python backend リポジトリのみ参照

disabled_by_default:
  - React  # 通常検出しない (主戦技術から除外)
  - Go     # 通常検出しない (主戦技術から除外)
```

scan モードの動作:
- active_stack の検出は通常通り報告対象
- conditional_stack はリポジトリに該当ファイル (`pyproject.toml` / `requirements.txt` / FastAPI import 等) があるときだけ報告
- disabled_by_default は **報告しない**。検出しても `ignored_noise` に分類して捨てる

---

## Severity Policy (報告閾値)

報告対象は **Critical / High のみ**。報告ルールの共通骨格 (静的証拠必須 / 可能性表現の原則禁止 /
0 件表現 / 規約準拠は指摘しない) は `~/.claude/skills/_shared/severity-rubric.md` の
「scan 報告ルール (共通)」節が正本 — **scan (detect) に入る前に Read する**。
以下は debug-expert 固有の判定基準で、エージェントの主観で揺らがないようにするためのもの。

### Critical

- データ破壊 (保存済み内容の欠落 / 上書き / 不可逆な変更)
- 権限突破 / 任意パス書き込み / path traversal
- プロセスクラッシュ (panic, SIGABRT, OOM, 無限ループ)
- 本番操作不能 (起動失敗、フォールバック不在のフリーズ)
- 外部プロセス誤起動 / sidecar 暴走
- セキュリティ境界の破綻 (capability 漏れ、unsafe な FFI 境界)

### High

- 主要機能が**無音で**失敗する (画面上は成功、実は処理されていない)
- 非同期処理の取りこぼし (`spawn` 後に handle 捨てる、await 漏れ)
- ファイル入出力の失敗を検知できない (`unwrap_or_default` で握りつぶし)
- 日本語パス / 空入力 / 大量件数 / Windows UNC で壊れる
- Rust panic が Tauri command 経由で UI まで伝播 (capability 越境)
- Tauri invoke の payload schema 不一致 (silent serde 失敗)
- Flutter で dispose 後に setState / Stream 受信
- Vue state と Rust backend state が不整合になる (二重管理 / 競合)

### Medium / Low

原則として detect mode では **報告しない**。`ignored_noise` に分類するか、品質改善 Issue として別系統に投げる。

---

## 核心メソドロジー (5 ステップ)

> 「コードを読むだけで推測しない、必ず実際の値を確認する」が原点。
> 静的分析は仮説立案、検証は実行時データで行う。

### 1. 症状 → 仮説立案 (3〜5 個に絞る)

- エラーメッセージ・スタックトレース・再現手順から原因カテゴリを推定
- 関連コードを Grep / Read で探索、データフロー (入力 → 処理 → 出力) を追跡
- Tauri アプリでは「Vue → invoke → Rust command → fs/proc → Result → Vue」の境界を最初に疑う
- 仮説を 3〜5 個に絞り、優先度を付ける (有力仮説から検証)

### 2. テスト駆動検証 (主要手段)

- 該当関数に **最小テスト** を書き、実入力 → 実出力を観察
- 境界値・空・null・型不一致・日本語パス・大量件数を変えて問題発生点を特定
- テストを残すかは都度判断 (回帰高リスク時のみ保持、無駄は削除)

### 3. ログ挿入 (フォールバック)

テストで届かない領域 (UI 連携・状態依存・タイミング系・OS 差分) のみ。

**挿す位置は「立てた仮説を 1 回の再現で切り分けられる最小の点」で決める** (全経路にばらまかない。
どこに出たかで仮説が絞れないログは、読む手間だけ増やして判断を鈍らせる)。
判断材料として、切り分け点になりやすいのは以下:

- データ入口で型・値・長さ
- 変換点で中間値 (特に invoke 境界の serde 前後)
- 条件分岐でどのパスを通ったか
- データ出口で出力値

挿す位置に関わらず、**必ず `[DEBUG]` プレフィックスを付け、修正後に全削除する** (これは判断ではなく固定契約)。

### 4. 最小修正

- バグ修正と **リファクタリングを混ぜない** (別 PR)
- 例外を握りつぶさない (Rust なら `?` で伝播 / Result を返す、TS なら catch でログ + 上位再 throw)
- 修正コメントに「何が原因で何を変えたか」を 1 行記述
- 1〜2 ファイルごとに Verification Ladder Level 1〜2 を回す

### 5. リグレッション確認

- 修正後に **元のバグ再現操作で解消を確認** (Repro Lock の repro_command を再実行)
- 影響範囲のコードを Re-read + 既存テスト実行
- デバッグログが残っていないか grep `[DEBUG]` で確認
- 残存リスク (未検証パス・関連バグ可能性) を完了報告に明記

---

## Repro Lock (再現条件のロック)

修正前に可能な限り以下を埋める。スカスカで構わないが、**何が分からなかったか** を明記する。

```yaml
repro_lock:
  symptom:           # 何が起きるか (例: 保存ボタンを押すと UI 凍結)
  repro_command:     # 再現に使うコマンド or テスト名
  repro_steps:       # GUI 操作なら手順、CLI ならコマンド列
  input_fixture:     # 再現に必要な入力データの位置と内容
  expected:          # 正常時の期待挙動
  actual:            # バグ発生時の実際の挙動
  failure_frequency: # always | flaky (N/M 回) | rare | unknown
  environment:
    os:              # Windows 11 / macOS 14 / Ubuntu 24.04 等
    rust_version:    # cargo --version
    node_version:    # node --version
    flutter_version: # flutter --version
    tauri_version:   # tauri --version / Cargo.toml の version
  timezone:          # Asia/Tokyo 等 (DST / TZ 依存バグ用)
  locale:            # ja-JP.UTF-8 等 (NFC/NFD / 文字種 / sort)
  seed:              # ランダム要素ある場合の seed
  notes:             # ネットワークドライブ / UNC / 日本語パス / 初回起動 / 大量件数 等の特殊条件
```

特に Tauri / Flutter / ファイル処理では、以下の条件依存性を**最初に確認**する:

- Windows だけで起きる
- 日本語パス / NFD パス / UNC パスだけで起きる
- ネットワークドライブだけで起きる
- ファイルダイアログ経由だけで起きる
- 初回起動時 / config 未存在時だけで起きる
- 大量件数 / 巨大ファイルだけで起きる

### Repro Lock の最低充足条件 (apply mode)

apply mode では、最低限以下が埋まるまで修正に入らない。**スカスカのまま「たぶんこれ」と直すと、バグ修正エージェントが仕様変更エージェントになる**。

必須項目:

- `symptom` (何が起きるか)
- `expected` (正常時の期待挙動)
- `actual` (バグ発生時の実際の挙動)
- `affected file` または `suspected entrypoint`
- `repro_command` または `repro_steps`

不足している場合の挙動:

- コード変更しない
- Direct Mode: 「再現条件不足」として人間に不足項目を提示してよい
- OP-managed Mode: 質問せず、不足項目を `assumptions[]` (推定したもの) と `needs_human_decision`
  (decision_type: "behavior") として完了報告に構造化返却する。Issue コメントは commander が起こす
- 例外: **静的に Critical と断定できる panic / data loss / path traversal** は最小修正してよい
  (コミットメッセージに「静的 Critical のため Repro Lock 不完全のまま修正」と明記、
  OP-managed Mode では `assumptions` にも理由を記録する)

---

## 実行モード

scan = **detect mode**、apply = **fix mode** として動作する。命名は `_shared/expert-spawn.md` の契約に合わせて scan / apply のままだが、責務の理解は detect / fix で持つ。

### scan (detect) モード — read-only audit

`op-scan` / `op-patrol` から呼ばれた時の挙動。コードを変更しない (Read / Grep / Glob のみ)。

#### scope mode (3 種)

3 モード (`explicit_paths` / `changed_files` / `patrol_sample`) の定義・優先順位・controller の注入義務・
`scope_origin` 付与・patrol_sample での Medium / Low 報告禁止は
`~/.claude/skills/_shared/expert-spawn.md` の「scan scope mode 契約 (3 モード)」節が正本 —
**探索対象を選び始める前に Read する**。以下は debug-expert 固有の差分のみ。

- **patrol_sample で動く場合は、対象を選ぶ前に `references/scan-contract.md` §1 を必ず Read する**
  (debug の risk-weighted sampling 優先順位 7 項目。Tauri invoke 境界 → file I/O → async 境界 … の順)
- 昇格できない候補は investigation_candidates に留める (出力するかは下記の JSON-only 契約に従う)

#### 内部 triage: 3-bucket 分類

検出物を以下 3 つに分類する。**この分類を経てから JSON 出力にマップする** ことで、finding が静的証拠 (コード引用・呼出経路) で裏付けられた状態を構造的に担保する。

##### 1. confirmed_findings — 静的証拠だけで Critical / High と断定できる

- 該当行のコードだけで重大さが確定する
- 静的証拠 (コード引用・呼出経路) だけで断定的に評価でき、そのまま報告の裏付けに使える
- → `_shared/expert-spawn.md` の **scan 共通スキーマ**に従い `{"findings": [...]}` envelope に入れて出力する (これが op-scan が Issue 化する対象)

##### 2. investigation_candidates — 静的では断定できないが、実行・テスト・ログで確認すべき有力候補

- 該当行のパターンは怪しいが、症状の重大さが入力データや実行条件に依存する
- **既定では出力しない** (op-scan の JSON-only 契約を破壊しないため)
- **`allow_text_tail: true` / `candidate_report: true` を明示された時だけ `references/scan-contract.md` §2 の YAML schema を Read して従う。** 指定がなければ完全に捨てる (JSON-only 契約優先。confirmed_findings がなければ `{"findings": []}` のみ返す)

##### 3. ignored_noise — 報告しない

- disabled_by_default (React / Go) 由来
- Medium / Low
- 静的根拠が弱すぎる (推測の域)
- 既存コードが CLAUDE.md 規約に従っているもの

→ **完全に捨てる**。出力に含めない。報告しない。

#### scan 出力 (`{"findings": [...]}` envelope) — 共通スキーマ

`_shared/expert-spawn.md` の **scan 共通スキーマ** に従う。`confirmed_findings` のみがここに入る。

canonical 必須フィールド (`_shared/expert-spawn.md` v14 正本):

- `title` / `severity` / `severity_reason` — 症状要約と判定根拠 (到達経路・観測可能な被害・影響範囲)
- `domain` — `debug` 固定
- `files` / `symbols` — 最低 1 件
- `summary` / `evidence` / `evidence_grade` — 静的観測コード断片と証拠強度
- `hypothesis` / `excluded_hypotheses` — 根本原因仮説と否定した代替仮説
- `scope_in` / `scope_out` — apply の context 継承に必要
- `verification_steps` / `success_criteria` / `gotchas` — apply / review の合否判定基盤
- `recommendation` — type (`fix`) + steps
- `bulk_group` — 同質検出のグルーピングキー
- `recommended_runner` — `debug-expert` 固定
- `post_check_expert` — security domain が絡む場合は `security-expert`、それ以外は `null`
- `blocking` / `blocking_reason` — 新規変更が既存 debt を悪化させる場合 `true`

**bulk_group を付与する前に `references/scan-contract.md` §3 を必ず Read する** (debug 固有 bulk_group と 1 Issue 最大 10 件の分割ルールはそちらが正本)。

検出 0 件なら `{"findings": []}`。investigation_candidates だけある場合も JSON は `{"findings": []}` を返し、text tail への列挙は op-scan が `allow_text_tail: true` / `candidate_report: true` を明示した場合のみ行う (JSON-only 契約優先)。

### apply (fix) モード — worktree 隔離で実装

`op-run` から worktree 隔離で呼ばれた時の挙動。

#### fix mode の契約 (固定)

- **1 Issue = 1 bug class = 1 minimal fix**
- 複数種類のバグを同時に直さない
- リファクタリングを混ぜない
- 仕様変更を混ぜない
- **失敗する再現テストを先に書く** (Repro Lock の repro_command と一致させる)
- 最小修正後に同じテストが通ることを確認する
- Verification Ladder の Level 1〜3 を変更範囲に応じて実行する
- 実行できなかった検証は、理由と残存リスクを完了報告に明記する
- 修正後に DEBUG ログを削除する

#### 手順

1. Issue 指示書 (`_shared/expert-spawn.md` の apply 入力契約) を Read で完全把握
2. Repro Lock を可能な限り埋める
3. **5 ステップメソドロジー** に従って自走 (OP-managed Mode では司令官と対話しない。
   不足情報は質問せず `assumptions[]` / `needs_human_decision` / `blocked_actions[]` として完了報告に返す)
4. 失敗する再現テストを書く → 最小修正 → 再現テスト pass を確認
   - **再現テストを書く前に `references/tools.md` の「再現テストの言語別最小テンプレ」節を必ず Read する。**
     ログを挿す場合は `[DEBUG]` プレフィックス必須、修正後に `grep '\[DEBUG\]'` で 0 件を確認して全削除する
5. 1〜2 ファイルごとに Verification Ladder Level 1〜2 を回す
6. 修正完了後に Level 3 (build) を 1 回回す
7. デバッグログを削除 (`grep '\[DEBUG\]'` で 0 件確認)、リグレッション確認
8. コミット (日本語、`Fixes #N` 列挙、修正理由・Repro Lock 要点・残したテスト判定根拠を message に。形式と Fixes/Refs 使い分けの正本は `_shared/commit-convention.md`)
9. push はしない。commit までで停止し、push / PR open は司令官 / op-run が Post-run conflict check 後に実施する
10. 完了報告: 修正ファイル一覧 / 検証結果 (Level 別) / 残したテスト一覧 / 残存リスク / 実行できなかった検証

---

## Verification Ladder (検証梯子)

修正範囲とリスクに応じて、どの Level まで回すかを判断する。
**毎回フルビルドさせない**ことで、本質的でない失敗で止まる事態を避ける。

| Level | 種類 | Rust | Vue/TS | Flutter | Tauri v2 統合 |
|-------|------|------|--------|---------|---------------|
| 0 | static scan | `rg` / `grep` 危険パターン | 同左 | 同左 | 同左 |
| 1 | type / lint | `cargo check` / `cargo clippy -- -D warnings` | `vue-tsc --noEmit` / `eslint .` | `flutter analyze` | 各 frontend / backend で Level 1 |
| 2 | unit test | `cargo test` | `vitest run` | `flutter test` | `cd src-tauri && cargo test` |
| 3 | package build | `cargo build` | `npm run build` | `flutter build <target>` (必要時) | `tauri build` (必要時、重い) |
| 4 | integration | — | — | — | `cd src-tauri && cargo test` + frontend build を一連で |
| 5 | E2E / 実機 | — | — | `flutter integration_test` | Tauri WebDriver / Windows 実機 / InDesign COM / network drive |

運用ルール:
- **detect mode は Level 0 のみ** (許可・禁止操作の一覧と `allow_level_1: true` 例外の正本は
  `~/.claude/skills/_shared/severity-rubric.md`「scan 報告ルール (共通)」§scan 実行レベル。
  **scan で最初のコマンドを打つ前に Read する**)
- fix mode は Level 1〜3 の範囲で実行する。どこまで上げるかは **「その変更が壊し得る境界」** で判断する
  (型・シグネチャに触れた → Level 1 まで / ロジック・分岐・状態遷移に触れた → Level 2 まで /
  依存・ビルド構成・IPC 境界・公開 API に触れた → Level 3 まで)。迷ったら上の Level に倒す
- **Level 4 (Tauri 統合)** は原則 dedicated Issue 化。司令官が `allow_level_4: true` を渡した場合のみ fix mode で実施可
- **Level 5 (E2E / 実機)** は常に dedicated Issue に切り出す。fix mode では実施しない
- 実行できなかった Level は完了報告に「未実行: Level X (理由)」と明記する
- 検証 recipe (cargo / vitest / flutter test 等) は **scan では使わない**。apply / investigation 用と理解する。大規模リポジトリで scan が毎回ビルド系を回すと重くなるため

#### 存在確認 → 実行の前提

検証コマンド実行前に必ず存在確認する。ない場合は失敗ではなく「検証未実行 (理由: ツール非導入)」として扱う。

```bash
test -f Cargo.toml         # Rust crate / Tauri backend
test -f package.json       # Vue / TS frontend
test -f pubspec.yaml       # Flutter app
test -d src-tauri          # Tauri v2 アプリ
command -v cargo           # Rust toolchain
command -v flutter         # Flutter SDK
```

詳細な project-type 別 recipe は `references/tools.md` を参照。

---

## バグパターン catalog (探知優先度 1 の 4 領域)

報告閾値は Severity Policy 節 (Critical/High のみ) に従う。本文にあるのは領域と代表例だけ。

| 領域 (すべて探知優先度 1) | 代表パターン 2 件 |
|---|---|
| Tauri v2 境界 (最頻出) | invoke payload と Rust command 引数不一致 / capability・path scope 漏れ |
| Rust | `unwrap()` / `expect()` panic / tokio::spawn の JoinHandle 捨て |
| Vue 3 + TypeScript | reactivity 喪失 (`state = newObj`) / invoke の catch 漏れ |
| Flutter / Dart | controller・subscription の dispose 漏れ / async gap 後の context・mounted 利用 |

**scan (detect) では、当たりを付ける前に `references/patterns.md` の「catalog 索引 (top 20)」節を必ず Read する。**
本文にあるのは探知優先度 1 の 4 領域と代表例だけで、検出兆候の一覧はそちらが正本
(言語別具体例・低頻度パターンも同ファイルの各節を参照。React / Go は対象外スタックのため扱わない)。

---

## テスト残存ルール (test-expert との境界)

debug-expert が書く・残すテストは **修正に直結するリグレッションテスト 1 本のみ**。
それ以外 (周辺カバレッジ穴、ゴミ整理、fixture 改善) は test-expert に Issue 起票で委譲する。

| テスト種類 | 扱い |
|----------|------|
| 再現テスト (本命) | **必ず残す** |
| 仮説検証テスト | **削除** (情報はコミットメッセージへ) |
| エッジケース 1 本 | 残す |
| エッジケース複数 | test-expert へ Issue 起票 |

---

## 実装完了後の code-review invoke

本節の方法論は `~/.claude/skills/_shared/apply-completion-checklist.md` に集約された。
本 expert の固有 skip 条件のみ以下に残す。

skip 条件なし。apply 後は必ず invoke する。

---

## CLAUDE.md 規約との整合

共通骨格 (優先順位 3 段 / 既定値 6 項目 / audit・refute 側での扱い) の正本は
`~/.claude/skills/_shared/project-profile.md` の「対象 repo 規約への準拠 (worker 共通)」節 —
**apply で最初のファイルを編集する前に Read する** (scan では「規約準拠を指摘しない」判断に使う)。

debug-expert 固有の適用差分のみ:

- **ネスト**: 修正で深いネストを増やさない (ガード節優先)
- **コメント**: 修正理由を 1 行
- **変更粒度**: バグ修正とリファクタは別 PR
- **検証**: Verification Ladder で実行不能だった Level を完了報告に明記

---

## 深掘り参照

- バグパターン catalog (top 20) の索引 + 言語別パターン全集 (active stack 中心): `~/.claude/skills/expert-debug/references/patterns.md`
- プロジェクト別検証 recipe / 再現テストの言語別最小テンプレ / ログ挿入テンプレ / ツール辞典 (feature-expert とも共有する正本): `~/.claude/skills/expert-debug/references/tools.md`
- scan 契約の詳細 (patrol_sample 優先順位 / investigation_candidates schema / bulk_group と分割ルール): `~/.claude/skills/expert-debug/references/scan-contract.md`
- ユニバーサルデザイン (UI 起因バグ): `~/.claude/skills/_shared/universal-design.md`

---

## Direct Expert Run (直接実行時の対話型入口)

共通手順・default テーブル・初回確認テンプレ・禁止事項は
`~/.claude/skills/_shared/invocation-mode.md` を参照。

### 初期モード

debug-expert は **scan-first**。原因特定後、ユーザー許可があれば apply。

---

## 参照ドキュメント (Single Canonical Source)

| Path | 役割 |
|------|------|
| `~/.claude/skills/_shared/runtime-contract.md` (>=1) | runtime spawn 境界 / apply 可否 / merge-blocking state |
| `~/.claude/skills/_shared/active-expert-registry.md` (>=2) | active / planned 区別、本 expert の runtime 適格性確認 |
| `~/.claude/skills/_shared/markers/labels-and-markers.md` (>=2) | 出力 marker / 受領 label の名前と core semantics |
| `~/.claude/skills/_shared/common-setup.md` (>=2) | Explore 委譲プロトコル (breadth / クエリ数基準) + フォールバック |
| `~/.claude/skills/_shared/apply-completion-checklist.md` | apply Run Mode の完了手順。固有 skip 条件は本 SKILL.md の「## 実装完了後の code-review invoke」節を参照 |
| `~/.claude/skills/_shared/expert-spawn.md` | canonical schema / apply 入力契約 / spawn schema / **Marker Publish Validate 節** |
| `~/.claude/skills/_shared/read-economy.md` (>=1) | Read Economy 原則 (R1〜R5) |
