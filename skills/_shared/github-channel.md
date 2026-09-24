# GitHub I/O Channel — call-spec protocol

## 1. 正本宣言

本ファイルは call-spec protocol (司令官が call-spec を受けたときの義務) の正本。

- channel 解決・gh↔MCP mapping・どのコマンドが mcp 対応済みかの正本は Rust
  (`op-tools/crates/op/src/fetch/channel.rs` および各 semantic 層)。本ファイルに対応表は置かない。
- 設計根拠: [ADR-0024](../../op-tools/docs/adr/0024-github-io-channel-abstraction.md)。矛盾したら ADR-0024 が正。
- 役割分担: op が request を作り検証する / 司令官は指定 MCP tool を verbatim 実行するだけ。

## 2. channel の概念と解決

`OP_GITHUB_CHANNEL` で op の GitHub I/O transport を切り替える (gh auth の probe はしない)。

| 値 | 挙動 |
|---|---|
| `gh` (または未設定) | gh subprocess を実行する (default) |
| `mcp` | write 系 pilot コマンドは call-spec を emit する。それ以外の gh 到達は fail-closed |
| `auto` | 予約のみ (未実装) |

- Cloud: 環境の環境変数 (.env 形式) に `OP_GITHUB_CHANNEL=mcp` を置く。
- ローカル: 設定不要 (gh channel)。

## 3. call-spec の検出

mcp channel では op は gh を叩く代わりに stdout へ JSON を出力し exit 0 で終える。判別子は `op_call_spec`。

```json
{
  "op_call_spec": 1,
  "channel": "mcp",
  "tool": "mcp__github__issue_write",
  "args": {
    "method": "create",
    "owner": "<git remote origin から op が解決>",
    "repo": "<同上>",
    "title": "...",
    "body": "... (marker / fingerprint 埋め込み済み本文)",
    "labels": ["..."]
  },
  "expect": { "kind": "issue", "title": "..." },
  "ingest": "op issue ingest-result --call-spec <this.json> --result <mcp-result.json>"
}
```

stdout に `"op_call_spec": 1` があれば §4 の protocol に入る。無ければ通常出力として扱う。

## 4. 司令官 (main Claude / controller) の義務

実行者は call-spec を受け取った op 実行主体の LLM context。OP-managed worker (例: op-report の scout、
ClusterOrchestrator) が op を実行した場合は、その worker 自身が隔離 context 内で本節を完遂する。

1. **verbatim 実行**: `tool` の MCP tool を `args` を一切改変せず実行する。補完・別 tool への差し替え・
   payload の書き換え・値の付け足しは禁止 (本文・marker・fingerprint・labels の検証は op 側で完結済み)。
2. **read-back で結果を組む**: `mcp__github__issue_write` の返却は `{id, url}` のみで ingest の必須 field
   (number / title) を満たさない。返却 `url` 末尾の番号に対し `mcp__github__issue_read` (method: get) を
   実行し、その読み戻し JSON をファイルに保存する。これを ingest の result とする。
3. **ingest を実行する**: `ingest` フィールドのコマンドを read-back 結果ファイルとともに実行する
   (write の echo を渡すと `missing required field 'number'` で block される)。
4. **ingest の出力を後続処理の正とする**: ingest の envelope は gh channel の
   `op issue create --ensure-labels` の成功出力と同一 shape。call-spec の emit や MCP tool 呼び出しの成功を
   「起票成功」として扱わない。ingest 完走までは未確定。
5. **VerifyFailed の扱い**: ingest が `VerifyFailed` 系エラーを返したら、含まれる URL (orphan 資源) を
   人間に報告する。自動リトライで再実行しない (二重起票になる)。人間の判断を仰ぐか
   `needs_human_decision` として次工程へ渡す。

## 5. 未対応コマンドの挙動

mcp channel で未対応の op コマンドは構造化エラーで fail-closed する (`FetchError::McpChannelUnsupported` 等)。
これは「ローカル実行が必要」の意味。gh を直接叩く・MCP tool で見様見真似の代替実行をする等の
代替経路を自分で組み立ててはならない。

## 6. MCP read 層の hidden marker sanitize (制約)

MCP の read 系 tool (`mcp__github__issue_read` / `list_issues` / `pull_request_read` 等) は body 中の
HTML コメント (hidden marker) を sanitize して返す。GitHub 本体には verbatim 保存されている。

- write は無傷: call-spec 経由の起票で marker は verbatim 保存され、fingerprint / dedup 基盤は成立する。
- **禁止**: marker 依存の照合 (dedup 突き合わせ / marker 検証等) を `issue_read` / `list_issues` の返却 body に
  対して行わない。marker 依存の read は gh channel で行うか、raw body を `--input-json` 等で op に渡す。

### search_issues は sanitize しない

`mcp__github__search_issues` は body を raw で返し、検索 index は HTML コメント内の文字列にもヒットする。

marker 依存素材の Cloud 正規経路: `mcp__github__search_issues` (例: query
`repo:<owner>/<repo> is:issue is:open label:auto-report`、perPage 100) の生レスポンスをファイル保存し、
op の判定 primitive に `--input-json` で渡す (例: `op scan dedup --input-json`)。加工不要 (op が `items[]` shape を受理)。
query には必ず `repo:<owner>/<repo>` を含める (op は素材の repo 帰属を再検証しないため、他 repo 混入で false block になる)。
search 側も sanitize されるようになった場合、op は `DEDUP_INPUT_NO_MARKERS` warning を出す。

### PR (pull_request) の read 層 — sanitize と正準素材

- `pull_request_read` (get) / `issue_read` (get、PR 番号でも動作) は PR body の marker を sanitize する。
- `mcp__github__search_pull_requests` は body を raw で返し、item に labels が同梱される。
  **PR labels / marker 依存の PR 素材 (review state 文書の pull 等) は `search_pull_requests` の item を正準とする**。
  `issue_read` (get_labels) は PR 番号を解決できない。
- `issue_write` (update、`issue_number` に PR 番号) で PR の labels 完全置換ができる。
