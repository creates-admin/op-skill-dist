<!--
schema_version: 3
last_breaking_change: 2026-05-29
notes: v3 追記 (2026-07-29) — 「基本 check」に mcp channel 分岐 (ADR-0024) を追従反映、
       「各 SKILL.md での現状」表の行番号 citation を節名参照へ全置換 (corrective、version 据置)。
       v3 (2026-05-29) — 新節「フェーズ0 git/gh env check 標準手順」を追加。
       6 OP skill (op-scan / op-patrol / op-run / op-merge / op-architect / op-plan) に
       散在していたフェーズ0 env precheck (git rev-parse + gh auth status) を
       canonical source として本ドキュメントに集約。各 skill の挙動差分表を明示。
       op-patrol の `gh auth なし時 --dry-run 続行可` は意図的差分として明示維持。
       既存節 (0-0 / 0-X / Explore 委譲 / Invocation Mode Overrides 等) は無変更。
       Refs #372 (Stage 1 safe_first_step)。
       v2 (2026-05-04) — Invocation Mode Overrides 節を追加。Direct Mode (skill 直接実行) と
       OP-managed Mode (subagent spawn) で「ユーザー確認」「ツールインストール許可」の責務を分離。
       OP-managed Mode の subagent は質問せず、needs_human_decision / blocked / verification_not_run
       として返す。詳細は `_shared/invocation-mode.md` 参照。
       v1 初版: schema_version 導入時点でのスナップショット (0-0 / 0-X の現行手順)。
-->

# 共通セットアップ手順

全スキルで共通のフェーズ0手順。

---

## 0-0. プロジェクトコンテキスト把握

プロジェクトの CLAUDE.md を Read で確認し、以下を把握する:

- コーディング規約（ネスト制限、コメントポリシー等）
- ディレクトリ構造の規約
- 禁止パターン（アンチパターン一覧）
- ビルド・テストコマンド
- 開発ワークフロー

**CLAUDE.md の規約は本スキルの改善提案よりも優先される。**
規約に反する改善は提案しない。

---

## 0-X. 言語・フレームワーク検出

Glob ツールで対象ディレクトリのファイル拡張子を集計し、使用言語を特定する:

- `**/*.py` → Python（FastAPI / Django / Flask 等）
- `**/*.ts`, `**/*.tsx`, `**/*.vue` → TypeScript / Vue / Nuxt
- `**/*.rs` → Rust（Tauri / Actix / Axum 等）
- `**/*.dart` → Flutter / Dart
- `**/*.js`, `**/*.jsx` → JavaScript / React / Next

除外パターン: `node_modules/`, `.venv/`, `target/`, `__pycache__/`, `dist/`, `build/`, `.dart_tool/`

フレームワーク設定ファイル（`package.json`, `Cargo.toml`, `pubspec.yaml`, `pyproject.toml`）を Read で確認し、具体的なフレームワークを特定する。

---

## 0-X. git 確認 + 変更前の安全策

```bash
git rev-parse --is-inside-work-tree 2>/dev/null && echo "GIT_AVAILABLE" || echo "NO_GIT"
```

git リポジトリが存在する場合:

1. 未コミットの変更がないか `git status` で確認する
2. 未コミットの変更がある場合、ユーザーに安全策を確認する:
   - **新ブランチ作成**（推奨）: `git checkout -b <スキル名>/<対象の短い説明>`
   - **スタッシュ**: `git stash push -m "スキル実行前の退避"`
   - **不要**: そのまま進行
3. git がある場合、フェーズ1でホットスポット分析（変更頻度×複雑度）を実行する

---

## 0-X. スコープモード選択

対象の規模に応じて実行モードを選択する:

| 対象ファイル数 | モード | 動作 |
|-------------|--------|------|
| 1-10 | Quick | 直接分析。Context Window 内で完結 |
| 11-50 | Standard | 標準フロー。上位候補に絞って分析 |
| 50超 | Thorough | Task(Explore) サブエージェントに分析を委譲し、要約のみメインに戻す |

Thorough モード時は、サブエージェントに以下を委譲する:
- ファイルサイズ一覧の収集
- メトリクスツール実行結果の収集
- 検出パターンの Grep スキャン

サブエージェントの結果要約のみメインコンテキストに取り込む。

---

## Explore 委譲プロトコル

スコープモード選択 (上節) でファイル数を見るのに加えて、**何件の探索クエリが必要か** で Explore subagent への委譲を判断する。Claude Code ビルトインの Explore は read-only / 並列可能で、commander / expert の context window を浪費せずに「ファイル発見 / 位置特定」を担う。

