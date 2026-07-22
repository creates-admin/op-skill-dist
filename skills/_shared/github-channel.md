<!--
schema_version: 1
last_breaking_change: 2026-07-22
notes: 初版 (ADR-0024)。Cloud (Claude Code on the web) で op CLI の GitHub I/O を成立させる
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

call-spec を検出したら、司令官は次の手順を **順守** する。

1. **verbatim 実行**: `tool` に指定された MCP tool を、`args` を **一切改変せず** 実行する。
   補完・別 tool への差し替え・payload の書き換え・値の付け足しは禁止。
   本文組み立て・hidden marker・fingerprint・labels の事前検証はすべて op 側で完結済みであり、
   司令官が「良かれと思って」手を加えると dedup / marker 整合が壊れる。
2. **結果を保存する**: MCP tool の実行結果 JSON をファイルに保存する。
3. **ingest を実行する**: `ingest` フィールドに書かれたコマンド (例: `op issue ingest-result`) を
   保存した結果ファイルとともに実行する。
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

## 6. 関連

- [ADR-0024](../../op-tools/docs/adr/0024-github-io-channel-abstraction.md) — 本 protocol の設計根拠・段階導入・test 戦略の正本。
- `skills/_shared/runtime-contract.md` — expert spawn 境界の正本。本ファイルの channel/call-spec 層とは独立 (spawn 可否とは無関係に、司令官が GitHub I/O をどう実行するかのみを扱う)。
