# threat-model-and-actors.md — 脅威モデルと攻撃者像

<!--
機能概要: security-expert が finding に必ず付与する threat_model (actor / preconditions / required_user_action /
         asset_at_risk) の判定基準。
作成意図: 「漠然と危険」ではなく「誰が・何を前提に・何を奪いに来るか」を明示することで、
         severity 判定 (exploitability / impact) と usable security 判定 (この修正で何を守るか / 何を残すか) を
         一貫させる。
注意点: threat_model は finding ごとに必ず付ける。空欄や仮置きは禁止。
       実際の到達可能性 (reachable / practical) は source-sink-analysis.md で確定する。
       本ファイルは「actor / 前提 / 資産」の判定基準のみを扱う。
-->

## threat_model schema (canonical)

canonical schema 拡張で必須の `threat_model` block:

```yaml
threat_model:
  # primary actor は単一 (gate 集計が actor 単一前提に依存するため)
  actor: local_user | malicious_document | malicious_project_file | compromised_frontend | network_attacker | malicious_update_source | malicious_plugin
  # 補助 actor (任意)。同一 finding が primary actor 以外の経路でも成立する場合のみ列挙
  secondary_actors:
    - <enum と同じ語彙>  # 任意配列、空または省略可
  preconditions:
    - "<攻撃が成立する前提を 1 行ずつ>"
  required_user_action:
    - "<攻撃にユーザー操作が必要なら明記。不要なら空配列>"
  asset_at_risk:
    - user_file | production_path | token | document_content | generated_artifact
```

> **actor は単一に固定する理由**: op-merge / op-scan / op-patrol が `threat_model.actor` を
> 単一 enum として集計・優先度付けする (例: `compromised_frontend` 多発 → frontend 由来攻撃面強化)。
> primary actor が複数になると集計 / dedup / 優先度判定が崩れる。
> 同一 finding が複数経路で成立する場合は **最も典型的 / 影響の大きい** 1 つを primary に置き、
> 残りは `secondary_actors[]` に記録する。

---

## actor (7 種から選ぶ)

### 1. `local_user`

- 同じ端末を使う別ユーザー / マルウェア / 乗っ取られたアカウント
- 典型シナリオ: temp ファイルを覗く / cache から secret を取る / OS の権限境界を越える
- 想定資産: token / secret / production path / document content

### 2. `malicious_document`

- ユーザーが受け取った文書ファイル (PDF / Word / IDML / 画像)
- 典型シナリオ: parser 経由で任意 file 操作 / decompression bomb / XXE / archive zip-slip
- 想定資産: user_file / generated_artifact / system stability

### 3. `malicious_project_file`

- アプリ独自の project file (内部 path / config / serialized state)
- 典型シナリオ: project file 内の path 文字列が canonicalize 後 scope 外を指す / stale trusted data
- 想定資産: user_file / production_path / generated_artifact

### 4. `compromised_frontend`

- WebView 内で動く frontend (XSS / 脆弱な依存 / supply chain compromise)
- 典型シナリオ: invoke で任意 IPC を呼ぶ / capability 越権 / shell injection / path traversal
- 想定資産: token / user_file / production_path / capability boundary

### 5. `network_attacker`

- 外部 HTTP / external URL / updater payload / TLS MITM
- 典型シナリオ: redirect で別 host / payload 改竄 / signature 検証 skip / unsafe scheme
- 想定資産: updater integrity / token / artifact integrity

### 6. `malicious_update_source`

- 攻撃者が compromise した updater サーバー / fake mirror
- 典型シナリオ: updater payload 改竄 / version downgrade / signature bypass
- 想定資産: artifact integrity / system integrity

### 7. `malicious_plugin`

- アプリが動的にロードする plugin / extension / external script (ExtendScript 等)
- 典型シナリオ: plugin が本体権限で任意操作 / sandbox escape
- 想定資産: token / user_file / system integrity

---

## actor 別の典型 finding

| actor | 典型 finding 例 | mitigation 例 |
|-------|----------------|--------------|
| local_user | temp file の権限不足で別ユーザーから読める / cache に secret が残る | proper file mode / temp cleanup / Keychain 利用 |
| malicious_document | PDF parser の DOS / image parser の OOB read / IDML zip-slip | parser に size/depth limit / archive entry path canonicalize |
| malicious_project_file | project file 内 path が stale で reparse point に書き込み | path canonicalize + scope 再検証 |
| compromised_frontend | invoke で任意 path に write_file / capability 越権 | IPC 入力検証 / capability 最小化 / scope 強制 |
| network_attacker | TLS skip / redirect 追跡で host change / unsafe scheme | rustls + system roots / scheme allowlist / redirect chain validation |
| malicious_update_source | updater payload signature 検証 skip / public key 偽装 | signature 必須 / public key hard-coded + rotation 計画 |
| malicious_plugin | ExtendScript で任意 file 書き込み / COM 経由で外部アプリ起動 | sandbox / script 文字列 escape / 起動先 binary trusted path |

---

## preconditions (必ず明記する)

`preconditions` には攻撃が成立する **観測可能な前提条件** を 1 行ずつ列挙する。

例:

