# プロジェクトプロファイル: 検証コマンド & スタック前提

op-* スキル群のスタック前提と、apply / review agent が「何を実行すれば検証完了か」を判断する基準の正本。
対象 repo の CLAUDE.md の検証コマンド・規約が本ファイルと矛盾する場合は CLAUDE.md を優先する
(CLAUDE.md → 本ファイルのスタック別コマンド → どちらも無ければ「検証コマンド未定義」と PR 本文に明記)。

## Primary Stack (想定する主戦場)

Rust (Tauri v2 backend / Cargo workspace / CLI)、Vue 3 + TypeScript (Tauri v2 frontend / Web UI)、Flutter / Dart、
Tauri v2 (IPC / command / capability)。

## Out of scope (想定しないスタック)

React / Next.js / Remix、Go、Python backend (FastAPI / Django / Flask)、Ruby / PHP / Java は想定しない。
これらのパターンを推測の起点にせず、コードに明示的に存在する場合のみ扱う。
`package.json` / `Cargo.toml` / `pubspec.yaml` を確認し、実在するスタックのみを検証対象にする。

## 検証コマンド (スタック別)

プロジェクトに該当ファイルが存在する場合のみ実行する。

### Rust (Cargo.toml が存在する場合)

```bash
cargo fmt --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
```

単一 crate なら `--workspace` を外す。`cargo fmt --check` は clippy とは独立に必ず実行する。

### Flutter / Dart (pubspec.yaml が存在する場合)

```bash
dart format --set-exit-if-changed .
flutter analyze
flutter test
```

Dart-only (Flutter なし) は `dart analyze` / `dart test`。

### Vue / TypeScript (package.json が存在する場合)

```bash
pnpm lint        # or npm run lint / yarn lint
pnpm typecheck   # or tsc --noEmit
pnpm test        # or vitest / jest
pnpm build       # 重い場合は省略可
```

`package.json` の `scripts` に定義されたコマンドのみ実行する。パッケージマネージャは lockfile で判定する。

### Tauri v2 (src-tauri/ が存在する場合)

```bash
cargo check --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
```

`pnpm tauri build` は optional (CI / 手動検証に委ねる)。

### テスト寄せ defaults

test / debug / feature-expert がテスト追加・修正時に採用する既定。

| スタック | 既定テスト | coverage | 備考 |
|---|---|---|---|
| Rust | `cargo test --workspace` (`cargo nextest run` があれば優先) | `cargo llvm-cov` → 無ければ `cargo tarpaulin` | `src-tauri/` も Rust として扱う |
| Vue / TS | `pnpm vitest run` (apply 中は `--bail`) | `pnpm vitest run --coverage` | snapshot の無批判更新禁止 |
| Flutter / Dart | `flutter test` (Dart-only は `dart test`) | `flutter test --coverage` | golden は目視確認してから更新。無批判 `--update-goldens` 禁止 |

Tauri の IPC command (`#[tauri::command]`) 境界: 入力検証 = security / 戻り値・エラー伝搬 = debug / command 単位のテスト = test-expert。

### 環境依存・手動検証が必要な領域

以下は自動検証できないため PR 本文の「未検証理由」に明記する:
Windows COM 連携 (InDesign / Office)、時間超過する Tauri full build、ネイティブ依存 (sqlite3 拡張・image codec 等)、
iOS / Android 実機ビルド、mock 不可な外部 API 実通信。

## Verification Ladder

apply 系 expert 共通の検証段階。コマンドは「検証コマンド (スタック別)」、Tauri 統合列は下表。

