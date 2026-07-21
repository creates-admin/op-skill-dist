---
name: op-architect
description: 新規プロジェクトの初期構築 + ADR 必要な大規模設計判断を対話で進めるスキル。決定事項を ADR 化し、初期マイルストーンを op-run 互換の指示書 Issue として起票する。「op-architect」「ADR」「初期構築」「アーキ設計」等のキーワードで起動。機能追加 (ADR 不要) は op-plan を使う。
# ADR-0009 L20: 計画フェーズの effort 無保証対策。effort は session 値を override (floor 不可) するため、
# どの session も降格させない max を pin。scope=起動 turn → 初回設計対話 (種別判定〜ADR 論点出し) をカバー。
# 以降の論点対話往復 turn は session 値へ自動復帰。
effort: max
---

# op-architect: 対話駆動の初期設計 + ADR + 初期 Issue 起票

/**
 * 機能概要: 新規プロジェクトまたは既存プロジェクトの新領域について、
 *           ユーザーとの対話から設計判断を抽出し、重要判断を ADR として記録し、
 *           初期実装単位を op-run 互換 Issue に分解する設計入口スキル
 * 作成意図: op-scan / op-run / op-patrol / op-merge は既存資産を前提とするため、
 *           プロジェクト発足直後の「設計フェーズ」が空白だった。
 *           その空白を、自動化ではなく「対話補助 + 記録自動化」で埋める
 * 注意点: 並列化・自動モードは持たない (対話必須)。
 *         ADR は決定の直後に書く (記憶があやふやになる前に)。
 *         ADR は「後から理由を説明する必要がある重要判断」のみ作成し、
 *         軽微な選定は bootstrap-brief.md にまとめる (フェーズ3 / ADR 粒度ルール参照)。
 *         Issue は op-run の指示書節を満たす形式で起票し、bootstrap 後そのまま op-run へ渡せるようにする。
 *         デフォルトはコード非生成。`--scaffold` 指定時のみ feature-expert に雛形生成を委譲する
 */

op-architect は、新規プロジェクトまたは既存プロジェクトの新領域について、ユーザーとの対話から設計判断を抽出し、重要判断を ADR として記録し、初期実装単位を op-run 互換 Issue に分解する設計入口スキルである。

**司令官 (main Claude) はコードを実装しない**。司令官の責務は以下に限定する。

1. ヒアリング (フェーズ1)
2. 論点抽出 (フェーズ2)
3. 重要判断の ADR 化 (フェーズ3)
4. 初期マイルストーン分解 (フェーズ4)
5. UI 影響マイルストーンの Design Plan 作成 + gate (フェーズ4.6) — 該当時のみ
6. op-run 互換 Issue の作成 (フェーズ5)

スケルトン生成・実装・テスト修正は `op-run` / `feature-expert` 側へ委譲する (例外として `--scaffold` 指定時のみ feature-expert に雛形生成を委譲する)。

**UI を含む種別 (Tauri v2 + Vue 3 / Vue 3 SPA / Flutter) の場合、UI 影響を持つマイルストーンに対して
`designer-expert` で Design Plan を作成し、`ux-ui-audit-expert` で gate する。**
これにより op-run 側で designer-expert が迷わず実装できる Issue 本文が生成される (詳細はフェーズ4.6)。

---

## Planned Expert Design Contract

`op-architect` may discuss planned experts as future architecture candidates.

However, planned experts are not runtime-spawnable unless moved to:

- `skills/_shared/active-expert-registry.md`

Planned expert names must be recorded in:

- `skills/_shared/planned-experts.md`

Architecture notes must not imply that a planned expert can be spawned by `op-run`, `op-scan`, `op-patrol`, or any other OP skill before registration.

### 適用上の注意 (op-architect 固有の運用)

op-architect 自身は expert を直接 spawn しないが、ADR / Issue 本文 / marker / label に future architecture を書き込む責務を持つ。
planned expert を architecture note や Issue routing として参照する場合は、上記契約に従い「設計候補」として明示し、
runtime で spawn される前提で書かない。

正本参照 (詳細はそれぞれの canonical doc を見る — op-architect 内に重複保持しない):

- planned expert の一覧と昇格条件: `skills/_shared/planned-experts.md`
- active runtime-spawnable expert の正本: `skills/_shared/active-expert-registry.md`
- runtime spawn / fallback / 再分類規約: `skills/_shared/runtime-contract.md`
- Issue / PR の hidden marker / label 名と意味: `skills/_shared/markers/labels-and-markers.md`
- Issue 本文・PR 本文の template schema: `skills/_shared/pr-templates.md`

`review-expert` / `security-expert` は active expert であり、上記契約の対象外。ただし
op-architect が起票する Issue で `recommended_runner: "review-expert"` /
`post_check_expert: "review-expert"` を指定してはいけない (review-expert は global review 専任で
post-check / apply 候補ではない。詳細は `runtime-contract.md` を参照)。

---

## 実行モード

| モード | 起動 | 想定 |
|-------|------|------|
| 対話 (デフォルト) | `/op-architect` | 通常運用。ヒアリングシート + 未回答項目の深掘り |
| ADR のみ | `/op-architect --adr-only` | Issue 起票はせず ADR 化のみ |
| Issue Markdown 出力 | `/op-architect --issue-md` | gh が使えない環境向け。`docs/issues/initial/NNN-*.md` に Issue 本文を出力するのみ (op issue create を呼ばない) |
| スケルトン同梱 | `/op-architect --scaffold` | 設計対話後にプロジェクト雛形まで feature-expert 経由で生成する (op-run 待ちを省略) |
| op-explore handoff | `/op-architect --from-record docs/playground/<id>.md` | op-explore (ADR-0013) の卒業物 decision record を **ADR Context の bootstrap-brief** として注入する (ADR-0013 決定C / Wave4 給餌) |

組み合わせ可: `/op-architect --adr-only --issue-md` 等。並列化・auto モードは持たない (対話必須)。

### `--from-record` (op-explore 卒業物の給餌、ADR-0013 決定C / Wave4)

`--from-record <path>` で起動された場合、司令官は decision record (`docs/playground/<id>.md`) を Read し、
その内容を **フェーズ1 ヒアリングの bootstrap-brief / フェーズ2 論点出しの ADR Context** として注入する
(`op-plan` の `--from-record` がヒアリングを skip するのと異なり、op-architect は ADR-heavy 案件ゆえ **再ヒアリングは行いつつ
record で seed する** = L318-319 の context 非継承規約に穴を開けず、明示注入経路だけを additive で足す)。

- record の (a) 確定 Design Plan 素材 / (c) Behavior Contract / (d) art-direction 意図 を ADR の Context / Consequences の
  素材として扱い、フェーズ3 ADR 化 + フェーズ4.6 Design Plan gate (`with_design_plan` を **`gate_only`** で呼べる) に橋渡しする。
- record が無い / 不整合なら通常の対話ヒアリングへフォールバックする。
- これは op-explore からの初手 handoff (op-plan 単一給餌) の **follow-up 経路** (ADR-heavy で視覚確認価値が最大の案件をカバー)。

`--issue-md` は gh 未認証 / 権限なし / オフライン環境で有効。出力された Markdown は後から手動で GitHub Issue に貼ることも、別エージェントに起票させることもできる。

---

## 参照ドキュメント

各エントリの `(>=N)` は本 SKILL.md が前提とする最低 schema_version。
フェーズ0 で `_shared/version-check.md` の手順に従い整合性を確認する (mismatch 時は warning + ユーザー確認)。

- `~/.claude/skills/_shared/pr-templates.md` (>=13) — Issue 本文の指示書フル版テンプレ (op-run 互換性確保) + UX/UI Audit Gate machine-readable header (op-ux-ui-gate) + Needs Human Decision テンプレ。ラベル / marker 名の正本は `labels-and-markers.md` を参照
- `~/.claude/skills/_shared/project-profile.md` (>=1) — 検証コマンド (種別判定後の必須検証項目に転記)
- `~/.claude/skills/_shared/expert-spawn.md` — subagent prompt 規約、canonical schema、planned expert spawn 禁止、release-expert 再分類、review-expert global review、security-expert active post-check / apply 契約 (commits_added required (v14) / 調査用 subagent spawn 時に参照)。**Marker Publish Validate 節** (publish 前 2 段 validate 手順の正本) — controller が `op issue create` で hidden marker を埋める前に `op help marker <name>` + `op core marker-lint --body - --source-hint <kind> --strict` を通す契約。`op-post-check-expert: null` を必ず埋める規約は維持する
- `~/.claude/skills/_shared/active-expert-registry.md` (>=2) — active runtime-spawnable expert の正本。op-architect が `recommended_runner` / `post_check_expert` に書ける expert はこの一覧に限定される
- `~/.claude/skills/_shared/planned-experts.md` — planned expert (future architecture candidate) の正本。runtime-spawnable ではないため、ADR / Issue で「将来候補」として参照のみ可
- `~/.claude/skills/_shared/runtime-contract.md` — runtime spawn / fallback / 再分類の契約正本 (planned expert を fallback destination にしない規約を含む)
- `~/.claude/skills/_shared/markers/labels-and-markers.md` — Issue / PR の hidden marker / label 名と意味の正本。本 SKILL.md 内に列挙する marker / label 名は概念ガイドであり、正規定義はこのファイルを見る
- `~/.claude/skills/_shared/invocation-mode.md` (>=1) — Direct Mode / OP-managed Mode の対話可否契約 (designer-expert Architect / ux-ui-audit-expert gate spawn 時に必須)
- `~/.claude/skills/_shared/issue-enrichment.md` (>=2) — Design Plan 生成 + ux-ui-audit gate のロジック正本 (フェーズ4.6 から移管)
- `~/.claude/skills/_shared/clustering.md` (>=5) — expert label 完全形式
- `~/.claude/skills/_shared/version-check.md` (>=2) — schema_version 整合性チェック手順 + Invocation Mode 上の責務分離
- `~/.claude/skills/_shared/model-selection.md` (>=1) — expert spawn 時の model (Opus / Sonnet / Haiku、具体 version は §1) 選択 / task_complexity / 区画 complexity の canonical 正本。op-architect は ADR 起草・初期 Issue 生成・enrichment の Design Plan で Opus を使う

---

## フェーズ0: 環境確認

