# source-sink-analysis.md — 到達可能性の判定

finding を High / Critical として出してよいかを決める。流れ: 信頼境界 (§1) → source / sink / attack_path (§2〜§3) →
threat model (§4) → exploitability × impact (§5) → severity (§6)。field の enum は `op help payload security-finding`。

## 1. 信頼境界 (入力源 A〜G)

同じ path 文字列でも入力源で扱いが変わる。

| 境界 | 入力源 | 扱い | source.kind → trust_boundary |
|---|---|---|---|
| A | frontend の自由入力 (`invoke()` 引数、store 由来の文字列) | untrusted。sink 前に validate + canonicalize + scope。shell には args 配列、URL は scheme / host allowlist | `frontend_invoke` / `clipboard` → `frontend_to_backend` |
| B | OS file picker / directory picker / save dialog / drag-drop でユーザーが明示選択した path | user-granted capability。canonicalize・拡張子・reserved / ADS / device / UNC・上書き確認・error sanitize は行うが **scope は強制しない** | `user_selected_file` / `drag_drop` → `user_selected_path` |
| C | app 内部生成 (app_data_dir / workspace / temp / 定数 asset) | trusted internal。join・canonicalize・scope 確認と temp 権限は必要 | `config` → `local_fs` |
| D | config / cache / 旧 project file から復元した path | stale trusted。canonicalize → scope → symlink 化していないか、を再検証 | `config` → `config` |
| E | 外部ファイル内の path (IDML / CSV / JSON / archive entry / metadata) | untrusted (A 同等)。scope 強制、archive は zip-slip 検査 | `imported_file` → `user_file` |
| F | CLI 引数 / 環境変数 | 環境次第で untrusted。production で dangerous setting が env で ON にならないか、起動 path は scope 確認 | `env` / `cli_arg` → `env` |
| G | network / updater / external URL | remote。scheme・host・signature・redirect・TLS を検査。response を保存するなら E 同等 | `external_url` → `external_url` |

分類手順: OS picker で明示選択 → B / app 内部生成 → C / 設定・旧ファイルから復元 → D / 外部ファイル内 → E /
frontend の invoke → A / CLI・env → F / network → G。

同じ sink (例 `std::fs::write`) でも境界で判定が変わる:

| 境界 | finding 化 |
|---|---|
| A / E | canonicalize・scope 漏れで High / Critical 候補 |
| B | reserved / reparse / 上書き確認の漏れがある場合のみ |
| C | join / TOCTOU の問題があれば High |
| D | 再検証していなければ High |
| F | production で dangerous setting になるなら High |
| G | 保存先 path の検証が無ければ High |

禁止される判断:
- B を「危険だから禁止」とする / A を B のように緩く扱う
- D を「保存時に trusted だった」として再検証を省く / E を C のように扱い scope 強制を省く
- 同じ sink への複数 source を 1 finding にまとめる (境界ごとに分ける)

`trust_boundary` の `generated_script` / `com_boundary` は InDesign JSX / COM 境界に使う (`shell-process.md`)。

## 2. source / sink / attack_path

- `source`: kind / file / symbol / input_name。kind は §1 の表。
- `sink`: kind / file / symbol / operation。kind の典型 API:

| sink.kind | 典型 API |
|---|---|
| `file_read` / `file_write` / `file_delete` / `rename` / `copy` | `std::fs::*` / `tokio::fs::*` / `create_dir_all` / `remove_dir_all` |
| `execute` | `std::process::Command` / tauri-plugin-shell / COM 起動 |
| `request` | reqwest / ureq / fetch |
| `disclose` | log / error / dialog / Toast / 生成 artifact への出力 |
| `parse` | serde deserialize / archive extraction / image・PDF parse |
| `update` | tauri updater の check / apply |

`sink.operation` は kind の補足。`disclose` は `file_write` や `request` でも起きるので別に持つ。

## 3. attack_path

