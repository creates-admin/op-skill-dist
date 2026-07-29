<!--
schema_version: 1
last_breaking_change: 2026-07-29
notes: v1 (2026-07-29): ADR-0029 Wave B1 で SKILL.md フェーズ2 本文から移動 (内容変更なし、verbatim 転記)。
       種別ごとの論点チェックリストは 1 セッションで該当する 1 種別分しか使われない (5 種別中 4 は不使用) ため
       references/ へ退避。本文はフェーズ2 の導入文 + 本ファイルへの pointer のみを保持する。
-->

<!--
機能概要: op-architect フェーズ2「論点抽出」で使う、プロジェクト種別ごとの必須意思決定リスト
          (Tauri v2 + Vue 3 / Vue 3 SPA・Nuxt / Flutter / Rust CLI・サーバ / その他汎用の 5 種別)。
作成意図: フェーズ1 で判定した種別に応じて 1 つだけ参照するテーブル群であり、
          本文に置くと他 4 種別分が毎回死蔵コンテキストになるため分離。
注意点: 内容は SKILL.md からの verbatim 移動。表の追加・改訂は本ファイルで行い、
        SKILL.md フェーズ2 本文の pointer 誘導文言は変更不要 (種別が増減した場合のみ見出し一覧を更新)。
-->

# op-architect フェーズ2: プロジェクト種別ごとの論点チェックリスト

**いつ読むか**: フェーズ1 でプロジェクト種別を判定した直後、フェーズ2 の論点抽出で
**判定された種別 1 つのみ** を参照する (他 4 種別は読まない)。

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
