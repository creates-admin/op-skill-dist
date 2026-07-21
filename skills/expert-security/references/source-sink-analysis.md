# source-sink-analysis.md — Source → Sink Reachability 分析

<!--
機能概要: security finding に必要な source / sink / attack_path schema と reachability 判定基準。
作成意図: 「漠然と危険」ではなく「source X から sink Y に到達する経路を steps で示せる」だけを
         High / Critical として起票する根拠を統一する。
注意点: 本ファイルは reachability 判定の核。trust_boundary は trust-boundaries.md、
       severity 判定は本ファイル + severity-rubric.md (_shared) を組み合わせる。
       reachability を示せない finding は **起票しない** (Medium 以下扱い)。
-->

## source / sink / attack_path schema

canonical schema 拡張で必須:

```yaml
security:
  source:
    kind: frontend_invoke | imported_file | external_url | config | clipboard | drag_drop | user_selected_file | env | cli_arg
    file: "<path>"
    symbol: "<関数 / コマンド名>"
    input_name: "<parameter 名>"
  sink:
    kind: file_read | file_write | file_delete | rename | copy | execute | request | disclose | parse | update
    file: "<path>"
    symbol: "<関数 / コマンド名>"
    operation: read | write | delete | execute | disclose | request | parse
  attack_path:
    reachable: true | false
    steps:
      - "<source から sink までの具体的な流れ>"
  exploitability: none | theoretical | reachable | practical
  impact:
    confidentiality: none | low | medium | high
    integrity: none | low | medium | high
    availability: none | low | medium | high
  data_sensitivity:
    - production_path | user_file | token | document_content | generated_artifact
```

---

## source.kind enum

| kind | 説明 | trust_boundary |
|------|------|---------------|
| `frontend_invoke` | frontend から invoke / IPC で渡された任意文字列 | A (untrusted) |
| `imported_file` | ユーザーが import した外部ファイル / archive 内 entry / 内部 path 文字列 | E (untrusted) |
| `external_url` | network / HTTP / updater 経由の payload | G (remote) |
| `config` | 設定ファイル / cache / old project file から復元 | C / D |
| `clipboard` | clipboard 経由の text / file path | A (untrusted) |
| `drag_drop` | drag drop event 経由の File / path | B (user-granted) |
| `user_selected_file` | OS file picker / directory picker でユーザー明示選択 | B (user-granted) |
| `env` | std::env::var / dotenv | F (environment controlled) |
| `cli_arg` | std::env::args / clap | F (environment controlled) |

---

## sink.kind enum

| kind | 説明 | 典型 API |
|------|------|---------|
| `file_read` | ファイル読み込み | `std::fs::read` / `std::fs::read_to_string` / `tokio::fs::read` |
| `file_write` | ファイル書き込み (新規 / 上書き) | `std::fs::write` / `std::fs::create_dir_all` / `tokio::fs::write` |
| `file_delete` | ファイル削除 | `std::fs::remove_file` / `std::fs::remove_dir_all` / `tokio::fs::remove_file` |
| `rename` | ファイル名変更 | `std::fs::rename` / `tokio::fs::rename` |
| `copy` | ファイルコピー | `std::fs::copy` / `tokio::fs::copy` |
| `execute` | プロセス実行 / 外部アプリ起動 / shell | `std::process::Command::new` / `tauri-plugin-shell::Command` / COM 経由起動 |
| `request` | HTTP / network request 発行 | `reqwest::get` / `ureq::get` / `fetch` |
| `disclose` | log / error / dialog / Toast / generated artifact に値を出力 | `log::error!` / `println!` / `Toast::error` / artifact write |
| `parse` | 構造化データの deserialize | `serde_json::from_str` / archive extraction / image parse |
| `update` | アプリ更新 / installer / signing 検証 | `tauri-updater::check_update` / `apply_update` |

---

## sink.operation (sink 内の細分)

`sink.operation` は sink の細かい意味を補足する。

- `read` (file_read 系)
- `write` (file_write 系。新規作成 / 上書き両方)
- `delete` (file_delete 系)
- `execute` (process / shell 起動)
- `disclose` (情報漏洩。log / error / artifact)
- `request` (network / HTTP)
- `parse` (parser / deserialize)

`kind` と一致することが多いが、`disclose` は `file_write` でも `request` でも発生しうるため別フィールドで持つ。

---

## attack_path.steps の書き方

`attack_path.steps` は **source から sink までを観測可能な順序で 3〜7 ステップ**で書く。

### 例 1: frontend → write_user_data → 任意ファイル書き込み

