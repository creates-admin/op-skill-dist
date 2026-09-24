# プロジェクトプロファイル: 検証コマンド & スタック前提

op-* スキル群のスタック前提と、apply / review agent が「何を実行すれば検証完了か」を判断する基準の正本。
対象 repo の CLAUDE.md の検証コマンド・規約が本ファイルと矛盾する場合は CLAUDE.md を優先する
(CLAUDE.md → 本ファイルのスタック別コマンド → どちらも無ければ「検証コマンド未定義」と PR 本文に明記)。

---

## Primary Stack (想定する主戦場)

| 言語 / FW | 主要ターゲット |
|----------|---------------|
| Rust | Tauri v2 backend / Cargo workspace / CLI |
| Flutter / Dart | モバイル / デスクトップ UI |
| Vue 3 / TypeScript | Tauri v2 frontend / Web UI |
| Tauri v2 | Rust + Vue の橋渡し、IPC / command / capability |

## Out of scope (想定しないスタック)

React / Next.js / Remix、Go、Python backend (FastAPI / Django / Flask)、Ruby / PHP / Java は想定しない。
これらのパターンを推測の起点にせず、コードに明示的に存在する場合のみ扱う。
`package.json` / `Cargo.toml` / `pubspec.yaml` を確認し、実在するスタックのみを検証対象にする。

---

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

---

## 検証レベルの分類

apply / review agent は PR 本文の「検証レベル」セクションに以下を記載する。

| レベル | 内容 | 例 |
|-------|------|-----|
| Static | フォーマット・型・lint | `cargo fmt`, `tsc --noEmit`, `flutter analyze` |
| Unit | 単体テスト | `cargo test`, `vitest`, `flutter test` |
| Build | 本番相当ビルド | `cargo build --release`, `pnpm build` |
| Integration | 結合テスト | DB / 外部 API 込みテスト |
| Manual | 手動検証 | UI 動作確認、Tauri full build、COM 連携 |

各レベルに `pass` / `fail` (PR は draft のまま) / `skipped` (理由を併記) を記録する。

```markdown
## 検証レベル

- Static: pass (cargo clippy / pnpm lint)
- Unit: pass (cargo test / vitest)
- Build: skipped (pnpm tauri build は時間超過のため)
- Integration: skipped (該当テストなし)
- Manual required: yes (InDesign COM 連携はローカル環境依存)

## 未検証理由
- InDesign COM 連携は Windows + InDesign 環境必須のため手動検証
```

---

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

---

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
| **ネスト深さ** | **2 階層以内**。ガード節 (早期 return) / 関数抽出 / dispatch table で平坦化する。構文別の数値は CLAUDE.md が定める場合のみ従う |
| **コメント言語** | **日本語**。関数・クラス・主要処理に「なぜそうしたか (作成意図)」を 1 行。自明なコードには書かない |
| **抽象化** | **過剰抽象化禁止**。抽象化は重複を観測してから行う。1 関数 1 ファイル / interface と implementation の形式的分離 / 要求のない Clean Architecture・DDD 導入は行わない |
| **変更粒度** | **最小限**。目的外の変更 (バグ修正にリファクタを混ぜる等) を同じ PR に入れない |
| **検証** | **検証なしの実装は出荷しない**。実行できなかった検証 Level は PR / 完了報告に明記する (「検証レベルの分類」節) |
| **優先思想** | **形式的美しさよりデバッグ容易性**を優先する |

### audit / refute 側での扱い

- CLAUDE.md 規約に準拠しているコードを「問題」として起票しない (refute では refuted 方向の材料。`refute-contract.md` §4)。
- CLAUDE.md が定義する「禁止パターン」への違反は High 以上として扱う (`severity-rubric.md`「scan 報告ルール (共通)」節)。
- CLAUDE.md の規約そのものを批判しない。

### expert 固有差分

各 expert が自分の Run Mode 文脈で言い換える 1 行 (例: test = 「setup ネストも 2 段以内」/ refactor = 「refactor 後にネストを増やさない」)
は各 expert 側に残す。共通骨格そのものを再定義してはならない。