### 委譲基準

| クエリ数 | breadth | 推奨手段 | 理由 |
|---------|---------|---------|------|
| 1-2 件 | (Explore 不要) | Bash grep / Read 直叩き | subagent orchestration overhead が割に合わない |
| 3-5 件 | quick / medium | Explore 1 体で複数 query bundle | context 隔離効果がコストを上回る |
| 6 件以上 | very thorough | Explore 並列 spawn (独立観点ごと) | 並列化で速度・命名揺れ吸収を確保 |

委譲時は素材集めだけを subagent に切り出し、**判断 (severity / patch 提案 / detection rule) は commander または委譲先 expert が main context で行う**。Explore は判断ロジックを担わない。

### Direct Mode と OP-managed Mode の挙動

- **Direct Mode**: expert は対話的に「Explore に委譲しますか?」を提案してよい
- **OP-managed Mode**: controller の spawn prompt に `explore_budget: <int>` 指定がある場合、expert はその範囲内で Explore を呼ぶ。指定がなければ Explore を呼ばず直 grep で進める。質問では返さない (invocation-mode.md 既存契約)

### フォールバック (ビルトイン Explore の model 未確定リスク)

ビルトイン Explore subagent の運用 model (Haiku 系か Sonnet 以上か) は公式に確認できていない。実観測で「Sonnet 以上で動いており orchestration overhead がコストに見合わない」「ファイル発見用途で取りこぼしが許容不能」等が判明した場合、**直 Bash grep + Read による代替手順** に切り替える退路を残す:

- `quick` 基準 (1-2 クエリ) はそのまま Explore を経由しない
- `medium` / `very thorough` も commander が `OP_EXPLORE_DISABLED=1` で明示無効化できる
- 無効化時は対応する expert SKILL.md の「自前 grep パターン」節 (Phase 3 で各 expert に追加予定) を参照

これらの選択肢は ADR-0001 §例外条件で「再検討トリガー」として明記されている。

---

## 段階的検証の原則

各ファイルの変更後、以下の即時検証を実行する:

1. ビルドコマンドが存在する場合: 変更1-2ファイルごとにビルド確認
2. ビルドコマンドがない場合: Grep で import/参照の整合性を確認
3. エラー発生時: 直前の変更を取り消し、原因を特定してから再実行

**「まとめて変更 → 最後に検証」は禁止。** 変更の粒度を小さく保ち、問題を早期に検出する。

---

## 既存パターン調査の義務

改善を実装する前に、プロジェクト内の既存実装を Grep/Glob で検索する:

- toast/通知: 既存の通知コンポーネントがあればそれを使う
- loading 表示: 既存のローディングパターンがあればそれに合わせる
- エラーハンドリング: 既存のエラー処理パターンを確認する
- ユーティリティ: 既存の utils/helpers にあれば新規作成しない

**プロジェクト内に前例がある改善は、新しいパターンを導入せず既存パターンに従う。**

---

## ツール利用の共通原則

各スキルのリファレンスに記載された外部ツール（lint, profiler, scanner 等）は **任意** である。
以下のプロトコルに従い、ユーザーの環境を壊さず安全にツールを活用する。

### 1. 利用可能性の確認（フェーズ0で実行）

スキル固有のツールリファレンスがある場合、フェーズ0で利用可能なツールを確認する:

```bash
# 例: 各ツールの存在確認（エラーは無視）
command -v <ツール名> 2>/dev/null && echo "<ツール名>: available" || echo "<ツール名>: not found"
```

### 2. ツール不在時の Grep/Read フォールバック

ツールがインストールされていない場合、Grep/Read による静的分析で代替する。
各スキルのツールリファレンスに Grep フォールバックパターンが記載されている。
**ツールがなくてもスキルの実行は可能。ツール不在を理由に中断しない。**

### 3. インストール時のユーザー確認（必須）

ツールが未インストールで、かつインストールすれば分析精度が大幅に向上する場合:

1. ツール名・用途・インストールコマンドを提示する
2. **ユーザーの許可を得てからインストールする**（勝手にインストールしない）
3. ユーザーが拒否した場合、Grep/Read フォールバックで続行する

### 4. ツール結果の解釈

- ツールの出力を鵜呑みにしない。偽陽性・偽陰性をスキルの知見で判断する
- ツールは候補を挙げるだけ。最終的な判断はスキルが根拠を示して行う

---

## 共通注意事項

- CLAUDE.md のコーディング規約を遵守する
- 既存の動作を壊さないよう、各変更後に検証を行う
- ツールが未インストールでも静的分析（Grep/Read）は実行可能。ツールが必要な場合はユーザーに確認してからインストールする
- Context Window を有限資源として扱い、不要なファイル読み込みを避ける

