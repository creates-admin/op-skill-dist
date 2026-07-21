# trust-boundaries.md — 信頼境界判定

<!--
機能概要: 入力源 (path / URL / 文字列) を信頼境界 A〜G に分類し、各境界に応じた validation 要件を定義する。
作成意図: 「同じ path 文字列でも入力源によって扱いを変える」のが usable security の核。
         frontend free text を untrusted として扱う一方、OS file picker 経由の path を user-granted capability
         として尊重することで、過剰な禁止を避けつつ攻撃経路を閉じる。
注意点: 本ファイルは入力源の分類と validation 要件のみ。
       実際の reachability / sink への影響は source-sink-analysis.md。
       Windows 固有の path 境界 (UNC / device path / reparse point 等) は windows-path-boundaries.md。
-->

## 入力源別の信頼境界 (A〜G)

```text
A. frontend の自由入力文字列
   → untrusted

B. OS file picker / directory picker でユーザーが明示選択した path
   → user-granted capability

C. app 内部で生成した path
   → trusted internal
   → ただし join / canonicalize / scope check は必要

D. config / cache / old project file から復元した path
   → stale trusted data
   → 再検証が必要

E. 外部ファイル内に書かれた path
   → untrusted

F. CLI argument / env var
   → environment controlled input
   → 実行環境次第で untrusted として扱う

G. network / updater / external URL
   → remote boundary
   → scheme / host / signature / redirect / TLS 前提を検査
```

---

## A. frontend free text (untrusted)

### 入力例

- WebView の `<input>` にユーザーが入力した文字列
- frontend store / state から `invoke()` に渡された arbitrary string
- frontend code 内で hard-coded だが、build 時に置換される文字列

### 扱い

- **path として sink に渡す前に必ず validation** (canonicalize / scope check / extension / reserved name / reparse point)
- **path として扱うべきではない場合は path として使わない** (例: 表示文字列を path 解釈しない)
- shell 引数として渡す場合は **必ず args 配列**で渡す (shell 文字列連結禁止)
- URL として扱う場合は scheme allowlist + host allowlist

### canonical schema との対応

```yaml
security:
  source:
    kind: frontend_invoke
    file: "frontend/src/components/Foo.vue"
    symbol: "submitForm"
    input_name: "filePath"
  trust_boundary: frontend_to_backend
```

---

## B. OS file picker / directory picker でユーザー明示選択 (user-granted capability)

### 入力例

- `tauri::dialog::FileDialogBuilder::pick_file` の戻り値
- `tauri::dialog::FileDialogBuilder::pick_folder` の戻り値
- `tauri::dialog::FileDialogBuilder::save` の戻り値
- ネイティブ file picker (Windows IFileDialog / macOS NSOpenPanel) の結果
- HTML5 `<input type="file">` でユーザーが選択した File オブジェクト

### 扱い

- **user-granted capability として尊重する** (= ユーザーが「ここに保存していい」「ここから読んでいい」と明示した path)
- ただし以下は必ず検査する:
  - canonicalize する (symlink / junction / reparse point を resolve)
  - 拡張子検査 (アプリの想定する拡張子か)
  - reserved name reject (CON / PRN / AUX / NUL / COMx / LPTx)
  - alternate data stream reject (`file.txt:stream`)
  - device path / UNC path reject (`\\?\C:\...` / `\\server\share\...`)
  - 上書きする場合は確認ダイアログ (UX 既存導線維持)
  - error 出力に絶対 path を漏らさない (sanitize)
- **scope を「workspace 配下のみ」のように強制しない** (= ユーザー選択の意思を尊重)
  - ただし、**save_as ではなく自動保存** (毎フレーム保存等) では scope (workspace / user data dir) を強制してよい
  - import で読み込んだ project file 内の path (= boundary D) には scope を強制してよい

### canonical schema との対応

