<!--
schema_version: 2
last_breaking_change: 2026-07-22
notes: v2 追記 (2026-07-22, ADR-0024 Phase 3): §4 に実行者の定義を明確化 (call-spec を受けた
       OP-managed worker 自身も実行者になりうる)、§6 に search_issues の実測 (raw body / 検索
       index) と --input-json 素材経路を追記。非破壊 additive のため schema_version 据え置き。
       v2: §4 を read-back protocol に改訂。`mcp__github__issue_write` の返却は {id, url} の
       最小 shape で ingest の必須 field (number / title) を満たさないことが Cloud 実機 E2E ×2
       (2026-07-22, Issue #9 / #10) で確定したため、司令官は write 後に issue_read で読み戻した
       JSON を ingest に渡す。MCP read 層の hidden marker sanitize 制約も追記。
       v1: 初版 (ADR-0024)。Cloud (Claude Code on the web) で op CLI の GitHub I/O を成立させる
       channel abstraction (gh subprocess ⟷ MCP call-spec) のうち、司令官 (main Claude) が
       守る call-spec protocol のみを定義する。gh↔MCP の対応表・Cloud 対応コマンド一覧表は
       意図的に持たない (正本は Rust 側、Single Canonical Source Rule)。
-->

# GitHub I/O Channel — call-spec protocol

/**
 * 機能概要: op CLI の GitHub 書き込みが `OP_GITHUB_CHANNEL=mcp` の下で emit する
 *           call-spec (実行指示書) を、司令官 (main Claude / OP skill controller) が
 *           どう扱うかの protocol を定義する。
 * 作成意図: 組織 GitHub App 無しの Cloud 環境では op の gh subprocess 経路が通らない
 *           (ADR-0024)。かといって司令官が payload 組み立てを肩代わりすると
 *           marker / fingerprint / dedup 検証が op の外に出て CLI 化の意味が後退する。
 *           「op が request を作り検証する / 司令官は指定 MCP tool を verbatim 実行する
 *           だけの dumb executor」という役割分担をここで固定する。
 * 注意点: 本ファイルは protocol のみを定義する。gh コマンドと MCP tool の対応表、
 *         「どの op コマンドが mcp channel に対応しているか」の一覧は **意図的に書かない**。
 *         対応可否の正本は op binary 自身が返すエラー (`FetchError::McpChannelUnsupported` 等)
 *         であり、mapping の実装正本は `op-tools/crates/op/src/fetch/channel.rs` ほか
 *         semantic 層コード。ここに表を作ると Rust 側と二重管理になり必ず drift する。
 */

## 1. 正本宣言

本ファイルは **call-spec protocol (司令官の実行手順) の正本**。

- channel 解決ロジック・gh↔MCP mapping・「どのコマンドが mcp 対応済みか」の正本は **Rust**
  (`op-tools/crates/op/src/fetch/channel.rs` および各 semantic 層)。
- 本ファイルが定義するのは、司令官が call-spec を見つけたときに **何をする義務があるか** のみ。
- 詳細な設計判断・根拠は [ADR-0024](../../op-tools/docs/adr/0024-github-io-channel-abstraction.md) を参照。矛盾したら ADR-0024 を正とし、本ファイルの記述ミスとして扱う。

## 2. channel の概念と解決

`OP_GITHUB_CHANNEL` 環境変数で op の GitHub I/O transport を切り替える。

| 値 | 挙動 |
|---|---|
| `gh` (または未設定) | 従来通り gh subprocess を実行する。**default であり挙動無変更** |
| `mcp` | write 系 pilot コマンドは call-spec を emit する。それ以外の gh 到達は fail-closed |
| `auto` | **予約のみ**。MVP では実装しない |

- **Cloud 環境**: 環境設定の環境変数 (.env 形式、全ユーザー可視) に `OP_GITHUB_CHANNEL=mcp` を
  1 行置く。シークレットではないので可視でよい。
- **ローカル**: 設定不要。何もしなければ従来通り gh channel で動く。
- channel 解決は `OP_GITHUB_CHANNEL` のみを見る決定論関数であり、gh auth の probe はしない。

## 3. call-spec の検出

mcp channel で op が gh の代わりに request を実行できないとき、op は gh を叩く代わりに
stdout へ JSON を出力し exit 0 で終える。`op_call_spec` フィールドが判別子。

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

司令官は op の stdout に `"op_call_spec": 1` を見つけたら、以下の call-spec protocol に入る。
call-spec が無ければ (=通常の gh channel 出力であれば) 従来通り扱う。

## 4. 司令官 (main Claude / controller) の義務

本節の義務を負う「司令官」とは、call-spec を受け取った **op 実行主体の LLM context** を指す。
main Claude (controller) だけでなく、OP-managed worker (例: op-report の scout) が op を実行して
call-spec を受けた場合は、その worker 自身が実行者となり隔離 context 内で本節の手順を完遂してよい。

call-spec を検出したら、司令官は次の手順を **順守** する。

1. **verbatim 実行**: `tool` に指定された MCP tool を、`args` を **一切改変せず** 実行する。
   補完・別 tool への差し替え・payload の書き換え・値の付け足しは禁止。
   本文組み立て・hidden marker・fingerprint・labels の事前検証はすべて op 側で完結済みであり、
   司令官が「良かれと思って」手を加えると dedup / marker 整合が壊れる。
2. **read-back で結果を組む**: `mcp__github__issue_write` の返却は `{id, url}` の最小 shape であり、
   ingest の必須 field (number / title) を満たさない (2026-07-22 Cloud 実機 E2E ×2 で確定)。
   返却 `url` 末尾の Issue 番号に対して `mcp__github__issue_read` (method: get) を実行し、
   **その読み戻し JSON をファイルに保存する** — これが ingest に渡す result である。
   write の echo ではなく server の実状態を照合する post-create verification になるため、
   検証強度もこちらの方が高い (ADR-0005 の二度 fetch 黄金則と同思想)。
3. **ingest を実行する**: `ingest` フィールドに書かれたコマンド (例: `op issue ingest-result`) を
   保存した read-back 結果ファイルとともに実行する。write の echo をそのまま渡すと
   `missing required field 'number'` で block される (仕様通りの fail-closed)。
4. **ingest の出力を後続処理の正とする**: ingest が出力する envelope は gh channel の
   `op issue create --ensure-labels` の成功出力と **同一 shape** の JSON envelope になる
   (plain 経路の「URL のみ stdout」ではない)。後続の SKILL.md fence / URL 抽出はこの envelope を使う。
   **call-spec の emit 自体や MCP tool 呼び出しの成功を「起票成功」として扱ってはならない**。
   ingest が完走するまでは起票は未確定である。
5. **VerifyFailed の扱い**: ingest が `VerifyFailed` 系の構造化エラーを返したら、エラーに含まれる
   URL (= 検証に失敗した orphan 資源) を人間に報告する。**自動リトライで再実行し二重起票してはならない**
   (`gh issue create` 並列化事故と同じ性質の危険 — CLAUDE.md の bash fence convention 事故事例を参照)。
   人間の判断を仰ぐか、`needs_human_decision` として構造化して次工程へ渡す。

## 5. 未対応コマンドの挙動

mcp channel で未対応の op コマンドは、call-spec ではなく **構造化エラーで fail-closed** する
(`FetchError::McpChannelUnsupported` 等)。

司令官はこれを「このコマンドは今のローカル実行が必要」という意味に解釈する。
**エラーを見て gh を直接叩く・MCP tool で見様見真似の代替実行をする、といった代替経路を
自分で組み立ててはならない**。payload 組み立て・marker・fingerprint の検証を op の外へ
出さないという ADR-0024 の判断根拠がここで崩れるため、代替実行は禁止行動として扱う。
対応の要否・拡張タイミングは op-tools 側の段階導入判断 (ADR-0024 参照) に委ねる。

## 6. MCP read 層の hidden marker sanitize (制約)

MCP の read 系 tool (`mcp__github__issue_read` / `mcp__github__list_issues` 等) は、Issue body 中の
HTML コメント (`<!-- op-fingerprint: ... -->` 等の hidden marker) を **sanitize して返す**
(2026-07-22 実測: GitHub 本体には verbatim 保存されていることを `gh api` の生 body で確認済み —
消えるのは MCP read 経路の表示のみ)。

- **write は無傷**: call-spec 経由の起票で marker は GitHub に verbatim 保存される。
  fingerprint / dedup の marker 基盤は mcp channel でも成立する。
- **禁止**: marker の存在・内容に依存する照合 (dedup 突き合わせ / marker 検証等) を
  `issue_read` / `list_issues` の返却 body に対して行ってはならない — 常に「marker なし」に
  見えるため誤判定する。marker 依存の read は gh channel (ローカル) で行うか、gh 経由で
  取得した生 body を `--input-json` 等で op に渡すこと。

### search_issues は sanitize しない (2026-07-22 実測)

**`mcp__github__search_issues` は body を raw のまま返す**。GitHub 検索 index は HTML コメント
内の文字列にもヒットする (Issue #17/#6 で確認: 可視本文に無い "op-fingerprint" 文字列や
fingerprint 完全一致フレーズでもヒットした)。

marker 依存素材の Cloud 正規経路は、`mcp__github__search_issues` (例: query
`repo:<owner>/<repo> is:issue is:open label:auto-report`、perPage 100) で素材を取得し、
生レスポンスをファイル保存して op の判定 primitive に `--input-json` で渡すこと
(第一号: `op scan dedup --input-json`)。加工は不要 — op が `items[]` shape を直接受理する。
query には必ず `repo:<owner>/<repo>` 修飾を含めること — 省略すると他 repo の Issue が
素材に混入し、fingerprint 誤一致による起票抑止 (false block) が起こりうる
(op は素材 entry の repo 帰属を再検証しない)。

この経路は MCP server 実装の観測挙動に依存する。将来 search 側も sanitize されるように
なった場合、op 側は `DEDUP_INPUT_NO_MARKERS` warning で可視化する (silent degrade しない)。

## 7. 関連

- [ADR-0024](../../op-tools/docs/adr/0024-github-io-channel-abstraction.md) — 本 protocol の設計根拠・段階導入・test 戦略の正本。
- `skills/_shared/runtime-contract.md` — expert spawn 境界の正本。本ファイルの channel/call-spec 層とは独立 (spawn 可否とは無関係に、司令官が GitHub I/O をどう実行するかのみを扱う)。