- `steps` は source から sink までを観測可能な順に 3〜7 個、断定的な短文で書く。各 step を静的証拠で裏付ける。
- `reachable: true` のみ報告対象。条件: source が実在する入力経路 / sink が実在する呼び出し /
  中間で validation・canonicalize・scope・signature が確認できない / threat model が現実的。
- `reachable: false` の例: 「もし compromise されたら」だけで sink まで届かない / 中間で必ず検証が走る / sink が dead code。
  hardening・defense-in-depth は報告しない。

## 4. threat model

`actor` は単一 (集計が単一前提)。別経路でも成立するなら最も典型的・影響の大きいものを primary にし、残りは `secondary_actors`。

| actor | 想定 | 典型 finding → mitigation |
|---|---|---|
| `local_user` | 同端末の別ユーザー / マルウェア | temp・log・cache が他ユーザーから読める → file mode / cleanup / OS 資格情報ストア |
| `malicious_document` | 受け取った PDF / IDML / 画像 | parser DOS / zip-slip / XXE → size・depth limit / entry path 検証 |
| `malicious_project_file` | アプリ独自 project file 内の path・state | stale path が scope 外や reparse point を指す → canonicalize + scope 再検証 |
| `compromised_frontend` | XSS / 脆弱な依存で乗っ取られた WebView | invoke で任意 path write / capability 越権 / shell injection → IPC 入力検証 / capability 最小化 |
| `network_attacker` | HTTP / MITM / redirect | TLS skip / host change / unsafe scheme → rustls + system roots / allowlist / redirect 検証 |
| `malicious_update_source` | compromise された updater サーバー / 偽 mirror | signature skip / downgrade → signature 必須 / version 検証 |
| `malicious_plugin` | 動的ロードする plugin / ExtendScript | 本体権限での任意操作 → sandbox / escape / trusted binary path |

- `preconditions`: 到達が成立する観測可能な前提を 1 行ずつ。「設定次第」「いつか」は根拠にならない。`attack_path.steps` と整合させる。
- `required_user_action`: 必要なユーザー操作 (例 `user opens file` / `user imports project`)。不要なら空配列。
- `asset_at_risk`: `user_file` / `production_path` / `token` / `document_content` / `generated_artifact`。

actor・preconditions・asset_at_risk が埋まらない finding は High / Critical にしない。

## 5. exploitability × impact

| exploitability | 条件 | 例 |
|---|---|---|
| `none` | 到達経路なし | 報告しない |
| `theoretical` | 経路はあるが前提が 3 つ以上の AND / 特殊な OS 権限や network 位置が必要 | hardening 候補 |
| `reachable` | 前提が観測可能で 1〜2 個 | ユーザー操作 1 つで成立 (open / import) / log が 644 で他ユーザーに読める |
| `practical` | 経路が直接的で前提がほぼ常に成立 | frontend invoke から直接到達 / imported archive の zip-slip / updater signature skip / secret が常時 log に出る |

| impact | low | medium | high |
|---|---|---|---|
| confidentiality | ユーザー名・内部 path 程度 | 文書名 / 個人情報の一部 | 文書本文 / token / 秘密鍵 |
| integrity | log / cache の改竄 | user file 1 つの改竄 | 任意 file の書込・削除 / project 全体 / 配布 artifact 改竄 |
| availability | UI の一時ハング | 当該機能の DoS (再起動で復帰) | アプリ全体の DoS / データ消失 / 起動不能 |

## 6. severity

| severity | 条件 |
|---|---|
| Critical | `practical` かつ impact いずれか high、`evidence_grade: direct`、actor が現実的、steps を断定で書ける |
| High | `reachable` かつ impact medium 以上、または `theoretical` かつ impact high (defense-in-depth) |
| 報告しない | `theoretical` かつ impact low / medium、`reachable: false`、hardening / 好み / 一般論 |