```yaml
security:
  source:
    kind: user_selected_file
    file: "src-tauri/src/commands/save.rs"
    symbol: "save_as"
    input_name: "destination"
  trust_boundary: user_selected_path
```

### 重要原則

```text
NG: user_selected_path を「危険だから禁止」する
OK: user_selected_path を canonicalize / extension / reserved / overwrite 確認で守る
```

詳細は `file-picker-and-user-selected-path.md`。

---

## C. app 内部で生成した path (trusted internal)

### 入力例

- `tauri::api::path::app_data_dir` / `app_local_data_dir` / `cache_dir`
- アプリが起動時に決定する workspace path
- temp file (`tempfile` crate / `std::env::temp_dir`)
- アプリが定数で持つ public asset path

### 扱い

- 信頼するが、**join / canonicalize / scope check は必要** (race condition / TOCTOU 防止)
- 動的に変わる場合 (multi-window / multi-tenancy) は再検証
- temp file は権限を限定 (other user から読めないよう mode を設定)

### canonical schema との対応

```yaml
security:
  source:
    kind: config  # app 内部生成も config 系として扱う
    file: "src-tauri/src/state.rs"
    symbol: "default_workspace_path"
  trust_boundary: local_fs
```

---

## D. config / cache / old project file から復元した path (stale trusted data)

### 入力例

- アプリの設定ファイル (`config.json`) から読んだ recent files
- old project file 内の reference path (相対 / 絶対)
- migration 元ファイル (古いバージョンの保存形式)

### 扱い

- **保存当時は trusted** だが、**現在は再検証が必要**
- 再検証項目:
  - canonicalize 後に scope (workspace / user data) 内か
  - symlink / reparse point に変わっていないか
  - 存在しない path を作る経路 (`create_dir_all`) に流れていないか
  - target file の整合性 (extension / format / 内容)
- 設定の version migration 経路は **入力検証ロジックを残したまま**修正する

### canonical schema との対応

```yaml
security:
  source:
    kind: config
    file: "src-tauri/src/recent.rs"
    symbol: "load_recent_files"
  trust_boundary: config
```

---

## E. 外部ファイル内に書かれた path (untrusted)

### 入力例

- IDML / project file 内の reference path
- CSV / JSON / TOML 内の filepath 文字列
- archive (zip / tar) 内の entry name (zip-slip)
- PDF / image metadata 内の reference

### 扱い

- **完全に untrusted** として扱う (boundary A 同等)
- archive entry は zip-slip 検査必須:
  - entry name に `..` / 絶対 path / symlink を含むものを reject
  - 解凍先が canonicalize 後に scope 内か確認
  - サイズ / エントリ数 / 圧縮比 上限
- 外部ファイル内 path に基づく file operation は **scope (workspace / user-selected directory) 強制**

### canonical schema との対応

```yaml
security:
  source:
    kind: imported_file
    file: "src-tauri/src/idml.rs"
    symbol: "extract_idml"
  trust_boundary: user_file
```

---

## F. CLI argument / env var (environment controlled input)

### 入力例

- `std::env::args` で取った launch argument
- `std::env::var` / `dotenv` で取った環境変数
- `RUST_LOG` / `TAURI_DEBUG` / `WEBVIEW2_USER_DATA_FOLDER` 等の Tauri / WebView2 環境変数

### 扱い

- **実行環境次第で untrusted** (CI / production / 開発環境で意味が変わる)
- production build で dangerous setting (debug / devtools / allowlist) が ON にならないよう、env で切り替えない or runtime check で reject
- `RUST_LOG` 等は log level だけに使い、log 出力 path や format には使わない
- 起動 path / working_dir に env を使う場合は scope check 必須

### canonical schema との対応

```yaml
security:
  source:
    kind: env  # または cli_arg
    file: "src-tauri/src/main.rs"
    symbol: "main"
  trust_boundary: env
```

---

## G. network / updater / external URL (remote boundary)

### 入力例