```yaml
preconditions:
  - "attacker can deliver a malicious .idml file to the user"
  - "user opens the file from File menu"
  - "app does not validate inner path entries before extraction"
```

```yaml
preconditions:
  - "frontend is compromised (XSS in WebView)"
  - "Tauri command write_file is registered"
  - "command does not check that path is within workspace scope"
```

不明確な前提 (「いつかそうなるかも」「設定次第」) は **High / Critical の根拠にならない**。

---

## required_user_action (ユーザー操作が必要な攻撃か)

ユーザーが何らかの操作をしないと成立しない攻撃か、放置でも成立する攻撃か。

| required_user_action 例 | 説明 |
|------------------------|------|
| (空配列) | ユーザー操作不要。アイドル状態で発火する重大障害候補 (Critical 寄り) |
| `["user opens file"]` | ファイルを開く操作が必要 |
| `["user imports project"]` | プロジェクト import が必要 |
| `["user installs update"]` | updater 適用操作が必要 |
| `["user clicks export button"]` | export 操作が必要 |
| `["user grants permission via OS dialog"]` | OS 権限ダイアログでの許可が必要 |

**ユーザー操作が必要な攻撃** は exploitability の判定で `theoretical` / `reachable` 寄りになる。
**ユーザー操作不要 (silent) な攻撃** は `practical` 寄りで Critical 候補になりやすい。

---

## asset_at_risk (失われるもの)

`asset_at_risk` には攻撃が成立した場合に失われる資産を列挙する。

| asset_at_risk | 説明 |
|--------------|------|
| `user_file` | ユーザーの文書 / 任意ファイル / generated artifact (PDF / JSX 等) |
| `production_path` | 絶対 path / ユーザー名を含む path / 内部 directory 構造 |
| `token` | 認証 token / API key / OAuth refresh token / session |
| `document_content` | 文書本文 / 個人情報 / 顧客情報 / 知財 |
| `generated_artifact` | アプリが生成する PDF / JSX / JSON / 帳票 |

複数該当する場合は配列で列挙。

---

## threat_model 必須化のチェックリスト

scan / patrol で finding を起票する前、apply / post-check の判定前に以下を確認する:

- [ ] actor を 7 種から 1 つ以上選んだ
- [ ] preconditions に「観測可能な前提」を 1 つ以上書いた (推測 / 一般論ではない)
- [ ] required_user_action を明記した (空配列でもよい)
- [ ] asset_at_risk を 1 つ以上選んだ
- [ ] preconditions が source-sink-analysis.md の `attack_path.steps` と整合している

これらがすべて埋まらない finding は **High / Critical にしない** (Medium 以下扱いで起票しない)。

---

## 判定例

### 例 1: 任意ファイル書き込み (compromised_frontend → file_write)

```yaml
threat_model:
  actor: compromised_frontend
  preconditions:
    - "WebView 内 frontend が攻撃者制御下にある (XSS / 脆弱な依存)"
    - "Tauri command write_user_data(path, content) が registered で capability に含まれる"
    - "write_user_data は path canonicalize を行わずに std::fs::write を呼ぶ"
  required_user_action: []
  asset_at_risk:
    - user_file
    - production_path
```

→ exploitability: practical / impact: integrity high / Critical 候補

### 例 2: zip-slip (malicious_document → file_write)

```yaml
threat_model:
  actor: malicious_document
  preconditions:
    - "ユーザーが external 由来の .idml ファイルを import する"
    - "extract_idml() は entry name の `..` / 絶対 path を reject せずに std::fs::create_dir_all + std::fs::write する"
  required_user_action:
    - "user opens the .idml file from import dialog"
  asset_at_risk:
    - user_file
    - generated_artifact
```

→ exploitability: reachable / impact: integrity high / High 候補 (user action 必要のため Critical までは行かない)

### 例 3: log に絶対 path 漏洩 (local_user → disclose)

```yaml
threat_model:
  actor: local_user
  preconditions:
    - "log::error! で std::path::Path::display() の戻り値をそのまま出力"
    - "ログファイルが他ユーザーから読める permission"
  required_user_action: []
  asset_at_risk:
    - production_path
    - document_content
```

→ exploitability: theoretical / impact: confidentiality medium / High 候補 (production_path 漏洩のみだが、文書名から個人情報が漏れる場合は Critical 寄り)

### 例 4: capability 過剰許可 (compromised_frontend → multiple sinks)

```yaml
threat_model:
  actor: compromised_frontend
  preconditions:
    - "tauri-plugin-fs の scope に `**` が含まれる"
    - "frontend からは workspace 配下のみ操作する設計だが、scope はそれを反映していない"
  required_user_action: []
  asset_at_risk:
    - user_file
    - production_path
```

→ exploitability: reachable / impact: integrity high / High (frontend が compromise した時の被害を広げる)

### 例 5: updater signature skip (malicious_update_source → execute)

```yaml
threat_model:
  actor: malicious_update_source
  preconditions:
    - "updater が signature 検証を行わない (または invalid sig を warning で通す)"
    - "updater public key が hard-coded で rotation 計画なし"
  required_user_action:
    - "user accepts update prompt"
  asset_at_risk:
    - generated_artifact
    - user_file
    - token
```

→ exploitability: practical (compromise 時) / impact: all high / Critical
