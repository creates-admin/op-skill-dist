<!--
schema_version: 1
last_breaking_change: 2026-05-03
notes: 初版。schema_version 導入時点でのスナップショット (Primary Stack / Out of scope / 検証コマンドの現行仕様)。
-->

# プロジェクトプロファイル: 検証コマンド & スタック前提

/**
 * 機能概要: op-* スキル群が想定する主戦場スタック (Rust / Flutter / Vue / Tauri v2) の
 *           検証コマンド・前提知識を集約する。apply / review agent の検証レベル判定の起点。
 * 作成意図: スタック別の検証コマンドを Skill 内に分散させると整合が取れなくなるため一元化。
 *           Go / Python / Next.js 等の不要スタックを「想定外」と明記し、agent の探索方向を狭める。
 * 注意点: プロジェクトに合わない場合は CLAUDE.md の検証コマンドを優先する。
 */

op-* スキル群は以下のスタック前提で動作する。
本ドキュメントは apply / review agent が「何を実行すれば検証完了か」を判断する基準を提供する。

---

## Primary Stack (想定する主戦場)

| 言語 / FW | 主要ターゲット |
|----------|---------------|
| Rust | Tauri v2 backend / Cargo workspace / CLI |
| Flutter / Dart | モバイル / デスクトップ UI |
| Vue 3 / TypeScript | Tauri v2 frontend / Web UI |
| Tauri v2 | Rust + Vue の橋渡し、IPC / command / capability |

## Out of scope (想定しないスタック)

以下のスタックは **基本的に想定しない**。コードに明示的に存在する場合のみ扱う:

- React / Next.js
- Go
- Python backend (FastAPI / Django / Flask)
- Ruby / PHP / Java

agent はこれらを「主戦場」と推測してはいけない。
`package.json` / `Cargo.toml` / `pubspec.yaml` を確認し、**実在するスタックのみ**を検証対象にする。

---

## 検証コマンド (スタック別)

apply / review agent は変更内容に応じて以下のコマンドを実行する。
**プロジェクトのルートに該当ファイルが存在する場合のみ実行する**。

### Rust (Cargo.toml が存在する場合)

```bash
cargo fmt --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
```

ワークスペース不在 (単一 crate) なら `--workspace` を外す。

### Flutter / Dart (pubspec.yaml が存在する場合)

```bash
dart format --set-exit-if-changed .
flutter analyze
flutter test
```

Dart-only プロジェクト (Flutter なし) は `dart analyze` / `dart test` を使う。

### Vue / TypeScript (package.json が存在する場合)

```bash
pnpm lint        # or npm run lint / yarn lint
pnpm typecheck   # or pnpm run typecheck / tsc --noEmit
pnpm test        # or vitest / jest
pnpm build       # 重い場合は省略可
```

`package.json` の `scripts` を Read で確認し、定義されているコマンドのみ実行する。
`pnpm-lock.yaml` / `yarn.lock` / `package-lock.json` でパッケージマネージャを判定。

### Tauri v2 (src-tauri/ が存在する場合)

```bash
cargo check --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings
```

`pnpm tauri build` は時間がかかるため通常は **optional**。
`cargo check` までを必須とし、build は CI / 手動検証に委ねる。

### テスト寄せ defaults (主戦場スタックのテスト運用)

test-expert / debug-expert / feature-expert がテスト追加・修正時に採用する既定。
プロジェクト固有のコマンドが CLAUDE.md に書かれていれば、そちらを優先する。

#### Rust

- 既定テスト: `cargo test --workspace`
- 高速化推奨: `cargo nextest run` が利用可能なら優先 (失敗特定が早い)
- coverage: `cargo llvm-cov` を優先、なければ `cargo tarpaulin`
- `src-tauri/` 配下も Rust 側として扱う (workspace 不在なら `--manifest-path` を使う)

#### Vue / TypeScript (Vitest)

- 既定テスト: `pnpm vitest run`
- coverage: `pnpm vitest run --coverage`
- fail-fast (apply 中の検証): `pnpm vitest run --bail`
- snapshot は意味が薄い場合が多いため、無批判更新は禁止 (assertion で振る舞いを縛ること)

#### Flutter / Dart