- `required_user_action` が空 (silent) なら practical 寄り = Critical 候補。操作が要るなら reachable 寄り = High 候補。
- 例外: actor が既に compromise 済み前提 (`malicious_update_source` 等) で asset がほぼ全種に及ぶ場合は、操作が要っても Critical にできる。
- 初期到達経路と「到達後にどこまで広がるか」(例: compromise 済み frontend に対する capability の広さ) は分けて判定する。後者は通常 High 止まり。
- evidence_grade: `direct` のみ Critical 可。`inferred` / `requires_runtime` は High 上限 (`requires_runtime` は reproduction_hint 必須)。
- 共通基準は `~/.claude/skills/_shared/severity-rubric.md`。

判定例 (compromised_frontend → file_write、Critical):

```yaml
security:
  attack_surface: ipc
  trust_boundary: frontend_to_backend
  source: { kind: frontend_invoke, file: "src-tauri/src/commands/io.rs", symbol: "write_user_data", input_name: "path" }
  sink:   { kind: file_write, file: "src-tauri/src/commands/io.rs", symbol: "write_user_data", operation: write }
  attack_path:
    reachable: true
    steps:
      - "frontend が invoke('write_user_data', { path: '../foo', content }) を呼ぶ"
      - "write_user_data は path: String を PathBuf::from で受ける"
      - "canonicalize / scope check なしに std::fs::write(path, content) を実行"
      - "workspace 外の任意 path に書き込める"
  exploitability: practical
  impact: { confidentiality: none, integrity: high, availability: low }
  data_sensitivity: [user_file, production_path]
threat_model:
  actor: compromised_frontend
  preconditions:
    - "WebView の frontend が攻撃者制御下にある (XSS / 脆弱な依存)"
    - "write_user_data が登録済みで capability に含まれる"
  required_user_action: []
  asset_at_risk: [user_file, production_path]
```

同じ形で、imported .idml の zip-slip はユーザーの import 操作が要るので `reachable` / High。
log に絶対 path が出て log が 644 の場合は `reachable` (theoretical ではない) で impact medium → High。

## 7. bulk_group

同質な検出をまとめるキー。同一 attack_surface・おおむね同一 sink.kind・同一 mitigation で揃える。

| 領域 | bulk_group |
|---|---|
| path / file IO | `path-traversal-in-export` / `path-canonicalize-missing` / `reparse-point-not-validated` / `device-path-not-rejected` / `reserved-name-not-rejected` / `ads-not-rejected` / `toctou-check-then-act` / `atomic-write-missing` / `temp-file-mode-too-permissive` / `overwrite-without-confirm` |
| IPC / capability | `ipc-input-unvalidated` / `ipc-panic-on-invalid-input` / `ipc-error-leak` / `capability-overreach` / `dead-permission` / `wildcard-scope` / `dangerous-flag-on-production` / `devtools-on-production` / `csp-unsafe-eval` |
| shell / 外部アプリ | `unsafe-shell-args` / `path-dependent-binary-launch` / `env-leak-to-subprocess` / `command-output-leak` / `shell-scope-overreach` / `extendscript-injection` / `com-shell-injection` / `jsx-tempfile-predictable` / `jsx-tempfile-leak` / `indesign-version-routing-untrusted` |
| secret / log | `secret-in-log` / `production-path-in-log` / `document-content-in-log` / `error-leak` / `error-leak-to-frontend` / `token-in-url` / `log-permission-too-permissive` / `artifact-metadata-leak` |
| URL / updater | `tls-skip` / `redirect-host-change` / `updater-signature-skipped` / `updater-manifest-http` / `unsafe-scheme-accepted` / `host-allowlist-too-broad` |
| parser / archive | `zip-slip` / `decompression-bomb-no-limit` / `deserialize-dos` / `xxe-or-entity-expansion` / `archive-symlink-allowed` / `parser-panic-on-input` |

すべて `security:` prefix を付ける (例 `security:zip-slip`)。