```yaml
attack_path:
  reachable: true
  steps:
    - "WebView 内 frontend が compromise される (XSS / 脆弱な依存)"
    - "frontend が invoke('write_user_data', { path: '../../system32/config.bin', content: '...' }) を呼ぶ"
    - "src-tauri/src/commands/io.rs::write_user_data は path をそのまま PathBuf::from で受け取る"
    - "path canonicalize / scope check が無いまま std::fs::write(path, content) が実行される"
    - "結果として workspace 外の任意 path に書き込みが成立する"
```

### 例 2: imported .idml → zip-slip → 任意ファイル書き込み

```yaml
attack_path:
  reachable: true
  steps:
    - "攻撃者が malicious .idml ファイルをユーザーに送る"
    - "ユーザーが File menu → Import IDML から該当ファイルを選択"
    - "src-tauri/src/idml.rs::extract_idml は zip entry name を canonicalize せず std::path::Path::join で結合"
    - "entry name に `../` が含まれる場合、解凍先が指定 directory の外を指す"
    - "std::fs::create_dir_all + std::fs::write が外部 path に書き込み"
```

### 例 3: log::error! で絶対 path 漏洩

```yaml
attack_path:
  reachable: true
  steps:
    - "アプリが std::path::Path::display() の値をそのまま log::error! に渡す"
    - "production ビルドでも default log level が ERROR で /var/log や %APPDATA% に出力される"
    - "ログファイルの permission が 644 / Everyone:Read で他ユーザーから読める"
    - "結果として user 名 / 内部 directory 構造 / 文書名が他者に開示される"
```

steps は **断定的かつ短い文** で書く。「〜かもしれない」「テストすれば分かる」相当は禁句。

---

## reachable: true | false

- `reachable: true` のみ起票対象 (High / Critical 候補)
- `reachable: false` は起票しない (= hardening / defense-in-depth は別の改善 PR)

`reachable: true` の条件:

- source kind が観測可能な入力経路として実在する
- sink kind が実在する API 呼び出し
- source から sink までの中間で **検証 (validation / canonicalize / scope / signature) が確認できない**
- 攻撃者モデル (threat_model) が現実的 (CompromisedFrontend / MaliciousDocument 等)

`reachable: false` の例:

- 「もし frontend が compromise されたら...」という前提だけで sink まで届かない
- 中間で必ず canonicalize + scope check + extension check が走る
- sink が dead code (現状到達 path がない)

---

## exploitability scoring

| exploitability | 条件 | severity への影響 |
|----------------|------|------------------|
| `none` | 攻撃経路が存在しない | 起票しない |
| `theoretical` | 経路はあるが、現実的な前提条件が複雑 (3 つ以上の precondition AND) | High 上限 (Critical にしない) |
| `reachable` | 経路があり、precondition も観測可能 (1〜2 個の AND) | High 標準 |
| `practical` | 経路が直接的で、precondition が ほぼ常に満たされる | Critical 候補 |

```text
practical exploit:
  - frontend invoke 経由で直接到達 (XSS / supply chain compromise が前提)
  - imported file の zip-slip
  - updater payload signature skip
  - secret が常時 log に出る

reachable exploit:
  - user 操作 1 つで成立 (file open / import 等)
  - capability 越権が WebView compromise 前提
  - log permission が default 644 で漏洩

theoretical exploit:
  - 複数の precondition AND が必要
  - 攻撃者が特殊な OS 権限 / network 位置を持つ前提
  - hardening 候補 (defense-in-depth)
```

---

## impact scoring

CIA (Confidentiality / Integrity / Availability) の 3 軸で `none / low / medium / high` を判定。

| 軸 | low | medium | high |
|---|-----|--------|------|
| confidentiality | username / 内部 path 程度の漏洩 | 文書名 / 個人情報の一部 | 文書本文 / token / 秘密鍵 |
| integrity | log / cache の改竄 | user file の改竄 (1 ファイル) | 任意ファイル書き込み / 削除 / project 全体 / 配布 artifact 改竄 |
| availability | UI 一時ハング / Toast スパム | 当該機能の DoS (再起動で復帰) | アプリ全体の DoS / データ消失 / 起動不能 |

---

## severity 判定 (severity-rubric.md と組み合わせる)

```text
Critical:
  exploitability == practical AND impact >= high (CIA いずれか)
  AND evidence_grade == direct
  AND threat_model.actor が現実的
  AND attack_path.steps が断定的に書ける

High:
  exploitability == reachable AND impact >= medium
  または
  exploitability == theoretical AND impact == high (defense-in-depth)
  AND evidence_grade == direct or inferred (requires_runtime は High 上限)

起票しない (Medium 以下):
  exploitability == theoretical AND impact == low/medium
  または
  reachable: false
  または
  hardening / 好み / 一般論
```