- 既定テスト: `flutter test`
- coverage: `flutter test --coverage` (`coverage/lcov.info` を確認)
- golden test は snapshot と同等に扱う。差分が出たら **目視で確認してから更新**、無批判 `--update-goldens` 禁止
- Dart-only は `dart test` / `dart test --coverage`

#### Tauri v2

- backend: `src-tauri/` の Rust テスト (上記 Rust 既定に準拠)
- frontend: Vue / Flutter 側のテスト (上記 Vitest / Flutter 既定に準拠)
- IPC command (`#[tauri::command]`) の境界は **security / debug / test-expert の三者の境界領域**:
  - 入力検証は security (任意 path / 任意 IO 等)
  - command の戻り値 / エラー伝搬は debug
  - command 単位の happy path / error path テスト整備は test-expert

### 環境依存・手動検証が必要な領域

以下は agent が自動検証できないため、PR 本文の「未検証理由」に明記する:

- Windows COM 連携 (InDesign / Office)
- Tauri full build (`pnpm tauri build`) — 時間超過する場合
- ネイティブ依存 (sqlite3 拡張、image codec 等)
- iOS / Android の実機ビルド
- 外部 API への実通信 (mock 不可な統合テスト)

---

## 検証レベルの分類

apply / review agent は PR 本文の「検証レベル」セクションに以下を必ず記載する:

| レベル | 内容 | 例 |
|-------|------|-----|
| Static | フォーマット・型・lint | `cargo fmt`, `tsc --noEmit`, `flutter analyze` |
| Unit | 単体テスト | `cargo test`, `vitest`, `flutter test` |
| Build | 本番相当ビルド | `cargo build --release`, `pnpm build` |
| Integration | 結合テスト | DB / 外部 API 込みテスト |
| Manual | 手動検証 | UI 動作確認、Tauri full build、COM 連携 |

各レベルに対して以下のいずれかを記録:

- `pass` — 実行して合格
- `fail` — 実行して不合格 (PR は draft のまま)
- `skipped` — 該当なし or 環境制約で実行不可 (理由を併記)

例:

```markdown
## 検証レベル

- Static: pass (cargo clippy / pnpm lint)
- Unit: pass (cargo test / vitest)
- Build: skipped (pnpm tauri build は時間超過のため)
- Integration: skipped (該当テストなし)
- Manual required: yes (InDesign COM 連携はローカル環境依存)

## 未検証理由
- Tauri full build はローカル環境で 10 分超のため cargo check まで
- InDesign COM 連携は Windows + InDesign 環境必須のため手動検証
```

---

## agent の探索方向の制限

scan / apply agent は以下を **推測の起点にしない**:

- React / Next.js / Remix のパターン
- Go の goroutine / channel パターン
- Python の async / await 慣習
- Ruby の Rails 慣習

これらは Primary Stack に含まれないため、「ありそう」で指摘しない。
コード上に明示的に存在する場合のみ扱う。

---

## UI 影響判定 path パターン (op-architect / op-run / op-merge 共通)

/**
 * 機能概要: 「この変更ファイルは UI 影響あり扱いか」を判定するための path 集約。
 * 作成意図: op-architect / op-run / op-merge で同じ判定を分散管理しており、`src` / `lib` / `app`
 *           等の単語単独マッチで Rust crate (`src/`) や Tauri backend (`src-tauri/src/`) や
 *           Rust workspace lib (`lib.rs`) を誤って UI 扱いしていた。Primary Stack に合わせ
 *           judgement を一箇所に固める。
 * 注意点: ここに該当しても title / rationale / hidden marker (`op-domain`) で UI 影響と判定された
 *         場合は別系統で UI 影響あり扱いになる (path はあくまで machine-readable な fallback)。
 */

UI 影響あり判定の path パターンは以下に集約する。op-architect (UI 影響マイルストーン抽出) /
op-run (post-check 起動判定) / op-merge (gate 9〜11 適用判定) は本節を**そのまま**参照する。

### UI 影響あり (いずれかにマッチ)

**Vue 3 / TypeScript / Web frontend**:

