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
-->

## このドキュメントの位置づけ

debug-expert agent (`~/.claude/agents/debug-expert.md`) が `skills: [expert-debug]` で本ファイルを自動プリロードする。
agent はここに書かれた **5 ステップの調査メソドロジー**、**3-bucket triage**、**Severity Policy**、**Verification Ladder**、**バグパターン catalog** に従って自走する。
言語別深掘りは `references/patterns.md`、プロジェクト別検証 recipe は `references/tools.md` (feature-expert とも共有する project-type 別 recipe 辞書の正本、2026-07-23 集約) を必要時に Read する (React / Go は対象外スタックとして通常検出しない)。

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

報告対象は **Critical / High のみ**。判定基準を以下に固定し、エージェントの主観で揺らがないようにする。

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

テストで届かない領域 (UI 連携・状態依存・タイミング系・OS 差分) のみ:

- データ入口で型・値・長さ
- 変換点で中間値 (特に invoke 境界の serde 前後)
- 条件分岐でどのパスを通ったか
- データ出口で出力値
- 必ず `[DEBUG]` プレフィックス → **修正後に全削除**

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

入力に応じて以下の scope mode で動作する。

1. **explicit_paths** — 司令官が指定したファイル・ディレクトリのみ。最優先
2. **changed_files** — git diff / PR diff / staged files を起点。変更ファイルと直接の呼び出し境界だけ追う
3. **patrol_sample** — 警備員的見回り (op-patrol からの呼び出し含む)。指定箇所も変更箇所もない場合に使う。完全ランダムではなく **risk-weighted sampling** とする

patrol_sample の優先順位:
1. Tauri invoke 境界
2. file I/O / path / fs 操作
3. async spawn / await 境界
4. error handling / catch / Result 変換
5. 最近変更された high-churn file
6. capability / permission / config 周辺
7. Flutter lifecycle / dispose 周辺

patrol_sample 由来の finding には `scope_origin: "patrol_sample"` を付ける。Medium / Low は報告しない。昇格できないものは investigation_candidates に留める (出力するかは下記の JSON-only 契約に従う)。

#### 内部 triage: 3-bucket 分類

検出物を以下 3 つに分類する。**この分類を経てから JSON 出力にマップする** ことで、finding が静的証拠 (コード引用・呼出経路) で裏付けられた状態を構造的に担保する。

##### 1. confirmed_findings — 静的証拠だけで Critical / High と断定できる

- 該当行のコードだけで重大さが確定する
- 静的証拠 (コード引用・呼出経路) だけで断定的に評価でき、そのまま報告の裏付けに使える
- → `_shared/expert-spawn.md` の **scan 共通スキーマ JSON 配列** にそのまま出力する (これが op-scan が Issue 化する対象)

##### 2. investigation_candidates — 静的では断定できないが、実行・テスト・ログで確認すべき有力候補

- 該当行のパターンは怪しいが、症状の重大さが入力データや実行条件に依存する
- **既定では出力しない** (op-scan の JSON-only 契約を破壊しないため)
- op-scan / op-patrol が `allow_text_tail: true` または `candidate_report: true` を明示した場合のみ、JSON 配列の **後段ではなく** 指定された別セクションに以下のフォーマットで列挙する。
  指定がない場合は完全に捨てる (confirmed_findings がなければ `[]` のみ返す):

```yaml
investigation_candidates:
  - id: candidate-001
    confidence: high | medium  # high のみ報告、low は捨てる
    stack: Rust | Tauri | Vue | TypeScript | Flutter
    category:                  # bug-async-leak 等
    file: path/to/file.ext
    lines: "L42-L58"
    evidence: |                # 該当コード抜粋
      <該当コード 5-10 行>
    suspected_failure_scenario: |  # 想定される失敗シナリオ
      <どういう入力・条件で何が起きるか>
    required_repro:                # 昇格に必要な再現条件
      - <データ条件>
      - <環境条件>
    suggested_probe:               # 確認方法 (テスト or ログ or bisect)
      - <test を 1 本書いて XXX を確認>
    promote_to_confirmed_when: |   # この条件を満たせば confirmed に昇格できる
      <条件を 1〜2 文>
```