- reqwest / ureq / fetch で取得した payload
- tauri-updater が読む updater manifest (`latest.json`)
- 外部 URL の redirect 追跡先
- HTTP response body の payload (JSON / image / archive)

### 扱い

- **完全に untrusted** + **追加で scheme / host / signature / TLS 検査**
- scheme allowlist (https のみ等)
- host allowlist (production domain のみ)
- redirect 追跡時に scheme / host が変わったら reject
- TLS は default (rustls / system roots)、`accept_invalid_certs` 等は禁止
- updater payload は signature 検証必須
- response body を file に保存する場合は boundary E と同等の検査

### canonical schema との対応

```yaml
security:
  source:
    kind: external_url
    file: "src-tauri/src/updater.rs"
    symbol: "fetch_manifest"
  trust_boundary: external_url
```

---

## 入力源 → trust_boundary 対応表

| source.kind | trust_boundary | 信頼境界 (A〜G) |
|-------------|----------------|---------------|
| `frontend_invoke` | `frontend_to_backend` | A |
| `user_selected_file` | `user_selected_path` | B |
| `config` | `config` または `local_fs` | C / D |
| `imported_file` | `user_file` | E |
| `env` | `env` | F |
| `cli_arg` | `env` | F |
| `external_url` | `external_url` | G |
| `clipboard` | `frontend_to_backend` | A 相当 (内容は untrusted) |
| `drag_drop` | `user_selected_path` | B (= ユーザー明示行為) |

---

## 判断手順 (scan / patrol で迷ったら)

```text
1. この path / URL / 文字列はどこから来るか?
2. ユーザーが明示的に「ここを使っていい」と OS picker で選択したか?
   - YES → boundary B (user-granted capability)
   - NO → 次へ
3. アプリ内部で生成した値か?
   - YES → boundary C (trusted internal)
   - NO → 次へ
4. 設定ファイル / 古い project file から復元した値か?
   - YES → boundary D (stale trusted data) → 再検証必須
   - NO → 次へ
5. 外部ファイル内に書かれた path / URL か?
   - YES → boundary E (untrusted)
   - NO → 次へ
6. frontend から invoke で渡された値か?
   - YES → boundary A (untrusted)
   - NO → 次へ
7. CLI / env から来た値か?
   - YES → boundary F (environment controlled)
   - NO → 次へ
8. network / HTTP / updater 経由か?
   - YES → boundary G (remote)
```

`security.trust_boundary` に enum 値を設定する。

---

## 同じ sink でも boundary が違えば finding が分かれる

例: `std::fs::write(path, content)` という sink について:

| source の boundary | finding 化 | 理由 |
|-------------------|----------|------|
| A (frontend free text) | **High / Critical 候補** | path canonicalize 漏れがあれば任意ファイル書き込み |
| B (user-selected) | reserved / overwrite 検査漏れがある場合のみ起票 | user-granted なので scope 強制は不要、ただし reparse / reserved / overwrite confirm は必要 |
| C (trusted internal) | join / TOCTOU の問題があれば High | 通常は問題なし |
| D (stale trusted) | 再検証していなければ High | symlink への変化 / scope 外への移動 |
| E (untrusted file content) | **High / Critical 候補** | zip-slip / archive escape |
| F (env) | dangerous setting on production なら High | log path 等に env を使う設計問題 |
| G (network) | response を file に書く場合 path 検証なしで High | updater / download の path 検査 |

---

## 禁止される判断

- boundary B (user-selected) の path を「危険だから禁止」と起票
- boundary A (frontend free text) を boundary B のように扱う (= validation を緩める)
- boundary D (stale trusted) を「保存時 trusted だから OK」とする (= 再検証を skip する)
- boundary E (外部ファイル内 path) を boundary C のように扱う (= scope 強制を skip する)
- 同じ sink への複数 source を 1 つの finding にまとめる (boundary 別に finding を分ける)