### 0-pre. _shared 整合性チェック

`_shared/version-check.md` の「起動時チェック手順」に従い、上記「## 参照ドキュメント」節の `(>=N)` と各 `_shared/*.md` 冒頭の `schema_version` を照合する。mismatch 検出時は warning を表示し、ユーザーに続行可否を確認する (`--auto` 系モードがある SKILL.md でも一旦停止する)。pass なら次の bash ブロックへ。

加えて、`_shared/version-check.md` の「installed op binary 鮮度確認」節 (Issue #249) に従い、`op version --json` の `details.git_sha` と `git log --format='%h' -n1 -- op-tools/crates/` の最新 SHA を比較する (比較元 path は binary 挙動に影響する範囲に絞る。docs-only commit の false-drift 回避 = Issue #641)。不一致時は warning + `cargo install --path op-tools/crates/op` を案内 (hard fail なし)。

さらに、`op core schema-check` で _shared prose / Rust types / SKILL.md pin の drift を確認する。
`stats.errors_total >= 1` または `stats.warnings_total` が 5 以上の場合は warning を表示し、ユーザーに続行可否を確認する (`--auto` 系モードでも一旦停止する)。
CI (CLAUDE.md ### 10) と異なり runtime では hard fail しない (CLAUDE.md 不変則2)。

```bash
# schema-check: drift 可視化 (runtime hard fail なし、warning のみ)
if command -v op >/dev/null 2>&1; then
  SCHEMA_RESULT=$(op core schema-check --repo-root . 2>/dev/null) || true
  SCHEMA_ERRORS=$(echo "${SCHEMA_RESULT}" | jq -r '.stats.errors_total // 0' 2>/dev/null || echo "0")
  SCHEMA_WARNINGS=$(echo "${SCHEMA_RESULT}" | jq -r '.stats.warnings_total // 0' 2>/dev/null || echo "0")
  if [ "${SCHEMA_ERRORS}" -ge 1 ] 2>/dev/null; then
    echo "[schema-check] warning: errors_total=${SCHEMA_ERRORS} — drift を修正するか、続行可否を確認してください"
  elif [ "${SCHEMA_WARNINGS}" -ge 5 ] 2>/dev/null; then
    echo "[schema-check] warning: warnings_total=${SCHEMA_WARNINGS} (drift が蓄積しています。修正を検討してください)"
  fi
else
  echo "[schema-check] op binary が見つかりません。cargo install --path op-tools/crates/op を実行してください (hard fail なし)"
fi
```

### 0-cap. Dynamic Workflows capability preflight (ADR-0009 Phase C / C4)

C4 以降、op-architect の **UI 影響マイルストーンの Design Plan 生成 + gate (フェーズ4.6)** は
`workflows/op-enrichment.js` workflow を `Workflow({name:'op-enrichment'})` で呼ぶ。本 skill は
**Dynamic Workflows (Workflow tool) を hard dependency** とする (ADR-0009 決定5、フォールバック無し /
旧 controller 直接 spawn 経路は C4 削除ポリシーで撤去済)。

司令官は冒頭で Workflow tool が利用可能かを確認し、利用不可の場合は以下で分岐する:

- **UI を含む種別 (Tauri v2 + Vue 3 / Vue 3 SPA / Nuxt / Flutter)**: フェーズ4.6 の Design Plan 生成→gate を
  実行できないため **hard-fail** し、「Dynamic Workflows 対応環境で再実行してください」と案内する。
- **UI を含まない種別 (Rust CLI / サーバ単独)**: フェーズ4.6 自体を skip するため (フェーズ4.6 冒頭の種別ガード)、
  本 preflight は warning に留め、ADR 化 + Issue 起票を続行してよい。
- `--adr-only` / `--issue-md` モードは Issue enrichment を伴わないため preflight 対象外。

```bash
# git リポジトリ判定
git rev-parse --is-inside-work-tree 2>/dev/null
# 未初期化なら `git init` を提案 (ユーザー確認必須 — 安全実行ルール参照)

# gh 認証
gh auth status

# 既存 ADR フォルダ検出 (明示的な優先順位 — 後勝ちバグを防止)
if test -d docs/adr; then
  ADR_DIR=docs/adr
elif test -d docs/architecture/decisions; then
  ADR_DIR=docs/architecture/decisions
elif test -d .adr; then
  ADR_DIR=.adr
else
  ADR_DIR=docs/adr   # 新規作成
fi

# 既存 ADR の最大番号取得 (連番継続用)
ls "${ADR_DIR}"/[0-9][0-9][0-9][0-9]-*.md 2>/dev/null \
  | sed 's|.*/||' | cut -c1-4 | sort -n | tail -1

# bootstrap-brief (軽微判断の集約先) の検出
BRIEF_FILE=docs/architecture/bootstrap-brief.md
test -f "$BRIEF_FILE" && echo "既存 bootstrap-brief を継承する"

# ラベル bootstrap プレビュー (op-architect が起票時に使う canonical ラベルの未作成分を確認)。
# op repo init は REQUIRED_LABELS (op-core::labels が正本) を反復作成する bootstrap primitive。
# --dry-run で作成予定だけを表示し、実際の作成はフェーズ5-3-a でユーザー承認後に行う。
# op-architect の NEEDED_LABELS (auto-report / op-architect / pro-feature-expert /
# pro-designer-expert / pro-ux-ui-audit-expert / milestone:initial) は REQUIRED_LABELS に含まれる。
# 動的ラベル (module:<name>) は起票時に op issue create --ensure-labels が補完する。
op repo init --dry-run
```

判定:
- git リポジトリ未初期化 → ユーザーに確認後 `git init` (実行前に明示確認)
- gh 未認証 → 「Issue 起票時に認証が必要です」と通知し、`--adr-only` または `--issue-md` を提案
- 既存 ADR あり → そのフォルダ・採番形式に従う
- 既存 ADR なし → `docs/adr/` を新規作成 (`0001-*.md` から)
- 既存 bootstrap-brief あり → 軽微判断の集約先として継承

---

## フェーズ1: プロジェクト種別判定 + ヒアリング

### 1-1. 種別判定

冒頭で 1 問だけ質問:

```
作るのはどのタイプですか?

  1. Tauri v2 + Vue 3 (デスクトップアプリ)
  2. Vue 3 SPA / Nuxt (Web フロント)
  3. Flutter (モバイル / マルチプラットフォーム)
  4. Rust CLI / サーバ (バックエンド)
  5. その他 (汎用テンプレで進める)
```

> 既存プロジェクトへの新領域追加は `--extend` ではなく `/op-plan` を使用してください。
> 移行ガイドは `skills/op-plan/SKILL.md` 末尾「op-architect --extend からの移行ガイド」節を参照。

### 1-2. ヒアリング (シート方式 + 未回答項目の深掘り)

種別判定後、まず **初期ヒアリングシート** を 1 度だけ提示する。ユーザーが既に埋めている項目はそのまま採用し、未回答 / 曖昧 / 「お任せ」の項目だけを 1 つずつ深掘りする (1 問完全1ターン制ではなく、シート + 追加質問の 2 段構成)。

**初期ヒアリングシート (テンプレ全 8 項目)**:

```markdown
## 初期ヒアリングシート — 埋められる項目を埋めてください

1. **ドメイン / プロダクト名**: 何を作るか、ひとことで
2. **利用者**: 誰が使うか (社内 / 顧客 / 開発者 / 自分用)
3. **コアユースケース**: 一番重要な 1〜3 個のシナリオ
4. **規模感**: 想定ユーザー数 / データ量 / 同時接続数
5. **既存資産**: 流用するライブラリ・既存システムとの連携
6. **チーム / 期限**: 開発体制と粗いマイルストーン
7. **非機能要件 (一般)**: 可用性・性能・運用で外せないもの
8. **データ境界 / セキュリティ**:
   - 扱うデータに個人情報・機密情報はあるか
   - ローカル保存するか、サーバ保存するか
   - 外部 API へ送ってよいデータはあるか
   - 認証・権限・監査ログが必要か
   - 自動アップデートや配布経路の制約はあるか

未記入の項目は op-architect が仮定を置き、必要なものだけ追加質問します。
```

司令官は提示後、ユーザーの回答を収集し、以下のルールで進める:

- 埋まっている項目 → そのまま採用 (確認は省略)
- 「お任せ」「特になし」 → 推奨案で進める前提で記録 (後で ADR Context に明記)
- 曖昧な項目 → 1 ターン 1 質問で深掘りする
- 矛盾している項目 → 必ずその場で確認する

**項目 8 (データ境界 / セキュリティ) は社内ツール / Tauri / AI アプリ等で最重要**。「特になし」と返答されても、扱うデータが個人情報・社外秘・認証情報を含む可能性がある場合は、必ず追加質問で確定させる。

各回答は司令官側で**メモ (work-in-progress)** として保持し、フェーズ2 の論点抽出に使う。

---

## フェーズ2: 論点抽出 (種別ごとの必須意思決定リスト)

ヒアリング結果から、**ユーザーと議論する必要がある論点**を列挙してチェックリストで提示する。種別ごとのテンプレは下記の通り。

### 2-A. Tauri v2 + Vue 3

| # | 論点 | 主な選択肢 |
|---|------|-----------|
| 1 | フロント FW 構成 | Vite 素 / Quasar / Naive UI 等 |
| 2 | 状態管理 | Pinia / 不要 |
| 3 | ルーティング | vue-router (履歴あり) / 単一画面 |
| 4 | Tauri command 設計 | ファイル分割粒度・命名規則 |
| 5 | 永続化 | SQLite (sqlx / rusqlite) / file / OS keychain |
| 6 | 認証 | あり/なし、ローカル / リモート |
| 7 | アップデート | tauri-updater / 手動配布 |
| 8 | ロギング | tracing + log file / println |
| 9 | パッケージング対象 | Windows-only / macOS / Linux |
| 10 | テスト戦略 | Rust unit / Vitest / 手動 QA のみ |

### 2-B. Vue 3 SPA / Nuxt

| # | 論点 | 主な選択肢 |
|---|------|-----------|
| 1 | ベース | Nuxt / Vite + Vue Router |
| 2 | レンダリング | SPA / SSR / SSG / Hybrid |
| 3 | 状態管理 | Pinia / 不要 |
| 4 | API 通信 | ofetch / fetch / axios |
| 5 | 認証 | JWT / Session / Auth0 / Clerk / 自前 |
| 6 | スタイル | Tailwind / UnoCSS / Vuetify / Naive UI |
| 7 | フォーム検証 | VeeValidate / Zod / 自前 |
| 8 | テスト | Vitest / Playwright |
| 9 | デプロイ先 | Vercel / Netlify / 自社サーバ |
| 10 | i18n | あり/なし、@nuxtjs/i18n / vue-i18n |

### 2-C. Flutter

| # | 論点 | 主な選択肢 |
|---|------|-----------|
| 1 | 状態管理 | Riverpod / BLoC / Provider / GetX |
| 2 | ルーティング | go_router / auto_route |
| 3 | 永続化 | Hive / Drift / SharedPreferences / SQLite |
| 4 | HTTP | dio / http |
| 5 | 認証 | Firebase Auth / Auth0 / 自前 / なし |
| 6 | プラットフォーム | iOS / Android / Web / macOS / Windows |
| 7 | デザインシステム | Material 3 / Cupertino / カスタム |
| 8 | i18n | あり/なし、flutter_localizations |
| 9 | テスト | widget / integration / golden |
| 10 | リリース | TestFlight / Play Console / 内製配布 |

### 2-D. Rust CLI / サーバ

| # | 論点 | 主な選択肢 |
|---|------|-----------|
| 1 | エントリ | CLI (clap) / サーバ (axum/actix/poem) / 両方 |
| 2 | 非同期ランタイム | tokio / async-std / 同期のみ |
| 3 | DB | sqlx / diesel / sea-orm / なし |
| 4 | ロギング | tracing / log + env_logger |
| 5 | エラー | anyhow / thiserror / 両方 |
| 6 | 設定 | config / figment / 環境変数のみ |
| 7 | 認証 (サーバ) | JWT / API key / OAuth |
| 8 | テスト | cargo test / criterion / integration |
| 9 | 配布 | crates.io / バイナリ配布 / Docker |
| 10 | 観測 | metrics / OpenTelemetry / なし |

### 2-E. その他 (汎用)

技術選定が定まっていない / 上記4種に当てはまらない場合:

1. 主言語・主 FW
2. 実行環境 (デスクトップ / Web / モバイル / サーバ / CLI)
3. データ層
4. 認証
5. ロギング・観測
6. テスト戦略
7. パッケージング・デプロイ

論点リストはユーザーに見せ、**順番に議論したい順序を確認する**。優先度の高いものから 1 つずつ進める。

---

## フェーズ3: 各論点の対話 → ADR 化 (または bootstrap-brief 追記)

論点ごとに以下のループを回す。**1 論点が決まる → ADR か bootstrap-brief のどちらかに必ず記録する** が原則。

### 3-0. ADR 化判定 (粒度ゲート)

決定が出る前に、**まず以下のゲートを通す**。論点が ADR 化対象でなければ、ADR を起こさず `docs/architecture/bootstrap-brief.md` の対応セクションに 1〜3 行追記して終わる。

**ADR 化する基準 (いずれかに該当)**:

- 後から変更するとコストが高い (rip-and-replace になる)
- データ構造・永続化・認証・配布方式に関わる
- セキュリティ境界に関わる
- 複数 Issue / 複数モジュールに影響する
- 代替案とのトレードオフを後から説明する必要がある

**ADR 化しないもの (bootstrap-brief に記録)**:

- UI ライブラリの軽微な選定 (差し替え容易)
- 命名規則・ディレクトリ命名レベルの判断
- テストランナーなど交換可能な道具選び
- 初期実装の便宜的な仮置き
- 「とりあえずこれで進める」程度の暫定判断

`bootstrap-brief.md` フォーマット (なければ新規作成):

```markdown
# Bootstrap Brief

op-architect の対話で出た「軽微な初期判断」を集約する。
重要判断は `docs/adr/` を参照すること。

## UI / スタイル
- (例) Naive UI を採用。理由: ADR ほどの重みではない、後から差し替え可能。

## テスト
- (例) Vitest を採用。Rust 側は cargo test。

## 命名・ディレクトリ
- ...

## 暫定判断 (要見直し)
- ...
```

**判定例**:

| 論点 | 判定 |
|------|------|
| Tauri command 設計方針 | ADR (モジュール境界・将来コスト大) |
| 永続化方式 (SQLite / file) | ADR (データ構造・rip-and-replace) |
| 認証あり/なし | ADR (セキュリティ境界) |
| 状態管理: Pinia | bootstrap-brief (差し替え容易) |
| UI ライブラリ: Naive UI | bootstrap-brief |
| ルーティング: vue-router | bootstrap-brief |
| HTTP クライアント: ofetch | bootstrap-brief |
| テスト: Vitest | bootstrap-brief |

**目安**: 初期構築で生まれる ADR は **5〜8 本**、bootstrap-brief 行数は **10〜30 行** が健全。ADR が 10 本を超えたら粒度を疑う。

### 3-judge. アーキ案 judge-panel (whole-architecture、ADR-0014 Wave C)

各論点を個別に「選択肢提示 → 単一推奨」する単発推論 (下記 3-1) を、**ADR-worthy 論点をまとめて 1 回の panel で扱う whole-architecture 案 fan-out** に置き換える。各 angle が「全論点を貫く一貫したアーキ・ナラティブ」を 1 案ずつ生成し、evaluator が比較選定する。**案出し=workflow / 確定=司令官+人間 gate** (ADR-0009 L158。op-architect の確定点は 3-1 の論点対話そのもの)。

per-論点 でなく **whole-architecture** にする理由 (user 確定): 各案が全論点を一貫 bias で貫くため案間の比較が coherent になり、かつ各 ADR の `Alternatives Considered` を **他 angle 案の同一論点決定**で自動充填できる (下記 3-2)。

**有効条件 (op-config gated)**: `planning_judge_panel.enabled` (既定 `true`) **かつ ADR-worthy 論点が 2 件以上**。`false` / ADR-worthy 論点 1 件以下 / workflow が `ok:false` (全候補不正) のいずれかなら、**従来の per-論点 単発フロー** (下記 3-1) にフォールバックする (機能停止しない)。

**司令官 prep**:

1. フェーズ3-0 粒度ゲートを **フェーズ2 の全論点にバッチ適用**し、ADR-worthy 集合と bootstrap-brief 集合に分割する。bootstrap-brief 論点は 3-0 のとおり直接 `bootstrap-brief.md` に記録し、panel には渡さない (panel は ADR-worthy 論点のみ)。
2. ADR-worthy 論点を `topics[]` (各 `{ topic, why_adr_worthy, hearing_notes }`)、フェーズ1 種別判定 + ヒアリング結果を `project_context` として組む (論点抽出・粒度判定は interactive ゆえ controller が prep 済にする。workflow agent は user に質問できない。N angle が同一入力を共有 = 公平比較)。
3. op-config から `candidate_count` / `models` を読む (未指定は workflow default)。

**workflow 呼出**:

```javascript
const archJudge = Workflow({
  name: 'op-architect-judge',
  args: {
    project_context,                          // フェーズ1 種別判定 + ヒアリング (N angle 共通入力)
    topics,                                    // ADR-worthy 論点 [{ topic, why_adr_worthy, hearing_notes }]
    candidate_count: PJP_CANDIDATE_COUNT,      // op-config (既定 1)
    // angles 省略可: workflow が simplicity-biased/extensibility-biased/robustness-biased を default
    models: { generate: PJP_GEN_MODEL, evaluate: PJP_EVAL_MODEL },  // model-selection §5.1: generate=Sonnet / evaluate=Opus
  },
})
// = { ok, topics[], recommended:{angle, architecture:{decisions[]}, corrected}, candidates:[{angle, architecture_summary, coherence_note, decisions[], score}], js_ranking, evaluator:{recommended_angle, rationale, ranking, graft_proposals[], synthesis_notes}, dropped }
```

各 candidate の `decisions[]` = 全 ADR-worthy 論点への決定 (`{ topic, decision, rationale, tradeoffs, consequences:{positive[], negative[]}, alternatives_rejected[] }`)。1 decision → 1 ADR の前駆。

**戻り値の扱い (= 3-1 の論点対話に ranked 供給)**:

- `ok:false` → フォールバック (従来 per-論点 単発フロー 3-1)。`dropped` を warning に出す。
- `ok:true` → **3-1 の論点提示の代わりに ranked アーキ案を提示**する:
  1. **推奨アーキ** (`recommended.angle`) の全論点 decision を table で提示 (論点 / 決定 / 理由 / 主な trade-off)。
  2. **代替アーキ** (`candidates` の他 angle) を architecture_summary + coherence_note で 1〜2 行サマリ。
  3. **evaluator rationale** (なぜ推奨案か) と **graft_proposals** (推奨案を全体採用しつつ特定論点だけ別案の決定を採る提案 `{topic, from_angle, why}`) を提示。
  4. ユーザーは **アーキ単位で選定** (推奨をそのまま / 別 angle を全体採用 / 推奨 + 特定論点 graft) する。**これが L158 の確定点** (人間 gate)。主観的判断 (チームの好み・運用上の制約) はここで必ずユーザーに確認する。
- 選定が確定したら、選定アーキ (+graft) の decisions[] を **フェーズ3-2 で一括 ADR ドラフト**する (下記 3-2 の batch 経路)。

### 3-1. 論点提示と tradeoff 議論 (judge-panel 無効時の per-論点 フォールバック)

> **3-judge が `ok:true` を返した場合は本 3-1 をスキップ**し、3-judge の ranked アーキ提示を使う。本 3-1 は judge-panel 無効 / ADR-worthy 論点 1 件以下 / `ok:false` のときの **従来 per-論点 フロー**。

司令官は当該論点について:

1. 主要な選択肢を 2〜4 個に絞って提示 (多すぎると判断が止まる)
2. 各選択肢の **採用理由・トレードオフ・想定リスク** を 1〜2 行で並べる
3. ヒアリング結果から司令官の **推奨案と理由** を述べる (お任せされたときの逃げ道)
4. ユーザーの判断を待つ

判断材料が足りない場合は、調査 subagent を spawn して情報を集める:

```
Agent({
  subagent_type: "general-purpose",
  description: "research: <論点>",
  prompt: """
    共通宣言 (invocation_mode / 必読 checklist / commits_added / 質問禁止 + assumptions fallback): `~/.claude/skills/_shared/spawn-prompt-common.md (>=1)` §1〜§4 を参照。
    本フェーズは research (exploration-only) のため commits_added: [] が正解 (commit は行わない)。

    <論点> について、Tauri v2 + Vue 3 プロジェクトでの 2026 年時点の
    主流選択肢とトレードオフを調査してください。

    出力形式:
    - 選択肢 A: 採用理由 / トレードオフ / 主要採用事例
    - 選択肢 B: 同上
    - 選択肢 C: 同上

    各 200 字以内、リンクは公式ドキュメント・GitHub のみ。
  """
})
```

主観的判断 (チームの好み・運用上の制約) はユーザーに必ず確認する。

### 3-2. ADR ドラフトをその場で書く

決定が出たら **その場で** ADR を書く。後回しにしない。

**3-judge (whole-architecture) が走った場合の batch draft**: 選定アーキの `decisions[]` から **論点ごとに 1 ADR を一括ドラフト**する (1 decision → 1 ADR)。各 ADR の節は judge-panel の構造化出力で充填できる:

| ADR 節 | 充填元 |
|---|---|
| Context | `project_context` + 当該 `topic` の `why_adr_worthy` / `hearing_notes` |
| Decision | 選定 candidate の `decisions[topic].decision`(graft された論点は graft 元 angle の決定) |
| Consequences | `decisions[topic].consequences.{positive, negative}` + `tradeoffs` |
| Alternatives Considered | **(a)** `decisions[topic].alternatives_rejected[]` + **(b) 他 angle 候補が同一論点に下した決定** (`candidates[*].decisions[topic]`) を不採用案として併記。whole-architecture の利点で、3 案ぶんの同一論点比較がそのまま Alternatives 素材になる |

batch でも **ADR は 1 本ずつ `git add` + commit** する (下記ゲートを論点数ぶん回す)。本文の最終確認 (採番 / slug / タイトル) はユーザーに見せてから commit する。

採番:
- 既存 ADR の最大番号 + 1 (ゼロパディング 4 桁)
- ファイル名: `NNNN-<kebab-case-title>.md`

テンプレ (MADR ベース):

```markdown
# ADR-NNNN: <タイトル>

- Status: Accepted
- Date: <YYYY-MM-DD>
- Deciders: <ユーザー名 / チーム名>

## Context

<なぜこの意思決定が必要になったか。背景・制約・前提を 3〜6 行>

## Decision

<決めたこと。1〜3 文で明確に>

## Consequences

### Positive
- <得られる効果>

### Negative / Trade-offs
- <受け入れる制約 / 代償>

## Alternatives Considered

### <案 A> (採用)
- 採用理由: ...

### <案 B>
- 不採用理由: ...

### <案 C>
- 不採用理由: ...

## References

- <参考 URL / 関連 ADR>
```

ADR は Write tool で `<ADR_DIR>/NNNN-*.md` に書き出す。**1 ADR 書くごとに `git add` + commit する** (粒度を細かく)。ただし **既存の staged 変更を絶対に巻き込まない** よう、commit 前にゲートを通す:

```bash
# フェーズ3 の対話で確定した値を必ず設定してからこの fence を実行する。
# :? で未設定・空文字を fail-fast 検出し、空メッセージ commit / 空パス git add を構造的に防ぐ。
# ADR_DIR: Bash tool の各 fence は独立 subshell で実行されるため、フェーズ0 の変数は引き継がれない。
# フェーズ0 と同じ検出ロジックを再掲して subshell 独立性に依存しない構造にする。
if test -d docs/adr; then
  ADR_DIR=docs/adr
elif test -d docs/architecture/decisions; then
  ADR_DIR=docs/architecture/decisions
elif test -d .adr; then
  ADR_DIR=.adr
else
  ADR_DIR=docs/adr   # 新規作成
fi
# ADR_DIR は上記 if/elif/else で必ず設定されるため :? が発火することはないが、
# 将来の編集でブランチが崩れた際の防衛用として残す。
: "${ADR_DIR:?ADR_DIR must be set — フォルダ検出ロジックが欠落しています}"
: "${NNNN:?NNNN must be set (例: 0014) — フェーズ3 の対話で確定した ADR 連番}"
: "${SLUG:?SLUG must be set (例: use-tauri-v2) — フェーズ3 の対話で確定した kebab-case slug}"
: "${TITLE:?TITLE must be set — フェーズ3 の対話で確定した ADR タイトル}"

# 1) 既存 stage チェック (空でなければ停止)
if ! git diff --cached --quiet; then
  echo "❌ 既に staged 変更があります。ADR commit 前に確認が必要です。"
  echo "→ 一度 unstage する (git reset HEAD) か、別途 commit してから再実行してください。"
  git diff --cached --name-only
  exit 1
fi

# 2) 作業ツリー全体の状況をユーザーに見せる (unstaged は共存可だが透明性のため)
git status --short

# 3) ADR ファイルだけを明示的に stage (ワイルドカード展開ではなく `--` でファイル境界を明確化)
ADR_FILE="${ADR_DIR}/${NNNN}-${SLUG}.md"
git add -- "$ADR_FILE"

# 4) 何が staged されたか最終確認
git diff --cached --name-only
# → ADR ファイル 1 本だけが出ること

# 5) commit
git commit -m "docs(adr): ${NNNN} ${TITLE}"
```

`bootstrap-brief.md` を更新した場合は同じゲートで `docs/architecture/bootstrap-brief.md` を stage する。複数ファイルを 1 commit にまとめる場合も、`git add -- file1 file2` のようにファイル境界を明示する。

ユーザーに「ADR-NNNN を起こしました。次の論点に進みますか?」と確認して次へ。

### 3-3. 全論点が片付くまでループ

論点リストの未対応項目をユーザーに見せながら進める。途中で「これは後でいい」と判断された論点は ADR 化せず、フェーズ4 の Issue 化候補として保留。

> **3-judge (whole-architecture) が走った場合**: ADR-worthy 論点は 1 回の panel + 選定 + batch draft で**まとめて片付く**ため、本 3-3 の per-論点 ループは回さない。本 3-3 のループ管理は **bootstrap-brief 論点・保留論点・judge-panel フォールバック (3-1) 経路** にのみ適用する。

---

## フェーズ4: マイルストーン分解

### 4-1. 初期マイルストーンの提案

ADR を踏まえ、**最初に着手すべき作業群** を司令官が下書きする。下書きは feature-expert に依頼 (既存パターン模倣・最小実装の専門家):

```
Agent({
  subagent_type: "feature-expert",
  description: "draft initial milestones",
  prompt: """
    invocation_mode: op_managed

    op-architect から呼ばれた OP-managed Mode 起動です。
    新規プロジェクトの初期マイルストーンを下書きしてください。

    共通宣言 (invocation_mode / 質問禁止 / 必読 checklist / commits_added):
    `~/.claude/skills/_shared/spawn-prompt-common.md (>=1)` §1〜§4 を参照。
    本フェーズは initial milestones 下書き (exploration-only) のため commits_added: [] が正解 (commit は行わない)。

    【プロジェクト種別】
    <Tauri v2 + Vue 3 等>

    【確定済み ADR】
    - ADR-0001: <タイトル> → <要旨>
    - ADR-0002: <タイトル> → <要旨>
    ...

    【ヒアリング要旨】
    - ドメイン: ...
    - コアユースケース: ...
    - 規模感: ...

    【依頼内容】
    最初の 2〜4 週間で着手すべき作業を、5〜12 個のマイルストーン (Issue 候補) に分解してください。
    各マイルストーンは以下の構造で出力:

    {
      "title": "<業務領域>: <成果物>",
      "scope_in": ["<作成・編集するファイルパス候補>"],
      "scope_out": ["<このマイルストーンでは触らない領域>"],
      "success_criteria": "<どうなれば完了か>",
      "verification": ["<必須検証項目>"],
      "depends_on": ["<先に終わっている必要がある title>"],
      "rationale": "<なぜこの粒度・順序か (ADR との対応)>"
    }

    粒度の目安: 1 マイルストーン = 1 PR = 1〜3 日分の作業。
    依存関係はあっても並列実行可能になるよう、なるべく独立させてください。

    最小スケルトン (プロジェクト雛形生成) は 1 番目のマイルストーンとして必ず含めること。
  """
})
```

### 4-1-fallback. feature-expert が利用できない場合

`feature-expert` agent が未配置 / spawn 失敗 / 出力が不完全の場合は、司令官が**直接**以下の基準で分解する:

- 1 マイルストーン = 1 Issue = 1 PR = 1〜3 日分の作業
- 1 番目は必ず**スケルトン Issue** (デフォルトモード時)
- 2 番目以降は **DB / API / UI / 検証 / 配布 / ドキュメント** の領域別に分離
- ADR と対応しない Issue は原則作らない (作る場合は理由を Issue 本文に明記)
- 並列実行のため、`depends_on` 連鎖は最大 2 段まで (3 段以上は粒度分割を再検討)
- 司令官分解の場合も、出力フォーマットは feature-expert 依頼時と同じ JSON 構造に揃える

### 4-2. ユーザー承認

下書きを表形式で提示:

```
## 初期マイルストーン提案

| # | title                              | 依存       | 主要 scope                          |
|---|------------------------------------|-----------|-------------------------------------|
| 1 | スケルトン: Tauri + Vue プロジェクト雛形作成 | -         | 全体構成、Cargo.toml、package.json   |
| 2 | DB: SQLite スキーマと migration 整備 | 1         | src-tauri/migrations/、schema.sql   |
| 3 | UI: ログイン画面                     | 1         | src/pages/login/**                  |
...

承認・修正・追加マイルストーンがあればコメントください。
```

ユーザーが「並べ替え」「削除」「追加」「分割」を指示したら反映。承認後、フェーズ5 へ。

---

## フェーズ4.5: スケルトン雛形生成 (`--scaffold` モード時のみ)

`--scaffold` 指定時は、Issue 起票の前に**プロジェクト雛形 (1 番目のマイルストーン相当)** を司令官が `feature-expert` に委譲して直接生成する。`op-run` の起動・PR レビューサイクルを 1 周省略でき、ゼロイチで「とにかく動く骨格」が必要なケース向け。

### 4.5-1. 雛形生成の判断

司令官は以下のチェックを通過した場合のみ進む:

- フェーズ4 で **1 番目のマイルストーンがスケルトン系**であること (`scope_in` がプロジェクト全体構成・Cargo.toml / package.json / pubspec.yaml 等)
- 関連 ADR が確定済みであること (技術スタック・主要ライブラリ・ディレクトリ方針)
- ユーザーが対話の中で `--scaffold` を改めて承認していること

### 4.5-2. feature-expert への委譲

```
Agent({
  subagent_type: "feature-expert",
  description: "scaffold initial project skeleton",
  prompt: """
    invocation_mode: op_managed

    op-architect から呼ばれた OP-managed Mode 起動です。
    新規プロジェクトの**最小スケルトン**を生成してください。

    共通宣言 (invocation_mode / 質問禁止 / 必読 checklist / commits_added):
    `~/.claude/skills/_shared/spawn-prompt-common.md (>=1)` §1〜§4 を参照。
    本フェーズは scaffold apply のため commits_added: [SHA, ...] (1 件以上) を完了報告に必ず含める。

    【プロジェクト種別】
    <Tauri v2 + Vue 3 等>

    【確定 ADR (要旨)】
    - ADR-0001: <タイトル> → <要旨>
    - ADR-0002: <タイトル> → <要旨>
    ...

    【スケルトンの範囲】
    - プロジェクトルートの構成ファイル (Cargo.toml / package.json / pubspec.yaml / vite.config.ts 等)
    - 最小限のエントリポイント (main.rs / main.dart / src/main.ts / App.vue 等)
    - ディレクトリ骨組み (空または README.md だけのディレクトリ)
    - .gitignore / README.md (1 ページ程度)
    - ロギング・エラーハンドリングの最小設定 (ADR で決まっていれば)

    【含めないもの】
    - 業務ロジック (それは後続マイルストーンで実装)
    - DB スキーマ (別マイルストーン)
    - 認証実装 (別マイルストーン)
    - 詳細 UI (別マイルストーン)

    【検証】
    `_shared/project-profile.md` の Static / Build レベルが pass すること:
    - cargo check / cargo fmt / cargo clippy
    - pnpm install && pnpm typecheck && pnpm build
    - flutter analyze
    で構文エラーが出ない最小状態を作る。

    【手順】
    1. 雛形ファイルを作成
    2. 検証コマンドを実行し、pass を確認
    3. `git add` + commit (メッセージ: `chore(skeleton): プロジェクト雛形を生成 (op-architect)`)
    4. 生成ファイル一覧と検証結果を報告

    【完了条件】
    - 検証コマンドが pass
    - 残マイルストーン (#2 以降) が依拠できる骨格になっていること
    - CLAUDE.md 規約 (ネスト・コメント方針) に準拠
  """
})
```

### 4.5-3. 残マイルストーンの依存関係更新

雛形が commit されたら、フェーズ5 で起票する残 Issue (#2 以降) の `depends_on` から「スケルトン Issue」を外し、`## 関連` 節に**「スケルトンは commit `<sha>` で完了済み」** と注記する。スケルトン Issue 自体はフェーズ5 でも起票せず、ADR 文書とコミットログに記録を残すのみ。

### 4.5-4. 失敗時の扱い

検証コマンドが fail したら司令官は雛形生成を **rollback せず**、生成済み差分を残したまま:

- ユーザーに失敗内容と feature-expert の出力を提示
- 続行 (差分を残したまま手動修正へ) / Issue 化 (op-run へ移譲) のいずれかをユーザーが選択

`--scaffold` を選んだ意図は速度なので、雛形 fail でも自動 rollback で振り出しに戻すのは望ましくない。

### 4.5-5. feature-expert が利用できない場合

`feature-expert` agent が未配置 / spawn 失敗の場合は、`--scaffold` を **自動的に取り下げ** (デフォルトモードに格下げ) てユーザーに通知する。司令官が直接スケルトンを書くことは禁止 (司令官はコードを書かない原則を守る):

```
⚠️ feature-expert が利用できないため、--scaffold を取り下げました。
スケルトンはマイルストーン #1 として Issue 化します (フェーズ5 へ進みます)。
```

ユーザーが「司令官が直接書いてよい」と明示承認した場合のみ、司令官が雛形を書く例外を許可する。

---

## フェーズ4.6: UI 影響マイルストーンの Design Plan 作成 + gate

UI を持つ種別 (Tauri v2 + Vue 3 / Vue 3 SPA / Nuxt / Flutter) のときのみ実行する。
Rust CLI / サーバ単独などの種別ではこのフェーズをスキップしてフェーズ5 に進む。

### 4.6-0. 正本参照 (Single Canonical Source)

本フェーズの **Design Plan 生成ロジック + ux-ui-audit-expert gate 判定の本体** は、Single Canonical Source Rule (CLAUDE.md) に従い `~/.claude/skills/_shared/issue-enrichment.md (>=2)` の §5「Phase 2-3: Design Plan 生成 + gate」を **唯一の正本** として扱う。op-architect 側はここでロジックを再定義せず、enrichment 層を呼び出すための入出力契約と op-architect 固有の前後処理 (フェーズ4.5 = issue draft 作成 / フェーズ5 = ADR 化・Issue 本文埋め込み) のみを保持する。

挙動上の正本対応:

| 旧 4.6 サブフェーズ | 正本側の対応箇所 |
|---|---|
| 4.6-1 UI 影響マイルストーンの抽出 + apply 担当判定 | `_shared/issue-enrichment.md` §5 (UI 影響判定 / apply_expert 分岐) |
| 4.6-2 designer-expert に Design Plan 作成を委譲 | `workflows/op-enrichment.js` design-plan phase (`issue-enrichment.md` §5 が正本、spawn prompt は buildDesignPlanPrompt) |
| 4.6-3 ux-ui-audit-expert で Design Plan を gate | `workflows/op-enrichment.js` design-plan phase (`issue-enrichment.md` §5 gate 6 観点、spawn prompt は buildGatePrompt) |
| 4.6-4 判定に応じた処理 (PASS / PASS_WITH_NOTES / BLOCK) | `_shared/issue-enrichment.md` §5 (gate 判定マトリクス + 3 回 BLOCK escalation) |
| 4.6-5 Design Plan の保存 | `_shared/issue-enrichment.md` §5 (enrichment 出力 → Issue 本文埋め込みは op-architect フェーズ5 側) |

### 4.6-1. op-architect から enrichment workflow への呼び出し契約 (C4)

C4 (ADR-0009 Phase C) 以降、Design Plan 生成 + gate の実行機構は `workflows/op-enrichment.js` workflow である
(`issue-enrichment.md` §5 / §7.6、旧 controller 直接 spawn は削除済)。司令官 (op-architect) は
**UI 影響マイルストーン 1 件ごと** に `Workflow({name:'op-enrichment', args})` を直列で呼ぶ
(per-Issue invocation。フェーズ0-cap preflight で Workflow 利用可を確認済)。

milestone → issue_draft 写像 (controller pre-step):

```
Workflow({ name: 'op-enrichment', args: {
  issue_draft: {
    title:              <milestone.title>,
    body:               <フェーズ4 の success_criteria / scope を指示書フル版に整形>,
    domain:             "ux-ui" | "design" | "feature",   // UI 影響 milestone
    recommended_runner: <designer-expert | feature-expert>,
    scope_files:        <milestone.scope_in>,
    new_files:          <milestone の新規作成 path>,
    severity:           "n/a",                             // op-architect は severity 概念を持たない
    fingerprint:        <空文字列可>
  },
  options: { with_design_plan: true, with_cross_review: false, max_review_loops: 2, strict: false },
  cross_review_experts: [],                                // op-architect は cross-review しない
  task_complexity:      <フェーズ4 で推定 or "design">,
  today:                <YYYY-MM-DD>,
  project_type:         <フェーズ1 判定 (Tauri v2 + Vue 3 等)>
} })
```

- `with_design_plan: true`: op-architect は呼出側で UI 影響 milestone のみを対象に絞り込むため、auto 判定でなく
  常に Design Plan を生成する。
- `with_cross_review: false`: workflow は cross-review phase を skip し Design Plan 生成→gate のみ実行する。
- **ADR-0012 (design 多役)**: controller は `design_depth` / `design_roles[]` / `foundation_exists` も args に注入する
  (heuristic の正本は `issue-enrichment.md` §4 / §7.6、ここで再定義しない)。op-architect は **対話 active caller**:
  foundation 不在の新規 surface では skeleton 直後の milestone に foundation-build を `op:foundation-precondition` で配置し、
  ③④ bespoke animation の milestone は design-spike として human 確認に回す (`needs_human_decision(decision_type:"design")`)。
  workflow 側の Design Plan 生成は単発でなく token-curation→component-selection→layout-composition→(motion-spec) の多役 pipeline。

**戻り値** (§8 Output contract + op-architect 向け additive `issue-enrichment.md` §8):
- `result: enriched` → additive 戻り値 `design_plan` (確定 Design Plan の Markdown) と `apply_expert`
  (`designer-expert` | `feature-expert`) を受領する。
- `result: blocked` (`reason: design_plan_block` = 連続 3 回 BLOCK 等) → op-architect は対話モードのため
  `escalation_report` をユーザーに提示し介入を依頼する (Design Plan を確定できない milestone)。
- `needs_human_decision` (design_assumptions 解消不可) も同様にユーザーへ。

複数 UI 影響 milestone がある場合は milestone ごとに上記 Workflow を **直列** で呼ぶ
(起票自体はフェーズ5 で直列に行うため並列化しない)。

### 4.6-2. op-architect 固有の後続処理

enrichment 層から返却された Design Plan は、op-architect 側で以下のように扱う (本処理は enrichment 層の正本範囲外であり、op-architect 固有のため本 SKILL.md で定義する):

- workflow の additive 戻り値 `design_plan` (確定 Design Plan の Markdown) を司令官のメモに保持する。
- フェーズ5-1 で Issue 本文の `## 🎨 Design Plan` 節として埋め込む (Issue 本文側のテンプレはフェーズ5-4 を参照)。
- workflow の additive 戻り値 `apply_expert` をフェーズ5-2 のラベル付与とフェーズ5-4 の hidden marker `op-run-expert` に転写する。
- `--scaffold` モード時は、確定した Design Plan の Components to Use / Tokens to Use を雛形生成時の design system 選択に反映する (フェーズ4.5 連携)。

---

## フェーズ5: Issue 起票 (op-run 互換)

### 5-1. Issue 本文の構築

各マイルストーンを `_shared/pr-templates.md` の **「Issue 本文 (指示書フル版)」** 形式に落とし込む。新規構築特有の注意点:

| 既存項目 | 新規構築での書き方 |
|---------|-------------------|
| 触ってよいファイル | **新規作成パス** を明示 (まだファイルが存在しないため) |
| 触ってはいけないファイル | 他マイルストーンの scope_in と ADR で別案件と決めた領域 |
| scan が立てた仮説 | 「op-architect が ADR-NNNN に基づき設計した方針」 |
| 除外した仮説 | 「ADR-NNNN の Alternatives で否定された案」 |
| 必須検証項目 | `_shared/project-profile.md` の検証コマンドを種別から転記 |
| 成功条件 | マイルストーンの success_criteria |
| 既知の落とし穴 | プロジェクト初期で踏みやすい罠 (依存初期化漏れ・型生成タイミング 等) |

### 5-2. ラベル設計

| ラベル | 役割 |
|-------|------|
| `auto-report` | op-run が拾う共通ラベル |
| `op-architect` | bootstrap 起点 Issue の識別 |
| `pro-feature-expert` | 担当 expert (新規実装・業務ロジック中心は feature-expert) |
| `pro-designer-expert` | 担当 expert (visual / token / component 中心は designer-expert) |
| `pro-ux-ui-audit-expert` | post-check 担当 (op-run が apply 後に呼ぶ。UI 影響マイルストーンに必ず付与) |
| `milestone:initial` | 初期マイルストーン群の識別 |
| `module:<name>` | clustering.md のモジュール推定で使用 |

ラベル付与ルール (フェーズ4.6-1 の `apply_expert` 判定に従う):

| マイルストーン種別 | 必須ラベル |
|------------------|-----------|
| UI 影響なし (DB / API / CI 等) | `pro-feature-expert` |
| UI 影響あり (apply_expert = `feature-expert`) | `pro-feature-expert` + `pro-ux-ui-audit-expert` |
| UI 影響あり (apply_expert = `designer-expert`) | `pro-designer-expert` + `pro-ux-ui-audit-expert` |

**`pro-feature-expert` と `pro-designer-expert` は同じマイルストーンに同時付与しない**
(op-run の clustering で apply 担当が一意に決まるよう、いずれか一方のみを付ける)。

### 5-3. 事前準備 — ラベル存在確認 / 起票プレビュー / ユーザー承認

#### 5-3-a. ラベル bootstrap (canonical ラベルの一括作成提案)

`op issue create --label` は存在しないラベルを渡すと失敗するため、起票前に canonical ラベルを
bootstrap する。かつての個別ラベル作成コマンドの連打は `op repo init` (REQUIRED_LABELS 一括作成) に集約する:

```bash
# 作成予定ラベルを起票せずプレビュー (op-core::labels の REQUIRED_LABELS が正本。
# op-architect の NEEDED_LABELS (auto-report / op-architect / pro-feature-expert /
# pro-designer-expert / pro-ux-ui-audit-expert / milestone:initial) はすべて REQUIRED_LABELS に含まれる)。
op repo init --dry-run
```

プレビューをユーザーに提示し、**承認後**に bootstrap を実行する
(安全実行ルールに従い、勝手にはラベルを作らない):

```bash
# REQUIRED_LABELS を反復作成する。既存ラベルは内部の冪等処理でスキップされる。
op repo init
```

> **動的ラベル (`module:<name>`)** は repo / 利用文脈ごとに値が変わるため REQUIRED_LABELS に
> 含まれない。これは起票時 (5-4 Pass 1) の `op issue create --ensure-labels` が
> 未作成分を自動作成して補完する。

#### 5-3-b. 起票プレビュー

承認なしに `op issue create` を一括実行しない。先に **作成予定 Issue 一覧** を提示する:

```
## 起票予定 Issue (op-architect)

| 仮# | title                                | labels                       | depends_on (仮) |
|-----|--------------------------------------|------------------------------|-----------------|
| M1  | スケルトン: ...                      | auto-report,milestone:initial| -               |
| M2  | DB: ...                              | auto-report,milestone:initial| M1              |
| M3  | UI: ...                              | auto-report,milestone:initial| M1              |
...

この内容で `op issue create` を実行します。よろしいですか? (yes / 修正)
```

ユーザーが承認したら 5-4 へ。

### 5-4. 起票実行 (依存解決を含む 2-pass)

#### Pass 1: Issue を依存順に作成し、仮# → 実 issue number の対応表を作る

UI 影響有無 (`HAS_UI_IMPACT[$M]`) と apply 担当 (`APPLY_EXPERT[$M]`) の **2 軸** で expert ラベルを分岐する。
HAS_UI_IMPACT だけで決め打ちすると、フェーズ4.6-1 で apply_expert = `feature-expert` と判定された UI 影響あり
マイルストーン (新規画面で業務ロジック中心、Design Plan は付くが apply は feature-expert が担う) に
誤って `pro-designer-expert` が付与され、op-run の expert 解決で designer-expert が呼ばれて
業務ロジックを書けない silent failure を起こす。

逆に UI 影響ありマイルストーンで `pro-ux-ui-audit-expert` が付かないと post-check が走らないので、
**UI 影響ありなら apply 担当に関わらず `pro-ux-ui-audit-expert` を必ず付与**する。

```bash
# Pass 1 実行前に、フェーズ4.1〜4.6 の対話で確定した値を連想配列に格納する。
# :? で未設定を fail-fast 検出し、空タイトル Issue / 空モジュールラベル を gh が HTTP 422 で
# silent fail するのを構造的に防ぐ。
# 例 (ループ前に各マイルストーン分を設定):
#   TITLE[M1]="ユーザー認証機能の実装"
#   MODULE[M1]="auth"
#   HAS_UI_IMPACT[M1]="true"
#   APPLY_EXPERT[M1]="feature-expert"
declare -A ISSUE_MAP   # M1 → 42, M2 → 43, ...
declare -a CREATED FAILED
declare -A TITLE MODULE HAS_UI_IMPACT APPLY_EXPERT   # フェーズ4.1〜4.6 の対話結果を格納
declare -A DEPENDS_ON  # フェーズ4 対話で確定したマイルストーン間依存 (DEPENDS_ON[M2]="M1 M3" のようにスペース区切りで仮 key を列挙)
                       # 依存なし工程は未設定のままでよい (Pass 2 で空チェックして marker 行ごと省略)

# CLAUDE.md bash fence convention: fence をまたぐ変数は一時ファイル経由で渡す。
# Pass 1 → Pass 2 で ISSUE_MAP / DEPENDS_ON を受け渡すための一時ファイルを確保する。
# (export だけでは subshell drift が起きるため declare -p serialize を採用)
export MAP_TMP
MAP_TMP=$(mktemp)  # 一時ファイルは export しておき次 fence の :? guard で受け取る

for M in M1 M2 M3 ...; do
  # マイルストーンごとの値が設定されているか確認 (:? で fail-fast)
  : "${TITLE[$M]:?TITLE[$M] must be set — フェーズ4.1 の対話で確定したマイルストーンタイトル}"
  : "${MODULE[$M]:?MODULE[$M] must be set — フェーズ4.1 の対話で確定したモジュール名}"
  : "${HAS_UI_IMPACT[$M]:?HAS_UI_IMPACT[$M] must be set (true|false) — フェーズ4.6 の UI 影響判定}"
  : "${APPLY_EXPERT[$M]:?APPLY_EXPERT[$M] must be set (designer-expert|feature-expert) — フェーズ4.6 の apply 担当}"

  BODY_FILE="/tmp/op-architect-${M}.md"
  # depends セクションは Pass 1 では `(後で更新)` プレースホルダー
  # body は Write tool で BODY_FILE に書き出してから --body-file で渡す (長文・特殊文字対応)

  # UI 影響有無 + apply 担当の 2 軸で expert ラベルを分岐
  # フェーズ4.6 で UI 影響と判定 → HAS_UI_IMPACT=true、apply 担当 → APPLY_EXPERT (designer-expert | feature-expert) として記録済み
  if [ "${HAS_UI_IMPACT[$M]}" = "true" ]; then
    if [ "${APPLY_EXPERT[$M]}" = "designer-expert" ]; then
      # visual / token / component 中心の改修。designer-expert が apply、ux-ui-audit-expert が post-check
      EXPERT_LABELS=(--label "pro-designer-expert" --label "pro-ux-ui-audit-expert")
    else
      # 新規画面 / API / store / 業務ロジック中心。feature-expert が apply、ux-ui-audit-expert が post-check
      # Design Plan は付くが apply は feature-expert が担う (designer-expert は Architect Mode で完了済み)
      EXPERT_LABELS=(--label "pro-feature-expert" --label "pro-ux-ui-audit-expert")
    fi
  else
    # UI 影響なし (DB / API / CI 等)
    EXPERT_LABELS=(--label "pro-feature-expert")
  fi

  # ラベル配列を CSV に join する (op issue create は --label にカンマ区切りを取る)。
  LABEL_CSV="auto-report,op-architect"
  for EL in "${EXPERT_LABELS[@]}"; do
    [ "$EL" = "--label" ] && continue   # EXPERT_LABELS は (--label X --label Y) 形式なので値だけ拾う
    LABEL_CSV="${LABEL_CSV},${EL}"
  done
  LABEL_CSV="${LABEL_CSV},milestone:initial,module:${MODULE[$M]}"

  # 起票直前 Marker Publish Validate (fail-fast lint)。#529 で op-post-check-expert: null の
  # 誤 block 解消済のため有効化する (marker typo / 必須欠落 / format drift を起票前に検出)。
  # || で握り潰さず decision=pass を明示確認してから op issue create する。
  LINT_JSON=$(op core marker-lint --body - --source-hint issue-body --strict < "$BODY_FILE" 2>/dev/null) || true
  LINT_DECISION=$(printf '%s' "$LINT_JSON" | jq -r '.decision' 2>/dev/null)
  if [ "$LINT_DECISION" != "pass" ]; then
    FAILED+=("$M lint: $(printf '%s' "$LINT_JSON" | jq -c '.blocking_reasons // []' 2>/dev/null)")
    continue   # block された draft は起票しない (hidden marker を修正して再実行)
  fi

  # op issue create --ensure-labels は未作成ラベル (module:<name> 等) を作成してから起票し、
  # JSON envelope { decision: pass, details: { issue_number, url, ... } } を返す。
  # 起票後の番号は envelope の details.issue_number を直接使う (URL 末尾正規表現抽出を廃止)。
  # 直列実行を厳守する (並列化は重複起票事故、CLAUDE.md / memory feedback_gh_issue_create_background)。
  # stdout (JSON envelope) のみを CREATE_JSON に捕捉する。--ensure-labels の label 作成 warning は
  # stderr に出るため 2>&1 で混ぜると jq が JSON を parse できなくなる (正規表現と違い jq は厳格)。
  CREATE_JSON=$(op issue create \
    --title "${TITLE[$M]}" \
    --label "$LABEL_CSV" \
    --body-file "$BODY_FILE" \
    --ensure-labels)
  CREATE_NUM=$(printf '%s' "$CREATE_JSON" | jq -r '.details.issue_number // empty' 2>/dev/null)
  if [ -n "$CREATE_NUM" ]; then
    ISSUE_MAP[$M]="$CREATE_NUM"
    CREATED+=("$M:#${ISSUE_MAP[$M]}")
  else
    FAILED+=("$M: $CREATE_JSON")
  fi
done

# Pass 1 → Pass 2 受け渡し: 両連想配列を一時ファイルに serialize する。
# CLAUDE.md bash convention「fence をまたぐ変数は一時ファイル経由」に従う。
# (declare -p は "declare -A VAR=([ key ]="value" ...)" 形式で export; 次 fence で source して復元)
# 既存 subshell drift バグ (Pass 2 が別 fence で ISSUE_MAP が空になる問題) もここで同時に解消する。
: "${MAP_TMP:?MAP_TMP must be set — Pass 1 開始前の mktemp で生成済み}"
declare -p ISSUE_MAP DEPENDS_ON > "$MAP_TMP"
```

> **expert ラベル分岐表** (HAS_UI_IMPACT × APPLY_EXPERT):
>
> | UI 影響 | apply 担当 | 付与する expert ラベル | hidden marker (本文冒頭) |
> |---------|----------|-----------------------|-------------------------|
> | なし | feature-expert (固定) | `pro-feature-expert` | `op-domain: feature` / `op-run-expert: feature-expert` |
> | あり | designer-expert | `pro-designer-expert` + `pro-ux-ui-audit-expert` | `op-domain: design` / `op-run-expert: designer-expert` / `op-post-check-expert: ux-ui-audit-expert` |
> | あり | feature-expert | `pro-feature-expert` + `pro-ux-ui-audit-expert` | `op-domain: feature` / `op-run-expert: feature-expert` / `op-post-check-expert: ux-ui-audit-expert` (Design Plan は埋め込むが apply は feature-expert) |
>
> UI 影響ありマイルストーンは apply 担当に関わらず Issue 本文にフェーズ4.6 の Design Plan を
> `## 🎨 Design Plan` 節として埋め込んだ状態で起票する (post-check が実装と Plan を突合できる)。
> ラベル (`pro-*-expert`) と hidden marker (`op-run-expert`) は必ず一致させる。op-run は marker を
> 優先して expert 解決するが、ラベル / marker 不一致は人間にもエージェントにも混乱を生むため許容しない。

#### Pass 2: depends_on を実 issue number に解決して body 更新

```bash
# Pass 1 → Pass 2 受け渡し: 一時ファイルから両連想配列を復元する。
# (CLAUDE.md bash convention: fence をまたぐ変数は一時ファイル経由)
# このガードにより、Pass 1 の declare -p serialize が実行されていない場合を早期に検出できる。
: "${MAP_TMP:?MAP_TMP must be set — Pass 1 の mktemp + declare -p serialize が完了しているか確認}"
# shellcheck source=/dev/null
source "$MAP_TMP"

for M in "${!ISSUE_MAP[@]}"; do
  NUM="${ISSUE_MAP[$M]}"
  FINAL_FILE="/tmp/op-architect-${M}-final.md"

  # DEPENDS_ON[$M] を実 issue 番号に解決する。
  # 仮 key (例: "M1 M3") をスペース区切りで読み、ISSUE_MAP を通じて実番号へ変換する。
  DEP_NUMS=""          # marker 用 "#806, #807" 形式 (依存なしなら空のまま)
  DEP_PROSE_LINES=""   # prose 用 "- depends on #806\n- depends on #807" 形式

  if [ -n "${DEPENDS_ON[$M]:-}" ]; then
    # スペース区切りで仮 key を展開し、各 key を ISSUE_MAP で実番号に変換する
    for DEP_KEY in ${DEPENDS_ON[$M]}; do
      DEP_NUM="${ISSUE_MAP[$DEP_KEY]:-}"
      if [ -z "$DEP_NUM" ]; then
        # 依存先が起票失敗していた場合は警告を出しつつ処理を続行する
        FAILED+=("$M depends_on resolve: $DEP_KEY は ISSUE_MAP に存在しない (起票失敗の可能性)")
        continue
      fi
      # カンマ区切りで結合 (marker 用)
      if [ -z "$DEP_NUMS" ]; then
        DEP_NUMS="#${DEP_NUM}"
      else
        DEP_NUMS="${DEP_NUMS}, #${DEP_NUM}"
      fi
      DEP_PROSE_LINES="${DEP_PROSE_LINES}- depends on #${DEP_NUM} (先に完了が必要)\n"
    done
  fi

  # -final.md を Write tool で生成する (prose 指示)。
  # BODY_FILE (/tmp/op-architect-${M}.md) をベースに以下の 2 点を差し替える:
  #   (a) prose "## 依存" セクションのプレースホルダーを実番号に差し替える。
  #       依存が無い M は "## 依存" セクションごと省略する。
  #   (b) hidden marker block の末尾 (op-post-check-expert の直後) に
  #       "<!-- op-depends-on: $DEP_NUMS -->" を追加する。
  #       依存が無い M は marker 行ごと省略する
  #       (空 value は lint error — labels-and-markers.md spec / ADR-0019 D1)。
  # 生成は Write tool で行う (長文・特殊文字が混在するため bash printf/sed より確実)。
  # 実装例 (Write tool の file_path と content を下記で説明):
  #   file_path: /tmp/op-architect-${M}-final.md
  #   content: BODY_FILE 内容 + 上記 (a)(b) 差し替え後のテキスト
  #
  # この箇所は bash fence から Write tool に処理を引き渡す境界点。
  # bash では "Write tool を呼び出して FINAL_FILE を生成する" とだけ記述し、
  # 実際の Write は Claude Code が Tool として実行する。
  #   → この SKILL.md を参照して実行するエージェントは、
  #     ここで Write tool を呼び出して FINAL_FILE を生成してから次の lint に進む。

  # -final.md に対して marker-lint を通す (Pass 1 の lint パターン L1020-1025 を踏襲)。
  LINT_JSON=$(op core marker-lint --body - --source-hint issue-body --strict < "$FINAL_FILE" 2>/dev/null) || true
  LINT_DECISION=$(printf '%s' "$LINT_JSON" | jq -r '.decision' 2>/dev/null)
  if [ "$LINT_DECISION" != "pass" ]; then
    FAILED+=("$M final lint: $(printf '%s' "$LINT_JSON" | jq -c '.blocking_reasons // []' 2>/dev/null)")
    continue   # lint 失敗は edit-body せず次のマイルストーンへ (FAILED に記録済み)
  fi

  # lint pass のときだけ Issue body を更新する。
  # 直列実行厳守 (並列化は重複更新事故の原因、CLAUDE.md bash convention)。
  EDIT_RESULT=$(op issue edit-body --number "$NUM" --body-file "$FINAL_FILE" 2>&1) \
    || FAILED+=("$M edit: $EDIT_RESULT")
done
```

#### Issue 本文テンプレ (BODY_FILE に書き出す内容)

UI 影響マイルストーンは冒頭に hidden marker を埋め込み、フェーズ4.6 で確定した
Design Plan を `## 🎨 Design Plan` 節として `## 🤖 apply agent への指示書` の直後に挟む。
hidden marker は op-run / op-merge が expert 解決と post-check 解決に使う。

#### hidden marker のパターン (apply_expert に応じて分岐)

```markdown
# UI 影響なし (DB / API / CI 等) — 依存なし工程の例
<!-- op-source: op-architect -->
<!-- op-domain: feature -->
<!-- op-architect-expert: feature-expert -->
<!-- op-run-expert: feature-expert -->
<!-- op-post-check-expert: null -->
<!-- 依存なし工程の例: op-depends-on marker は出さない (依存ありの工程のみ Pass 2 で op-post-check-expert 行の直後に追加する。空 value は lint error)。 -->

# UI 影響あり (apply_expert = feature-expert) — 業務機能・データ接続が中心 — 依存あり工程の例
<!-- op-source: op-architect -->
<!-- op-domain: feature -->
<!-- op-architect-expert: designer-expert -->
<!-- op-design-plan-by: designer-expert -->
<!-- op-run-expert: feature-expert -->
<!-- op-post-check-expert: ux-ui-audit-expert -->
<!-- op-depends-on: #806, #807 -->
<!-- ↑ op-depends-on は依存ありの工程のみ Pass 2 で追加する。依存なし工程は行ごと省略 (空 value は lint error)。 -->

# UI 影響あり (apply_expert = designer-expert) — visual / token / component 中心
<!-- op-source: op-architect -->
<!-- op-domain: design -->
<!-- op-architect-expert: designer-expert -->
<!-- op-design-plan-by: designer-expert -->
<!-- op-run-expert: designer-expert -->
<!-- op-post-check-expert: ux-ui-audit-expert -->
```

UI 影響なしマイルストーンでは Design Plan 節を省略し、上記の最小 marker セットのみを埋め込む。
post-check が不要なケースでも `op-post-check-expert` marker は **必須** で、値を `null` にして明示的に出力する (値の省略は op-run dispatcher が「未解決」と「明示 skip」を区別できなくなるため不可)。
UI 影響あり (apply_expert = feature-expert) の場合は `op-architect-expert: designer-expert` を指定する (Design Plan は designer-expert が作るため)。

```markdown
<!-- 以下は UI 影響あり (apply_expert = designer-expert) の例。
     apply_expert / domain は上表に従い、対応する marker セットに置き換える。 -->
<!-- op-source: op-architect -->
<!-- op-domain: design -->
<!-- op-architect-expert: designer-expert -->
<!-- op-design-plan-by: designer-expert -->
<!-- op-run-expert: designer-expert -->
<!-- op-post-check-expert: ux-ui-audit-expert -->

## 概要
<マイルストーンの 1〜2 文要約>

## 検出根拠
- 起点: op-architect 対話による初期設計
- 関連 ADR: ADR-NNNN, ADR-MMMM
- 依存マイルストーン: #<N> (先に完了が必要)

## 観測された挙動 / Evidence
新規構築のため既存挙動なし。下記 ADR の決定に基づき新規実装する。

---

## 🤖 apply agent への指示書

### scan が立てた仮説
op-architect が ADR-NNNN (<タイトル>) に基づき、<方針> で実装すべきと設計した。

### 除外した仮説 (ADR で検討済み)
- <案 B>: ADR-NNNN の Alternatives で <理由> により不採用
- <案 C>: ADR-NNNN の Alternatives で <理由> により不採用

<!-- UI 影響マイルストーンのみ。フェーズ4.6 で確定した Design Plan をそのまま埋め込む。 -->
<!-- op-run の designer-expert はこの節を Issue 本文から読み取って実装する。 -->
## 🎨 Design Plan
<designer-expert (Architect Mode) が出力し、ux-ui-audit-expert (gate) で PASS / PASS_WITH_NOTES 判定を受けた
Design Plan 本文をそのまま貼り付ける。Audit Notes があれば末尾に「### Audit Notes」として追加済み。>

### 触ってよいファイル (新規作成)
- `<path/to/new/file>`
- `<path/to/another/new/file>`

### 触ってはいけないファイル / 領域
- <他マイルストーンが扱う領域>
- <ADR で別案件と決めた領域>

### 必須検証項目
- [ ] <project-profile.md の Static 検証 — fmt / clippy / typecheck>
- [ ] <Unit 検証 — cargo test / vitest / flutter test>
- [ ] <Build 検証 — cargo check / pnpm build>
- [ ] <Integration / Manual — 必要に応じ>

### 成功条件
<マイルストーンの success_criteria を転記>

### 既知の落とし穴 / 注意点
- <初期構築で踏みやすい罠>

---

## 関連 ADR
- ADR-NNNN: <タイトル>
- ADR-MMMM: <タイトル>

## 依存
- depends on #<N> (先に完了が必要)   <!-- Pass 2 で実 issue number を埋める。依存なし工程はこのセクションごと省略する -->

---
🤖 op-architect による自動起票
```

### 5-5. `--issue-md` モード (gh が使えない環境向け)

`--issue-md` 指定時、または gh 認証 / 権限 / ネットワークが原因で `op issue create` が失敗した場合は、起票せずに **Markdown ファイルとして書き出す** モードに切り替える (ユーザー確認後):

```
docs/issues/initial/
├── 001-skeleton-tauri-vue.md
├── 002-db-sqlite-schema.md
├── 003-ui-login.md
└── ...
```

各ファイルは「5-4 の Issue 本文テンプレ」と同じ構造で、先頭に YAML フロントマターでラベルとタイトルを保持:

```markdown
---
title: "スケルトン: Tauri + Vue プロジェクト雛形作成 (initial)"
labels: [auto-report, op-architect, pro-feature-expert, milestone:initial, module:bootstrap]
depends_on: []   # ファイル名で参照 (例: ["001-skeleton-tauri-vue"])
---

## 概要
...
```

利用者は後から手動で GitHub Issue に貼るか、別エージェントに起票させる。`--issue-md` でも 5-3-b の起票プレビューと同等の表をユーザーに提示する。

### 5-6. 部分成功時の集約レポート

Pass 1 / Pass 2 で失敗があった場合、必ず**作成済み / 未作成 / body 更新失敗**を分けて報告する:

```
## op-architect 起票結果

### 作成成功 (3 件)
- M1 → #42 https://github.com/owner/repo/issues/42
- M2 → #43 https://github.com/owner/repo/issues/43
- M3 → #44 https://github.com/owner/repo/issues/44

### 作成失敗 (1 件)
- M4: HTTP 422 (body too long) — トリミングして再実行が必要

### body 更新失敗 (depends_on 解決) (0 件)
- なし

### 推奨アクション
- M4 の body を短縮し、`op issue create --body-file <new> --ensure-labels` で再実行
- 残 Issue の depends_on は Pass 2 で正常に解決済み
```

`op issue create` の失敗で部分成功となった場合、**rollback (作成済み Issue の close) は自動では行わない**。ユーザー判断に委ねる (Issue close は op-merge / 手動の責務)。

依存関係 (`depends_on`) は Issue 番号確定後 (Pass 2) に各 Issue の `## 依存` セクションへ反映する。

### 5-7. 完了レポート (op-architect 全体サマリ)

すべての ADR / Issue 起票が終わったら、最終レポートを 1 度だけ提示する:

```
## op-architect 完了

### 生成 ADR
| 番号 | タイトル                          |
|------|----------------------------------|
| 0001 | <タイトル>                        |
| 0002 | <タイトル>                        |
...

### bootstrap-brief.md
- 軽微判断 N 件を集約 (UI ライブラリ / テストランナー / 命名 etc)

### 起票 Issue (初期マイルストーン)
| #  | title                            | 依存 | 関連 ADR  |
|----|----------------------------------|------|-----------|
| 42 | スケルトン: ...                   | -    | 0001,0002 |
| 43 | DB: ...                          | 42   | 0003      |
...

### --issue-md モードだった場合
- docs/issues/initial/ に N 件の Issue Markdown を出力済み

### 次のステップ
- Issue 群は op-run で拾えます: `/op-run --label milestone:initial`
- **依存順に直列駆動したい場合**: `/op-loop --label milestone:initial` で `op-depends-on` marker から DAG 層を組み、依存順 (層順) に監督付きで完遂まで回せます (op-run はファイル競合のみで直列化するため論理工程順を組めない / ADR-0019)。op-architect からの自動 handoff はありません (疎結合、人間が `/op-loop` を起動する、ADR-0013 流儀)
- まず #42 (スケルトン) を単独で完了させた後、他を並列で進めるのが安全です
- ADR の Status 更新 (Deprecated / Superseded) は今後の判断ごとに随時行ってください
```

---

## 注意事項

本文で繰り返し明示している原則 (司令官はコードを書かない / 対話シート方式 / op-run 互換 Issue / CLAUDE.md 最優先 / 各モード詳細 / 安全実行ルール 等) は省略。以下は ADR 文化の崩壊と方針逸脱に直結する原則のみを残す。

- **ADR は決定の直後に書く**: 後でまとめて書くと記憶があやふやになる。1 論点決定 = 1 ADR (または bootstrap-brief 追記) commit を厳守
- **「お任せ」を記録する**: 推奨案で進めた論点は ADR の Context に「ユーザーは指定なし、推奨案で進めた」旨を必ず明記。後追跡できないと意思決定の正当性が消える
- **既存 ADR の Superseded 管理**: 既存方針を上書きする場合、必ず元 ADR を Superseded に更新するか新 ADR で上書きを明示する。暗黙の方針逸脱は禁止

---

## 安全実行ルール

op-architect は対話駆動スキルであり、自動モードを持たない。以下の操作は**必ずユーザー確認を経てから実行**する:

- `git init` (新規リポジトリ初期化)
- `git commit` (ADR / bootstrap-brief)
- `op issue create` (起票プレビュー → 承認 → 実行の 3 段)
- `op repo init` (canonical ラベルの bootstrap 提案 → 承認 → 実行。`--dry-run` でプレビュー)
- `op issue edit-body` (depends_on 解決の Pass 2、Issue body 全置換。`--number <N> --body-file <path>` シグネチャ)

加えて以下の安全弁を守る:

- ADR commit 前に `git diff --cached --quiet` で既存 staged 変更が無いことを確認、あれば停止
- `git add` は生成した ADR / bootstrap-brief ファイルのみを `--` 区切りで明示指定 (ワイルドカード乱用を避ける)
- `op issue create` 失敗時は **rollback (作成済み Issue の close) を自動で行わない**。ユーザー判断に委ねる
- 部分成功時は「作成済み / 未作成 / body 更新失敗」を分けて報告
- 既存 ADR / CLAUDE.md / package.json 等の**既存ファイルを無断で書き換えない**。書き換える場合は変更 ADR を起こす

---

## ADR 粒度ルール

ADR は「後から理由を説明する必要がある重要判断」のみ作成する。軽微な初期値・交換可能なツール選定・暫定判断は `docs/architecture/bootstrap-brief.md` に記録する。

### ADR 化するもの

- 技術スタックの中核 (言語・主要 FW・ランタイム)
- データ保存方式 (DB 種別・スキーマ戦略・migration 方針)
- 認証・権限・監査ログ
- 配布・自動更新方式
- モジュール境界 / 公開 API 設計
- セキュリティ境界 (どこまで信頼境界、どこから検証必須)
- 大きな将来コストを伴う判断 (rip-and-replace になるもの)

### ADR 化しないもの (bootstrap-brief.md へ)

- 仮の UI 部品選定 (差し替え容易)
- 些細な命名規則・ディレクトリ命名
- 後で簡単に差し替え可能なライブラリ (HTTP クライアント・テストランナー等)
- 一時的な実装順序・暫定判断
- 「お任せ」で推奨案を採用しただけの軽微な選定

### 健全性の目安

- 初期構築の ADR 本数: **5〜8 本** (10 本超えたら粒度を疑う)
- bootstrap-brief 行数: **10〜30 行**
- ADR が 1 本も無い: 重要判断が漏れている可能性

迷ったら司令官は判定理由を 1 行添えてユーザーに確認する。「これは ADR にしますか? bootstrap-brief で十分でしょうか?」