---

## Invocation Mode Overrides

本ドキュメントの「ユーザーに安全策を確認」「ユーザーに許可を得てからインストールする」は、
呼び出し文脈によって挙動を切り替える。詳細は `_shared/invocation-mode.md` を参照。

### Direct Mode (skill 直接実行 / 人間が手動で起動)

本ドキュメントの「ユーザー確認」はそのまま有効:

- 未コミット変更がある場合、ユーザーに安全策 (新ブランチ / stash / そのまま) を確認してよい
- ツール未導入時、インストール許可をユーザーに確認してよい
- ユーザーが拒否した場合、Grep/Read フォールバックで続行する

### OP-managed Mode (op-scan / op-patrol / op-run / op-merge / op-architect が spawn する subagent)

subagent はユーザー確認を行わない。停止せず構造化返却する:

- 未コミット変更や危険な git 状態を検出したら、`blocked` または `needs_human_decision` として
  完了報告に返す。安全策の選択肢 (新ブランチ / stash / そのまま) を `options[]` に列挙する
- ツールが未導入なら **勝手にインストールしない**。Grep/Read fallback で続行する
- fallback も不能な場合は `verification_not_run` または `blocked` として理由を返す
- 「ユーザーに確認してください」と質問テキストで返さない

OP-managed Mode の subagent が `needs_human_decision` を返した場合、commander / OP skill が
必要に応じてユーザー prompt / Issue コメント / label に変換する責務を持つ。

---

## フェーズ0 git/gh env check 標準手順

<!--
機能概要: 6 OP skill (op-scan / op-patrol / op-run / op-merge / op-architect / op-plan) に
         散在していた git/gh env check を canonical source として集約する節。
作成意図: Single Canonical Source Rule (CLAUDE.md §1) 違反の silent fork 状態を解消し、
         各 skill の意図的な挙動差分を明示することで保守性を向上させる。
         各 SKILL.md は Stage 2-6 (別 wave Issue) でこの節への pointer に置換される予定。
注意点: op-patrol の `gh auth なし時 --dry-run 続行可` は意図的な設計差分であり変更しない。
        op-architect の ADR フォルダ検出は固有 check であり本節の対象外 (各 SKILL に残す)。
        本節は doc 追加のみ。各 SKILL.md の bash fence は Stage 1 では変更しない。
        Refs #372 (architecture_debt, Stage 1 safe_first_step)。
-->

### 基本 check (全 OP skill 共通)

全 OP skill は起動フェーズ0 で以下の 2 つを確認する。

```bash
# git リポジトリ確認 (channel 非依存)
git rev-parse --is-inside-work-tree || { echo "not a git repo"; exit 1; }

# gh 認証確認 (mcp channel = call-spec 経路では gh 不要 — _shared/github-channel.md / ADR-0024)
if [ "${OP_GITHUB_CHANNEL:-gh}" = "mcp" ]; then
  echo "[channel] mcp — GitHub write は call-spec 経路 (gh 認証不要)"
else
  gh auth status || { echo "gh login が必要"; exit 1; }
fi
```

**git リポジトリ判定が失敗した場合**: 全 OP skill は中断する。
`exit 1` で停止し、ユーザーに git リポジトリ内で実行するよう案内する。

**channel 分岐 (ADR-0024)**: gh auth check は **gh channel (`OP_GITHUB_CHANNEL` 未設定含む) のみ**
実行する。mcp channel では GitHub write が call-spec 経路 (`_shared/github-channel.md` が正本) で
成立するため、gh auth を必須にしない (`gh auth login` 案内もスキップする)。
この分岐は op-scan / op-patrol / op-run / op-merge / op-plan の現行フェーズ0 fence で実装済みの
確立形であり、本テンプレはそれに追従する。

### gh auth なし時の OP skill 別挙動差分表

各 OP skill は **gh channel での** gh auth 未認証時に以下の挙動を取る
(mcp channel では gh auth check 自体を skip するため本表は適用外)。
この差分は **意図的に設計されたもの** であり、統一しない。