---

## bulk_group 命名規則 (canonical)

scan で同質な検出 5 件以上は bulk_group でバッチ Issue 化する。

```text
security:<concern>:<context>

例:
- security:path-traversal-in-export
- security:unsafe-shell-args
- security:capability-overreach
- security:error-leak
- security:secret-in-log
- security:reparse-point-not-validated
- security:device-path-not-rejected
- security:reserved-name-not-rejected
- security:ads-not-rejected
- security:ipc-input-unvalidated
- security:overwrite-without-confirm
- security:extendscript-injection
- security:com-shell-injection
- security:updater-signature-skipped
- security:unsafe-scheme-accepted
- security:zip-slip
- security:tls-skip
- security:redirect-host-change
- security:temp-file-mode-too-permissive
```

bulk_group の判定規則:

- 同一 expert (security-expert)
- 同一 attack_surface
- 同一 sink.kind (おおむね)
- 同一 mitigation (validate / canonicalize / scope / confirm 等)

---

## evidence_grade と reachability の整合

| evidence_grade | reachability の書き方 | severity 上限 |
|----------------|--------------------|--------------|
| `direct` | 静的にコード読みで attack_path.steps が断定できる | Critical OK |
| `inferred` | 周辺コードから経路を推論 (中間で検証が無いことを直接見ていない) | High |
| `requires_runtime` | 実行時検証が必要 (タイミング依存 / OS 依存 / 並行性) | High |

`direct` 以外で Critical を付けてはいけない (severity-rubric.md と一致)。

---

## 判定例 (scan finding)

### 例 1: 任意ファイル書き込み (frontend_invoke → file_write)

```yaml
security:
  attack_surface: ipc
  trust_boundary: frontend_to_backend
  source:
    kind: frontend_invoke
    file: "src-tauri/src/commands/io.rs"
    symbol: "write_user_data"
    input_name: "path"
  sink:
    kind: file_write
    file: "src-tauri/src/commands/io.rs"
    symbol: "write_user_data"
    operation: write
  attack_path:
    reachable: true
    steps:
      - "frontend が invoke('write_user_data', { path: '../foo', content: '...' }) を呼ぶ"
      - "write_user_data は path: String を PathBuf::from で受け取る"
      - "canonicalize / scope check なしに std::fs::write(path, content) を実行"
      - "workspace 外の任意 path に書き込み成立"
  exploitability: practical
  impact:
    confidentiality: none
    integrity: high
    availability: low
  data_sensitivity:
    - user_file
    - production_path
```

→ severity: critical / evidence_grade: direct

### 例 2: zip-slip (imported_file → file_write)

```yaml
security:
  attack_surface: parser
  trust_boundary: user_file
  source:
    kind: imported_file
    file: "src-tauri/src/idml.rs"
    symbol: "extract_idml"
    input_name: "entry.name"
  sink:
    kind: file_write
    file: "src-tauri/src/idml.rs"
    symbol: "extract_idml"
    operation: write
  attack_path:
    reachable: true
    steps:
      - "ユーザーが malicious .idml を import"
      - "extract_idml は zip entry を for entry in archive.entries() で iterate"
      - "Path::join(dest_dir, entry.name()) を canonicalize せずに使用"
      - "entry name が `../foo` の場合、解凍先が外部 path"
      - "std::fs::write が外部 path に書き込み"
  exploitability: reachable
  impact:
    confidentiality: none
    integrity: high
    availability: none
  data_sensitivity:
    - user_file
    - generated_artifact
```

→ severity: high / evidence_grade: direct (Critical にしないのはユーザー操作必要のため)

### 例 3: log で絶対 path 漏洩 (config → disclose)

```yaml
security:
  attack_surface: logging
  trust_boundary: local_fs
  source:
    kind: config
    file: "src-tauri/src/recent.rs"
    symbol: "load_recent_files"
    input_name: "path"
  sink:
    kind: disclose
    file: "src-tauri/src/recent.rs"
    symbol: "load_recent_files"
    operation: disclose
  attack_path:
    reachable: true
    steps:
      - "load_recent_files が config の path を std::path::Path::display() でそのまま log::error! に渡す"
      - "ログファイルが permission 644 で他ユーザー読める"
      - "user 名 / 文書名 / 内部 directory 構造が漏れる"
  exploitability: theoretical
  impact:
    confidentiality: medium
    integrity: none
    availability: none
  data_sensitivity:
    - production_path
    - document_content
```

→ severity: high / evidence_grade: inferred (theoretical だが impact medium なので High 起票可)