| Level | 種類 | Tauri v2 統合での例 |
|---|---|---|
| 0 | static scan (`rg` 危険パターン / `git diff` 確認) | 同左 |
| 1 | type / lint (`cargo check` / `cargo clippy -- -D warnings` / `vue-tsc --noEmit` / `eslint .` / `flutter analyze`) | frontend / backend 各 Level 1 |
| 2 | unit test (`cargo test` / `vitest run` / `flutter test`) | `cd src-tauri && cargo test` |
| 3 | package build (`cargo build` / `npm run build` / `flutter build <target>` 必要時) | backend + frontend の dev build |
| 4 | integration | `tauri build` / `tauri dev` (capability の完全チェックを含む) |
| 5 | E2E / 実機 (`flutter test integration_test/`) | Tauri WebDriver / Windows 実機 / InDesign COM / network drive |

- scan / patrol / detect は Level 0 のみ (`severity-rubric.md`「scan 実行レベル」)。
- apply は Level 1〜3。壊し得る境界で決める: 型・シグネチャ → 1 / ロジック・分岐・状態遷移 → 2 / 依存・ビルド構成・IPC 境界・公開 API → 3。迷ったら上に倒す。
- Level 4 は controller が明示指示した場合のみ。Level 5 は apply で実施せず、apply とは別の runtime verify 段で行う
  (op-run の CO フェーズ5.7 / op-codev の verify フェーズ。手順は `op-run/references/runtime-verify-dispatcher.md`)。
  apply の完了報告には「未実行: Level 5 (runtime verify 段で実施)」と書く。
- Level 5 の検証環境は対象 repo のハーネスが用意する (契約は `verify-harness.md`)。
- コマンドは存在確認してから実行する。未導入のツールは失敗ではなく「未実行: Level X (理由)」と完了報告に書く。
- expert 固有の段 (optimize の benchmark 等) と Level の選び方の差分は各 expert skill に置く。

## 検証レベルの分類

apply / review agent は PR 本文の「検証レベル」セクションに以下を記載する。

| レベル | 内容 | 例 |
|-------|------|-----|
| Static | フォーマット・型・lint | `cargo fmt`, `tsc --noEmit`, `flutter analyze` |
| Unit | 単体テスト | `cargo test`, `vitest`, `flutter test` |
| Build | 本番相当ビルド | `cargo build --release`, `pnpm build` |
| Integration | 結合テスト | DB / 外部 API 込みテスト |
| Manual | 手動検証 | UI 動作確認、Tauri full build、COM 連携 |

各レベルに `pass` / `fail` (PR は draft のまま) / `skipped` (理由を併記) を記録する。PR 本文の書式は `pr-templates.md`。
Ladder との対応: Static = Level 1、Unit = Level 2、Build = Level 3、Integration = Level 4、Manual = Level 5 相当。


## UI 影響判定 path パターン (op-architect / op-run 共通)

op-architect (UI 影響マイルストーン抽出) / op-run (post-check 起動判定) はこの節を参照する。

### UI 影響あり (いずれかにマッチ)

- Vue 3 / TS / Web frontend: `frontend/src/**/*.vue`、`frontend/src/{pages,views,components,features,layouts}/**`、
  `apps/*/src/**/*.vue`、`apps/*/src/{pages,views,components,features,layouts}/**`、
  `packages/*/src/**/*.vue` (UI コンポーネントを公開する shared package のみ)
- Nuxt: `pages/**/*.vue`、`layouts/**/*.vue`、`components/**/*.vue`
- Flutter / Dart: `lib/**/*.dart` (`pubspec.yaml` がルートまたはサブパッケージに存在する場合のみ。無ければ `lib/**` は UI 影響なし)

### UI 影響なし (除外パス、上記より優先)

- `src-tauri/**`、`backend/**` / `server/**` / `api/**`、`crates/**`、`**/*.rs`
- `migrations/**` / `db/**` / `schema/**` / `**/*.sql`
- `docs/**` / `**/*.md`、`.github/**` / `.gitlab/**` / CI config
- `tests/**` / `**/__tests__/**` / `**/*.test.ts` / `**/*.spec.ts`

### 単語単独マッチの禁止

`src` / `lib` / `app` の単独マッチで UI 影響ありと判定しない。判定は上記の完全な path glob で行う。

### title / rationale / marker での補完