##### 3. ignored_noise — 報告しない

- disabled_by_default (React / Go) 由来
- Medium / Low
- 静的根拠が弱すぎる (推測の域)
- 既存コードが CLAUDE.md 規約に従っているもの

→ **完全に捨てる**。出力に含めない。報告しない。

#### scan 出力 (JSON 配列) — 共通スキーマ

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

debug-expert 固有の bulk_group:

| bulk_group | 対象 |
|-----------|------|
| `bug-empty-catch` | 例外握りつぶし (`Result` 無視 / `catch (e) {}`) が散在 |
| `bug-missing-await` | async/await 漏れ・JoinHandle 捨て・spawn 後 await なし |
| `bug-null-unguarded` | null/undefined / Option 無防備アクセスの集中 |
| `bug-tauri-invoke-mismatch` | invoke payload と Rust command struct の不一致 |
| `bug-flutter-dispose-leak` | controller / subscription の dispose 漏れ集中 |
| `bug-rust-fs-error-swallow` | std::fs / tokio::fs のエラー無視 |

5 件以上の同 bulk_group は op-scan がバッチ Issue 化。
ただし **1 Issue あたり最大 10 件**まで。10 件を超える場合はディレクトリ単位または stack 単位で分割する (apply エージェントの一撃巨大修正を防ぐ)。

検出 0 件なら `[]`。investigation_candidates だけある場合も JSON は `[]` を返し、text tail への列挙は op-scan が `allow_text_tail: true` / `candidate_report: true` を明示した場合のみ行う (JSON-only 契約優先)。

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
5. 1〜2 ファイルごとに Verification Ladder Level 1〜2 を回す
6. 修正完了後に Level 3 (build) を 1 回回す
7. デバッグログを削除 (`grep '\[DEBUG\]'` で 0 件確認)、リグレッション確認
8. コミット (日本語、`Fixes #N` 列挙、修正理由・Repro Lock 要点・残したテスト判定根拠を message に)
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
- **detect mode は Level 0 のみ**。Read / Grep / Glob に限定し、ビルド・テスト・型チェックは実行しない
- 例外的に Level 1 を許可する場合は、op-scan 入力に `allow_level_1: true` がある場合のみ
- fix mode は変更範囲に応じて Level 1〜3 を実行
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

## バグパターン catalog (top 20 — active stack 集中版)

scan モード (detect) ではこの表で当たりを付け、apply モード (fix) でも修正方針の参考にする。
**Critical/High のみ報告対象**。Medium/Low は ignored_noise に分類。

### Tauri v2 境界 (最頻出 / 探知優先度 1)

| # | パターン | 検出兆候 |
|---|---------|---------|
| 1 | invoke payload と Rust command 引数不一致 | TS 側の `invoke('cmd', { foo })` と Rust の `#[tauri::command] fn cmd(bar: ...)` で名前/型が乖離 |
| 2 | command 戻り値の Result serialize 失敗 | `Result<T, E>` の `E` が Serialize 未実装 / 詳細不明エラーが UI に届く |
| 3 | capability / permission 漏れ | dev では動くが build 後だけ失敗 (`capabilities/*.json` 未記載) |
| 4 | path scope 漏れ | dialog の戻りを使った fs アクセスが本番だけ deny される |
| 5 | WebView 側 invoke エラー握りつぶし | `invoke().catch(...)` 不在で UI が無反応 |

### Rust (探知優先度 1)

| # | パターン | 検出兆候 |
|---|---------|---------|
| 6 | `unwrap()` / `expect()` panic | None / Err でプロセス終了 (Tauri 経由で UI クラッシュ) |
| 7 | tokio::spawn の JoinHandle 捨て | spawn 後に handle 無視で処理結果 / panic が消える |
| 8 | std::fs と async runtime 混在 | async 関数内で `std::fs::*` 直呼び → ランタイム block |
| 9 | Result / `?` 経路の panic 混入 | エラー伝播パスに `unwrap` / `panic!` が紛れる |
| 10 | path canonicalize 漏れ | allowed root 外への書き込みを許す TOCTOU / traversal |