- `frontend/src/**/*.vue`
- `frontend/src/pages/**`
- `frontend/src/views/**`
- `frontend/src/components/**`
- `frontend/src/features/**`
- `frontend/src/layouts/**`
- `apps/*/src/**/*.vue`
- `apps/*/src/pages/**`
- `apps/*/src/views/**`
- `apps/*/src/components/**`
- `apps/*/src/features/**`
- `apps/*/src/layouts/**`
- `packages/*/src/**/*.vue` (UI コンポーネントを公開する shared package のみ)

**Nuxt** (Vue 3 と同じ Primary Stack に含まれる):

- `pages/**/*.vue`
- `layouts/**/*.vue`
- `components/**/*.vue`

**Flutter / Dart** (`pubspec.yaml` がリポジトリルートまたはサブパッケージに存在する場合のみ):

- `lib/**/*.dart` (UI 構築コードと業務ロジックが混在しているため、UI 影響あり扱い)

`pubspec.yaml` が存在しない場合、`lib/**` は **Rust ワークスペース内の `lib.rs` 等を含む可能性が高いので UI 影響なしに倒す**。

### UI 影響なし (除外パス)

以下は UI 影響あり判定から **明示的に除外**する。たとえ上記のパターンに見えても優先して除外する:

- `src-tauri/**` (Tauri v2 backend、Rust)
- `backend/**` / `server/**` / `api/**`
- `crates/**` (Rust workspace member)
- `**/*.rs` (Rust ソース。たとえ `src/` 配下でも UI 影響なし)
- `migrations/**` / `db/**` / `schema/**` / `**/*.sql`
- `docs/**` / `**/*.md`
- `.github/**` / `.gitlab/**` / CI config
- `tests/**` / `**/__tests__/**` / `**/*.test.ts` / `**/*.spec.ts` (テスト追加は UI 影響として扱わない)

### 単語単独マッチの禁止

以下の語の**単独マッチで UI 影響ありと判定してはいけない**:

- `src` 単体 (Rust の `src/`、Cargo workspace の `crates/<name>/src/` を全部 hit する)
- `lib` 単体 (Rust の `lib.rs`、Cargo の `lib` crate を hit する)
- `app` 単体 (Tauri の `src-tauri/src/app.rs` 等が typed するために hit する)

判定はかならず上記の **完全な path glob** で行う。

### title / rationale / marker での補完

path での判定が不確実な場合 (新規ファイル / リネーム途中) は、以下を **OR 条件**で UI 影響あり判定に加える:

- マイルストーン / Issue title に `画面 / UI / ログイン / 一覧 / フォーム / ダイアログ / ボタン / モーダル / ナビ / ヘッダー / フッター / カード` 等を含む
- rationale / 概要が `ユーザー体験 / 操作性 / 画面導線 / a11y / 視認性` に言及
- hidden marker `<!-- op-domain: ux-ui -->` または `<!-- op-domain: design -->` が本文にある
- hidden marker `<!-- op-post-check-expert: ux-ui-audit-expert -->` が本文にある
- ラベル `pro-designer-expert` または `pro-ux-ui-audit-expert` が付与されている

### bash 実装 (`OP_MERGE_UI_PATH_PATTERN`) との対応

/**
 * 機能概要: op-merge の bash 実装が使う `OP_MERGE_UI_PATH_PATTERN` 環境変数の
 *           default 値・上書き手順・bash escape 例を集約する。
 * 作成意図: Stage 1 (PR #97) で bash 側を SSoT として確定したが、project-profile.md
 *           の glob 記法との対応関係が文書化されていなかった (Stage 2-A, #109)。
 * 注意点: bash 実装の SSoT は op-merge SKILL.md の `OP_MERGE_UI_PATH_PATTERN` 変数宣言行
 *         (Stage 1 PR #97 で確定)。本節は参照ドキュメントであり、実値は bash 側が正本。
 *         op-merge SKILL.md L729 の prose 整合は Stage 2-B (別 PR) で行う。
 */