| OP skill | gh auth なし時の挙動 | 備考 |
|----------|---------------------|------|
| **op-scan** | `exit 1` (中断)。`! gh auth login` を案内 | Issue 起票に gh 必須 |
| **op-patrol** | 通常実行は `exit 1`。**`--dry-run` 時は続行可能 (暫定 plan モード)** | Ledger オフライン巡回の意図的差分。詳細は下記 |
| **op-run** | `exit 1` (中断) | worktree / PR 作成に gh 必須 |
| **op-merge** | `exit 1` (中断) | PR マージに gh 必須 |
| **op-architect** | 中断せず通知。「Issue 起票時に認証が必要」と案内し `--adr-only` / `--issue-md` を提案 | ADR 化のみなら gh 不要 (ADR フォルダ検出は別途)。実挙動は同 SKILL.md フェーズ0 の「判定:」節が正 |
| **op-plan** | 中断せず案内メッセージ表示 (`2>/dev/null` 付きで静かに失敗検出)。`--dry-run` で起票なしの計画立てのみ続行を提案 | 実挙動は同 SKILL.md「0-2. git / gh / 対象リポジトリ確認」の「判定:」節が正 |

### op-patrol の `--dry-run 続行可` について (意図的差分)

op-patrol は **定期巡回ルーチン** として設計されており、GitHub Patrol Ledger Issue が
一時的にアクセス不可な状況でも巡回 audit 自体を継続できる設計を持つ。

`--dry-run` + `gh auth なし` の場合:

- Patrol Ledger の読み込みをスキップし、area_state を空として扱う
- フェーズ2 以降の **構造劣化検出 (Read/Grep/Glob のみ)** は通常通り実行する
- 最終報告を「暫定 plan モード: Ledger 未参照のため巡回履歴は反映されていない」として出力
- Ledger への書き込みはしない

この挙動は op-scan / op-run / op-merge と異なるが、**巡回ルーチンの可用性設計として意図的**。
変更する場合は `needs_human_decision` 経由で人間判断を仰ぐこと (Issue #372 参照)。

### 各 SKILL.md での現状 (Stage 1 時点)

現時点 (Stage 1) では各 SKILL.md は独自の bash fence を保持している。
Stage 2-6 (各 SKILL.md の全面書き換え wave) で本節への pointer に置換予定。
参照は **節名ベース** (行番号は SKILL.md の頻繁な改版で必ず drift するため使わない)。

| SKILL.md | 該当節 (実在見出し) | 現状の実装形式 | Stage 2-6 で変更予定 |
|----------|--------------------|--------------|---------------------|
| `op-scan/SKILL.md` | 「フェーズ0: 環境確認」>「0-1. git / gh 確認」 | git/gh check + channel 分岐実装済み | 本節への pointer |
| `op-patrol/SKILL.md` | 「フェーズ0: 環境確認 + Patrol Ledger ロード」>「0-1. git / CLAUDE.md / gh」および「gh auth なしの場合」 | git/gh check + channel 分岐実装済み + `--dry-run 続行可` 節 | 本節への pointer (差分明示部分は残す) |
| `op-run/SKILL.md` | 「フェーズ0: 環境確認」>「0-1. git / gh」 | git/gh check + channel 分岐実装済み | 本節への pointer |
| `op-merge/SKILL.md` | 「フェーズ0: 環境確認」>「0-1. git / gh precheck (channel 分岐)」 | git/gh check + channel 分岐実装済み (fence 冒頭に #372 完了後削除予定の注記あり) | 本節への pointer |
| `op-architect/SKILL.md` | 「フェーズ0: 環境確認」>「0-cap. Dynamic Workflows capability preflight」内の bash fence | `git rev-parse ... 2>/dev/null` + `gh auth status` (無条件・channel 分岐なし) + ADR フォルダ検出 | git/gh 部分のみ本節への pointer (ADR 検出は残す)。pointer 化時に channel 分岐も本節準拠にする |
| `op-plan/SKILL.md` | 「フェーズ0: 環境確認」>「0-2. git / gh / 対象リポジトリ確認」 | git/gh check + channel 分岐実装済み + 案内メッセージ | 本節への pointer |

> **Stage 進行の現状 (2026-07-29 時点)**: Stage 2-6 の pointer 置換は **未着手**。一方で各 SKILL.md の
> fence は本節集約 (v3, 2026-05-29) 後も独自進化しており、mcp channel 分岐 (ADR-0024/0028) は
> SKILL.md 側が先行実装した (本節の「基本 check」テンプレは 2026-07-29 に追従修正済)。
> pointer 置換を行う際は、各 SKILL.md の現行 fence と本節テンプレの差分を必ず突き合わせること。

> **注意**: 「env precondition (git / gh auth) は cwd ローカル前提のため CLI 化対象外」
> (`op-scan/references/from-merged-pr-mode.md`「Phase 0: 環境確認 + PR 状態確認」節の明示コメント)。
> 本節の集約は markdown 集約であり、op-tools CLI 化の対象ではない。このコメントの趣旨は変わらない。