### Vue 3 + TypeScript (探知優先度 1)

| # | パターン | 検出兆候 |
|---|---------|---------|
| 11 | reactivity 喪失 | `state = newObj` で reactive 参照切れ / `.value` 付け忘れ |
| 12 | invoke の catch 漏れ | `await invoke(...)` を try/catch なしで呼び、ユーザーに silent 失敗 |
| 13 | loading / error / success state 競合 | 画面遷移後に古い async result を反映 / 二重 setState 風挙動 |
| 14 | Pinia store と component local state の二重管理 | 同じデータを両方に持ち、片方だけ更新 |
| 15 | Promise の非待機 / forEach 内 await 効かない | 並列実行の意図のない for await を `forEach` で書く |

### Flutter / Dart (探知優先度 1)

| # | パターン | 検出兆候 |
|---|---------|---------|
| 16 | controller / subscription の dispose 漏れ | TextEditingController / FocusNode / AnimationController / StreamSubscription の close 漏れ |
| 17 | async gap 後の context / mounted 利用 | `await` 後の `BuildContext` 使用、`if (mounted)` ガード不在 |
| 18 | FutureBuilder の future 再生成 | build 内で `Future.then(...)` を直接渡し毎フレーム再実行 |
| 19 | initState で async 直扱い | `initState` で `await` できず未待機の future が走る |
| 20 | platform channel / file picker の error 未処理 | desktop / mobile の path 差・permission 例外を catch していない |

各パターンの言語別具体例・追加パターン (低頻度) は `references/patterns.md` を参照 (React / Go は対象外スタックのため扱わない)。

---

## 言語別最小テンプレ

### Rust (cargo test)

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn handles_empty_input() {
        assert_eq!(parse(""), Err(ParseError::Empty));
    }

    #[tokio::test]
    async fn async_resolves() {
        assert_eq!(fetch_user(1).await.unwrap().id, 1);
    }
}
```

### Vue / TypeScript (vitest)

```ts
import { describe, test, expect } from 'vitest';

test('handleSubmit rejects empty input', () => {
  const result = handleSubmit({ name: '' });
  expect(result).toEqual({ ok: false, error: 'name required' });
});

// Tauri invoke 境界の mock
import { mockIPC } from '@tauri-apps/api/mocks';
mockIPC((cmd, args) => {
  if (cmd === 'save_doc') return { ok: true };
});
```

### Flutter / Dart (flutter test)

```dart
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('parser rejects empty', () {
    expect(() => parse(''), throwsArgumentError);
  });

  testWidgets('disposes controllers', (tester) async {
    await tester.pumpWidget(const MyForm());
    await tester.pumpWidget(const SizedBox());  // dispose 強制
    // controller が dispose されたか副作用で確認
  });
}
```

#### ログ挿入テンプレ (修正後必ず削除)

| 言語 | テンプレ |
|------|---------|
| Rust | `eprintln!("[DEBUG] func: input={:?}", input);` |
| TS/Vue | `console.log('[DEBUG] funcName:', { input, type: typeof input });` |
| Dart | `debugPrint('[DEBUG] func: input=$input type=${input.runtimeType}');` |

詳細・他言語は `references/tools.md` を参照。

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

- **ネスト 2 階層以内**: 修正で深いネストを増やさない、ガード節優先
- **日本語コメント**: 修正理由を 1 行コメント
- **最小限の修正**: バグ修正とリファクタは別 PR
- **検証なしの実装は出荷しない**: Verification Ladder で実行不能だった Level は明記

---

## 深掘り参照

- 言語別パターン全集 (active stack 中心): `~/.claude/skills/expert-debug/references/patterns.md`
- プロジェクト別検証 recipe / ツール辞典 (feature-expert とも共有する正本): `~/.claude/skills/expert-debug/references/tools.md`
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