**実装 SSoT**: op-merge SKILL.md の `OP_MERGE_UI_PATH_PATTERN` bash 変数 (Stage 1 PR #97 で確定)。
本節はその default 値と上書き手順の **参照ドキュメント** である。bash 実装側が正本。

#### default 正規表現 (bash escape 済み)

```bash
^(frontend/|src/(components|pages|layouts|views|routes)/|.*\.(vue|svelte|jsx|tsx|css|scss|less)$|src-tauri/.*/(window|menu|tray)\.|lib/.*/(widgets|screens|pages)/)
```

bash 変数宣言での実際の表記 (`\\` が bash 内で `\` に展開される):

```bash
UI_PATH_REGEX="${OP_MERGE_UI_PATH_PATTERN:-^(frontend/|src/(components|pages|layouts|views|routes)/|.*\\.(vue|svelte|jsx|tsx|css|scss|less)$|src-tauri/.*/(window|menu|tray)\\.|lib/.*/(widgets|screens|pages)/)}"
```

#### glob 形式との対応関係と差異

上記 default regex は本節の glob 記法より **スコープが狭い** ことに注意する。

| glob (本節) | bash regex | 備考 |
|---|---|---|
| `frontend/src/**/*.vue` | `frontend/` prefix match | glob より広い (frontend/ 以下すべて) |
| `frontend/src/components/**` | `src/(components|...)/ ` match | glob はサブディレクトリ付き、bash は prefix のみ |
| `apps/*/src/**/*.vue` | **マッチなし** | bash default に apps/ は含まれない |
| `packages/*/src/**/*.vue` | **マッチなし** | bash default に packages/ は含まれない |
| `**/*.vue` (Nuxt) | `.*\.vue$` | bash は拡張子 + `src/` prefix の OR |
| `lib/**/*.dart` | `lib/(widgets|screens|pages)/` | bash は Flutter UI サブディレクトリのみ (全 lib/ ではない) |

**glob にあって bash default にない主なパターン**:

- `apps/*/src/**` — bash で `apps/` は未検出。monorepo の `apps/` 構成では `OP_MERGE_UI_PATH_PATTERN` 上書きが必要
- `packages/*/src/**/*.vue` — 同上、shared UI package は上書きで対応
- `.scss` / `.less` / `.svelte` — bash にはあるが本節の glob には明示なし (bash の方が広い)
- `src/routes/` — bash にはあるが本節の glob にはない (SvelteKit / ファイルベース routing)

#### 上書き手順 (`export OP_MERGE_UI_PATH_PATTERN`)

プロジェクト固有の UI path が bash default に含まれない場合は、`OP_MERGE_UI_PATH_PATTERN` を
export してデフォルトを置き換える。**上書きは完全置換** (追加ではない) のため、
default のパターンも維持したい場合は全体を含めること。

```bash
# 例: apps/ モノレポ + Flutter UI サブディレクトリを追加する場合
export OP_MERGE_UI_PATH_PATTERN='^(frontend/|apps/[^/]+/src/|src/(components|pages|layouts|views|routes)/|.*\.(vue|svelte|jsx|tsx|css|scss|less)$|src-tauri/.*/(window|menu|tray)\.|lib/.*/(widgets|screens|pages)/)'
```

#### bash escape 例

`OP_MERGE_UI_PATH_PATTERN` を設定する際の bash escape ルール:

- `.` (ドット) を正規表現リテラルとして扱う場合は `\.` とする (シェル変数内では `\\.` 不要)
- シェル変数を single quote (`'...'`) で囲む場合、`\` はそのままで OK
- double quote (`"..."`) で囲む場合、`\\` が必要 (`\\.` → `\\.`)
- 特殊文字 `(`, `)`, `|`, `^`, `$` はシェル展開の影響を受けないよう single quote 推奨

```bash
# OK: single quote で囲む (\\. 不要)
export OP_MERGE_UI_PATH_PATTERN='^(frontend/|.*\.(vue|tsx)$)'

# OK: double quote を使う場合は \. を \\. にする
export OP_MERGE_UI_PATH_PATTERN="^(frontend/|.*\\.(vue|tsx)$)"

# NG: double quote + \. のまま → grep -E では \. でも動くが bash 変数内では意図が不明確
```

---

## CLAUDE.md との関係

プロジェクト固有の検証コマンドは CLAUDE.md に記載されることがある。
**CLAUDE.md の検証コマンドが本ドキュメントと矛盾する場合、CLAUDE.md を優先する。**

agent は順序として:

1. CLAUDE.md の「ビルド・テストコマンド」セクションを確認
2. なければ本ドキュメントのスタック別コマンドを使う
3. それも該当しなければ「検証コマンド未定義」として PR 本文に明記