path 判定が不確実な場合 (新規ファイル / リネーム途中) は、以下を OR 条件で UI 影響ありに加える:

- title に `画面 / UI / ログイン / 一覧 / フォーム / ダイアログ / ボタン / モーダル / ナビ / ヘッダー / フッター / カード` 等を含む
- rationale / 概要が `ユーザー体験 / 操作性 / 画面導線 / a11y / 視認性` に言及
- fingerprint の domain (第 1 segment) が `ux-ui` / `design`、または `<!-- op-post-check-expert: ux-ui-audit-expert -->` がある
- ラベル `pro-designer-expert` または `pro-ux-ui-audit-expert` が付与されている

## 対象 repo 規約への準拠 (worker 共通)

worker 共通の「対象 repo の CLAUDE.md 規約に従う」骨格の正本。`agents/*.md` / `skills/expert-*/SKILL.md` は
本節への pointer + expert 固有差分のみを持つ。

### 優先順位

1. 対象 repo の CLAUDE.md が最優先。
2. CLAUDE.md に該当規約が無い場合のみ下記の既定値を適用する。
3. どちらにも無い場合は既存コードの支配的パターンに合わせる (新様式を持ち込まない)。

### 既定値 (CLAUDE.md が沈黙している場合)

| 規約 | 既定値 |
|---|---|
| ネスト深さ | 2 階層以内。ガード節 (早期 return) / 関数抽出 / dispatch table で平坦化する。構文別の数値は CLAUDE.md が定める場合のみ従う |
| コメント | 「コメント作法」節に従う。書く場合は日本語 |
| 抽象化 | 過剰抽象化禁止。抽象化は重複を観測してから行う。1 関数 1 ファイル / interface と implementation の形式的分離 / 要求のない Clean Architecture・DDD 導入は行わない |
| 変更粒度 | 最小限。目的外の変更 (バグ修正にリファクタを混ぜる等) を同じ PR に入れない |
| 検証 | 検証なしの実装は出荷しない。実行できなかった検証 Level は PR / 完了報告に明記する (「検証レベルの分類」節) |
| 優先思想 | 形式的美しさよりデバッグ容易性を優先する |

### コメント作法

コメントは既定で書かない。読み手がコードと git から復元できない理由だけを 1〜2 行で書く。

書く: 自明でない制約・前提 (外部仕様、OS / ランタイムの癖)、回避策とその解除条件、安全性・並行性の注意、公開 API の契約 (doc comment)、Issue 参照付きの TODO。

書かない (NG):

| NG | 代わりに |
|---|---|
| コードの動作の言い直し (`// ユーザーを取得する`) | 名前で表す |
| 「機能概要 / 作成意図 / 注意点」等の定型ヘッダ | 書かない。意図は commit message / PR 本文へ |
| 修正理由・変更履歴・「〜に変更」「Issue #N 対応」 | commit message へ |
| コメントアウトしたコード | 削除する (git に残る) |
| 区切り線・見出しだけのコメント (`// ===== utils =====`) | ファイル / 関数分割で表す |
| 引数・戻り値を型の通りに並べる doc | 型で足りるなら書かない |
| テストの `// Arrange / Act / Assert`、テスト名の言い直し | テスト名で表す |
| Issue 参照の無い TODO / FIXME | Issue 化するか消す |

- 触ったファイルで NG コメントを見つけても、目的外の削除はしない (変更粒度)。自分が追加・変更した行には NG を入れない。
- 対象 repo の CLAUDE.md がコメント様式を定めていればそれに従う (「優先順位」)。
- review / post-check は diff が追加した NG コメントを nit として指摘する (起票はしない)。

### audit / refute 側での扱い

- CLAUDE.md 規約に準拠しているコードを「問題」として起票しない (refute では refuted 方向の材料。`refute-contract.md` §4)。
- CLAUDE.md が定義する「禁止パターン」への違反は High 以上として扱う (`severity-rubric.md`「scan 報告ルール (共通)」節)。
- CLAUDE.md の規約そのものを批判しない。
